'use strict';
// Persistencia en la rama «datos» del repositorio GitHub (API de contenidos).
// Sin GITHUB_TOKEN o con PERSISTENCIA=off: disco local (no sobrevive a un reinicio de Render).
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.GITHUB_TOKEN || '';
const REPO = process.env.GITHUB_REPO || '';
const RAMA = process.env.GITHUB_RAMA_DATOS || 'datos';
const API = process.env.GITHUB_API || 'https://api.github.com';
const OFF = process.env.PERSISTENCIA === 'off';
const DIR_LOCAL = path.join(__dirname, '..', 'datos-local');

const modo = OFF ? 'off' : TOKEN && REPO ? 'github' : 'local';
const shas = {};
const pendientes = {}; // archivo -> { timer, producir, opciones }
let ramaLista = null;

async function gh(metodo, ruta, cuerpo) {
  const r = await fetch(`${API}/repos/${REPO}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'cra-simulador', 'Content-Type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const txt = await r.text();
  let json = null; try { json = txt ? JSON.parse(txt) : null; } catch { /* sin json */ }
  return { status: r.status, json };
}

async function asegurarRama() {
  if (ramaLista) return ramaLista;
  ramaLista = (async () => {
    const r = await gh('GET', `/git/ref/heads/${RAMA}`);
    if (r.status === 200) return true;
    const repo = await gh('GET', '');
    const base = repo.json && repo.json.default_branch;
    const ref = await gh('GET', `/git/ref/heads/${base}`);
    if (ref.status !== 200) throw new Error('No se pudo leer la rama principal para crear «datos».');
    const c = await gh('POST', '/git/refs', { ref: `refs/heads/${RAMA}`, sha: ref.json.object.sha });
    if (c.status !== 201 && c.status !== 422) throw new Error(`No se pudo crear la rama datos (${c.status})`);
    return true;
  })();
  try { return await ramaLista; } catch (e) { ramaLista = null; throw e; }
}

async function leer(archivo) {
  if (modo === 'off') return null;
  if (modo === 'local') {
    try { return JSON.parse(fs.readFileSync(path.join(DIR_LOCAL, archivo), 'utf8')); } catch { return null; }
  }
  try {
    await asegurarRama();
    const r = await gh('GET', `/contents/${archivo}?ref=${RAMA}`);
    if (r.status !== 200) return null;
    shas[archivo] = r.json.sha;
    return JSON.parse(Buffer.from(r.json.content, 'base64').toString('utf8'));
  } catch (e) { console.error('[persistencia] leer', archivo, e.message); return null; }
}

async function escribir(archivo, datos, compacto) {
  const texto = compacto ? JSON.stringify(datos) : JSON.stringify(datos, null, 2);
  if (modo === 'off') return;
  if (modo === 'local') {
    fs.mkdirSync(DIR_LOCAL, { recursive: true });
    fs.writeFileSync(path.join(DIR_LOCAL, archivo), texto);
    return;
  }
  await asegurarRama();
  for (let intento = 0; intento < 3; intento++) {
    const cuerpo = { message: `datos: ${archivo}`, content: Buffer.from(texto).toString('base64'), branch: RAMA };
    if (shas[archivo]) cuerpo.sha = shas[archivo];
    const r = await gh('PUT', `/contents/${archivo}`, cuerpo);
    if (r.status === 200 || r.status === 201) { shas[archivo] = r.json.content.sha; return; }
    if (r.status === 409 || r.status === 422) {
      const g = await gh('GET', `/contents/${archivo}?ref=${RAMA}`);
      shas[archivo] = g.status === 200 ? g.json.sha : undefined;
      continue;
    }
    throw new Error(`GitHub respondió ${r.status}`);
  }
  throw new Error('sha desfasado tras 3 intentos');
}

// guardar(archivo, producir, { espera, acumular, compacto })
// acumular: no reinicia la espera si ya hay un guardado pendiente (datos que cambian sin parar).
function guardar(archivo, producir, { espera = 3000, acumular = false, compacto = false } = {}) {
  const p = pendientes[archivo];
  if (p && acumular) { p.producir = producir; return; }
  if (p) clearTimeout(p.timer);
  const entrada = { producir, compacto, timer: null };
  entrada.timer = setTimeout(() => ejecutar(archivo), espera);
  pendientes[archivo] = entrada;
}

async function ejecutar(archivo) {
  const p = pendientes[archivo];
  if (!p) return;
  delete pendientes[archivo];
  try { await escribir(archivo, p.producir(), p.compacto); } catch (e) { console.error('[persistencia] escribir', archivo, e.message); }
}

async function vaciar() {
  const archivos = Object.keys(pendientes);
  for (const a of archivos) clearTimeout(pendientes[a].timer);
  await Promise.all(archivos.map(ejecutar));
}

module.exports = { modo, leer, guardar, vaciar };
