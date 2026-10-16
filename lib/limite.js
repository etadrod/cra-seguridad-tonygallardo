'use strict';
// Límite de uso diario: cuenta los minutos con al menos una conexión (hora de Canarias).
// LIMITE_HORAS_DIA=0 (o sin definir) lo desactiva.
const persistencia = require('./persistencia');

const HORAS = Number(process.env.LIMITE_HORAS_DIA || 0);
const LIMITE_MIN = HORAS > 0 ? Math.round(HORAS * 60) : 0;

const hoyCanarias = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Atlantic/Canary' }).format(new Date());

let uso = { fecha: hoyCanarias(), minutos: 0 };
let avisado15 = false;

async function cargar() {
  const u = await persistencia.leer('uso.json');
  if (u && u.fecha === hoyCanarias()) uso = u;
}

function estado() {
  if (!LIMITE_MIN) return { activo: false };
  return { activo: true, minutos: uso.minutos, limite: LIMITE_MIN, restantes: Math.max(0, LIMITE_MIN - uso.minutos), agotado: uso.minutos >= LIMITE_MIN };
}

// Llamar una vez por minuto. Devuelve 'aviso15' | 'agotado' | null
function tic(hayConexiones) {
  const hoy = hoyCanarias();
  if (uso.fecha !== hoy) { uso = { fecha: hoy, minutos: 0 }; avisado15 = false; }
  if (!LIMITE_MIN || !hayConexiones) return null;
  uso.minutos += 1;
  persistencia.guardar('uso.json', () => uso, { espera: 5000, acumular: true, compacto: true });
  if (uso.minutos >= LIMITE_MIN) return 'agotado';
  if (!avisado15 && LIMITE_MIN - uso.minutos <= 15) { avisado15 = true; return 'aviso15'; }
  return null;
}

const agotado = () => !!LIMITE_MIN && uso.fecha === hoyCanarias() && uso.minutos >= LIMITE_MIN;

module.exports = { cargar, estado, tic, agotado };
