/* Visor flotante de los vídeos de cámara (5 s): reproducir/pausar, ±1 s, repetir, barra de posición. Arrastrable. */
'use strict';
const Visor = (function () {
  const box = $('#visor'), v = $('#visor-video'), pos = $('#visor-pos'), tt = $('#visor-t'), play = $('#visor-play');
  const fmt1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
  const pintar = () => {
    const d = v.duration || 5;
    pos.max = d; pos.value = v.currentTime;
    tt.textContent = `${fmt1(v.currentTime)} / ${fmt1(d)} s`;
    play.textContent = v.paused ? '▶' : '⏸';
  };
  v.addEventListener('timeupdate', pintar);
  v.addEventListener('play', pintar); v.addEventListener('pause', pintar); v.addEventListener('ended', pintar);
  v.addEventListener('loadedmetadata', pintar);
  v.addEventListener('error', () => { if (!box.hidden) { box.hidden = true; aviso('La grabación de esta cámara no está disponible todavía. Usa la descripción del chat.', 'error', 3000); } });
  pos.addEventListener('input', () => { v.pause(); v.currentTime = Number(pos.value); pintar(); });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    const d = v.duration || 5;
    if (b.dataset.v === 'play') { if (v.paused) { if (v.ended) v.currentTime = 0; v.play(); } else v.pause(); }
    if (b.dataset.v === 'atras') v.currentTime = Math.max(0, v.currentTime - 1);
    if (b.dataset.v === 'adelante') v.currentTime = Math.min(d, v.currentTime + 1);
    if (b.dataset.v === 'otra') { v.currentTime = 0; v.play(); }
    pintar();
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === ' ' && e.target.tagName !== 'BUTTON') { e.preventDefault(); $('[data-v="play"]', box).click(); }
    if (e.key === 'ArrowLeft' && e.target !== pos) $('[data-v="atras"]', box).click();
    if (e.key === 'ArrowRight' && e.target !== pos) $('[data-v="adelante"]', box).click();
    if (e.key === 'Escape') cerrar();
  });
  $('#visor-cerrar').addEventListener('click', () => cerrar());

  // arrastrar por la cabecera
  const cab = $('#visor-cab');
  cab.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = box.getBoundingClientRect();
    const dx = e.clientX - r.left, dy = e.clientY - r.top;
    cab.setPointerCapture(e.pointerId);
    const mover = (ev) => {
      const x = Math.min(innerWidth - r.width, Math.max(0, ev.clientX - dx));
      const y = Math.min(innerHeight - 60, Math.max(0, ev.clientY - dy));
      Object.assign(box.style, { left: `${x}px`, top: `${y}px`, right: 'auto', bottom: 'auto' });
    };
    const fin = () => { cab.removeEventListener('pointermove', mover); cab.removeEventListener('pointerup', fin); };
    cab.addEventListener('pointermove', mover); cab.addEventListener('pointerup', fin);
  });

  function abrir(id, desc) {
    $('#visor-tit').textContent = `📹 Cámara · grabación de verificación`;
    $('#visor-desc').textContent = desc || '';
    const mp4 = v.canPlayType('video/mp4; codecs="avc1.640028"');
    v.src = `video/camaras/${id}.${mp4 ? 'mp4' : 'webm'}`;
    box.hidden = false;
    v.currentTime = 0;
    v.play().catch(() => pintar());
    setTimeout(() => play.focus(), 50);
  }
  function cerrar() { v.pause(); box.hidden = true; }
  return { abrir, cerrar };
})();
