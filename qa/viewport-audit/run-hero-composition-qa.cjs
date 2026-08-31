const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');

const root = process.cwd();
const registryPath = path.join(root, 'qa-results', 'testmu', 'catalog', 'TESTMU__geometry-registry__us__latest.json');
const contractPath = path.join(root, 'qa', 'viewport-audit', 'hero-composition-contract.json');
const outDir = path.join(root, 'qa-results', 'hero-composition');
const screenshotDir = path.join(outDir, 'screenshots');
const jsonOut = path.join(outDir, 'hero-composition-report.json');
const mdOut = path.join(outDir, 'hero-composition-report.md');
const csvOut = path.join(outDir, 'hero-composition-cases.csv');

const argv = process.argv.slice(2);
const argValue = (name) => {
  const prefix = `--${name}=`;
  const match = argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
};
const hasFlag = (name) => argv.includes(`--${name}`);

const orientationFilter = argValue('orientation') || 'both';
const quickMode = hasFlag('quick');
const measuredOnly = hasFlag('measured-only');
const strictExit = hasFlag('strict');
const maxScreenshots = Number(argValue('max-screenshots') || 24);
const screenshotMode = argValue('screenshots') || 'problems';
const overrideCssPathRaw = argValue('override-css') || process.env.QA_HERO_OVERRIDE_CSS || null;
const explicitBaseUrl = argValue('base-url') || process.env.QA_BASE_URL || null;
const minWidthFilter = Number(argValue('min-width') || 0) || null;
const maxWidthFilter = Number(argValue('max-width') || 0) || null;
const minHeightFilter = Number(argValue('min-height') || 0) || null;
const maxHeightFilter = Number(argValue('max-height') || 0) || null;

const normalizeName = (value = '') => String(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const isFoldable = (name) => /(fold|flip|surface\s*duo)/i.test(name || '');
const isTablet = (name) => /(ipad|tablet|galaxy\s*tab|matepad)/i.test(name || '');
const round = (value) => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
const clampScore = (value) => Math.max(0, Math.min(100, value));

const csvEscape = (value) => {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const bandForHeight = (bands, height) => {
  const match = bands.find((band) =>
    (band.minHeight == null || height >= band.minHeight) &&
    (band.maxHeight == null || height <= band.maxHeight)
  );
  return match?.id || 'UNCLASSIFIED';
};

const addIssue = (issues, severity, code, message, details = null) => {
  issues.push({ severity, code, message, details });
};

const evaluateGap = (issues, label, value, policy) => {
  if (value == null) return;
  if (value < policy.hardMin) {
    addIssue(issues, 'FAIL', `${label}_OVERLAP`, `${label} overlaps by ${Math.abs(value).toFixed(1)}px.`, { value, policy });
    return;
  }
  if (value < policy.idealMin) {
    addIssue(issues, 'REVIEW', `${label}_TIGHT`, `${label} is tight at ${value.toFixed(1)}px.`, { value, policy });
    return;
  }
  if (value > policy.reviewMax) {
    addIssue(issues, 'REVIEW', `${label}_TOO_LARGE`, `${label} is too large at ${value.toFixed(1)}px.`, { value, policy });
    return;
  }
  if (value > policy.idealMax) {
    addIssue(issues, 'REVIEW', `${label}_LOOSE`, `${label} is loose at ${value.toFixed(1)}px.`, { value, policy });
  }
};

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

if (!fs.existsSync(registryPath)) {
  console.error(`Missing TestMU registry: ${registryPath}`);
  process.exit(1);
}
if (!fs.existsSync(contractPath)) {
  console.error(`Missing composition contract: ${contractPath}`);
  process.exit(1);
}

const registry = readJson(registryPath);
const contract = readJson(contractPath);

const overrideCssPath = overrideCssPathRaw
  ? path.resolve(root, overrideCssPathRaw)
  : null;
const overrideCss = overrideCssPath
  ? fs.readFileSync(overrideCssPath, 'utf8')
  : null;

const eligibleCapture = (capture) => {
  const year = capture.releaseYear;
  const viewport = capture.innerViewport || {};
  const orientation = capture.cssMediaOrientation || capture.cssOrientation;
  const name = capture.deviceName || '';

  if (!Number.isFinite(year) || year < contract.scope.releaseYearMin || year > contract.scope.releaseYearMax) return false;
  if (isFoldable(name) || isTablet(name)) return false;
  if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height)) return false;
  if (!['portrait', 'landscape'].includes(orientation)) return false;
  if (orientation === 'portrait' && viewport.width > contract.scope.portraitMaxPhoneWidth) return false;
  if (orientation === 'landscape' && viewport.height > contract.scope.landscapeMaxPhoneHeight) return false;
  return true;
};

const geometryMap = new Map();
for (const capture of registry.captures || []) {
  if (!eligibleCapture(capture)) continue;
  const orientation = capture.cssMediaOrientation || capture.cssOrientation;
  const width = Math.round(capture.innerViewport.width);
  const height = Math.round(capture.innerViewport.height);
  const key = `${orientation}|${width}x${height}`;
  if (!geometryMap.has(key)) {
    geometryMap.set(key, {
      id: `measured-${orientation}-${width}x${height}`,
      source: 'MEASURED',
      orientation,
      width,
      height,
      labels: [],
      devices: new Set(),
      browsers: new Set(),
    });
  }
  const item = geometryMap.get(key);
  item.devices.add(capture.deviceName || 'Unknown device');
  item.browsers.add(`${capture.platformName || 'Unknown'} ${capture.browserName || 'Unknown'}`);
}

const cases = [...geometryMap.values()].map((item) => ({
  ...item,
  devices: [...item.devices].sort(),
  browsers: [...item.browsers].sort(),
  label: [...item.devices].slice(0, 3).join(', '),
}));

const addSynthetic = (candidate) => {
  const key = `${candidate.orientation}|${candidate.width}x${candidate.height}`;
  const existing = cases.find((item) => `${item.orientation}|${item.width}x${item.height}` === key);
  if (existing) {
    if (candidate.label && !existing.labels.includes(candidate.label)) existing.labels.push(candidate.label);
    return;
  }
  cases.push({
    id: `synthetic-${candidate.orientation}-${candidate.width}x${candidate.height}`,
    source: 'SYNTHETIC',
    orientation: candidate.orientation,
    width: candidate.width,
    height: candidate.height,
    label: candidate.label || 'synthetic probe',
    labels: candidate.label ? [candidate.label] : [],
    devices: [],
    browsers: [],
  });
};

