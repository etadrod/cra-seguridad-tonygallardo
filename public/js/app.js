/* Común: estado global S, conexión, utilidades, preferencias de accesibilidad */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (seg) => { seg = Math.max(0, Math.floor(seg)); return `${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}`; };
const hora = (ms) => new Date(ms).toLocaleTimeString('es-ES', { timeZone: 'Atlantic/Canary', hour: '2-digit', minute: '2-digit', second: '2-digit' });
// Barra de tiempo: verde hasta 100 s (3 puntos); después baja lineal hasta 1 punto en el objetivo (ámbar 1.ª mitad, rojo 2.ª); fuera 0
const verdeSeg = () => (S.datos && S.datos.rubrica.tiempo.verdeSeg) || 100;
const puntosTiempo = (seg, lim) => { const v = verdeSeg(); return seg <= v ? 3 : seg > lim ? 0 : 3 - 2 * (seg - v) / Math.max(1, lim - v); };
const colorTramo = (seg, lim) => { const v = verdeSeg(); return seg <= v ? '#16a34a' : seg <= (v + lim) / 2 ? '#f59e0b' : '#dc2626'; };
const nombreTramo = (seg, lim) => { const v = verdeSeg(); const p = puntosTiempo(seg, lim).toFixed(1).replace('.', ','); return seg <= v ? 'tramo verde · 3 puntos' : seg > lim ? 'fuera de tiempo · 0 puntos' : `${seg <= (v + lim) / 2 ? 'tramo ámbar' : 'tramo rojo'} · ${p} puntos`; };
const claseNota = (n) => (n == null ? '' : n >= 7 ? 'n-alta' : n >= 5 ? 'n-media' : 'n-baja');

const S = {
  datos: null, rol: null, offset: 0, vista: null, vistaDoc: null, limite: null, persistencia: null,
  voz: false, vistas: {},
};
const ahoraSrv = () => Date.now() + S.offset;

