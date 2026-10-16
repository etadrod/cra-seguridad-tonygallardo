/* Informes PDF (jsPDF + autotable): individual del alumno y conjunto del grupo */
'use strict';
const PDF = (function () {
  const M = 14; // margen (mm)
  const AZUL = [16, 26, 43]; const AMBAR = [184, 110, 0]; const GRIS = [90, 104, 125];
  // Las fuentes estándar de PDF solo admiten Latin-1/WinAnsi: se sustituyen símbolos y emojis.
  const t = (s) => String(s == null ? '' : s)
    .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/→/g, '->').replace(/[✓✔]/g, 'OK').replace(/−/g, '-')
    .replace(/[^\u0000-ÿ–—‘’“”•…€]/gu, '').replace(/\s+\n/g, '\n').trim();
  const f2 = (n) => (n == null ? '—' : Number(n).toFixed(2));
  const mmss = (seg) => `${String(Math.floor(seg / 60)).padStart(2, '0')}:${String(Math.round(seg % 60)).padStart(2, '0')}`;
  const fecha = (ms) => new Date(ms).toLocaleString('es-ES', { timeZone: 'Atlantic/Canary', dateStyle: 'short', timeStyle: 'short' });
  const nivel = (ratio) => (ratio >= 0.85 ? 'Excelente' : ratio >= 0.5 ? 'Adecuado' : 'Insuficiente');
  const archivo = (s) => t(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');

  function nuevo() {
    const { jsPDF } = window.jspdf;
    return new jsPDF({ unit: 'mm', format: 'a4' });
  }
  function tabla(doc, opts) {
    const base = { margin: { left: M, right: M }, styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.6, overflow: 'linebreak' }, headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold' }, alternateRowStyles: { fillColor: [244, 247, 251] } };
    const o = { ...base, ...opts, styles: { ...base.styles, ...(opts.styles || {}) } };
    if (typeof window.autoTable === 'function') window.autoTable(doc, o); else doc.autoTable(o);
    return doc.lastAutoTable.finalY;
  }
  const ancho = (doc) => doc.internal.pageSize.getWidth() - 2 * M;
  function espacio(doc, y, necesario) {
    if (y + necesario > doc.internal.pageSize.getHeight() - 16) { doc.addPage(); return 18; }
    return y;
  }
  function parrafo(doc, texto, y, { size = 9, color = [20, 20, 20], bold = false } = {}) {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color);
    const lineas = doc.splitTextToSize(t(texto), ancho(doc));
    for (const l of lineas) { y = espacio(doc, y, size * 0.45); doc.text(l, M, y); y += size * 0.43; }
    return y + 1;
  }
  function titulo(doc, texto, y, size = 12) {
    y = espacio(doc, y, 14);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(size); doc.setTextColor(...AZUL);
    doc.text(t(texto), M, y);
    doc.setDrawColor(...AMBAR); doc.setLineWidth(0.6); doc.line(M, y + 1.6, M + 30, y + 1.6);
    return y + 7;
  }
  function banda(doc, cab, subtitulo) {
    const w = doc.internal.pageSize.getWidth();
    doc.setFillColor(...AZUL); doc.rect(0, 0, w, 26, 'F');
    doc.setFillColor(...AMBAR); doc.rect(0, 26, w, 1.2, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
    doc.text(t(cab.sala), M, 11);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(t(subtitulo), M, 17);
    doc.text(t(cab.empresa), M, 22);
    doc.text(t(`Generado: ${fecha(cab.generado)}`), w - M, 22, { align: 'right' });
    return 36;
  }
  function pies(doc) {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...GRIS);
      const h = doc.internal.pageSize.getHeight(); const w = doc.internal.pageSize.getWidth();
      doc.text(t('CFGM Técnico en Seguridad · Módulo 1679 Vigilancia y protección · RA4 · Simulador CRA'), M, h - 8);
      doc.text(`${i} / ${n}`, w - M, h - 8, { align: 'right' });
    }
  }

  function seccionAlumno(doc, cab, al, y) {
    // Identificación y nota final
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(20);
    doc.text(t(al.alumno), M, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...GRIS);
    doc.text(t(`Puesto ${String(al.puesto || '-').padStart(2, '0')} · Teleoperador/a · ${al.incidencias.length} incidencias evaluadas${cab.actividad && cab.actividad.inicio ? ` · Actividad iniciada ${fecha(cab.actividad.inicio)}` : ''}${al.esBot ? ' · BOT (TEST)' : ''}`), M, y + 6);
    const w = doc.internal.pageSize.getWidth();
    doc.setFillColor(255, 244, 224); doc.setDrawColor(...AMBAR); doc.roundedRect(w - M - 42, y - 8, 42, 20, 2, 2, 'FD');
    doc.setTextColor(...AZUL); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
    doc.text(f2(al.notaMedia), w - M - 21, y + 3.5, { align: 'center' });
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.text('NOTA FINAL / 10', w - M - 21, y + 9, { align: 'center' });
    y += 18;
    y = parrafo(doc, cab.ra, y, { size: 8.5, color: GRIS });

    // Rúbrica (media por criterio)
    y = titulo(doc, 'Rúbrica de evaluación (media de las incidencias)', y + 2, 11);
    const filas = al.porCriterio.map((c) => [t(c.nombre), c.ce, f2(c.media), String(c.max), c.media == null ? '—' : nivel(c.media / c.max)]);
    filas.push([{ content: 'TOTAL', styles: { fontStyle: 'bold' } }, '', { content: f2(al.notaMedia), styles: { fontStyle: 'bold' } }, '10', al.notaMedia == null ? '—' : nivel(al.notaMedia / 10)]);
    y = tabla(doc, { startY: y, head: [['Criterio', 'CE', 'Puntos', 'Máx.', 'Nivel']], body: filas, columnStyles: { 1: { cellWidth: 14 }, 2: { cellWidth: 18, halign: 'right' }, 3: { cellWidth: 14, halign: 'right' }, 4: { cellWidth: 24 } } }) + 3;
    y = parrafo(doc, `Niveles: Excelente (>= 85 % del criterio) · Adecuado (>= 50 %) · Insuficiente (< 50 %). Tiempo: ${cab.tiempo.nota}`, y, { size: 7.5, color: GRIS });

    // Resumen de incidencias
    y = titulo(doc, 'Incidencias gestionadas', y + 3, 11);
    y = tabla(doc, {
      startY: y, head: [['Inc.', 'Supuesto', 'Señal', 'Tiempo', 'Clasificación del alumno', 'Nota']],
      body: al.incidencias.map((i) => [i.id, t(i.titulo), t(`${i.codigo} · ${i.abonado}`), mmss(i.eval.segundos), t(i.clasificacion), f2(i.eval.nota)]),
      columnStyles: { 0: { cellWidth: 17 }, 3: { cellWidth: 14, halign: 'right' }, 5: { cellWidth: 12, halign: 'right' } },
    }) + 4;

    // Detalle de cada incidencia
    for (const i of al.incidencias) {
      y = espacio(doc, y, 50);
      y = titulo(doc, `${i.id} · ${i.titulo} · Nota ${f2(i.eval.nota)}`, y, 10);
      y = parrafo(doc, `${i.abonado} (${i.municipio}) · ${i.codigo} ${i.evento} · ${i.origen === 'llamada' ? 'Llamada entrante' : 'Señal de centralita'} · Atendida ${fecha(i.cogida)} · Tiempo ${mmss(i.eval.segundos)}${i.eval.segundos > cab.tiempo.limiteSeg ? ' (fuera de tiempo)' : ''}`, y, { size: 8, color: GRIS });
      y = tabla(doc, {
        startY: y, head: [['Criterio', 'CE', 'Nivel', 'Puntos', 'Observación']],
        body: i.eval.criterios.map((c) => [t(c.nombre), c.ce, c.nivel, `${f2(c.puntos)}/${c.max}`, t(c.obs)]),
        styles: { fontSize: 7.8 },
        columnStyles: { 0: { cellWidth: 46 }, 1: { cellWidth: 11 }, 2: { cellWidth: 20 }, 3: { cellWidth: 17, halign: 'right' } },
      }) + 3;
      if (i.eval.errorGrave) y = parrafo(doc, `ERROR GRAVE: ${i.eval.errorGrave} Nota de la incidencia: 0.`, y, { size: 9, bold: true, color: [196, 43, 43] });
      if (i.eval.mejoras.length) {
        y = parrafo(doc, 'Mejoras concretas:', y, { size: 8.5, bold: true });
        for (const m of i.eval.mejoras) y = parrafo(doc, `• ${m}`, y, { size: 8 });
      }
      y = parrafo(doc, 'Procedimiento esperado:', y + 1, { size: 8.5, bold: true });
      y = parrafo(doc, i.eval.solucion, y, { size: 8 });
      y = parrafo(doc, 'Registro anotado por el alumno:', y + 1, { size: 8.5, bold: true });
      y = parrafo(doc, i.observaciones || '(sin anotación)', y, { size: 8, color: GRIS }) + 3;
    }
    return y;
  }

  function anexo(doc, cab, y) {
    y = titulo(doc, 'Criterios de evaluación del RA4 (RD 570/2023)', y + 2, 10);
    y = tabla(doc, { startY: y, head: [['CE', 'Descripción']], body: Object.entries(cab.ce).map(([k, v]) => [k, t(v)]), columnStyles: { 0: { cellWidth: 12 } }, styles: { fontSize: 7.8 } }) + 3;
    y = parrafo(doc, cab.fuente, y, { size: 7.5, color: GRIS });
    return parrafo(doc, cab.normativa, y, { size: 7.5, color: GRIS });
  }

  function informeAlumno({ cabecera, alumno }) {
    const doc = nuevo();
    let y = banda(doc, cabecera, 'Informe individual de evaluación · Recepción, verificación y transmisión de señales de alarma');
    y = seccionAlumno(doc, cabecera, alumno, y + 4);
    anexo(doc, cabecera, y);
    pies(doc);
    doc.save(`Informe_CRA_${archivo(alumno.alumno)}.pdf`);
  }

  function conjunto({ cabecera, alumnos, noAtendidas }) {
    const doc = nuevo();
    let y = banda(doc, cabecera, 'Informe conjunto del grupo · Recepción, verificación y transmisión de señales de alarma');
    y = titulo(doc, 'Resumen del grupo', y + 2, 12);
    const notas = alumnos.map((a) => a.notaMedia).filter((n) => n != null);
    const media = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null;
    const aprob = notas.filter((n) => n >= 5).length;
    y = parrafo(doc, `${alumnos.length} alumnos/as evaluados · Nota media del grupo: ${f2(media)} · Aprobados: ${aprob}/${notas.length}${noAtendidas.length ? ` · Señales no atendidas: ${noAtendidas.length}` : ''}`, y, { size: 9.5 });
    y = tabla(doc, {
      startY: y + 1, head: [['Puesto', 'Alumno/a', 'Incidencias', 'Tiempo medio', 'Nota', 'Nivel']],
      body: alumnos.map((a) => {
        const ts = a.incidencias.map((i) => i.eval.segundos);
        return [String(a.puesto || '-').padStart(2, '0'), t(a.alumno + (a.esBot ? ' (BOT)' : '')), String(a.incidencias.length), ts.length ? mmss(ts.reduce((x, z) => x + z, 0) / ts.length) : '—', f2(a.notaMedia), a.notaMedia == null ? '—' : nivel(a.notaMedia / 10)];
      }),
      columnStyles: { 0: { cellWidth: 16 }, 2: { cellWidth: 22, halign: 'right' }, 3: { cellWidth: 24, halign: 'right' }, 4: { cellWidth: 16, halign: 'right' }, 5: { cellWidth: 24 } },
    }) + 5;
    y = titulo(doc, 'Media del grupo por criterio', y, 11);
    y = tabla(doc, {
      startY: y, head: [['Criterio', 'CE', 'Media', 'Máx.', 'Nivel']],
      body: cabecera.criterios.map((c) => {
        const ms = alumnos.map((a) => a.porCriterio.find((x) => x.id === c.id).media).filter((m) => m != null);
        const m = ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null;
        return [t(c.nombre), c.ce, f2(m), String(c.max), m == null ? '—' : nivel(m / c.max)];
      }),
      columnStyles: { 1: { cellWidth: 14 }, 2: { cellWidth: 18, halign: 'right' }, 3: { cellWidth: 14, halign: 'right' }, 4: { cellWidth: 24 } },
    }) + 3;
    anexo(doc, cabecera, y);
    for (const a of alumnos) {
      doc.addPage();
      y = banda(doc, cabecera, 'Informe individual de evaluación (anexo del informe conjunto)');
      seccionAlumno(doc, cabecera, a, y + 4);
    }
    pies(doc);
    const d = new Date(cabecera.generado).toISOString().slice(0, 10);
    doc.save(`Informe_CRA_conjunto_${d}.pdf`);
  }

  // Todos los informes individuales en un único archivo: Informe_CRA_[fecha_hora].pdf (hora de Canarias)
  function individuales({ cabecera, alumnos }) {
    const doc = nuevo();
    alumnos.forEach((a, k) => {
      if (k) doc.addPage();
      const y = banda(doc, cabecera, 'Informe individual de evaluación · Recepción, verificación y transmisión de señales de alarma');
      seccionAlumno(doc, cabecera, a, y + 4);
    });
    doc.addPage();
    anexo(doc, cabecera, 18);
    pies(doc);
    const p = Object.fromEntries(new Intl.DateTimeFormat('es-ES', { timeZone: 'Atlantic/Canary', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(cabecera.generado)).map((x) => [x.type, x.value]));
    doc.save(`Informe_CRA_${p.year}-${p.month}-${p.day}_${p.hour}-${p.minute}.pdf`);
  }

  return { informeAlumno, conjunto, individuales };
})();
