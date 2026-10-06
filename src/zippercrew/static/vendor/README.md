# Phaser — production renderer

Phaser 3.90.0, the previously vendored unmodified official distribution, is
restored with its MIT license (`PHASER-LICENSE.txt`). It is loaded locally by
`index.html`; no CDN or runtime package resolution is used. Canvas rendering
avoids a WebGL requirement. See https://phaser.io/ and
https://docs.phaser.io/phaser/concepts/scale-manager.

# Babylon.js — archived development reference only

Pinned official npm distributions, unmodified, served locally:

- Babylon.js 9.15.0: `babylonjs@9.15.0/babylon.js`
- glTF loader 9.15.0: `babylonjs-loaders@9.15.0/babylonjs.loaders.min.js`
- Apache 2.0 license: `BABYLON-LICENSE.txt`

Package sources: https://registry.npmjs.org/babylonjs/-/babylonjs-9.15.0.tgz
and https://registry.npmjs.org/babylonjs-loaders/-/babylonjs-loaders-9.15.0.tgz.
SHA-256:

- Engine: `9fa39c6e3f66c714f3b52b5e0b3b19059bb8e0c7dadd65b6db48fd8e297d00bf`
- Loader: `72b44c1ee61cf6eaf7825f6cf07ca2af70dafe1a86f743215cf4d32a7328a0a9`

No runtime network requests or dynamic loader modules are needed for our GLBs.
Babylon is not loaded by the product page and is excluded from packaged builds.

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
