'use strict';
// Estado y lógica de la Central Receptora de Alarmas (en memoria).
const EventEmitter = require('events');
const { config, supuestos, supuestoPorId, abonadoPorId, clasifPorId, rubrica } = require('./datos');
const { responder } = require('./interlocutor');
const { evaluar } = require('./evaluacion');

const F = Math.max(0.01, Number(process.env.FACTOR_VELOCIDAD || 1)); // >1 acelera retardos (pruebas)
const ms = (seg) => Math.round((seg * 1000) / F);
const ahora = () => Date.now();
const rnd = (a, b) => a + Math.random() * (b - a);

const ev = new EventEmitter();
const S = {
  actividad: { estado: 'espera', modo: 'actividad', inicio: null, fin: null },
  programa: supuestos.map((s) => ({ supId: s.id, minuto: s.minuto, entra: true, destino: 'todos', lanzado: false })),
  alumnos: {},           // clientId -> { id, nombre, puesto, conectado, esBot }
  puestos: {},           // n -> clientId | null
  incidencias: [],
  mensajes: [],
  contador: 0,
  test: { proximoLanzamiento: 0 },
};
for (let n = 1; n <= config.numPuestos; n++) S.puestos[n] = null;

let sucio = true;
const marcar = () => { sucio = true; ev.emit('cambio'); };
const tomarSucio = () => { const s = sucio; sucio = false; return s; };

const enCurso = () => S.actividad.estado === 'en_curso';
const enPausa = () => enCurso() && !!S.actividad.pausadaDesde;
// La nota y la corrección se muestran al alumno en práctica (y en el TEST); en evaluación, solo al finalizar.
const verNota = () => S.actividad.tipo !== 'evaluacion' || S.actividad.estado === 'finalizada';
const MSG_PAUSA = 'La actividad está en pausa. Espera a que el docente la reanude.';
const pad = (n, l = 4) => String(n).padStart(l, '0');

// ---------- Alumnos y puestos ----------
function puestoDe(id) { const a = S.alumnos[id]; return a ? a.puesto : null; }

function entrarPuesto(id, nombre, puesto) {
  nombre = String(nombre || '').trim().slice(0, 60);
  puesto = Number(puesto);
  if (!nombre) return { error: 'Escribe tu nombre y apellidos.' };
  if (!S.puestos.hasOwnProperty(puesto)) return { error: 'Puesto no válido.' };
  const ocupante = S.puestos[puesto];
  if (ocupante && ocupante !== id) {
    const o = S.alumnos[ocupante];
    if (o && (o.conectado || o.esBot)) return { error: `El puesto ${puesto} está ocupado por ${o.nombre}.` };
    // Puesto ocupado por un alumno desconectado con el mismo nombre: se recupera la sesión
    if (o && o.nombre.toLowerCase() !== nombre.toLowerCase()) return { error: `El puesto ${puesto} está reservado para ${o.nombre}. Pide al docente que lo libere.` };
    if (o) { // traspaso de identidad (mismo nombre, otra pestaña/equipo)
      S.alumnos[id] = { ...o, id, conectado: true };
      delete S.alumnos[ocupante];
      for (const inc of S.incidencias) if (inc.alumnoId === ocupante) inc.alumnoId = id;
      S.puestos[puesto] = id;
      marcar();
      return { ok: true };
    }
  }
  const previo = S.alumnos[id];
  if (previo && previo.puesto && previo.puesto !== puesto) {
    if (activaDe(id)) return { error: 'Cierra la incidencia en curso antes de cambiar de puesto.' };
    S.puestos[previo.puesto] = null;
  }
  S.alumnos[id] = { id, nombre, puesto, conectado: true, esBot: false };
  S.puestos[puesto] = id;
  // Evaluación ya iniciada: el alumno que se incorpora recibe los mismos supuestos que el resto
  if (enCurso() && S.actividad.tipo === 'evaluacion' && (S.actividad.lanzados || []).length) {
    const tiene = new Set(S.incidencias.filter((i) => i.cola === puesto || i.alumnoId === id).map((i) => i.supId));
    for (const sup of S.actividad.lanzados) if (!tiene.has(sup)) crearIncidencia(sup, puesto, false);
  }
  marcar();
  return { ok: true };
}

function liberarPuesto(puesto) {
  const id = S.puestos[puesto];
  if (!id) return { ok: true };
  if (activaDe(id)) return { error: 'El puesto tiene una incidencia en curso.' };
  S.puestos[puesto] = null;
  if (S.alumnos[id]) S.alumnos[id].puesto = null;
  marcar();
  return { ok: true };
}

function conexion(id, conectado) {
  const a = S.alumnos[id];
  if (a && a.conectado !== conectado) { a.conectado = conectado; marcar(); }
}

// ---------- Incidencias ----------
function crearIncidencia(supId, cola, esTest) {
  const s = supuestoPorId[supId];
  if (!s) return null;
  const inc = {
    id: `INC-${pad(++S.contador)}`,
    supId,
    guion: s,
    abonado: abonadoPorId[s.abonadoId],
    origen: s.origen,
    senal: s.senal,
    cola,
    // Tiempo objetivo según el tipo de actividad: práctica (y TEST) 240 s · evaluación 190 s [EDITABLE en data/config.json]
    limite: S.actividad.tipo === 'evaluacion' ? (config.tiempoEvaluacionSeg || 190) : (config.tiempoPracticaSeg || 240),
    estado: 'cola',
    creada: ahora(),
    puesto: null, alumnoId: null, cogida: null, cerrada: null,
    chat: [], llamadaAbierta: false, llamadaAbiertaEn: null, llamadaRealizada: false,
    preguntas: [], verif: {}, avisos: {}, acciones: [], pendientes: [],
    vigilanteEnviado: false,
    cierre: null, eval: null, test: !!esTest,
  };
  S.incidencias.push(inc);
  ev.emit('senal_nueva', { cola, id: inc.id, origen: inc.origen });
  marcar();
  return inc;
}

