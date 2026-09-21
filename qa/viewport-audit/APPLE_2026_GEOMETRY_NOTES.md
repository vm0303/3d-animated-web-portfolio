# Apple 2026 Hero Geometry Probes

These are QA geometry sentinels, not measured Safari viewport captures.

Apple publishes physical display resolutions for the September 2026 devices, but not Safari CSS viewport dimensions. Until TestMU / real-device Safari measurements are collected, the CSS probes below use an explicit 3x inference and remain labeled synthetic.

## iPhone 18 Pro

Official physical display: 1206 x 2622 pixels.

Synthetic CSS probes:

- portrait: 402 x 874
- landscape: 874 x 402

Expected existing geometry routing:

- portrait -> phone portrait (`max-width: 500px`)
- landscape -> normal phone landscape (`max-width: 1100px`, `356px-500px` height)
- current iOS Safari Liquid Glass portrait guard (`max-width: 440px`) includes the synthetic 402px portrait width

## iPhone 18 Pro Max

Official physical display: 1320 x 2868 pixels.

Synthetic CSS probes:

- portrait: 440 x 956
- landscape: 956 x 440

Expected existing geometry routing:

- portrait -> phone portrait
- landscape -> normal phone landscape
- current iOS Safari Liquid Glass portrait guard includes the synthetic 440px portrait boundary exactly

## iPhone Duo

Official physical displays:

- outer: 1398 x 2034 pixels
- inner: 1878 x 2670 pixels

Synthetic CSS probes:

- outer portrait: 466 x 678
- outer landscape: 678 x 466
- inner portrait: 626 x 890
- inner landscape: 890 x 626

Expected existing geometry routing:

- 466 x 678 outer portrait -> phone portrait; severe-height portrait state (`<=680px`) intentionally hides the bubble
- 678 x 466 outer landscape -> normal phone landscape
- 626 x 890 inner portrait -> tablet portrait (`501px-1100px`)
- 890 x 626 inner landscape -> unfolded foldable landscape bridge (`700px-999px` width, `501px-900px` height)

Do not add an iPhone-Duo-specific media query merely from the product name. Folded/outer and unfolded/inner are separate posture/display states, and real Safari visual/layout viewport measurements are still required for hardware certification.

Do not broaden the `max-width: 440px` Safari Liquid Glass guard to cover the Duo outer display without measured Safari evidence. Duo browser UI behavior can differ from slab iPhones.

## Current QA locations

Cross-browser smoke group:

- `qa/viewport-audit/hero-cross-browser-certification-contract.json`
- group: `apple-2026-geometry`

Large composition matrices:

- iPhone 18 Pro / Pro Max sentinels: `qa/viewport-audit/hero-composition-contract.json`
- iPhone Duo posture/display sentinels: `qa/viewport-audit/hero-foldable-composition-contract.json`

Useful commands:

```powershell
npm run qa:hero:certify:apple-2026:list
npm run qa:hero:certify:apple-2026
npm run qa:hero:composition:portrait
npm run qa:hero:composition:landscape
npm run qa:hero:foldable
```
