// Guía del procedimiento en CRA — vídeo tutorial (16:9, sin audio, texto en pantalla).
// Función pura del tiempo: window.seek(t) pinta el fotograma t. Rejilla de 1 s (u = segundos).
// Plan: docs/shotlist.md. Imágenes: capturas reales del simulador (assets/shots, assets/boxes.json).
import * as M from './lib/motion.js';

const { W, H, E, prog, lerp, clamp, springU, SPRING, font, layout, text, fill, rrect, fitSize } = M;

const C = { bg: '#0b1220', card: '#111b2b', line: '#24344d', ink: '#e7edf6', muted: '#9aabc2', accent: '#f5a524', danger: '#ff6b6b' };
const DISPLAY = 'Display', UI = 'UI';
const BOX = await fetch('assets/boxes.json').then((r) => r.json());
const b = (img, sel, i = 0) => BOX[img][sel][i];
const msg = (img, i) => BOX[img].msgs[i].slice(0, 4);

// Tarjeta de pantalla (derecha) y columna de texto (izquierda)
const CARD = { x: 790, y: 190, w: 1030, h: 579 };
const COL = { x: 110, w: 610 };

// ---------------------------------------------------------------- guion
// lines: [t, texto, { size, color, weight, gap }]   cams: [t, imagen, cx, cy, zoom]   marks: [t0, t1, imagen, caja]
const SCENES = [
  {
    t0: 0, t1: 10, kind: 'portada',
    lines: [
      [-0.5, 'CRA · CFGM Técnico en Seguridad', { size: 30, color: C.muted, weight: 700 }],
      [-0.35, 'Cómo atender', { size: 128, color: C.ink, display: true, gap: 26 }],
      [-0.2, 'una señal', { size: 128, color: C.ink, display: true }],
      [2.2, '6 pasos · 120 segundos', { size: 52, color: C.accent, weight: 700, gap: 34 }],
      [4.0, 'Guía del procedimiento', { size: 36, color: C.muted, gap: 20 }],
      [4.4, 'para el puesto de teleoperador/a', { size: 36, color: C.muted }],
    ],
    cams: [[0, 'cola', 0.5, 0.5, 1.0], [3.2, 'cola', 0.22, 0.3, 2.0]],
    marks: [[0.6, 2.9, 'cola', [0.0215, 0.2185, 0.3825, 0.118]], [5.2, 9.4, 'cola', b('cola', '#cola')]],
  },
  {
    t0: 10, t1: 22, num: '120', label: 'TU TIEMPO',
    lines: [
      [11, 'Tienes 120 segundos'],
      [11.6, 'desde que atiendes.'],
      [14.5, 'La barra pasa de verde', { gap: 26 }],
      [15.1, 'a rojo.'],
      [18, '¿Te pasas? No cuelgues:', { color: C.accent, gap: 26 }],
      [18.6, 'termina la gestión.', { color: C.accent }],
    ],
    cams: [[10, 'ventana_inicio', 0.86, 0.12, 3.0], [14.5, 'ventana_ambar', 0.86, 0.12, 3.0], [17, 'ventana_rojo', 0.86, 0.12, 3.0], [20.4, 'ventana_rojo', 0.5, 0.5, 1.0]],
    marks: [[11, 20.2, 'ventana_inicio', b('ventana_inicio', '.temporizador')], [11, 20.2, 'ventana_ambar', b('ventana_inicio', '.temporizador')], [11, 20.2, 'ventana_rojo', b('ventana_inicio', '.temporizador')]],
  },
  {
    t0: 22, t1: 40, num: '1', label: 'RECEPCIÓN', paso: 0,
    lines: [
      [23, 'Entra una señal de la'],
      [23.5, 'centralita o la llamada'],
      [24, 'de una persona.'],
      [28, 'Pulsa «Atender».', { color: C.accent, gap: 26 }],
      [31, 'Lee el código, el evento', { gap: 26 }],
      [31.5, 'y la zona.'],
      [35, 'E130 intrusión · E120 pánico', { size: 34, color: C.muted, gap: 22 }],
      [35.4, 'E100 sanitaria · E110 fuego', { size: 34, color: C.muted }],
    ],
    cams: [[22, 'cola', 0.22, 0.3, 2.2], [30.5, 'ventana_inicio', 0.28, 0.12, 2.6], [37.2, 'ventana_inicio', 0.5, 0.5, 1.0]],
    marks: [[24.5, 30.3, 'cola', b('cola', '#cola')], [31.2, 37, 'ventana_inicio', [0.009, 0.084, 0.56, 0.0767]]],
  },
  {
    t0: 40, t1: 62, num: '2', label: 'IDENTIFICACIÓN', paso: 1,
    lines: [
      [41, 'Pulsa «Zonas activadas»:'],
      [41.6, 'qué saltó y a qué hora.'],
      [47, 'Si hablas con alguien,', { gap: 26 }],
      [47.5, 'pide la palabra clave.', { color: C.accent }],
      [53, '¿Te da la de COACCIÓN?', { color: C.danger, gap: 26, weight: 700 }],
      [55.5, 'Sigue normal, no anules'],
      [56, 'y avisa a la policía.'],
    ],
    cams: [[40, 'ventana_secuencia', 0.28, 0.3, 1.9], [46.5, 'coaccion', 0.78, 0.52, 2.4], [52.5, 'coaccion', 0.28, 0.3, 1.9], [55.4, 'coaccion', 0.78, 0.52, 2.6]],
    marks: [
      [41.5, 46.3, 'ventana_secuencia', msg('ventana_secuencia', 1)],
      [47.6, 52.3, 'coaccion', b('coaccion', '.claves')],
      [53.2, 55.3, 'coaccion', msg('coaccion', 4)],
      [55.6, 61, 'coaccion', b('coaccion', '.claves .co')],
    ],
  },
  {
    t0: 62, t1: 88, num: '3', label: 'VERIFICACIÓN', paso: 2,
    lines: [
      [63, 'Varios detectores seguidos'],
      [63.6, '= alguien se mueve dentro.', { color: C.accent }],
      [68, 'Uno solo no basta: confírmalo.', { gap: 26 }],
      [72.2, 'Vídeo · Audio · Llamada · Vigilante', { color: C.accent, gap: 26, weight: 700 }],
      [78, 'Atraco silencioso:', { color: C.danger, gap: 26, weight: 700 }],
      [78.6, 'NUNCA llames a la instalación.', { color: C.danger, weight: 700 }],
    ],
    cams: [[62, 'ventana_secuencia', 0.28, 0.3, 1.9], [67.5, 'ventana_video', 0.28, 0.33, 1.9], [71.6, 'ventana_video', 0.2, 0.87, 2.6], [77.5, 'silencioso', 0.28, 0.33, 1.9]],
    marks: [
      [63, 67.3, 'ventana_secuencia', msg('ventana_secuencia', 1)],
      [68.5, 71.4, 'ventana_video', msg('ventana_video', 2)],
      [72.5, 77.3, 'ventana_video', b('ventana_video', '.w-acciones fieldset:nth-of-type(1)')],
      [78.5, 86.5, 'silencioso', msg('silencioso', 1)],
    ],
  },
  {
    t0: 88, t1: 104, num: '4', label: 'DECISIÓN', paso: 3,
    lines: [
      [89, '¿Qué ha pasado?'],
      [90.5, 'Real · Falsa · Técnica', { color: C.accent, size: 60, weight: 700, gap: 22 }],
      [95, 'Sin verificar no movilizas', { gap: 30 }],
      [95.5, 'a la policía, salvo riesgo'],
      [96, 'para las personas.'],
    ],
    cams: [[88, 'cierre', 0.83, 0.85, 2.6], [100.5, 'cierre', 0.5, 0.5, 1.0]],
    marks: [[89.5, 100.2, 'cierre', b('cierre', '#w-clasif')]],
  },
  {
    t0: 104, t1: 124, num: '5', label: 'TRANSMISIÓN', paso: 4,
    lines: [
      [105, 'Alarma real →', { color: C.accent, weight: 700 }],
      [105.5, 'FCSE competente', { color: C.accent, weight: 700 }],
      [107.5, 'Dirección · tipo de señal ·', { size: 38, color: C.muted, gap: 14 }],
      [108, 'verificación · autores', { size: 38, color: C.muted }],
      [113, 'Heridos o fuego → 1-1-2', { gap: 30 }],
      [117.5, 'Para poder entrar → llavero', { gap: 26 }],
    ],
    cams: [[104, 'form_fcse', 0.5, 0.55, 1.4], [112.5, 'cierre', 0.52, 0.86, 2.6]],
    marks: [[106.5, 112.2, 'form_fcse', [0.13, 0.36, 0.74, 0.17]], [113.5, 122.5, 'cierre', b('cierre', '.w-acciones fieldset:nth-of-type(2)')]],
  },
  {
    t0: 124, t1: 140, num: '6', label: 'REGISTRO Y CIERRE', paso: 5,
    lines: [
      [125, 'Clasifica y escribe:'],
      [126, 'qué pasó, qué verificaste', { color: C.accent }],
      [126.5, 'y a quién avisaste.', { color: C.accent }],
      [132.5, 'Así se te evalúa:', { gap: 30 }],
      [133, 'nota sobre 10 y mejoras.'],
    ],
    cams: [[124, 'cierre', 0.83, 0.86, 2.5], [131.8, 'correccion', 0.5, 0.48, 1.22]],
    marks: [[125.5, 131.5, 'cierre', b('cierre', '#w-f-cierre')], [133, 139, 'correccion', [0.13, 0.17, 0.74, 0.37]]],
  },
  {
    t0: 140, t1: 146.6, num: '!', label: 'OJO', danger: true,
    lines: [
      [141, 'Colgar sin gestionar', { size: 56, weight: 700 }],
      [141.8, '= ERROR GRAVE', { size: 72, color: C.danger, weight: 700, gap: 10 }],
      [142.6, 'La incidencia vale 0.', { color: C.muted, gap: 18 }],
    ],
    cams: [[140, 'error_grave', 0.5, 0.5, 1.6]],
    marks: [[141.6, 146.4, 'error_grave', b('error_grave', '.aviso', 1)]],
  },
  {
    t0: 146.6, t1: 152.01, kind: 'fin',
    lines: [
      [147, 'Ahora te toca.', { size: 120, display: true }],
      [147.7, 'Entra en tu puesto.', { size: 60, color: C.accent, weight: 700, gap: 24 }],
    ],
    cams: [[146.6, 'inicio', 0.735, 0.34, 2.4]],
    marks: [[147.6, 152, 'inicio', [0.5429, 0.135, 0.3321, 0.272]]],
  },
];
const PASOS = ['Recepción', 'Identificación', 'Verificación', 'Decisión', 'Transmisión', 'Registro'];

