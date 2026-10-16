'use strict';
// Interlocutor simulado (titular, empleado, alertante) a partir del guion del supuesto.
// - Pregunta programada: se responde con el guion o con una respuesta por defecto.
// - Mensaje libre: con «?» se trata como pregunta, sin «?» como indicación.
//   Se identifica por palabras clave la pregunta programada equivalente.
const { preguntas, preguntaPorId } = require('./datos');

const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

function detectar(texto) {
  const t = norm(texto);
  const ids = [];
  for (const p of preguntas) {
    // La clave debe empezar en inicio de palabra («arma» no coincide con «alarma»)
    if (p.claves.some((c) => new RegExp(`(^|[^a-z0-9ñ])${norm(c).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t))) ids.push(p.id);
  }
  return ids;
}

function respuestaClave(inc) {
  const g = inc.guion.llamada || {};
  const a = inc.abonado;
  if (g.clave === 'coaccion') return `Eh... sí... la palabra es ${a.palabraCoaccion}.`;
  if (g.clave === 'no_sabe') return 'Uy... ahora mismo no me acuerdo de ninguna palabra, perdone.';
  return `Sí, la palabra clave es ${a.palabraClave}.`;
}

function respuestaPara(inc, id) {
  const g = inc.guion.llamada || {};
  const r = g.respuestas || {};
  if (id === 'palabra_clave') return r.palabra_clave || respuestaClave(inc);
  if (r[id]) return r[id];
  const a = inc.abonado;
  switch (id) {
    case 'identificarse': return `Soy ${g.quien || 'el titular'}.`;
    case 'direccion': return `${a.direccion}, ${a.municipio}.`;
    case 'despedida': return 'Gracias a ustedes.';
    case 'mantener_linea': return 'Vale, sigo aquí.';
    case 'aviso_dado': return 'De acuerdo, gracias.';
    case 'seguridad': return 'Vale, entendido.';
    default: return g.porDefecto || 'No sabría decirle.';
  }
}

// Devuelve { ids: [preguntas identificadas], texto: respuesta del interlocutor }
function responder(inc, { preguntaId, texto }) {
  const g = inc.guion.llamada || {};
  if (preguntaId && preguntaPorId[preguntaId]) {
    return { ids: [preguntaId], texto: respuestaPara(inc, preguntaId) };
  }
  const esPregunta = /[?¿]/.test(texto || '');
  const ids = detectar(texto);
  if (!ids.length) {
    return { ids: [], texto: esPregunta ? (g.porDefecto || 'Perdone, no le he entendido. ¿Me lo repite?') : 'Vale.' };
  }
  // Se responde a lo primero identificado; si hay una segunda, se añade.
  const partes = [...new Set(ids.slice(0, 2).map((id) => respuestaPara(inc, id)))];
  return { ids, texto: partes.join(' ') };
}

module.exports = { responder, detectar, norm };
