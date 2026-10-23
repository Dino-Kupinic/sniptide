# Fonts for generated images

`Archivo-500.woff` and `JetBrainsMono-400.woff` are the latin subsets of the brand heading and code
fonts that the paste link-preview image uses (`components/paste/preview-image.tsx`). `next/og` needs
the font data itself, which `next/font` doesn't expose. Both fonts are open source under the SIL Open
Font License 1.1 and come from Google Fonts. Replace a file when the app changes its heading or code
font.
