const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const root = process.cwd();
const argv = process.argv.slice(2);
const argValue = (name) => {
  const prefix = `--${name}=`;
  const hit = argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
};
const hasFlag = (name) => argv.includes(`--${name}`);

const headed = hasFlag('headed');
const holdMs = Number(argValue('hold-ms') || 0);
const explicitBaseUrl = argValue('base-url') || process.env.QA_BASE_URL || null;
const overrideCssArg = argValue('override-css') || 'qa/viewport-audit/candidates/hero-wide-desktop-v3-1.css';
const outputDirArg = argValue('output-dir') || 'qa-results/hero-webkit-webgl-diagnostic';

const outDir = path.resolve(root, outputDirArg);
const shotDir = path.join(outDir, 'screenshots');
const exportDir = path.join(outDir, 'canvas_exports');
const jsonOut = path.join(outDir, 'webkit-webgl-diagnostic.json');
const mdOut = path.join(outDir, 'webkit-webgl-diagnostic.md');
const overrideCssPath = overrideCssArg ? path.resolve(root, overrideCssArg) : null;
const overrideCss = overrideCssPath && fs.existsSync(overrideCssPath)
  ? fs.readFileSync(overrideCssPath, 'utf8')
  : null;

const viewports = [
  { id: 'small-control', width: 1024, height: 768, applyCandidate: false },
  { id: 'desktop-anchor', width: 1920, height: 1080, applyCandidate: false },
  { id: 'wide-boundary', width: 1921, height: 1080, applyCandidate: true },
  { id: 'ultrawide', width: 3440, height: 1440, applyCandidate: true },
];

const modes = [
  { id: 'native-buffer', forcePreserveDrawingBuffer: false },
  { id: 'preserve-buffer', forcePreserveDrawingBuffer: true },
];

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });
const cleanDir = (dir) => {
  fs.rmSync(dir, { recursive: true, force: true });
  ensureDir(dir);
};

const findFreePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.unref();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    const port = address.port;
    server.close(() => resolve(port));
  });
});

const waitForHttp = (url, timeoutMs = 15000) => new Promise((resolve, reject) => {
  const started = Date.now();
  const attempt = () => {
    if (Date.now() - started > timeoutMs) return reject(new Error(`Timed out waiting for ${url}`));
    const req = http.get(url, (res) => {
      res.resume();
      if (res.statusCode && res.statusCode < 500) return resolve();
      setTimeout(attempt, 200);
    });
    req.setTimeout(1200, () => req.destroy());
    req.on('error', () => setTimeout(attempt, 200));
  };
  attempt();
});

