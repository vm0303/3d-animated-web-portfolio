const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');

const root = process.cwd();
const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);
const argValue = (name) => {
  const p = `--${name}=`;
  const hit = argv.find((a) => a.startsWith(p));
  return hit ? hit.slice(p.length) : null;
};
const headed = hasFlag('headed');
const holdMs = Number(argValue('hold-ms') || 0);
const outDir = path.resolve(root, argValue('output-dir') || 'qa-results/hero-webkit-compositor-isolation');
const shotDir = path.join(outDir, 'screenshots');
const exportDir = path.join(outDir, 'canvas_exports');
const explicitBaseUrl = argValue('base-url') || process.env.QA_BASE_URL || null;
const candidatePath = path.resolve(root, 'qa/viewport-audit/candidates/hero-wide-desktop-v3-1.css');
if (!fs.existsSync(candidatePath)) throw new Error(`Missing ${candidatePath}`);
const candidateCss = fs.readFileSync(candidatePath, 'utf8');

const viewports = [
  { id: 'boundary', width: 1921, height: 1080 },
  { id: 'ultrawide', width: 3440, height: 1440 },
];

const exactCanvasCss = `
  .bg canvas {
    transform: none !important;
    position: static !important;
    left: auto !important;
    top: auto !important;
    width: 100% !important;
    height: 100% !important;
    max-width: none !important;
    max-height: none !important;
  }
`;

// For 1921x1080 and 3440x1440 the V3.1 target shell is viewport minus 2*gutter,
// so this centers the same wider shell without creating a transform stacking context.
const noSectionTransformCss = `
  .container > section:first-child {
    left: auto !important;
    transform: none !important;
    width: calc(100vw - (2 * var(--wide-hero-edge-gutter))) !important;
    margin-left: calc(50% - 50vw + var(--wide-hero-edge-gutter)) !important;
    margin-right: 0 !important;
  }
`;

const explicitStackCss = `
  .hero {
    position: relative !important;
    isolation: isolate !important;
  }
  .bg {
    z-index: 0 !important;
  }
  .heroSection {
    position: relative !important;
    z-index: 1 !important;
  }
`;

const variants = [
  { id: 'production-no-candidate', css: '' },
  { id: 'v31-control', css: candidateCss },
  { id: 'v31-exact-canvas', css: candidateCss + exactCanvasCss },
  { id: 'v31-no-section-transform', css: candidateCss + noSectionTransformCss },
  { id: 'v31-no-transform-exact-canvas', css: candidateCss + noSectionTransformCss + exactCanvasCss },
  { id: 'v31-explicit-stack', css: candidateCss + noSectionTransformCss + exactCanvasCss + explicitStackCss },
];

const ensureDir = (d) => fs.mkdirSync(d, { recursive: true });
fs.rmSync(outDir, { recursive: true, force: true });
ensureDir(shotDir); ensureDir(exportDir);

const findFreePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.unref(); s.on('error', reject);
  s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
});
const waitForHttp = (url, timeoutMs = 15000) => new Promise((resolve, reject) => {
  const started = Date.now();
  const attempt = () => {
    if (Date.now() - started > timeoutMs) return reject(new Error(`Timed out waiting for ${url}`));
    const req = http.get(url, (res) => { res.resume(); if (res.statusCode && res.statusCode < 500) return resolve(); setTimeout(attempt, 200); });
    req.setTimeout(1200, () => req.destroy()); req.on('error', () => setTimeout(attempt, 200));
  }; attempt();
});
const startVite = async () => {
  if (explicitBaseUrl) return { baseUrl: explicitBaseUrl.replace(/\/$/, ''), child: null };
  const port = await findFreePort();
  const viteEntry = require.resolve('vite');
  const viteBin = path.resolve(path.dirname(viteEntry), 'bin', 'vite.js');
  const child = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: ['ignore','pipe','pipe'], env: { ...process.env } });
  const baseUrl = `http://127.0.0.1:${port}`; await waitForHttp(baseUrl); return { baseUrl, child };
};

