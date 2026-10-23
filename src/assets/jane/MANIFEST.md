# Jane assets for `src/assets/jane/`

Illustration © Opendream, 2018

Source: *Sex Safe Safe* manual (2018). The PDF pages are 1-based. Images were cropped and cleaned only. Nothing was redrawn, and no AI or 2020 art was used.
**p4 is not used** (UFC marked it REMOVE). Every Jane image comes from p1, p2 or p7.

| File | Source page | Crop box | Pixels | KB | Notes |
|---|---|---|---|---|---|
| `avatar.webp` | p1 | image xref 1603 (full-body Jane), px box (60,170)–(660,770) of the cleaned bust, circle mask on #D1F0F6 | 256×256 | 10.0 | opaque circle, transparent corners |
| `avatar-96.webp` | p1 | same crop as avatar.webp | 96×96 | 3.2 | opaque circle, transparent corners |
| `header.webp` | p1 | cover clip x 352–566 pt, y 31–330 pt (no title text), rendered at 216 dpi | 642×897 | 31.3 | opaque |
| `empty.webp` | p2 | image xref 1611 (Jane and a classmate on the school steps), whole image (0,0)–(1314,1160), on paper white | 720×636 | 16.7 | opaque; place on a white (--surface) card |
| `quiz-thinking.webp` | p1 | image xref 1603, px box (0,0)–(1283,1500) (head to waist) | 400×468 | 25.0 | transparent bg + paper-white matte inside figure |
| `quiz-surprised.webp` | p7 | image xref 928 (table scene), px box (0,0)–(470,660) | 400×562 | 30.9 | transparent bg + paper-white matte inside figure; sweat drops are original |
| `quiz-back.webp` | p7 | image xref 932 (pharmacy panel), px box (50,185)–(392,1071); drawn shop sign and door cropped out | 340×881 | 20.5 | opaque white; OPTIONAL, white card only |
| `star-yellow.svg` | p1 | vector paths extracted from the cover (#F8F6B2); svgo 3.3.5 | vector | 0.6 | self-contained: no href, script, style or font |
| `star-lilac.svg` | p1 | vector paths extracted from the cover (#D5C4E6); svgo 3.3.5 | vector | 0.5 | self-contained: no href, script, style or font |
| `star-lilac-2.svg` | p1 | vector paths extracted from the cover (#D6C5E7); svgo 3.3.5 | vector | 0.6 | self-contained: no href, script, style or font |
| `star-pale-blue.svg` | p1 | vector paths extracted from the cover (#EBF9FC); svgo 3.3.5 | vector | 0.5 | self-contained: no href, script, style or font |
| `star-pink.svg` | p1 | vector paths extracted from the cover (#FBD0E7); svgo 3.3.5 | vector | 0.5 | self-contained: no href, script, style or font |
| `star-white.svg` | p1 | vector paths extracted from the cover (#FFFFFF); svgo 3.3.5 | vector | 0.5 | self-contained: no href, script, style or font |
| `stars-sheet.svg` | p1 | vector paths extracted from the cover (all 11 cover stars); svgo 3.3.5 | vector | 4.5 | self-contained: no href, script, style or font |
| `tokens.css` | — | palette tokens from the spec, contrast ratios measured | — | 1.4 | |
| `MANIFEST.md` | — | this file | — | — | |

## Usage rules (UFC)
- **Quiz success** = `quiz-surprised.webp` with the star SVGs. **Quiz question** = `quiz-thinking.webp`. In the source this is a calm, smiling pose, not a literal "thinking" gesture. `quiz-back.webp` is optional, for a "go to the pharmacy / get help" step.
- Jane images are WebP; stars are SVG.
- The condom mascot is **not used** in the UI and is not shipped.
- Credit everywhere is exactly `Illustration © Opendream, 2018`. Don't name an illustrator. Don't add a licence label.
- Each image gets `alt` text and a fixed `width`/`height` to prevent layout shift. Decorative stars use `alt=""` / `aria-hidden="true"`.
- "Paper-white matte" means the faces and shirts are transparent in the source rasters; on the printed page the white came from shapes behind them. The cleaned images fill only the areas enclosed by the line art with white. The drawing pixels are unchanged.
- Avatar: 256 px for the header/profile and 96 px for chat bubbles. Checked legible at 48, 40 and 32 px. Add a 2 px `--jane-line` ring in CSS.
- `--jane-line` is for decoration only (white on it = 3.07, fails AA). Use `--primary` for text and buttons.
- No comic pages are included. The in-app comic is a future grant milestone and is not built for this application.

## Font reminder (coding agent)
The UI font is **Mitr** (SIL Open Font License, by Cadson Demak). It is **not shipped from here**. The coding agent must fetch it from Google Fonts / the Cadson Demak repository and self-host it under the app's strict CSP (no runtime CDN, so it works offline). Include the OFL text with the font files.