if (!measuredOnly) {
  for (const sentinel of contract.synthetic.sentinels || []) addSynthetic(sentinel);

  if (!quickMode) {
    for (const width of contract.synthetic.portraitWidths || []) {
      for (const boundary of contract.synthetic.portraitBoundaries || []) {
        for (const offset of contract.synthetic.fuzzOffsets || []) {
          addSynthetic({
            width,
            height: boundary + offset,
            orientation: 'portrait',
            label: `portrait ${boundary}px boundary ${offset >= 0 ? '+' : ''}${offset}`,
          });
        }
      }
    }
    for (const width of contract.synthetic.landscapeWidths || []) {
      for (const boundary of contract.synthetic.landscapeBoundaries || []) {
        for (const offset of contract.synthetic.fuzzOffsets || []) {
          addSynthetic({
            width,
            height: boundary + offset,
            orientation: 'landscape',
            label: `landscape ${boundary}px boundary ${offset >= 0 ? '+' : ''}${offset}`,
          });
        }
      }
    }
  }
}

let filteredCases = cases.filter((item) => {
  if (orientationFilter !== 'both' && item.orientation !== orientationFilter) return false;
  if (minWidthFilter != null && item.width < minWidthFilter) return false;
  if (maxWidthFilter != null && item.width > maxWidthFilter) return false;
  if (minHeightFilter != null && item.height < minHeightFilter) return false;
  if (maxHeightFilter != null && item.height > maxHeightFilter) return false;
  return true;
});
if (quickMode) {
  const sentinels = new Set((contract.synthetic.sentinels || []).map((item) => `${item.orientation}|${item.width}x${item.height}`));
  filteredCases = filteredCases.filter((item) => item.source === 'MEASURED' && sentinels.has(`${item.orientation}|${item.width}x${item.height}`) || item.source === 'SYNTHETIC');
}
filteredCases.sort((a, b) => a.orientation.localeCompare(b.orientation) || a.height - b.height || a.width - b.width);

const findFreePort = (start = 4173) => new Promise((resolve, reject) => {
  const tryPort = (port) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => {
      if (port >= start + 20) reject(new Error('Could not find a free local port for Vite.'));
      else tryPort(port + 1);
    });
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(port));
    });
  };
  tryPort(start);
});

const waitForHttp = (url, timeoutMs = 30000) => new Promise((resolve, reject) => {
  const started = Date.now();
  const attempt = () => {
    const req = http.get(url, (res) => {
      res.resume();
      if (res.statusCode && res.statusCode < 500) return resolve();
      retry();
    });
    req.setTimeout(1500, () => req.destroy());
    req.on('error', retry);
  };
  const retry = () => {
    if (Date.now() - started > timeoutMs) return reject(new Error(`Timed out waiting for ${url}`));
    setTimeout(attempt, 250);
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
  let viteLog = '';
  child.stdout.on('data', (chunk) => { viteLog += chunk.toString(); });
  child.stderr.on('data', (chunk) => { viteLog += chunk.toString(); });
  child.on('exit', (code) => {
    if (code && code !== 0) console.error(`Vite exited with code ${code}.\n${viteLog}`);
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHttp(baseUrl);
  return { baseUrl, child };
};

const captureDom = async (page) => page.evaluate(() => {
  const rect = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      found: true,
      display: cs.display,
      visibility: cs.visibility,
      opacity: Number(cs.opacity),
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
      layoutWidth: el.offsetWidth,
      layoutHeight: el.offsetHeight,
      centerX: r.left + r.width / 2,
      centerY: r.top + r.height / 2,
      pageTop: r.top + window.scrollY,
      pageBottom: r.bottom + window.scrollY,
      pageLeft: r.left + window.scrollX,
      pageRight: r.right + window.scrollX,
    };
  };

  const textRect = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    return {
      found: true,
      display: cs.display,
      visibility: cs.visibility,
      opacity: Number(cs.opacity),
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
      layoutWidth: r.width,
      layoutHeight: r.height,
      centerX: r.left + r.width / 2,
      centerY: r.top + r.height / 2,
    };
  };

  const rectList = (selector) => [...document.querySelectorAll(selector)].map((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      found: true,
      display: cs.display,
      visibility: cs.visibility,
      opacity: Number(cs.opacity),
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
      layoutWidth: el.offsetWidth,
      layoutHeight: el.offsetHeight,
      centerX: r.left + r.width / 2,
      centerY: r.top + r.height / 2,
    };
  });

  const unionRects = (items) => {
    const visibleItems = items.filter((item) => item && item.found && item.display !== 'none' && item.visibility !== 'hidden' && item.width > 0 && item.height > 0);
    if (!visibleItems.length) return { found: false };
    const left = Math.min(...visibleItems.map((item) => item.left));
    const right = Math.max(...visibleItems.map((item) => item.right));
    const top = Math.min(...visibleItems.map((item) => item.top));
    const bottom = Math.max(...visibleItems.map((item) => item.bottom));
    return {
      found: true,
      display: 'union',
      visibility: 'visible',
      opacity: 1,
      left, right, top, bottom,
      width: right - left,
      height: bottom - top,
      centerX: (left + right) / 2,
      centerY: (top + bottom) / 2,
    };
  };

  const certificationBadgeItems = rectList('.certificationsImages img');
  const certificationTitleInk = textRect('.certifications h2');
  const certificationTextInk = textRect('.certifications p');
  const certificationBadgeUnion = unionRects(certificationBadgeItems);
  const certificationContentUnion = unionRects([certificationTitleInk, certificationTextInk, ...certificationBadgeItems]);

  const socialsAnchors = [...document.querySelectorAll('.socials > a')].map((el) => {
    const r = el.getBoundingClientRect();
    return { centerX: r.left + r.width / 2, centerY: r.top + r.height / 2, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  });

  const heroImageEl = document.querySelector('.hImg img');
  const heroImageMetrics = heroImageEl ? (() => {
    const r = heroImageEl.getBoundingClientRect();
    const cs = getComputedStyle(heroImageEl);
    const naturalWidth = heroImageEl.naturalWidth || 0;
    const naturalHeight = heroImageEl.naturalHeight || 0;
    const intrinsicRatio = naturalWidth > 0 && naturalHeight > 0
      ? naturalWidth / naturalHeight
      : null;
    const boxRatio = r.width > 0 && r.height > 0
      ? r.width / r.height
      : null;

    // Estimate the fraction of the source image discarded by object-fit: cover.
    // contain/scale-down do not crop the source image.
    let cropFraction = 0;
    let cropAxis = 'none';
    if (cs.objectFit === 'cover' && intrinsicRatio && boxRatio) {
      if (boxRatio > intrinsicRatio) {
        // Container is proportionally wider: cover crops source height.
        cropFraction = 1 - (intrinsicRatio / boxRatio);
        cropAxis = 'vertical';
      } else if (boxRatio < intrinsicRatio) {
        // Container is proportionally taller/narrower: cover crops source width.
        cropFraction = 1 - (boxRatio / intrinsicRatio);
        cropAxis = 'horizontal';
      }
    }

    return {
      naturalWidth,
      naturalHeight,
      intrinsicRatio,
      boxWidth: r.width,
      boxHeight: r.height,
      boxRatio,
      objectFit: cs.objectFit,
      objectPosition: cs.objectPosition,
      cropFraction,
      cropPercent: cropFraction * 100,
      cropAxis,
    };
  })() : null;

  const bubbleText = document.querySelector('.bubble');
  const bubbleTextMetrics = bubbleText ? (() => {
    const r = bubbleText.getBoundingClientRect();
    const cs = getComputedStyle(bubbleText);
    return {
      text: bubbleText.textContent?.trim() || '',
      clientWidth: bubbleText.clientWidth,
      scrollWidth: bubbleText.scrollWidth,
      clientHeight: bubbleText.clientHeight,
      scrollHeight: bubbleText.scrollHeight,
      whiteSpace: cs.whiteSpace,
      fontSize: cs.fontSize,
      lineHeight: cs.lineHeight,
      rectWidth: r.width,
      rectHeight: r.height,
    };
  })() : null;

  return {
    viewport: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      visualWidth: window.visualViewport?.width ?? null,
      visualHeight: window.visualViewport?.height ?? null,
      visualOffsetTop: window.visualViewport?.offsetTop ?? 0,
      visualOffsetLeft: window.visualViewport?.offsetLeft ?? 0,
      visualPageTop: window.visualViewport?.pageTop ?? window.scrollY,
      visualPageLeft: window.visualViewport?.pageLeft ?? window.scrollX,
      visualPageBottom:
        (window.visualViewport?.pageTop ?? window.scrollY) +
        (window.visualViewport?.height ?? window.innerHeight),
      visualPageRight:
        (window.visualViewport?.pageLeft ?? window.scrollX) +
        (window.visualViewport?.width ?? window.innerWidth),
      visualScale: window.visualViewport?.scale ?? 1,
      layoutToVisualBottomInset: Math.max(
        0,
        window.innerHeight -
          ((window.visualViewport?.offsetTop ?? 0) +
           (window.visualViewport?.height ?? window.innerHeight))
      ),
      devicePixelRatio: window.devicePixelRatio,
    },
    document: {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    },
    hero: rect('.hero'),
    section: rect('section:first-of-type'),
    nextSection: rect('section:nth-of-type(2)'),
    title: rect('.heroTitle'),
    certifications: rect('.certifications'),
    certificationTitle: rect('.certifications h2'),
    certificationText: rect('.certifications p'),
    certificationImages: rect('.certificationsImages'),
    certificationTitleInk,
    certificationTextInk,
    certificationBadgeItems,
    certificationBadgeUnion,
    certificationContentUnion,
    bubble: rect('.bubbleContainer'),
    bubbleText: rect('.bubble'),
    bubbleAvatar: rect('.bubbleContainer img'),
    scroll: rect('.scroll > svg'),
    socials: rect('.socials'),
    socialsAnchors,
    background: rect('.bg'),
    image: rect('.hImg'),
    contact: rect('.contactButton'),
    contactVisual: rect('.contactButton > svg'),
    contactPaint: rect('.contactButton > svg circle'),
    contactLink: rect('.contactButtonLink'),
    computed: {
      heroDisplay: getComputedStyle(document.querySelector('.hero')).display,
      heroGridTemplateRows: getComputedStyle(document.querySelector('.hero')).gridTemplateRows,
      heroVisualStart: getComputedStyle(document.querySelector('.hero')).getPropertyValue('--hero-visual-start').trim(),
      backgroundTop: getComputedStyle(document.querySelector('.bg')).top,
      backgroundBottom: getComputedStyle(document.querySelector('.bg')).bottom,
      backgroundHeight: getComputedStyle(document.querySelector('.bg')).height,
      bubbleDisplay: getComputedStyle(document.querySelector('.bubbleContainer')).display,
      scrollTransform: getComputedStyle(document.querySelector('.scroll > svg')).transform,
    },
    bubbleTextMetrics,
    heroImageMetrics,
  };
});

