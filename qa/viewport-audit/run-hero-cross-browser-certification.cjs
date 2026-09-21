const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');

const root = process.cwd();

const argv = process.argv.slice(2);
const argValue = (name) => {
  const prefix = `--${name}=`;
  const hit = argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
};
const hasFlag = (name) => argv.includes(`--${name}`);

const contractArg = argValue('contract') || null;
const contractPath = contractArg
  ? path.resolve(root, contractArg)
  : path.join(root, 'qa', 'viewport-audit', 'hero-cross-browser-certification-contract.json');

const groupFilter = argValue('group') || 'all';
const browserFilterRaw = argValue('browser') || null;
const screenshotMode = argValue('screenshots') || 'all';
const explicitBaseUrl = argValue('base-url') || process.env.QA_BASE_URL || null;
const overrideCssArg = argValue('override-css') || null;
const outputDirArg = argValue('output-dir') || null;
const strictExit = hasFlag('strict');

const outDir = outputDirArg
  ? path.resolve(root, outputDirArg)
  : path.join(root, 'qa-results', 'hero-cross-browser-certification');
const goodDir = path.join(outDir, 'good_screenshots');
const badDir = path.join(outDir, 'bad_screenshots');
const jsonOut = path.join(outDir, 'hero-cross-browser-report.json');
const mdOut = path.join(outDir, 'hero-cross-browser-report.md');
const csvOut = path.join(outDir, 'hero-cross-browser-cases.csv');

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const overrideCssPath = overrideCssArg ? path.resolve(root, overrideCssArg) : null;

if (!fs.existsSync(contractPath)) {
  console.error(`Missing certification contract: ${contractPath}`);
  process.exit(1);
}
if (overrideCssPath && !fs.existsSync(overrideCssPath)) {
  console.error(`Missing override CSS: ${overrideCssPath}`);
  process.exit(1);
}

const contract = readJson(contractPath);
const thresholds = contract.thresholds || {};
const baselineBrowser = contract.baselineBrowser || 'chromium';

const requestedBrowsers = browserFilterRaw
  ? browserFilterRaw.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean)
  : [...(contract.browsers || [])];

const allowedBrowsers = new Set(['chromium', 'firefox', 'webkit']);
for (const browserName of requestedBrowsers) {
  if (!allowedBrowsers.has(browserName)) {
    console.error(`Unsupported browser "${browserName}". Use chromium, firefox, or webkit.`);
    process.exit(1);
  }
}

const groups = contract.groups || {};
let cases = [];
if (groupFilter === 'all') {
  for (const [group, entries] of Object.entries(groups)) {
    for (const entry of entries || []) cases.push({ ...entry, group });
  }
} else if (groupFilter === 'desktop') {
  const desktopGroupNames = Object.keys(groups).filter((name) => name.startsWith('desktop-'));
  if (!desktopGroupNames.length) {
    console.error('No desktop-* groups exist in the certification contract.');
    process.exit(1);
  }
  for (const group of desktopGroupNames) {
    for (const entry of groups[group] || []) cases.push({ ...entry, group });
  }
} else {
  if (!Array.isArray(groups[groupFilter])) {
    console.error(`Unknown group "${groupFilter}". Available: desktop, ${Object.keys(groups).join(', ')}`);
    process.exit(1);
  }
  cases = groups[groupFilter].map((entry) => ({ ...entry, group: groupFilter }));
}

if (!cases.length) {
  console.error('No certification cases selected.');
  process.exit(1);
}

if (hasFlag('list')) {
  console.log(`Hero certification matrix: ${groupFilter} (${cases.length} viewport cases)`);
  for (const testCase of cases) {
    console.log(`${testCase.group.padEnd(18)} ${String(testCase.width).padStart(5)}x${String(testCase.height).padEnd(5)}  ${testCase.id}  ${testCase.label || ''}`);
  }
  process.exit(0);
}

const round = (value) => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
const sanitize = (value) => String(value).replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-');
const csvEscape = (value) => {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const statusRank = { PASS: 0, REVIEW: 1, FAIL: 2 };
const addIssue = (issues, severity, code, message, details = null) => {
  issues.push({ severity, code, message, details });
};
const finishStatus = (issues) => {
  if (issues.some((item) => item.severity === 'FAIL')) return 'FAIL';
  if (issues.some((item) => item.severity === 'REVIEW')) return 'REVIEW';
  return 'PASS';
};

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
  const retry = () => {
    if (Date.now() - started > timeoutMs) return reject(new Error(`Timed out waiting for ${url}`));
    setTimeout(attempt, 250);
  };
  const attempt = () => {
    const req = http.get(url, (res) => {
      res.resume();
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) return resolve();
      retry();
    });
    req.setTimeout(1500, () => req.destroy());
    req.on('error', retry);
  };
  attempt();
});

const candidateTempRoot = path.join(outDir, '.static-candidate-root');

const buildStaticCandidateRoot = () => {
  if (!overrideCssPath) return root;
  if (explicitBaseUrl) {
    throw new Error(
      '--override-css requires the certification runner to start its own Vite server so the candidate CSS can be present before React/Three.js mounts. Remove --base-url when using --override-css.'
    );
  }

  fs.rmSync(candidateTempRoot, { recursive: true, force: true });
  ensureDir(candidateTempRoot);

  for (const name of ['index.html', 'src', 'public']) {
    const source = path.join(root, name);
    const target = path.join(candidateTempRoot, name);
    if (!fs.existsSync(source)) {
      throw new Error(`Missing source required for static candidate root: ${source}`);
    }
    fs.cpSync(source, target, { recursive: true });
  }

  for (const name of [
    'vite.config.js',
    'vite.config.mjs',
    'vite.config.cjs',
    'vite.config.ts',
    'jsconfig.json',
    'tsconfig.json',
  ]) {
    const source = path.join(root, name);
    if (fs.existsSync(source)) {
      fs.cpSync(source, path.join(candidateTempRoot, name), { recursive: true });
    }
  }

  const heroCssPath = path.join(candidateTempRoot, 'src', 'components', 'hero', 'hero.css');
  if (!fs.existsSync(heroCssPath)) {
    throw new Error(`Unable to locate Hero CSS in static candidate root: ${heroCssPath}`);
  }

  const baseCss = fs.readFileSync(heroCssPath, 'utf8');
  const candidateCss = fs.readFileSync(overrideCssPath, 'utf8');
  fs.writeFileSync(
    heroCssPath,
    `${baseCss}\n\n/* QA STATIC CANDIDATE — loaded before React/Three.js startup. */\n${candidateCss}\n`,
    'utf8'
  );

  return candidateTempRoot;
};

