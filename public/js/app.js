/* Común: estado global S, conexión, utilidades, preferencias de accesibilidad */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (seg) => { seg = Math.max(0, Math.floor(seg)); return `${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(seg % 60).padStart(2, '0')}`; };
const hora = (ms) => new Date(ms).toLocaleTimeString('es-ES', { timeZone: 'Atlantic/Canary', hour: '2-digit', minute: '2-digit', second: '2-digit' });
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
function hablar(texto) {
  if (!S.voz || !('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(String(texto).replace(/\([^)]*\)/g, ''));
  u.lang = 'es-ES'; u.rate = 1.05;
  speechSynthesis.speak(u);
}

// ---------- Preferencias (tema, letra, voz) ----------
const pref = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return null; };
(function preferencias() {
  const tema = pref('cra-tema'); if (tema) document.documentElement.dataset.theme = tema;
  const fs = Number(pref('cra-fs')) || 16; document.documentElement.style.setProperty('--fs', `${fs}px`);
  S.voz = pref('cra-voz') === '1'; $('#b-voz').setAttribute('aria-pressed', String(S.voz));
  $('#b-tema').addEventListener('click', () => {
    const oscuro = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = oscuro ? 'light' : 'dark';
    pref('cra-tema', document.documentElement.dataset.theme);
  });
  const letra = (d) => { const v = Math.min(22, Math.max(13, (Number(pref('cra-fs')) || 16) + d)); document.documentElement.style.setProperty('--fs', `${v}px`); pref('cra-fs', String(v)); };
  $('#b-letra-mas').addEventListener('click', () => letra(1));
  $('#b-letra-menos').addEventListener('click', () => letra(-1));
  $('#b-voz').addEventListener('click', () => {
    S.voz = !S.voz; pref('cra-voz', S.voz ? '1' : '0'); $('#b-voz').setAttribute('aria-pressed', String(S.voz));
    aviso(S.voz ? 'Lectura en voz alta activada para los mensajes del interlocutor.' : 'Lectura en voz alta desactivada.', 'ok', 2000);
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