// ---------------------------------------------------------------- utilidades
const sp = (t, t0, cfg = SPRING.gentle) => springU(t, t0, cfg);

function camara(t, keys) {
  let i = 0;
  for (let k = 0; k < keys.length; k++) if (keys[k][0] <= t) i = k;
  const cur = keys[i];
  const prev = i > 0 ? keys[i - 1] : null;
  let [, img, cx, cy, z] = cur;
  if (prev && prev[1] === cur[1] && t >= cur[0]) {
    const p = clamp(sp(t, cur[0], SPRING.smooth || SPRING.gentle), 0, 1.02);
    cx = lerp(prev[2], cur[2], p); cy = lerp(prev[3], cur[3], p);
    z = prev[4] * (cur[4] / prev[4]) ** p;
  } else {
    // corte: la imagen nueva entra con un leve empuje que se asienta
    z *= 1 + 0.05 * (1 - E.outCubic(prog(t, cur[0], cur[0] + 1.1)));
  }
  z *= 1 + 0.012 * Math.min(1, (t - cur[0]) / 8); // deriva lenta
  return { img, cx, cy, z, cut: !(prev && prev[1] === cur[1]), t0: cur[0] };
}

function vista(cam) {
  const vw = 1 / cam.z, vh = 1 / cam.z;
  const left = clamp(cam.cx - vw / 2, 0, 1 - vw), top = clamp(cam.cy - vh / 2, 0, 1 - vh);
  return { left, top, vw, vh };
}
const aCarta = (v, nx, ny) => [CARD.x + ((nx - v.left) / v.vw) * CARD.w, CARD.y + ((ny - v.top) / v.vh) * CARD.h];

