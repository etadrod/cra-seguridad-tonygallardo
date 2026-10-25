'use strict';
// Simulador de Central Receptora de Alarmas (CRA) · CFGM Técnico en Seguridad · Módulo 1679
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const datos = require('./lib/datos');
const sala = require('./lib/sala');
const persistencia = require('./lib/persistencia');
const limite = require('./lib/limite');

const PORT = Number(process.env.PORT || 3000);
const PIN = process.env.DOCENTE_PIN || '';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 20000, pingTimeout: 20000 });

app.disable('x-powered-by');
app.get('/salud', (_q, r) => r.json({ ok: true, persistencia: persistencia.modo }));
app.get('/vendor/jspdf.js', (_q, r) => r.sendFile(path.join(__dirname, 'node_modules/jspdf/dist/jspdf.umd.min.js')));
app.get('/vendor/autotable.js', (_q, r) => r.sendFile(path.join(__dirname, 'node_modules/jspdf-autotable/dist/jspdf.plugin.autotable.min.js')));
app.get('/api/datos', (_q, r) => r.json({
  config: {
    empresa: datos.config.empresa, nombreSala: datos.config.nombreSala, numPuestos: datos.config.numPuestos,
    tiempoObjetivoSeg: datos.config.tiempoObjetivoSeg, intervaloEvaluacionSeg: datos.config.intervaloEvaluacionSeg, evaluacionPorDefecto: datos.config.evaluacionPorDefecto || [], cuerposSeguridad: datos.config.cuerposSeguridad, mostrarNotaAlCerrar: datos.config.mostrarNotaAlCerrar,
  },
  preguntas: datos.preguntas.map(({ id, grupo, tipo, texto }) => ({ id, grupo, tipo, texto })),
  clasificaciones: datos.rubrica.clasificaciones,
  verificaciones: datos.rubrica.verificaciones,
  avisos: datos.rubrica.avisos,
  datosAviso: datos.rubrica.datosAviso,
  criterios: datos.rubrica.criterios,
  rubrica: { ra: datos.rubrica.ra, ce: datos.rubrica.ce, fuente: datos.rubrica.fuente, tiempo: datos.rubrica.tiempo, penalizaciones: datos.rubrica.penalizaciones, notaFinal: datos.rubrica.notaFinal, niveles: datos.rubrica.niveles },
}));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// ---------- Sockets ----------
const ack = (cb, r) => { if (typeof cb === 'function') cb(r); };
const soloDocente = (socket, fn) => (arg, cb) => {
  if (typeof arg === 'function') { cb = arg; arg = {}; }
  if (!socket.data.docente) return ack(cb, { error: 'Acceso reservado al docente.' });
  try { ack(cb, fn(arg || {}) || { ok: true }); } catch (e) { console.error(e); ack(cb, { error: 'Error interno.' }); }
};
const deAlumno = (socket, fn) => (arg, cb) => {
  if (typeof arg === 'function') { cb = arg; arg = {}; }
  const id = socket.data.clientId;
  if (!id) return ack(cb, { error: 'Sesión no iniciada. Recarga la página.' });
  try { ack(cb, fn(id, arg || {})); } catch (e) { console.error(e); ack(cb, { error: 'Error interno.' }); }
};

io.on('connection', (socket) => {
  sinNadieDesde = Date.now();
  if (!limite.agotado() && sala.asegurarOnline()) console.log('[cra] modo ONLINE activado: alguien ha entrado');
  if (limite.agotado()) {
    socket.emit('limite_agotado');
    return setTimeout(() => socket.disconnect(true), 200);
  }

  socket.on('hola', ({ clientId } = {}, cb) => {
    if (!clientId || typeof clientId !== 'string' || clientId.length > 64 || clientId.startsWith('bot-')) return ack(cb, { error: 'Identificador no válido.' });
    socket.data.clientId = clientId;
    socket.join(`alumno:${clientId}`);
    sala.conexion(clientId, true);
    ack(cb, { ok: true, ahora: Date.now(), vista: sala.vistaAlumno(clientId), persistencia: persistencia.modo });
  });

  socket.on('entrar', deAlumno(socket, (id, { nombre, puesto }) => sala.entrarPuesto(id, nombre, puesto)));
  socket.on('salir', deAlumno(socket, (id) => { const p = sala.puestoDe(id); return p ? sala.liberarPuesto(p) : { ok: true }; }));
  socket.on('coger', deAlumno(socket, (id, { id: incId }) => sala.coger(id, incId)));
  socket.on('pregunta', deAlumno(socket, (id, a) => sala.pregunta(id, a)));
  socket.on('accion', deAlumno(socket, (id, a) => sala.accion(id, a)));
  socket.on('cerrar', deAlumno(socket, (id, a) => sala.cerrar(id, a)));
  socket.on('mi_informe', deAlumno(socket, (id) => sala.informeAlumno(id, true) || { error: 'Todavía no tienes incidencias evaluadas.' }));
  socket.on('msg_alumno', deAlumno(socket, (id, { texto }) => sala.mensaje(`alumno:${id}`, 'docente', texto)));

  socket.on('doc_login', ({ pin } = {}, cb) => {
    if (!PIN) return ack(cb, { error: 'El PIN docente no está configurado en el servidor (variable DOCENTE_PIN).' });
    if (String(pin) !== PIN) return ack(cb, { error: 'PIN incorrecto.' });
    socket.data.docente = true;
    socket.join('docente');
    ack(cb, { ok: true, ahora: Date.now(), vista: sala.vistaDocente(), persistencia: persistencia.modo, limite: limite.estado() });
  });
  socket.on('doc_iniciar', soloDocente(socket, ({ tipo, intervalo }) => sala.iniciarActividad(tipo, intervalo)));
  socket.on('doc_finalizar', soloDocente(socket, () => sala.finalizarActividad()));
  socket.on('doc_pausa', soloDocente(socket, () => sala.pausar()));
  socket.on('doc_reanudar', soloDocente(socket, () => sala.reanudar()));
  socket.on('doc_test', soloDocente(socket, () => sala.iniciarTest()));
  socket.on('doc_fin_test', soloDocente(socket, () => sala.finalizarTest()));
  socket.on('doc_lanzar', soloDocente(socket, ({ supId, destino }) => sala.lanzarManual(supId, destino)));
  socket.on('doc_programa', soloDocente(socket, ({ lista }) => sala.setPrograma(lista)));
  socket.on('doc_reiniciar', soloDocente(socket, () => sala.reiniciarPuestos()));
  socket.on('doc_liberar', soloDocente(socket, ({ puesto }) => sala.liberarPuesto(Number(puesto))));
  socket.on('doc_incidencia', soloDocente(socket, ({ id }) => sala.incidenciaDocente(id) || { error: 'No encontrada.' }));
  socket.on('doc_informes', soloDocente(socket, () => sala.informes()));
  socket.on('doc_informe_alumno', soloDocente(socket, ({ id }) => sala.informeAlumno(id) || { error: 'Sin datos.' }));
  socket.on('doc_msg', soloDocente(socket, ({ destino, texto }) => sala.mensaje('docente', destino || 'todos', texto)));

  socket.on('disconnect', () => {
    const id = socket.data.clientId;
    if (!id) return;
    setTimeout(() => {
      const sigue = io.sockets.adapter.rooms.get(`alumno:${id}`);
      if (!sigue || !sigue.size) sala.conexion(id, false);
    }, 3000);
  });
});

