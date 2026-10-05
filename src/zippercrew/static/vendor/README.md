# Phaser

Pinned upstream distribution: Phaser 3.90.0, unmodified minified browser build.

Source: https://cdn.jsdelivr.net/npm/phaser@3.90.0/dist/phaser.min.js

SHA-256: `e92ddef111ba42e92d316979c732311757093688ea1810591cb7aa2858eba7a7`

License: MIT, retained in `PHASER-LICENSE.txt` from
https://cdn.jsdelivr.net/npm/phaser@3.90.0/LICENSE.md

Served locally so the Python application needs no JavaScript build toolchain or
runtime CDN access. Canvas mode is selected explicitly. This dependency only
renders the room; DOM controls and ZipperGen execution remain outside Phaser.

Upstream documentation: https://docs.phaser.io/phaser/getting-started/installation

# Message Markdown

Locally served ESM distributions, unmodified:

- Marked 18.0.14: https://cdn.jsdelivr.net/npm/marked@18.0.14/lib/marked.esm.js
  SHA-256: `528a1b88bef88fc27277e06036ce7f4afb6a220b18110ba57c09e292b24a7ce0`
  License: MIT (`MARKED-LICENSE.txt`).
- DOMPurify 3.4.16: https://cdn.jsdelivr.net/npm/dompurify@3.4.16/dist/purify.es.mjs
  SHA-256: `c44274a7959cfdd4da871fa78a5d5fbbef55db68d118c5c0833bc4b5cf9633ad`
  License: Apache-2.0 (`DOMPURIFY-LICENSE.txt`).

`inspector.js` sanitizes Markdown to a restricted document-only tag list and
allows navigation only to HTTP(S) links. No images, active embeds, or raw HTML
controls are allowed. Parsing is presentation-only; journal payloads are unchanged.