function carta(ctx, t, sc, IMG, entrada) {
  const cam = camara(t, sc.cams);
  const im = IMG[cam.img];
  if (!im) return;
  const v = vista(cam);
  const dy = (1 - entrada) * 140;
  ctx.save();
  ctx.translate(0, dy);
  ctx.globalAlpha = clamp(entrada * 1.4);
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18;
  rrect(ctx, CARD.x, CARD.y, CARD.w, CARD.h, 22); ctx.fillStyle = C.card; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.save();
  rrect(ctx, CARD.x, CARD.y, CARD.w, CARD.h, 22); ctx.clip();
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(im, v.left * im.width, v.top * im.height, v.vw * im.width, v.vh * im.height, CARD.x, CARD.y, CARD.w, CARD.h);
  // foco: oscurece el resto de la pantalla y rodea la zona que importa
  for (const [m0, m1, mimg, box] of sc.marks) {
    if (mimg !== cam.img || t < m0 || t > m1 + 0.6) continue;
    const kin = clamp(sp(t, m0, SPRING.snappy || SPRING.gentle));
    const kout = 1 - E.inOutCubic(prog(t, m1, m1 + 0.5));
    const k = Math.min(kin, kout);
    if (k <= 0) continue;
    const pad = 0.006;
    let [x0, y0] = aCarta(v, box[0] - pad, box[1] - pad * 1.6);
    let [x1, y1] = aCarta(v, box[0] + box[2] + pad, box[1] + box[3] + pad * 1.6);
    x0 = Math.max(CARD.x + 6, x0); y0 = Math.max(CARD.y + 6, y0); x1 = Math.min(CARD.x + CARD.w - 6, x1); y1 = Math.min(CARD.y + CARD.h - 6, y1);
    const g = (1 - kin) * 22;
    ctx.save();
    ctx.globalAlpha = 0.55 * k;
    ctx.beginPath(); ctx.rect(CARD.x, CARD.y, CARD.w, CARD.h); ctx.roundRect(x0 - g, y0 - g, x1 - x0 + 2 * g, y1 - y0 + 2 * g, 14);
    ctx.fillStyle = '#050a14'; ctx.fill('evenodd');
    ctx.globalAlpha = k;
    rrect(ctx, x0 - g, y0 - g, x1 - x0 + 2 * g, y1 - y0 + 2 * g, 14);
    ctx.lineWidth = 5; ctx.strokeStyle = sc.danger ? C.danger : C.accent; ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
  ctx.lineWidth = 1.5; ctx.strokeStyle = C.line; rrect(ctx, CARD.x, CARD.y, CARD.w, CARD.h, 22); ctx.stroke();
  ctx.restore();
}

function lineas(ctx, t, sc, y0, salida) {
  let y = y0;
  for (const [lt, str, o = {}] of sc.lines) {
    let size = o.size || 44;
    if (o.display) size = Math.min(size, fitSize(ctx, str, 800, DISPLAY, COL.w, size, -0.02));
    else size = Math.min(size, fitSize(ctx, str, o.weight || 500, UI, COL.w + 60, size));
    const f = o.display ? font(size, 800, DISPLAY) : font(size, o.weight || 500, UI);
    const lh = o.display ? size * 1.0 : size * 1.3;
    y += (o.gap || 0) + lh;
    const k = sp(t, lt, SPRING.gentle);
    if (k <= 0) continue;
    const off = (1 - k) * lh * 0.9 - salida * 60;
    ctx.save();
    ctx.beginPath(); ctx.rect(COL.x - 20, y - lh - 10, COL.w + 200, lh + 26); ctx.clip();
    ctx.globalAlpha = 1 - salida;
    text(ctx, str, COL.x, y + off, f, o.color || C.ink, 'left', o.display ? -0.02 * size : 0);
    ctx.restore();
  }
}

function cabecera(ctx, t, sc, salida) {
  if (!sc.num) return 300;
  const k = sp(t, sc.t0, SPRING.bouncy || SPRING.gentle);
  const col = sc.danger ? C.danger : C.accent;
  const size = sc.num.length > 1 ? 170 : 230;
  ctx.save();
  ctx.beginPath(); ctx.rect(COL.x - 20, 60, COL.w + 300, 270); ctx.clip();
  ctx.globalAlpha = 1 - salida;
  text(ctx, sc.num, COL.x - 8, 300 + (1 - k) * 260 - salida * 80, font(size, 800, DISPLAY), col, 'left', -0.03 * size);
  const L = layout(ctx, sc.num, font(size, 800, DISPLAY), -0.03 * size);
  const k2 = sp(t, sc.t0 + 0.25, SPRING.gentle);
  text(ctx, sc.label, COL.x + L.width + 26, 300 - (1 - k2) * 0 - 12 - salida * 80, font(34, 700, UI), C.muted, 'left', 4);
  ctx.restore();
  // regla bajo la etiqueta, crece de izquierda a derecha
  const r = E.outCubic(prog(t, sc.t0 + 0.4, sc.t0 + 1.2)) * (1 - salida);
  ctx.fillStyle = col; ctx.fillRect(COL.x + L.width + 28, 304, 120 * r, 5);
  return 330;
}

function progreso(ctx, t, sc) {
  if (sc.paso === undefined) return;
  const y = 905, x0 = COL.x, w = 1820 - COL.x, n = PASOS.length, gap = 14, sw = (w - gap * (n - 1)) / n;
  const k = E.outCubic(prog(t, sc.t0, sc.t0 + 0.8));
  PASOS.forEach((p, i) => {
    const x = x0 + i * (sw + gap);
    const activo = i === sc.paso, hecho = i < sc.paso;
    ctx.fillStyle = activo ? C.accent : hecho ? '#6b5320' : C.line;
    const ww = activo ? sw * (0.15 + 0.85 * k) : sw;
    rrect(ctx, x, y, ww, 8, 4); ctx.fill();
    if (activo) { ctx.fillStyle = C.line; rrect(ctx, x + ww, y, sw - ww, 8, 4); ctx.fill(); }
    text(ctx, `${i + 1}. ${p}`, x, y + 48, font(26, activo ? 700 : 500, UI), activo ? C.ink : C.muted);
  });
}

// ---------------------------------------------------------------- escena
function escena(ctx, t, sc, IMG) {
  const salida = sc.kind === 'fin' ? 0 : E.inOutCubic(prog(t, sc.t1 - 0.45, sc.t1));
  const yLineas = sc.kind ? (sc.kind === 'portada' ? 210 : 330) : cabecera(ctx, t, sc, salida);
  lineas(ctx, t, sc, yLineas + (sc.kind ? 0 : 10), salida);
  // la carta solo entra en la portada; después permanece y corta de imagen a imagen
  const entrada = sc.kind === 'portada' ? clamp(sp(t, -0.15, SPRING.gentle)) : 1;
  carta(ctx, t, sc, IMG, entrada);
  progreso(ctx, t, sc);
}

M.film({
  fonts: [font(100, 800, DISPLAY), font(40, 500, UI), font(40, 700, UI)],
  images: Object.fromEntries(['cola', 'ventana_inicio', 'ventana_ambar', 'ventana_rojo', 'ventana_secuencia', 'ventana_video', 'coaccion', 'silencioso', 'cierre', 'form_fcse', 'correccion', 'error_grave', 'inicio'].map((k) => [k, `assets/shots/${k}.png`])),
  hits: [],
  samples: 6,
  draw(ctx, u, t, IMG) {
    fill(ctx, C.bg);
    const sc = SCENES.find((s) => u >= s.t0 && u < s.t1) || SCENES[SCENES.length - 1];
    escena(ctx, u, sc, IMG);
  },
});
