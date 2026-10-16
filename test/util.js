'use strict';
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const { io } = require('socket.io-client');

function puertoLibre() {
  return new Promise((res) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => res(p)); }); });
}

async function lanzarServidor(env = {}) {
  const port = await puertoLibre();
  const proc = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), PERSISTENCIA: 'off', DOCENTE_PIN: '0112', FACTOR_VELOCIDAD: '20', LIMITE_HORAS_DIA: '0', REPOSO_ONLINE_MIN: '0.02', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stderr.on('data', (d) => process.stderr.write(`[srv] ${d}`));
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('El servidor no arrancó')), 8000);
    proc.stdout.on('data', (d) => { if (String(d).includes('escuchando')) { clearTimeout(t); res(); } });
  });
  return { port, url: `http://localhost:${port}`, parar: () => proc.kill('SIGKILL') };
}

function cliente(url) {
  const s = io(url, { transports: ['websocket'], forceNew: true });
  s.pedir = (ev, arg) => new Promise((res) => s.emit(ev, arg, res));
  s.ultima = null;
  s.on('vista', (v) => { s.ultima = v.vista; });
  s.on('vista_docente', (v) => { s.ultima = v.vista; });
  return new Promise((res) => s.on('connect', () => res(s)));
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function hasta(fn, ms = 5000, paso = 50) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await esperar(paso); }
  throw new Error('Tiempo de espera agotado');
}
function ok(c, msg) { if (!c) { throw new Error(`FALLO: ${msg}`); } console.log(`  ✔ ${msg}`); }

module.exports = { lanzarServidor, cliente, esperar, hasta, ok };