function lanzarManual(supId, destino) {
  if (S.actividad.tipo === 'evaluacion' && S.actividad.modo === 'actividad' && enCurso()) return { error: 'En la evaluación los supuestos entran solos, en el orden marcado, cada ' + S.actividad.intervalo + ' s.' };
  return lanzar(supId, destino);
}

function lanzar(supId, destino, esTest = S.actividad.modo === 'test') {
  if (!enCurso()) return { error: 'La actividad no está en curso.' };
  if (enPausa()) return { error: 'La actividad está en pausa: reanúdala para lanzar supuestos.' };
  if (!supuestoPorId[supId]) return { error: 'Supuesto inexistente.' };
  // Evaluación: el docente elige los casos y todos los puestos reciben exactamente los mismos
  const evaluacion = S.actividad.tipo === 'evaluacion' && S.actividad.modo === 'actividad';
  if (evaluacion) { destino = 'todos'; S.actividad.lanzados = S.actividad.lanzados || []; if (!S.actividad.lanzados.includes(supId)) S.actividad.lanzados.push(supId); }
  const creadas = [];
  if (destino === 'todos') {
    const ocupados = Object.keys(S.puestos).filter((n) => S.puestos[n]);
    if (!ocupados.length) return { error: evaluacion ? 'No hay alumnos en los puestos: en evaluación cada supuesto se envía a todos los puestos ocupados.' : 'No hay puestos ocupados: usa «cola común».' };
    for (const n of ocupados) creadas.push(crearIncidencia(supId, Number(n), esTest));
  } else if (String(destino).startsWith('puesto:')) {
    creadas.push(crearIncidencia(supId, Number(String(destino).split(':')[1]), esTest));
  } else {
    creadas.push(crearIncidencia(supId, 'comun', esTest));
  }
  return { ok: true, ids: creadas.map((i) => i.id) };
}

const activaDe = (id) => S.incidencias.find((i) => i.estado === 'atencion' && i.alumnoId === id);
const visiblePara = (inc, puesto) => inc.estado === 'cola' && (inc.cola === 'comun' || inc.cola === puesto);

function sis(inc, texto) { inc.chat.push({ de: 'sis', texto, t: ahora() }); }
function registrar(inc, tipo, detalle) { inc.acciones.push({ t: ahora(), tipo, detalle: detalle || '' }); }

function abrirLlamada(inc) {
  const g = inc.guion.llamada || {};
  inc.llamadaAbierta = true;
  inc.llamadaRealizada = true;
  inc.llamadaAbiertaEn = ahora();
  inc.verif.llamada = inc.verif.llamada || ahora();
  if (inc.origen === 'senal') inc.avisos.titular = inc.avisos.titular || { t: ahora() };
  const retardo = inc.origen === 'llamada' ? 0 : ms(1.5);
  if (g.inicial) inc.pendientes.push({ at: ahora() + retardo, tipo: 'int', texto: g.inicial });
  for (const e of g.evolucion || []) inc.pendientes.push({ at: ahora() + ms(e.seg), tipo: 'int', texto: e.texto, siLlamada: true });
}

// Coger la señal: comprobación atómica (solo el primero la obtiene)
function coger(id, incId) {
  if (!enCurso()) return { error: 'La actividad no está en curso.' };
  if (enPausa()) return { error: MSG_PAUSA };
  const al = S.alumnos[id];
  if (!al || !al.puesto) return { error: 'No estás en ningún puesto.' };
  if (activaDe(id)) return { error: 'Ya estás atendiendo una incidencia. Ciérrala antes de coger otra.' };
  const inc = S.incidencias.find((i) => i.id === incId);
  if (!inc || !visiblePara(inc, al.puesto)) return { error: 'La señal ya ha sido atendida por otro puesto.' };
  inc.estado = 'atencion';
  inc.alumnoId = id;
  inc.puesto = al.puesto;
  inc.cogida = ahora();
  if (inc.origen === 'llamada') {
    sis(inc, `Llamada entrante asociada a la señal ${inc.senal.codigo} · ${inc.senal.evento} (${inc.senal.zona}).`);
    abrirLlamada(inc);
  } else {
    sis(inc, `Señal ${inc.senal.codigo} · ${inc.senal.evento} · Zona ${inc.senal.zona}. Aplique el procedimiento de verificación.`);
  }
  registrar(inc, 'coger');
  ev.emit('senal_cogida', { id: inc.id, cola: inc.cola, puesto: al.puesto });
  marcar();
  return { ok: true, id: inc.id };
}

function propia(id) {
  const inc = activaDe(id);
  if (!inc) return { error: 'No tienes ninguna incidencia en curso.' };
  if (!enCurso()) return { error: 'La actividad no está en curso.' };
  if (enPausa()) return { error: MSG_PAUSA };
  return { inc };
}