// ---------- Identidad por pestaña (cada pestaña o ventana es un alumno distinto) ----------
function nuevoId() { return 'c-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
let clientId = null;
try { clientId = sessionStorage.getItem('cra-id'); } catch { /* sin almacenamiento */ }
if (!clientId) { clientId = nuevoId(); try { sessionStorage.setItem('cra-id', clientId); } catch { /* */ } }
try {
  // Una pestaña duplicada copia sessionStorage: si otra pestaña viva usa el mismo id, se genera uno nuevo.
  const canal = new BroadcastChannel('cra-pestanas');
  canal.onmessage = (e) => {
    if (e.data && e.data.tipo === 'quien' && e.data.id === clientId && e.data.origen !== instancia) canal.postMessage({ tipo: 'ocupado', id: clientId, para: e.data.origen });
    if (e.data && e.data.tipo === 'ocupado' && e.data.para === instancia) {
      clientId = nuevoId();
      try { sessionStorage.setItem('cra-id', clientId); sessionStorage.removeItem('cra-pin'); } catch { /* */ }
      if (socket.connected) saludar();
    }
  };
  var instancia = Math.random().toString(36).slice(2);
  canal.postMessage({ tipo: 'quien', id: clientId, origen: instancia });
} catch { /* sin BroadcastChannel */ }

// ---------- Conexión ----------
const socket = io({ transports: ['websocket', 'polling'] });
function emitir(ev, arg) {
  return new Promise((res) => {
    let hecho = false;
    const t = setTimeout(() => { if (!hecho) { hecho = true; res({ error: 'Sin respuesta del servidor. Comprueba la conexión.' }); } }, 10000);
    socket.emit(ev, arg || {}, (r) => { if (!hecho) { hecho = true; clearTimeout(t); res(r || {}); } });
  });
}
async function saludar() {
  const r = await emitir('hola', { clientId });
  if (r.error) return aviso(r.error, 'error');
  S.offset = r.ahora - Date.now();
  S.persistencia = r.persistencia;
  aplicarVistaAlumno(r.vista);
  let pin = null; try { pin = sessionStorage.getItem('cra-pin'); } catch { /* */ }
  if (pin && S.rol !== 'teleop') entrarDocente(pin, true);
}
socket.on('connect', saludar);
socket.on('disconnect', () => aviso('Conexión perdida. Reconectando…', 'error', 2500));
socket.on('vista', ({ ahora, vista }) => { S.offset = ahora - Date.now(); aplicarVistaAlumno(vista); });
socket.on('vista_docente', ({ ahora, vista, limite }) => { S.offset = ahora - Date.now(); S.vistaDoc = vista; S.limite = limite; if (S.rol === 'docente' && S.vistas.docente) S.vistas.docente.patch(vista); });
socket.on('senal_nueva', () => { if (S.rol === 'teleop') { sonar(); } });
socket.on('aviso_sistema', ({ texto }) => aviso(texto));
socket.on('limite_agotado', () => { $('#bloqueo').hidden = false; });

function aplicarVistaAlumno(v) {
  S.vista = v;
  if (S.rol === 'docente') return;
  if (v && v.yo && v.yo.puesto) { mostrar('teleop'); S.vistas.teleop && S.vistas.teleop.patch(v); }
  else { if (S.rol !== 'inicio') mostrar('inicio'); rellenarPuestos(v); }
}

async function entrarDocente(pin, silencioso) {
  const r = await emitir('doc_login', { pin });
  if (r.error) { if (!silencioso) aviso(r.error, 'error'); try { sessionStorage.removeItem('cra-pin'); } catch { /* */ } return; }
  try { sessionStorage.setItem('cra-pin', pin); } catch { /* */ }
  S.offset = r.ahora - Date.now();
  S.persistencia = r.persistencia; S.limite = r.limite; S.vistaDoc = r.vista;
  mostrar('docente');
  S.vistas.docente.montar();
  S.vistas.docente.patch(r.vista);
}

// ---------- Vistas ----------
function mostrar(rol) {
  if (S.rol === rol) return;
  S.rol = rol;
  for (const v of ['inicio', 'teleop', 'docente']) $(`#v-${v}`).hidden = v !== rol;
  if (rol !== 'teleop') $('#ventana').hidden = true;
  if (S.vistas[rol] && S.vistas[rol].montar && rol !== 'docente') S.vistas[rol].montar();
  if (rol === 'inicio') $('#barra-centro').innerHTML = '';
  $('#b-mensajes').hidden = rol === 'inicio';
  $('#pm-docente').hidden = rol !== 'docente';
  $('#pm-teleop').hidden = rol !== 'teleop';
  if (rol === 'inicio') panelMensajes(false);
  altoBarra();
}

// ---------- Mensajería (panel arriba a la derecha) ----------
const msgPanel = { abierto: false, alAbrir: [] };
function panelMensajes(abrir) {
  msgPanel.abierto = abrir === undefined ? !msgPanel.abierto : abrir;
  $('#panel-msg').hidden = !msgPanel.abierto;
  $('#b-mensajes').setAttribute('aria-expanded', String(msgPanel.abierto));
  if (msgPanel.abierto) {
    msgPanel.alAbrir.forEach((f) => f());
    const i = $(S.rol === 'docente' ? '#d-msg-texto' : '#t-msg-texto');
    if (i) setTimeout(() => i.focus(), 30);
  }
}
function badgeMensajes(n) {
  const b = $('#b-msg-n');
  b.hidden = !(n > 0); b.textContent = n;
  $('#b-mensajes').classList.toggle('nuevo', n > 0);
}
$('#b-mensajes').addEventListener('click', () => panelMensajes());
$('#pm-cerrar').addEventListener('click', () => panelMensajes(false));
function altoBarra() { document.documentElement.style.setProperty('--barra-h', `${$('.barra').offsetHeight}px`); }
addEventListener('resize', altoBarra);

function rellenarPuestos(v) {
  const sel = $('#i-puesto');
  if (!sel || !S.datos) return;
  const libres = new Set((v && v.puestosLibres) || []);
  const actual = sel.value;
  sel.innerHTML = Array.from({ length: S.datos.config.numPuestos }, (_, i) => i + 1)
    .map((n) => `<option value="${n}" ${libres.has(n) ? '' : 'disabled'}>Puesto ${String(n).padStart(2, '0')} · Teleoperador${libres.has(n) ? '' : ' (ocupado)'}</option>`).join('');
  if (actual && libres.has(Number(actual))) sel.value = actual;
  else { const p = [...libres][0]; if (p) sel.value = p; }
}

// ---------- Avisos flotantes (se mantienen hasta pulsar fuera) ----------
function aviso(texto, tipo = '', duracion = 0) {
  const cont = $('#avisos');
  cont.innerHTML = '';
  const d = document.createElement('div');
  d.className = `aviso ${tipo}`;
  d.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  d.textContent = texto;
  cont.appendChild(d);
  const quitar = () => { d.remove(); document.removeEventListener('pointerdown', fuera, true); document.removeEventListener('keydown', tecla, true); };
  const fuera = (e) => { if (!d.contains(e.target)) quitar(); };
  const tecla = (e) => { if (e.key === 'Escape') quitar(); };
  setTimeout(() => { document.addEventListener('pointerdown', fuera, true); document.addEventListener('keydown', tecla, true); }, 50);
  if (duracion) setTimeout(quitar, duracion);
}

// ---------- Modal ----------
let alCerrarModal = null;
function modal(titulo, html, onClose) {
  $('#m-titulo').textContent = titulo;
  $('#m-cuerpo').innerHTML = html;
  $('#modal').hidden = false;
  alCerrarModal = onClose || null;
  const f = $('#m-cuerpo').querySelector('input, select, textarea, button');
  setTimeout(() => (f || $('#m-cerrar')).focus(), 30);
  return $('#m-cuerpo');
}
function cerrarModal() { $('#modal').hidden = true; $('#m-cuerpo').innerHTML = ''; const f = alCerrarModal; alCerrarModal = null; if (f) f(); }
$('#m-cerrar').addEventListener('click', cerrarModal);
$('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal') cerrarModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) cerrarModal(); });

