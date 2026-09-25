const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');

const root = process.cwd();
const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);
const argValue = (name) => {
  const prefix = `--${name}=`;
  const hit = argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
};

const headed = hasFlag('headed');
const holdMs = Number(argValue('hold-ms') || 0);
const outDir = path.resolve(
  root,
  argValue('output-dir') || 'qa-results/hero-webkit-candidate-load-order'
);
const screenshotDir = path.join(outDir, 'screenshots');
const exportDir = path.join(outDir, 'canvas_exports');
const failureDir = path.join(outDir, 'failures');
const tempRoot = path.join(outDir, '.static-candidate-root');
const candidatePath = path.resolve(
  root,
  'qa/viewport-audit/candidates/hero-wide-desktop-v3-1.css'
);

if (!fs.existsSync(candidatePath)) {
  throw new Error(`Missing candidate CSS: ${candidatePath}`);
}
const candidateCss = fs.readFileSync(candidatePath, 'utf8');

const viewports = [
  { id: 'boundary', width: 1921, height: 1080 },
  { id: 'ultrawide', width: 3440, height: 1440 },
];

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });
fs.rmSync(outDir, { recursive: true, force: true });
ensureDir(screenshotDir);
ensureDir(exportDir);
ensureDir(failureDir);

const findFreePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.unref();
  server.on('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    server.close(() => resolve(port));
  });
});

const waitForHttp = (url, child, logs, timeoutMs = 20000) => new Promise((resolve, reject) => {
  const started = Date.now();
  const attempt = () => {
    if (child.exitCode !== null) {
      reject(new Error(`Vite exited before becoming ready (code ${child.exitCode}).\n${logs()}`));
      return;
    }
    if (Date.now() - started > timeoutMs) {
      reject(new Error(`Timed out waiting for HTTP 2xx/3xx from ${url}.\n${logs()}`));
      return;
    }
    const req = http.get(url, (res) => {
      res.resume();
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
        resolve(res.statusCode);
      } else {
        setTimeout(attempt, 200);
      }
    });
    req.setTimeout(1500, () => req.destroy());
    req.on('error', () => setTimeout(attempt, 200));
  };
  attempt();
});

// IMPORTANT: run Vite with the target project root as cwd. This matches the
// already-proven QA runners for production and avoids the extra positional-root
// behavior that made the previous load-order diagnostic a different startup path.
const startVite = async (viteRoot, label) => {
  const port = await findFreePort();
  const viteEntry = require.resolve('vite');
  const viteBin = path.resolve(path.dirname(viteEntry), 'bin', 'vite.js');
  const child = spawn(
    process.execPath,
    [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: viteRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    }
  );

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const logs = () => `--- ${label} Vite stdout ---\n${stdout}\n--- ${label} Vite stderr ---\n${stderr}`;
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHttp(baseUrl, child, logs);
  return { baseUrl, child, logs };
};

const stopServer = async (server) => {
  if (!server?.child || server.child.exitCode !== null) return;
  server.child.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 1500);
    server.child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
};

const buildStaticCandidateRoot = () => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  ensureDir(tempRoot);

  for (const name of ['index.html', 'src', 'public']) {
    const source = path.join(root, name);
    const target = path.join(tempRoot, name);
    if (!fs.existsSync(source)) {
      throw new Error(`Missing source required for static candidate root: ${source}`);
    }
    fs.cpSync(source, target, { recursive: true });
  }

  let copiedViteConfig = false;
  for (const name of [
    'vite.config.js',
    'vite.config.mjs',
    'vite.config.cjs',
    'vite.config.ts',
  ]) {
    const source = path.join(root, name);
    if (fs.existsSync(source)) {
      fs.cpSync(source, path.join(tempRoot, name));
      copiedViteConfig = true;
      break;
    }
  }

  for (const name of ['jsconfig.json', 'tsconfig.json']) {
    const source = path.join(root, name);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(tempRoot, name));
  }

  // If a root Vite config is not present, provide the same React plugin the
  // portfolio expects. Because tempRoot lives below the real project root,
  // @vitejs/plugin-react resolves from the project's node_modules.
  if (!copiedViteConfig) {
    fs.writeFileSync(
      path.join(tempRoot, 'vite.config.mjs'),
      `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()] });\n`,
      'utf8'
    );
  }

  const heroCssPath = path.join(tempRoot, 'src', 'components', 'hero', 'hero.css');
  const baseCss = fs.readFileSync(heroCssPath, 'utf8');
  fs.writeFileSync(
    heroCssPath,
    `${baseCss}\n\n/* QA STATIC WIDE-DESKTOP CANDIDATE — present before app startup */\n${candidateCss}\n`,
    'utf8'
  );
};