function pregunta(id, { preguntaId, texto }) {
  const { inc, error } = propia(id);
  if (error) return { error };
  if (!inc.llamadaAbierta) return { error: 'No hay ninguna llamada abierta. Usa «Llamar al titular» para hablar con el abonado.' };
  const { preguntaPorId } = require('./datos');
  const textoOp = preguntaId ? preguntaPorId[preguntaId] && preguntaPorId[preguntaId].texto : String(texto || '').trim().slice(0, 500);
  if (!textoOp) return { error: 'Mensaje vacío.' };
  inc.chat.push({ de: 'op', texto: textoOp, t: ahora() });
  const r = responder(inc, { preguntaId, texto: textoOp });
  for (const p of r.ids) if (!inc.preguntas.includes(p)) inc.preguntas.push(p);
  inc.gestiones = (inc.gestiones || 0) + 1;
  registrar(inc, preguntaId ? 'pregunta' : 'mensaje', textoOp);
  inc.pendientes.push({ at: ahora() + ms(1.2), tipo: 'int', texto: r.texto });
  marcar();
  return { ok: true, identificadas: r.ids };
}

const DEFECTOS = {
  llavero: 'Servicio de acuda: recibido. Nos desplazamos a la instalación con las llaves.',
  tecnico: 'Servicio técnico: recibido. Se programa revisión del sistema.',
  vigilante: 'Vigilante en el lugar: revisión exterior sin novedad aparente.',
};

