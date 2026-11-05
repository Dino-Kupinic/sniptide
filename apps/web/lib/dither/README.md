# dithercn engine

Source: https://dithercn.dev/r/dither-core.json (retrieved 5 November 2026).
Upstream: https://github.com/opencoredev/dithercn. MIT license: [LICENSE](./LICENSE).
Registry SHA-256: `29fe0bdd7058904cb6a1ab61b91ee76924a7af934597ebdc322a184173c3b18e`.

The CSS/SVG fills, colour resolution and motion helpers are vendored source,
formatted with Biome. Charts keep their layout, labels and HTML controls and use
`fillStyle` with the shared `settings.ts`: hatched fill, one CSS pixel, bloom off.
Hover previews values, tap/click pins them and arrow keys move keyboard focus.

`components/dithercn/progress-bar.tsx` comes from `progress-bar.json` and is used
in usage with `size="sm"`. Hiding its label omits the duplicate DOM readout and
keeps the accessible name and value on the progressbar itself. `dither-code.tsx` retains the numeral renderer from
`not-found.json` so 404 and 500 pages keep their own text and actions. Its cell
floor is one pixel and it retains a text fallback until the first canvas frame.
Imports use explicit modules and Sniptide utilities. No WebGL or new runtime
dependency is used. Error backgrounds reuse the existing Game of Life.

To update, compare the registry sources with these adaptations, retain the
license, run Biome and chart rendering tests, then check desktop and phone
layouts in both themes and with reduced motion. Do not run the registry
installer with `--overwrite`: it can replace utilities and theme files.