const startVite = async (viteRoot = root) => {
  if (explicitBaseUrl) return { baseUrl: explicitBaseUrl.replace(/\/$/, ''), child: null, viteRoot: null };

  const port = await findFreePort();
  const viteEntry = require.resolve('vite');
  const viteBin = path.resolve(path.dirname(viteEntry), 'bin', 'vite.js');
  const child = spawn(
    process.execPath,
    [viteBin, viteRoot, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env } }
  );

  let viteLog = '';
  child.stdout.on('data', (chunk) => { viteLog += chunk.toString(); });
  child.stderr.on('data', (chunk) => { viteLog += chunk.toString(); });
  child.on('exit', (code) => {
    if (code && code !== 0) console.error(`Vite exited with code ${code}.\n${viteLog}`);
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await waitForHttp(baseUrl);
  } catch (error) {
    child.kill('SIGTERM');
    throw new Error(`${error.message}\nVite log:\n${viteLog}`);
  }
  return { baseUrl, child, viteRoot };
};

const captureLayout = async (page) => page.evaluate(() => {
  const makeRect = (r) => ({
    left: r.left,
    top: r.top,
    right: r.right,
    bottom: r.bottom,
    width: r.width,
    height: r.height,
    centerX: r.left + r.width / 2,
    centerY: r.top + r.height / 2,
  });

  const rect = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return { found: false, selector };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      found: true,
      selector,
      display: cs.display,
      visibility: cs.visibility,
      opacity: Number(cs.opacity),
      ...makeRect(r),
    };
  };

  const union = (items) => {
    const visible = items.filter((item) =>
      item && item.found && item.display !== 'none' &&
      item.visibility !== 'hidden' && item.width > 0 && item.height > 0
    );
    if (!visible.length) return { found: false };
    const left = Math.min(...visible.map((item) => item.left));
    const top = Math.min(...visible.map((item) => item.top));
    const right = Math.max(...visible.map((item) => item.right));
    const bottom = Math.max(...visible.map((item) => item.bottom));
    return {
      found: true,
      display: 'union',
      visibility: 'visible',
      opacity: 1,
      ...makeRect({ left, top, right, bottom, width: right - left, height: bottom - top }),
    };
  };

  const lineCount = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
    if (!rects.length) return 0;
    const tops = [];
    for (const r of rects) {
      if (!tops.some((top) => Math.abs(top - r.top) < 2)) tops.push(r.top);
    }
    return tops.length;
  };

  const fontSize = (selector) => {
    const el = document.querySelector(selector);
    return el ? parseFloat(getComputedStyle(el).fontSize) : null;
  };

  const hero = rect('.hero');
  const heroHost = (() => {
    const el = document.querySelector('.hero')?.parentElement;
    if (!el) return { found: false, selector: '.hero parent' };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      found: true,
      selector: '.hero parent',
      display: cs.display,
      visibility: cs.visibility,
      opacity: Number(cs.opacity),
      ...makeRect(r),
    };
  })();
  const heroTitle = rect('.heroTitle');
  const certifications = rect('.certifications');
  const certificationIcon = rect('.certificationsImages img');
  const scroll = rect('.scroll');
  const scrollGraphic = rect('.scroll > svg');
  const hImg = rect('.hImg');
  const hImgImage = rect('.hImg img');
  const canvas = rect('.bg canvas');
  const bubble = rect('.bubbleContainer');
  const bubbleAvatar = rect('.bubbleContainer img');
  const socials = rect('.socials');
  const socialIcon = rect('.socials img');
  const socialsText = rect('.socialsText');
  const socialsVisual = union([socials, socialsText]);
  const contact = rect('.contactButtonLink');
  const contactGraphic = rect('.contactButton > svg');
  const contactArrow = rect('.arrow svg');

  const contactSvgViewBoxWidth = (() => {
    const el = document.querySelector('.contactButton > svg');
    const width = el?.viewBox?.baseVal?.width;
    return Number.isFinite(width) && width > 0 ? width : null;
  })();

  return {
    viewport: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      visualWidth: window.visualViewport?.width ?? null,
      visualHeight: window.visualViewport?.height ?? null,
      devicePixelRatio: window.devicePixelRatio,
    },
    document: {
      clientWidth: document.documentElement.clientWidth,
      clientHeight: document.documentElement.clientHeight,
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
      bodyScrollWidth: document.body?.scrollWidth ?? null,
    },
    rects: {
      hero,
      heroHost,
      heroTitle,
      certifications,
      certificationIcon,
      scroll,
      scrollGraphic,
      hImg,
      hImgImage,
      canvas,
      bubble,
      bubbleAvatar,
      socials,
      socialIcon,
      socialsText,
      socialsVisual,
      contact,
      contactGraphic,
      contactArrow,
    },
    lineCounts: {
      heroTitle: lineCount('.heroTitle'),
      certificationTitle: lineCount('.certifications h2'),
      certificationCopy: lineCount('.certifications p'),
      bubble: lineCount('.bubble > span'),
    },
    fontSizes: {
      heroTitle: fontSize('.heroTitle'),
      certificationTitle: fontSize('.certifications h2'),
      certificationCopy: fontSize('.certifications p'),
      bubble: fontSize('.bubble'),
      socialsText: fontSize('.socialsText'),
      contactCircleText: fontSize('.circleText'),
    },
    effectiveFontSizes: {
      contactCircleText: (() => {
        const userFont = fontSize('.circleText');
        if (!Number.isFinite(userFont) || !contactGraphic?.found || !contactSvgViewBoxWidth) return null;
        return userFont * (contactGraphic.width / contactSvgViewBoxWidth);
      })(),
    },
    svgMetrics: {
      contactViewBoxWidth: contactSvgViewBoxWidth,
    },
    canvasBackingStore: (() => {
      const el = document.querySelector('.bg canvas');
      return el ? { width: el.width, height: el.height } : null;
    })(),
    canvasComputedStyle: (() => {
      const el = document.querySelector('.bg canvas');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        transform: cs.transform,
        position: cs.position,
        left: cs.left,
        top: cs.top,
        width: cs.width,
        height: cs.height,
      };
    })(),
  };
});