const initPreserveProbe = () => {
  window.__heroWebglProbe = { requestedContexts: [], contextLostEvents: 0 };
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, attrs) {
    const isGL = ['webgl2','webgl','experimental-webgl'].includes(type);
    const requested = isGL ? { ...(attrs || {}), preserveDrawingBuffer: true } : attrs;
    const ctx = original.call(this, type, requested);
    if (isGL) {
      window.__heroWebglProbe.requestedContexts.push({ type, requestedAttributes: requested ? { ...requested } : null, returned: Boolean(ctx) });
      if (ctx && !window.__heroWebglProbe.context) {
        window.__heroWebglProbe.context = ctx; window.__heroWebglProbe.canvas = this;
        this.addEventListener('webglcontextlost', () => window.__heroWebglProbe.contextLostEvents++);
      }
    }
    return ctx;
  };
};

const collect = async (page) => page.evaluate(() => {
  const canvas = document.querySelector('.bg canvas');
  const bg = document.querySelector('.bg');
  const hero = document.querySelector('.hero');
  const section = document.querySelector('.container > section:first-child');
  const wrapper = canvas?.parentElement;
  const gl = window.__heroWebglProbe?.context;
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { left:r.left, top:r.top, width:r.width, height:r.height, right:r.right, bottom:r.bottom }; };
  const style = (el) => { if (!el) return null; const s = getComputedStyle(el); return { position:s.position, zIndex:s.zIndex, transform:s.transform, overflow:s.overflow, isolation:s.isolation, opacity:s.opacity, width:s.width, height:s.height }; };
  const sample = { total: 0, nonZeroAlpha: 0, blueLike: 0, glError: null };
  if (gl) {
    gl.finish(); const px = new Uint8Array(4); const cols=25, rows=17;
    for (let gy=1; gy<rows; gy++) for (let gx=1; gx<cols; gx++) {
      const x=Math.min(gl.drawingBufferWidth-1, Math.floor(gx/cols*gl.drawingBufferWidth));
      const y=Math.min(gl.drawingBufferHeight-1, Math.floor(gy/rows*gl.drawingBufferHeight));
      gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px); sample.total++;
      if (px[3]>0) sample.nonZeroAlpha++;
      if (px[2]>175 && px[1]>110 && px[0]<150 && px[2]>px[0]+60) sample.blueLike++;
    }
    sample.glError = gl.getError();
  }
  let dataUrl = null; try { dataUrl = canvas?.toDataURL('image/png') || null; } catch {}
  return {
    section: { rect:rect(section), css:style(section) }, hero:{ rect:rect(hero), css:style(hero) }, bg:{ rect:rect(bg), css:style(bg) }, wrapper:{ rect:rect(wrapper), css:style(wrapper) }, canvas:{ rect:rect(canvas), css:style(canvas), backing:canvas ? {width:canvas.width,height:canvas.height}:null },
    gl: gl ? { contextLost:gl.isContextLost(), attrs:gl.getContextAttributes(), drawingBuffer:{width:gl.drawingBufferWidth,height:gl.drawingBufferHeight}, sample } : null,
    dataUrl,
  };
});

const countScreenshotBlue = async (page, buffer) => {
  const b64 = buffer.toString('base64');
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await new Promise((resolve, reject) => { img.onload=resolve; img.onerror=reject; });
    const c=document.createElement('canvas'); c.width=img.naturalWidth; c.height=img.naturalHeight;
    const ctx=c.getContext('2d'); ctx.drawImage(img,0,0);
    const x0=Math.floor(c.width*0.28), x1=Math.floor(c.width*0.72), y0=Math.floor(c.height*0.08), y1=Math.floor(c.height*0.78);
    const data=ctx.getImageData(x0,y0,x1-x0,y1-y0).data;
    let blue=0;
    for (let i=0;i<data.length;i+=4) {
      const r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];
      if (a>0 && b>175 && g>110 && r<150 && b>r+60) blue++;
    }
    return blue;
  }, b64);
};

