# Mitzu Esports Web

Frontend MVP de solo lectura para el motor `monitor-esports`.

## Qué muestra
- predicciones futuras guardadas en `eslo_predicciones`
- resultados ya calificados
- Brier reciente y acierto descriptivo del favorito
- ratings Glicko-2 actuales
- arte y logos que ya existen en `../assets`

## Seguridad
La web debe usar `SUPABASE_ANON_KEY`. Las tablas ya tienen RLS y políticas públicas de SELECT.
No expongas `SUPABASE_SERVICE_ROLE_KEY` al navegador.

## Desarrollo
```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

## Despliegue en Vercel
Usa `web` como Root Directory y define:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

El script `prebuild` copia automáticamente los assets del repositorio a `web/public/assets`.

## Nota sobre equipos
El esquema multijuego guarda IDs de equipo. La portada intenta enriquecer predicciones recientes con el feed de bo3.gg; si un nombre/logotipo no está disponible, muestra un fallback explícito en vez de inventar datos.
