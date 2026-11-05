# dithercn static engine

Source: https://dithercn.dev/r/dither-core.json (retrieved 5 November 2026).
Upstream: https://github.com/opencoredev/dithercn. MIT license: [LICENSE](./LICENSE).
Registry SHA-256: `29fe0bdd7058904cb6a1ab61b91ee76924a7af934597ebdc322a184173c3b18e`.

These are the static CSS/SVG fill modules from dither-core, formatted with Biome.
The charts use `fillStyle` directly so no shader, WebGL context, animation loop,
image processing, or runtime dependency is needed. Colours and cell size are
passed explicitly from Sniptide's theme in `components/charts/dither-bar.tsx`.

To update, download the registry above and replace the five source files, retain
the license, run Biome and the chart rendering tests, then check desktop and phone
layouts in both themes. Do not run the registry installer with `--overwrite`:
it can replace the project's utilities and theme.
