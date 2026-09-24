const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..', '..');
const contractPath = path.join(root, 'qa', 'about-viewport-audit', 'about-composition-contract.json');
const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const viewportSourcePath = path.resolve(root, contract.viewportSource);
const viewportSource = JSON.parse(fs.readFileSync(viewportSourcePath, 'utf8'));

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);
const argValue = (name) => {
  const prefix = `--${name}=`;
  const hit = argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
};

const family = argValue('family') || 'phone-portrait';
const modelFilter = argValue('model') || 'all';
const sceneFilter = argValue('scene') || null;
const quick = hasFlag('quick');
const strict = hasFlag('strict');
const screenshotMode = argValue('screenshots') || 'bad';
const explicitBaseUrl = argValue('base-url') || process.env.QA_BASE_URL || null;
const port = Number(argValue('port') || process.env.QA_PORT || 4174);
const overrideCssArg = argValue('override-css') || null;
const outputDir = path.resolve(
  root,
  argValue('output-dir') || `qa-results/about/${family}${quick ? '-quick' : ''}`
);

const overrideCssPath = overrideCssArg ? path.resolve(root, overrideCssArg) : null;
if (overrideCssPath && !fs.existsSync(overrideCssPath)) {
  throw new Error(`Missing override CSS: ${overrideCssPath}`);
}
const overrideCss = overrideCssPath ? fs.readFileSync(overrideCssPath, 'utf8') : null;

const FAMILY_TO_GROUP = contract.familyGroups;
if (family !== 'all' && !FAMILY_TO_GROUP[family]) {
  throw new Error(`Unknown family: ${family}`);
}

const sanitize = (value) => String(value)
  .replace(/[^a-z0-9._-]+/gi, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase();

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });

const uniqueById = (items) => {
  const seen = new Set();
  return items.filter((item) => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

const quickCases = (cases) => {
  if (cases.length <= 6) return cases;
  const measured = cases.filter((item) => item.source === 'MEASURED');
  const picks = [
    cases[0],
    cases[Math.floor(cases.length / 2)],
    cases[cases.length - 1],
  ];
  if (measured.length) {
    picks.push(
      measured[0],
      measured[Math.floor(measured.length / 2)],
      measured[measured.length - 1]
    );
  }
  return uniqueById(picks);
};

const families = family === 'all' ? Object.keys(FAMILY_TO_GROUP) : [family];
let viewportCases = [];
for (const familyName of families) {
  const groupName = FAMILY_TO_GROUP[familyName];
  const cases = viewportSource.groups[groupName] || [];
  const selected = quick ? quickCases(cases) : cases;
  viewportCases.push(...selected.map((item) => ({ ...item, aboutFamily: familyName })));
}

let modelStates = contract.modelStates;
if (modelFilter !== 'all') {
  modelStates = modelStates.filter((state) => state.model === modelFilter);
}
if (sceneFilter) {
  modelStates = modelStates.filter((state) => state.scene === sceneFilter);
}
if (!modelStates.length) {
  throw new Error(`No model states match --model=${modelFilter}${sceneFilter ? ` --scene=${sceneFilter}` : ''}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForHttp = async (url, timeoutMs = 30000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const ok = await new Promise((resolve) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(1500, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
};

const startVite = async () => {
  if (explicitBaseUrl) return { baseUrl: explicitBaseUrl, child: null };
  const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!fs.existsSync(viteBin)) {
    throw new Error('Vite is not installed. Run npm install first.');
  }
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: root,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.on('exit', (code) => {
    if (code && code !== 0) process.stderr.write(stderr);
  });
  await waitForHttp(baseUrl);
  return { baseUrl, child };
};

const installPreMountCandidate = async (page) => {
  if (!overrideCss) return;
  await page.route('**/src/components/about/About.jsx*', async (route) => {
    const response = await route.fetch();
    const original = await response.text();
    const injection = `\n;(() => {\n  const old = document.getElementById('qa-about-candidate');\n  old?.remove();\n  const style = document.createElement('style');\n  style.id = 'qa-about-candidate';\n  style.textContent = ${JSON.stringify(overrideCss)};\n  document.head.appendChild(style);\n})();\n`;
    await route.fulfill({ response, body: injection + original });
  });
};

const collectMetrics = async (page) => page.evaluate(() => {
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      width: r.width,
      height: r.height,
    };
  };
  const isVisible = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0 && r.width > 0 && r.height > 0;
  };

  const about = document.querySelector('.about');
  const host = about?.closest('section');
  const next = host?.nextElementSibling;
  const left = document.querySelector('.aSection.left');
  const right = document.querySelector('.aSection.right');
  const title = document.querySelector('.aTitle');
  const list = document.querySelector('.aboutList');
  const paragraphs = [...document.querySelectorAll('.aboutList p')];
  const keywords = [...document.querySelectorAll('.aboutKeyword')];
  const model = document.querySelector('.aboutModelContainer');
  const canvasShell = document.querySelector('.aboutCanvasShell');
  const canvas = document.querySelector('.aboutCanvasShell canvas');
  const screenTrigger = document.querySelector('.aboutScreenTrigger');

  const paragraphMetrics = paragraphs.map((el) => ({
    rect: rect(el),
    visible: isVisible(el),
    fontSize: parseFloat(getComputedStyle(el).fontSize),
    lineHeight: parseFloat(getComputedStyle(el).lineHeight),
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));

  return {
    viewport: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      visualWidth: window.visualViewport?.width ?? window.innerWidth,
      visualHeight: window.visualViewport?.height ?? window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    document: {
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      clientWidth: document.documentElement.clientWidth,
      clientHeight: document.documentElement.clientHeight,
    },
    rects: {
      host: rect(host),
      about: rect(about),
      next: rect(next),
      left: rect(left),
      right: rect(right),
      title: rect(title),
      list: rect(list),
      model: rect(model),
      canvasShell: rect(canvasShell),
      canvas: rect(canvas),
      screenTrigger: rect(screenTrigger),
    },
    left: left ? {
      scrollWidth: left.scrollWidth,
      clientWidth: left.clientWidth,
      scrollHeight: left.scrollHeight,
      clientHeight: left.clientHeight,
    } : null,
    title: title ? {
      fontSize: parseFloat(getComputedStyle(title).fontSize),
      lineHeight: parseFloat(getComputedStyle(title).lineHeight),
      visible: isVisible(title),
    } : null,
    paragraphs: paragraphMetrics,
    keywords: keywords.map((el) => ({
      visible: isVisible(el),
      rect: rect(el),
      text: el.textContent.trim(),
    })),
    visibleParagraphCount: paragraphMetrics.filter((item) => item.visible).length,
    visibleKeywordCount: keywords.filter(isVisible).length,
    modelState: model ? {
      qa: model.dataset.aboutQa ?? null,
      scene: model.dataset.aboutScene ?? null,
      model: model.dataset.aboutModel ?? null,
      ready: model.dataset.aboutReady ?? null,
    } : null,
    screenTriggerVisible: isVisible(screenTrigger),
  };
});

const addIssue = (issues, severity, code, message, metrics = null) => {
  issues.push({ severity, code, message, metrics });
};

const evaluateMetrics = (metrics, state) => {
  const issues = [];
  const t = contract.thresholds;
  const tol = t.containmentTolerancePx;
  const r = metrics.rects;

  if (metrics.document.scrollWidth > metrics.viewport.innerWidth + t.horizontalOverflowTolerancePx) {
    addIssue(issues, 'FAIL', 'HORIZONTAL_OVERFLOW', 'Document is wider than the viewport.', {
      scrollWidth: metrics.document.scrollWidth,
      viewportWidth: metrics.viewport.innerWidth,
    });
  }

  if (!r.about || !r.left || !r.right) {
    addIssue(issues, 'FAIL', 'ABOUT_STRUCTURE_MISSING', 'Required About layout nodes were not found.');
    return issues;
  }

  if (metrics.left && (
    metrics.left.scrollWidth > metrics.left.clientWidth + tol ||
    metrics.left.scrollHeight > metrics.left.clientHeight + tol
  )) {
    addIssue(issues, 'FAIL', 'ABOUT_TEXT_CLIPPED', 'The text column overflows its available region.', metrics.left);
  }

  const visibleParagraphs = metrics.paragraphs.filter((item) => item.visible);
  if (!metrics.title?.visible || metrics.title.fontSize < t.minTitleFontPx) {
    addIssue(issues, 'FAIL', 'TITLE_READABILITY', 'About title is missing or below the readability floor.', metrics.title);
  }

  for (const p of visibleParagraphs) {
    if (p.fontSize < t.minBodyFontPx) {
      addIssue(issues, 'FAIL', 'BODY_TEXT_TOO_SMALL', 'Visible About copy is below the body-text readability floor.', {
        fontSize: p.fontSize,
        minBodyFontPx: t.minBodyFontPx,
      });
      break;
    }
    if (Number.isFinite(p.lineHeight) && p.lineHeight / p.fontSize < t.minBodyLineHeightRatio) {
      addIssue(issues, 'REVIEW', 'BODY_LINE_HEIGHT_TIGHT', 'Visible About copy has a tight line-height.', {
        fontSize: p.fontSize,
        lineHeight: p.lineHeight,
      });
      break;
    }
  }

  if (metrics.visibleParagraphCount < t.recommendedVisibleParagraphs) {
    addIssue(issues, 'REVIEW', 'CONTENT_REDUCED', 'Fewer About paragraphs are visible. This can be acceptable when omission is intentional and the composition remains complete.', {
      visibleParagraphCount: metrics.visibleParagraphCount,
      recommendedVisibleParagraphs: t.recommendedVisibleParagraphs,
    });
  }

  if (!r.model || !r.canvas || r.model.width <= 0 || r.model.height <= 0 || r.canvas.width <= 0 || r.canvas.height <= 0) {
    addIssue(issues, 'FAIL', 'MODEL_STAGE_COLLAPSED', 'The About 3D stage or canvas has collapsed.', {
      model: r.model,
      canvas: r.canvas,
    });
  } else if (r.model.width < t.minModelRegionWidthPx || r.model.height < t.minModelRegionHeightPx) {
    addIssue(issues, 'REVIEW', 'MODEL_STAGE_TIGHT', 'The About 3D model region is small enough to require visual review.', r.model);
  }

  if (r.model && r.right && (
    r.model.left < r.right.left - tol ||
    r.model.right > r.right.right + tol ||
    r.model.top < r.right.top - tol ||
    r.model.bottom > r.right.bottom + tol
  )) {
    addIssue(issues, 'FAIL', 'MODEL_REGION_ESCAPE', 'The 3D model container escapes the right-side layout region.', {
      model: r.model,
      right: r.right,
    });
  }

  if (r.left && r.right && r.left.right > r.right.left + tol) {
    addIssue(issues, 'FAIL', 'ABOUT_COLUMNS_OVERLAP', 'Text and model layout regions overlap.', {
      left: r.left,
      right: r.right,
    });
  }

  const visibleContentRects = [r.title, r.list, r.model, r.screenTrigger].filter(Boolean);
  for (const item of visibleContentRects) {
    if (
      item.left < r.about.left - tol ||
      item.right > r.about.right + tol ||
      item.top < r.about.top - tol ||
      item.bottom > r.about.bottom + tol
    ) {
      addIssue(issues, 'FAIL', 'ABOUT_CONTENT_ESCAPE', 'Visible About content extends outside the About section.', {
        item,
        about: r.about,
      });
      break;
    }
  }

  if (state.model === 'laptop') {
    if (!metrics.screenTriggerVisible || !r.screenTrigger) {
      addIssue(issues, 'FAIL', 'VIEW_SCREEN_BUTTON_MISSING', 'Laptop is ready but the View screen button is not visible.');
    } else if (r.right && (
      r.screenTrigger.left < r.right.left - tol ||
      r.screenTrigger.right > r.right.right + tol ||
      r.screenTrigger.top < r.right.top - tol ||
      r.screenTrigger.bottom > r.right.bottom + tol
    )) {
      addIssue(issues, 'FAIL', 'VIEW_SCREEN_BUTTON_ESCAPE', 'View screen button is outside the model region.', {
        button: r.screenTrigger,
        right: r.right,
      });
    }
  }

  if (metrics.modelState?.scene !== state.scene || metrics.modelState?.model !== state.model || metrics.modelState?.ready !== 'true') {
    addIssue(issues, 'FAIL', 'DETERMINISTIC_MODEL_MISMATCH', 'QA did not settle on the requested model state.', {
      requested: state,
      actual: metrics.modelState,
    });
  }

  if (r.next && r.host) {
    const visibleBottom = metrics.viewport.visualHeight;
    const nextVisiblePx = Math.max(0, visibleBottom - r.next.top);
    if (nextVisiblePx > t.nextSectionReviewPx) {
      addIssue(issues, 'REVIEW', 'NEXT_SECTION_VISIBLE', 'The next section is visible while About is aligned for capture.', {
        nextVisiblePx,
        nextTop: r.next.top,
        visualHeight: visibleBottom,
      });
    }
  }

  return issues;
};

const statusForIssues = (issues) => {
  if (issues.some((issue) => issue.severity === 'FAIL')) return 'FAIL';
  if (issues.some((issue) => issue.severity === 'REVIEW')) return 'REVIEW';
  return 'PASS';
};

const csvEscape = (value) => {
  const valueText = String(value ?? '');
  return /[",\n]/.test(valueText) ? `"${valueText.replace(/"/g, '""')}"` : valueText;
};

(async () => {
  ensureDir(outputDir);
  const goodDir = path.join(outputDir, 'good_screenshots');
  const badDir = path.join(outputDir, 'bad_screenshots');
  ensureDir(goodDir);
  ensureDir(badDir);

  const { baseUrl, child } = await startVite();
  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    console.log(`About composition QA: ${viewportCases.length} viewport cases × ${modelStates.length} model states.`);
    console.log(`Family: ${family}${quick ? ' (quick)' : ''}`);
    console.log(`Base URL: ${baseUrl}`);
    if (overrideCssPath) console.log(`Override CSS: ${path.relative(root, overrideCssPath)} (pre-mount)`);

    let tested = 0;
    for (const testCase of viewportCases) {
      for (const state of modelStates) {
        const context = await browser.newContext({
          viewport: { width: testCase.width, height: testCase.height },
          deviceScaleFactor: 1,
          reducedMotion: 'reduce',
        });
        const page = await context.newPage();
        const runtimeErrors = [];
        page.on('pageerror', (error) => runtimeErrors.push(String(error?.message || error)));
        page.on('console', (msg) => {
          if (msg.type() === 'error') runtimeErrors.push(`console: ${msg.text()}`);
        });

        try {
          await installPreMountCandidate(page);
          const url = new URL(baseUrl);
          url.searchParams.set('about-qa', '1');
          url.searchParams.set('about-scene', state.scene);
          url.searchParams.set('about-model', state.model);
          await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForSelector('.about', { timeout: 15000 });
          await page.evaluate(() => {
            document.documentElement.style.scrollBehavior = 'auto';
            const about = document.querySelector('.about');
            about?.closest('section')?.scrollIntoView({ behavior: 'auto', block: 'start' });
          });

          await page.waitForFunction(
            ({ scene, model }) => {
              const el = document.querySelector('.aboutModelContainer[data-about-qa="true"]');
              return el?.dataset.aboutScene === scene &&
                el?.dataset.aboutModel === model &&
                el?.dataset.aboutReady === 'true';
            },
            { scene: state.scene, model: state.model },
            { timeout: 20000 }
          );

          await page.waitForTimeout(contract.settleMs);
          const metrics = await collectMetrics(page);
          const issues = evaluateMetrics(metrics, state);
          for (const error of runtimeErrors) {
            addIssue(issues, 'FAIL', 'RUNTIME_ERROR', error);
          }
          const status = statusForIssues(issues);
          const item = {
            id: `${testCase.id}__${state.scene}-${state.model}`,
            family: testCase.aboutFamily,
            viewportId: testCase.id,
            width: testCase.width,
            height: testCase.height,
            label: testCase.label,
            source: testCase.source || 'SYNTHETIC',
            scene: state.scene,
            model: state.model,
            status,
            issues,
            metrics,
          };
          results.push(item);

          const shouldShoot = screenshotMode === 'all' || (screenshotMode === 'bad' && status !== 'PASS');
          if (shouldShoot) {
            const dir = status === 'PASS' ? goodDir : badDir;
            const filename = `${status}__${sanitize(testCase.aboutFamily)}__${testCase.width}x${testCase.height}__${sanitize(state.scene)}-${sanitize(state.model)}__${sanitize(testCase.id)}.png`;
            await page.screenshot({ path: path.join(dir, filename), fullPage: false });
          }
        } catch (error) {
          results.push({
            id: `${testCase.id}__${state.scene}-${state.model}`,
            family: testCase.aboutFamily,
            viewportId: testCase.id,
            width: testCase.width,
            height: testCase.height,
            label: testCase.label,
            source: testCase.source || 'SYNTHETIC',
            scene: state.scene,
            model: state.model,
            status: 'FAIL',
            issues: [{ severity: 'FAIL', code: 'QA_EXECUTION_ERROR', message: String(error?.stack || error) }],
            metrics: null,
          });
        } finally {
          await context.close();
        }

        tested += 1;
        if (tested % 10 === 0 || tested === viewportCases.length * modelStates.length) {
          console.log(`  tested ${tested}/${viewportCases.length * modelStates.length}`);
        }
      }
    }
  } finally {
    await browser.close();
    if (child) child.kill();
  }

  const counts = { PASS: 0, REVIEW: 0, FAIL: 0 };
  for (const item of results) counts[item.status] += 1;
  const summary = {
    generatedAt: new Date().toISOString(),
    family,
    quick,
    viewportCases: viewportCases.length,
    modelStates: modelStates.length,
    total: results.length,
    ...counts,
    overrideCssPath: overrideCssPath ? path.relative(root, overrideCssPath) : null,
    candidateLoadMode: overrideCssPath ? 'About.jsx pre-render module injection' : null,
  };

  fs.writeFileSync(path.join(outputDir, 'about-composition-report.json'), JSON.stringify({ summary, results }, null, 2));

  const md = [
    '# About Composition QA',
    '',
    `- Family: **${family}**${quick ? ' (quick)' : ''}`,
    `- Viewport cases: **${summary.viewportCases}**`,
    `- Model states per viewport: **${summary.modelStates}**`,
    `- Total: **${summary.total}**`,
    `- PASS: **${summary.PASS}**`,
    `- REVIEW: **${summary.REVIEW}**`,
    `- FAIL: **${summary.FAIL}**`,
    '',
    '## Design policy',
    '',
    'Readability and visual balance take priority over forcing every paragraph into every geometry. Intentional omission of secondary copy may be acceptable; shrinking text below the contract readability floor is not.',
    '',
    '## Non-pass cases',
    '',
  ];
  const nonPass = results.filter((item) => item.status !== 'PASS');
  if (!nonPass.length) md.push('None.');
  for (const item of nonPass) {
    md.push(`### ${item.status} — ${item.width}×${item.height} — ${item.scene}/${item.model}`);
    md.push(`- ${item.label || item.viewportId}`);
    for (const issue of item.issues) md.push(`- **${issue.severity} ${issue.code}:** ${issue.message}`);
    md.push('');
  }
  fs.writeFileSync(path.join(outputDir, 'about-composition-report.md'), md.join('\n'));

  const csvRows = [['status','family','width','height','viewportId','scene','model','issueCodes']];
  for (const item of results) {
    csvRows.push([
      item.status,
      item.family,
      item.width,
      item.height,
      item.viewportId,
      item.scene,
      item.model,
      item.issues.map((issue) => issue.code).join('|'),
    ]);
  }
  fs.writeFileSync(
    path.join(outputDir, 'about-composition-cases.csv'),
    csvRows.map((row) => row.map(csvEscape).join(',')).join('\n')
  );

  console.log('');
  console.log('About composition QA complete.');
  console.log(`Total: ${summary.total} | PASS ${summary.PASS} | REVIEW ${summary.REVIEW} | FAIL ${summary.FAIL}`);
  console.log(`JSON: ${path.relative(root, path.join(outputDir, 'about-composition-report.json'))}`);
  console.log(`Markdown: ${path.relative(root, path.join(outputDir, 'about-composition-report.md'))}`);
  console.log(`CSV: ${path.relative(root, path.join(outputDir, 'about-composition-cases.csv'))}`);

  if (strict && summary.FAIL > 0) process.exitCode = 1;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