const startVite = async () => {
  if (explicitBaseUrl) return { baseUrl: explicitBaseUrl.replace(/\/$/, ''), child: null };
  const port = await findFreePort();
  const viteEntry = require.resolve('vite');
  const viteBin = path.resolve(path.dirname(viteEntry), 'bin', 'vite.js');
  const child = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  let log = '';
  child.stdout.on('data', (chunk) => { log += chunk.toString(); });
  child.stderr.on('data', (chunk) => { log += chunk.toString(); });
  child.on('exit', (code) => {
    if (code && code !== 0) console.error(`Vite exited with code ${code}.\n${log}`);
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHttp(baseUrl);
  return { baseUrl, child };
};

const initProbe = ({ forcePreserveDrawingBuffer }) => ({ forcePreserveDrawingBuffer }) => {
  window.__heroWebglProbe = {
    requestedContexts: [],
    contextLostEvents: 0,
  };

  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, attributes) {
    const isWebGL = type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl';
    let requested = attributes;
    if (isWebGL && forcePreserveDrawingBuffer) {
      requested = { ...(attributes || {}), preserveDrawingBuffer: true };
    }
    const ctx = original.call(this, type, requested);
    if (isWebGL) {
      window.__heroWebglProbe.requestedContexts.push({
        type,
        requestedAttributes: requested ? { ...requested } : null,
        returned: Boolean(ctx),
      });
      if (ctx && !window.__heroWebglProbe.context) {
        window.__heroWebglProbe.context = ctx;
        window.__heroWebglProbe.canvas = this;
        this.addEventListener('webglcontextlost', () => {
          window.__heroWebglProbe.contextLostEvents += 1;
        });
      }
    }
    return ctx;
  };
};

const collectProbe = async (page) => page.evaluate(() => {
  const canvas = document.querySelector('.bg canvas');
  const probe = window.__heroWebglProbe || {};
  const gl = probe.context || (canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  if (!canvas || !gl) {
    return {
      canvasFound: Boolean(canvas),
      contextFound: Boolean(gl),
      requestedContexts: probe.requestedContexts || [],
      contextLostEvents: probe.contextLostEvents || 0,
    };
  }

  const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
  const attrs = gl.getContextAttributes?.() || null;
  const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
  const rect = canvas.getBoundingClientRect();
  const style = getComputedStyle(canvas);

  // Sample the default framebuffer on a grid. With preserveDrawingBuffer=true,
  // visible scene pixels should remain readable after presentation.
  const sample = { total: 0, nonZeroAlpha: 0, blueLike: 0, glError: null };
  try {
    gl.finish();
    const px = new Uint8Array(4);
    const cols = 25;
    const rows = 17;
    for (let gy = 1; gy < rows; gy += 1) {
      for (let gx = 1; gx < cols; gx += 1) {
        const x = Math.min(gl.drawingBufferWidth - 1, Math.max(0, Math.floor((gx / cols) * gl.drawingBufferWidth)));
        const y = Math.min(gl.drawingBufferHeight - 1, Math.max(0, Math.floor((gy / rows) * gl.drawingBufferHeight)));
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        sample.total += 1;
        if (px[3] > 0) sample.nonZeroAlpha += 1;
        if (px[2] > 140 && px[1] > 70 && px[2] > px[0] + 35) sample.blueLike += 1;
      }
    }
    sample.glError = gl.getError();
  } catch (error) {
    sample.readError = String(error?.stack || error);
  }

  let dataUrl = null;
  try {
    dataUrl = canvas.toDataURL('image/png');
  } catch (error) {
    dataUrl = null;
  }

  return {
    canvasFound: true,
    contextFound: true,
    requestedContexts: probe.requestedContexts || [],
    contextLostEvents: probe.contextLostEvents || 0,
    contextLost: gl.isContextLost?.() || false,
    contextAttributes: attrs,
    drawingBuffer: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight },
    canvasBackingStore: { width: canvas.width, height: canvas.height },
    cssRect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    css: {
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      transform: style.transform,
      position: style.position,
      zIndex: style.zIndex,
    },
    webgl: {
      version: gl.getParameter(gl.VERSION),
      shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      vendor: gl.getParameter(gl.VENDOR),
      renderer: gl.getParameter(gl.RENDERER),
      unmaskedVendor: debugExt ? gl.getParameter(debugExt.UNMASKED_VENDOR_WEBGL) : null,
      unmaskedRenderer: debugExt ? gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL) : null,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      maxViewportDims: maxViewport ? Array.from(maxViewport) : null,
    },
    framebufferSample: sample,
    dataUrl,
  };
});