function accion(id, { tipo, datos = {} }) {
  const { inc, error } = propia(id);
  if (error) return { error };
  const g = inc.guion;
  const a = inc.abonado;
  const t = ahora();
  switch (tipo) {
    case 'secuencial': {
      const horaC = (ms_) => new Date(ms_).toLocaleTimeString('es-ES', { timeZone: 'Atlantic/Canary', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const sec = g.secuencia || [];
      const lineas = sec.map((s) => {
        const z = a.zonas.find((x) => x.z === s.zona);
        return `${horaC(inc.creada + s.seg * 1000)} · ${s.zona}${z ? ` ${z.desc}` : ''} → ${s.evento}`;
      });
      const zonas = [...new Set(sec.filter((s) => a.zonas.some((x) => x.z === s.zona)).map((s) => s.zona))];
      const lectura = zonas.length >= 2
        ? `Se han activado ${zonas.length} detectores distintos (${zonas.join(', ')}) en poco tiempo: indicio de presencia real (verificación secuencial positiva).`
        : zonas.length === 1
          ? `Solo se ha activado un detector (${zonas[0]}${sec.filter((s) => s.zona === zonas[0]).length > 1 ? ', de forma repetida' : ''}): la secuencia por sí sola NO confirma la alarma. Completa con otra verificación (vídeo, audio o personal).`
          : 'La señal no procede de detectores de intrusión: valora el tipo de evento y verifica por otro medio.';
      sis(inc, `📋 Zonas activadas en la centralita (registro de eventos):\n${lineas.join('\n')}\n\nLectura: ${lectura}`);
      inc.verif.secuencial = inc.verif.secuencial || t;
      break;
    }
    case 'video':
      if (!a.video) sis(inc, '📹 El abonado no dispone de verificación por vídeo.');
      else {
        sis(inc, `📹 Verificación por vídeo: ${g.video || 'imagen sin novedad, no se observa actividad.'}`);
        inc.verif.video = inc.verif.video || t;
        if (g.videoClip) inc.clip = { id: g.videoClip, n: (inc.clip ? inc.clip.n : 0) + 1, desc: g.video || '' };
      }
      break;
    case 'audio':
      if (!a.audio) sis(inc, '🎧 El abonado no dispone de verificación por audio.');
      else { sis(inc, `🎧 Verificación por audio: ${g.audio || 'no se escucha actividad en la instalación.'}`); inc.verif.audio = inc.verif.audio || t; }
      break;
    case 'llamar': {
      if (inc.llamadaAbierta) return { error: 'Ya hay una llamada abierta.' };
      const l = g.llamada || {};
      const c = a.contactos[0];
      sis(inc, `📞 Llamando a ${c.nombre} (${c.relacion}) · ${c.telefono}…`);
      if (l.contesta === false) {
        inc.pendientes.push({ at: t + ms(3), tipo: 'sis', texto: '📞 No contesta. Salta el buzón de voz.' });
        inc.llamadaRealizada = true;
      } else {
        abrirLlamada(inc);
      }
      break;
    }
    case 'colgar':
      // Colgar sin haber realizado ninguna gestión es un ERROR GRAVE: la incidencia se cierra con nota 0.
      if (!inc.gestiones) {
        inc.errorGrave = inc.origen === 'llamada'
          ? 'Colgó la llamada del alertante sin realizar ninguna gestión.'
          : 'Colgó / descartó la señal de alarma sin realizar ninguna gestión.';
        sis(inc, `⛔ ${inc.origen === 'llamada' ? 'Llamada colgada' : 'Señal descartada'} sin gestión. ERROR GRAVE.`);
        registrar(inc, 'colgar', 'sin gestión');
        finalizarIncidencia(inc, { clasificacion: null, observaciones: '' });
        ev.emit('evaluada', { alumnoId: id, id: inc.id });
        marcar();
        return { ok: true, errorGrave: true, eval: verNota() ? inc.eval : null };
      }
      if (!inc.llamadaAbierta) return { error: 'No hay ninguna llamada en curso.' };
      inc.llamadaAbierta = false;
      sis(inc, '📞 Llamada finalizada.');
      break;
    case 'vigilante':
      if (inc.vigilanteEnviado) return { error: 'El vigilante ya está en camino.' };
      inc.vigilanteEnviado = true;
      inc.verif.vigilante = t;
      {
        const seg = (g.vigilante && g.vigilante.seg) || 25;
        sis(inc, `🚗 Vigilante enviado para verificación in situ. Llegada estimada: ${seg} s.`);
        inc.pendientes.push({ at: t + ms(seg), tipo: 'sis', texto: `🚗 ${(g.vigilante && g.vigilante.informe) || DEFECTOS.vigilante}` });
      }
      break;
    case 'fcse': {
      const cuerpo = config.cuerposSeguridad.includes(datos.cuerpo) ? datos.cuerpo : null;
      if (!cuerpo) return { error: 'Selecciona el cuerpo policial.' };
      const ds = (datos.datos || []).filter((d) => rubrica.datosAviso[d]);
      inc.avisos.fcse = { t, cuerpo, datos: ds, texto: String(datos.texto || '').slice(0, 500) };
      sis(inc, `🚓 Aviso transmitido a ${cuerpo}. Datos: ${ds.map((d) => rubrica.datosAviso[d]).join(', ') || 'ninguno'}.${datos.texto ? ` Mensaje: «${String(datos.texto).slice(0, 300)}»` : ''}`);
      inc.pendientes.push({ at: t + ms(2), tipo: 'sis', texto: `🚓 ${cuerpo}: recibido, se comisiona una patrulla.` });
      break;
    }
    case 'cecoes112': {
      const ds = (datos.datos || []).filter((d) => rubrica.datosAviso[d]);
      const motivo = String(datos.motivo || 'Emergencia').slice(0, 80);
      inc.avisos.cecoes112 = { t, motivo, datos: ds, texto: String(datos.texto || '').slice(0, 500) };
      sis(inc, `🚑 Aviso transmitido al 1-1-2 (CECOES) · ${motivo}. Datos: ${ds.map((d) => rubrica.datosAviso[d]).join(', ') || 'ninguno'}.${datos.texto ? ` Mensaje: «${String(datos.texto).slice(0, 300)}»` : ''}`);
      inc.pendientes.push({ at: t + ms(2), tipo: 'sis', texto: '🚑 1-1-2: recibido, se activan los recursos.' });
      break;
    }
    case 'llavero':
      inc.avisos.llavero = { t };
      sis(inc, `🔑 Aviso al servicio de acuda (custodia de llaves): ${a.contactos[1] ? `${a.contactos[1].nombre} · ${a.contactos[1].telefono}` : 'sin contacto'}.`);
      inc.pendientes.push({ at: t + ms(2), tipo: 'sis', texto: `🔑 ${g.llavero || DEFECTOS.llavero}` });
      break;
    case 'tecnico':
      inc.avisos.tecnico = { t };
      sis(inc, '🛠️ Aviso al servicio técnico (SAT).');
      inc.pendientes.push({ at: t + ms(2), tipo: 'sis', texto: `🛠️ ${g.tecnico || DEFECTOS.tecnico}` });
      break;
    default:
      return { error: 'Acción desconocida.' };
  }
  inc.gestiones = (inc.gestiones || 0) + 1;
  registrar(inc, tipo, JSON.stringify(datos || {}));
  marcar();
  return { ok: true };
}

function finalizarIncidencia(inc, cierre) {
  inc.cierre = cierre;
  inc.cerrada = ahora();
  inc.estado = 'cerrada';
  inc.llamadaAbierta = false;
  inc.pendientes = [];
  inc.eval = evaluar(inc);
}

function cerrar(id, { clasificacion, observaciones }) {
  const { inc, error } = propia(id);
  if (error) return { error };
  if (!clasifPorId[clasificacion]) return { error: 'Selecciona la clasificación de la incidencia.' };
  finalizarIncidencia(inc, { clasificacion, observaciones: String(observaciones || '').slice(0, 2000) });
  registrar(inc, 'cerrar', clasificacion);
  ev.emit('evaluada', { alumnoId: id, id: inc.id });
  marcar();
  return { ok: true, eval: verNota() ? inc.eval : null };
}

// ---------- Actividad y TEST ----------
// tipo: 'practica' (corrección al cerrar cada incidencia, guía disponible) | 'evaluacion' (sin nota ni guía hasta finalizar)
// tipo 'online': siempre activo por defecto; cada alumno, al entrar en su puesto, recibe los supuestos del modo online
// (los 10 primeros, sin los de la evaluación) en orden aleatorio, uno tras otro a su ritmo. Corrección como en práctica.
function iniciarActividad(tipo = 'practica', intervalo) {
  if (enCurso() && S.actividad.tipo === 'online' && S.actividad.modo === 'actividad') detenerOnline();
  if (enCurso()) return { error: 'Ya hay una actividad en curso.' };
  if (!['practica', 'evaluacion', 'online'].includes(tipo)) return { error: 'Tipo de actividad no válido.' };
  borrarResultados(false);
  S.actividad = { estado: 'en_curso', modo: 'actividad', tipo, inicio: ahora(), fin: null };
  if (tipo === 'online') S.online = {};
  if (tipo === 'evaluacion') {
    // Evaluación: los supuestos marcados se envían en orden, uno cada «intervalo» segundos (240 por defecto), el primero al iniciar
    const iv = Math.round(Number(intervalo));
    S.actividad.intervalo = iv >= 30 && iv <= 1800 ? iv : (config.intervaloEvaluacionSeg || 240);
    S.actividad.secuencia = S.programa.filter((p) => p.entra).map((p) => p.supId);
    S.actividad.enviados = 0;
  }
  for (const p of S.programa) p.lanzado = false;
  marcar();
  return { ok: true };
}

function poolOnline() {
  const excl = new Set([...(config.evaluacionPorDefecto || []), ...(S.programa.filter((p) => p.entra && S.actividad.tipo === 'evaluacion').map((p) => p.supId))]);
  return ((config.online && config.online.supuestos) || supuestos.slice(0, 10).map((x) => x.id)).filter((id) => supuestoPorId[id] && !excl.has(id));
}
function barajar(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
const enOnline = () => enCurso() && S.actividad.modo === 'actividad' && S.actividad.tipo === 'online';

// Online: entrega a cada alumno conectado su siguiente supuesto cuando no tiene ninguno pendiente
function ticOnline(t) {
  if (!enOnline()) return;
  S.online = S.online || {};
  const pausa = ((config.online && config.online.pausaEntreSeg) || 5) * 1000;
  for (const a of Object.values(S.alumnos)) {
    if (a.esBot || !a.puesto || !a.conectado) continue;
    const o = S.online[a.id] || (S.online[a.id] = { orden: barajar(poolOnline()), idx: 0, listoDesde: t });
    const pendiente = S.incidencias.some((i) => (i.estado === 'atencion' && i.alumnoId === a.id) || (i.estado === 'cola' && i.cola === a.puesto));
    if (pendiente) { o.listoDesde = null; continue; }
    if (o.listoDesde == null) { o.listoDesde = t; continue; }
    if (o.idx >= o.orden.length || t - o.listoDesde < (o.idx === 0 ? 0 : ms(pausa / 1000))) continue;
    crearIncidencia(o.orden[o.idx], a.puesto, false);
    o.idx += 1; o.listoDesde = null;
    marcar();
  }
}

function detenerOnline() {
  if (!enOnline()) return;
  for (const inc of S.incidencias) {
    if (inc.estado === 'atencion') finalizarIncidencia(inc, null);
    else if (inc.estado === 'cola') inc.estado = 'no_atendida';
  }
  S.actividad.estado = 'finalizada';
  S.actividad.fin = ahora();
}

// Sin nadie conectado durante 15 min, el online se detiene y queda en espera hasta que alguien vuelva a entrar
function reposoOnline() {
  if (!enOnline()) return false;
  for (const inc of S.incidencias) {
    if (inc.estado === 'atencion') finalizarIncidencia(inc, null);
    else if (inc.estado === 'cola') inc.estado = 'no_atendida';
  }
  S.actividad = { estado: 'espera', modo: 'actividad', inicio: null, fin: null, reposo: ahora() };
  marcar();
  return true;
}

// Si no hay nada en marcha (alguien entra en la app tras un reposo, tras FIN TEST), el modo online se activa solo
// Una actividad finalizada se conserva 12 h (para descargar informes aunque Render reinicie el servicio); después vuelve el online.
function asegurarOnline() {
  const caducada = S.actividad.estado === 'finalizada' && S.actividad.fin && ahora() - S.actividad.fin > 12 * 3600 * 1000;
  if (S.actividad.estado === 'espera' || caducada) { iniciarActividad('online'); return true; }
  return false;
}

// ---------- Pausa (solo actividad, no TEST) ----------
// Al reanudar se desplazan todas las marcas de tiempo la duración de la pausa:
// los temporizadores (120/240 s), los minutos programados y las respuestas pendientes no cuentan el tiempo en pausa.
function pausar() {
  if (!enCurso() || S.actividad.modo !== 'actividad') return { error: 'Solo se puede pausar una actividad en curso (no el TEST).' };
  if (S.actividad.pausadaDesde) return { error: 'La actividad ya está en pausa.' };
  S.actividad.pausadaDesde = ahora();
  marcar();
  return { ok: true };
}

function reanudar() {
  if (!enPausa()) return { error: 'La actividad no está en pausa.' };
  const d = ahora() - S.actividad.pausadaDesde;
  S.actividad.pausadaDesde = null;
  S.actividad.pausaTotal = (S.actividad.pausaTotal || 0) + d;
  S.actividad.inicio += d;
  for (const inc of S.incidencias) {
    if (inc.estado !== 'cola' && inc.estado !== 'atencion') continue;
    inc.creada += d;
    if (inc.cogida) inc.cogida += d;
    if (inc.llamadaAbiertaEn) inc.llamadaAbiertaEn += d;
    for (const m of inc.chat) m.t += d;
    for (const p of inc.pendientes) p.at += d;
    for (const a of inc.acciones) a.t += d;
    for (const k of Object.keys(inc.verif)) inc.verif[k] += d;
    for (const k of Object.keys(inc.avisos)) if (inc.avisos[k] && inc.avisos[k].t) inc.avisos[k].t += d;
  }
  marcar();
  return { ok: true, pausaSeg: Math.round(d / 1000) };
}

function finalizarActividad() {
  if (!enCurso()) return { error: 'No hay actividad en curso.' };
  if (enPausa()) reanudar();
  for (const inc of S.incidencias) {
    if (inc.estado === 'atencion') finalizarIncidencia(inc, null);
    else if (inc.estado === 'cola') inc.estado = 'no_atendida';
  }
  S.actividad.estado = 'finalizada';
  S.actividad.fin = ahora();
  marcar();
  return { ok: true };
}

function borrarResultados(soloTest) {
  S.incidencias = S.incidencias.filter((i) => (soloTest ? !i.test : false));
  if (!soloTest) S.mensajes = [];
}

function iniciarTest() {
  if (enOnline()) detenerOnline();
  if (enCurso()) return { error: 'Finaliza la actividad en curso antes de iniciar el TEST.' };
  borrarResultados(false);
  S.actividad = { estado: 'en_curso', modo: 'test', inicio: ahora(), fin: null };
  let k = 0;
  for (const n of Object.keys(S.puestos)) {
    if (S.puestos[n]) continue;
    const id = `bot-${n}`;
    S.alumnos[id] = { id, nombre: `BOT ${pad(n, 2)}`, puesto: Number(n), conectado: true, esBot: true, bot: { siguiente: ahora() + ms(rnd(1, 3)), plan: [] } };
    S.puestos[n] = id;
    k++;
  }
  S.test.proximoLanzamiento = ahora();
  marcar();
  return { ok: true, bots: k };
}

function finalizarTest() {
  if (S.actividad.modo !== 'test') return { error: 'No hay ningún TEST en curso.' };
  for (const [id, a] of Object.entries(S.alumnos)) {
    if (!a.esBot) continue;
    S.puestos[a.puesto] = null;
    delete S.alumnos[id];
  }
  S.incidencias = [];
  S.actividad = { estado: 'espera', modo: 'actividad', inicio: null, fin: null };
  asegurarOnline();
  marcar();
  return { ok: true };
}

// ---------- Bots (TEST) ----------
const DATOS_TODOS = Object.keys(rubrica.datosAviso);
function planBot(inc) {
  const e = inc.guion.eval;
  const pasos = [];
  if (inc.origen === 'senal') pasos.push(['accion', { tipo: 'secuencial' }]);
  const necesitaLlamada = inc.origen === 'senal' && (e.preguntasClave.length || e.verificacion.obligatorias.includes('llamada') || e.avisos.obligatorios.includes('titular')) && !e.verificacion.prohibidas.includes('llamada');
  if (necesitaLlamada) pasos.push(['accion', { tipo: 'llamar' }]);
  for (const p of e.preguntasClave) pasos.push(['pregunta', { preguntaId: p }]);
  const verifs = new Set([...e.verificacion.obligatorias, e.verificacion.algunaDe[0]]);
  for (const v of verifs) if (['video', 'audio', 'vigilante'].includes(v)) pasos.push(['accion', { tipo: v }]);
  for (const a of e.avisos.obligatorios) {
    if (a === 'fcse') pasos.push(['accion', { tipo: 'fcse', datos: { cuerpo: inc.abonado.cuerpoCompetente, datos: e.datosAviso.length ? e.datosAviso : DATOS_TODOS.slice(0, 3) } }]);
    else if (a === 'cecoes112') pasos.push(['accion', { tipo: 'cecoes112', datos: { motivo: e.tipo, datos: e.datosAviso } }]);
    else if (a === 'llavero' || a === 'tecnico') pasos.push(['accion', { tipo: a }]);
  }
  const acierto = Math.random() < config.test.probabilidadAcierto;
  const clas = acierto ? e.tipo : rubrica.clasificaciones[Math.floor(Math.random() * rubrica.clasificaciones.length)].id;
  pasos.push(['cerrar', { clasificacion: clas, observaciones: `[TEST] Gestión automática de ${inc.senal.codigo} en ${inc.abonado.nombre}. Verificación y avisos según procedimiento.` }]);
  // Ritmo de una persona: un paso cada 4–12 s (el primero a los 2–4 s), para que el docente pueda seguirlo en el visualizador
  let t = ahora() + ms(rnd(2, 4));
  return pasos.map((p) => { const x = { at: t, paso: p }; t += ms(rnd(4, 12)); return x; });
}

function ticBots(t) {
  for (const a of Object.values(S.alumnos)) {
    if (!a.esBot) continue;
    const b = a.bot;
    const inc = activaDe(a.id);
    if (!inc) {
      if (t < b.siguiente) continue;
      // Las señales de la cola común esperan 8 s antes de que un bot las coja: así el alumnado conectado también recibe señales en el TEST
      const cand = S.incidencias.find((i) => visiblePara(i, a.puesto) && (i.cola !== 'comun' || t - i.creada >= ms(8)));
      b.siguiente = t + ms(rnd(1, 4));
      if (cand && coger(a.id, cand.id).ok) b.plan = planBot(cand);
      continue;
    }
    while (b.plan.length && b.plan[0].at <= t) {
      const { paso } = b.plan.shift();
      const [tipo, arg] = paso;
      if (tipo === 'accion') accion(a.id, arg);
      else if (tipo === 'pregunta') pregunta(a.id, arg);
      else if (tipo === 'cerrar') { cerrar(a.id, arg); b.siguiente = t + ms(rnd(2, 6)); }
    }
  }
}

// ---------- Reloj de la sala ----------
function tic() {
  const t = ahora();
  if (enPausa()) return;
  for (const inc of S.incidencias) {
    if (inc.estado !== 'atencion' || !inc.pendientes.length) continue;
    const listos = inc.pendientes.filter((p) => p.at <= t);
    if (!listos.length) continue;
    inc.pendientes = inc.pendientes.filter((p) => p.at > t);
    for (const p of listos) {
      if (p.siLlamada && !inc.llamadaAbierta) continue;
      if (p.tipo === 'int' && !inc.llamadaAbierta) continue;
      inc.chat.push({ de: p.tipo === 'int' ? 'int' : 'sis', texto: p.texto, t });
    }
    marcar();
  }
  if (!enCurso()) return;
  const transcurrido = t - S.actividad.inicio;
  if (S.actividad.modo === 'actividad' && S.actividad.tipo === 'evaluacion') {
    const sec = S.actividad.secuencia || [];
    const toca = Math.min(sec.length, Math.floor(transcurrido / ms(S.actividad.intervalo)) + 1);
    while (S.actividad.enviados < toca) {
      const supId = sec[S.actividad.enviados];
      S.actividad.enviados += 1;
      const pr = S.programa.find((p) => p.supId === supId); if (pr) pr.lanzado = true;
      lanzar(supId, 'todos');
      marcar();
    }
  } else if (S.actividad.modo === 'actividad' && S.actividad.tipo === 'online') {
    ticOnline(t);
  } else if (S.actividad.modo === 'actividad') {
    for (const p of S.programa) {
      if (p.entra && !p.lanzado && transcurrido >= ms(p.minuto * 60)) {
        p.lanzado = true;
        const r = lanzar(p.supId, p.destino);
        if (r.error && S.actividad.tipo !== 'evaluacion') lanzar(p.supId, 'comun');
      }
    }
  } else {
    if (t >= S.test.proximoLanzamiento) {
      S.test.proximoLanzamiento = t + ms(config.test.intervaloLanzamientoSeg);
      const s = supuestos[Math.floor(Math.random() * supuestos.length)];
      lanzar(s.id, 'comun', true);
    }
    ticBots(t);
  }
}

function setPrograma(lista) {
  for (const x of lista || []) {
    const p = S.programa.find((q) => q.supId === x.supId);
    if (!p) continue;
    if (typeof x.entra === 'boolean') p.entra = x.entra;
    if (Number.isFinite(Number(x.minuto))) p.minuto = Math.max(0, Number(x.minuto));
    if (['comun', 'todos'].includes(x.destino)) p.destino = x.destino;
  }
  marcar();
  return { ok: true };
}

// ---------- Mensajería ----------
function mensaje(de, destino, texto) {
  texto = String(texto || '').trim().slice(0, 500);
  if (!texto) return { error: 'Mensaje vacío.' };
  const m = { t: ahora(), de, destino, texto };
  S.mensajes.push(m);
  if (S.mensajes.length > 500) S.mensajes.shift();
  marcar();
  return { ok: true, m };
}

// ---------- Vistas ----------
const nombreCierre = (i) => i.errorGrave ? 'ERROR GRAVE · colgada sin gestión' : i.cierre && i.cierre.clasificacion ? clasifPorId[i.cierre.clasificacion].nombre : 'No cerrada por el alumno';
const resumenCola = (i) => ({ limite: i.limite || 240, id: i.id, origen: i.origen, codigo: i.senal.codigo, evento: i.senal.evento, zona: i.senal.zona, abonado: i.abonado.nombre, municipio: i.abonado.municipio, creada: i.creada, cola: i.cola });

function vistaIncidencia(i, docente) {
  const v = {
    id: i.id, origen: i.origen, senal: i.senal, abonado: i.abonado, estado: i.estado, puesto: i.puesto,
    creada: i.creada, cogida: i.cogida, cerrada: i.cerrada, limite: i.limite || 240, chat: i.chat, llamadaAbierta: i.llamadaAbierta,
    verif: Object.keys(i.verif), avisos: Object.keys(i.avisos), vigilanteEnviado: i.vigilanteEnviado,
    preguntas: i.preguntas,
    clip: i.clip || null,
  };
  if (docente) { v.supId = i.supId; v.titulo = i.guion.titulo; v.alumno = S.alumnos[i.alumnoId] ? S.alumnos[i.alumnoId].nombre : '—'; v.cierre = i.cierre; v.nota = i.eval ? i.eval.nota : null; }
  return v;
}

function notaMedia(id) {
  const ns = S.incidencias.filter((i) => i.alumnoId === id && i.eval).map((i) => i.eval.nota);
  return ns.length ? Math.round((ns.reduce((a, b) => a + b, 0) / ns.length) * 100) / 100 : null;
}

function vistaAlumno(id) {
  const a = S.alumnos[id];
  const puesto = a && a.puesto;
  const act = activaDe(id);
  const mias = S.incidencias.filter((i) => i.alumnoId === id && i.estado === 'cerrada');
  return {
    yo: a ? { id: a.id, nombre: a.nombre, puesto: a.puesto } : null,
    actividad: S.actividad,
    cola: puesto ? S.incidencias.filter((i) => visiblePara(i, puesto)).map(resumenCola) : [],
    activa: act ? vistaIncidencia(act, false) : null,
    historial: mias.map((i) => ({
      id: i.id, abonado: i.abonado.nombre, codigo: i.senal.codigo, evento: i.senal.evento, segundos: i.eval.segundos,
      clasificacion: nombreCierre(i),
      nota: verNota() ? i.eval.nota : null,
      eval: verNota() ? i.eval : null,
    })),
    notaMedia: verNota() ? notaMedia(id) : null,
    mensajes: S.mensajes.filter((m) => m.destino === 'todos' || m.destino === `alumno:${id}` || (puesto && m.destino === `puesto:${puesto}`) || m.de === `alumno:${id}`),
    online: enOnline() && S.online && S.online[id] ? { hechos: S.online[id].idx, total: S.online[id].orden.length } : null,
    puestosLibres: Object.keys(S.puestos).filter((n) => !S.puestos[n] || S.puestos[n] === id).map(Number),
  };
}

function vistaDocente() {
  return {
    actividad: S.actividad,
    programa: S.programa,
    supuestos: supuestos.map((s) => ({ id: s.id, titulo: s.titulo, docente: s.docente, origen: s.origen, abonado: abonadoPorId[s.abonadoId].nombre })),
    puestos: Object.keys(S.puestos).map((n) => {
      const id = S.puestos[n];
      const a = id ? S.alumnos[id] : null;
      const act = id ? activaDe(id) : null;
      return {
        n: Number(n),
        alumno: a ? { id: a.id, nombre: a.nombre, conectado: a.conectado, esBot: a.esBot } : null,
        activa: act ? { id: act.id, cogida: act.cogida, limite: act.limite || 240, abonado: act.abonado.nombre, codigo: act.senal.codigo } : null,
        cerradas: id ? S.incidencias.filter((i) => i.alumnoId === id && i.estado === 'cerrada').length : 0,
        notaMedia: id ? notaMedia(id) : null,
      };
    }),
    cola: S.incidencias.filter((i) => i.estado === 'cola').map(resumenCola),
    activas: S.incidencias.filter((i) => i.estado === 'atencion').map((i) => vistaIncidencia(i, true)),
    cerradas: S.incidencias.filter((i) => i.estado === 'cerrada').map((i) => ({ id: i.id, titulo: i.guion.titulo, alumno: S.alumnos[i.alumnoId] ? S.alumnos[i.alumnoId].nombre : '—', puesto: i.puesto, nota: i.eval.nota, segundos: i.eval.segundos })),
    noAtendidas: S.incidencias.filter((i) => i.estado === 'no_atendida').length,
    mensajes: S.mensajes,
    online: S.online || {},
  };
}

function incidenciaDocente(incId) {
  const i = S.incidencias.find((x) => x.id === incId);
  return i ? { ...vistaIncidencia(i, true), eval: i.eval } : null;
}

// ---------- Informes ----------
function informeDe(id) {
  const a = S.alumnos[id];
  if (!a) return null;
  const incs = S.incidencias.filter((i) => i.alumnoId === id && i.eval);
  const media = notaMedia(id);
  const porCriterio = rubrica.criterios.map((c) => {
    const ps = incs.map((i) => i.eval.criterios.find((x) => x.id === c.id).puntos);
    return { id: c.id, nombre: c.nombre, ce: c.ce, max: c.max, media: ps.length ? Math.round((ps.reduce((x, y) => x + y, 0) / ps.length) * 100) / 100 : null };
  });
  return {
    alumno: a.nombre, puesto: a.puesto, esBot: a.esBot, notaMedia: media, porCriterio,
    incidencias: incs.map((i) => ({
      id: i.id, titulo: i.guion.titulo, abonado: i.abonado.nombre, municipio: i.abonado.municipio, codigo: i.senal.codigo, evento: i.senal.evento,
      origen: i.origen, cogida: i.cogida, cerrada: i.cerrada,
      clasificacion: nombreCierre(i),
      observaciones: i.cierre ? i.cierre.observaciones : '',
      eval: i.eval,
    })),
  };
}

function cabeceraInforme() {
  return { empresa: config.empresa, sala: config.nombreSala, ra: rubrica.ra, ce: rubrica.ce, fuente: rubrica.fuente, criterios: rubrica.criterios, tiempo: rubrica.tiempo, normativa: config.notaNormativa, actividad: S.actividad, generado: ahora() };
}

function informeAlumno(id, deAlumno) {
  if (deAlumno && !verNota()) return { error: 'Estás en una evaluación: podrás descargar tu informe cuando el docente finalice la actividad.' };
  const inf = informeDe(id);
  return inf ? { cabecera: cabeceraInforme(), alumno: inf } : null;
}

function informes() {
  const ids = Object.values(S.alumnos).filter((a) => S.incidencias.some((i) => i.alumnoId === a.id && i.eval)).map((a) => a.id);
  const lista = ids.map(informeDe).sort((x, y) => (x.puesto || 99) - (y.puesto || 99));
  return { cabecera: cabeceraInforme(), alumnos: lista, noAtendidas: S.incidencias.filter((i) => i.estado === 'no_atendida').map((i) => ({ id: i.id, titulo: i.guion.titulo })) };
}

// ---------- Persistencia ----------
function exportar() {
  return {
    v: 1,
    actividad: S.actividad.modo === 'test' ? { estado: 'espera', modo: 'actividad', inicio: null, fin: null } : S.actividad,
    programa: S.programa,
    contador: S.contador,
    alumnos: Object.fromEntries(Object.entries(S.alumnos).filter(([, a]) => !a.esBot).map(([k, a]) => [k, { id: a.id, nombre: a.nombre, puesto: a.puesto }])),
    puestos: Object.fromEntries(Object.entries(S.puestos).map(([n, id]) => [n, id && id.startsWith('bot-') ? null : id])),
    incidencias: S.incidencias.filter((i) => !i.test).map((i) => ({ ...i, guion: undefined, abonado: undefined, pendientes: [] })),
    mensajes: S.mensajes,
    online: S.online || {},
  };
}

function importar(d) {
  if (!d || d.v !== 1) return false;
  S.actividad = d.actividad || S.actividad;
  if (Array.isArray(d.programa)) for (const p of d.programa) { const q = S.programa.find((x) => x.supId === p.supId); if (q) Object.assign(q, p); }
  S.contador = d.contador || 0;
  S.alumnos = Object.fromEntries(Object.entries(d.alumnos || {}).map(([k, a]) => [k, { ...a, conectado: false, esBot: false }]));
  for (const n of Object.keys(S.puestos)) S.puestos[n] = (d.puestos && d.puestos[n] && S.alumnos[d.puestos[n]]) ? d.puestos[n] : null;
  S.incidencias = (d.incidencias || []).filter((i) => supuestoPorId[i.supId]).map((i) => ({ ...i, guion: supuestoPorId[i.supId], abonado: abonadoPorId[supuestoPorId[i.supId].abonadoId], pendientes: [] }));
  S.mensajes = d.mensajes || [];
  S.online = d.online || {};
  marcar();
  return true;
}

module.exports = {
  ev, S, tomarSucio, puestoDe,
  entrarPuesto, liberarPuesto, conexion,
  lanzar, lanzarManual, coger, pregunta, accion, cerrar,
  iniciarActividad, finalizarActividad, asegurarOnline, reposoOnline, pausar, reanudar, iniciarTest, finalizarTest, setPrograma,
  mensaje, tic, vistaAlumno, vistaDocente, incidenciaDocente, informeAlumno, informes,
  exportar, importar,
};
