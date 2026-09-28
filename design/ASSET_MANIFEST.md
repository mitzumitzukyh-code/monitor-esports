# Monitor eSports Mini App — Asset Pack v1

Prepared for Claude to build the first Telegram Mini App UI.

## How to materialize the assets

From the repository root on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\design\unpack-miniapp-assets.ps1
```

The script reconstructs the bundled ZIP from the 7 checked-in base64 chunks, verifies its SHA-256, extracts it at the repository root, and verifies all required files.

Expected ZIP SHA-256:

`77ff70bf59a81392c69c7b80a7d7ad808f17b934b8ec649402da134baea16ff2`

## Extracted paths

### Branding
- `miniapp/public/assets/brand/logo-full.webp` — 400×125
- `miniapp/public/assets/brand/logo-symbol.webp` — 160×160
- `miniapp/public/assets/brand/app-icon.webp` — 96×96
- `miniapp/public/assets/brand/favicon.png` — 48×48
- `miniapp/public/assets/brand/loading-mark.webp` — 48×48

### Main artwork
- `miniapp/public/assets/heroes/hero-home.webp` — 400×250
- `miniapp/public/assets/heroes/match-header.webp` — 400×194
- `miniapp/public/assets/heroes/hero-pro.webp` — 400×250
- `miniapp/public/assets/heroes/hero-history.webp` — 400×194

### Empty/error states
- `miniapp/public/assets/states/empty-matches.webp` — 256×192
- `miniapp/public/assets/states/empty-history.webp` — 256×192
- `miniapp/public/assets/states/error-state.webp` — 256×192

### Game placeholders
- `miniapp/public/assets/games/cs2-placeholder.webp` — 48×48
- `miniapp/public/assets/games/dota2-placeholder.webp` — 48×48
- `miniapp/public/assets/games/lol-placeholder.webp` — 48×48
- `miniapp/public/assets/games/valorant-placeholder.webp` — 48×48

## Usage rules

- This is the web-optimized v1 implementation/reference pack. Keep the layout responsive instead of stretching these files beyond their intended use.
- The game emblems are visual placeholders, not official game/trademark assets. Keep them replaceable.
- FREE / PRO / LIVE / WIN / LOSS badges should be CSS/SVG UI components, not raster images.
- Team logos must come from the match data layer and must not be baked into hero artwork.
- Prices, probabilities, match data, and marketing copy must remain real HTML/UI text.
- The existing Telegram bot must remain intact. Mini App work is additive.
- Do not use ARTEMIS in this workstream.
