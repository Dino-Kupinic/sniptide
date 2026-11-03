# Fonts for the paste preview card

`components/paste/preview-image.tsx` reads these fonts at runtime for link previews.

- `Archivo-500.woff`: Archivo by Omnibus-Type, SIL Open Font License 1.1.
- `packages/ui/src/fonts/PaperMono-Regular.ttf`: Paper Mono by Paper Design, SIL Open Font
  License 1.1.

Archivo covers Latin scripts only, so titles in other scripts fall back to Satori's default font.
