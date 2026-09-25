# Final Hero Cross-Browser / Wide-Desktop Certification V3.1

The previously supplied production responsive matrices were green before this patch:

- Phone portrait: 160/160 PASS
- Phone landscape: 103/103 PASS
- Tablet portrait: 50/50 PASS
- Tablet landscape: 52/52 PASS
- Foldables: 33/33 PASS

This patch does not edit production phone/tablet/foldable CSS. It adds explicit 2026 Apple geometry sentinels, so the expected matrix totals increase when those suites are rerun.

## Desktop geometry model

### Standard desktop — unchanged production reference

- 1024x768
- 1280x720
- 1366x768
- 1440x900
- 1536x864
- 1600x900
- 1920x1080 — frozen standard-desktop visual anchor

### Wide desktop — V3.1 candidate begins at 1921px

- 1921x1080 — first post-anchor CSS pixel
- 2000x1200 — early wide calibration
- 2560x1440 — QHD calibration
- 3440x1440 — 21:9 ultrawide calibration
- 3840x1600 — ultrawide pressure
- 3840x2160 — 4K-class large desktop
- 5120x1440 — 32:9 short-height pressure
- 5120x2160 — wide high-resolution stress
- 7680x2160 — extreme CSS-viewport stress

Total desktop cases remain 16. The handoff moved from 2001px to 1921px because 1920x1080 is now the explicit visual anchor.

## Wide Desktop V3.1 candidate

```text
qa/viewport-audit/candidates/hero-wide-desktop-v3-1.css
```

The candidate does not change the global `.container`, `--content-max-width`, or `--page-gutter`. Only the first Hero section breaks out on landscape viewports wider than 1920px.

V3.1 scales the full Hero component system:

- Hero title
- certification heading/copy/badges
- scroll indicator
- speech bubble/avatar
- social icons/FOLLOW ME label
- contact control/arrow/text
- portrait height
- Three.js visual strength

The shell is also wider than V1 on 3440px+ geometries so the Hero does not sit inside an unnecessarily narrow 2400px island.

## V3.1 visual-scale QA

V1 proved collision safety but allowed a visually tiny Hero to pass. V3.1 keeps the wide-desktop scale checks derived from the 1920x1080 anchor and corrects the Contact SVG so its internal text/arrow are not double-scaled.

Required scale is approximately:

```text
min(
  1.8,
  viewportWidth / 1920,
  (viewportHeight / 1080) * 1.215
)
```

The runner now checks minimum sizes for title/certification/bubble fonts, certification badges, scroll icon, bubble avatar, social icons, contact control, portrait height ratio, and Hero shell utilization.

## 2026 Apple geometry probes

The contract includes a separate `apple-2026-geometry` group:

```text
402x874 / 874x402   iPhone 18 Pro
440x956 / 956x440   iPhone 18 Pro Max
466x678 / 678x466   iPhone Duo outer (synthetic 3x inference)
626x890 / 890x626   iPhone Duo inner (synthetic 3x inference)
```

The iPhone Duo CSS dimensions are intentionally labeled synthetic until measured Safari/TestMU evidence is collected.


## Candidate CSS load-order contract

`--override-css` is **not** injected with `page.addStyleTag()` after navigation. That approach was proven invalid for this Hero because React Three Fiber creates the WebGL canvas before the injected CSS changes its geometry; Playwright WebKit can then omit the already-resized WebGL layer from the screenshot even though the framebuffer is healthy.

When `--override-css` is present, the certification runner now:

1. creates a temporary QA copy of `index.html`, `src/`, and `public/`;
2. appends the candidate CSS to the temporary `src/components/hero/hero.css`;
3. starts Vite against that temporary root;
4. opens a fresh browser context at the final viewport; and
5. lets React / Three.js initialize once at the final candidate geometry.

The real source tree is not modified. `--override-css` cannot be combined with `--base-url`, because an already-running external app cannot guarantee candidate CSS was present before WebGL startup.

## First-time browser install

```powershell
npm install
npm run qa:hero:certify:install-browsers
```

## Recommended order

```powershell
npm run qa:hero:certify:desktop:list
npm run qa:hero:certify:desktop:wide:candidate
npm run qa:hero:certify:desktop:candidate
npm run qa:hero:certify:apple-2026:list
npm run qa:hero:certify:apple-2026
npm run qa:hero:composition:portrait
npm run qa:hero:composition:landscape
npm run qa:hero:foldable
```

After the V3.1 screenshots are visually accepted and the production responsive regressions are green, run the final cross-browser sweep:

```powershell
npm run qa:hero:certify
```

Because the 8 Apple geometry probes are now part of the contract, the full `all` sweep contains:

- Standard desktop: 7 viewports
- Wide desktop: 9 viewports
- Responsive smoke: 10 viewports
- Apple 2026 geometry: 8 viewports
- Total: 34 viewports x 3 browsers = 102 browser/viewport runs

## Harness invariants

- no horizontal document overflow
- `.hero` fills its host section
- desktop left/right Hero insets stay symmetric
- desktop Hero retains minimum safe edge clearance
- key UI is contained by the Hero
- intentional severe-phone bubble hiding is not treated as a missing-element failure
- portrait stays bottom-anchored
- Three.js canvas has a non-zero backing store
- title/certifications, bubble/socials, bubble/contact, and certifications/scroll collision checks
- wide desktop shell utilization and visual scale floors
- Firefox/WebKit geometry, wrapping, and font sizes compared with Chromium
- every browser/viewport run starts in a fresh context at its target geometry

The larger production phone/tablet/foldable composition matrices remain the source of truth for those responsive families.