const rectIntersectionArea = (a, b) => {
  if (!a?.found || !b?.found) return 0;
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
};

const clampNumber = (min, value, max) => Math.max(min, Math.min(value, max));

const wideDesktopVisualIssues = (testCase, metrics) => {
  const issues = [];
  if (testCase.group !== 'desktop-wide') return issues;

  const scalePolicy = contract.wideDesktopScale || null;
  const shellPolicy = contract.wideDesktopShell || null;
  const r = metrics.rects;

  if (shellPolicy && r.hero?.found) {
    const edge = clampNumber(
      Number(shellPolicy.edgeGutterMinPx ?? 32),
      testCase.width * Number(shellPolicy.edgeGutterViewportRatio ?? 0.015),
      Number(shellPolicy.edgeGutterMaxPx ?? 64)
    );
    const heightCap = clampNumber(
      Number(shellPolicy.shellMinPx ?? 2400),
      testCase.height * Number(shellPolicy.shellHeightMultiplier ?? 2.1),
      Number(shellPolicy.shellMaxPx ?? 3600)
    );
    const expectedMinWidth = Math.min(testCase.width - (2 * edge), heightCap);
    const tolerance = Number(shellPolicy.widthTolerancePx ?? 4);
    if (r.hero.width < expectedMinWidth - tolerance) {
      addIssue(issues, 'FAIL', 'HERO_WIDE_SHELL_UNDERSIZED', 'Wide-desktop Hero shell leaves more side void than the geometry contract allows.', {
        actualWidth: round(r.hero.width),
        expectedMinimumWidth: round(expectedMinWidth),
        edgeGutter: round(edge),
        heightAwareCap: round(heightCap),
        tolerance,
      });
    }
  }

  if (!scalePolicy) return issues;

  const anchorWidth = Number(scalePolicy.anchorWidth ?? 1920);
  const anchorHeight = Number(scalePolicy.anchorHeight ?? 1080);
  const heightMultiplier = Number(scalePolicy.heightScaleMultiplier ?? 1.215);
  const maxScale = Number(scalePolicy.maxScale ?? 1.8);
  const toleranceRatio = Number(thresholds.wideDesktopScaleToleranceRatio ?? 0.035);
  const requiredScale = Math.min(
    maxScale,
    testCase.width / anchorWidth,
    (testCase.height / anchorHeight) * heightMultiplier
  );
  const allowedScale = Math.max(1, requiredScale - toleranceRatio);
  const refs = scalePolicy.references || {};
  const absoluteMinimums = scalePolicy.absoluteMinimums || {};
  const contactPolicy = contract.wideDesktopContact || {};

  const checkAbsoluteMinimum = (code, label, actual, minimum) => {
    if (!Number.isFinite(actual) || !Number.isFinite(minimum)) return;
    if (actual + 0.01 < minimum) {
      addIssue(issues, 'FAIL', `HERO_WIDE_MIN_${code}`, `${label} is below the wide-desktop visual floor.`, {
        actual: round(actual),
        requiredMinimum: round(minimum),
      });
    }
  };

  checkAbsoluteMinimum('TITLE', 'Hero title', metrics.fontSizes?.heroTitle, Number(absoluteMinimums.heroTitleFont));
  checkAbsoluteMinimum('CERT_TITLE', 'Certification heading', metrics.fontSizes?.certificationTitle, Number(absoluteMinimums.certificationTitleFont));
  checkAbsoluteMinimum('CERT_COPY', 'Certification copy', metrics.fontSizes?.certificationCopy, Number(absoluteMinimums.certificationCopyFont));
  checkAbsoluteMinimum('CERT_ICON', 'Certification icon', r.certificationIcon?.width, Number(absoluteMinimums.certificationIcon));
  checkAbsoluteMinimum('SCROLL', 'Scroll indicator', r.scrollGraphic?.width, Number(absoluteMinimums.scroll));
  checkAbsoluteMinimum('BUBBLE_FONT', 'Speech bubble text', metrics.fontSizes?.bubble, Number(absoluteMinimums.bubbleFont));
  checkAbsoluteMinimum('BUBBLE_AVATAR', 'Speech bubble avatar', r.bubbleAvatar?.width, Number(absoluteMinimums.bubbleAvatar));
  checkAbsoluteMinimum('SOCIAL_ICON', 'Social icon', r.socialIcon?.width, Number(absoluteMinimums.socialIcon));
  checkAbsoluteMinimum('SOCIAL_TEXT', 'FOLLOW ME text', metrics.fontSizes?.socialsText, Number(absoluteMinimums.socialsTextFont));
  checkAbsoluteMinimum('CONTACT', 'Contact control', r.contactGraphic?.width, Number(absoluteMinimums.contactGraphic));

  const maxCircleUserFont = Number(contactPolicy.circleTextUserFontMax ?? NaN);
  if (Number.isFinite(maxCircleUserFont) && Number.isFinite(metrics.fontSizes?.contactCircleText) && metrics.fontSizes.contactCircleText > maxCircleUserFont + 0.01) {
    addIssue(issues, 'FAIL', 'HERO_WIDE_CONTACT_TEXT_OVERSCALE', 'Contact circular text is being scaled inside an SVG that is already scaled.', {
      actualUserFont: round(metrics.fontSizes.contactCircleText),
      allowedMaximumUserFont: round(maxCircleUserFont),
      effectiveRenderedFont: round(metrics.effectiveFontSizes?.contactCircleText),
      viewBoxWidth: round(metrics.svgMetrics?.contactViewBoxWidth),
    });
  }

  const maxCircleRatio = Number(contactPolicy.circleTextEffectiveToGraphicRatioMax ?? NaN);
  if (Number.isFinite(maxCircleRatio) && Number.isFinite(metrics.effectiveFontSizes?.contactCircleText) && r.contactGraphic?.found && r.contactGraphic.width > 0) {
    const ratio = metrics.effectiveFontSizes.contactCircleText / r.contactGraphic.width;
    if (ratio > maxCircleRatio + 0.0001) {
      addIssue(issues, 'FAIL', 'HERO_WIDE_CONTACT_TEXT_RATIO', 'Contact circular text is too large relative to its ring.', {
        actualRatio: round(ratio),
        allowedMaximumRatio: round(maxCircleRatio),
        effectiveRenderedFont: round(metrics.effectiveFontSizes.contactCircleText),
        contactGraphicWidth: round(r.contactGraphic.width),
      });
    }
  }

  const maxArrowRatio = Number(contactPolicy.arrowToGraphicRatioMax ?? NaN);
  if (Number.isFinite(maxArrowRatio) && r.contactArrow?.found && r.contactGraphic?.found && r.contactGraphic.width > 0) {
    const ratio = r.contactArrow.width / r.contactGraphic.width;
    if (ratio > maxArrowRatio + 0.0001) {
      addIssue(issues, 'FAIL', 'HERO_WIDE_CONTACT_ARROW_RATIO', 'Contact arrow is too large relative to its ring.', {
        actualRatio: round(ratio),
        allowedMaximumRatio: round(maxArrowRatio),
        arrowWidth: round(r.contactArrow.width),
        contactGraphicWidth: round(r.contactGraphic.width),
      });
    }
  }

  const checkMinimum = (code, label, actual, reference) => {
    if (!Number.isFinite(actual) || !Number.isFinite(reference)) return;
    const required = reference * allowedScale;
    if (actual + 0.01 < required) {
      addIssue(issues, 'FAIL', `HERO_WIDE_SCALE_${code}`, `${label} is visually underscaled for this wide-desktop geometry.`, {
        actual: round(actual),
        reference: round(reference),
        requiredScale: round(requiredScale),
        toleranceRatio: round(toleranceRatio),
        requiredMinimum: round(required),
      });
    }
  };

  checkMinimum('TITLE', 'Hero title', metrics.fontSizes?.heroTitle, Number(refs.heroTitleFont));
  checkMinimum('CERT_TITLE', 'Certification heading', metrics.fontSizes?.certificationTitle, Number(refs.certificationTitleFont));
  checkMinimum('CERT_COPY', 'Certification copy', metrics.fontSizes?.certificationCopy, Number(refs.certificationCopyFont));
  checkMinimum('CERT_ICON', 'Certification icon', r.certificationIcon?.width, Number(refs.certificationIcon));
  checkMinimum('SCROLL', 'Scroll indicator', r.scrollGraphic?.width, Number(refs.scroll));
  checkMinimum('BUBBLE_FONT', 'Speech bubble text', metrics.fontSizes?.bubble, Number(refs.bubbleFont));
  checkMinimum('BUBBLE_AVATAR', 'Speech bubble avatar', r.bubbleAvatar?.width, Number(refs.bubbleAvatar));
  checkMinimum('SOCIAL_ICON', 'Social icon', r.socialIcon?.width, Number(refs.socialIcon));
  checkMinimum('SOCIAL_TEXT', 'FOLLOW ME text', metrics.fontSizes?.socialsText, Number(refs.socialsTextFont));
  checkMinimum('CONTACT', 'Contact control', r.contactGraphic?.width, Number(refs.contactGraphic));

  if (r.hImgImage?.found && r.hero?.found && r.hero.height > 0) {
    let minRatio = Number(scalePolicy.portraitHeightRatioMin ?? 0.75);
    const shortUltra = scalePolicy.shortUltrawide || {};
    const superUltra = scalePolicy.superUltrawide || {};

    if (
      testCase.width >= Number(shortUltra.minWidth ?? Infinity) &&
      testCase.height <= Number(shortUltra.maxHeight ?? -Infinity)
    ) {
      minRatio = Math.max(minRatio, Number(shortUltra.portraitHeightRatioMin ?? minRatio));
    }
    if (
      testCase.width >= Number(superUltra.minWidth ?? Infinity) &&
      testCase.height <= Number(superUltra.maxHeight ?? -Infinity)
    ) {
      minRatio = Math.max(minRatio, Number(superUltra.portraitHeightRatioMin ?? minRatio));
    }

    const actualRatio = r.hImgImage.height / r.hero.height;
    if (actualRatio + 0.002 < minRatio) {
      addIssue(issues, 'FAIL', 'HERO_WIDE_SCALE_PORTRAIT', 'Hero portrait is too small relative to the wide-desktop viewport height.', {
        actualHeightRatio: round(actualRatio),
        requiredMinimumRatio: round(minRatio),
        imageHeight: round(r.hImgImage.height),
        heroHeight: round(r.hero.height),
      });
    }
  }

  return issues;
};