// Use the exact minimal probe shape from the compositor diagnostic that already
// completed successfully in this project. Do not introduce extra layout reads
// during WebGL context creation in the control experiment.
const initPreserveProbe = () => {
  window.__heroWebglProbe = { requestedContexts: [], contextLostEvents: 0 };
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, attrs) {
    const isGL = ['webgl2', 'webgl', 'experimental-webgl'].includes(type);
    const requested = isGL ? { ...(attrs || {}), preserveDrawingBuffer: true } : attrs;
    const ctx = original.call(this, type, requested);
    if (isGL) {
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

const collectGeometry = async (page) => page.evaluate(() => {
  const section = document.querySelector('.container > section:first-child');
  const hero = document.querySelector('.hero');
  const bg = document.querySelector('.bg');
  const canvas = document.querySelector('.bg canvas');
  const gl = window.__heroWebglProbe?.context || null;

  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left:r.left, top:r.top, width:r.width, height:r.height, right:r.right, bottom:r.bottom };
  };
  const css = (el) => {
    if (!el) return null;
    const s = getComputedStyle(el);
    return { position:s.position, zIndex:s.zIndex, transform:s.transform, overflow:s.overflow, width:s.width, height:s.height };
  };

  return {
    section: { rect: rect(section), css: css(section) },
    hero: { rect: rect(hero), css: css(hero) },
    bg: { rect: rect(bg), css: css(bg) },
    canvas: canvas ? {
      rect: rect(canvas),
      css: css(canvas),
      backing: { width: canvas.width, height: canvas.height },
    } : null,
    contextRequests: window.__heroWebglProbe?.requestedContexts || [],
    contextLostEvents: window.__heroWebglProbe?.contextLostEvents || 0,
    gl: gl ? {
      contextLost: gl.isContextLost(),
      attrs: gl.getContextAttributes(),
      drawingBuffer: { width: gl.drawingBufferWidth, height: gl.drawingBufferHeight },
    } : null,
  };
});

const collectFramebuffer = async (page) => page.evaluate(() => {
  const canvas = document.querySelector('.bg canvas');
  const gl = window.__heroWebglProbe?.context || null;
  const sample = { total: 0, nonZeroAlpha: 0, blueLike: 0, glError: null };

  if (gl) {
    gl.finish();
    const px = new Uint8Array(4);
    const cols = 25;
    const rows = 17;
    for (let gy = 1; gy < rows; gy += 1) {
      for (let gx = 1; gx < cols; gx += 1) {
        const x = Math.min(gl.drawingBufferWidth - 1, Math.floor((gx / cols) * gl.drawingBufferWidth));
        const y = Math.min(gl.drawingBufferHeight - 1, Math.floor((gy / rows) * gl.drawingBufferHeight));
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        sample.total += 1;
        if (px[3] > 0) sample.nonZeroAlpha += 1;
        if (px[2] > 175 && px[1] > 110 && px[0] < 150 && px[2] > px[0] + 60) sample.blueLike += 1;
      }
    }
    sample.glError = gl.getError();
  }

  let dataUrl = null;
  try { dataUrl = canvas?.toDataURL('image/png') || null; } catch {}
  return { sample, dataUrl };
});

