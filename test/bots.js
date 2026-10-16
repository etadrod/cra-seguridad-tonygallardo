'use strict';
// TEST: los bots ocupan los puestos libres, reciben señales y las gestionan completas.
const { lanzarServidor, cliente, hasta, ok } = require('./util');

(async () => {
  const srv = await lanzarServidor({ FACTOR_VELOCIDAD: '40' });
  try {
    console.log('TEST con bots');
    const doc = await cliente(srv.url);
    await doc.pedir('doc_login', { pin: '0112' });
    const al = await cliente(srv.url);
    await al.pedir('hola', { clientId: 'alu-real' });
    await al.pedir('entrar', { nombre: 'Alumna Real', puesto: 5 });
    const r = await doc.pedir('doc_test');
    ok(r.ok && r.bots === 14, `TEST iniciado con 14 bots (${r.bots})`);
    ok((await doc.pedir('doc_iniciar')).error, 'no se puede iniciar actividad durante el TEST');
    await hasta(() => doc.ultima && doc.ultima.cerradas.length >= 5, 20000, 100);
    ok(true, `bots cerrando incidencias (${doc.ultima.cerradas.length})`);
    const inf = await doc.pedir('doc_informes');
    ok(inf.alumnos.length >= 2 && inf.alumnos.every((a) => a.notaMedia !== null), 'informes de los bots con nota');
    ok((await doc.pedir('doc_fin_test')).ok, 'FIN TEST');
    await hasta(() => doc.ultima.puestos.filter((p) => p.alumno).length === 1 && doc.ultima.cerradas.length === 0);
    ok(true, 'bots retirados y datos de prueba borrados; el alumno real sigue en su puesto');
    console.log('OK bots');
  } catch (e) { console.error(e); process.exitCode = 1; } finally { srv.parar(); process.exit(); }
})();
