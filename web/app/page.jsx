import { getDashboard } from '../lib/data';

const GAME = {
  cs2: { label: 'CS2', logo: '/assets/logo-cs2.jpg', art: '/assets/arte-cs2.jpg' },
  dota2: { label: 'Dota 2', logo: '/assets/logo-dota2.png', art: '/assets/arte-dota2.webp' },
  lol: { label: 'LoL', logo: '/assets/logo-lol.png', art: '/assets/arte-lol.jpg' },
  valorant: { label: 'Valorant', logo: '/assets/logo-valorant.png', art: '/assets/arte-valorant.jpg' },
};

function pct(v) {
  const n = Number(v);
  return Number.isFinite(n) ? `${Math.round(n * 100)}%` : '—';
}

function hora(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(iso));
}

function fecha(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas', day: '2-digit', month: 'short',
  }).format(new Date(iso));
}

function Team({ logo, name }) {
  return <span className="team">{logo ? <img src={logo} alt="" /> : <span className="team-fallback" />}{name}</span>;
}

export default async function Home() {
  let data;
  let error = null;
  try {
    data = await getDashboard();
  } catch (e) {
    error = e.message;
    data = { predicciones: [], resultados: [], ratings: [], total: 0, brier: null, accuracy: null, nCalificadas: 0 };
  }

  return (
    <main>
      <aside className="rail">
        <img className="brand" src="/assets/logo-horizontal-light.svg" alt="Mitzu Esports" />
        <nav>
          <a className="active" href="#inicio">Inicio</a>
          <a href="#predicciones">Predicciones</a>
          <a href="#calidad">Calidad</a>
          <a href="#resultados">Resultados</a>
          <a href="#ratings">Ratings</a>
        </nav>
        <div className="games">
          {Object.entries(GAME).map(([k, g]) => <div key={k}><img src={g.logo} alt="" />{g.label}</div>)}
        </div>
      </aside>

      <section className="content" id="inicio">
        <header className="topbar">
          <div><strong>MITZU ESPORTS</strong><span>Datos reales · modelos verificables</span></div>
          <a className="outline" href="#calidad">Cómo funciona</a>
        </header>

        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">ESPORTS INTELLIGENCE</span>
            <h1>Analizamos el juego.<br/><em>Tú tomas la decisión.</em></h1>
            <p>Probabilidades calculadas por el motor del proyecto y registradas antes del partido. Sin porcentajes generados por IA.</p>
            <a className="primary" href="#predicciones">Ver predicciones de hoy</a>
          </div>
          <div className="hero-art">
            {Object.entries(GAME).map(([k, g]) => <div className="game-art" key={k} style={{backgroundImage:`linear-gradient(180deg,transparent,#07090d),url("${g.art}")`}}><img src={g.logo} alt={g.label}/></div>)}
          </div>
        </section>

        {error && <div className="notice">La interfaz está lista, pero faltan variables de Supabase en el despliegue: {error}</div>}

        <section className="stats">
          <div><span>Predicciones registradas</span><strong>{data.total.toLocaleString('es-VE')}</strong></div>
          <div><span>Brier reciente</span><strong>{data.brier == null ? '—' : data.brier.toFixed(3)}</strong><small>últimas {data.nCalificadas}</small></div>
          <div><span>Acierto de favorito</span><strong>{data.accuracy == null ? '—' : pct(data.accuracy)}</strong><small>métrica descriptiva</small></div>
          <div><span>Juegos activos</span><strong>4</strong><small>CS2 · Dota 2 · LoL · Valorant</small></div>
        </section>

        <section className="panel" id="predicciones">
          <div className="section-title"><div><span>PRÓXIMOS</span><h2>Predicciones</h2></div><p>Las probabilidades ya guardadas no se reescriben.</p></div>
          <div className="matches">
            {data.predicciones.length ? data.predicciones.map((p) => (
              <article className="match" key={p.match_id}>
                <div className="when"><strong>{hora(p.inicio_programado)}</strong><span>{fecha(p.inicio_programado)}</span></div>
                <div className="meta"><span>{GAME[p.juego]?.label || p.juego}</span><small>{p.torneo} · {String(p.formato || '').toUpperCase()}</small></div>
                <div className="duel">
                  <Team logo={p.logo_a} name={p.nombre_a}/><strong>{pct(p.prob_a)}</strong>
                  <div className="bar"><i style={{width:pct(p.prob_a)}}/></div>
                  <strong>{pct(p.prob_b)}</strong><Team logo={p.logo_b} name={p.nombre_b}/>
                </div>
                <div className="model"><b>{p.motor}</b><span>RD {Math.round(Number(p.rd_a)||0)} / {Math.round(Number(p.rd_b)||0)}</span></div>
              </article>
            )) : <div className="empty">No hay predicciones futuras guardadas en este momento.</div>}
          </div>
        </section>

        <div className="grid2">
          <section className="panel" id="resultados">
            <div className="section-title"><div><span>AUDITORÍA</span><h2>Resultados recientes</h2></div></div>
            <div className="results">
              {data.resultados.map((r) => {
                const favA = Number(r.prob_a) >= Number(r.prob_b);
                const acierto = (favA && r.resultado_real === 'ganaA') || (!favA && r.resultado_real === 'ganaB');
                return <div className="result" key={r.match_id}><span>{GAME[r.juego]?.label}</span><b>{r.nombre_a} vs {r.nombre_b}</b><strong>{pct(Math.max(Number(r.prob_a),Number(r.prob_b)))}</strong><em className={acierto?'win':'loss'}>{acierto?'ACIERTO':'FALLO'}</em></div>
              })}
              {!data.resultados.length && <div className="empty">Aún no hay resultados calificados.</div>}
            </div>
          </section>

          <section className="panel" id="calidad">
            <div className="section-title"><div><span>TRANSPARENCIA</span><h2>Calidad del modelo</h2></div></div>
            <div className="quality">
              <div className="quality-big"><span>Brier Score</span><strong>{data.brier == null ? '—' : data.brier.toFixed(4)}</strong><small>0 es perfecto · 0.25 equivale a 50/50 en binario</small></div>
              <div className="quality-copy"><h3>Publicamos también los fallos.</h3><p>El objetivo no es vender certezas. Es medir si el motor mantiene probabilidades útiles fuera de muestra y dejar un historial auditable.</p></div>
            </div>
          </section>
        </div>

        <section className="panel" id="ratings">
          <div className="section-title"><div><span>GLICKO-2</span><h2>Ratings actuales</h2></div><p>Top por fuerza estimada; el nombre usa el feed cuando está disponible.</p></div>
          <div className="ratings">
            <div className="rating-head"><span>Juego</span><span>Equipo</span><span>Rating</span><span>RD</span><span>Partidas</span></div>
            {data.ratings.slice(0,16).map((r) => <div className="rating-row" key={`${r.juego}-${r.team_id}`}><span>{GAME[r.juego]?.label || r.juego}</span><span>Equipo #{r.team_id}</span><strong>{Math.round(Number(r.rating))}</strong><span>{Math.round(Number(r.rd))}</span><span>{r.partidas}</span></div>)}
          </div>
        </section>

        <footer>
          <img src="/assets/logo-mark.svg" alt="" />
          <div><strong>MITZU ESPORTS</strong><span>Datos reales. Decisiones más inteligentes.</span></div>
          <p>No garantiza resultados ni beneficios financieros.</p>
        </footer>
      </section>
    </main>
  );
}
