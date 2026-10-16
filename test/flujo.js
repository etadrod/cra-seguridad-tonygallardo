'use strict';
// Flujo completo: docente, dos teleoperadores, cogida única, verificación, avisos, cierre, evaluación e informes.
const { lanzarServidor, cliente, hasta, esperar, ok } = require('./util');

(async () => {
  const srv = await lanzarServidor();
  try {
    console.log('Flujo CRA');
    const doc = await cliente(srv.url);
    ok((await doc.pedir('doc_login', { pin: '9999' })).error, 'PIN incorrecto rechazado');
    ok((await doc.pedir('doc_iniciar')).error, 'sin login no se puede iniciar');
    ok((await doc.pedir('doc_login', { pin: '0112' })).ok, 'login docente con PIN');

    const a1 = await cliente(srv.url); const a2 = await cliente(srv.url);
    await a1.pedir('hola', { clientId: 'alu-1' }); await a2.pedir('hola', { clientId: 'alu-2' });
    ok((await a1.pedir('entrar', { nombre: 'Ana Pérez', puesto: 1 })).ok, 'alumno 1 en puesto 1');
    ok((await a2.pedir('entrar', { nombre: 'Luis Gil', puesto: 1 })).error, 'puesto ocupado rechazado');
    ok((await a2.pedir('entrar', { nombre: 'Luis Gil', puesto: 2 })).ok, 'alumno 2 en puesto 2');

    // Desactivar programa automático para controlar el flujo
    const v0 = (await doc.pedir('doc_login', { pin: '0112' })).vista;
    await doc.pedir('doc_programa', { lista: v0.programa.map((p) => ({ supId: p.supId, entra: false })) });
    ok((await doc.pedir('doc_iniciar')).ok, 'actividad iniciada');

    let sonido = 0; a1.on('senal_nueva', () => sonido++);
    ok((await doc.pedir('doc_lanzar', { supId: 'S02', destino: 'comun' })).ok, 'lanzada S02 a cola común');
    await hasta(() => a1.ultima && a1.ultima.cola.length === 1 && a2.ultima && a2.ultima.cola.length === 1);
    ok(sonido >= 1, 'aviso sonoro de señal entrante');
    const incId = a1.ultima.cola[0].id;
    const vistos = new Set([incId]);
    const [r1, r2] = await Promise.all([a1.pedir('coger', { id: incId }), a2.pedir('coger', { id: incId })]);
    ok((r1.ok ? 1 : 0) + (r2.ok ? 1 : 0) === 1, 'cogida atómica: solo uno la obtiene');
    const quien = r1.ok ? a1 : a2;
    await hasta(() => quien.ultima.activa && (r1.ok ? a2 : a1).ultima.cola.length === 0);
    ok(true, 'la señal desaparece del otro puesto');

    ok((await quien.pedir('pregunta', { preguntaId: 'que_ocurre' })).error, 'sin llamada abierta no se puede preguntar');
    await quien.pedir('accion', { tipo: 'secuencial' });
    await quien.pedir('accion', { tipo: 'video' });
    await quien.pedir('accion', { tipo: 'llamar' });
    await hasta(() => quien.ultima.activa.chat.some((m) => m.de === 'int'));
    ok(true, 'el titular contesta la llamada');
    await quien.pedir('pregunta', { texto: '¿Me dice la palabra clave, por favor?' });
    await hasta(() => quien.ultima.activa.chat.some((m) => m.de === 'int' && m.texto.includes('MAGNOLIA')));
    ok(true, 'texto libre con «?» identificado como pregunta de palabra clave');
    ok((await quien.pedir('accion', { tipo: 'fcse', datos: { cuerpo: 'Policía Nacional', datos: ['direccion', 'tipo_senal', 'verificacion', 'autores'] } })).ok, 'aviso FCSE');
    await quien.pedir('accion', { tipo: 'llavero' });
    ok((await quien.pedir('cerrar', { clasificacion: 'nada' })).error, 'cierre sin clasificación válida rechazado');
    const c = await quien.pedir('cerrar', { clasificacion: 'intrusion_real', observaciones: 'Intrusión verificada por vídeo: dos encapuchados. Aviso a Policía Nacional y llavero.' });
    ok(c.ok && c.eval.nota >= 9.5, `evaluación correcta con nota alta (${c.eval.nota})`);
    ok(c.eval.criterios.length === 6 && Math.abs(c.eval.criterios.reduce((s, x) => s + x.max, 0) - 10) < 1e-9, 'rúbrica de 6 criterios sobre 10');

    // Falsa alarma mal gestionada (aviso improcedente a FCSE, sin palabra clave)
    await doc.pedir('doc_lanzar', { supId: 'S01', destino: 'puesto:2' });
    await hasta(() => a2.ultima.cola.length === 1 && !a2.ultima.activa && !vistos.has(a2.ultima.cola[0].id)); vistos.add(a2.ultima.cola[0].id);
    await a2.pedir('coger', { id: a2.ultima.cola[0].id });
    await a2.pedir('accion', { tipo: 'fcse', datos: { cuerpo: 'Guardia Civil', datos: [] } });
    const c2 = await a2.pedir('cerrar', { clasificacion: 'intrusion_real', observaciones: '' });
    ok(c2.eval.nota < 4.5, `mala gestión penalizada (${c2.eval.nota})`);
    ok(c2.eval.mejoras.length >= 3, 'el informe incluye mejoras concretas');

    // Coacción detectada
    await doc.pedir('doc_lanzar', { supId: 'S07', destino: 'puesto:2' });
    await hasta(() => a2.ultima.cola.length === 1 && !a2.ultima.activa && !vistos.has(a2.ultima.cola[0].id)); vistos.add(a2.ultima.cola[0].id);
    const rc = await a2.pedir('coger', { id: a2.ultima.cola[0].id });
    ok(rc.ok, 'coge la señal de coacción ' + JSON.stringify(rc));
    await a2.pedir('accion', { tipo: 'llamar' });
    await a2.pedir('pregunta', { preguntaId: 'palabra_clave' });
    await hasta(() => a2.ultima.activa && a2.ultima.activa.chat.some((m) => m.texto.includes('TEJINA')));
    ok(true, 'el interlocutor da la palabra de coacción');
    // Conversación se mantiene más allá del límite (no se cierra sola)
    await esperar(300);
    ok(a2.ultima.activa && a2.ultima.activa.estado === 'atencion', 'la conversación sigue abierta hasta el cierre');

    // Colgar sin gestión = error grave (nota 0) — S07 sigue abierta en el puesto 2: se cierra antes
    await a2.pedir('cerrar', { clasificacion: 'coaccion', observaciones: 'Palabra de coacción TEJINA. Aviso a Policía Nacional.' });
    await doc.pedir('doc_lanzar', { supId: 'S03', destino: 'puesto:2' });
    await hasta(() => a2.ultima.cola.length === 1 && !a2.ultima.activa && !vistos.has(a2.ultima.cola[0].id)); vistos.add(a2.ultima.cola[0].id);
    await a2.pedir('coger', { id: a2.ultima.cola[0].id });
    const cg = await a2.pedir('accion', { tipo: 'colgar' });
    ok(cg.errorGrave && cg.eval.nota === 0, 'colgar sin gestión: error grave y nota 0');
    // Colgar con gestión hecha no es error
    await doc.pedir('doc_lanzar', { supId: 'S03', destino: 'puesto:2' });
    await hasta(() => a2.ultima.cola.length === 1 && !a2.ultima.activa && !vistos.has(a2.ultima.cola[0].id)); vistos.add(a2.ultima.cola[0].id);
    await a2.pedir('coger', { id: a2.ultima.cola[0].id });
    await a2.pedir('pregunta', { preguntaId: 'direccion' });
    const cg2 = await a2.pedir('accion', { tipo: 'colgar' });
    ok(cg2.ok && !cg2.errorGrave, 'colgar tras gestionar no es error grave');
    await a2.pedir('cerrar', { clasificacion: 'sanitaria', observaciones: 'Caída de persona mayor, aviso al 1-1-2 y al hijo.' });

    // Pausa: detiene el tiempo y bloquea acciones
    await doc.pedir('doc_lanzar', { supId: 'S02', destino: 'puesto:2' });
    await hasta(() => a2.ultima.cola.length === 1 && !a2.ultima.activa && !vistos.has(a2.ultima.cola[0].id)); vistos.add(a2.ultima.cola[0].id);
    await a2.pedir('coger', { id: a2.ultima.cola[0].id });
    await hasta(() => a2.ultima.activa);
    const cog0 = a2.ultima.activa.cogida;
    ok((await doc.pedir('doc_pausa')).ok, 'pausa de la actividad');
    ok((await a2.pedir('accion', { tipo: 'secuencial' })).error, 'en pausa no se puede actuar');
    ok((await doc.pedir('doc_lanzar', { supId: 'S01', destino: 'comun' })).error, 'en pausa no se lanzan supuestos');
    await esperar(1200);
    const rr = await doc.pedir('doc_reanudar');
    ok(rr.ok, 'reanudar actividad');
    await hasta(() => a2.ultima.activa && a2.ultima.activa.cogida > cog0 + 1000);
    ok(true, 'el tiempo de la incidencia no cuenta la pausa');
    await a2.pedir('cerrar', { clasificacion: 'intrusion_real', observaciones: 'Prueba de pausa: intrusión verificada y avisada.' });

    // Informes
    const inf = await a1.pedir('mi_informe');
    ok(inf.alumno || (await a2.pedir('mi_informe')).alumno, 'informe del alumno disponible');
    ok((await doc.pedir('doc_finalizar')).ok, 'actividad finalizada');
    const todos = await doc.pedir('doc_informes');
    ok(todos.alumnos.length === 2, 'informe conjunto con los dos alumnos');
    const alu2 = todos.alumnos.find((x) => x.alumno === 'Luis Gil');
    ok(alu2.incidencias.length === (r1.ok ? 5 : 6), 'incidencias del alumno evaluadas al finalizar');
    ok(alu2.incidencias.some((i) => i.clasificacion.startsWith('ERROR GRAVE')), 'error grave registrado en el informe');
    ok((await a1.pedir('coger', { id: 'x' })).error, 'tras finalizar no se pueden coger señales');
    console.log('OK flujo');
  } catch (e) { console.error(e); process.exitCode = 1; } finally { srv.parar(); process.exit(); }
})();
