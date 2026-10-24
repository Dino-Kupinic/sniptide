# Fonts for generated images

`Archivo-700.woff` and `Inter-400.woff` are the weights of the docs' heading and body
fonts that the Open Graph images use (`lib/og.tsx`). `next/og` needs the font data itself, which
`next/font` doesn't expose. Both fonts are open source under the SIL Open Font License 1.1 and come
from Google Fonts. Replace a file when the docs change their heading or body font.
