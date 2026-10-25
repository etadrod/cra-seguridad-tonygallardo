'use strict';
// Documentos de control al cerrar: informe explicativo (art. 14.5) y requerimiento por falsas alarmas (art. 15.1)
const a = require('assert');
const e = require('../lib/evaluacion.js');
const S = require('../data/supuestos.json'); const A = require('../data/abonados.json');
const mk = (id, av, docs) => { const s = S.find((x) => x.id === id); return { guion: s, abonado: A.find((x) => x.id === s.abonadoId), origen: 'senal', cogida: 0, cerrada: 100000, preguntas: [], verif: {}, avisos: av, cierre: { clasificacion: s.eval.tipo, observaciones: 'Anotación suficiente en el libro-registro de alarmas.', documentos: docs } }; };
const reg = (i) => e.evaluar(i).criterios.find((c) => c.id === 'registro').puntos;
const f = (t) => ({ t, datos: [] });
a.deepStrictEqual(e.documentosNecesarios(mk('S02', { fcse: f(170000) })), []);
a.deepStrictEqual(e.documentosNecesarios(mk('S02', { fcse: f(200000) })), ['informe']);
a.deepStrictEqual(e.documentosNecesarios(mk('S02', {})), ['informe']);
a.deepStrictEqual(e.documentosNecesarios(mk('S12', {})), ['requerimiento']);
a.deepStrictEqual(e.documentosNecesarios(mk('S01', {})), []);
a.strictEqual(reg(mk('S12', {}, ['requerimiento'])), 1);
a.strictEqual(reg(mk('S12', {}, [])), 0.75);
a.strictEqual(reg(mk('S02', { fcse: f(60000) }, ['informe'])), 0.75);
a.strictEqual(require('../data/rubrica.json').criterios.reduce((s, c) => s + c.max, 0), 10);
console.log('OK documentos');
