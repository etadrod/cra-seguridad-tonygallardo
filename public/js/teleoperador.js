/* Puesto de teleoperador: cola, ventana de trabajo, temporizador de 120 s, cierre y corrección */
'use strict';
(function () {
  const T = { montado: false, incId: null, nChat: 0, colaIds: new Set(), msgVistos: 0, ultimaV: null };

  function montar() {
    if (T.montado || !S.datos) return;
    T.montado = true;
    // Preguntas programadas agrupadas
    const grupos = {};
    for (const p of S.datos.preguntas) (grupos[p.grupo] = grupos[p.grupo] || []).push(p);
    $('#w-preguntas').innerHTML = Object.entries(grupos).map(([g, ps], i) => `
      <details open><summary>${esc(g)}</summary><div class="lista">
        ${ps.map((p) => `<button type="button" class="${p.tipo === 'indicacion' ? 'ind' : ''}" data-preg="${p.id}" title="${p.tipo === 'indicacion' ? 'Indicación' : 'Pregunta'}">${esc(p.texto)}</button>`).join('')}
      </div></details>`).join('');
    $('#w-clasif').innerHTML = '<option value="">— Clasificación de la incidencia —</option>' +
      S.datos.clasificaciones.map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('');

    $('#w-preguntas').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-preg]');
      if (!b) return;
      const r = await emitir('pregunta', { preguntaId: b.dataset.preg });
      if (r.error) aviso(r.error, 'error');
    });
    $('#w-f-libre').addEventListener('submit', async (e) => {
      e.preventDefault();
      const inp = $('#w-libre'); const texto = inp.value.trim();
      if (!texto) return;
      inp.value = '';
      const r = await emitir('pregunta', { texto });
      if (r.error) { aviso(r.error, 'error'); inp.value = texto; }
    });
    $('.w-acciones').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-acc],[data-form]');
      if (!b) return;
      if (b.dataset.form) return formularioAviso(b.dataset.form);
      if (b.dataset.acc === 'llamar' && T.ultimaV && T.ultimaV.activa && T.ultimaV.activa.senal.codigo === 'E122') {
        if (!confirm('Señal de atraco silencioso. ¿Seguro que quieres llamar a la instalación?')) return;
      }
      const r = await emitir('accion', { tipo: b.dataset.acc });
      if (r.error) return aviso(r.error, 'error');
      if (r.errorGrave) {
        $('#w-obs').value = ''; $('#w-clasif').value = '';
        if (r.eval) mostrarCorreccion(r.eval);
        aviso('ERROR GRAVE: has colgado sin realizar ninguna gestión. La incidencia se ha cerrado con nota 0.', 'error');
      }
    });
    $('#w-f-cierre').addEventListener('submit', async (e) => {
      e.preventDefault();
      const clasificacion = $('#w-clasif').value;
      if (!clasificacion) return aviso('Selecciona la clasificación de la incidencia.', 'error');
      const observaciones = $('#w-obs').value;
      const r = await emitir('cerrar', { clasificacion, observaciones });
      if (r.error) return aviso(r.error, 'error');
      $('#w-obs').value = ''; $('#w-clasif').value = '';
      if (r.eval) mostrarCorreccion(r.eval);
      else aviso('Incidencia cerrada y registrada.', 'ok', 2500);
    });
    $('#b-mi-pdf').addEventListener('click', async () => {
      const r = await emitir('mi_informe');
      if (r.error) return aviso(r.error, 'error');
      PDF.informeAlumno(r);
    });
    $('#b-guia').addEventListener('click', guia);
    msgPanel.alAbrir.push(() => { if (S.rol === 'teleop') pintarMensajes(); });
    $('#t-f-msg').addEventListener('submit', async (e) => {
      e.preventDefault();
      const i = $('#t-msg-texto'); const texto = i.value.trim(); if (!texto) return; i.value = '';
      const r = await emitir('msg_alumno', { texto });
      if (r.error) aviso(r.error, 'error');
    });
    $('#b-salir').addEventListener('click', async () => {
      if (!confirm('¿Salir del puesto? Tus resultados se conservan con tu nombre.')) return;
      const r = await emitir('salir');
      if (r.error) aviso(r.error, 'error');
    });
    $('#historial tbody').addEventListener('click', (e) => {
      const b = e.target.closest('[data-ver]');
      if (!b || !T.ultimaV) return;
      const h = T.ultimaV.historial.find((x) => x.id === b.dataset.ver);
      if (h && h.eval) mostrarCorreccion(h.eval, h);
    });
    $('#cola').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-coger]');
      if (!b) return;
      b.disabled = true;
      const r = await emitir('coger', { id: b.dataset.coger });
      if (r.error) { aviso(r.error, 'error'); b.disabled = false; }
    });
    montarDivisores();
    setInterval(tic, 250);
    if (S.vista) patch(S.vista);
  }

  // ---------- Divisores redimensionables (ancho de la comunicación y alto de mensajes/preguntas) ----------
  function montarDivisores() {
    const w = $('#ventana');
    const lim = (v, a, b) => Math.min(b, Math.max(a, v));
    const setAncho = (pct, guardar = true) => {
      pct = lim(pct, 25, 85);
      w.style.setProperty('--w-chat', `${pct}%`);
      $('#w-sep-v').setAttribute('aria-valuenow', String(Math.round(pct)));
      if (guardar) pref('cra-w-chat', String(Math.round(pct)));
    };
    const setAlto = (px, guardar = true) => {
      const chat = $('.w-chat');
      const max = chat && chat.clientHeight ? chat.clientHeight - 170 : 600;
      px = lim(px, 60, Math.max(80, max));
      w.style.setProperty('--h-preg', `${px}px`);
      if (guardar) pref('cra-h-preg', String(Math.round(px)));
    };
    const anchoActual = () => parseFloat(getComputedStyle(w).getPropertyValue('--w-chat')) || 56;
    const altoActual = () => $('#w-preguntas').getBoundingClientRect().height;
    if (pref('cra-w-chat')) setAncho(Number(pref('cra-w-chat')), false);
    if (pref('cra-h-preg')) w.style.setProperty('--h-preg', `${Number(pref('cra-h-preg'))}px`);

    function arrastrar(sep, alMover) {
      sep.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        sep.setPointerCapture(e.pointerId);
        sep.classList.add('arrastrando');
        document.body.classList.add('redimensionando');
        document.body.style.cursor = getComputedStyle(sep).cursor;
        const mover = (ev) => alMover(ev);
        const fin = () => {
          sep.classList.remove('arrastrando'); document.body.classList.remove('redimensionando'); document.body.style.cursor = '';
          sep.removeEventListener('pointermove', mover); sep.removeEventListener('pointerup', fin); sep.removeEventListener('pointercancel', fin);
        };
        sep.addEventListener('pointermove', mover); sep.addEventListener('pointerup', fin); sep.addEventListener('pointercancel', fin);
      });
    }
    arrastrar($('#w-sep-v'), (ev) => {
      const r = $('.w-cuerpo').getBoundingClientRect();
      setAncho(((ev.clientX - r.left) / r.width) * 100);
    });
    arrastrar($('#w-sep-h'), (ev) => {
      const form = $('#w-f-libre').getBoundingClientRect();
      setAlto(form.top - ev.clientY - 5);
    });
    $('#w-sep-v').addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); setAncho(anchoActual() - 5); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setAncho(anchoActual() + 5); }
    });
    $('#w-sep-h').addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); setAlto(altoActual() + 30); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setAlto(altoActual() - 30); }
    });
    $('#w-sep-v').addEventListener('dblclick', () => { w.style.removeProperty('--w-chat'); pref('cra-w-chat', ''); });
    $('#w-sep-h').addEventListener('dblclick', () => { w.style.removeProperty('--h-preg'); pref('cra-h-preg', ''); });
    $('#w-chat-menos').addEventListener('click', () => { quitarMax(); setAncho(anchoActual() - 10); });
    $('#w-chat-mas').addEventListener('click', () => { quitarMax(); setAncho(anchoActual() + 10); });
    const quitarMax = () => { w.classList.remove('chat-max'); $('#w-chat-max').setAttribute('aria-pressed', 'false'); };
    $('#w-chat-max').addEventListener('click', () => {
      const on = !w.classList.contains('chat-max');
      w.classList.toggle('chat-max', on);
      $('#w-chat-max').setAttribute('aria-pressed', String(on));
    });
  }

  // ---------- Parche de la vista ----------
  function patch(v) {
    if (!T.montado) return montar();
    T.ultimaV = v;
    const a = v.actividad;
    $('#barra-centro').innerHTML = `<span class="chip info">Puesto ${String(v.yo.puesto).padStart(2, '0')}</span><span class="chip">${esc(v.yo.nombre)}</span>${estadoChip(a)}`;
    const ea = $('#estado-actividad');
    ea.className = `estado-actividad ${a.estado === 'en_curso' ? (a.modo === 'test' ? 'test' : 'en_curso') : ''}`;
    $('#w-pausa').hidden = !a.pausadaDesde;
    $('#barra-centro').insertAdjacentHTML('beforeend', a.pausadaDesde ? '<span class="chip info">⏸ En pausa</span>' : '');
    ea.textContent = a.pausadaDesde ? '⏸ Actividad en pausa. El tiempo está detenido.' : a.estado === 'en_curso' ? (a.modo === 'test' ? 'TEST en curso: el docente está probando el sistema. Puedes atender señales.' : 'Actividad en curso. Atiende las señales en cuanto entren.')
      : a.estado === 'finalizada' ? 'Actividad finalizada. Descarga tu informe en PDF.' : 'En espera: el docente aún no ha iniciado la actividad.';

    // Cola
    const nuevos = v.cola.filter((c) => !T.colaIds.has(c.id));
    T.colaIds = new Set(v.cola.map((c) => c.id));
    $('#cola-n').textContent = v.cola.length;
    $('#cola').innerHTML = v.cola.length ? v.cola.map((c) => `
      <li class="${c.origen === 'llamada' ? 'llamada' : ''} ${nuevos.some((n) => n.id === c.id) ? 'nueva' : ''}">
        <span class="ico" aria-hidden="true">${c.origen === 'llamada' ? '📞' : '🔔'}</span>
        <div><div><span class="cod">${esc(c.codigo)}</span> · ${esc(c.evento)} <span class="chip">${c.cola === 'comun' ? 'Cola común' : 'Mi puesto'}</span></div>
        <div class="det">${esc(c.abonado)} · ${esc(c.municipio)} · Zona ${esc(c.zona)} · <span class="espera" data-desde="${c.creada}">00:00</span> en cola</div></div>
        <button class="btn primario" data-coger="${c.id}" ${v.activa || a.estado !== 'en_curso' || a.pausadaDesde ? 'disabled' : ''}>${c.origen === 'llamada' ? 'Atender llamada' : 'Atender señal'}</button>
      </li>`).join('') : '<li class="cola-vacia">Sin señales pendientes.</li>';

    // Historial
    $('#historial tbody').innerHTML = v.historial.length ? v.historial.slice().reverse().map((h) => `
      <tr><td class="num">${esc(h.id)}</td><td>${esc(h.abonado)}<br><small>${esc(h.codigo)} · ${esc(h.evento)}</small></td><td>${esc(h.clasificacion)}</td>
      <td class="num">${fmt(h.segundos)}</td><td class="num ${claseNota(h.nota)}">${h.nota == null ? '—' : h.nota.toFixed(2)}</td>
      <td>${h.eval ? `<button class="btn" data-ver="${h.id}">Corrección</button>` : ''}</td></tr>`).join('')
      : '<tr><td colspan="6" class="ayuda">Todavía no has cerrado ninguna incidencia.</td></tr>';
    $('#nota-media').innerHTML = v.notaMedia == null ? '' : `Nota media: <span class="${claseNota(v.notaMedia)}">${v.notaMedia.toFixed(2)}</span>`;

    // Mensajes del docente
    const delDoc = v.mensajes.filter((m) => m.de === 'docente');
    if (msgPanel.abierto) pintarMensajes();
    const sinLeer = delDoc.length - T.msgVistos;
    badgeMensajes(sinLeer);
    if (sinLeer > 0 && T.avisoMsg !== delDoc.length) { T.avisoMsg = delDoc.length; aviso(`Mensaje del docente: ${delDoc[delDoc.length - 1].texto}`); }

    // Ventana de trabajo
    if (v.activa) abrirVentana(v.activa); else cerrarVentana();
  }

  const estadoChip = (a) => a.estado === 'en_curso' ? `<span class="chip ${a.modo === 'test' ? 'alerta' : 'ok'}">${a.modo === 'test' ? 'TEST' : 'Actividad en curso'}</span>`
    : `<span class="chip">${a.estado === 'finalizada' ? 'Actividad finalizada' : 'En espera'}</span>`;

  // ---------- Ventana ----------
  function abrirVentana(inc) {
    const w = $('#ventana');
    if (T.incId !== inc.id) {
      T.incId = inc.id; T.nChat = 0;
      $$('#w-preguntas details').forEach((d) => { d.open = true; }); // cada llamada empieza con todos los grupos abiertos
      $('#w-mensajes').innerHTML = '';
      $('#w-titulo').textContent = `${inc.id} · ${inc.senal.codigo}`;
      $('#w-sub').textContent = `${inc.senal.evento} · Zona ${inc.senal.zona} · ${inc.abonado.nombre}`;
      $('#w-origen').textContent = inc.origen === 'llamada' ? '📞 Llamada entrante' : '🔔 Señal de centralita';
      $('#w-origen').className = `chip ${inc.origen === 'llamada' ? 'info' : 'alerta'}`;
      pintarFicha(inc);
      w.hidden = false;
      setTimeout(() => $('#w-libre').focus(), 50);
    }
    // Chat incremental
    const cont = $('#w-mensajes');
    const inicial = T.nChat === 0;
    for (let i = T.nChat; i < inc.chat.length; i++) {
      const m = inc.chat[i];
      const d = document.createElement('div');
      d.className = `msg ${m.de}`;
      const quien = m.de === 'op' ? 'Operador/a' : m.de === 'int' ? 'Interlocutor' : 'Sistema';
      d.innerHTML = `<small>${quien} · +${fmt((m.t - inc.cogida) / 1000)}</small>${esc(m.texto)}`;
      cont.appendChild(d);
      if (m.de === 'int' && (!inicial || i === inc.chat.length - 1)) hablar(m.texto);
    }
    if (inc.chat.length > T.nChat) cont.scrollTop = cont.scrollHeight;
    T.nChat = inc.chat.length;
    // Estado de llamada y botones
    const ll = $('#w-llamada');
    ll.textContent = inc.llamadaAbierta ? '● Llamada abierta' : 'Sin llamada';
    ll.className = `chip ${inc.llamadaAbierta ? 'ok' : ''}`;
    $('#w-b-llamar').disabled = inc.llamadaAbierta;
    $('#w-b-colgar').disabled = false; // siempre disponible: colgar sin gestionar es un error grave
    $('#w-libre').disabled = !inc.llamadaAbierta;
    $('#w-libre').placeholder = inc.llamadaAbierta ? 'Mensaje libre (con «?» es pregunta; sin «?», indicación)…' : 'Abre una llamada para hablar con el interlocutor';
    $$('#w-preguntas [data-preg]').forEach((b) => { b.disabled = !inc.llamadaAbierta; b.classList.toggle('usada', inc.preguntas.includes(b.dataset.preg)); });
    const hechos = new Set([...inc.verif, ...inc.avisos]);
    $$('.w-acciones [data-acc], .w-acciones [data-form]').forEach((b) => {
      const k = b.dataset.acc || b.dataset.form;
      b.classList.toggle('hecho', hechos.has(k === 'llamar' ? 'llamada' : k));
    });
    $('.w-acciones [data-acc="vigilante"]').disabled = inc.vigilanteEnviado;
    $('#w-verif').innerHTML = [...inc.verif.map((x) => `<span class="chip ok">${esc(S.datos.verificaciones[x])}</span>`), ...inc.avisos.map((x) => `<span class="chip info">${esc(S.datos.avisos[x])}</span>`)].join('') || '<span class="ayuda">Ninguna todavía.</span>';
    tic();
  }

  function cerrarVentana() {
    if (!T.incId) return;
    T.incId = null;
    $('#ventana').hidden = true;
  }

  function pintarFicha(inc) {
    const a = inc.abonado;
    $('#w-ficha').innerHTML = `
      <div class="ficha-bloque"><h3>Abonado ${esc(a.id)}</h3>
        <dl class="ficha-dl">
          <dt>Nombre</dt><dd>${esc(a.nombre)}</dd>
          <dt>Tipo</dt><dd>${esc(a.tipo)}</dd>
          <dt>Dirección</dt><dd>${esc(a.direccion)}</dd>
          <dt>Municipio</dt><dd>${esc(a.municipio)} (${esc(a.isla)})</dd>
          <dt>Horario</dt><dd>${esc(a.horario)}</dd>
          <dt>Sistema</dt><dd>${esc(a.grado)} · Vídeo: ${a.video ? 'sí' : 'no'} · Audio: ${a.audio ? 'sí' : 'no'}</dd>
          <dt>Cuerpo competente</dt><dd>${esc(a.cuerpoCompetente)} <small class="ayuda">[EDITABLE]</small></dd>
        </dl></div>
      <div class="ficha-bloque"><h3>Verificación de identidad</h3>
        <div class="claves"><div class="cl"><small>Palabra clave</small>${esc(a.palabraClave)}</div><div class="co"><small>Palabra de coacción</small>${esc(a.palabraCoaccion)}</div></div></div>
      <div class="ficha-bloque"><h3>Contactos</h3>
        <table class="tabla compacta"><tbody>${a.contactos.map((c) => `<tr><td>${esc(c.relacion)}</td><td>${esc(c.nombre)}</td><td class="num">${esc(c.telefono)}</td></tr>`).join('')}</tbody></table></div>
      <div class="ficha-bloque"><h3>Zonas</h3>
        <table class="tabla compacta"><tbody>${a.zonas.map((z) => `<tr${z.z === inc.senal.zona ? ' style="font-weight:700"' : ''}><td class="num">${esc(z.z)}</td><td>${esc(z.desc)}</td></tr>`).join('')}</tbody></table></div>
      <div class="ficha-bloque"><h3>Verificaciones y avisos realizados</h3><div class="chips" id="w-verif"></div></div>`;
  }

  function tic() {
    if (!T.ultimaV) return;
    const pausa = T.ultimaV.actividad && T.ultimaV.actividad.pausadaDesde;
    const ahora = pausa || ahoraSrv();
    $$('#cola [data-desde]').forEach((s) => { s.textContent = fmt((ahora - Number(s.dataset.desde)) / 1000); });
    const inc = T.ultimaV.activa;
    if (!inc || !T.incId) return;
    const obj = S.datos.config.tiempoObjetivoSeg;
    const seg = (ahora - inc.cogida) / 1000;
    const r = Math.min(1, seg / obj);
    const hue = Math.round(120 * (1 - r));
    $('#w-tiempo').textContent = fmt(seg);
    const barra = $('#w-barra');
    barra.style.width = `${Math.max(2, r * 100)}%`;
    barra.style.background = `hsl(${hue} 80% 45%)`;
    const fuera = seg > obj;
    $('.temporizador').classList.toggle('fuera', fuera);
    $('#w-testado').textContent = fuera ? `Fuera de tiempo (+${fmt(seg - obj)}) · la comunicación continúa` : `Quedan ${fmt(obj - seg)}`;
  }

  // ---------- Formularios de aviso ----------
  function formularioAviso(tipo) {
    const inc = T.ultimaV && T.ultimaV.activa;
    if (!inc) return;
    const datos = Object.entries(S.datos.datosAviso).map(([k, v]) => `<label><input type="checkbox" name="d" value="${k}"> ${esc(v)}</label>`).join('');
    const fcse = tipo === 'fcse';
    const cuerpo = modal(fcse ? 'Aviso a Fuerzas y Cuerpos de Seguridad' : 'Aviso al 1-1-2 (CECOES)', `
      <form id="f-aviso">
        ${fcse ? `<label for="a-cuerpo">Cuerpo policial</label><select id="a-cuerpo" required><option value="">— Selecciona —</option>${S.datos.config.cuerposSeguridad.map((c) => `<option>${esc(c)}</option>`).join('')}</select>`
          : `<label for="a-motivo">Motivo</label><select id="a-motivo"><option>Emergencia sanitaria</option><option>Incendio</option><option>Otra emergencia</option></select>`}
        <fieldset style="border:0;padding:0;margin:0"><legend class="ayuda">Datos que transmites</legend><div class="checks">${datos}</div></fieldset>
        <label for="a-texto">Mensaje transmitido (opcional)</label>
        <textarea id="a-texto" rows="3" maxlength="500" placeholder="${esc(inc.abonado.direccion)}, ${esc(inc.abonado.municipio)}…"></textarea>
        <div class="fila-botones"><button class="btn azul" type="submit">Transmitir aviso</button><button class="btn fantasma" type="button" id="a-cancelar">Cancelar</button></div>
      </form>`);
    $('#a-cancelar', cuerpo).addEventListener('click', cerrarModal);
    $('#f-aviso', cuerpo).addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = { datos: $$('input[name="d"]:checked', cuerpo).map((x) => x.value), texto: $('#a-texto', cuerpo).value };
      if (fcse) d.cuerpo = $('#a-cuerpo', cuerpo).value; else d.motivo = $('#a-motivo', cuerpo).value;
      const r = await emitir('accion', { tipo, datos: d });
      if (r.error) return aviso(r.error, 'error');
      cerrarModal();
    });
  }

  // ---------- Corrección ----------
  function mostrarCorreccion(ev, h) {
    modal(h ? `Corrección ${h.id}` : 'Incidencia cerrada · corrección', `
      <div style="display:flex;gap:20px;align-items:center;flex-wrap:wrap">
        <div class="nota-grande ${claseNota(ev.nota)}">${ev.nota.toFixed(2)}<small style="font-size:1rem"> / 10</small></div>
        <div><div>Tiempo de gestión: <strong>${fmt(ev.segundos)}</strong> ${ev.segundos > S.datos.config.tiempoObjetivoSeg ? '<span class="chip alerta">fuera de tiempo</span>' : '<span class="chip ok">en tiempo</span>'}</div>
        ${h ? `<div class="ayuda">${esc(h.abonado)} · ${esc(h.codigo)} · ${esc(h.clasificacion)}</div>` : ''}</div>
      </div>
      <div class="tabla-env"><table class="tabla" style="margin-top:12px"><thead><tr><th>Criterio</th><th>CE</th><th>Nivel</th><th class="num">Puntos</th><th>Observación</th></tr></thead><tbody>
        ${ev.criterios.map((c) => `<tr><td>${esc(c.nombre)}</td><td>${esc(c.ce)}</td><td>${esc(c.nivel)}</td><td class="num">${c.puntos.toFixed(2)} / ${c.max}</td><td>${esc(c.obs)}</td></tr>`).join('')}
      </tbody></table></div>
      ${ev.errorGrave ? `<p class="aviso error" style="margin-top:12px;box-shadow:none">⛔ ERROR GRAVE · ${esc(ev.errorGrave)}</p>` : ''}
      ${ev.mejoras.length ? `<h3 style="margin-top:12px">Mejoras concretas</h3><ul class="mejoras">${ev.mejoras.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : '<p class="chip ok" style="margin-top:12px">Procedimiento completo. ¡Bien hecho!</p>'}
      <h3 style="margin-top:12px">Procedimiento esperado</h3><p>${esc(ev.solucion)}</p>`);
  }

  // ---------- Guía del procedimiento (apoyo DUA) ----------
  function guia() {
    modal('Guía del procedimiento en CRA', `
      <video controls preload="none" playsinline poster="video/tutorial-cra.jpg" style="width:100%;aspect-ratio:16/9;border-radius:10px;background:#0b1220;margin-bottom:12px">
        <source src="video/tutorial-cra.mp4" type="video/mp4"><track kind="subtitles" srclang="es" label="Español" src="video/tutorial-cra.vtt">
      </video>
      <ol class="mejoras">
        <li><strong>Recepción.</strong> Atiende la señal o la llamada. Lee el código, el evento y la zona.</li>
        <li><strong>Identificación.</strong> Consulta la ficha del abonado y pulsa <em>Zonas activadas</em>: verás qué detectores han saltado, a qué hora y en qué orden. Si hablas con alguien: identifica al interlocutor y pide la <strong>palabra clave</strong>. Compárala con la palabra de <strong>coacción</strong>.</li>
        <li><strong>Verificación.</strong> Según los medios del abonado: <em>secuencial</em> (si saltan varios detectores distintos seguidos, p. ej. puerta → pasillo → salón, es indicio de que alguien se mueve dentro; si salta uno solo, no basta), vídeo, audio o verificación personal (llamada al titular o vigilante in situ).</li>
        <li><strong>Decisión.</strong> ¿Alarma real, falsa alarma o incidencia técnica? No movilices recursos públicos sin verificación, salvo riesgo para las personas.</li>
        <li><strong>Transmisión.</strong> Alarma real: aviso inmediato a la FCSE competente con dirección, tipo de señal, verificación y datos de autores o personas. Emergencias sanitarias o incendio: 1-1-2. Activa el servicio de acuda (custodia de llaves) cuando haga falta acceder a la instalación.</li>
        <li><strong>Registro y cierre.</strong> Clasifica y anota qué ocurrió, qué verificaste, a quién avisaste y cuándo.</li>
      </ol>
      <p class="ayuda">Tiempo objetivo: 120 s desde que atiendes. Si lo superas, la comunicación sigue abierta hasta que cierres. Referencias: Ley 5/2014, RD 2364/1994, Orden INT/316/2011 y normas UNE-EN (pendiente de verificación de artículos por el docente).</p>`);
  }

  // ---------- Mensajería alumno ↔ docente ----------
  function pintarMensajes() {
    const v = T.ultimaV; const c = $('#t-mensajes');
    if (!v || !c) return;
    const firma = v.mensajes.length;
    if (T.firmaMsg !== firma) {
      T.firmaMsg = firma;
      c.innerHTML = v.mensajes.length ? v.mensajes.map((m) => `<div class="m ${m.de === 'docente' ? '' : 'yo'}"><small>${m.de === 'docente' ? 'Docente' : 'Tú'} · ${hora(m.t)}</small>${esc(m.texto)}</div>`).join('') : '<p class="ayuda">Sin mensajes.</p>';
      c.scrollTop = c.scrollHeight;
    }
    T.msgVistos = v.mensajes.filter((m) => m.de === 'docente').length;
    badgeMensajes(0);
  }

  S.vistas.teleop = { montar, patch, tareaActual: () => T.incId };
})();
