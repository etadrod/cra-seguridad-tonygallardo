'use strict';
// Evaluación de una incidencia según la rúbrica (data/rubrica.json) y el guion del supuesto.
// Nota sobre 10: 30 % tiempo + 70 % procedimiento (pesos EDITABLES en rubrica.json).
const { rubrica, clasifPorId, preguntaPorId } = require('./datos');

const r2 = (n) => Math.round(n * 100) / 100;
const clamp = (n) => Math.max(0, Math.min(1, n));
const V = rubrica.verificaciones;
const A = rubrica.avisos;
const D = rubrica.datosAviso;

function nivel(ratio) {
  for (const n of rubrica.niveles) if (ratio >= n.desde - 1e-9) return n.nombre;
  return 'Insuficiente';
}

// Tiempo (sobre 3): hasta verdeSeg (140 s) el máximo; después baja lineal hasta 1 punto en el objetivo; fuera de tiempo 0
const VERDE = rubrica.tiempo.verdeSeg || 140;
function ratioTiempo(seg, limite = rubrica.tiempo.limiteSeg) {
  if (seg <= VERDE) return 1;
  if (seg > limite) return 0;
  return (3 - 2 * (seg - VERDE) / Math.max(1, limite - VERDE)) / 3;
}
const tramoTiempo = (seg, limite) => (seg <= VERDE ? 'verde' : seg <= (VERDE + limite) / 2 ? 'ambar' : seg <= limite ? 'rojo' : 'fuera');

// Documentos de control que proceden al cerrar (Orden INT/316/2011): informe explicativo (art. 14.5) y requerimiento por falsas alarmas (art. 15.1)
function documentosNecesarios(inc) {
  const ev = inc.guion.eval;
  const nec = [];
  const reales = (ev.avisos.obligatorios || []).filter((a) => a === 'fcse' || a === 'cecoes112');
  const lim = rubrica.tiempo.retrasoAvisoSeg || 180;
  if (reales.some((a) => !inc.avisos[a] || (inc.avisos[a].t - inc.cogida) / 1000 > lim)) nec.push('informe');
  if (String(ev.tipo).startsWith('falsa') && (inc.abonado.falsasUltimoMes || 0) >= 1) nec.push('requerimiento');
  return nec;
}