const absoluteIssues = (testCase, metrics) => {
  const issues = [];
  const r = metrics.rects;
  const viewportTolerance = Number(thresholds.viewportContainmentTolerancePx ?? 2);
  const overflowTolerance = Number(thresholds.horizontalOverflowTolerancePx ?? 2);
  const imageBottomTolerance = Number(thresholds.imageBottomAnchorTolerancePx ?? 3);
  const insetSymmetryTolerance = Number(thresholds.desktopInsetSymmetryTolerancePx ?? 2);
  const minimumDesktopInset = Number(thresholds.minimumDesktopHeroInsetPx ?? 16);

  const caseOrientation =
    testCase.orientation ||
    (testCase.width >= testCase.height ? 'landscape' : 'portrait');

  const bubbleIntentionallyHidden =
    (
      caseOrientation === 'portrait' &&
      testCase.width <= 500 &&
      testCase.height <= 680
    ) ||
    (
      caseOrientation === 'landscape' &&
      testCase.width <= 1100 &&
      testCase.height <= 240
    );

  const required = [
    'hero', 'heroTitle', 'certifications', 'scroll', 'hImg',
    'hImgImage', 'canvas', 'socialsVisual', 'contact',
    ...(!bubbleIntentionallyHidden ? ['bubble'] : [])
  ];

  for (const key of required) {
    const item = r[key];
    if (!item?.found) {
      addIssue(issues, 'FAIL', `MISSING_${key.toUpperCase()}`, `${key} is missing.`);
      continue;
    }
    if (
      item.display === 'none' || item.visibility === 'hidden' ||
      item.opacity === 0 || item.width <= 0 || item.height <= 0
    ) {
      addIssue(issues, 'FAIL', `HIDDEN_${key.toUpperCase()}`, `${key} is not visibly laid out.`, item);
    }
  }

  if (
    metrics.document.scrollWidth > testCase.width + overflowTolerance ||
    (
      metrics.document.bodyScrollWidth != null &&
      metrics.document.bodyScrollWidth > testCase.width + overflowTolerance
    )
  ) {
    addIssue(issues, 'FAIL', 'HORIZONTAL_OVERFLOW', 'The document is wider than the certification viewport.', {
      viewportWidth: testCase.width,
      documentScrollWidth: metrics.document.scrollWidth,
      bodyScrollWidth: metrics.document.bodyScrollWidth,
      tolerance: overflowTolerance,
    });
  }

  if (r.hero?.found) {
    if (r.heroHost?.found) {
      const hostDelta = {
        left: Math.abs(r.hero.left - r.heroHost.left),
        right: Math.abs(r.hero.right - r.heroHost.right),
        width: Math.abs(r.hero.width - r.heroHost.width),
      };
      if (
        hostDelta.left > viewportTolerance ||
        hostDelta.right > viewportTolerance ||
        hostDelta.width > viewportTolerance
      ) {
        addIssue(issues, 'FAIL', 'HERO_HOST_WIDTH', 'Hero does not fill its containing section.', {
          hero: r.hero,
          heroHost: r.heroHost,
          delta: hostDelta,
          tolerance: viewportTolerance,
        });
      }
    }

    if (String(testCase.group || '').startsWith('desktop-')) {
      const leftInset = r.hero.left;
      const rightInset = testCase.width - r.hero.right;
      const insetDelta = Math.abs(leftInset - rightInset);

      if (insetDelta > insetSymmetryTolerance) {
        addIssue(issues, 'FAIL', 'HERO_HORIZONTAL_INSET_ASYMMETRY', 'Desktop Hero left/right viewport insets are not symmetric.', {
          leftInset: round(leftInset),
          rightInset: round(rightInset),
          delta: round(insetDelta),
          tolerance: insetSymmetryTolerance,
        });
      }

      if (Math.min(leftInset, rightInset) < minimumDesktopInset - viewportTolerance) {
        addIssue(issues, 'FAIL', 'HERO_MINIMUM_VIEWPORT_INSET', 'Desktop Hero is too close to a viewport edge.', {
          leftInset: round(leftInset),
          rightInset: round(rightInset),
          requiredMinimum: minimumDesktopInset,
          tolerance: viewportTolerance,
        });
      }
    }

    const visibleHeight = metrics.viewport.visualHeight ?? metrics.viewport.innerHeight;
    if (Math.abs(r.hero.height - visibleHeight) > Math.max(viewportTolerance, 4)) {
      addIssue(issues, 'REVIEW', 'HERO_VISIBLE_HEIGHT_DELTA', 'Hero height differs from the visual viewport.', {
        heroHeight: r.hero.height,
        visualViewportHeight: visibleHeight,
      });
    }

    for (const key of ['heroTitle', 'certifications', 'scroll', 'bubble', 'socialsVisual', 'contact']) {
      const item = r[key];
      if (!item?.found) continue;
      if (
        item.display === 'none' || item.visibility === 'hidden' ||
        item.opacity === 0 || item.width <= 0 || item.height <= 0
      ) continue;
      const outside =
        item.left < r.hero.left - viewportTolerance ||
        item.right > r.hero.right + viewportTolerance ||
        item.top < r.hero.top - viewportTolerance ||
        item.bottom > r.hero.bottom + viewportTolerance;

      if (outside) {
        addIssue(issues, 'FAIL', `${key.toUpperCase()}_OUTSIDE_HERO`, `${key} extends outside the Hero.`, {
          item, hero: r.hero, tolerance: viewportTolerance,
        });
      }
    }
  }

  if (r.hImgImage?.found && r.hero?.found) {
    const bottomDelta = Math.abs(r.hImgImage.bottom - r.hero.bottom);
    if (bottomDelta > imageBottomTolerance) {
      addIssue(issues, 'REVIEW', 'HIMG_BOTTOM_ANCHOR', 'Hero portrait is not visually bottom-anchored.', {
        bottomDelta, tolerance: imageBottomTolerance, image: r.hImgImage, hero: r.hero,
      });
    }
  }

  if (
    metrics.canvasBackingStore &&
    (metrics.canvasBackingStore.width <= 0 || metrics.canvasBackingStore.height <= 0)
  ) {
    addIssue(issues, 'FAIL', 'CANVAS_BACKING_STORE_ZERO', 'Three.js canvas has a zero-sized backing store.', metrics.canvasBackingStore);
  }

  /*
   * Do not CSS-transform the WebGL surface in the wide-desktop composition.
   * The V1-V3 screenshots proved that this can produce a fully laid-out,
   * non-zero canvas that WebKit nevertheless omits from the final composite.
   * Scale the scene or its canvas box geometrically instead.
   */
  if (
    testCase.group === 'desktop-wide' &&
    metrics.canvasComputedStyle?.transform &&
    metrics.canvasComputedStyle.transform !== 'none'
  ) {
    addIssue(
      issues,
      'FAIL',
      'WEBGL_CANVAS_CSS_TRANSFORM',
      'Wide-desktop WebGL canvas must not use a CSS transform; WebKit can drop the composited layer.',
      metrics.canvasComputedStyle
    );
  }

  const collisions = [
    ['TITLE_CERTIFICATIONS', r.heroTitle, r.certifications],
    ['BUBBLE_SOCIALS', r.bubble, r.socialsVisual],
    ['BUBBLE_CONTACT', r.bubble, r.contact],
    ['CERTIFICATIONS_SCROLL', r.certifications, r.scroll],
  ];

  for (const [code, a, b] of collisions) {
    const area = rectIntersectionArea(a, b);
    if (area > 1) {
      addIssue(issues, 'FAIL', `${code}_COLLISION`, `${code.replaceAll('_', ' ')} collision detected.`, {
        intersectionArea: round(area), a, b,
      });
    }
  }

  issues.push(...wideDesktopVisualIssues(testCase, metrics));

  return issues;
};

