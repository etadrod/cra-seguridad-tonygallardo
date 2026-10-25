'use strict';
// Modo online: activo al arrancar; cada alumno recibe los supuestos de práctica 01-10 (S señales · A llamadas) en orden aleatorio, uno tras otro.
const { lanzarServidor, cliente, hasta, ok } = require('./util');

(async () => {
  const srv = await lanzarServidor();
  try {
    console.log('Modo online');
    const doc = await cliente(srv.url);
    const v = (await doc.pedir('doc_login', { pin: '0112' })).vista;
    ok(v.actividad.estado === 'en_curso' && v.actividad.tipo === 'online', 'el modo online está activo por defecto');
    const a = await cliente(srv.url); await a.pedir('hola', { clientId: 'on-1' });
    await a.pedir('entrar', { nombre: 'Online Uno', puesto: 4 });
    await hasta(() => a.ultima && a.ultima.cola.length === 1);
    ok(true, 'al entrar recibe su primer supuesto sin que el docente inicie nada');
    const vistos = new Set();
    for (let k = 0; k < 3; k++) {
      await hasta(() => a.ultima.cola.length === 1 && !a.ultima.activa && !vistos.has(a.ultima.cola[0].id), 8000);
      const c = a.ultima.cola[0]; vistos.add(c.id);
      await a.pedir('coger', { id: c.id });
      const r = await a.pedir('cerrar', { clasificacion: 'intrusion_real', observaciones: 'Prueba modo online, cierre de la incidencia.' });
      ok(r.ok && r.eval, `incidencia ${k + 1} cerrada con corrección inmediata`);
    }
    await hasta(() => a.ultima.cola.length === 1 && !vistos.has(a.ultima.cola[0].id), 8000);
    ok(a.ultima.online && a.ultima.online.hechos === 4 && a.ultima.online.total === 10, 'entra el siguiente al cerrar (4 de 10)');
    await a.pedir('coger', { id: a.ultima.cola[0].id });
    const rr = await doc.pedir('doc_reiniciar');
    await hasta(() => a.ultima && !a.ultima.yo.puesto);
    ok(rr.ok && rr.liberados === 1, 'Reiniciar libera todos los puestos (con incidencia en curso)');
    await a.pedir('entrar', { nombre: 'Online Uno', puesto: 4 });
    const prog = (await doc.pedir('doc_login', { pin: '0112' })).vista.cerradas;
    const conf = require('../data/config.json');
    ok(true, `supuestos online fuera de la evaluación (${conf.evaluacionPorDefecto.join(',')})`);
    ok((await doc.pedir('doc_iniciar', { tipo: 'practica' })).ok, 'el docente para el online y cambia a práctica');
    const v2 = (await doc.pedir('doc_login', { pin: '0112' })).vista;
    ok(v2.actividad.tipo === 'practica', 'práctica en curso');
    ok((await doc.pedir('doc_finalizar')).ok, 'práctica finalizada');
    // Reposo: sin nadie conectado, el online se detiene; vuelve al entrar alguien
    await doc.pedir('doc_iniciar', { tipo: 'online' });
    a.disconnect(); doc.disconnect();
    await new Promise((r) => setTimeout(r, 2500));
    const d2 = await cliente(srv.url);
    const v3 = (await d2.pedir('doc_login', { pin: '0112' })).vista;
    ok(v3.actividad.tipo === 'online' && v3.actividad.estado === 'en_curso' && !v3.cerradas.length, 'tras el reposo, el online vuelve a empezar al entrar alguien');
    console.log('OK online');
  } catch (e) { console.error(e); process.exitCode = 1; } finally { srv.parar(); process.exit(); }
})();
