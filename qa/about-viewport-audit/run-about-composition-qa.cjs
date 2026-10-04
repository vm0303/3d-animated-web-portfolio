const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { chromium, firefox, webkit } = require('playwright');

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

const orientationFilter =
  (
    argValue('orientation') ||
    ''
  )
    .toLowerCase();

if (
  orientationFilter &&
  orientationFilter !== 'portrait' &&
  orientationFilter !== 'landscape'
) {
  throw new Error(
    `Unknown orientation: ${orientationFilter}. Use portrait or landscape.`
  );
}

const minWidth =
  Number(
    argValue('min-width') ||
    Number.NEGATIVE_INFINITY
  );

const maxWidth =
  Number(
    argValue('max-width') ||
    Number.POSITIVE_INFINITY
  );

const minHeight =
  Number(
    argValue('min-height') ||
    Number.NEGATIVE_INFINITY
  );

const maxHeight =
  Number(
    argValue('max-height') ||
    Number.POSITIVE_INFINITY
  );

const browserName = (argValue('browser') || 'chromium').toLowerCase();
const onePerWidth = hasFlag('one-per-width');
const webglProbe = hasFlag('webgl-probe');
const quick = hasFlag('quick');
const strict = hasFlag('strict');
const includeModal = hasFlag('modal');
const screenshotMode = argValue('screenshots') || 'bad';
const explicitBaseUrl = argValue('base-url') || process.env.QA_BASE_URL || null;
const port = Number(argValue('port') || process.env.QA_PORT || 4174);
const overrideCssArg = argValue('override-css') || null;

const overrideCssArgs =
  overrideCssArg
    ? overrideCssArg
        .split(',')
        .map(
          (value) =>
            value.trim()
        )
        .filter(Boolean)
    : [];
const outputDir = path.resolve(
  root,
  argValue('output-dir') || `qa-results/about/${family}${quick ? '-quick' : ''}`
);

const overrideCssPaths =
  overrideCssArgs.map(
    (value) =>
      path.resolve(
        root,
        value
      )
  );

for (
  const candidatePath of
  overrideCssPaths
) {
  if (
    !fs.existsSync(
      candidatePath
    )
  ) {
    throw new Error(
      `Missing override CSS: ${candidatePath}`
    );
  }
}

const overrideCssPath =
  overrideCssPaths[0] ||
  null;

const overrideCss =
  overrideCssPaths.length
    ? overrideCssPaths
        .map(
          (candidatePath) =>
            fs.readFileSync(
              candidatePath,
              'utf8'
            )
        )
        .join(
          '\n\n/* ===== NEXT ABOUT QA CANDIDATE ===== */\n\n'
        )
    : null;

/*
 * WebKit + React Three Fiber/WebGL candidate load-order rule:
 *
 * Hero QA already proved that injecting responsive candidate CSS after the
 * app begins mounting can leave WebKit's screenshot compositor with a blank
 * WebGL layer even when the canvas/backing store is healthy.
 *
 * Therefore WebKit automatically uses a temporary static candidate root:
 * candidate CSS is appended to about.css BEFORE Vite starts and BEFORE
 * React/Three.js creates the canvas.
 */
const staticCandidateMode =
  hasFlag('static-candidate') ||
  (
    browserName === 'webkit' &&
    Boolean(overrideCssPath)
  );

const FAMILY_TO_GROUP = contract.familyGroups;
if (family !== 'all' && !FAMILY_TO_GROUP[family]) {
  throw new Error(`Unknown family: ${family}`);
}

const BROWSERS = {
  chromium,
  firefox,
  webkit,
};