const compareToChromium = (testCase, baseline, current) => {
  const issues = [];
  if (!baseline) return issues;

  const maxDimension = Math.max(testCase.width, testCase.height);
  const reviewLimit = Math.max(
    Number(thresholds.crossBrowserGeometryReviewPx ?? 5),
    maxDimension * Number(thresholds.crossBrowserGeometryReviewRatio ?? 0.008)
  );
  const failLimit = Math.max(
    Number(thresholds.crossBrowserGeometryFailPx ?? 14),
    maxDimension * Number(thresholds.crossBrowserGeometryFailRatio ?? 0.02)
  );

  const geometrySpec = {
    heroTitle: ['left', 'top', 'height'],
    certifications: ['left', 'top', 'height'],
    scroll: ['left', 'top', 'width', 'height'],
    hImgImage: ['left', 'top', 'width', 'height', 'bottom'],
    canvas: ['left', 'top', 'width', 'height'],
    bubble: ['left', 'top', 'width', 'height'],
    socialsVisual: ['left', 'top', 'width', 'height'],
    contact: ['left', 'top', 'width', 'height'],
  };

  for (const [key, properties] of Object.entries(geometrySpec)) {
    const a = baseline.rects[key];
    const b = current.rects[key];
    if (!a?.found || !b?.found) continue;

    let maxDelta = 0;
    let maxProperty = null;
    for (const property of properties) {
      const delta = Math.abs(Number(a[property]) - Number(b[property]));
      if (delta > maxDelta) {
        maxDelta = delta;
        maxProperty = property;
      }
    }

    if (maxDelta > failLimit) {
      addIssue(issues, 'FAIL', `CROSS_BROWSER_${key.toUpperCase()}_GEOMETRY`,
        `${key} differs materially from Chromium (${maxProperty} Δ ${maxDelta.toFixed(1)}px).`, {
          maxDelta: round(maxDelta), maxProperty,
          reviewLimit: round(reviewLimit), failLimit: round(failLimit),
          chromium: a, current: b,
        });
    } else if (maxDelta > reviewLimit) {
      addIssue(issues, 'REVIEW', `CROSS_BROWSER_${key.toUpperCase()}_GEOMETRY`,
        `${key} differs from Chromium (${maxProperty} Δ ${maxDelta.toFixed(1)}px).`, {
          maxDelta: round(maxDelta), maxProperty,
          reviewLimit: round(reviewLimit), failLimit: round(failLimit),
          chromium: a, current: b,
        });
    }
  }

  for (const key of Object.keys(baseline.lineCounts || {})) {
    const a = baseline.lineCounts[key];
    const b = current.lineCounts[key];
    if (Number.isFinite(a) && Number.isFinite(b) && a !== b) {
      addIssue(issues, 'FAIL', `CROSS_BROWSER_${key.toUpperCase()}_WRAP`,
        `${key} wraps differently from Chromium (${a} vs ${b} lines).`, {
          chromium: a, current: b,
        });
    }
  }

  const fontTolerance = Number(thresholds.computedFontSizeTolerancePx ?? 0.25);
  for (const key of Object.keys(baseline.fontSizes || {})) {
    const a = baseline.fontSizes[key];
    const b = current.fontSizes[key];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const delta = Math.abs(a - b);
    if (delta > fontTolerance) {
      addIssue(issues, 'FAIL', `CROSS_BROWSER_${key.toUpperCase()}_FONT_SIZE`,
        `${key} computed font size differs from Chromium by ${delta.toFixed(2)}px.`, {
          chromium: a, current: b, tolerance: fontTolerance,
        });
    }
  }

  return issues;
};

