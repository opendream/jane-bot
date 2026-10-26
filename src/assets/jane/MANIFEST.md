# Jane assets for `src/assets/jane/`

Illustration © Opendream, 2018

Source: *Sex Safe Safe* manual (2018). **This repository does not contain the 2018 PDF** (no `.pdf` / `.ai` / `.eps` in the tree or git history), so no new vector objects were extracted in this round.

Owner ruling 27 Oct 2026 06:14 BKK: #15 may use only true vector art. Raster crops or renders from the PDF do not count. Nothing was redrawn, traced, auto-vectorized, generated with AI, or taken from the 2020 art round.

## Remaining assets

| File | Source page / object | Production step |
|---|---|---|
| `star-yellow.svg` | 2018 cover, p1; path fill `#F8F6B2`; SVG `viewBox="157.02 732.48 34.72 35.66"` (cover user space) | Vector paths extracted from the cover; svgo 3.3.5. Shipped as of `0067a8f`. Self-contained: no href, script, style or font. |
| `star-lilac.svg` | 2018 cover, p1; path fill `#D5C4E6`; SVG `viewBox="326.35 658.43 106.33 109.45"` | Same extraction as `star-yellow.svg`. |
| `star-lilac-2.svg` | 2018 cover, p1; path fill `#D6C5E7`; SVG `viewBox="104.11 659.08 66.78 66.63"` | Same extraction as `star-yellow.svg`. |
| `star-pale-blue.svg` | 2018 cover, p1; path fill `#EBF9FC`; SVG `viewBox="482.7 445.82 70.09 72.74"` | Same extraction as `star-yellow.svg`. |
| `star-pink.svg` | 2018 cover, p1; path fill `#FBD0E7`; SVG `viewBox="41.35 191.71 29.75 30.77"` | Same extraction as `star-yellow.svg`. |
| `star-white.svg` | 2018 cover, p1; path fill `#FFFFFF`; SVG `viewBox="44.59 119.57 35.09 35.01"` | Same extraction as `star-yellow.svg`. |
| `stars-sheet.svg` | 2018 cover, p1; all 11 cover stars; SVG `viewBox="0 0 618 109"` | Vector paths extracted from the cover (all 11 stars); svgo 3.3.5. Shipped as of `0067a8f`. |
| `tokens.css` | palette sampled from the 2018 manual spec | Tokens only; not an illustration. |
| `MANIFEST.md` | — | this file |

## Removed rasters (owner ruling 27 Oct 2026)

These were PDF image-XObject crops / renders, not true vectors. They are no longer shipped. UI falls back to no image (no placeholder, no replacement art).

| File | Was | Why removed |
|---|---|---|
| `avatar.webp` | p1 image xref 1603, bust crop, 256×256 | Raster crop from the 2018 PDF |
| `avatar-96.webp` | same crop at 96×96 | Raster crop from the 2018 PDF |
| `header.webp` | p1 cover clip rendered at 216 dpi, 642×897 | Raster render from the 2018 PDF |
| `empty.webp` | p2 image xref 1611, 720×636 | Raster crop from the 2018 PDF |
| `quiz-thinking.webp` | p1 image xref 1603, 400×468 | Raster crop from the 2018 PDF |
| `quiz-surprised.webp` | p7 image xref 928, 400×562 | Raster crop from the 2018 PDF |
| `quiz-back.webp` | p7 image xref 932, 340×881 | Raster crop from the 2018 PDF |

## Usage
- **Welcome** uses the individual star SVGs (`star-yellow`, `star-lilac`, `star-pink`). No Jane figure.
- **Quiz success** uses the same star SVGs (`yellow`, `lilac`, `pink`, `pale-blue`). No Jane figure. Quiz question / wrong-answer screens have no art.
- Chat, empty state, and avatars have no art.
- The condom mascot is **not used** and is not shipped.
- Credit everywhere is exactly `Illustration © Opendream, 2018`. Don't name an illustrator. Don't add a licence label. The grant is all rights reserved; not covered by Apache-2.0 or CC BY-SA.
- Decorative stars use `alt=""` / `aria-hidden="true"`.
- `--jane-line` is for decoration only (white on it = 3.07, fails AA). Use `--primary` for text and buttons.
- No comic pages are included.

## Font reminder (coding agent)
The UI font is **Mitr** (SIL Open Font License, by Cadson Demak). It is **not shipped from here**. The coding agent must fetch it from Google Fonts / the Cadson Demak repository and self-host it under the app's strict CSP (no runtime CDN, so it works offline). Include the OFL text with the font files.
