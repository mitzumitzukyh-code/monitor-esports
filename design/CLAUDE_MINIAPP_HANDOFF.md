# Claude handoff — Monitor eSports Telegram Mini App

## Goal

Build the first real Telegram Mini App for Monitor eSports while keeping the existing bot intact.

## Start here tomorrow

1. Check out this branch.
2. From repository root run:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\design\unpack-miniapp-assets.ps1
   ```
3. Confirm it ends with `OK: Monitor eSports Mini App assets extracted...`.
4. Read `design/ASSET_MANIFEST.md`.
5. Inspect the existing repository before choosing the frontend stack; reuse current conventions where practical.
6. Do not change current bot behavior, production payment logic, or the prediction engine during the first UI pass.

The asset package is stored in `design/assets-pack-v1-b64/` and the unpacker verifies ZIP SHA-256 before extraction.

## V1 screens

- Inicio
- Partidos
- Detalle de partido
- Historial / Resultados
- PRO
- Más / soporte

## Visual direction

- Mobile-first Telegram Mini App.
- Premium dark eSports style: charcoal/black, red primary accent, off-white text, graphite surfaces, restrained gold only for PRO.
- Use supplied assets as branding/background art, not as screenshots.
- Bottom navigation: Inicio / Partidos / Historial / PRO / Más.
- Respect Telegram viewport and safe areas.

## Approved commercial UI copy

- FREE: 1 predicción diaria.
- PRO: 250 Stars / 30 días.
- Análisis individual: 50 Stars.
- “Predicciones y estadísticas para entender cada partido.”
- “Contexto, no solo predicciones.”

## Build order

1. Scaffold `miniapp/` only if it does not already exist.
2. Implement UI with typed mock data first.
3. Match the approved mockup structure and asset pack.
4. Add responsive Telegram WebApp integration behind a small adapter.
5. Add loading / empty / error states using supplied assets.
6. Add accessibility basics and reduced-motion support.
7. Add tests for navigation and primary cards.
8. Run locally and provide mobile screenshots for review.
9. Only after UI approval, prepare the real data contract.

## Do NOT do in the first pass

- Do not deploy.
- Do not activate Main Mini App in BotFather.
- Do not enable real Stars purchases.
- Do not rewrite the prediction engine.
- Do not remove or alter current bot commands.
- Do not use ARTEMIS.

## Data integration after UI approval

Connect the Mini App to the existing real data/API for matches, predictions, history, user entitlement, PRO status, and individual analysis. Keep payment actions disabled until the UI/data contract is reviewed.

## Definition of done for the first pass

- `miniapp/` builds successfully.
- All six V1 screens/routes are reachable.
- Assets load from `miniapp/public/assets`.
- Telegram theme/safe-area handling exists.
- Mock FREE / PRO / individual-analysis states render correctly.
- Navigation and core card tests pass.
- Existing bot behavior is unchanged.
- No deploy.
- No payment activation.

## Operator handoff

When finished, report only:
- build/test status,
- screenshots or local preview path,
- files changed,
- blockers,
- what remains before wiring real data.

Do not merge or deploy without operator approval.
