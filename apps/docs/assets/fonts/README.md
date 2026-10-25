# Fonts for generated images

`Archivo-500.woff` is the weight of the heading font that the Open Graph images use
(`lib/og.tsx`), the same file as on the marketing site's card. `next/og` needs the font data
itself, which `next/font` doesn't expose. Archivo is open source under the SIL Open Font License
1.1 and comes from Google Fonts. Replace the file when the docs change their heading font.