function evaluar(inc) {
  const ev = inc.guion.eval;
  const fin = inc.cerrada || Date.now();
  const seg = Math.max(0, Math.round((fin - (inc.cogida || fin)) / 1000));
  const hechas = new Set(inc.preguntas);
  const verif = Object.keys(inc.verif);
  const avisos = Object.keys(inc.avisos);
  const res = {};
  const mejoras = [];

  const lim = inc.limite || rubrica.tiempo.limiteSeg;
  // 1. Tiempo
  {
    const ratio = ratioTiempo(seg, lim);
    let obs = `Gestión en ${seg} s (objetivo ${lim} s) · ${(ratio * 3).toFixed(2).replace('.', ',')} de 3 puntos.`;
    if (seg > lim) {
      obs += ` Superó el tiempo objetivo de ${lim} s.`;
      mejoras.push('Agiliza la secuencia: consulta de zonas → verificación → aviso → cierre. Usa las preguntas programadas para no redactar todo a mano.');
    } else obs += ` Terminaste en el tramo ${ { verde: 'VERDE', ambar: 'ÁMBAR', rojo: 'ROJO' }[tramoTiempo(seg, lim)] } de la barra.`;
    if (tramoTiempo(seg, lim) === 'ambar' || tramoTiempo(seg, lim) === 'rojo') mejoras.push(`Intenta cerrar antes de ${VERDE} s (tramo verde) para obtener los 3 puntos de tiempo.`);
    res.tiempo = { ratio, obs };
  }

  // 2. Recepción e identificación
  {
    let a; let obsA;
    if (inc.origen === 'senal') {
      a = inc.verif.secuencial ? 1 : 0.4;
      obsA = inc.verif.secuencial ? 'Identificó la señal y las zonas activadas.' : 'No consultó la secuencia de zonas de la señal.';
      if (!inc.verif.secuencial) mejoras.push('Abre siempre la secuencia de zonas para identificar qué, dónde y cuándo se ha activado.');
    } else {
      a = hechas.has('direccion') || hechas.has('identificarse') ? 1 : 0;
      obsA = a ? 'Identificó al interlocutor y/o la dirección.' : 'No confirmó la identidad del interlocutor ni la dirección.';
      if (!a) mejoras.push('Confirma al inicio con quién hablas y la dirección exacta del suceso.');
    }
    // Si quien llama es la propia persona afectada, «¿está consciente / respira?» no procede y nunca se exige ni se sugiere.
    const afectado = !!(inc.guion.llamada && inc.guion.llamada.afectado);
    const req = (ev.preguntasClave || []).filter((p) => !(afectado && p === 'consciente'));
    const ok = req.filter((p) => hechas.has(p));
    const b = req.length ? ok.length / req.length : 1;
    const falta = req.filter((p) => !hechas.has(p));
    let obsB = req.length ? `Preguntas clave: ${ok.length}/${req.length}.` : '';
    if (falta.length) {
      obsB += ` Faltó: ${falta.map((p) => `«${preguntaPorId[p].texto}»`).join(' · ')}`;
      mejoras.push(`No olvides preguntar/indicar: ${falta.map((p) => preguntaPorId[p].texto).join(' | ')}`);
    }
    res.recepcion = { ratio: 0.5 * a + 0.5 * b, obs: `${obsA} ${obsB}`.trim() };
  }

  // 3. Verificación
  {
    const alguna = ev.verificacion.algunaDe || [];
    const oblig = ev.verificacion.obligatorias || [];
    const prohib = ev.verificacion.prohibidas || [];
    const okAlguna = alguna.some((v) => inc.verif[v]);
    const okOblig = oblig.filter((v) => inc.verif[v]);
    let ratio = (okAlguna ? 0.6 : 0) + (oblig.length ? (okOblig.length / oblig.length) * 0.4 : (okAlguna ? 0.4 : 0));
    const partes = [];
    partes.push(verif.length ? `Verificaciones: ${verif.map((v) => V[v]).join(', ')}.` : 'No realizó ninguna verificación.');
    const faltaOblig = oblig.filter((v) => !inc.verif[v]);
    if (faltaOblig.length) {
      partes.push(`Faltó: ${faltaOblig.map((v) => V[v]).join(', ')}.`);
      mejoras.push(`Para este tipo de señal aplica: ${faltaOblig.map((v) => V[v]).join(', ')}.`);
    }
    if (!okAlguna && !faltaOblig.length) mejoras.push(`Verifica la señal antes de decidir (p. ej.: ${alguna.map((v) => V[v]).join(' / ')}).`);
    const malas = prohib.filter((v) => inc.verif[v]);
    if (malas.length) {
      ratio -= 0.5 * malas.length;
      partes.push(`Procedimiento contraindicado: ${malas.map((v) => V[v]).join(', ')}.`);
      mejoras.push('En un atraco silencioso en curso no se llama a la instalación: se verifica por audio/vídeo para no poner en riesgo a las personas.');
    }
    res.verificacion = { ratio: clamp(ratio), obs: partes.join(' ') };
  }

  // 4. Clasificación
  {
    const elegida = inc.cierre && inc.cierre.clasificacion;
    const correcta = ev.tipo;
    let ratio = 0; let obs;
    if (!elegida) { obs = 'La incidencia no se cerró ni se clasificó.'; mejoras.push('Cierra siempre la incidencia con su clasificación.'); }
    else if (elegida === correcta) { ratio = 1; obs = `Clasificación correcta: ${clasifPorId[correcta].nombre}.`; }
    else {
      const fe = clasifPorId[elegida] && clasifPorId[elegida].familia;
      const fc = clasifPorId[correcta].familia;
      ratio = fe === fc ? 0.5 : 0;
      obs = `Clasificó como «${clasifPorId[elegida] ? clasifPorId[elegida].nombre : elegida}»; lo correcto era «${clasifPorId[correcta].nombre}».`;
      if (correcta === 'coaccion') mejoras.push('El interlocutor dio la PALABRA DE COACCIÓN: compara siempre la palabra recibida con la clave y la de coacción de la ficha y no anules la alarma.');
      else if (fc === 'falsa' && fe !== 'falsa') mejoras.push('Valora si la verificación descarta la amenaza: una falsa alarma bien identificada evita movilizar a las FCSE sin necesidad.');
      else if (fc !== 'falsa' && fe === 'falsa') mejoras.push('No cierres como falsa alarma sin una verificación que lo confirme: la señal era real.');
      else mejoras.push(`Revisa la tipología: este caso corresponde a «${clasifPorId[correcta].nombre}».`);
    }
    res.clasificacion = { ratio, obs };
  }

  // 5. Respuesta y transmisión
  {
    const oblig = ev.avisos.obligatorios || [];
    const prohib = ev.avisos.prohibidos || [];
    const okO = oblig.filter((a) => inc.avisos[a]);
    let ratio = oblig.length ? (okO.length / oblig.length) * 0.7 : 0.7;
    const partes = [];
    partes.push(avisos.length ? `Avisos: ${avisos.map((a) => A[a]).join(', ')}.` : 'No realizó avisos.');
    const faltaO = oblig.filter((a) => !inc.avisos[a]);
    if (faltaO.length) {
      partes.push(`Faltó: ${faltaO.map((a) => A[a]).join(', ')}.`);
      mejoras.push(`Debiste realizar: ${faltaO.map((a) => A[a]).join(', ')}.`);
    }
    const req = ev.datosAviso || [];
    const dados = new Set([...(inc.avisos.fcse ? inc.avisos.fcse.datos : []), ...(inc.avisos.cecoes112 ? inc.avisos.cecoes112.datos : [])]);
    if (req.length) {
      const okD = req.filter((d) => dados.has(d));
      ratio += (okD.length / req.length) * 0.3;
      const faltaD = req.filter((d) => !dados.has(d));
      if (faltaD.length && (inc.avisos.fcse || inc.avisos.cecoes112)) {
        partes.push(`Datos no transmitidos: ${faltaD.map((d) => D[d]).join(', ')}.`);
        mejoras.push(`Al transmitir el aviso incluye: ${faltaD.map((d) => D[d]).join(', ')}.`);
      }
    } else if (!faltaO.length) ratio += 0.3;
    const malos = prohib.filter((a) => inc.avisos[a]);
    if (malos.length) {
      ratio -= 0.4 * malos.length;
      partes.push(`Aviso improcedente: ${malos.map((a) => A[a]).join(', ')}.`);
      mejoras.push('No movilices a FCSE ni 1-1-2 ante una falsa alarma o incidencia técnica verificada: genera servicios innecesarios.');
    }
    if (inc.avisos.fcse && inc.avisos.fcse.cuerpo && inc.abonado.cuerpoCompetente && inc.avisos.fcse.cuerpo !== inc.abonado.cuerpoCompetente) {
      ratio -= 0.1;
      partes.push(`Cuerpo avisado: ${inc.avisos.fcse.cuerpo}; la ficha indica ${inc.abonado.cuerpoCompetente}.`);
      mejoras.push('Comprueba en la ficha del abonado el cuerpo policial competente antes de transmitir el aviso.');
    }
    res.comunicacion = { ratio: clamp(ratio), obs: partes.join(' ') };
  }

  // 6. Libro-registro, documentos de control y cierre
  {
    const obsTxt = (inc.cierre && inc.cierre.observaciones || '').trim();
    const a = obsTxt.length >= 30 ? 1 : obsTxt.length > 0 ? 0.5 : 0;
    if (a < 1) mejoras.push('Anota en el libro-registro de alarmas qué ocurrió, qué verificaste, a quién avisaste y la hora (mínimo 30 caracteres).');
    const nec = documentosNecesarios(inc);
    const marc = new Set((inc.cierre && inc.cierre.documentos) || []);
    const DOC = rubrica.documentos;
    const partes = [obsTxt ? `Libro-registro: anotación de ${obsTxt.length} caracteres.` : 'Sin anotación en el libro-registro.'];
    let okDoc = 0;
    for (const d of Object.keys(DOC)) {
      const debe = nec.includes(d); const hizo = marc.has(d);
      if (debe === hizo) { okDoc++; if (debe) partes.push(`Documento correcto: ${DOC[d].split(' (')[0]}.`); }
      else if (debe) {
        partes.push(`Faltó: ${DOC[d].split(' (')[0]}.`);
        mejoras.push(d === 'informe' ? `La alarma real no se comunicó o se comunicó con retraso (más de ${rubrica.tiempo.retrasoAvisoSeg || 180} s): marca el informe explicativo, que se entrega al servicio policial y al titular en 10 días.` : 'El abonado ya tenía falsas alarmas en el último mes: con esta suma 2 o más, marca el requerimiento al titular para subsanar en 72 h.');
      } else {
        partes.push(`Marcado sin proceder: ${DOC[d].split(' (')[0]}.`);
        mejoras.push(d === 'informe' ? 'El informe explicativo solo procede si una alarma real no se comunicó o se comunicó con retraso.' : 'El requerimiento solo procede ante una falsa alarma cuando el abonado acumula 2 o más en un mes (mira la ficha).');
      }
    }
    res.registro = { ratio: 0.5 * a + 0.5 * okDoc / Object.keys(DOC).length, obs: partes.join(' ') };
  }

  // El tiempo puntúa en proporción a la calidad del procedimiento: cerrar rápido y mal no puntúa.
  {
    const proc = rubrica.criterios.filter((c) => c.id !== 'tiempo');
    const maxProc = proc.reduce((s, c) => s + c.max, 0);
    const pProc = proc.reduce((s, c) => s + c.max * res[c.id].ratio, 0);
    const factor = maxProc ? pProc / maxProc : 1;
    if (factor < 1 && res.tiempo.ratio > 0) res.tiempo.obs += ` Ponderado por la calidad del procedimiento (${Math.round(factor * 100)} %).`;
    res.tiempo.ratio *= factor;
  }

  // Error grave (colgar sin gestión): todos los criterios a 0
  if (inc.errorGrave) {
    for (const k of Object.keys(res)) res[k] = { ratio: 0, obs: `Anulado por error grave: ${inc.errorGrave}` };
    mejoras.unshift('ERROR GRAVE: nunca cuelgues ni descartes una señal o llamada sin gestionarla. Como mínimo, identifica la señal, verifica y registra antes de finalizar la comunicación.');
  }

  const criterios = rubrica.criterios.map((c) => {
    const x = res[c.id];
    return { id: c.id, nombre: c.nombre, ce: c.ce, max: c.max, puntos: r2(c.max * x.ratio), nivel: nivel(x.ratio), obs: x.obs };
  });
  const nota = r2(criterios.reduce((s, c) => s + c.puntos, 0));
  return { nota, segundos: seg, limite: lim, criterios, mejoras: [...new Set(mejoras)], solucion: ev.solucion, cerradaPorAlumno: !!(inc.cierre && inc.cierre.clasificacion), errorGrave: inc.errorGrave || null };
}

module.exports = { evaluar, ratioTiempo, documentosNecesarios };
