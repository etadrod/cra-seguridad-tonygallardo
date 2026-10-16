'use strict';
// Carga de datos iniciales (data/*.json). Se leen una vez al arrancar.
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'data');
const leer = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

const config = leer('config.json');
const abonados = leer('abonados.json');
const supuestos = leer('supuestos.json');
const preguntas = leer('preguntas.json');
const rubrica = leer('rubrica.json');

const abonadoPorId = Object.fromEntries(abonados.map((a) => [a.id, a]));
const supuestoPorId = Object.fromEntries(supuestos.map((s) => [s.id, s]));
const preguntaPorId = Object.fromEntries(preguntas.map((p) => [p.id, p]));
const clasifPorId = Object.fromEntries(rubrica.clasificaciones.map((c) => [c.id, c]));

// Comprobación de coherencia de los supuestos (evita errores silenciosos al editar los JSON)
for (const s of supuestos) {
  if (!abonadoPorId[s.abonadoId]) throw new Error(`Supuesto ${s.id}: abonado ${s.abonadoId} inexistente`);
  if (!clasifPorId[s.eval.tipo]) throw new Error(`Supuesto ${s.id}: clasificación ${s.eval.tipo} inexistente`);
  for (const p of s.eval.preguntasClave) if (!preguntaPorId[p]) throw new Error(`Supuesto ${s.id}: pregunta ${p} inexistente`);
}

module.exports = { config, abonados, supuestos, preguntas, rubrica, abonadoPorId, supuestoPorId, preguntaPorId, clasifPorId };