if (!BROWSERS[browserName]) {
  throw new Error(
    `Unknown browser: ${browserName}. Use chromium, firefox, or webkit.`
  );
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

const matchesGeometryFilters =
  (item) =>
    item.width >= minWidth &&
    item.width <= maxWidth &&
    item.height >= minHeight &&
    item.height <= maxHeight;


const matchesOrientationFilter =
  (item) => {
    if (!orientationFilter) {
      return true;
    }

    const itemOrientation =
      item.orientation ||
      (
        item.width > item.height
          ? 'landscape'
          : 'portrait'
      );

    return (
      itemOrientation ===
      orientationFilter
    );
  };


const oneRepresentativePerWidth = (cases) => {
  const byWidth = new Map();

  for (const item of cases) {
    if (!byWidth.has(item.width)) {
      byWidth.set(item.width, []);
    }

    byWidth.get(item.width).push(item);
  }

  const picks = [];

  for (const width of [...byWidth.keys()].sort((a, b) => a - b)) {
    const widthCases =
      byWidth.get(width)
        .slice()
        .sort((a, b) => a.height - b.height);

    const measured =
      widthCases.filter(
        (item) =>
          item.source === 'MEASURED'
      );

    const pool =
      measured.length
        ? measured
        : widthCases;

    picks.push(
      pool[
        Math.floor(
          pool.length / 2
        )
      ]
    );
  }

  return picks;
};

const families = family === 'all' ? Object.keys(FAMILY_TO_GROUP) : [family];
let viewportCases = [];
for (const familyName of families) {
  const groupName = FAMILY_TO_GROUP[familyName];

  const cases =
    (
      viewportSource.groups[
        groupName
      ] || []
    )
      .filter(
        matchesGeometryFilters
      )
      .filter(
        matchesOrientationFilter
      );

  const selected =
    quick
      ? quickCases(cases)
      : cases;

  viewportCases.push(
    ...selected.map(
      (item) => ({
        ...item,
        aboutFamily: familyName,
      })
    )
  );

  const supplemental =
    (contract.supplementalViewports || [])
      .filter(
        (item) =>
          item.family === familyName
      )
      .filter(
        matchesGeometryFilters
      )
      .filter(
        matchesOrientationFilter
      );

  viewportCases.push(
    ...supplemental.map(
      (item) => ({
        ...item,
        aboutFamily: familyName,
      })
    )
  );
}

viewportCases =
  uniqueById(viewportCases);

if (onePerWidth) {
  const supplementalIds =
    new Set(
      (contract.supplementalViewports || [])
        .filter(
          (item) =>
            family === 'all' ||
            item.family === family
        )
        .map(
          (item) =>
            item.id
        )
    );

  const baseCases =
    viewportCases.filter(
      (item) =>
        !supplementalIds.has(
          item.id
        )
    );

  const supplementalCases =
    viewportCases.filter(
      (item) =>
        supplementalIds.has(
          item.id
        )
    );

  viewportCases =
    uniqueById([
      ...oneRepresentativePerWidth(
        baseCases
      ),
      ...supplementalCases,
    ]);
}

if (!viewportCases.length) {
  throw new Error(
    [
      'No About QA viewport cases matched the requested selection.',
      `family=${family}`,
      `orientation=${orientationFilter || 'any'}`,
      `minWidth=${Number.isFinite(minWidth) ? minWidth : 'none'}`,
      `maxWidth=${Number.isFinite(maxWidth) ? maxWidth : 'none'}`,
      `minHeight=${Number.isFinite(minHeight) ? minHeight : 'none'}`,
      `maxHeight=${Number.isFinite(maxHeight) ? maxHeight : 'none'}`,
    ].join(' ')
  );
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

const candidateTempRoot =
  path.join(
    outputDir,
    '.static-candidate-root'
  );


const buildStaticCandidateRoot = () => {
  if (!staticCandidateMode) {
    return root;
  }

  if (!overrideCssPath) {
    return root;
  }

  if (explicitBaseUrl) {
    throw new Error(
      '--static-candidate/automatic WebKit static candidate mode requires the About runner to start its own Vite server. Remove --base-url.'
    );
  }

  fs.rmSync(
    candidateTempRoot,
    {
      recursive: true,
      force: true,
    }
  );

  ensureDir(
    candidateTempRoot
  );

  for (
    const name of [
      'index.html',
      'src',
      'public',
    ]
  ) {
    const source =
      path.join(
        root,
        name
      );

    const target =
      path.join(
        candidateTempRoot,
        name
      );

    if (
      !fs.existsSync(source)
    ) {
      throw new Error(
        `Missing source required for static About candidate root: ${source}`
      );
    }

    fs.cpSync(
      source,
      target,
      {
        recursive: true,
      }
    );
  }

  for (
    const name of [
      'vite.config.js',
      'vite.config.mjs',
      'vite.config.cjs',
      'vite.config.ts',
      'jsconfig.json',
      'tsconfig.json',
    ]
  ) {
    const source =
      path.join(
        root,
        name
      );

    if (
      fs.existsSync(source)
    ) {
      fs.cpSync(
        source,
        path.join(
          candidateTempRoot,
          name
        )
      );
    }
  }

  const aboutCssPath =
    path.join(
      candidateTempRoot,
      'src',
      'components',
      'about',
      'about.css'
    );

  if (
    !fs.existsSync(
      aboutCssPath
    )
  ) {
    throw new Error(
      `Unable to locate About CSS in static candidate root: ${aboutCssPath}`
    );
  }

  const baseCss =
    fs.readFileSync(
      aboutCssPath,
      'utf8'
    );

  const candidateCss =
    overrideCss;

  fs.writeFileSync(
    aboutCssPath,
    `${baseCss}\n\n/* QA STATIC ABOUT CANDIDATE — loaded before React/Three.js startup. */\n${candidateCss}\n`,
    'utf8'
  );

  return candidateTempRoot;
};


const startVite = async (
  viteRoot = root
) => {
  if (explicitBaseUrl) {
    return {
      baseUrl: explicitBaseUrl,
      child: null,
      viteRoot: null,
    };
  }

  const viteBin =
    path.join(
      root,
      'node_modules',
      'vite',
      'bin',
      'vite.js'
    );

  if (
    !fs.existsSync(viteBin)
  ) {
    throw new Error(
      'Vite is not installed. Run npm install first.'
    );
  }

  const baseUrl =
    `http://127.0.0.1:${port}`;

  const child =
    spawn(
      process.execPath,
      [
        viteBin,
        viteRoot,
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--strictPort',
      ],
      {
        cwd: root,
        env: {
          ...process.env,
        },
        stdio: [
          'ignore',
          'pipe',
          'pipe',
        ],
      }
    );

  let stderr = '';

  child.stderr.on(
    'data',
    (chunk) => {
      stderr +=
        chunk.toString();
    }
  );

  child.on(
    'exit',
    (code) => {
      if (
        code &&
        code !== 0
      ) {
        process.stderr.write(
          stderr
        );
      }
    }
  );

  await waitForHttp(
    baseUrl
  );

  return {
    baseUrl,
    child,
    viteRoot,
  };
};


const installPreMountCandidate =
  async (page) => {
    /*
     * Static mode already appended candidate CSS to about.css before
     * React/Three.js startup. Do not inject it a second time.
     */
    if (
      !overrideCss ||
      staticCandidateMode
    ) {
      return;
    }

    await page.route(
      '**/src/components/about/About.jsx*',
      async (route) => {
        const response =
          await route.fetch();

        const original =
          await response.text();

        const injection =
          `\n;(() => {\n  const old = document.getElementById('qa-about-candidate');\n  old?.remove();\n  const style = document.createElement('style');\n  style.id = 'qa-about-candidate';\n  style.textContent = ${JSON.stringify(overrideCss)};\n  document.head.appendChild(style);\n})();\n`;

        await route.fulfill({
          response,
          body:
            injection +
            original,
        });
      }
    );
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

  const lineTokensFor = (root) => {
    if (!root) return [];

    const tokens = [];
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT
    );

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = node.textContent || '';
      const regex = /\S+/g;
      let match;

      while ((match = regex.exec(text))) {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);

        const tokenRect = range.getBoundingClientRect();
        if (tokenRect.width > 0 && tokenRect.height > 0) {
          tokens.push({
            text: match[0],
            top: tokenRect.top,
            left: tokenRect.left,
          });
        }
      }
    }

    tokens.sort((a, b) => {
      if (Math.abs(a.top - b.top) > 2) return a.top - b.top;
      return a.left - b.left;
    });

    const lines = [];
    for (const token of tokens) {
      let line = lines.find((item) => Math.abs(item.top - token.top) <= 2);
      if (!line) {
        line = { top: token.top, tokens: [] };
        lines.push(line);
      }
      line.tokens.push(token.text);
    }

    return lines.map((line) => line.tokens);
  };

  const paragraphMetrics = paragraphs.map((el) => ({
    rect: rect(el),
    visible: isVisible(el),
    fontSize: parseFloat(getComputedStyle(el).fontSize),
    lineHeight: parseFloat(getComputedStyle(el).lineHeight),
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    lineTokens: lineTokensFor(el),
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
      tagName: el.tagName,
      fragmentCount: el.getClientRects().length,
    })),
    visibleParagraphCount: paragraphMetrics.filter((item) => item.visible).length,
    visibleKeywordCount: keywords.filter(isVisible).length,
    modelState: model ? {
      qa: model.dataset.aboutQa ?? null,
      scene: model.dataset.aboutScene ?? null,
      model: model.dataset.aboutModel ?? null,
      ready: model.dataset.aboutReady ?? null,
      responsiveScale:
        Number.parseFloat(
          model.dataset.aboutModelScale ||
          getComputedStyle(model)
            .getPropertyValue(
              '--about-model-scale'
            ) ||
          '1'
        ),
    } : null,
    screenTriggerVisible: isVisible(screenTrigger),
    screenTrigger: screenTrigger ? {
      fontSize:
        parseFloat(
          getComputedStyle(
            screenTrigger
          ).fontSize
        ),
    } : null,
  };
});

const addIssue = (issues, severity, code, message, metrics = null) => {
  issues.push({ severity, code, message, metrics });
};

