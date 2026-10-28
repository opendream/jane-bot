# Jane assets for `src/assets/jane/`

Illustration © Opendream, 2018. Some figures redrawn with AI assistance, 2026.

`avatar.webp` (and its 192 and 96 sizes), `quiz-surprised.webp` and `quiz-back.webp` are an AI-assisted redraw (Grok Imagine), Opendream, 2026. `header.webp`, `empty.webp` and `quiz-thinking.webp` are native higher-res images from the 2018 PDF, with no AI.

Source: *Sex Safe Safe* manual (2018). The PDF is not in this repository. Page numbers are 1-based. **p4 is not used** (UFC marked it REMOVE). The condom mascot is not used. Nothing was taken from the 2020 art round.

The in-app credit is exactly `Illustration © Opendream, 2018. Some figures redrawn with AI assistance, 2026.`. The grant is all rights reserved; not covered by Apache-2.0 or CC BY-SA.

## Encoder (all rasters)

Shipped files are lossy WebP with a lossless alpha plane. Sources were the owner-approved RGBA PNGs. No upscale. No redraw or colour change beyond resize + encode.

- Resize (when needed): Pillow 10.2 `Image.Resampling.LANCZOS` on premultiplied RGBA, then un-premultiply.
- Encode: `cwebp` 1.3.2 `-q 80 -alpha_q 100 -m 6 -alpha_filter best -mt -exact`
- `avatar-96.webp` and `avatar-192.webp` were encoded at native PNG size (already Lanczos / premultiplied downscales of `avatar.png`).

| File | Output px | Bytes | KB |
|---|---|---|---|
| `header.webp` | 504×704 | 40164 | 39.2 |
| `avatar.webp` | 256×256 | 12790 | 12.5 |
| `avatar-192.webp` | 192×192 | 9260 | 9.0 |
| `avatar-96.webp` | 96×96 | 4072 | 4.0 |
| `empty.webp` | 680×600 | 68980 | 67.4 |
| `quiz-thinking.webp` | 431×504 | 29812 | 29.1 |
| `quiz-surprised.webp` | 357×501 | 31690 | 30.9 |
| `quiz-back.webp` | 208×539 | 20578 | 20.1 |

Output sizes are ~3× the CSS display box (header 168×235, empty ~226×200, quiz figures max-height 168 / 180, avatar 40px in bubbles / 64px large).

## Raster provenance

| File | Source PNG | Method |
|---|---|---|
| `header.webp` | `header.png` 1090×1522 | Native PDF image (p1, xref 1603), same crop as the original header. **No AI.** Figure only: the cover background, star, yellow blob and heart from the original header are left out because every file must be transparent. |
| `empty.webp` | `empty.png` 1314×1160 | Native PDF image (p2, xref 1611). **No AI.** Background removed with a seeded watershed/flood fill. The tree and both students stay. |
| `quiz-thinking.webp` | `quiz-thinking.png` 1283×1500 | Native PDF image (p1, xref 1603) with its own soft mask. **No AI.** |
| `avatar.webp` | `avatar.png` 1024×1024 | AI-assisted redraw (Grok Imagine), Opendream, 2026 |
| `avatar-192.webp` | `avatar-192.png` 192×192 | AI-assisted redraw (Grok Imagine), Opendream, 2026 |
| `avatar-96.webp` | `avatar-96.png` 96×96 | AI-assisted redraw (Grok Imagine), Opendream, 2026 |
| `quiz-surprised.webp` | `quiz-surprised.png` 729×1024 | AI-assisted redraw (Grok Imagine), Opendream, 2026 |
| `quiz-back.webp` | `quiz-back.png` 395×1024 | AI-assisted redraw (Grok Imagine), Opendream, 2026 |

## Vector stars (unchanged)

True vector stars from the 2018 cover, shipped as of `0067a8f`. svgo 3.3.5. Self-contained: no href, script, style or font.

| File | Source page / object | Production step |
|---|---|---|
| `star-yellow.svg` | 2018 cover, p1; path fill `#F8F6B2`; SVG `viewBox="157.02 732.48 34.72 35.66"` | Vector paths extracted from the cover. |
| `star-lilac.svg` | 2018 cover, p1; path fill `#D5C4E6`; SVG `viewBox="326.35 658.43 106.33 109.45"` | Same extraction as `star-yellow.svg`. |
| `star-lilac-2.svg` | 2018 cover, p1; path fill `#D6C5E7`; SVG `viewBox="104.11 659.08 66.78 66.63"` | Same extraction as `star-yellow.svg`. |
| `star-pale-blue.svg` | 2018 cover, p1; path fill `#EBF9FC`; SVG `viewBox="482.7 445.82 70.09 72.74"` | Same extraction as `star-yellow.svg`. |
| `star-pink.svg` | 2018 cover, p1; path fill `#FBD0E7`; SVG `viewBox="41.35 191.71 29.75 30.77"` | Same extraction as `star-yellow.svg`. |
| `star-white.svg` | 2018 cover, p1; path fill `#FFFFFF`; SVG `viewBox="44.59 119.57 35.09 35.01"` | Same extraction as `star-yellow.svg`. |
| `stars-sheet.svg` | 2018 cover, p1; all 11 cover stars; SVG `viewBox="0 0 618 109"` | Vector paths extracted from the cover (all 11 stars). |
| `tokens.css` | palette sampled from the 2018 manual spec | Tokens only; not an illustration. |
| `MANIFEST.md` | — | this file |

## Usage
- **Welcome** = `header.webp` plus the cover star SVGs (`star-yellow`, `star-lilac`, `star-pink`).
- **Chat empty** = `empty.webp` on a white (`--surface`) card. **Chat bubbles** = `avatar-96.webp` with `srcset` (`96w` / `192w` / `256w`).
- **Quiz question** = `quiz-thinking.webp`. In the source this is a calm, smiling pose, not a literal "thinking" gesture.
- **Quiz success** = `quiz-surprised.webp` with the star SVGs (`yellow`, `lilac`, `pink`, `pale-blue`).
- **Quiz wrong** = `quiz-back.webp`.
- Jane figures are WebP (RGBA); stars are SVG. The crisis screen has no `img` and no `svg`.
- The condom mascot is **not used** in the UI and is not shipped.
- Credit everywhere is exactly `Illustration © Opendream, 2018. Some figures redrawn with AI assistance, 2026.`. Don't name an illustrator. Don't add a licence label.
- Each figure gets Thai `alt` text and a fixed `width`/`height` to prevent layout shift. Decorative stars use `alt=""` / `aria-hidden="true"`.
- `--jane-line` is for decoration only (white on it = 3.07, fails AA). Use `--primary` for text and buttons.
- No comic pages are included.

## Font reminder (coding agent)
The UI font is **Mitr** (SIL Open Font License, by Cadson Demak). It is **not shipped from here**. The coding agent must fetch it from Google Fonts / the Cadson Demak repository and self-host it under the app's strict CSP (no runtime CDN, so it works offline). Include the OFL text with the font files.