(async () => {
  let browser, serverChild;
  try {
    const playwright = require('playwright');
    const server = await startVite(); serverChild = server.child;
    browser = await playwright.webkit.launch({ headless: !headed });
    const results=[];
    console.log(`WebKit compositor isolation: ${viewports.length} viewports × ${variants.length} variants = ${viewports.length*variants.length} runs`);
    for (const vp of viewports) {
      for (const variant of variants) {
        const context = await browser.newContext({ viewport:{width:vp.width,height:vp.height}, deviceScaleFactor:1 });
        await context.addInitScript(initPreserveProbe);
        const page = await context.newPage();
        const consoleMessages=[]; const pageErrors=[];
        page.on('console', m => { if (['error','warning'].includes(m.type())) consoleMessages.push({type:m.type(),text:m.text()}); });
        page.on('pageerror', e => pageErrors.push(String(e?.stack || e)));
        try {
          await page.goto(`${server.baseUrl}/?qa=1&qaOverlay=0&qaSpeech=longest`, { waitUntil:'networkidle' });
          if (variant.css) await page.addStyleTag({ content: variant.css });
          await page.waitForSelector('.bg canvas', { state:'attached' });
          await page.waitForTimeout(3200);
          await page.evaluate(async()=>{window.scrollTo(0,0);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
          await page.waitForTimeout(250);
          const stem=`${vp.width}x${vp.height}__${variant.id}`;
          const shotPath=path.join(shotDir,`${stem}.png`);
          const shotBuffer=await page.screenshot({ path:shotPath, fullPage:false });
          const screenshotBlueLikePixels=await countScreenshotBlue(page, shotBuffer);
          const probe=await collect(page); const dataUrl=probe.dataUrl; delete probe.dataUrl;
          let canvasExport=null;
          if (dataUrl?.startsWith('data:image/png;base64,')) {
            const buf=Buffer.from(dataUrl.slice('data:image/png;base64,'.length),'base64');
            const p=path.join(exportDir,`${stem}.png`); fs.writeFileSync(p,buf); canvasExport={path:path.relative(root,p),bytes:buf.length};
          }
          const row={ viewport:vp, variant:variant.id, screenshotPath:path.relative(root,shotPath), screenshotBlueLikePixels, canvasExport, probe, consoleMessages, pageErrors };
          results.push(row);
          console.log(`  ${stem}: screenshotBlue=${screenshotBlueLikePixels} framebufferBlue=${probe.gl?.sample?.blueLike ?? 'n/a'} sectionTransform=${probe.section?.css?.transform} bgZ=${probe.bg?.css?.zIndex} canvasRect=${Math.round(probe.canvas?.rect?.width||0)}x${Math.round(probe.canvas?.rect?.height||0)}`);
          if (headed && holdMs>0 && vp.id==='ultrawide') await page.waitForTimeout(holdMs);
        } finally { await context.close(); }
      }
    }
    const report={artifactType:'hero-webkit-compositor-isolation',generatedAt:new Date().toISOString(),playwrightVersion:require('playwright/package.json').version,headed,results};
    fs.writeFileSync(path.join(outDir,'webkit-compositor-isolation.json'),JSON.stringify(report,null,2)+'\n');
    const lines=['# WebKit compositor isolation','',`Generated: ${report.generatedAt}`,`Playwright: ${report.playwrightVersion}`,`Headed: ${headed}`,'','| viewport | variant | screenshot blue pixels | framebuffer blue samples | section transform | bg z-index | canvas rect |','|---|---|---:|---:|---|---:|---|'];
    for (const r of results) lines.push(`| ${r.viewport.width}x${r.viewport.height} | ${r.variant} | ${r.screenshotBlueLikePixels} | ${r.probe.gl?.sample?.blueLike ?? 'n/a'} | ${r.probe.section?.css?.transform} | ${r.probe.bg?.css?.zIndex} | ${Math.round(r.probe.canvas?.rect?.width||0)}x${Math.round(r.probe.canvas?.rect?.height||0)} |`);
    fs.writeFileSync(path.join(outDir,'webkit-compositor-isolation.md'),lines.join('\n')+'\n');
    console.log(`Results: ${path.relative(root,outDir)}`);
  } catch (e) { console.error(e?.stack||e); process.exitCode=1; }
  finally { if (browser) await browser.close().catch(()=>{}); if (serverChild) serverChild.kill('SIGTERM'); }
})();