const countScreenshotBlue = async (page, buffer) => {
  const b64 = buffer.toString('base64');
  return page.evaluate(async (encoded) => {
    const img = new Image();
    img.src = `data:image/png;base64,${encoded}`;
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const x0 = Math.floor(c.width * 0.20);
    const x1 = Math.floor(c.width * 0.80);
    const y0 = Math.floor(c.height * 0.04);
    const y1 = Math.floor(c.height * 0.88);
    const data = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let blue = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r=data[i], g=data[i+1], b=data[i+2], a=data[i+3];
      if (a > 0 && b > 175 && g > 110 && r < 150 && b > r + 60) blue += 1;
    }
    return blue;
  }, b64);
};

const waitForHeroCanvas = async (page, meta) => {
  try {
    await page.waitForSelector('.bg canvas', { state: 'attached', timeout: 20000 });
    await page.waitForFunction(() => {
      const canvas = document.querySelector('.bg canvas');
      return Boolean(canvas && canvas.width > 0 && canvas.height > 0);
    }, null, { timeout: 10000 });
  } catch (error) {
    const stem = `${meta.vp.width}x${meta.vp.height}__${meta.variant}__NO_CANVAS`;
    const screenshotPath = path.join(failureDir, `${stem}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
    const state = await page.evaluate(() => ({
      href: location.href,
      title: document.title,
      readyState: document.readyState,
      rootPresent: Boolean(document.querySelector('#root')),
      rootHtml: document.querySelector('#root')?.innerHTML?.slice(0, 4000) || '',
      heroPresent: Boolean(document.querySelector('.hero')),
      bgPresent: Boolean(document.querySelector('.bg')),
      canvasCount: document.querySelectorAll('canvas').length,
      bodyText: document.body?.innerText?.slice(0, 3000) || '',
    })).catch(() => null);
    const diagnostic = {
      viewport: meta.vp,
      variant: meta.variant,
      navigationStatus: meta.navigationStatus,
      state,
      consoleMessages: meta.consoleMessages,
      pageErrors: meta.pageErrors,
      requestFailures: meta.requestFailures,
      serverLogs: meta.serverLogs,
      screenshotPath: path.relative(root, screenshotPath),
      originalError: String(error?.stack || error),
    };
    const jsonPath = path.join(failureDir, `${stem}.json`);
    fs.writeFileSync(jsonPath, `${JSON.stringify(diagnostic, null, 2)}\n`);
    throw new Error(
      `Hero canvas did not mount for ${meta.variant} at ${meta.vp.width}x${meta.vp.height}. ` +
      `Diagnostic written to ${path.relative(root, jsonPath)}\n` +
      `Navigation status: ${meta.navigationStatus ?? 'n/a'}\n` +
      `Page errors: ${meta.pageErrors.join(' | ') || 'none'}\n` +
      `Console errors/warnings: ${meta.consoleMessages.map((m) => `${m.type}: ${m.text}`).join(' | ') || 'none'}`
    );
  }
};

const runCase = async ({ browser, baseUrl, serverLogs, vp, variant, lateCss }) => {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
  await context.addInitScript(initPreserveProbe);
  const page = await context.newPage();
  const consoleMessages = [];
  const pageErrors = [];
  const requestFailures = [];
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) consoleMessages.push({ type: message.type(), text: message.text() });
  });
  page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));
  page.on('requestfailed', (request) => requestFailures.push({ url: request.url(), error: request.failure()?.errorText || 'unknown' }));

  try {
    const response = await page.goto(`${baseUrl}/?qa=1&qaOverlay=0&qaSpeech=longest`, { waitUntil: 'networkidle' });
    const navigationStatus = response?.status() ?? null;
    if (!response || !response.ok()) {
      throw new Error(`Navigation failed for ${variant}: HTTP ${navigationStatus ?? 'no response'} at ${baseUrl}`);
    }

    await waitForHeroCanvas(page, {
      vp,
      variant,
      navigationStatus,
      consoleMessages,
      pageErrors,
      requestFailures,
      serverLogs: serverLogs ? serverLogs() : null,
    });
    await page.waitForTimeout(2200);
    const beforeLateCss = await collectGeometry(page);

    if (lateCss) {
      await page.addStyleTag({ content: lateCss });
      await page.waitForTimeout(800);
    }

    await page.evaluate(async () => {
      window.scrollTo(0, 0);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.waitForTimeout(500);

    const afterCss = await collectGeometry(page);
    const framebuffer = await collectFramebuffer(page);
    const stem = `${vp.width}x${vp.height}__${variant}`;
    const screenshotPath = path.join(screenshotDir, `${stem}.png`);
    const screenshotBuffer = await page.screenshot({ path: screenshotPath, fullPage: false });
    const screenshotBlueLikePixels = await countScreenshotBlue(page, screenshotBuffer);

    let canvasExport = null;
    if (framebuffer.dataUrl?.startsWith('data:image/png;base64,')) {
      const data = Buffer.from(framebuffer.dataUrl.slice('data:image/png;base64,'.length), 'base64');
      const exportPath = path.join(exportDir, `${stem}.png`);
      fs.writeFileSync(exportPath, data);
      canvasExport = { path: path.relative(root, exportPath), bytes: data.length };
    }

    return {
      viewport: vp,
      variant,
      screenshotPath: path.relative(root, screenshotPath),
      screenshotBlueLikePixels,
      canvasExport,
      framebuffer: framebuffer.sample,
      beforeLateCss,
      afterCss,
      consoleMessages,
      pageErrors,
      requestFailures,
      navigationStatus,
    };
  } finally {
    if (headed && holdMs > 0 && vp.id === 'ultrawide') await page.waitForTimeout(holdMs).catch(() => {});
    await context.close();
  }
};

(async () => {
  let browser = null;
  let productionServer = null;
  let staticServer = null;
  try {
    const playwright = require('playwright');
    browser = await playwright.webkit.launch({ headless: !headed });
    const results = [];

    console.log(`WebKit candidate load-order diagnostic: ${viewports.length} viewports × 3 variants = ${viewports.length * 3} runs`);

    // Phase 1: production startup path only. Do not run a second Vite server yet.
    // This makes production-control a true control and avoids shared optimizer/watcher state.
    productionServer = await startVite(root, 'production');
    console.log(`Production URL: ${productionServer.baseUrl}`);
    for (const vp of viewports) {
      for (const item of [
        { variant: 'production-control', lateCss: null },
        { variant: 'candidate-late-after-webgl-init', lateCss: candidateCss },
      ]) {
        const row = await runCase({
          browser,
          baseUrl: productionServer.baseUrl,
          serverLogs: productionServer.logs,
          vp,
          ...item,
        });
        results.push(row);
        const before = row.beforeLateCss?.canvas?.backing;
        const after = row.afterCss?.canvas?.backing;
        console.log(
          `  ${vp.width}x${vp.height}__${item.variant}: ` +
          `screenshotBlue=${row.screenshotBlueLikePixels} ` +
          `framebufferBlue=${row.framebuffer?.blueLike ?? 'n/a'} ` +
          `canvasBacking=${before?.width || 0}x${before?.height || 0}` +
          `${before && after && (before.width !== after.width || before.height !== after.height) ? ` -> ${after.width}x${after.height}` : ''} ` +
          `sectionPosition=${row.afterCss?.section?.css?.position}`
        );
      }
    }
    await stopServer(productionServer);
    productionServer = null;

    // Phase 2: build the separate static-candidate root only after production
    // controls are complete, then launch one server rooted directly there.
    buildStaticCandidateRoot();
    staticServer = await startVite(tempRoot, 'static-candidate');
    console.log(`Static candidate URL: ${staticServer.baseUrl}`);
    for (const vp of viewports) {
      const item = { variant: 'candidate-static-before-webgl-init', lateCss: null };
      const row = await runCase({
        browser,
        baseUrl: staticServer.baseUrl,
        serverLogs: staticServer.logs,
        vp,
        ...item,
      });
      results.push(row);
      const before = row.beforeLateCss?.canvas?.backing;
      const after = row.afterCss?.canvas?.backing;
      console.log(
        `  ${vp.width}x${vp.height}__${item.variant}: ` +
        `screenshotBlue=${row.screenshotBlueLikePixels} ` +
        `framebufferBlue=${row.framebuffer?.blueLike ?? 'n/a'} ` +
        `canvasBacking=${before?.width || 0}x${before?.height || 0}` +
        `${before && after && (before.width !== after.width || before.height !== after.height) ? ` -> ${after.width}x${after.height}` : ''} ` +
        `sectionPosition=${row.afterCss?.section?.css?.position}`
      );
    }

    const order = new Map([
      ['production-control', 0],
      ['candidate-late-after-webgl-init', 1],
      ['candidate-static-before-webgl-init', 2],
    ]);
    results.sort((a, b) =>
      a.viewport.width - b.viewport.width || (order.get(a.variant) ?? 99) - (order.get(b.variant) ?? 99)
    );

    const report = {
      artifactType: 'hero-webkit-candidate-load-order',
      generatedAt: new Date().toISOString(),
      playwrightVersion: require('playwright/package.json').version,
      headed,
      hypothesis: 'Late candidate CSS resizes/recomposites an already-created WebGL canvas; static candidate CSS is present before React Three Fiber creates the renderer.',
      results,
    };
    fs.writeFileSync(path.join(outDir, 'webkit-candidate-load-order.json'), `${JSON.stringify(report, null, 2)}\n`);

    const lines = [
      '# WebKit candidate load-order diagnostic',
      '',
      `Generated: ${report.generatedAt}`,
      `Playwright: ${report.playwrightVersion}`,
      `Headed: ${headed}`,
      '',
      '| viewport | variant | screenshot blue | framebuffer blue | canvas backing before -> after | section position |',
      '|---|---|---:|---:|---|---|',
    ];
    for (const row of results) {
      const before = row.beforeLateCss?.canvas?.backing;
      const after = row.afterCss?.canvas?.backing;
      lines.push(
        `| ${row.viewport.width}x${row.viewport.height} | ${row.variant} | ${row.screenshotBlueLikePixels} | ${row.framebuffer?.blueLike ?? 'n/a'} | ` +
        `${before?.width || 0}x${before?.height || 0} -> ${after?.width || 0}x${after?.height || 0} | ${row.afterCss?.section?.css?.position || 'n/a'} |`
      );
    }
    lines.push(
      '',
      'Interpretation:',
      '',
      '- If production-control and candidate-static-before-webgl-init contain screenshot blue pixels, but candidate-late-after-webgl-init is zero, the failure is caused by the QA override load order / live WebGL resize, not by production wide-desktop CSS.',
      '- If candidate-static-before-webgl-init is also zero while its framebuffer is blue, the wide candidate itself still triggers a WebKit compositor/screenshot problem even when present from startup.',
      '- In either case, a non-zero framebuffer with zero screenshot blue proves Three.js rendered the sphere and the loss happened after rendering.'
    );
    fs.writeFileSync(path.join(outDir, 'webkit-candidate-load-order.md'), `${lines.join('\n')}\n`);
    console.log(`Results: ${path.relative(root, outDir)}`);
  } catch (error) {
    console.error(error?.stack || error);
    process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopServer(productionServer).catch(() => {});
    await stopServer(staticServer).catch(() => {});
  }
})();