const screenshotFor = async (page, browserName, testCase, status) => {
  if (screenshotMode === 'none') return null;
  if (screenshotMode === 'bad' && status === 'PASS') return null;

  const parent = status === 'PASS' ? goodDir : badDir;
  const browserDir = path.join(parent, browserName);
  ensureDir(browserDir);

  const filename =
    `${status}__${sanitize(testCase.group)}__${testCase.width}x${testCase.height}__${sanitize(testCase.id)}.png`;
  const fullPath = path.join(browserDir, filename);

  await page.screenshot({ path: fullPath, fullPage: false });
  return path.relative(root, fullPath);
};

const main = async () => {
  cleanDir(outDir);
  ensureDir(goodDir);
  ensureDir(badDir);

  let serverChild = null;
  const openBrowsers = [];

  try {
    let playwright;
    try {
      playwright = require('playwright');
    } catch (error) {
      console.error('Playwright is not installed. Run npm install first.');
      throw error;
    }

    const viteRoot = buildStaticCandidateRoot();
    const server = await startVite(viteRoot);
    serverChild = server.child;

    console.log(
      `Hero final certification: ${cases.length} viewport cases × ${requestedBrowsers.length} browsers = ${cases.length * requestedBrowsers.length} runs.`
    );
    console.log(`Base URL: ${server.baseUrl}`);
    console.log(`Browsers: ${requestedBrowsers.join(', ')}`);
    console.log(`Group: ${groupFilter}`);
    console.log(`Output: ${path.relative(root, outDir) || '.'}`);
    if (overrideCssPath) {
      console.log(`Override CSS: ${path.relative(root, overrideCssPath)}`);
      console.log('Override mode: static/pre-start (candidate appended to temporary hero.css before Vite/React/Three.js startup)');
    }

    const baselineByCase = new Map();
    const results = [];

    for (const browserName of requestedBrowsers) {
      const browserType = playwright[browserName];
      let browser;

      try {
        browser = await browserType.launch({ headless: true });
      } catch (error) {
        console.error(`Unable to launch ${browserName}.`);
        console.error('Install the Playwright browser binaries with:');
        console.error('  npx playwright install chromium firefox webkit');
        throw error;
      }

      openBrowsers.push(browser);

      for (let index = 0; index < cases.length; index += 1) {
        const testCase = cases[index];

        /*
         * Use a fresh browser context/page for every viewport. In WebKit,
         * resizing a live React Three Fiber/WebGL page can clear the canvas
         * backing surface without reliably repainting it in time for capture.
         * Starting at the target geometry also makes matchMedia and responsive
         * initialization deterministic for each certification case.
         */
        const context = await browser.newContext({
          viewport: { width: testCase.width, height: testCase.height },
          deviceScaleFactor: 1,
        });
        const page = await context.newPage();
        const url = `${server.baseUrl}/?qa=1&qaOverlay=0&qaSpeech=longest`;

        try {
          await page.goto(url, { waitUntil: 'networkidle' });
          await page.waitForSelector('.hero', { state: 'attached' });
          await page.waitForFunction(() => {
            const img = document.querySelector('.hImg img');
            return Boolean(img && img.complete && img.naturalWidth > 0);
          });
          await page.evaluate(() => document.fonts?.ready);
          await page.waitForTimeout(2600);

          await page.addStyleTag({
            content: `
              .contactButton { transform: none !important; }
              .scroll { transform: none !important; opacity: 1 !important; }
            `,
          });

          await page.evaluate(async () => {
            window.scrollTo(0, 0);
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve))
            );
          });
          await page.waitForTimeout(180);

          const metrics = await captureLayout(page);
          let issues = absoluteIssues(testCase, metrics);

          if (browserName === baselineBrowser) {
            baselineByCase.set(testCase.id, metrics);
          } else if (baselineByCase.has(testCase.id)) {
            issues = issues.concat(
              compareToChromium(testCase, baselineByCase.get(testCase.id), metrics)
            );
          }

          const status = finishStatus(issues);
          const screenshotPath = await screenshotFor(page, browserName, testCase, status);

          results.push({
            browser: browserName,
            caseId: testCase.id,
            group: testCase.group,
            family: testCase.family || 'desktop',
            label: testCase.label,
            width: testCase.width,
            height: testCase.height,
            orientation: testCase.width >= testCase.height ? 'landscape' : 'portrait',
            status,
            issues,
            metrics,
            screenshotPath,
          });
        } finally {
          await context.close();
        }

        if ((index + 1) % 5 === 0 || index + 1 === cases.length) {
          console.log(`  ${browserName}: tested ${index + 1}/${cases.length}`);
        }
      }

      await browser.close();
      const at = openBrowsers.indexOf(browser);
      if (at >= 0) openBrowsers.splice(at, 1);
    }

    const summary = {
      totalRuns: results.length,
      viewportCases: cases.length,
      browsers: requestedBrowsers.length,
      pass: results.filter((r) => r.status === 'PASS').length,
      review: results.filter((r) => r.status === 'REVIEW').length,
      fail: results.filter((r) => r.status === 'FAIL').length,
      byBrowser: {},
      byGroup: {},
    };

    for (const browserName of requestedBrowsers) {
      const subset = results.filter((r) => r.browser === browserName);
      summary.byBrowser[browserName] = {
        total: subset.length,
        pass: subset.filter((r) => r.status === 'PASS').length,
        review: subset.filter((r) => r.status === 'REVIEW').length,
        fail: subset.filter((r) => r.status === 'FAIL').length,
      };
    }

    for (const groupName of Object.keys(groups)) {
      const subset = results.filter((r) => r.group === groupName);
      if (!subset.length) continue;
      summary.byGroup[groupName] = {
        total: subset.length,
        pass: subset.filter((r) => r.status === 'PASS').length,
        review: subset.filter((r) => r.status === 'REVIEW').length,
        fail: subset.filter((r) => r.status === 'FAIL').length,
      };
    }

    const caseSummary = cases.map((testCase) => {
      const subset = results.filter((r) => r.caseId === testCase.id);
      const worst = subset.reduce(
        (current, item) =>
          statusRank[item.status] > statusRank[current] ? item.status : current,
        'PASS'
      );

      return {
        caseId: testCase.id,
        group: testCase.group,
        width: testCase.width,
        height: testCase.height,
        label: testCase.label,
        status: worst,
        browsers: Object.fromEntries(subset.map((item) => [item.browser, item.status])),
      };
    });

    const issueCounts = new Map();
    for (const result of results) {
      for (const issue of result.issues) {
        issueCounts.set(issue.code, (issueCounts.get(issue.code) || 0) + 1);
      }
    }
    const topIssues = [...issueCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([code, count]) => ({ code, count }));

    const report = {
      artifactType: 'hero-cross-browser-certification',
      generatedAt: new Date().toISOString(),
      source: {
        contractPath: path.relative(root, contractPath),
        baseUrl: server.baseUrl,
        baselineBrowser,
        overrideCssPath: overrideCssPath ? path.relative(root, overrideCssPath) : null,
        overrideCssMode: overrideCssPath ? 'static-pre-start' : null,
      },
      mode: {
        group: groupFilter,
        requestedBrowsers,
        screenshotMode,
        outputDir: path.relative(root, outDir),
        strict: strictExit,
      },
      summary,
      caseSummary,
      topIssues,
      results,
    };

    fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2) + '\n');

    const md = [];
    md.push('# Hero Final Cross-Browser Certification', '');
    md.push(`Generated: ${report.generatedAt}`, '');
    md.push('## Summary', '');
    md.push(`- Viewport cases: **${summary.viewportCases}**`);
    md.push(`- Browsers: **${summary.browsers}** (${requestedBrowsers.join(', ')})`);
    md.push(`- Total browser × viewport runs: **${summary.totalRuns}**`);
    md.push(`- PASS: **${summary.pass}**`);
    md.push(`- REVIEW: **${summary.review}**`);
    md.push(`- FAIL: **${summary.fail}**`, '');

    md.push('## By browser', '');
    md.push('| Browser | Total | PASS | REVIEW | FAIL |');
    md.push('| --- | ---: | ---: | ---: | ---: |');
    for (const browserName of requestedBrowsers) {
      const row = summary.byBrowser[browserName];
      md.push(`| ${browserName} | ${row.total} | ${row.pass} | ${row.review} | ${row.fail} |`);
    }

    md.push('', '## By group', '');
    md.push('| Group | Total | PASS | REVIEW | FAIL |');
    md.push('| --- | ---: | ---: | ---: | ---: |');
    for (const [groupName, row] of Object.entries(summary.byGroup)) {
      md.push(`| ${groupName} | ${row.total} | ${row.pass} | ${row.review} | ${row.fail} |`);
    }

    md.push('', '## Viewport certification', '');
    md.push('| Status | Group | Viewport | Case | Chromium | Firefox | WebKit |');
    md.push('| --- | --- | ---: | --- | --- | --- | --- |');
    for (const item of caseSummary) {
      md.push(
        `| ${item.status} | ${item.group} | ${item.width}×${item.height} | ${item.caseId} | ` +
        `${item.browsers.chromium || '—'} | ${item.browsers.firefox || '—'} | ${item.browsers.webkit || '—'} |`
      );
    }

    md.push('', '## Top issues', '');
    if (!topIssues.length) {
      md.push('No issues.');
    } else {
      for (const issue of topIssues) md.push(`- ${issue.code}: ${issue.count}`);
    }

    md.push('', '## Non-pass runs', '');
    const nonPass = results.filter((r) => r.status !== 'PASS');
    if (!nonPass.length) {
      md.push('All browser × viewport runs passed.');
    } else {
      md.push('| Status | Browser | Viewport | Case | Issues | Screenshot |');
      md.push('| --- | --- | ---: | --- | --- | --- |');
      for (const result of nonPass) {
        md.push(
          `| ${result.status} | ${result.browser} | ${result.width}×${result.height} | ${result.caseId} | ` +
          `${result.issues.map((issue) => issue.code).join(', ')} | ${result.screenshotPath || '—'} |`
        );
      }
    }
    fs.writeFileSync(mdOut, md.join('\n') + '\n');

    const csvRows = [[
      'browser', 'status', 'group', 'family', 'caseId',
      'width', 'height', 'orientation', 'issueCodes', 'screenshotPath'
    ]];
    for (const result of results) {
      csvRows.push([
        result.browser,
        result.status,
        result.group,
        result.family,
        result.caseId,
        result.width,
        result.height,
        result.orientation,
        result.issues.map((issue) => issue.code).join('|'),
        result.screenshotPath || '',
      ]);
    }
    fs.writeFileSync(
      csvOut,
      csvRows.map((row) => row.map(csvEscape).join(',')).join('\n') + '\n'
    );

    console.log('');
    console.log('Hero final certification complete.');
    console.log(
      `Total runs: ${summary.totalRuns} | PASS ${summary.pass} | REVIEW ${summary.review} | FAIL ${summary.fail}`
    );
    console.log(`JSON: ${path.relative(root, jsonOut)}`);
    console.log(`Markdown: ${path.relative(root, mdOut)}`);
    console.log(`CSV: ${path.relative(root, csvOut)}`);
    console.log(`Good screenshots: ${path.relative(root, goodDir)}`);
    console.log(`Bad/review screenshots: ${path.relative(root, badDir)}`);

    const shouldFail = summary.fail > 0 || (strictExit && summary.review > 0);
    if (shouldFail) process.exitCode = 1;
  } finally {
    for (const browser of openBrowsers) {
      try { await browser.close(); } catch {}
    }
    if (serverChild) serverChild.kill();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