// ---------- Sonido (aviso de señal entrante) ----------
let actx = null;
function sonar() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = actx.currentTime;
    [0, 0.22, 0.44].forEach((d, i) => {
      const o = actx.createOscillator(); const g = actx.createGain();
      o.type = 'square'; o.frequency.value = i % 2 ? 660 : 880;
      g.gain.setValueAtTime(0.0001, t0 + d); g.gain.exponentialRampToValueAtTime(0.08, t0 + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.18);
      o.connect(g).connect(actx.destination); o.start(t0 + d); o.stop(t0 + d + 0.2);
    });
  } catch { /* sin audio */ }
}

// ---------- Lectura en voz alta (DUA: múltiples formas de representación) ----------
// Elige una voz en español si el sistema la tiene (Chrome carga las voces de forma asíncrona)
let vozEs = null;
function cargarVoces() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices();
  vozEs = vs.find((v) => /^es[-_]ES/i.test(v.lang)) || vs.find((v) => /^es/i.test(v.lang)) || null;
}
if ('speechSynthesis' in window) { cargarVoces(); speechSynthesis.addEventListener('voiceschanged', cargarVoces); }
function hablar(texto, forzar) {
  if ((!S.voz && !forzar) || !('speechSynthesis' in window)) return;
  const limpio = String(texto).replace(/\([^)]*\)/g, '').replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, '').trim();
  if (!limpio) return;
  if (!vozEs) cargarVoces();
  const u = new SpeechSynthesisUtterance(limpio);
  u.lang = vozEs ? vozEs.lang : 'es-ES';
  if (vozEs) u.voice = vozEs;
  u.rate = 1.0; u.volume = 1;
  speechSynthesis.resume(); // Chrome a veces deja la cola en pausa
  speechSynthesis.speak(u);
}

// ---------- Preferencias (tema, letra, voz) ----------
const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return null; };
(function preferencias() {
  const tema = pref('cra-tema'); if (tema) document.documentElement.dataset.theme = tema;
  const fs = Number(pref('cra-fs')) || 16; document.documentElement.style.setProperty('--fs', `${fs}px`);
  S.voz = pref('cra-voz') === '1';
  const pintarVoz = () => {
    const b = $('#b-voz');
    b.setAttribute('aria-pressed', String(S.voz));
    b.textContent = S.voz ? '🔊' : '🔇';
    b.title = S.voz ? 'Lectura en voz alta ACTIVADA (pulsa para desactivar)' : 'Lectura en voz alta desactivada (pulsa para activar)';
  };
  pintarVoz();
  $('#b-tema').addEventListener('click', () => {
    const oscuro = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = oscuro ? 'light' : 'dark';
    pref('cra-tema', document.documentElement.dataset.theme);
  });
  const letra = (d) => { const v = Math.min(22, Math.max(13, (Number(pref('cra-fs')) || 16) + d)); document.documentElement.style.setProperty('--fs', `${v}px`); pref('cra-fs', String(v)); };
  $('#b-letra-mas').addEventListener('click', () => letra(1));
  $('#b-letra-menos').addEventListener('click', () => letra(-1));
  $('#b-voz').addEventListener('click', () => {
    S.voz = !S.voz; pref('cra-voz', S.voz ? '1' : '0'); pintarVoz();
    if (!('speechSynthesis' in window)) return aviso('Este navegador no permite la lectura en voz alta.', 'error');
    speechSynthesis.cancel();
    // La frase de prueba se lanza dentro del clic: desbloquea el audio del navegador
    if (S.voz) {
      hablar('Lectura en voz alta activada.', true);
      setTimeout(() => { if (!speechSynthesis.getVoices().length) aviso('Tu navegador no tiene voces instaladas para leer en voz alta. Prueba con Chrome o Edge.', 'error'); }, 1200);
    }
    aviso(S.voz ? 'Lectura en voz alta activada: se leerán los mensajes del interlocutor.' : 'Lectura en voz alta desactivada.', 'ok', 2000);
  });
})();