const visible = (box) => box?.found && box.display !== 'none' && box.visibility !== 'hidden' && box.width > 0 && box.height > 0;
const gap = (a, b) => visible(a) && visible(b) ? round(b.top - a.bottom) : null;
const edgeGap = (outer, inner, edge) => {
  if (!visible(outer) || !visible(inner)) return null;
  if (edge === 'top') return round(inner.top - outer.top);
  if (edge === 'right') return round(outer.right - inner.right);
  if (edge === 'bottom') return round(outer.bottom - inner.bottom);
  if (edge === 'left') return round(inner.left - outer.left);
  return null;
};

// 2D rectangle collision detector. This is deliberately separate from the
// ordered vertical gap checks: a viewport may satisfy the expected top/bottom
// sequence yet still have an element intrude horizontally into another one.
const overlap = (a, b) => {
  if (!visible(a) || !visible(b)) return null;
  const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (overlapX <= 0 || overlapY <= 0) return null;
  return {
    overlapX: round(overlapX),
    overlapY: round(overlapY),
    area: round(overlapX * overlapY),
    minDepth: round(Math.min(overlapX, overlapY)),
  };
};

const evaluateUnexpectedOverlap = (issues, label, a, b) => {
  const hit = overlap(a, b);
  if (!hit) return null;

  // Ignore sub-pixel / anti-aliasing contact. A shallow 1-2px intrusion is
  // review-worthy; anything deeper is a hard collision.
  if (hit.minDepth <= 1) return hit;
  if (hit.minDepth <= 2) {
    addIssue(issues, 'REVIEW', `${label}_NEAR_COLLISION`, `${label} overlaps by up to ${hit.minDepth.toFixed(1)}px.`, hit);
    return hit;
  }

  addIssue(issues, 'FAIL', `${label}_COLLISION`, `${label} has an unexpected 2D overlap (${hit.overlapX.toFixed(1)}×${hit.overlapY.toFixed(1)}px).`, hit);
  return hit;
};