const evaluateMetrics = (metrics, state, familyName) => {
  const issues = [];
  const t = contract.thresholds;
  const tol = t.containmentTolerancePx;
  const r = metrics.rects;

  const viewportWidth =
    metrics.viewport.innerWidth;

  const viewportHeight =
    metrics.viewport.innerHeight;

  const isPortraitGeometry =
    viewportHeight >
    viewportWidth;

  const isLandscapeGeometry =
    viewportWidth >
    viewportHeight;

  const isPhoneLandscapeShort =
    familyName === 'phone-landscape' &&
    viewportHeight <= 355;

  const isPhoneLandscapeNormal =
    familyName === 'phone-landscape' &&
    viewportHeight >= 356 &&
    viewportHeight <= 500;

  const isPhonePortraitNarrowTall =
    familyName === 'phone-portrait' &&
    viewportWidth <= 370 &&
    viewportHeight >= 700 &&
    viewportHeight <= 760;

  /*
   * Foldable outer displays that occupy phone-like geometry inherit the
   * already-approved phone readability contract instead of being forced
   * through the generic 14px foldable floor.
   */
  const isFoldablePhoneLikeLandscape =
    familyName === 'foldable' &&
    isLandscapeGeometry &&
    viewportWidth <= 1100 &&
    viewportHeight <= 500;

  const isFoldablePhoneLikePortrait =
    familyName === 'foldable' &&
    isPortraitGeometry &&
    viewportWidth <= 500;

  const isFoldableNarrowTallPortrait =
    isFoldablePhoneLikePortrait &&
    viewportWidth >= 390 &&
    viewportWidth <= 429 &&
    viewportHeight >= 880;

  /*
   * Medium portrait unifies unfolded foldables + tablet portrait.
   */
  const isMediumPortrait =
    isPortraitGeometry &&
    (
      familyName === 'tablet-portrait' ||
      (
        familyName === 'foldable' &&
        viewportWidth >= 501
      )
    );

  const isMediumPortraitCompactTall =
    isMediumPortrait &&
    viewportWidth >= 501 &&
    viewportWidth <= 699 &&
    viewportHeight >= 800;

  const isMediumPortraitTallTablet =
    isMediumPortrait &&
    viewportWidth >= 900 &&
    viewportHeight >= 1320;

  const isMediumPortraitTabletScale =
    isMediumPortrait &&
    viewportWidth >= 700;

  const isTabletLandscape =
    familyName === 'tablet-landscape';

  const isTabletLandscapeShort =
    isTabletLandscape &&
    viewportHeight <= 640;

  const isTabletLandscapeCompact =
    isTabletLandscape &&
    viewportHeight <=
      (
        t.tabletLandscapeCompactMaxHeightPx ??
        768
      );

  const isWideDesktop =
    familyName === 'desktop-wide';

  const isWideDesktopHiRes =
    isWideDesktop &&
    viewportWidth >=
      (
        t.wideDesktopHiResMinWidthPx ??
        3840
      ) &&
    viewportHeight >=
      (
        t.wideDesktopHiResMinHeightPx ??
        2000
      );

  const minTitleFontPx =
    familyName === 'phone-portrait'
      ? (
          t.phonePortraitMinTitleFontPx ??
          t.minTitleFontPx
        )
      : isPhoneLandscapeShort
        ? (
            t.phoneLandscapeShortMinTitleFontPx ??
            t.minTitleFontPx
          )
        : isPhoneLandscapeNormal
          ? (
              t.phoneLandscapeNormalMinTitleFontPx ??
              t.minTitleFontPx
            )
          : isFoldablePhoneLikeLandscape
            ? (
                t.phoneLandscapeNormalMinTitleFontPx ??
                t.minTitleFontPx
              )
            : isFoldableNarrowTallPortrait
              ? (
                  t.foldableNarrowTallMinTitleFontPx ??
                  t.phonePortraitMinTitleFontPx ??
                  t.minTitleFontPx
                )
              : isFoldablePhoneLikePortrait
                ? (
                    t.phonePortraitMinTitleFontPx ??
                    t.minTitleFontPx
                  )
                : isMediumPortraitTallTablet
                  ? (
                      t.mediumPortraitTallTabletMinTitleFontPx ??
                      t.mediumPortraitTabletMinTitleFontPx ??
                      t.minTitleFontPx
                    )
                  : isMediumPortraitCompactTall
                    ? (
                        t.mediumPortraitCompactTallMinTitleFontPx ??
                        t.mediumPortraitCompactMinTitleFontPx ??
                        t.minTitleFontPx
                      )
                    : isMediumPortraitTabletScale
                      ? (
                          t.mediumPortraitTabletMinTitleFontPx ??
                          t.minTitleFontPx
                        )
                      : isMediumPortrait
                        ? (
                            t.mediumPortraitCompactMinTitleFontPx ??
                            t.minTitleFontPx
                          )
                    : isTabletLandscapeCompact
                      ? (
                          t.tabletLandscapeCompactMinTitleFontPx ??
                          t.tabletLandscapeShortMinTitleFontPx ??
                          t.minTitleFontPx
                        )
                      : isTabletLandscape
                        ? (
                            t.tabletLandscapeMinTitleFontPx ??
                            t.minTitleFontPx
                          )
                        : isWideDesktopHiRes
                          ? (
                              t.wideDesktopHiResMinTitleFontPx ??
                              t.wideDesktopMinTitleFontPx ??
                              t.minTitleFontPx
                            )
                          : isWideDesktop
                            ? (
                                t.wideDesktopMinTitleFontPx ??
                                t.minTitleFontPx
                              )
                            : t.minTitleFontPx;

  const minBodyFontPx =
    isPhonePortraitNarrowTall
      ? (
          t.phonePortraitNarrowTallMinBodyFontPx ??
          t.phonePortraitMinBodyFontPx ??
          t.minBodyFontPx
        )
      : familyName === 'phone-portrait'
        ? (
            t.phonePortraitMinBodyFontPx ??
            t.minBodyFontPx
          )
        : isPhoneLandscapeShort
          ? (
              t.phoneLandscapeShortMinBodyFontPx ??
              t.minBodyFontPx
            )
          : isPhoneLandscapeNormal
            ? (
                t.phoneLandscapeNormalMinBodyFontPx ??
                t.minBodyFontPx
              )
            : isFoldablePhoneLikeLandscape
              ? (
                  t.phoneLandscapeNormalMinBodyFontPx ??
                  t.minBodyFontPx
                )
              : isFoldableNarrowTallPortrait
                ? (
                    t.foldableNarrowTallMinBodyFontPx ??
                    t.phonePortraitMinBodyFontPx ??
                    t.minBodyFontPx
                  )
                : isFoldablePhoneLikePortrait
                  ? (
                      t.phonePortraitMinBodyFontPx ??
                      t.minBodyFontPx
                    )
                  : isMediumPortraitTallTablet
                    ? (
                        t.mediumPortraitTallTabletMinBodyFontPx ??
                        t.mediumPortraitTabletMinBodyFontPx ??
                        t.minBodyFontPx
                      )
                    : isMediumPortraitCompactTall
                      ? (
                          t.mediumPortraitCompactTallMinBodyFontPx ??
                          t.mediumPortraitCompactMinBodyFontPx ??
                          t.minBodyFontPx
                        )
                      : isMediumPortraitTabletScale
                        ? (
                            t.mediumPortraitTabletMinBodyFontPx ??
                            t.minBodyFontPx
                          )
                        : isMediumPortrait
                          ? (
                              t.mediumPortraitCompactMinBodyFontPx ??
                              t.minBodyFontPx
                            )
                      : isTabletLandscapeCompact
                        ? (
                            t.tabletLandscapeCompactMinBodyFontPx ??
                            t.tabletLandscapeShortMinBodyFontPx ??
                            t.minBodyFontPx
                          )
                        : isTabletLandscape
                          ? (
                              t.tabletLandscapeMinBodyFontPx ??
                              t.minBodyFontPx
                            )
                          : isWideDesktopHiRes
                            ? (
                                t.wideDesktopHiResMinBodyFontPx ??
                                t.wideDesktopMinBodyFontPx ??
                                t.minBodyFontPx
                              )
                            : isWideDesktop
                              ? (
                                  t.wideDesktopMinBodyFontPx ??
                                  t.minBodyFontPx
                                )
                              : t.minBodyFontPx;


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
  if (!metrics.title?.visible || metrics.title.fontSize < minTitleFontPx) {
    addIssue(issues, 'FAIL', 'TITLE_READABILITY', 'About title is missing or below the readability floor.', {
      ...metrics.title,
      minTitleFontPx,
    });
  }

  for (const p of visibleParagraphs) {
    if (p.fontSize < minBodyFontPx) {
      addIssue(issues, 'FAIL', 'BODY_TEXT_TOO_SMALL', 'Visible About copy is below the body-text readability floor.', {
        fontSize: p.fontSize,
        minBodyFontPx,
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

  if (
    familyName === 'phone-portrait' &&
    metrics.keywords.some(
      (keyword) =>
        keyword.tagName === 'BUTTON'
    )
  ) {
    addIssue(
      issues,
      'FAIL',
      'ATOMIC_KEYWORD_CONTROL',
      'Phone portrait About keywords must use fragmentable inline controls, not native button formatting boxes.',
      {
        keywords:
          metrics.keywords.map(
            (keyword) => ({
              text: keyword.text,
              tagName: keyword.tagName,
              fragmentCount:
                keyword.fragmentCount,
            })
          ),
      }
    );
  }


  if (
    familyName === 'phone-portrait' &&
    metrics.visibleParagraphCount < (t.requiredVisibleParagraphs ?? 3)
  ) {
    addIssue(issues, 'FAIL', 'CONTENT_MISSING', 'Phone portrait must keep all three About paragraphs visible.', {
      visibleParagraphCount: metrics.visibleParagraphCount,
      requiredVisibleParagraphs: t.requiredVisibleParagraphs ?? 3,
    });
  } else if (
    familyName === 'phone-landscape' &&
    metrics.visibleParagraphCount < (t.phoneLandscapeRequiredVisibleParagraphs ?? 3)
  ) {
    addIssue(issues, 'FAIL', 'CONTENT_MISSING', 'Phone landscape must keep all three About paragraphs visible.', {
      visibleParagraphCount: metrics.visibleParagraphCount,
      requiredVisibleParagraphs: t.phoneLandscapeRequiredVisibleParagraphs ?? 3,
    });
  } else if (metrics.visibleParagraphCount < t.recommendedVisibleParagraphs) {
    addIssue(issues, 'REVIEW', 'CONTENT_REDUCED', 'Fewer About paragraphs are visible.', {
      visibleParagraphCount: metrics.visibleParagraphCount,
      recommendedVisibleParagraphs: t.recommendedVisibleParagraphs,
    });
  }

  for (const p of visibleParagraphs) {
    for (const lineTokens of p.lineTokens || []) {
      if (lineTokens.length !== 1) continue;

      const onlyToken = lineTokens[0];

      if (/^[.,;:!?]+$/.test(onlyToken)) {
        addIssue(issues, 'FAIL', 'PUNCTUATION_ONLY_LINE', 'A punctuation mark wrapped onto a line by itself.', {
          token: onlyToken,
          lines: p.lineTokens,
        });
        break;
      }

      /*
       * Single-word lines are visually acceptable in responsive About copy.
       * Keep only the punctuation-only guard above; do not fail a geometry
       * solely because natural wrapping leaves one word on a line.
       */
      break;
    }
  }

  if (
    familyName === 'phone-portrait' &&
    visibleParagraphs.length === 3
  ) {
    /*
     * Phone copy should be visually centered as a text measure.
     * We validate the paragraph block itself instead of dictating
     * exact editorial line breaks for individual viewports.
     */
    const listLeftInset =
      r.list.left;

    const listRightInset =
      metrics.viewport.innerWidth -
      r.list.right;

    const horizontalInsetDifference =
      Math.abs(
        listLeftInset -
        listRightInset
      );

    if (
      horizontalInsetDifference >
      2.5
    ) {
      addIssue(
        issues,
        'FAIL',
        'PARAGRAPH_MEASURE_OFF_CENTER',
        'Phone portrait paragraph measure is not horizontally centered in the viewport.',
        {
          listLeftInset,
          listRightInset,
          horizontalInsetDifference,
        }
      );
    }

    if (
      Math.min(
        listLeftInset,
        listRightInset
      ) <
      4
    ) {
      addIssue(
        issues,
        'FAIL',
        'PARAGRAPH_EDGE_GUTTER_TIGHT',
        'Phone portrait paragraph measure is too close to a viewport edge.',
        {
          listLeftInset,
          listRightInset,
        }
      );
    }


    const finalParagraph =
      visibleParagraphs[2];

    const bottomSlack =
      r.about.bottom -
      finalParagraph.rect.bottom;

    const minBottomBuffer =
      t.phonePortraitMinBottomBufferPx ??
      0;

    if (
      bottomSlack <
      minBottomBuffer -
      tol
    ) {
      addIssue(
        issues,
        'FAIL',
        'ABOUT_BOTTOM_BUFFER_TIGHT',
        'Phone portrait needs more breathing room between paragraph 3 and the next section.',
        {
          bottomSlack,
          minBottomBuffer,
        }
      );
    }


    const maxBottomSlack =
      t.phonePortraitMaxBottomSlackPx ??
      50;

    if (
      bottomSlack >
      maxBottomSlack +
      tol
    ) {
      addIssue(
        issues,
        'REVIEW',
        'ABOUT_BOTTOM_SLACK',
        'Phone portrait leaves excessive unused space after paragraph 3.',
        {
          bottomSlack,
          maxBottomSlack,
        }
      );
    }
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

  if (r.left && r.right) {
    const overlapX =
      Math.min(r.left.right, r.right.right) -
      Math.max(r.left.left, r.right.left);

    const overlapY =
      Math.min(r.left.bottom, r.right.bottom) -
      Math.max(r.left.top, r.right.top);

    if (
      overlapX > tol &&
      overlapY > tol
    ) {
      addIssue(issues, 'FAIL', 'ABOUT_REGIONS_OVERLAP', 'Text and model layout regions overlap.', {
        left: r.left,
        right: r.right,
        overlapX,
        overlapY,
      });
    }
  }

  if (
    familyName === 'phone-portrait' &&
    r.right &&
    r.title &&
    r.list &&
    visibleParagraphs.length === 3
  ) {
    const modelToTitleGap =
      r.title.top -
      r.right.bottom;

    const titleToCopyGap =
      r.list.top -
      r.title.bottom;

    const paragraphOneToTwoGap =
      visibleParagraphs[1].rect.top -
      visibleParagraphs[0].rect.bottom;

    const paragraphTwoToThreeGap =
      visibleParagraphs[2].rect.top -
      visibleParagraphs[1].rect.bottom;

    const measuredGaps = [
      modelToTitleGap,
      titleToCopyGap,
      paragraphOneToTwoGap,
      paragraphTwoToThreeGap,
    ];

    const minComponentGap =
      t.phonePortraitMinComponentGapPx ??
      14;

    const gapEqualityTolerance =
      t.phonePortraitAllGapEqualityTolerancePx ??
      t.phonePortraitGapEqualityTolerancePx ??
      2.5;

    if (
      measuredGaps.some(
        (gap) =>
          gap <
          minComponentGap -
          tol
      )
    ) {
      addIssue(
        issues,
        'FAIL',
        'ABOUT_COMPONENT_GAP_TIGHT',
        'Phone portrait needs deliberate breathing room between the model, title, and every paragraph.',
        {
          modelToTitleGap,
          titleToCopyGap,
          paragraphOneToTwoGap,
          paragraphTwoToThreeGap,
          minComponentGap,
        }
      );
    }

    const smallestGap =
      Math.min(...measuredGaps);

    const largestGap =
      Math.max(...measuredGaps);

    if (
      largestGap -
      smallestGap >
      gapEqualityTolerance
    ) {
      addIssue(
        issues,
        'FAIL',
        'ABOUT_COMPONENT_GAP_UNEVEN',
        'Phone portrait vertical rhythm should be visually equal from model through all three paragraphs.',
        {
          modelToTitleGap,
          titleToCopyGap,
          paragraphOneToTwoGap,
          paragraphTwoToThreeGap,
          smallestGap,
          largestGap,
          difference:
            largestGap -
            smallestGap,
          gapEqualityTolerance,
        }
      );
    }
  }


  if (
    familyName === 'phone-portrait' &&
    metrics.viewport.innerWidth >=
      (t.phonePortraitWideTallMinWidthPx ?? 480) &&
    metrics.viewport.innerHeight >=
      (t.phonePortraitWideTallMinHeightPx ?? 900)
  ) {
    const wideTallTitleMin =
      t.phonePortraitWideTallMinTitleFontPx ??
      40;

    const wideTallBodyMin =
      t.phonePortraitWideTallMinBodyFontPx ??
      15.5;

    if (
      metrics.title?.fontSize <
      wideTallTitleMin
    ) {
      addIssue(
        issues,
        'FAIL',
        'WIDE_PHONE_TITLE_TOO_SMALL',
        'Wide/tall phone portrait should use the larger About title tier.',
        {
          fontSize:
            metrics.title?.fontSize,
          required:
            wideTallTitleMin,
        }
      );
    }

    if (
      visibleParagraphs.some(
        (paragraph) =>
          paragraph.fontSize <
          wideTallBodyMin
      )
    ) {
      addIssue(
        issues,
        'FAIL',
        'WIDE_PHONE_BODY_TOO_SMALL',
        'Wide/tall phone portrait should use the larger About body-text tier.',
        {
          fontSizes:
            visibleParagraphs.map(
              (paragraph) =>
                paragraph.fontSize
            ),
          required:
            wideTallBodyMin,
        }
      );
    }
  }

  /*
   * Medium portrait is intentionally stacked:
   * model/button above, title/copy below.
   */
  if (
    isMediumPortrait &&
    r.right &&
    r.left &&
    r.list &&
    r.title
  ) {
    if (
      r.right.bottom >
      r.left.top +
        tol
    ) {
      addIssue(
        issues,
        'FAIL',
        'MEDIUM_PORTRAIT_NOT_STACKED',
        'Medium portrait must place the model region above the About text region.',
        {
          right:
            r.right,
          left:
            r.left,
        }
      );
    }

    const listLeftInset =
      r.list.left -
      r.about.left;

    const listRightInset =
      r.about.right -
      r.list.right;

    const measureCenterDelta =
      Math.abs(
        listLeftInset -
        listRightInset
      );

    const maxMeasure =
      familyName === 'tablet-portrait'
        ? (
            t.tabletPortraitMaxParagraphMeasurePx ??
            t.mediumPortraitMaxParagraphMeasurePx ??
            780
          )
        : (
            t.mediumPortraitMaxParagraphMeasurePx ??
            780
          );

    if (
      r.list.width >
      maxMeasure +
        tol
    ) {
      addIssue(
        issues,
        'FAIL',
        'MEDIUM_PORTRAIT_MEASURE_TOO_WIDE',
        'Medium portrait copy exceeds the intended centered reading measure.',
        {
          width:
            r.list.width,
          maxMeasure,
        }
      );
    }

    if (
      measureCenterDelta >
      (
        t.mediumPortraitCenterTolerancePx ??
        12
      )
    ) {
      addIssue(
        issues,
        'FAIL',
        'MEDIUM_PORTRAIT_MEASURE_OFF_CENTER',
        'Medium portrait paragraph measure should remain horizontally centered.',
        {
          listLeftInset,
          listRightInset,
          measureCenterDelta,
        }
      );
    }

    const compositionTop =
      Math.min(
        r.right.top,
        r.left.top
      );

    const compositionBottom =
      Math.max(
        r.right.bottom,
        r.left.bottom
      );

    const usedHeight =
      compositionBottom -
      compositionTop;

    const unusedRatio =
      Math.max(
        0,
        (
          r.about.height -
          usedHeight
        ) /
        r.about.height
      );

    if (
      unusedRatio >
      (
        t.mediumPortraitMaxUnusedRatio ??
        0.28
      )
    ) {
      addIssue(
        issues,
        'REVIEW',
        'MEDIUM_PORTRAIT_EXCESS_DEAD_SPACE',
        'Medium portrait leaves a large amount of unused vertical space.',
        {
          unusedRatio,
          usedHeight,
          aboutHeight:
            r.about.height,
        }
      );
    }
  }


  if (
    isTabletLandscape &&
    r.left &&
    r.about
  ) {
    const textShare =
      r.left.width /
      r.about.width;

    if (
      textShare <
      (
        t.tabletLandscapeMinTextShare ??
        0.53
      )
    ) {
      addIssue(
        issues,
        'FAIL',
        'TABLET_LANDSCAPE_TEXT_LANE_NARROW',
        'Tablet landscape should give the text lane slightly more than half of the composition.',
        {
          textShare,
          required:
            t.tabletLandscapeMinTextShare ??
            0.53,
        }
      );
    }
  }


  if (
    isWideDesktop &&
    r.list
  ) {
    const maxWideMeasure =
      isWideDesktopHiRes
        ? (
            t.wideDesktopHiResMaxParagraphMeasurePx ??
            t.wideDesktopMaxParagraphMeasurePx ??
            940
          )
        : (
            t.wideDesktopMaxParagraphMeasurePx ??
            940
          );

    if (
      r.list.width >
        maxWideMeasure +
          tol
    ) {
      addIssue(
        issues,
        'FAIL',
        'WIDE_DESKTOP_MEASURE_TOO_WIDE',
        'Wide desktop should scale the composition without turning the About copy into an overly long text measure.',
        {
          width:
            r.list.width,
          maxMeasure:
            maxWideMeasure,
        }
      );
    }
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
    } else {
      if (r.right && (
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

      if (
        isWideDesktopHiRes &&
        (
          !metrics.screenTrigger ||
          metrics.screenTrigger.fontSize <
            (
              t.wideDesktopHiResMinScreenTriggerFontPx ??
              28
            )
        )
      ) {
        addIssue(
          issues,
          'FAIL',
          'WIDE_DESKTOP_VIEW_SCREEN_TEXT_TOO_SMALL',
          'High-resolution wide desktop View screen text is below the accepted readability floor.',
          {
            fontSize:
              metrics.screenTrigger?.fontSize ??
              null,
            minFontSize:
              t.wideDesktopHiResMinScreenTriggerFontPx ??
              28,
          }
        );
      }

      if (
        familyName === 'phone-portrait' &&
        r.model
      ) {
        const modelToButtonGap =
          r.screenTrigger.top -
          r.model.bottom;

        const minLaptopButtonGap =
          t.phonePortraitLaptopButtonMinGapPx ??
          4;

        const maxLaptopButtonGap =
          t.phonePortraitLaptopButtonMaxGapPx ??
          6.5;

        if (
          modelToButtonGap <
          minLaptopButtonGap -
          tol
        ) {
          addIssue(
            issues,
            'FAIL',
            'VIEW_SCREEN_BUTTON_TOO_TIGHT',
            'Laptop and View screen button are too tightly packed.',
            {
              modelToButtonGap,
              minLaptopButtonGap,
            }
          );
        } else if (
          modelToButtonGap >
          maxLaptopButtonGap +
          tol
        ) {
          addIssue(
            issues,
            'REVIEW',
            'VIEW_SCREEN_BUTTON_TOO_LOOSE',
            'Laptop and View screen button have more separation than the intended compact internal rhythm.',
            {
              modelToButtonGap,
              maxLaptopButtonGap,
            }
          );
        }
      }
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

const collectModalMetrics = async (page) => page.evaluate(() => {
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

  const modal = document.querySelector('.laptopScreenModal');
  const dialog = document.querySelector('.laptopScreenDialog');
  const toolbar = document.querySelector('.laptopScreenToolbar');
  const modalTitle = document.querySelector('.laptopScreenTitle');
  const close = document.querySelector('.laptopScreenClose');
  const closeIcon = document.querySelector('.laptopScreenCloseIcon');
  const imageViewport = document.querySelector('.laptopScreenViewport');
  const image = document.querySelector('.laptopScreenImage');

  return {
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      visualWidth: window.visualViewport?.width ?? window.innerWidth,
      visualHeight: window.visualViewport?.height ?? window.innerHeight,
    },
    rects: {
      modal: rect(modal),
      dialog: rect(dialog),
      toolbar: rect(toolbar),
      close: rect(close),
      imageViewport: rect(imageViewport),
      image: rect(image),
    },
    chrome: {
      titleFontSize:
        modalTitle
          ? parseFloat(
              getComputedStyle(
                modalTitle
              ).fontSize
            )
          : null,
      closeIcon:
        rect(
          closeIcon
        ),
    },
    image: image ? {
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      complete: image.complete,
      objectFit:
        getComputedStyle(image)
          .objectFit,
      objectPosition:
        getComputedStyle(image)
          .objectPosition,
    } : null,
  };
});

const evaluateModalMetrics = (
  metrics,
  familyName
) => {
  const issues = [];
  const t = contract.thresholds;
  const tol = t.containmentTolerancePx;
  const r = metrics.rects;
  const width = metrics.viewport.visualWidth;
  const height = metrics.viewport.visualHeight;

  if (!r.modal || !r.dialog || !r.close || !r.image) {
    addIssue(issues, 'FAIL', 'MODAL_STRUCTURE_MISSING', 'Laptop screen modal did not render all required elements.');
    return issues;
  }

  if (
    r.dialog.left < -tol ||
    r.dialog.top < -tol ||
    r.dialog.right > width + tol ||
    r.dialog.bottom > height + tol
  ) {
    addIssue(issues, 'FAIL', 'MODAL_VIEWPORT_ESCAPE', 'Laptop screen dialog extends outside the visible viewport.', {
      dialog: r.dialog,
      visualViewport: { width, height },
    });
  }

  if (
    r.close.left < r.dialog.left - tol ||
    r.close.top < r.dialog.top - tol ||
    r.close.right > r.dialog.right + tol ||
    r.close.bottom > r.dialog.bottom + tol
  ) {
    addIssue(issues, 'FAIL', 'MODAL_CLOSE_ESCAPE', 'Modal close control is outside the dialog.', {
      close: r.close,
      dialog: r.dialog,
    });
  }

  if (
    r.image.width <= 0 ||
    r.image.height <= 0 ||
    !metrics.image?.complete
  ) {
    addIssue(issues, 'FAIL', 'MODAL_IMAGE_NOT_READY', 'Laptop screen image is missing, collapsed, or not loaded.', {
      image: r.image,
      source: metrics.image,
    });
  }


  if (
    r.imageViewport &&
    (
      r.image.left <
        r.imageViewport.left - tol ||
      r.image.top <
        r.imageViewport.top - tol ||
      r.image.right >
        r.imageViewport.right + tol ||
      r.image.bottom >
        r.imageViewport.bottom + tol
    )
  ) {
    addIssue(
      issues,
      'FAIL',
      'MODAL_IMAGE_VIEWPORT_ESCAPE',
      'Laptop screen image extends outside its image viewport.',
      {
        image: r.image,
        imageViewport:
          r.imageViewport,
      }
    );
  }


  if (
    familyName ===
      'phone-landscape' &&
    metrics.image?.objectFit !==
      'contain'
  ) {
    addIssue(
      issues,
      'FAIL',
      'MODAL_IMAGE_NOT_CONTAINED',
      'Phone-landscape laptop screen must render with object-fit: contain.',
      {
        objectFit:
          metrics.image?.objectFit,
        objectPosition:
          metrics.image?.objectPosition,
      }
    );
  }

  const isWideDesktopHiResModal =
    familyName === 'desktop-wide' &&
    width >=
      (
        t.wideDesktopHiResMinWidthPx ??
        3840
      ) &&
    height >=
      (
        t.wideDesktopHiResMinHeightPx ??
        2000
      );

  if (
    isWideDesktopHiResModal
  ) {
    const minModalTitleFont =
      t.wideDesktopHiResMinModalTitleFontPx ??
      36;

    if (
      !Number.isFinite(
        metrics.chrome?.titleFontSize
      ) ||
      metrics.chrome.titleFontSize <
        minModalTitleFont
    ) {
      addIssue(
        issues,
        'FAIL',
        'WIDE_DESKTOP_MODAL_TITLE_TOO_SMALL',
        'High-resolution wide desktop modal title is below the accepted readability floor.',
        {
          fontSize:
            metrics.chrome?.titleFontSize ??
            null,
          minFontSize:
            minModalTitleFont,
        }
      );
    }

    const minCloseSize =
      t.wideDesktopHiResMinModalCloseSizePx ??
      88;

    if (
      r.close.width <
        minCloseSize -
          tol ||
      r.close.height <
        minCloseSize -
          tol
    ) {
      addIssue(
        issues,
        'FAIL',
        'WIDE_DESKTOP_MODAL_CLOSE_TOO_SMALL',
        'High-resolution wide desktop close control is below the accepted size floor.',
        {
          close:
            r.close,
          minCloseSize,
        }
      );
    }

    const minCloseIconSize =
      t.wideDesktopHiResMinModalCloseIconSizePx ??
      34;

    if (
      !metrics.chrome?.closeIcon ||
      metrics.chrome.closeIcon.width <
        minCloseIconSize -
          tol ||
      metrics.chrome.closeIcon.height <
        minCloseIconSize -
          tol
    ) {
      addIssue(
        issues,
        'FAIL',
        'WIDE_DESKTOP_MODAL_CLOSE_ICON_TOO_SMALL',
        'High-resolution wide desktop close icon is below the accepted size floor.',
        {
          closeIcon:
            metrics.chrome?.closeIcon ??
            null,
          minCloseIconSize,
        }
      );
    }
  }


  const isNonPhoneModalGeometry =
    width >= 501 &&
    height >= 501;

  if (
    isNonPhoneModalGeometry &&
    r.imageViewport
  ) {
    const viewportAspect =
      r.imageViewport.width /
      r.imageViewport.height;

    const expectedAspect =
      t.nonPhoneModalImageAspectRatio ??
      1.6;

    const aspectTolerance =
      t.nonPhoneModalAspectTolerance ??
      0.05;

    if (
      Math.abs(
        viewportAspect -
        expectedAspect
      ) >
      aspectTolerance
    ) {
      addIssue(
        issues,
        'FAIL',
        'NON_PHONE_MODAL_ASPECT_MISMATCH',
        'Non-phone modal image viewport should follow the source image aspect ratio.',
        {
          viewportAspect,
          expectedAspect,
          aspectTolerance,
          imageViewport:
            r.imageViewport,
        }
      );
    }

    if (
      metrics.image?.objectFit !==
      'contain'
    ) {
      addIssue(
        issues,
        'FAIL',
        'NON_PHONE_MODAL_IMAGE_NOT_CONTAINED',
        'Non-phone modal image should use object-fit: contain.',
        {
          objectFit:
            metrics.image?.objectFit,
          objectPosition:
            metrics.image?.objectPosition,
        }
      );
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
  const webglProbeDir = path.join(outputDir, 'webgl_probe');
  ensureDir(goodDir);
  ensureDir(badDir);

  if (webglProbe) {
    ensureDir(webglProbeDir);
  }

  const viteRoot =
    buildStaticCandidateRoot();

  const {
    baseUrl,
    child,
  } =
    await startVite(
      viteRoot
    );

  const browser =
    await BROWSERS[
      browserName
    ].launch({
      headless: true,
    });
  const results = [];

  try {
    console.log(`About composition QA: ${viewportCases.length} viewport cases × ${modelStates.length} model states${includeModal ? ' + laptop modal sentinel' : ''}.`);
    console.log(`Family: ${family}${quick ? ' (quick)' : ''}${onePerWidth ? ' (one-per-width)' : ''}`);
    console.log(`Browser: ${browserName}`);
    console.log(`Base URL: ${baseUrl}`);
    if (
      overrideCssPaths.length
    ) {
      console.log(
        `Override CSS: ${overrideCssPaths
          .map(
            (candidatePath) =>
              path.relative(
                root,
                candidatePath
              )
          )
          .join(', ')}`
      );

      console.log(
        `Candidate load mode: ${staticCandidateMode ? 'static/pre-start about.css' : 'About.jsx pre-render module injection'}`
      );
    }

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
          await page.goto(
            url.toString(),
            {
              waitUntil:
                browserName === 'webkit'
                  ? 'networkidle'
                  : 'domcontentloaded',

              timeout: 30000,
            }
          );

          await page.waitForSelector(
            '.about',
            {
              timeout: 15000,
            }
          );
          await page.evaluate(() => {
            document.documentElement.style.scrollBehavior = 'auto';
            const about = document.querySelector('.about');
            about?.closest('section')?.scrollIntoView({ behavior: 'auto', block: 'start' });
          });

          /*
           * Extreme CSS-pixel viewports can take longer for Three.js/R3F to
           * finish the QA-ready handshake when the WebGL probe is enabled.
           *
           * The 5120x2160 / 7680x2160 certification screenshots can already
           * contain a fully rendered model at the old 20s cutoff, so that
           * timeout can create a false QA_EXECUTION_ERROR. Keep the normal
           * path unchanged and give only the high-resolution probe cases
           * additional settling time.
           */
          const aboutReadyTimeoutMs =
            webglProbe &&
            testCase.width >= 4800 &&
            testCase.height >= 2000
              ? 45000
              : 20000;

          await page.waitForFunction(
            ({ scene, model }) => {
              const el = document.querySelector('.aboutModelContainer[data-about-qa="true"]');
              return el?.dataset.aboutScene === scene &&
                el?.dataset.aboutModel === model &&
                el?.dataset.aboutReady === 'true';
            },
            { scene: state.scene, model: state.model },
            { timeout: aboutReadyTimeoutMs }
          );

          if (
            state.scene === 'developer' &&
            state.model === 'laptop'
          ) {
            await page.waitForFunction(
              () => {
                const button =
                  document.querySelector('.aboutScreenTrigger');

                if (!button) return false;

                const style =
                  getComputedStyle(button);

                const rect =
                  button.getBoundingClientRect();

                return (
                  style.display !== 'none' &&
                  style.visibility !== 'hidden' &&
                  Number(style.opacity) > 0 &&
                  rect.width > 0 &&
                  rect.height > 0
                );
              },
              null,
              { timeout: 10000 }
            );
          }

          if (
            browserName === 'webkit'
          ) {
            await page.evaluate(
              async () => {
                await document.fonts?.ready;

                await new Promise(
                  (resolve) =>
                    requestAnimationFrame(
                      () =>
                        requestAnimationFrame(
                          resolve
                        )
                    )
                );
              }
            );

            /*
             * WebKit compositor grace period after the model is ready.
             * This is intentionally browser-specific and mirrors the
             * proven Hero certification workflow.
             */
            await page.waitForTimeout(
              650
            );
          }

          await page.waitForTimeout(
            contract.settleMs
          );

          let webglProbeResult = null;

          if (webglProbe) {
            webglProbeResult =
              await page.evaluate(
                () => {
                  const probe =
                    window.__ABOUT_QA_WEBGL_PROBE__;

                  if (
                    typeof probe !==
                    'function'
                  ) {
                    return {
                      available: false,
                    };
                  }

                  try {
                    return {
                      available: true,
                      ...probe(),
                    };
                  } catch (error) {
                    return {
                      available: true,
                      error:
                        String(
                          error?.stack ||
                          error
                        ),
                    };
                  }
                }
              );

            if (
              webglProbeResult
                ?.dataUrl
                ?.startsWith(
                  'data:image/png;base64,'
                )
            ) {
              const base64 =
                webglProbeResult
                  .dataUrl
                  .slice(
                    'data:image/png;base64,'
                      .length
                  );

              const filename =
                `${sanitize(browserName)}__${testCase.width}x${testCase.height}__${sanitize(state.scene)}-${sanitize(state.model)}__canvas-readback.png`;

              const fullPath =
                path.join(
                  webglProbeDir,
                  filename
                );

              fs.writeFileSync(
                fullPath,
                Buffer.from(
                  base64,
                  'base64'
                )
              );

              webglProbeResult = {
                ...webglProbeResult,
                dataUrl: undefined,
                readbackPath:
                  path.relative(
                    root,
                    fullPath
                  ),
                readbackBytes:
                  fs.statSync(
                    fullPath
                  ).size,
              };
            }
          }

          const metrics =
            await collectMetrics(page);
          const issues = evaluateMetrics(
            metrics,
            state,
            testCase.aboutFamily
          );
          for (const error of runtimeErrors) {
            addIssue(issues, 'FAIL', 'RUNTIME_ERROR', error);
          }
          const status = statusForIssues(issues);
          const item = {
            id: `${testCase.id}__${state.scene}-${state.model}`,
            browser: browserName,
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
            webglProbe:
              webglProbeResult,
          };
          results.push(item);

          const shouldShoot = screenshotMode === 'all' || (screenshotMode === 'bad' && status !== 'PASS');
          if (shouldShoot) {
            const dir = status === 'PASS' ? goodDir : badDir;
            const filename = `${status}__${sanitize(testCase.aboutFamily)}__${testCase.width}x${testCase.height}__${sanitize(state.scene)}-${sanitize(state.model)}__${sanitize(testCase.id)}.png`;
            await page.screenshot({ path: path.join(dir, filename), fullPage: false });
          }

          /*
           * Modal is a separate laptop-only sentinel. It does not multiply
           * every model state, but it gives each requested viewport one
           * explicit open-modal geometry check and screenshot.
           */
          if (
            includeModal &&
            state.scene === 'developer' &&
            state.model === 'laptop'
          ) {
            await page.locator('.aboutScreenTrigger').click();
            await page.waitForSelector('.laptopScreenDialog', {
              state: 'visible',
              timeout: 10000,
            });
            await page.waitForFunction(() => {
              const image = document.querySelector('.laptopScreenImage');
              return Boolean(image?.complete && image.naturalWidth > 0);
            }, null, { timeout: 10000 });

            const modalMetrics = await collectModalMetrics(page);
            const modalIssues =
              evaluateModalMetrics(
                modalMetrics,
                testCase.aboutFamily
              );
            const modalStatus = statusForIssues(modalIssues);

            results.push({
              id: `${testCase.id}__developer-laptop-modal`,
              browser: browserName,
              family: testCase.aboutFamily,
              viewportId: testCase.id,
              width: testCase.width,
              height: testCase.height,
              label: testCase.label,
              source: testCase.source || 'SYNTHETIC',
              scene: 'developer',
              model: 'laptop-modal',
              status: modalStatus,
              issues: modalIssues,
              metrics: modalMetrics,
            });

            const shootModal =
              screenshotMode === 'all' ||
              (screenshotMode === 'bad' && modalStatus !== 'PASS');

            if (shootModal) {
              const dir = modalStatus === 'PASS' ? goodDir : badDir;
              const filename = `${modalStatus}__${sanitize(testCase.aboutFamily)}__${testCase.width}x${testCase.height}__developer-laptop-modal__${sanitize(testCase.id)}.png`;
              await page.screenshot({
                path: path.join(dir, filename),
                fullPage: false,
              });
            }

            await page.locator('.laptopScreenClose').click();
            await page.waitForSelector('.laptopScreenDialog', {
              state: 'detached',
              timeout: 10000,
            });
          }
        } catch (error) {
          const executionIssues = [
            {
              severity: 'FAIL',
              code: 'QA_EXECUTION_ERROR',
              message: String(error?.stack || error),
            },
            ...runtimeErrors.map(
              (runtimeError) => ({
                severity: 'FAIL',
                code: 'RUNTIME_ERROR',
                message: runtimeError,
              })
            ),
          ];

          let executionScreenshotPath = null;

          try {
            const filename =
              `FAIL__${sanitize(testCase.aboutFamily)}__${testCase.width}x${testCase.height}__${sanitize(state.scene)}-${sanitize(state.model)}__execution-error__${sanitize(testCase.id)}.png`;

            const fullPath =
              path.join(
                badDir,
                filename
              );

            await page.screenshot({
              path: fullPath,
              fullPage: false,
            });

            executionScreenshotPath =
              path.relative(
                root,
                fullPath
              );
          } catch {
            /* The page/browser may already be unavailable. */
          }

          results.push({
            id: `${testCase.id}__${state.scene}-${state.model}`,
            browser: browserName,
            family: testCase.aboutFamily,
            viewportId: testCase.id,
            width: testCase.width,
            height: testCase.height,
            label: testCase.label,
            source: testCase.source || 'SYNTHETIC',
            scene: state.scene,
            model: state.model,
            status: 'FAIL',
            issues: executionIssues,
            metrics: null,
            executionScreenshotPath,
            pageUrl: page.url(),
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

    if (child) {
      child.kill();

      /*
       * Give Windows/Vite a moment to release files before removing
       * the temporary source tree.
       */
      await sleep(250);
    }

    if (
      staticCandidateMode &&
      fs.existsSync(
        candidateTempRoot
      )
    ) {
      fs.rmSync(
        candidateTempRoot,
        {
          recursive: true,
          force: true,
        }
      );
    }
  }

  const counts = { PASS: 0, REVIEW: 0, FAIL: 0 };
  for (const item of results) counts[item.status] += 1;
  const summary = {
    generatedAt: new Date().toISOString(),
    browser: browserName,
    family,
    orientation:
      orientationFilter ||
      null,
    quick,
    onePerWidth,
    webglProbe,
    geometryFilters: {
      minWidth:
        Number.isFinite(minWidth)
          ? minWidth
          : null,
      maxWidth:
        Number.isFinite(maxWidth)
          ? maxWidth
          : null,
      minHeight:
        Number.isFinite(minHeight)
          ? minHeight
          : null,
      maxHeight:
        Number.isFinite(maxHeight)
          ? maxHeight
          : null,
    },
    viewportCases: viewportCases.length,
    modelStates: modelStates.length,
    total: results.length,
    ...counts,
    overrideCssPath:
      overrideCssPath
        ? path.relative(
            root,
            overrideCssPath
          )
        : null,

    overrideCssPaths:
      overrideCssPaths.map(
        (candidatePath) =>
          path.relative(
            root,
            candidatePath
          )
      ),

    candidateLoadMode:
      overrideCssPath
        ? (
            staticCandidateMode
              ? 'static-pre-start-about-css'
              : 'About.jsx pre-render module injection'
          )
        : null,
    modalSentinel: includeModal,
  };

  fs.writeFileSync(path.join(outputDir, 'about-composition-report.json'), JSON.stringify({ summary, results }, null, 2));

  const md = [
    '# About Composition QA',
    '',
    `- Browser: **${browserName}**`,
    `- WebGL probe: **${webglProbe ? 'enabled' : 'disabled'}**`,
    `- Family: **${family}**${quick ? ' (quick)' : ''}${onePerWidth ? ' (one-per-width)' : ''}`,
    `- Orientation filter: **${orientationFilter || 'all'}**`,
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
