/* Panel docente: control de actividad y TEST, supuestos programados, puestos, observación, mensajería e informes */
'use strict';
(function () {
  const D = { montado: false, firmas: {}, v: null, observando: null };

  function montar() {
    if (D.montado) return;
    D.montado = true;
    $('#d-iniciar').addEventListener('click', async () => {
      const v = D.v;
      if (v && v.cerradas.length && !confirm('Se borrarán los resultados del ejercicio anterior. ¿Has descargado ya los informes?')) return;
      res(await emitir('doc_iniciar'), 'Actividad iniciada.');
    });
    $('#d-finalizar').addEventListener('click', async () => {
      if (!confirm('¿Finalizar la actividad? Las incidencias abiertas se evaluarán tal como estén.')) return;
      res(await emitir('doc_finalizar'), 'Actividad finalizada. Ya puedes descargar los informes.');
    });
    $('#d-test').addEventListener('click', async () => {
      if (D.v && D.v.cerradas.length && !confirm('El TEST borra los resultados actuales. ¿Continuar?')) return;
      const r = await emitir('doc_test');
      res(r, r.ok ? `TEST iniciado: ${r.bots} bots ocupan los puestos libres y entran señales automáticas.` : '');
    });
    $('#d-fintest').addEventListener('click', async () => res(await emitir('doc_fin_test'), 'TEST finalizado. Bots retirados y datos de prueba borrados.'));

    const tabla = $('#d-programa');
    tabla.addEventListener('change', (e) => {
      const tr = e.target.closest('tr[data-sup]');
      if (!tr) return;
      emitir('doc_programa', { lista: [{ supId: tr.dataset.sup, entra: $('.p-entra', tr).checked, minuto: Number($('.p-min', tr).value), destino: $('.p-dest', tr).value }] });
    });
    tabla.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-lanzar]');
      if (b) {
        const tr = b.closest('tr');
        res(await emitir('doc_lanzar', { supId: b.dataset.lanzar, destino: $('.p-dest', tr).value }), 'Supuesto lanzado.');
      }
      const i = e.target.closest('[data-info]');
      if (i) { const s = D.v.supuestos.find((x) => x.id === i.dataset.info); modal(`${s.id} · ${s.titulo}`, `<p><strong>Abonado:</strong> ${esc(s.abonado)} · <strong>Origen:</strong> ${s.origen === 'llamada' ? 'llamada entrante' : 'señal de centralita'}</p><p>${esc(s.docente)}</p>`); }
    });
    $('#d-lanzar-todos').addEventListener('click', async () => {
      const filas = $$('#d-programa tbody tr').filter((tr) => $('.p-entra', tr).checked);
      if (!filas.length) return aviso('No hay supuestos marcados.', 'error');
      for (const tr of filas) { const r = await emitir('doc_lanzar', { supId: tr.dataset.sup, destino: $('.p-dest', tr).value }); if (r.error) return aviso(r.error, 'error'); }
      aviso(`${filas.length} supuestos lanzados.`, 'ok', 2500);
    });

    $('#d-pdf-todos').addEventListener('click', async () => {
      const r = await emitir('doc_informes');
      if (r.error) return aviso(r.error, 'error');
      if (!r.alumnos.length) return aviso('Todavía no hay incidencias evaluadas.', 'error');
      PDF.conjunto(r);
    });
    $('#d-pdf-individuales').addEventListener('click', async () => {
      const r = await emitir('doc_informes');
      if (r.error) return aviso(r.error, 'error');
      if (!r.alumnos.length) return aviso('Todavía no hay incidencias evaluadas.', 'error');
      for (const al of r.alumnos) { PDF.informeAlumno({ cabecera: r.cabecera, alumno: al }); await new Promise((x) => setTimeout(x, 400)); }
    });

    $('#d-puestos').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-p]');
      if (!b) return;
      const n = Number(b.dataset.n);
      const p = D.v.puestos.find((x) => x.n === n);
      if (b.dataset.p === 'obs' && p.activa) observar(p.activa.id);
      if (b.dataset.p === 'pdf' && p.alumno) {
        const r = await emitir('doc_informe_alumno', { id: p.alumno.id });
        if (r.error) return aviso(r.error, 'error');
        PDF.informeAlumno(r);
      }
      if (b.dataset.p === 'lib' && confirm(`¿Liberar el puesto ${n}? El alumno conserva sus resultados.`)) res(await emitir('doc_liberar', { puesto: n }), `Puesto ${n} liberado.`);
      if (b.dataset.p === 'msg') { $('#d-msg-destino').value = `puesto:${n}`; $('#d-msg-texto').focus(); }
    });
    $('#d-cerradas').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-ver]');
      if (!b) return;
      const r = await emitir('doc_incidencia', { id: b.dataset.ver });
      if (r.error) return aviso(r.error, 'error');
      verCerrada(r);
    });
    $('#d-f-msg').addEventListener('submit', async (e) => {
      e.preventDefault();
      const texto = $('#d-msg-texto').value.trim();
      if (!texto) return;
      $('#d-msg-texto').value = '';
      const r = await emitir('doc_msg', { destino: $('#d-msg-destino').value, texto });
      if (r.error) aviso(r.error, 'error');
    });
    setInterval(tic, 500);
  }

  const res = (r, ok) => { if (r.error) aviso(r.error, 'error'); else if (ok) aviso(ok, 'ok', 3000); };
  const cambia = (k, val) => { const f = JSON.stringify(val); if (D.firmas[k] === f) return false; D.firmas[k] = f; return true; };

  function patch(v) {
    if (!D.montado) montar();
    D.v = v;
    const a = v.actividad;
    $('#barra-centro').innerHTML = `<span class="chip info">Docente</span>${a.estado === 'en_curso' ? `<span class="chip ${a.modo === 'test' ? 'alerta' : 'ok'}">${a.modo === 'test' ? 'TEST en curso' : 'Actividad en curso'}</span>` : `<span class="chip">${a.estado === 'finalizada' ? 'Actividad finalizada' : 'En espera'}</span>`}<button class="btn fantasma" id="d-salir">Salir</button>`;
    $('#d-salir').onclick = () => { try { sessionStorage.removeItem('cra-pin'); } catch { /* */ } location.reload(); };
    const de = $('#d-estado');
    de.className = `estado-actividad ${a.estado === 'en_curso' ? (a.modo === 'test' ? 'test' : 'en_curso') : ''}`;
    de.textContent = a.estado === 'en_curso' ? (a.modo === 'test' ? 'TEST: bots en puestos libres y señales automáticas. Los alumnos conectados también pueden atender.' : 'Actividad en curso. Los supuestos marcados entran en su minuto.')
      : a.estado === 'finalizada' ? `Finalizada a las ${hora(a.fin)}. Descarga los informes.` : 'En espera de inicio.';
    const enCurso = a.estado === 'en_curso';
    $('#d-iniciar').disabled = enCurso;
    $('#d-finalizar').disabled = !(enCurso && a.modo === 'actividad');
    $('#d-test').disabled = enCurso;
    $('#d-fintest').disabled = !(enCurso && a.modo === 'test');
    $('#d-persistencia').textContent = S.persistencia === 'github' ? 'Resultados guardados en GitHub (rama «datos»).'
      : S.persistencia === 'local' ? '⚠ Sin GITHUB_TOKEN: los resultados se guardan en disco local y NO sobreviven a un reinicio de Render. Descarga los informes al terminar.'
      : 'Persistencia desactivada (modo pruebas).';
    const l = S.limite;
    $('#d-limite').textContent = l && l.activo ? `Uso diario: ${l.minutos} de ${l.limite} min (quedan ${l.restantes}).` : '';

    // Programa
    if (cambia('programa', v.programa.map((p) => [p.supId, p.lanzado]))) pintarPrograma(v);
    else v.programa.forEach((p) => {
      const tr = $(`#d-programa tr[data-sup="${p.supId}"]`);
      if (!tr) return;
      if (document.activeElement && tr.contains(document.activeElement)) return;
      $('.p-entra', tr).checked = p.entra; $('.p-min', tr).value = p.minuto; $('.p-dest', tr).value = p.destino;
    });

    // Puestos
    const firmaP = v.puestos.map((p) => [p.n, p.alumno, p.activa && p.activa.id, p.cerradas, p.notaMedia]);
    if (cambia('puestos', firmaP)) pintarPuestos(v);
    const ocup = v.puestos.filter((p) => p.alumno);
    $('#d-resumen').textContent = `${ocup.length}/${v.puestos.length} ocupados · ${v.activas.length} atendiendo · ${v.cerradas.length} cerradas`;

    // Cola
    if (cambia('cola', v.cola.map((c) => c.id))) {
      $('#d-cola-n').textContent = v.cola.length;
      $('#d-cola').innerHTML = v.cola.length ? v.cola.map((c) => `<li class="${c.origen === 'llamada' ? 'llamada' : ''}"><span class="ico" aria-hidden="true">${c.origen === 'llamada' ? '📞' : '🔔'}</span><div><span class="cod">${esc(c.codigo)}</span> · ${esc(c.abonado)} <span class="det">· ${c.cola === 'comun' ? 'cola común' : `puesto ${c.cola}`}</span></div><span class="espera" data-desde="${c.creada}"></span></li>`).join('') : '<li class="cola-vacia">Sin señales en cola.</li>';
    }
    // Cerradas
    if (cambia('cerradas', [v.cerradas.map((c) => c.id), v.noAtendidas])) {
      $('#d-cerradas tbody').innerHTML = v.cerradas.length ? v.cerradas.slice().reverse().map((c) => `<tr><td class="num">${esc(c.id)}</td><td class="num">${c.puesto}</td><td>${esc(c.alumno)}</td><td>${esc(c.titulo)}</td><td class="num">${fmt(c.segundos)}</td><td class="num ${claseNota(c.nota)}">${c.nota.toFixed(2)}</td><td><button class="btn" data-ver="${c.id}">Ver</button></td></tr>`).join('') : '<tr><td colspan="7" class="ayuda">Sin incidencias cerradas.</td></tr>';
      $('#d-noat').textContent = v.noAtendidas ? `${v.noAtendidas} señales no atendidas` : '';
    }
    // Mensajes
    if (cambia('destinos', ocup.map((p) => [p.n, p.alumno.nombre]))) {
      const val = $('#d-msg-destino').value;
      $('#d-msg-destino').innerHTML = '<option value="todos">A todos los puestos</option>' + ocup.filter((p) => !p.alumno.esBot).map((p) => `<option value="puesto:${p.n}">Puesto ${p.n} · ${esc(p.alumno.nombre)}</option>`).join('');
      if ([...$('#d-msg-destino').options].some((o) => o.value === val)) $('#d-msg-destino').value = val;
    }
    if (cambia('mensajes', v.mensajes.length)) {
      const nombre = (de) => { if (de === 'docente') return 'Docente'; const id = de.slice(7); const p = v.puestos.find((x) => x.alumno && x.alumno.id === id); return p ? `Puesto ${p.n} · ${p.alumno.nombre}` : 'Alumno/a'; };
      const destino = (d) => d === 'todos' ? 'todos' : d.startsWith('puesto:') ? `puesto ${d.slice(7)}` : '';
      const c = $('#d-mensajes');
      c.innerHTML = v.mensajes.length ? v.mensajes.map((m) => `<div class="m ${m.de === 'docente' ? 'yo' : ''}"><small>${esc(nombre(m.de))}${m.de === 'docente' ? ` → ${destino(m.destino)}` : ''} · ${hora(m.t)}</small>${esc(m.texto)}</div>`).join('') : '<p class="ayuda">Sin mensajes.</p>';
      c.scrollTop = c.scrollHeight;
      const ult = v.mensajes[v.mensajes.length - 1];
      if (ult && ult.de !== 'docente' && D.firmas.mensajes !== undefined && D.yaVisto) aviso(`Mensaje de ${nombre(ult.de)}: ${ult.texto}`);
      D.yaVisto = true;
    }
    if (D.observando) pintarObservacion();
    tic();
  }

  function pintarPrograma(v) {
    $('#d-programa tbody').innerHTML = v.programa.map((p) => {
      const s = v.supuestos.find((x) => x.id === p.supId);
      return `<tr data-sup="${p.supId}">
        <td><label class="sr" for="pe-${p.supId}">Entra</label><input id="pe-${p.supId}" type="checkbox" class="p-entra" ${p.entra ? 'checked' : ''}></td>
        <td><label class="sr" for="pm-${p.supId}">Minuto</label><input id="pm-${p.supId}" type="number" min="0" max="180" class="p-min" value="${p.minuto}"></td>
        <td><strong>${p.supId}</strong> ${esc(s.titulo)} <span class="ayuda">· ${s.origen === 'llamada' ? 'llamada' : 'señal'}</span> ${p.lanzado ? '<span class="chip ok">lanzado</span>' : ''} <button class="btn fantasma" style="padding:0 6px;min-height:24px" data-info="${p.supId}" aria-label="Descripción de ${p.supId} para el docente" title="Descripción para el docente">ⓘ</button></td>
        <td><label class="sr" for="pd-${p.supId}">Destino</label><select id="pd-${p.supId}" class="p-dest"><option value="todos" ${p.destino === 'todos' ? 'selected' : ''}>Todos</option><option value="comun" ${p.destino === 'comun' ? 'selected' : ''}>Común</option></select></td>
        <td><button class="btn" data-lanzar="${p.supId}" title="Lanzar ya">Lanzar ya</button></td></tr>`;
    }).join('');
  }

  function pintarPuestos(v) {
    $('#d-puestos').innerHTML = v.puestos.map((p) => {
      const a = p.alumno;
      const cls = !a ? 'libre' : p.activa ? 'atendiendo' : a.conectado ? 'ocupado' : 'desconectado';
      return `<div class="puesto ${cls}" data-np="${p.n}">
        <span class="n">PUESTO ${String(p.n).padStart(2, '0')} ${a && a.esBot ? '· BOT' : ''}${a && !a.conectado ? ' · desconectado' : ''}</span>
        <span class="nom">${a ? esc(a.nombre) : 'Libre'}</span>
        ${p.activa ? `<span>${esc(p.activa.codigo)} · ${esc(p.activa.abonado)}</span><span class="num" data-cogida="${p.activa.cogida}">00:00</span><div class="mini-barra"><div data-barra="${p.activa.cogida}"></div></div>` : `<span class="ayuda">${a ? 'Disponible' : '—'}</span>`}
        ${a ? `<span>Cerradas: <strong>${p.cerradas}</strong> · Media: <strong class="${claseNota(p.notaMedia)}">${p.notaMedia == null ? '—' : p.notaMedia.toFixed(2)}</strong></span>` : ''}
        ${a ? `<div class="acc">
          ${p.activa ? `<button class="btn" data-p="obs" data-n="${p.n}">Observar</button>` : ''}
          <button class="btn" data-p="pdf" data-n="${p.n}" ${p.cerradas ? '' : 'disabled'}>PDF</button>
          ${a.esBot ? '' : `<button class="btn" data-p="msg" data-n="${p.n}">Mensaje</button><button class="btn fantasma" data-p="lib" data-n="${p.n}" ${p.activa ? 'disabled' : ''}>Liberar</button>`}
        </div>` : ''}
      </div>`;
    }).join('');
  }

  function tic() {
    const v = D.v;
    if (!v) return;
    const ahora = ahoraSrv();
    const a = v.actividad;
    $('#d-reloj').textContent = a.inicio ? fmt(((a.estado === 'finalizada' ? a.fin : ahora) - a.inicio) / 1000) : '--:--';
    const obj = S.datos ? S.datos.config.tiempoObjetivoSeg : 120;
    $$('#d-puestos [data-cogida]').forEach((e) => { const s = (ahora - Number(e.dataset.cogida)) / 1000; e.textContent = fmt(s); e.closest('.puesto').classList.toggle('fuera', s > obj); });
    $$('#d-puestos [data-barra]').forEach((e) => { const r = Math.min(1, (ahora - Number(e.dataset.barra)) / 1000 / obj); e.style.width = `${Math.max(3, r * 100)}%`; e.style.background = `hsl(${Math.round(120 * (1 - r))} 80% 45%)`; });
    $$('#d-cola [data-desde]').forEach((s) => { s.textContent = fmt((ahora - Number(s.dataset.desde)) / 1000); });
    if (D.observando) { const t = $('#obs-tiempo'); const inc = v.activas.find((x) => x.id === D.observando); if (t && inc) t.textContent = fmt((ahora - inc.cogida) / 1000); }
  }

  // ---------- Observar un puesto (solo lectura) ----------
  function chatHtml(inc) {
    return inc.chat.map((m) => `<div class="msg ${m.de}"><small>${m.de === 'op' ? 'Operador/a' : m.de === 'int' ? 'Interlocutor' : 'Sistema'} · +${fmt((m.t - inc.cogida) / 1000)}</small>${esc(m.texto)}</div>`).join('');
  }
  function observar(id) {
    D.observando = id;
    modal('Observación del puesto (solo lectura)', '<div id="obs"></div>', () => { D.observando = null; });
    pintarObservacion();
  }
  function pintarObservacion() {
    const inc = D.v.activas.find((x) => x.id === D.observando);
    const c = $('#obs');
    if (!c) return;
    if (!inc) { c.innerHTML = '<p class="chip ok">La incidencia se ha cerrado. Puedes verla en «Incidencias cerradas».</p>'; D.observando = null; return; }
    const chat = $('#obs .chat');
    const scroll = chat ? chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40 : true;
    c.innerHTML = `<p><strong>${esc(inc.id)}</strong> · Puesto ${inc.puesto} · ${esc(inc.alumno)} · <span class="chip">${esc(inc.supId)} ${esc(inc.titulo)}</span> · <span class="num" id="obs-tiempo"></span></p>
      <div class="obs-sala"><div class="chat">${chatHtml(inc)}</div>
      <div><div class="ficha-bloque"><h3>Verificaciones</h3><div class="chips">${inc.verif.map((x) => `<span class="chip ok">${esc(S.datos.verificaciones[x])}</span>`).join('') || '<span class="ayuda">Ninguna</span>'}</div></div>
      <div class="ficha-bloque"><h3>Avisos</h3><div class="chips">${inc.avisos.map((x) => `<span class="chip info">${esc(S.datos.avisos[x])}</span>`).join('') || '<span class="ayuda">Ninguno</span>'}</div></div>
      <div class="ficha-bloque"><h3>Preguntas realizadas</h3><div class="chips">${inc.preguntas.map((x) => `<span class="chip">${esc((S.datos.preguntas.find((p) => p.id === x) || {}).texto || x)}</span>`).join('') || '<span class="ayuda">Ninguna</span>'}</div></div></div></div>`;
    const nuevo = $('#obs .chat');
    if (scroll) nuevo.scrollTop = nuevo.scrollHeight;
    tic();
  }
  function verCerrada(inc) {
    const ev = inc.eval;
    modal(`${inc.id} · ${inc.titulo}`, `
      <p>Puesto ${inc.puesto} · ${esc(inc.alumno)} · Nota <strong class="${claseNota(ev.nota)}">${ev.nota.toFixed(2)}</strong> · Tiempo ${fmt(ev.segundos)}</p>
      <div class="tabla-env"><table class="tabla compacta"><thead><tr><th>Criterio</th><th>CE</th><th>Nivel</th><th class="num">Puntos</th><th>Observación</th></tr></thead><tbody>
      ${ev.criterios.map((c) => `<tr><td>${esc(c.nombre)}</td><td>${esc(c.ce)}</td><td>${esc(c.nivel)}</td><td class="num">${c.puntos.toFixed(2)}/${c.max}</td><td>${esc(c.obs)}</td></tr>`).join('')}</tbody></table></div>
      ${ev.mejoras.length ? `<h3 style="margin-top:10px">Mejoras</h3><ul class="mejoras">${ev.mejoras.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
      <h3 style="margin-top:10px">Registro del alumno</h3><p>${esc(inc.cierre ? inc.cierre.observaciones || '(vacío)' : 'No cerrada por el alumno')}</p>
      <h3 style="margin-top:10px">Conversación</h3><div class="chat" style="max-height:40vh;border:1px solid var(--linea);border-radius:8px">${chatHtml(inc)}</div>`);
  }

  S.vistas.docente = { montar, patch };
})();