const assessCase = (testCase, dom) => {
  const issues = [];
  const hero = dom.hero;
  const isPortrait = testCase.orientation === 'portrait';
  const bands = isPortrait ? contract.portrait.pressureBands : contract.landscape.pressureBands;
  const pressureBand = bandForHeight(bands, testCase.height);

  const required = ['hero', 'title', 'certifications', 'scroll', 'socials', 'background', 'image', 'contact'];
  for (const name of required) {
    if (!visible(dom[name])) addIssue(issues, 'FAIL', `MISSING_${name.toUpperCase()}`, `${name} is missing or hidden.`);
  }
  const badgeCount = (dom.certificationBadgeItems || []).filter((item) => visible(item)).length;
  if (badgeCount < 3) {
    addIssue(issues, 'FAIL', 'MISSING_CERTIFICATION_BADGES', `Expected 3 certification badges, found ${badgeCount}.`, { badgeCount });
  }

  const horizontalOverflow = dom.document.scrollWidth - dom.document.clientWidth;
  if (horizontalOverflow > 1) {
    addIssue(issues, 'FAIL', 'HORIZONTAL_OVERFLOW', `Document overflows horizontally by ${horizontalOverflow.toFixed(1)}px.`, { horizontalOverflow });
  }

  if (visible(hero)) {
    // Recruiter-facing controls/content must remain inside the Hero. The
    // full-bleed .bg/.hImg system is intentionally excluded horizontally.
    for (const name of ['title', 'certifications', 'scroll', 'socials', 'bubble']) {
      const box = dom[name];
      if (!visible(box)) continue;
      if (box.left < hero.left - 1 || box.right > hero.right + 1 || box.top < hero.top - 1 || box.bottom > hero.bottom + 1) {
        addIssue(issues, 'FAIL', `${name.toUpperCase()}_OUTSIDE_HERO`, `${name} extends outside the Hero.`);
      }
    }
  }

  // Hero/image must not spill vertically into the following section. We use
  // the section box because .bg/.hImg are intentionally full-bleed relative
  // to the narrower .hero content box.
  if (visible(dom.section) && visible(hero)) {
    if (hero.top < dom.section.top - 1 || hero.bottom > dom.section.bottom + 1) {
      addIssue(issues, 'FAIL', 'HERO_OUTSIDE_SECTION', 'Hero extends outside its section.', { hero, section: dom.section });
    }
  }
  if (visible(dom.section) && visible(dom.image)) {
    if (dom.image.top < dom.section.top - 1 || dom.image.bottom > dom.section.bottom + 1) {
      addIssue(issues, 'FAIL', 'IMAGE_VERTICAL_SPILL', 'Portrait/image extends vertically outside the Hero section.', { image: dom.image, section: dom.section });
    }
  }

  if (dom.heroImageMetrics) {
    const imagePolicy = contract.image || {};
    const cropFraction = Number(dom.heroImageMetrics.cropFraction || 0);
    const reviewAbove = Number(imagePolicy.cropReviewAboveFraction ?? 0.02);
    const failAbove = Number(imagePolicy.cropFailAboveFraction ?? 0.05);

    if (cropFraction > failAbove) {
      addIssue(
        issues,
        'FAIL',
        'HERO_IMAGE_CROPPED',
        `Hero portrait loses ${dom.heroImageMetrics.cropPercent.toFixed(1)}% of the source image on the ${dom.heroImageMetrics.cropAxis} axis.`,
        dom.heroImageMetrics
      );
    } else if (cropFraction > reviewAbove) {
      addIssue(
        issues,
        'REVIEW',
        'HERO_IMAGE_CROP_REVIEW',
        `Hero portrait crops ${dom.heroImageMetrics.cropPercent.toFixed(1)}% of the source image.`,
        dom.heroImageMetrics
      );
    }
  }

  if (dom.socialsAnchors.length >= 3 && visible(dom.socials)) {
    const centers = dom.socialsAnchors.slice(0, 3).map((item) => item.centerX);
    const spread = Math.max(...centers) - Math.min(...centers);
    const verticalOrder = dom.socialsAnchors.slice(1, 3).every((item, i) => item.centerY > dom.socialsAnchors[i].centerY);
    if (spread > contract.socials.centerXSpreadMax || !verticalOrder) {
      addIssue(issues, 'FAIL', 'SOCIALS_NOT_VERTICAL', `Social icons are not a stable vertical rail (x spread ${spread.toFixed(1)}px).`, { spread, verticalOrder });
    }
    const topGap = edgeGap(hero, dom.socials, 'top');
    const heroRightGap = edgeGap(hero, dom.socials, 'right');

    if (topGap != null && topGap > contract.socials.topReviewMax) {
      addIssue(
        issues,
        'REVIEW',
        'SOCIALS_TOO_LOW',
        `Social rail is ${topGap.toFixed(1)}px from the Hero top.`
      );
    }

    /*
     * Golden portrait contract: socials align with hero.right.
     * The remaining gap to the physical viewport is the normal page gutter.
     */
    const heroRightMax = Number(contract.socials.heroRightReviewMax ?? 4);
    if (heroRightGap != null && (heroRightGap < -1 || heroRightGap > heroRightMax)) {
      addIssue(
        issues,
        heroRightGap < -1 ? 'FAIL' : 'REVIEW',
        'SOCIALS_HERO_RIGHT_POSITION',
        `Social rail right gap from Hero is ${heroRightGap.toFixed(1)}px.`
      );
    }

    const visualRight = Number(
      dom.viewport.visualPageRight ??
      ((dom.viewport.visualPageLeft ?? 0) +
       (dom.viewport.visualWidth ?? dom.viewport.innerWidth))
    );
    const socialsRight = dom.socials.pageRight ?? dom.socials.right;
    const socialsViewportRightGap = visualRight - socialsRight;

    const viewportMin = Number(contract.socials.viewportRightIdealMin ?? 10);
    const viewportMax = Number(contract.socials.viewportRightIdealMax ?? 28);

    if (socialsViewportRightGap < -1) {
      addIssue(
        issues,
        'FAIL',
        'SOCIALS_OUTSIDE_VISUAL_VIEWPORT',
        `Social rail extends ${Math.abs(socialsViewportRightGap).toFixed(1)}px past the browser-visible right edge.`
      );
    } else if (
      socialsViewportRightGap < viewportMin ||
      socialsViewportRightGap > viewportMax
    ) {
      addIssue(
        issues,
        'REVIEW',
        'SOCIALS_VIEWPORT_GAP',
        `Social rail is ${socialsViewportRightGap.toFixed(1)}px from the browser-visible right edge.`
      );
    }
  }

  let contactRotationEnvelope = null;
  if (visible(hero) && visible(dom.contact)) {
    /*
     * The contact artwork is circular. The square Motion wrapper rotates, but
     * the painted circle remains radially symmetric. A square-diagonal check
     * is therefore visually over-conservative.
     *
     * Validate the actual painted circle against the browser-visible viewport.
     */
    const painted = visible(dom.contactPaint) ? dom.contactPaint : dom.contactVisual;

    const visualLeft = Number(dom.viewport.visualPageLeft ?? 0);
    const visualRight = Number(
      dom.viewport.visualPageRight ??
      (visualLeft + (dom.viewport.visualWidth ?? dom.viewport.innerWidth))
    );
    const visualTop = Number(dom.viewport.visualPageTop ?? 0);
    const visualBottom = Number(
      dom.viewport.visualPageBottom ??
      (visualTop + (dom.viewport.visualHeight ?? dom.viewport.innerHeight))
    );

    const paintedLeft = painted?.pageLeft ?? painted?.left;
    const paintedRight = painted?.pageRight ?? painted?.right;
    const paintedTop = painted?.pageTop ?? painted?.top;
    const paintedBottom = painted?.pageBottom ?? painted?.bottom;

    if (
      paintedLeft != null &&
      paintedRight != null &&
      paintedTop != null &&
      paintedBottom != null
    ) {
      const leftClearance = paintedLeft - visualLeft;
      const rightClearance = visualRight - paintedRight;
      const topClearance = paintedTop - visualTop;
      const bottomClearance = visualBottom - paintedBottom;
      const minClearance = Math.min(
        leftClearance,
        rightClearance,
        topClearance,
        bottomClearance
      );

      contactRotationEnvelope = {
        mode: 'painted-circle',
        leftClearance: round(leftClearance),
        rightClearance: round(rightClearance),
        topClearance: round(topClearance),
        bottomClearance: round(bottomClearance),
        minClearance: round(minClearance),
        rotationSafe: minClearance >= 0,
      };

      if (minClearance < -1) {
        addIssue(
          issues,
          'FAIL',
          'CONTACT_VISIBLE_ART_CLIPS',
          'Visible contact artwork extends outside the browser-visible viewport.',
          contactRotationEnvelope
        );
      } else if (minClearance < 0) {
        addIssue(
          issues,
          'REVIEW',
          'CONTACT_VISIBLE_ART_TIGHT',
          `Visible contact artwork reaches ${Math.abs(minClearance).toFixed(1)}px past the ideal viewport boundary.`,
          contactRotationEnvelope
        );
      }

      const contactPolicy = contract.contact || {};

      const paintedHeroRightGap =
        (hero.pageRight ?? hero.right) - paintedRight;
      const paintedHeroBottomGap =
        (hero.pageBottom ?? hero.bottom) - paintedBottom;

      const heroRightMin = Number(contactPolicy.heroRightIdealMin ?? 0);
      const heroRightMax = Number(contactPolicy.heroRightIdealMax ?? 18);
      const heroBottomMin = Number(contactPolicy.heroBottomIdealMin ?? 0);
      const heroBottomMax = Number(contactPolicy.heroBottomIdealMax ?? 36);

      if (
        paintedHeroRightGap < heroRightMin - 1 ||
        paintedHeroRightGap > heroRightMax
      ) {
        addIssue(
          issues,
          paintedHeroRightGap < -1 ? 'FAIL' : 'REVIEW',
          'CONTACT_HERO_RIGHT_POSITION',
          `Visible contact artwork is ${paintedHeroRightGap.toFixed(1)}px from the Hero right edge.`
        );
      }

      if (
        paintedHeroBottomGap < heroBottomMin - 1 ||
        paintedHeroBottomGap > heroBottomMax
      ) {
        addIssue(
          issues,
          paintedHeroBottomGap < -1 ? 'FAIL' : 'REVIEW',
          'CONTACT_HERO_BOTTOM_POSITION',
          `Visible contact artwork is ${paintedHeroBottomGap.toFixed(1)}px from the Hero bottom edge.`
        );
      }
    }
  }

  // Browser-visible viewport checks.
  // These are especially useful for modern mobile browser chrome that can
  // expand/collapse independently of the CSS layout viewport.
  const visualPolicy = contract.visualViewport || {};
  const visualPageTop = Number(dom.viewport.visualPageTop ?? 0);
  const visualPageBottom = Number(
    dom.viewport.visualPageBottom ??
    (visualPageTop + (dom.viewport.visualHeight ?? dom.viewport.innerHeight))
  );
  const heroStartTolerance = Number(visualPolicy.heroStartTolerancePx ?? 2);

  const heroAtVisibleStart =
    visible(dom.section) &&
    dom.section.pageTop != null &&
    Math.abs(dom.section.pageTop - visualPageTop) <= heroStartTolerance;

  let contactBelowVisualViewportPx = null;
  if (visible(dom.contact) && dom.contact.pageBottom != null) {
    contactBelowVisualViewportPx = round(dom.contact.pageBottom - visualPageBottom);
    const reviewPx = Number(visualPolicy.contactBelowReviewPx ?? 1);
    const failPx = Number(visualPolicy.contactBelowFailPx ?? 8);

    if (contactBelowVisualViewportPx > failPx) {
      addIssue(
        issues,
        'FAIL',
        'CONTACT_BELOW_VISUAL_VIEWPORT',
        `Contact extends ${contactBelowVisualViewportPx.toFixed(1)}px below the browser-visible viewport.`,
        { contactBelowVisualViewportPx, visualPageBottom, contact: dom.contact }
      );
    } else if (contactBelowVisualViewportPx > reviewPx) {
      addIssue(
        issues,
        'REVIEW',
        'CONTACT_VISUAL_VIEWPORT_TIGHT',
        `Contact extends ${contactBelowVisualViewportPx.toFixed(1)}px below the browser-visible viewport.`,
        { contactBelowVisualViewportPx, visualPageBottom, contact: dom.contact }
      );
    }
  }

  let nextSectionVisiblePx = null;
  if (heroAtVisibleStart && visible(dom.nextSection) && dom.nextSection.pageTop != null) {
    nextSectionVisiblePx = round(Math.max(0, visualPageBottom - dom.nextSection.pageTop));

    const reviewPx = Number(visualPolicy.nextSectionVisibleReviewPx ?? 2);
    const failPx = Number(visualPolicy.nextSectionVisibleFailPx ?? 16);

    if (nextSectionVisiblePx > failPx) {
      addIssue(
        issues,
        'FAIL',
        'NEXT_SECTION_VISIBLE_EARLY',
        `The next section is visible by ${nextSectionVisiblePx.toFixed(1)}px while Hero is aligned to the visible viewport start.`,
        { nextSectionVisiblePx, visualPageBottom, nextSection: dom.nextSection }
      );
    } else if (nextSectionVisiblePx > reviewPx) {
      addIssue(
        issues,
        'REVIEW',
        'NEXT_SECTION_PEEKING',
        `The next section peeks into the browser-visible viewport by ${nextSectionVisiblePx.toFixed(1)}px.`,
        { nextSectionVisiblePx, visualPageBottom, nextSection: dom.nextSection }
      );
    }
  }

  const metrics = {
    pressureBand,
    titleToCertifications: gap(dom.title, dom.certifications),
    certificationsToBubble: gap(dom.certifications, dom.bubble),
    bubbleToScroll: gap(dom.bubble, dom.scroll),
    certificationsToScroll: gap(dom.certifications, dom.scroll),
    scrollToImage: gap(dom.scroll, dom.image),
    heroBottomToImageBottom: visible(hero) && visible(dom.image) ? round(hero.bottom - dom.image.bottom) : null,
    heroBottomToBackgroundBottom: visible(hero) && visible(dom.background) ? round(hero.bottom - dom.background.bottom) : null,
    contactBottomGap: edgeGap(hero, dom.contact, 'bottom'),
    contactRightGap: edgeGap(hero, dom.contact, 'right'),
    contactPaint: dom.contactPaint || null,
    contactPaintHeroRightGap:
      visible(dom.contactPaint)
        ? round((hero.pageRight ?? hero.right) - (dom.contactPaint.pageRight ?? dom.contactPaint.right))
        : null,
    contactPaintHeroBottomGap:
      visible(dom.contactPaint)
        ? round((hero.pageBottom ?? hero.bottom) - (dom.contactPaint.pageBottom ?? dom.contactPaint.bottom))
        : null,
    contactRotationEnvelope,
    contactBelowVisualViewportPx,
    nextSectionVisiblePx,
    heroAtVisibleStart,
    visualViewport: {
      pageTop: visualPageTop,
      pageBottom: visualPageBottom,
      height: dom.viewport.visualHeight,
      offsetTop: dom.viewport.visualOffsetTop,
      layoutToVisualBottomInset: dom.viewport.layoutToVisualBottomInset,
    },
    imageCrop: dom.heroImageMetrics || null,
    cssState: dom.computed || null,
    unexpectedOverlaps: [],
  };

  // Pairwise collision matrix. The only intentional major overlap is the
  // contact control over the image/background. Background/image overlap is
  // also intentional. Everything below represents content that should remain
  // visually separate in the user's Hero contract.
  const portraitCollisionPairs = [
    ['TITLE_SOCIALS', dom.title, dom.socials],
    ['CERTIFICATIONS_SOCIALS', dom.certificationContentUnion, dom.socials],
    ['BUBBLE_SOCIALS', dom.bubble, dom.socials],
    ['SCROLL_SOCIALS', dom.scroll, dom.socials],
    ['TITLE_IMAGE', dom.title, dom.image],
    ['CERTIFICATIONS_IMAGE', dom.certificationContentUnion, dom.image],
    ['BUBBLE_IMAGE', dom.bubble, dom.image],
    ['TITLE_CONTACT', dom.title, dom.contact],
    ['CERTIFICATIONS_CONTACT', dom.certificationContentUnion, dom.contact],
    ['BUBBLE_CONTACT', dom.bubble, dom.contact],
    ['SCROLL_CONTACT', dom.scroll, dom.contact],
    ['SOCIALS_CONTACT', dom.socials, dom.contact],
  ];

  const landscapeCollisionPairs = [
    ['TITLE_CERTIFICATIONS', dom.title, dom.certifications],
    ['TITLE_SOCIALS', dom.title, dom.socials],
    ['TITLE_BUBBLE', dom.title, dom.bubble],
    ['TITLE_IMAGE', dom.title, dom.image],
    ['CERTIFICATIONS_SOCIALS', dom.certificationContentUnion, dom.socials],
    ['CERTIFICATIONS_BUBBLE', dom.certificationContentUnion, dom.bubble],
    ['CERTIFICATIONS_IMAGE', dom.certificationContentUnion, dom.image],
    ['BUBBLE_SOCIALS', dom.bubble, dom.socials],
    ['BUBBLE_IMAGE', dom.bubble, dom.image],
    ['SCROLL_IMAGE', dom.scroll, dom.image],
    ['SCROLL_CONTACT', dom.scroll, dom.contact],
    ['BUBBLE_CONTACT', dom.bubble, dom.contact],
    ['SOCIALS_CONTACT', dom.socials, dom.contact],
    ['TITLE_CONTACT', dom.title, dom.contact],
    ['CERTIFICATIONS_CONTACT', dom.certificationContentUnion, dom.contact],
  ];

  for (const [label, a, b] of (isPortrait ? portraitCollisionPairs : landscapeCollisionPairs)) {
    const hit = evaluateUnexpectedOverlap(issues, label, a, b);
    if (hit) metrics.unexpectedOverlaps.push({ label, ...hit });
  }

  if (isPortrait) {
    const bubbleShouldHide = contract.portrait.bubbleHiddenBands.includes(pressureBand);
    const bubbleIsVisible = visible(dom.bubble);
    if (bubbleShouldHide && bubbleIsVisible) {
      addIssue(issues, 'FAIL', 'BUBBLE_SHOULD_HIDE', `Bubble is visible in ${pressureBand}.`);
    }
    if (!bubbleShouldHide && !bubbleIsVisible) {
      addIssue(issues, 'FAIL', 'BUBBLE_SHOULD_SHOW', `Bubble is hidden in ${pressureBand}.`);
    }

    evaluateGap(issues, 'titleToCertifications', metrics.titleToCertifications, contract.portrait.gaps.titleToCertifications);
    if (bubbleIsVisible) {
      evaluateGap(issues, 'certificationsToBubble', metrics.certificationsToBubble, contract.portrait.gaps.certificationsToBubble);
      evaluateGap(issues, 'bubbleToScroll', metrics.bubbleToScroll, contract.portrait.gaps.bubbleToScroll);
    }
    evaluateGap(issues, 'scrollToImage', metrics.scrollToImage, contract.portrait.gaps.scrollToImage);

    if (bubbleIsVisible && metrics.bubbleToScroll != null && metrics.bubbleToScroll < 0) {
      addIssue(issues, 'FAIL', 'PORTRAIT_BUBBLE_SCROLL_ORDER', 'Bubble overlaps or falls below the scroll icon.');
    }
    if (metrics.scrollToImage != null && metrics.scrollToImage < 0) {
      addIssue(issues, 'FAIL', 'PORTRAIT_SCROLL_IMAGE_ORDER', 'Scroll overlaps or falls below the portrait/image start.');
    }

    if (bubbleIsVisible && contract.bubble.requireSingleLine && dom.bubbleTextMetrics) {
      const m = dom.bubbleTextMetrics;
      const nowrapFits = m.scrollWidth <= m.clientWidth + contract.bubble.horizontalTolerancePx;
      if (!nowrapFits) {
        addIssue(issues, 'FAIL', 'BUBBLE_TEXT_OVERFLOW', `Longest QA phrase exceeds bubble width by ${(m.scrollWidth - m.clientWidth).toFixed(1)}px.`, m);
      }
      if (visible(dom.bubble) && visible(hero) && (dom.bubble.left < hero.left - 1 || dom.bubble.right > hero.right + 1)) {
        addIssue(issues, 'FAIL', 'BUBBLE_OUTSIDE_HERO', 'Bubble container extends outside the Hero horizontally.');
      }
    }
  } else {
    const z = contract.landscape.zones;
    if (visible(hero)) {
      const xRatio = (box) => (box.centerX - hero.left) / hero.width;
      const yRatio = (box) => (box.centerY - hero.top) / hero.height;

      if (visible(dom.title) && xRatio(dom.title) > z.leftMaxRatio) {
        addIssue(issues, 'REVIEW', 'LANDSCAPE_TITLE_NOT_LEFT', `Title center is ${(xRatio(dom.title) * 100).toFixed(0)}% across the Hero.`);
      }
      if (visible(dom.title) && yRatio(dom.title) > z.upperMaxRatio) {
        addIssue(issues, 'REVIEW', 'LANDSCAPE_TITLE_TOO_LOW', `Title center is ${(yRatio(dom.title) * 100).toFixed(0)}% down the Hero.`);
      }
      if (visible(dom.certifications) && xRatio(dom.certifications) > z.leftMaxRatio) {
        addIssue(issues, 'REVIEW', 'LANDSCAPE_CERTS_NOT_LEFT', 'Certifications are not in the left half.');
      }
      if (visible(dom.bubble) && xRatio(dom.bubble) < z.rightMinRatio) {
        addIssue(issues, 'REVIEW', 'LANDSCAPE_BUBBLE_NOT_RIGHT', 'Bubble is not in the right half.');
      }
      if (visible(dom.scroll) && (xRatio(dom.scroll) > z.leftMaxRatio || yRatio(dom.scroll) < z.lowerMinRatio)) {
        addIssue(issues, 'REVIEW', 'LANDSCAPE_SCROLL_ZONE', 'Scroll icon is not in the lower-left zone.');
      }
      if (visible(dom.contact) && (xRatio(dom.contact) < z.rightMinRatio || yRatio(dom.contact) < z.lowerMinRatio)) {
        addIssue(issues, 'FAIL', 'LANDSCAPE_CONTACT_ZONE', 'Contact button is not in the lower-right zone.');
      }
      if (visible(dom.socials) && xRatio(dom.socials) < z.rightMinRatio) {
        addIssue(issues, 'FAIL', 'LANDSCAPE_SOCIALS_NOT_RIGHT', 'Social rail is not in the upper-right area.');
      }
    }

    if (visible(dom.certificationTitle) && visible(dom.certificationText) && dom.certificationText.top < dom.certificationTitle.bottom) {
      addIssue(issues, 'FAIL', 'LANDSCAPE_CERT_TEXT_ORDER', 'Certification text overlaps the certification title.');
    }
    if (visible(dom.certificationText) && visible(dom.certificationImages) && dom.certificationImages.top < dom.certificationText.bottom) {
      addIssue(issues, 'FAIL', 'LANDSCAPE_CERT_BADGE_ORDER', 'Certification badges overlap the certification text.');
    }
  }

  const failCount = issues.filter((item) => item.severity === 'FAIL').length;
  const reviewCount = issues.filter((item) => item.severity === 'REVIEW').length;
  const status = failCount ? 'FAIL' : reviewCount ? 'REVIEW' : 'PASS';
  const score = clampScore(100 - failCount * 20 - reviewCount * 5);

  return { status, score, issues, metrics };
};