// Avisos inmediatos de señal entrante (sonido en los puestos)
sala.ev.on('fin_auto', () => io.emit('aviso_sistema', { texto: 'Evaluación finalizada: se han atendido todos los supuestos. Ya puedes ver tu nota y descargar tu informe.' }));
sala.ev.on('senal_nueva', ({ cola }) => {
  if (cola === 'comun') io.emit('senal_nueva');
  else for (const [id, a] of Object.entries(sala.S.alumnos)) if (a.puesto === cola && !a.esBot) io.to(`alumno:${id}`).emit('senal_nueva');
});
sala.ev.on('cambio', () => persistencia.guardar('estado.json', sala.exportar, { espera: 4000, acumular: true, compacto: true }));

// Parches agrupados cada 150 ms
function emitirVistas() {
  const t = Date.now();
  for (const [room, set] of io.sockets.adapter.rooms) {
    if (!room.startsWith('alumno:') || !set.size) continue;
    io.to(room).emit('vista', { ahora: t, vista: sala.vistaAlumno(room.slice(7)) });
  }
  io.to('docente').emit('vista_docente', { ahora: t, vista: sala.vistaDocente(), limite: limite.estado() });
}
setInterval(() => { if (sala.tomarSucio()) emitirVistas(); }, 150);
setInterval(() => { if (sala.S.actividad.estado === 'en_curso') io.to('docente').emit('vista_docente', { ahora: Date.now(), vista: sala.vistaDocente(), limite: limite.estado() }); }, 1000);
setInterval(() => sala.tic(), 250);
// Modo online solo mientras haya alguien en la app: se activa al entrar alguien y se detiene tras 15 min sin conexiones
let sinNadieDesde = Date.now();
const REPOSO_MS = Number(process.env.REPOSO_ONLINE_MIN || 15) * 60 * 1000;
setInterval(() => {
  if (io.engine.clientsCount > 0) { sinNadieDesde = Date.now(); return; }
  if (Date.now() - sinNadieDesde >= REPOSO_MS && sala.reposoOnline()) console.log('[cra] modo ONLINE en reposo: nadie conectado');
}, Math.max(200, Math.min(30 * 1000, REPOSO_MS / 2)));

// Límite de uso diario
setInterval(() => {
  const r = limite.tic(io.engine.clientsCount > 0);
  if (r === 'aviso15') io.emit('aviso_sistema', { texto: 'Quedan 15 minutos de uso diario del simulador.' });
  if (r === 'agotado') {
    io.emit('limite_agotado');
    setTimeout(() => io.disconnectSockets(true), 500);
  }
}, 60000);

async function arrancar() {
  await limite.cargar();
  const d = await persistencia.leer('estado.json');
  if (d && sala.importar(d)) console.log('[cra] estado restaurado desde', persistencia.modo);
  server.listen(PORT, () => console.log(`[cra] escuchando en ${PORT} · persistencia: ${persistencia.modo} · PIN docente ${PIN ? 'configurado' : 'NO configurado'}`));
}

let cerrando = false;
async function apagar() {
  if (cerrando) return;
  cerrando = true;
  try { await persistencia.vaciar(); } catch (e) { console.error(e); }
  process.exit(0);
}
process.on('SIGTERM', apagar);
process.on('SIGINT', apagar);

arrancar();

module.exports = { server };