// ---------- Inicio ----------
$('#f-alumno').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); } catch { /* */ }
  const r = await emitir('entrar', { nombre: $('#i-nombre').value, puesto: Number($('#i-puesto').value) });
  if (r.error) aviso(r.error, 'error');
});
$('#f-docente').addEventListener('submit', (e) => { e.preventDefault(); entrarDocente($('#i-pin').value); $('#i-pin').value = ''; });

// ---------- Datos estáticos ----------
fetch('/api/datos').then((r) => r.json()).then((d) => {
  S.datos = d;
  $('#marca-sala').textContent = d.config.nombreSala;
  $('#marca-empresa').textContent = d.config.empresa;
  rellenarPuestos(S.vista);
  if (S.vista && S.rol === 'teleop' && S.vistas.teleop) { S.vistas.teleop.montar(); S.vistas.teleop.patch(S.vista); }
});
mostrar('inicio');

// ---------- Rúbrica de evaluación (ventana flotante desde la portada y desde el puesto) ----------
function verRubrica() {
  if (!S.datos) return;
  const R = S.datos.rubrica, C = S.datos.criterios, cfg = S.datos.config;
  const tp = cfg.tiempoPracticaSeg || 240, te = cfg.tiempoEvaluacionSeg || 190;
  const mid = (lim) => Math.round((verdeSeg() + lim) / 2);
  modal('Rúbrica de evaluación · RA4', `
    <p class="rub-int">${esc(R.ra)}<br><small>${esc(R.fuente)}</small></p>
    <h3>Cómo se calcula tu nota</h3>
    <p>${esc(R.notaFinal)}</p>
    <div class="tabla-env"><table class="tabla rub-tabla">
      <thead><tr><th>Criterio</th><th>CE</th><th class="num">Puntos</th><th>Qué se evalúa</th><th>Niveles</th></tr></thead>
      <tbody>${C.map((c) => `<tr><td>${esc(c.nombre)}</td><td>${esc(c.ce)}</td><td class="num">${c.max}</td><td>${esc(c.que || '')}</td><td><ul>${(c.niveles || []).map((n) => `<li>${esc(n)}</li>`).join('')}</ul></td></tr>`).join('')}
      <tr><td>TOTAL</td><td></td><td class="num"><strong>10</strong></td><td colspan="2"></td></tr></tbody>
    </table></div>
    <h3 style="margin-top:14px">Tiempo: tramos de la barra</h3>
    <p>El tiempo cuenta desde que pulsas «Atender» hasta que cierras. Objetivo: <strong>${tp} s en práctica</strong> y <strong>${te} s en evaluación</strong>.</p>
    <div class="tramos">
      <div class="v">3 puntos<small>Verde · hasta ${verdeSeg()} s (práctica y evaluación)</small></div>
      <div class="a">3 → 2 puntos<small>Ámbar · de ${verdeSeg()} s a ${mid(tp)} s (práctica) / ${mid(te)} s (evaluación), baja poco a poco</small></div>
      <div class="r">2 → 1 punto<small>Rojo · hasta ${tp} s / ${te} s</small></div>
      <div class="f">0 puntos<small>Fuera de tiempo · la llamada sigue hasta que cierres</small></div>
    </div>
    <p class="ayuda">Los puntos de tiempo se multiplican por el porcentaje que consigas en el procedimiento (los otros 7 puntos): cerrar rápido y mal no puntúa.</p>
    <h3 style="margin-top:14px">Penalizaciones y error grave</h3>
    <ul class="mejoras">${R.penalizaciones.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>
    <h3 style="margin-top:14px">Online, práctica y evaluación</h3>
    <ul class="mejoras">
      <li><strong>Online:</strong> ${tp} s por incidencia. Al entrar en tu puesto recibes los supuestos de práctica en orden aleatorio, uno tras otro, a tu ritmo, con corrección al cerrar cada uno.</li>
      <li><strong>Práctica:</strong> ${tp} s por incidencia. Ves la corrección y la nota al cerrar cada una y tienes la guía del procedimiento.</li>
      <li><strong>Evaluación:</strong> ${te} s por incidencia. Todos recibís los mismos casos, uno tras otro. No ves notas ni la guía hasta que el docente finalice; después puedes descargar tu informe.</li>
    </ul>
    <h3 style="margin-top:14px">Criterios de evaluación del RA4 (RD 570/2023)</h3>
    <div class="tabla-env"><table class="tabla compacta"><tbody>${Object.entries(R.ce).map(([k, v]) => `<tr><td><strong>${k}</strong></td><td>${esc(v)}</td></tr>`).join('')}</tbody></table></div>
  `);
}
$('#b-rubrica').addEventListener('click', verRubrica);
$('#b-rubrica-p').addEventListener('click', verRubrica);