const saveDataUrl = (dataUrl, filePath) => {
  if (!dataUrl || !dataUrl.startsWith('data:image/png;base64,')) return null;
  const b64 = dataUrl.slice('data:image/png;base64,'.length);
  const buffer = Buffer.from(b64, 'base64');
  fs.writeFileSync(filePath, buffer);
  return {
    path: path.relative(root, filePath),
    bytes: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
};

const markdown = (report) => {
  const lines = [];
  lines.push('# WebKit WebGL Diagnostic');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Playwright: ${report.playwrightVersion}`);
  lines.push(`Headed: ${report.headed}`);
  lines.push('');
  lines.push('| Viewport | Mode | Screenshot sphere pixels | preserveDrawingBuffer | Context lost | GL blue samples | PNG export bytes |');
  lines.push('|---|---|---:|---|---|---:|---:|');
  for (const r of report.results) {
    lines.push(`| ${r.width}x${r.height} | ${r.mode} | ${r.screenshotBlueLikePixels ?? 'n/a'} | ${r.probe?.contextAttributes?.preserveDrawingBuffer ?? 'n/a'} | ${r.probe?.contextLost ?? 'n/a'} | ${r.probe?.framebufferSample?.blueLike ?? 'n/a'} | ${r.canvasExport?.bytes ?? 'n/a'} |`);
  }
  lines.push('');
  lines.push('## Interpretation');
  lines.push('');
  lines.push('- If `preserve-buffer` has blue framebuffer samples / a non-blank canvas export while the page screenshot still omits the sphere, the renderer is drawing and the failure is in WebKit/Playwright screenshot compositing.');
  lines.push('- If `preserve-buffer` also has zero blue framebuffer samples, inspect WebGL context loss, renderer/capability data, and console/page errors: that points toward a WebKit rendering-path problem rather than CSS geometry.');
  lines.push('- If only candidate-enabled viewports fail while the 1024 and 1920 controls render, compare candidate versus production scene/container geometry before changing production CSS.');
  return `${lines.join('\n')}\n`;
};

const countBluePixels = async (pngPath) => {
  // Keep the runner dependency-free. The PNG is retained for visual inspection;
  // pixel counting is intentionally left null unless an external image parser is added.
  return null;
};

(async () => {
  cleanDir(outDir);
  ensureDir(shotDir);
  ensureDir(exportDir);

  let serverChild = null;
  let browser = null;
  try {
    const playwright = require('playwright');
    const server = await startVite();
    serverChild = server.child;
    browser = await playwright.webkit.launch({ headless: !headed });

    console.log(`WebKit WebGL diagnostic: ${viewports.length} viewports × ${modes.length} buffer modes = ${viewports.length * modes.length} runs`);
    console.log(`Base URL: ${server.baseUrl}`);
    console.log(`Headed: ${headed}`);
    console.log(`Override CSS: ${overrideCssPath && fs.existsSync(overrideCssPath) ? path.relative(root, overrideCssPath) : 'none'}`);

    const results = [];
    for (const viewport of viewports) {
      for (const mode of modes) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 1,
        });
        await context.addInitScript(initProbe(mode), mode);
        const page = await context.newPage();
        const consoleMessages = [];
        const pageErrors = [];
        page.on('console', (msg) => {
          if (['error', 'warning'].includes(msg.type())) consoleMessages.push({ type: msg.type(), text: msg.text() });
        });
        page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));

        const url = `${server.baseUrl}/?qa=1&qaOverlay=0&qaSpeech=longest`;
        try {
          await page.goto(url, { waitUntil: 'networkidle' });
          if (viewport.applyCandidate && overrideCss) await page.addStyleTag({ content: overrideCss });
          await page.waitForSelector('.bg canvas', { state: 'attached' });
          await page.waitForFunction(() => {
            const canvas = document.querySelector('.bg canvas');
            return Boolean(canvas && canvas.width > 0 && canvas.height > 0);
          });
          await page.waitForTimeout(3200);
          await page.evaluate(async () => {
            window.scrollTo(0, 0);
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          });
          await page.waitForTimeout(250);

          const stem = `${viewport.width}x${viewport.height}__${mode.id}`;
          const screenshotPath = path.join(shotDir, `${stem}.png`);
          await page.screenshot({ path: screenshotPath, fullPage: false });

          const probe = await collectProbe(page);
          const dataUrl = probe.dataUrl;
          delete probe.dataUrl;
          const exportPath = path.join(exportDir, `${stem}.png`);
          const canvasExport = saveDataUrl(dataUrl, exportPath);

          results.push({
            viewportId: viewport.id,
            width: viewport.width,
            height: viewport.height,
            candidateApplied: viewport.applyCandidate && Boolean(overrideCss),
            mode: mode.id,
            forcePreserveDrawingBuffer: mode.forcePreserveDrawingBuffer,
            screenshotPath: path.relative(root, screenshotPath),
            screenshotBlueLikePixels: await countBluePixels(screenshotPath),
            canvasExport,
            probe,
            consoleMessages,
            pageErrors,
          });
          console.log(`  ${stem}: context=${probe.contextFound} preserve=${probe.contextAttributes?.preserveDrawingBuffer ?? 'n/a'} lost=${probe.contextLost ?? 'n/a'} blueSamples=${probe.framebufferSample?.blueLike ?? 'n/a'}`);

          if (headed && holdMs > 0 && viewport.id === 'ultrawide' && mode.id === 'native-buffer') {
            console.log(`  Headed inspection hold at ${viewport.width}x${viewport.height} native-buffer (${holdMs} ms)`);
            await page.waitForTimeout(holdMs);
          }
        } finally {
          await context.close();
        }
      }
    }

    const report = {
      artifactType: 'hero-webkit-webgl-diagnostic',
      generatedAt: new Date().toISOString(),
      playwrightVersion: require('playwright/package.json').version,
      headed,
      overrideCss: overrideCssPath && fs.existsSync(overrideCssPath) ? path.relative(root, overrideCssPath) : null,
      results,
    };
    fs.writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(mdOut, markdown(report));
    console.log(`JSON: ${path.relative(root, jsonOut)}`);
    console.log(`Markdown: ${path.relative(root, mdOut)}`);
    console.log(`Screenshots: ${path.relative(root, shotDir)}`);
    console.log(`Canvas exports: ${path.relative(root, exportDir)}`);
  } catch (error) {
    console.error(error?.stack || error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (serverChild) serverChild.kill('SIGTERM');
  }
})();
