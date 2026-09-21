# Wide Desktop V3.1 — Production Promotion

V3.1 was promoted into `src/components/hero/hero.css` after the candidate completed:

- Wide desktop: 9 viewports × 3 browsers = 27/27 PASS
- Full desktop: 16 viewports × 3 browsers = 48/48 PASS
- REVIEW: 0
- FAIL: 0

The WebKit Three.js issue seen during earlier candidate runs was traced to late `page.addStyleTag()` candidate injection after React Three Fiber had already initialized its WebGL canvas. The certification runner now applies `--override-css` by building a temporary app with the candidate present before Vite / React / Three.js startup.

## Production proof

Run with no override CSS:

```powershell
npm run qa:hero:certify:desktop
npm run qa:hero:certify
```

The first command is the 16-view desktop production proof. The second is the complete cross-browser certification matrix.

## Apple 2026 geometry follow-up

After production desktop certification, run:

```powershell
npm run qa:hero:certify:apple-2026:list
npm run qa:hero:certify:apple-2026
```

The Apple 2026 cases are synthetic geometry probes unless/until real Safari/TestMU measurements replace them. See `APPLE_2026_GEOMETRY_NOTES.md`.
