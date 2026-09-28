# Monitor eSports Mini App — Asset Pack

Prepared for the Telegram Mini App implementation.

## Final paths after extraction

- `miniapp/public/assets/brand/logo-full.webp` — horizontal wordmark, transparent canvas, 1600x500
- `miniapp/public/assets/brand/logo-symbol.webp` — standalone M symbol, transparent, 1024x1024
- `miniapp/public/assets/brand/app-icon.webp` — official bot logo source adapted to 512x512
- `miniapp/public/assets/brand/favicon.png` — 64x64
- `miniapp/public/assets/brand/loading-mark.webp` — 256x256 loading/splash mark
- `miniapp/public/assets/heroes/hero-home.webp` — 1440x900
- `miniapp/public/assets/heroes/match-header.webp` — 1440x700
- `miniapp/public/assets/heroes/hero-pro.webp` — 1440x900
- `miniapp/public/assets/heroes/hero-history.webp` — 1440x700
- `miniapp/public/assets/states/empty-matches.webp` — 800x600
- `miniapp/public/assets/states/empty-history.webp` — 800x600
- `miniapp/public/assets/states/error-state.webp` — 800x600
- `miniapp/public/assets/games/cs2-placeholder.webp` — 256x256
- `miniapp/public/assets/games/dota2-placeholder.webp` — 256x256
- `miniapp/public/assets/games/lol-placeholder.webp` — 256x256
- `miniapp/public/assets/games/valorant-placeholder.webp` — 256x256

## Implementation notes

- The four game emblems are visual placeholders, not official game/trademark assets. Keep them replaceable.
- FREE / PRO / LIVE / WIN / LOSS badges should be built with CSS/SVG components, not raster images.
- Team logos should come from the match data layer and must not be baked into hero art.
- Text and prices must remain HTML/UI text. Do not bake copy into backgrounds.
- Use the existing bot as-is; Mini App work must be additive and must not break Telegram bot flows.
