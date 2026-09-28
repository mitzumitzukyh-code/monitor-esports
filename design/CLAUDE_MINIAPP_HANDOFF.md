# Claude handoff — Monitor eSports Telegram Mini App

## Goal
Build the first real Telegram Mini App for Monitor eSports while keeping the existing bot intact.

## Start here
1. Extract `design/monitor-esports-miniapp-assets.zip` at repository root. It expands into `miniapp/public/assets/...`.
2. Read `design/ASSET_MANIFEST.md`.
3. Inspect the existing repository before choosing the frontend stack; reuse existing conventions where practical.
4. Do not change the current bot behavior, production payment logic, or prediction engine as part of the initial UI pass.

## V1 screens
- Inicio
- Partidos
- Detalle de partido
- Historial / Resultados
- PRO
- Más / soporte

## V1 visual direction
- Mobile-first Telegram Mini App.
- Premium dark esports look: charcoal/black, red primary accent, off-white text, graphite surfaces, restrained gold only for PRO.
- Use the supplied assets as backgrounds/branding, not as full-screen screenshots.
- Bottom navigation: Inicio / Partidos / Historial / PRO / Más.
- Keep Telegram viewport and safe areas in mind.

## Commercial UI copy currently approved
- FREE: 1 prediction daily.
- PRO: 250 Stars / 30 days.
- Individual analysis: 50 Stars.
- Positioning: “Predicciones y estadísticas para entender cada partido.”
- Supporting line: “Contexto, no solo predicciones.”

## Build order
1. Scaffold `miniapp/` only if it does not already exist.
2. Implement the UI with typed mock data first.
3. Match the approved mockup structure and asset pack.
4. Add responsive Telegram WebApp integration (`window.Telegram.WebApp`) behind a small adapter.
5. Add loading / empty / error states using supplied assets.
6. Add accessibility basics and reduced-motion support.
7. Add tests for navigation and primary cards.
8. Run locally and provide screenshots for mobile viewport review.

## Do NOT do in this first pass
- Do not deploy.
- Do not activate Main Mini App in BotFather.
- Do not enable real Stars purchases.
- Do not rewrite the prediction engine.
- Do not remove or alter current bot commands.
- Do not use ARTEMIS for this task.

## Data integration after UI approval
Connect the Mini App to the existing real data/API for matches, predictions, history, user entitlement, PRO status, and individual analysis. Keep payment actions disabled until the UI/data contract is reviewed.

## Definition of done for tomorrow's first pass
- `miniapp/` builds successfully.
- All six V1 routes/screens are reachable.
- Assets load from `miniapp/public/assets`.
- Telegram theme/safe-area handling exists.
- Mock FREE/PRO/individual-analysis states render correctly.
- No changes to existing bot behavior.
- No deploy, no payment activation.
