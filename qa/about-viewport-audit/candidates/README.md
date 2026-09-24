# About CSS candidates

Keep experimental responsive rules here until a family passes geometry QA and visual review. Do not modify Hero CSS from this folder.

Name candidates by geometry family and revision, for example:

- `about-phone-portrait-v1.css`
- `about-phone-landscape-v1.css`
- `about-tablet-portrait-v1.css`
- `about-tablet-landscape-v1.css`
- `about-foldable-v1.css`
- `about-desktop-v1.css`

Prefer fluid, generalized rules (`grid`, `flex`, `clamp()`, intrinsic sizing, `svh`/`dvh`, min/max constraints) over named-device patches.
