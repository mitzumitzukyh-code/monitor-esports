export function accesoDe(row, perfil) {
  if (row.resultado_real === 'ganaA' || row.resultado_real === 'ganaB') return 'auditoria';
  if (perfil.plan === 'pro') return 'pro';
  if (perfil.analisis_comprados.includes(Number(row.match_id))) return 'individual';
  if (perfil.gratis_hoy === Number(row.match_id)) return 'gratis';
  return 'bloqueado';
}

export function estadoDe(row, ahora = Date.now()) {
  if (row.resultado_real === 'ganaA' || row.resultado_real === 'ganaB') return 'finalizado';
  return Date.parse(row.inicio_programado) <= ahora ? 'en_vivo' : 'proximo';
}

function gano(fila, teamId) {
  if (fila.resultado_real !== 'ganaA' && fila.resultado_real !== 'ganaB') return null;
  return (fila.resultado_real === 'ganaA') === (Number(fila.equipo_a) === Number(teamId));
}

export function forma(filas, teamId) {
  const orden = [...filas].sort((a, b) => Date.parse(b.inicio_programado) - Date.parse(a.inicio_programado)).slice(0, 8);
  const resultados = orden.map((f) => gano(f, teamId)).filter((v) => v != null);
  return {
    victorias: resultados.filter(Boolean).length,
    total: resultados.length,
    ultimas: resultados.slice(0, 5).map((v) => v ? 'G' : 'P'),
  };
}

export function h2h(filas, a, b) {
  const entre = filas.filter((f) => {
    const x = Number(f.equipo_a), y = Number(f.equipo_b);
    return (x === a && y === b) || (x === b && y === a);
  });
  return { series: entre.length, ganadasA: entre.filter((f) => gano(f, a)).length };
}

export function politicaAcceso(row, perfil) {
  const acceso = accesoDe(row, perfil);
  return {
    acceso,
    prob_a: acceso === 'bloqueado' ? null : Number(row.prob_a),
    analisisPermitido: acceso === 'pro' || acceso === 'individual',
  };
}