const sanitize = (value) => String(value).replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-');

const main = async () => {
  let serverChild = null;
  let browser = null;
  try {
    const { chromium } = require('playwright');
    const server = await startVite();
    serverChild = server.child;

    console.log(`Hero composition QA: ${filteredCases.length} cases (${orientationFilter}).`);
    console.log(`Base URL: ${server.baseUrl}`);
    if (overrideCssPath) console.log(`Injected override CSS: ${path.relative(root, overrideCssPath)}`);

    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: filteredCases[0]?.width || 360, height: filteredCases[0]?.height || 700 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const url = `${server.baseUrl}/?qa=1&qaOverlay=0&qaSpeech=longest`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForSelector('.hero', { state: 'attached' });
    await page.evaluate(() => document.fonts?.ready);
    if (overrideCss) await page.addStyleTag({ content: overrideCss });

    // Allow one-time Motion entrance animations to reach their final state before
    // collecting geometry. Without this, the first few cases can be sampled while
    // certifications/title/socials still have transient opacity/transforms.
    await page.waitForTimeout(2600);

    // Freeze only continuously animated wrappers. This leaves the CSS alignment
    // transforms on descendants (e.g. .scroll > svg and .socialsText) intact while
    // making geometry and screenshots deterministic. Contact rotation safety is
    // assessed mathematically below rather than from a random animation angle.
    await page.addStyleTag({ content: `
      .contactButton { transform: none !important; }
      .scroll { transform: none !important; opacity: 1 !important; }
    ` });

    const results = [];
    for (let index = 0; index < filteredCases.length; index += 1) {
      const testCase = filteredCases[index];
      await page.setViewportSize({ width: testCase.width, height: testCase.height });
      await page.evaluate(async () => {
        window.scrollTo(0, 0);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await new Promise((resolve) => setTimeout(resolve, 80));
      });
      const dom = await captureDom(page);
      const assessment = assessCase(testCase, dom);
      results.push({ ...testCase, ...assessment, dom });
      if ((index + 1) % 25 === 0 || index + 1 === filteredCases.length) {
        console.log(`  tested ${index + 1}/${filteredCases.length}`);
      }
    }

    const sortedProblems = results
      .filter((item) => item.status !== 'PASS')
      .sort((a, b) => a.score - b.score || a.orientation.localeCompare(b.orientation) || a.height - b.height || a.width - b.width);

    fs.mkdirSync(screenshotDir, { recursive: true });
    for (const file of fs.readdirSync(screenshotDir)) {
      if (file.endsWith('.png')) fs.unlinkSync(path.join(screenshotDir, file));
    }

    if (screenshotMode !== 'none') {
      const screenshotCandidates = screenshotMode === 'all'
        ? results
        : sortedProblems;
      const chosen = screenshotCandidates.slice(0, Math.max(0, maxScreenshots));
      for (const item of chosen) {
        await page.setViewportSize({ width: item.width, height: item.height });
        await page.evaluate(async () => {
          window.scrollTo(0, 0);
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          await new Promise((resolve) => setTimeout(resolve, 80));
        });
        const filename = `${String(100 - item.score).padStart(3, '0')}__${item.status}__${item.orientation}__${item.width}x${item.height}__${sanitize(item.label || item.id)}.png`;
        await page.screenshot({ path: path.join(screenshotDir, filename), fullPage: false });
        item.screenshot = path.relative(root, path.join(screenshotDir, filename));
      }
    }

    const count = (status, orientation = null) => results.filter((item) => item.status === status && (!orientation || item.orientation === orientation)).length;
    const issueCounts = new Map();
    for (const item of results) {
      for (const issue of item.issues) {
        const key = `${issue.severity}|${issue.code}`;
        issueCounts.set(key, (issueCounts.get(key) || 0) + 1);
      }
    }
    const topIssues = [...issueCounts.entries()]
      .map(([key, countValue]) => {
        const [severity, code] = key.split('|');
        return { severity, code, count: countValue };
      })
      .sort((a, b) => b.count - a.count || a.severity.localeCompare(b.severity) || a.code.localeCompare(b.code));

    const report = {
      artifactType: 'hero-composition-qa',
      generatedAt: new Date().toISOString(),
      source: {
        registryPath: path.relative(root, registryPath),
        registryGeneratedAt: registry.generatedAt,
        contractPath: path.relative(root, contractPath),
        overrideCssPath: overrideCssPath ? path.relative(root, overrideCssPath) : null,
      },
      mode: {
        orientation: orientationFilter,
        quick: quickMode,
        measuredOnly,
        screenshotMode,
        maxScreenshots,
        filters: {
          minWidth: minWidthFilter,
          maxWidth: maxWidthFilter,
          minHeight: minHeightFilter,
          maxHeight: maxHeightFilter,
        },
      },
      summary: {
        total: results.length,
        measured: results.filter((item) => item.source === 'MEASURED').length,
        synthetic: results.filter((item) => item.source === 'SYNTHETIC').length,
        pass: count('PASS'),
        review: count('REVIEW'),
        fail: count('FAIL'),
        portrait: {
          total: results.filter((item) => item.orientation === 'portrait').length,
          pass: count('PASS', 'portrait'),
          review: count('REVIEW', 'portrait'),
          fail: count('FAIL', 'portrait'),
        },
        landscape: {
          total: results.filter((item) => item.orientation === 'landscape').length,
          pass: count('PASS', 'landscape'),
          review: count('REVIEW', 'landscape'),
          fail: count('FAIL', 'landscape'),
        },
        averageScore: round(results.reduce((sum, item) => sum + item.score, 0) / Math.max(results.length, 1)),
        worstScore: results.length ? Math.min(...results.map((item) => item.score)) : null,
      },
      topIssues,
      worstCases: [...results].sort((a, b) => a.score - b.score).slice(0, 30).map((item) => ({
        id: item.id,
        source: item.source,
        orientation: item.orientation,
        width: item.width,
        height: item.height,
        label: item.label,
        score: item.score,
        status: item.status,
        pressureBand: item.metrics.pressureBand,
        issues: item.issues,
        screenshot: item.screenshot || null,
      })),
      results,
    };

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`);

    const csvHeader = ['status', 'score', 'source', 'orientation', 'width', 'height', 'pressureBand', 'label', 'issues', 'titleToCertifications', 'certificationsToBubble', 'bubbleToScroll', 'scrollToImage', 'contactBottomGap', 'contactRightGap', 'contactRotationSafe'];
    const csvLines = [csvHeader.join(',')];
    for (const item of results) {
      csvLines.push([
        item.status,
        item.score,
        item.source,
        item.orientation,
        item.width,
        item.height,
        item.metrics.pressureBand,
        item.label,
        item.issues.map((issue) => `${issue.severity}:${issue.code}`).join(' | '),
        item.metrics.titleToCertifications,
        item.metrics.certificationsToBubble,
        item.metrics.bubbleToScroll,
        item.metrics.scrollToImage,
        item.metrics.contactBottomGap,
        item.metrics.contactRightGap,
        item.metrics.contactRotationEnvelope?.rotationSafe ?? null,
      ].map(csvEscape).join(','));
    }
    fs.writeFileSync(csvOut, `${csvLines.join('\n')}\n`);

    const md = [];
    md.push('# Hero Composition QA', '');
    md.push(`Generated: ${report.generatedAt}`, '');
    md.push('## Summary', '');
    md.push(`- Cases: **${report.summary.total}** (${report.summary.measured} measured, ${report.summary.synthetic} synthetic)`);
    md.push(`- PASS: **${report.summary.pass}**`);
    md.push(`- REVIEW: **${report.summary.review}**`);
    md.push(`- FAIL: **${report.summary.fail}**`);
    md.push(`- Average score: **${report.summary.averageScore}/100**`);
    md.push(`- Worst score: **${report.summary.worstScore}/100**`, '');
    md.push('| Orientation | Total | PASS | REVIEW | FAIL |');
    md.push('| --- | ---: | ---: | ---: | ---: |');
    md.push(`| Portrait | ${report.summary.portrait.total} | ${report.summary.portrait.pass} | ${report.summary.portrait.review} | ${report.summary.portrait.fail} |`);
    md.push(`| Landscape | ${report.summary.landscape.total} | ${report.summary.landscape.pass} | ${report.summary.landscape.review} | ${report.summary.landscape.fail} |`, '');
    md.push('## Composition contracts', '');
    md.push('- Portrait: title → certifications → bubble (when allowed) → scroll → portrait/shape; socials stay vertical top-right; contact stays rotation-safe at bottom-right.');
    md.push('- Severe/extreme portrait: bubble may be hidden instead of compressing primary content.');
    md.push('- Landscape: title/certifications left, socials vertical top-right, bubble right, visual centered, scroll lower-left, contact rotation-safe lower-right.', '');
    md.push('## Top issue types', '');
    if (!topIssues.length) md.push('No issues.', '');
    else {
      md.push('| Severity | Code | Cases |');
      md.push('| --- | --- | ---: |');
      for (const item of topIssues.slice(0, 25)) md.push(`| ${item.severity} | ${item.code} | ${item.count} |`);
      md.push('');
    }
    md.push('## Worst cases', '');
    md.push('| Score | Status | Source | Geometry | Band | Main issues | Screenshot |');
    md.push('| ---: | --- | --- | --- | --- | --- | --- |');
    for (const item of report.worstCases) {
      const issueText = item.issues.slice(0, 4).map((issue) => `${issue.severity}:${issue.code}`).join('<br>') || '—';
      md.push(`| ${item.score} | ${item.status} | ${item.source} | ${item.width}×${item.height} ${item.orientation} | ${item.pressureBand} | ${issueText} | ${item.screenshot || '—'} |`);
    }
    md.push('', '## Usage', '');
    md.push('```powershell');
    md.push('npm run qa:hero:composition');
    md.push('npm run qa:hero:composition:quick');
    md.push('npm run qa:hero:composition:portrait');
    md.push('npm run qa:hero:composition:landscape');
    md.push('```', '');
    md.push('Optional: inject candidate CSS without editing `hero.css`:', '');
    md.push('```powershell');
    md.push('node qa/viewport-audit/run-hero-composition-qa.cjs --orientation=portrait --override-css=qa/viewport-audit/candidate.css');
    md.push('```');
    fs.writeFileSync(mdOut, `${md.join('\n')}\n`);

    console.log('');
    console.log('Hero composition QA complete.');
    console.log(`Total: ${report.summary.total} | PASS ${report.summary.pass} | REVIEW ${report.summary.review} | FAIL ${report.summary.fail}`);
    console.log(`Portrait: ${report.summary.portrait.total} | PASS ${report.summary.portrait.pass} | REVIEW ${report.summary.portrait.review} | FAIL ${report.summary.portrait.fail}`);
    console.log(`Landscape: ${report.summary.landscape.total} | PASS ${report.summary.landscape.pass} | REVIEW ${report.summary.landscape.review} | FAIL ${report.summary.landscape.fail}`);
    console.log(`Average score: ${report.summary.averageScore}/100`);
    console.log(`JSON: ${path.relative(root, jsonOut)}`);
    console.log(`Markdown: ${path.relative(root, mdOut)}`);
    console.log(`CSV: ${path.relative(root, csvOut)}`);
    console.log(`Screenshots: ${path.relative(root, screenshotDir)}`);

    if (strictExit && report.summary.fail > 0) process.exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (serverChild) serverChild.kill();
  }
};

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
