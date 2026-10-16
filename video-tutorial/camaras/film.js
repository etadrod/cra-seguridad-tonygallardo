// Cámaras CRA: 8 grabaciones simuladas de 5 s para la verificación por vídeo (una por supuesto con cámara).
// Función pura del tiempo. Cada bloque de 5 s es un clip; se cortan con ffmpeg al terminar.
// Estética CCTV: monocromo, grano, OSD con cámara, fecha y hora. Siluetas esquemáticas, sin violencia gráfica.
import * as M from './lib/motion.js';

const { W, H, E, prog, lerp, clamp, font, text, hash01, noise1 } = M;
const UI = 'UI';

const CLIPS = [
  { id: 'S02', cam: 'CAM 02 · ZONA DE VENTA', hora: [3, 12, 37], dibujar: joyeria },
  { id: 'S04', cam: 'CAM 01 · MUELLE DE CARGA', hora: [4, 41, 5], dibujar: muelle },
  { id: 'S05', cam: 'CAM 03 · MOSTRADOR · REPRODUCCIÓN -01:00', hora: [20, 47, 12], dibujar: farmacia },
  { id: 'S06', cam: 'CAM 01 · RECEPCIÓN', hora: [23, 18, 50], dibujar: globos },
  { id: 'S07', cam: 'CAM 01 · RECEPCIÓN', hora: [21, 40, 22], dibujar: contraluz },
  { id: 'S08', cam: 'CAM 04 · ALMACÉN', hora: [2, 3, 44], dibujar: almacen, color: true },
  { id: 'S10', cam: 'CAM 02 · CAJA', hora: [1, 27, 9], dibujar: gasolinera },
  { id: 'S11', cam: 'CAM 05 · EXTERIOR TRASERA', hora: [3, 55, 31], dibujar: exterior },
  { id: 'S12', cam: 'CAM 01 · RECEPCIÓN', hora: [6, 45, 3], dibujar: limpieza },
  { id: 'S13', cam: 'CAM 03 · DESPACHO DIRECCIÓN', hora: [3, 2, 18], dibujar: despacho },
  { id: 'S16', cam: 'CAM 01 · HALL', hora: [22, 14, 40], dibujar: hall },
  { id: 'S18', cam: 'CAM 02 · CAMPA EXTERIOR', hora: [1, 33, 12], dibujar: perro },
  { id: 'S19', cam: 'CAM 02 · PATIO DE OPERACIONES', hora: [8, 31, 6], dibujar: banco },
  { id: 'S20', cam: 'CAM 01 · POLVORÍN (IR)', hora: [2, 48, 51], dibujar: polvorin, color: true },
  { id: 'S21', cam: 'CAM 02 · ZONA DE VENTA', hora: [23, 9, 0], dibujar: sinSenal },
  { id: 'S22', cam: 'CAM 02 · PATIO', hora: [0, 41, 27], dibujar: patio },
  { id: 'S24', cam: 'CAM 03 · LÍNEA DE CAJAS', hora: [19, 52, 33], dibujar: cajas },
];

// ---------------------------------------------------------------- utilidades de dibujo
const g = (v) => `rgb(${v},${v},${v})`;
function poly(ctx, pts, color) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fillStyle = color; ctx.fill(); }
function rect(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
function sala(ctx, suelo = 46, pared = 70, lateral = 58) {
  // habitación en perspectiva desde una cámara en la esquina alta
  rect(ctx, 0, 0, W, H, g(pared));
  poly(ctx, [[0, 0], [360, 180], [360, 760], [0, H]], g(lateral));
  poly(ctx, [[W, 0], [1560, 180], [1560, 760], [W, H]], g(lateral - 6));
  poly(ctx, [[0, H], [360, 760], [1560, 760], [W, H]], g(suelo));
  poly(ctx, [[0, 0], [W, 0], [1560, 180], [360, 180]], g(pared - 22));
}
// Silueta esquemática: x,y = pies; s = escala; pose = { paso, brazoI, brazoD, cabeza, capucha, casco, mochila }
function persona(ctx, x, y, s, p = {}, tono = 22) {
  const c = g(tono);
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.lineCap = 'round'; ctx.strokeStyle = c; ctx.fillStyle = c;
  const paso = p.paso || 0;
  // piernas
  ctx.lineWidth = 26;
  ctx.beginPath(); ctx.moveTo(-14, -190); ctx.lineTo(-14 + Math.sin(paso) * 34, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(14, -190); ctx.lineTo(14 - Math.sin(paso) * 34, 0); ctx.stroke();
  // tronco
  ctx.beginPath(); ctx.roundRect(-46, -390, 92, 220, 30); ctx.fill();
  if (p.mochila) { ctx.fillStyle = g(tono + 14); ctx.beginPath(); ctx.roundRect(p.mochila > 0 ? 30 : -66, -370, 36, 120, 10); ctx.fill(); ctx.fillStyle = c; }
  // brazos (ángulo en radianes desde la vertical hacia abajo)
  ctx.lineWidth = 22;
  const brazo = (lado, ang, objeto) => {
    const ox = lado * 40, oy = -370;
    const ex = ox + Math.sin(ang) * 150 * lado, ey = oy + Math.cos(ang) * 150;
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ex, ey); ctx.stroke();
    if (objeto === 'maza') { ctx.save(); ctx.translate(ex, ey); ctx.rotate(-ang * lado); ctx.fillStyle = g(tono + 30); ctx.fillRect(-8, -10, 16, 90); ctx.fillRect(-30, 70, 60, 34); ctx.restore(); }
    if (objeto === 'cuchillo') { ctx.save(); ctx.translate(ex, ey); ctx.rotate(-ang * lado); ctx.fillStyle = g(150); ctx.fillRect(-4, 0, 8, 46); ctx.restore(); }
    if (objeto === 'arma') { ctx.save(); ctx.translate(ex, ey); ctx.rotate(-ang * lado); ctx.fillStyle = g(tono - 8); ctx.fillRect(-9, -6, 18, 44); ctx.restore(); }
    if (objeto === 'barra') { ctx.save(); ctx.translate(ex, ey); ctx.rotate(-ang * lado); ctx.fillStyle = g(tono + 40); ctx.fillRect(-5, -60, 10, 150); ctx.restore(); }
  };
  brazo(-1, p.brazoI ?? 0.15, p.objI);
  brazo(1, p.brazoD ?? 0.15, p.objD);
  // cabeza
  ctx.translate(p.cabeza || 0, 0);
  ctx.beginPath(); ctx.arc(0, -440, 44, 0, Math.PI * 2); ctx.fill();
  if (p.capucha) { ctx.beginPath(); ctx.arc(0, -446, 54, Math.PI * 0.95, Math.PI * 2.05); ctx.lineTo(48, -400); ctx.lineTo(-48, -400); ctx.fill(); }
  if (p.casco) { ctx.fillStyle = g(tono + 26); ctx.beginPath(); ctx.arc(0, -446, 58, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = g(tono + 70); ctx.fillRect(-40, -462, 80, 22); }
  ctx.restore();
}
const andar = (t, v = 7) => t * v;

// ---------------------------------------------------------------- escenas (t local 0..5)
function joyeria(ctx, t) {
  sala(ctx, 44, 64, 54);
  // vitrinas iluminadas al fondo
  for (let i = 0; i < 3; i++) { rect(ctx, 520 + i * 330, 420, 260, 140, g(118)); rect(ctx, 530 + i * 330, 430, 240, 70, g(150)); rect(ctx, 520 + i * 330, 560, 260, 200, g(36)); }
  // escaparate roto (izquierda)
  rect(ctx, 60, 260, 240, 420, g(96));
  ctx.strokeStyle = g(190); ctx.lineWidth = 3;
  for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(180, 470); ctx.lineTo(180 + Math.cos(a) * 160, 470 + Math.sin(a) * 210); ctx.stroke(); }
  for (let k = 0; k < 26; k++) rect(ctx, 120 + hash01(k, 3) * 420, 800 + hash01(k, 5) * 200, 10, 6, g(170));
  // P1 golpea la vitrina central con una maza
  const golpe = Math.sin(t * 5.2);
  const ang = 2.6 - 1.4 * (golpe * 0.5 + 0.5);
  persona(ctx, 1010, 900, 1.0, { capucha: true, brazoD: ang, brazoI: ang - 0.2, objD: 'maza', cabeza: 4 }, 20);
  if (golpe < -0.92) rect(ctx, 850, 420, 260, 140, 'rgba(255,255,255,.55)');
  // P2 entra por el escaparate con mochila y se dirige a la vitrina derecha
  const x2 = lerp(300, 1300, E.inOutSine(prog(t, 0, 5)));
  persona(ctx, x2, 960, 1.08, { capucha: true, paso: andar(t), brazoI: 0.4 + Math.sin(andar(t)) * 0.3, brazoD: 0.4 - Math.sin(andar(t)) * 0.3, mochila: -1 }, 24);
}

function muelle(ctx, t) {
  sala(ctx, 40, 52, 44);
  // persiana del muelle y palés
  rect(ctx, 600, 230, 720, 530, g(66));
  for (let k = 0; k < 18; k++) rect(ctx, 600, 240 + k * 29, 720, 4, g(56));
  for (let i = 0; i < 4; i++) { rect(ctx, 420 + i * 300, 760, 240, 30, g(78)); rect(ctx, 430 + i * 300, 650, 220, 110, g(60 + (i % 2) * 10)); }
  // alumbrado de emergencia (batería): parpadeo leve, sin movimiento
  const luz = 0.06 + 0.04 * Math.max(0, Math.sin(t * 9) * Math.sin(t * 2.3));
  rect(ctx, 0, 0, W, H, `rgba(255,255,255,${luz})`);
  rect(ctx, 930, 200, 60, 16, g(200));
}

function farmacia(ctx, t) {
  sala(ctx, 52, 82, 66);
  // estanterías de fondo
  for (let r = 0; r < 4; r++) for (let c = 0; c < 9; c++) rect(ctx, 420 + c * 125, 230 + r * 90, 100, 60, g(96 + ((r + c) % 3) * 12));
  // empleada tras el mostrador, manos arriba
  persona(ctx, 1260, 860, 0.92, { brazoI: 2.7, brazoD: 2.7 }, 30);
  // mostrador en primer plano
  rect(ctx, 0, 690, W, 390, g(58)); rect(ctx, 0, 690, W, 24, g(110));
  // cajón que sale y se va con el autor
  const coge = prog(t, 1.8, 2.4);
  const huida = E.inCubic(prog(t, 2.8, 4.6));
  const xa = lerp(820, 2300, huida);
  rect(ctx, lerp(1040, xa + 60, coge), 700, 140, 40, g(150));
  // autor encapuchado, amenaza con un cuchillo y huye a la derecha
  persona(ctx, xa, 1060, 1.1, { capucha: true, paso: huida > 0 ? andar(t, 10) : 0, brazoD: huida > 0 ? 1.2 : 1.55 + 0.06 * Math.sin(t * 6), objD: 'cuchillo', brazoI: 0.5 }, 18);
}

function globos(ctx, t) {
  sala(ctx, 60, 92, 76);
  // mostrador de recepción y detector con LED
  rect(ctx, 700, 560, 560, 200, g(70)); rect(ctx, 700, 560, 560, 18, g(120));
  rect(ctx, 1470, 210, 50, 34, g(160));
  const cerca = [0, 1, 2].some((i) => Math.abs(globoX(t, i) - 1300) < 180);
  if (cerca && Math.sin(t * 20) > 0) { ctx.fillStyle = 'rgb(255,60,60)'; ctx.beginPath(); ctx.arc(1495, 252, 7, 0, Math.PI * 2); ctx.fill(); }
  for (let i = 0; i < 3; i++) {
    const x = globoX(t, i), y = 380 + i * 30 + Math.sin(t * 1.4 + i) * 22;
    ctx.strokeStyle = g(150); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y + 60); ctx.quadraticCurveTo(x + 20, y + 200, x - 10, y + 300); ctx.stroke();
    ctx.fillStyle = g(170 + i * 20); ctx.beginPath(); ctx.ellipse(x, y, 52, 62, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(x - 16, y - 22, 12, 18, -0.4, 0, Math.PI * 2); ctx.fill();
  }
}
const globoX = (t, i) => 980 + i * 150 + t * (28 + i * 9) + Math.sin(t * 0.9 + i * 2) * 40;

function contraluz(ctx, t) {
  sala(ctx, 34, 40, 34);
  // puerta acristalada muy iluminada desde la calle
  rect(ctx, 760, 220, 400, 540, g(232));
  rect(ctx, 955, 220, 10, 540, g(160));
  // dos siluetas casi negras junto a la puerta
  persona(ctx, 840, 900, 1.05, { brazoD: 0.2, cabeza: Math.sin(t * 1.2) * 6 }, 12);
  persona(ctx, 1080 + Math.sin(t * 0.8) * 10, 920, 1.12, { brazoI: 0.3 + 0.1 * Math.sin(t), cabeza: t > 2.5 ? -10 : 0 }, 10);
  // brillo que satura la imagen
  const grad = ctx.createRadialGradient(960, 490, 60, 960, 490, 700);
  grad.addColorStop(0, 'rgba(255,255,255,.35)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
}

function almacen(ctx, t) {
  // cámara en color, con tonos apagados
  ctx.fillStyle = 'rgb(46,44,40)'; ctx.fillRect(0, 0, W, H);
  poly(ctx, [[0, H], [360, 760], [1560, 760], [W, H]], 'rgb(58,56,50)');
  // estanterías con palés
  for (let c = 0; c < 4; c++) for (let r = 0; r < 3; r++) {
    rect(ctx, 300 + c * 360, 260 + r * 170, 300, 12, 'rgb(150,90,40)');
    rect(ctx, 320 + c * 360, 180 + r * 170, 260, 80, 'rgb(120,105,80)');
  }
  // resplandor anaranjado al fondo
  const fl = 0.35 + 0.2 * noise1(t * 6, 4);
  const grad = ctx.createRadialGradient(1300, 600, 20, 1300, 600, 520);
  grad.addColorStop(0, `rgba(255,140,40,${fl})`); grad.addColorStop(1, 'rgba(255,140,40,0)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  // humo gris que crece y avanza
  for (let k = 0; k < 40; k++) {
    const nace = hash01(k, 7) * 3.2, vida = t - nace;
    if (vida < 0) continue;
    const x = 1300 + (hash01(k, 9) - 0.5) * 300 - vida * 60 * hash01(k, 11);
    const y = 600 - vida * 90 - hash01(k, 13) * 80;
    const r = 60 + vida * 70;
    ctx.fillStyle = `rgba(150,150,150,${clamp(0.28 - vida * 0.03, 0.08, 0.28)})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = `rgba(140,140,140,${0.12 + 0.06 * t})`; ctx.fillRect(0, 0, W, 360);
}

function gasolinera(ctx, t) {
  sala(ctx, 56, 86, 70);
  // escaparate exterior con la moto y su faro
  rect(ctx, 1450, 230, 420, 420, g(30));
  ctx.fillStyle = g(70); ctx.beginPath(); ctx.arc(1560, 560, 50, 0, Math.PI * 2); ctx.arc(1760, 560, 50, 0, Math.PI * 2); ctx.fill();
  rect(ctx, 1560, 470, 200, 60, g(80));
  ctx.fillStyle = `rgba(255,255,230,${0.6 + 0.2 * Math.sin(t * 3)})`; ctx.beginPath(); ctx.arc(1820, 480, 18, 0, Math.PI * 2); ctx.fill();
  // expositor y caja
  for (let c = 0; c < 6; c++) rect(ctx, 420 + c * 140, 260, 110, 300, g(100 + (c % 2) * 14));
  persona(ctx, 700, 830, 0.92, { brazoI: 2.75, brazoD: 2.75, cabeza: Math.sin(t * 2) * 3 }, 32);
  rect(ctx, 0, 680, 1400, 400, g(60)); rect(ctx, 0, 680, 1400, 20, g(118));
  // autor con casco integral apuntando
  persona(ctx, 1060, 1060, 1.12, { casco: true, brazoI: 1.62 + 0.03 * Math.sin(t * 5), objI: 'arma', brazoD: 0.3 }, 20);
}

function exterior(ctx, t) {
  // cámara nocturna IR: monocromo con poco contraste hasta que se enciende la farola
  const farola = E.outCubic(prog(t, 3.0, 3.25));
  const base = 34 + farola * 40;
  rect(ctx, 0, 0, W, H, g(base));
  rect(ctx, 0, 760, W, 320, g(base + 14));
  for (let k = 0; k < 12; k++) rect(ctx, 0, 120 + k * 54, W, 2, g(base - 6));
  // caja de sirena y puerta de emergencia
  rect(ctx, 520, 200, 120, 150, g(base + 60));
  rect(ctx, 1220, 380, 260, 380, g(base + 22)); rect(ctx, 1440, 560, 16, 40, g(base + 70));
  // escalera apoyada
  ctx.strokeStyle = g(base + 50); ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(470, 1000); ctx.lineTo(560, 330); ctx.moveTo(590, 1000); ctx.lineTo(660, 330); ctx.stroke();
  for (let k = 0; k < 9; k++) { const y = 960 - k * 74, a = (1000 - y) / 670; ctx.beginPath(); ctx.moveTo(470 + a * 90, y); ctx.lineTo(590 + a * 70, y); ctx.stroke(); }
  // farola
  if (farola > 0) { const gr = ctx.createRadialGradient(900, 60, 10, 900, 60, 900); gr.addColorStop(0, `rgba(255,255,255,${0.45 * farola})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H); }
  // personas: una en la escalera, otra con palanca en la puerta; huyen al encenderse la luz
  const h = E.inCubic(prog(t, 3.3, 5));
  persona(ctx, lerp(575, 2200, h), lerp(720, 1020, Math.min(1, h * 3)), 0.8, { brazoD: h ? 0.6 : 3.0 + 0.1 * Math.sin(t * 7), brazoI: h ? 0.6 : 2.8, paso: h ? andar(t, 11) : 0 }, 16);
  persona(ctx, lerp(1180, 2400, h), 1000, 1.0, { brazoD: h ? 0.8 : 1.5 + 0.25 * Math.sin(t * 8), objD: 'barra', paso: h ? andar(t, 11) : 0 }, 14);
}

function limpieza(ctx, t) {
  sala(ctx, 64, 98, 80);
  rect(ctx, 700, 560, 560, 200, g(74)); rect(ctx, 700, 560, 560, 18, g(124));
  // luces que se encienden al principio
  const luz = E.outCubic(prog(t, 0.4, 0.9));
  rect(ctx, 0, 0, W, H, `rgba(0,0,0,${0.35 * (1 - luz)})`);
  // limpiadora con carro, camina despacio hacia la derecha
  const x = lerp(420, 1180, E.inOutSine(prog(t, 0, 5)));
  rect(ctx, x + 70, 820, 130, 90, g(120)); rect(ctx, x + 60, 800, 150, 16, g(150));
  ctx.fillStyle = g(60); ctx.beginPath(); ctx.arc(x + 90, 920, 14, 0, 7); ctx.arc(x + 180, 920, 14, 0, 7); ctx.fill();
  persona(ctx, x, 930, 0.98, { paso: andar(t, 5), brazoD: 1.2, brazoI: 0.25 }, 150);
}
function despacho(ctx, t) {
  sala(ctx, 36, 46, 40);
  // mesa con cajones y estantería; linterna como única luz
  rect(ctx, 640, 600, 640, 160, g(58)); for (let k = 0; k < 3; k++) rect(ctx, 1120, 620 + k * 46, 140, 36, g(72));
  rect(ctx, 420, 240, 160, 520, g(52));
  const ang = -0.4 + 0.5 * Math.sin(t * 1.3);
  const lx = 1050, ly = 520;
  const grad = ctx.createRadialGradient(lx + Math.cos(ang) * 260, ly + 120, 10, lx + Math.cos(ang) * 260, ly + 120, 260);
  grad.addColorStop(0, 'rgba(255,255,230,.55)'); grad.addColorStop(1, 'rgba(255,255,230,0)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
  const cajon = Math.max(0, Math.sin(t * 1.6)) * 60;
  rect(ctx, 1120 + cajon, 666, 140, 36, g(96));
  persona(ctx, 1000, 920, 1.0, { brazoD: 1.5 + 0.3 * Math.sin(t * 1.6), brazoI: 0.3, mochila: -1 }, 14);
  // gorra
  ctx.fillStyle = g(30); ctx.fillRect(960, 520 - 4, 90, 18);
}
function hall(ctx, t) {
  sala(ctx, 70, 104, 86);
  rect(ctx, 1150, 520, 520, 240, g(82)); rect(ctx, 1150, 520, 520, 20, g(132));
  // hombre tendido en el suelo
  ctx.save(); ctx.translate(820, 880); ctx.rotate(-Math.PI / 2 + 0.05);
  persona(ctx, 0, 0, 0.9, { brazoI: 0.6, brazoD: 0.3 }, 40);
  ctx.restore();
  // empleada arrodillada a su lado, se inclina hacia él
  const inc = 0.15 * Math.sin(t * 1.4);
  ctx.save(); ctx.translate(1060, 900); ctx.rotate(-0.25 + inc);
  persona(ctx, 0, 0, 0.72, { brazoD: 1.9, brazoI: 1.6 }, 160);
  ctx.restore();
}
function perro(ctx, t) {
  rect(ctx, 0, 0, W, H, g(36)); rect(ctx, 0, 620, W, 460, g(48));
  // valla y coches aparcados
  ctx.strokeStyle = g(70); ctx.lineWidth = 4; for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 440); ctx.lineTo(x, 620); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(0, 470); ctx.lineTo(W, 470); ctx.stroke();
  for (let i = 0; i < 4; i++) { const x = 160 + i * 440; rect(ctx, x, 680, 320, 110, g(66 + i * 6)); rect(ctx, x + 50, 630, 210, 60, g(80)); ctx.fillStyle = g(26); ctx.beginPath(); ctx.arc(x + 70, 795, 34, 0, 7); ctx.arc(x + 250, 795, 34, 0, 7); ctx.fill(); }
  // perro que cruza al trote
  const x = lerp(-150, 2100, prog(t, 0, 5)), y = 900, k = Math.sin(t * 14);
  ctx.fillStyle = g(150);
  ctx.beginPath(); ctx.ellipse(x, y - 60, 90, 36, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 100, y - 92, 34, 26, -0.3, 0, 7); ctx.fill();
  ctx.lineWidth = 14; ctx.strokeStyle = g(150); ctx.lineCap = 'round';
  [[-60, k], [-40, -k], [50, -k], [70, k]].forEach(([dx, s2]) => { ctx.beginPath(); ctx.moveTo(x + dx, y - 40); ctx.lineTo(x + dx + s2 * 22, y); ctx.stroke(); });
  ctx.beginPath(); ctx.moveTo(x - 86, y - 70); ctx.lineTo(x - 130, y - 110 + k * 8); ctx.stroke();
}
function banco(ctx, t) {
  sala(ctx, 64, 96, 80);
  // mostrador de cajas al fondo
  rect(ctx, 520, 520, 900, 240, g(80)); rect(ctx, 520, 520, 900, 20, g(130));
  for (let k = 0; k < 3; k++) rect(ctx, 580 + k * 300, 400, 220, 120, g(150));
  // director escoltado por dos hombres con gorra que le sujetan del brazo
  const x = lerp(260, 820, E.inOutSine(prog(t, 0, 5)));
  persona(ctx, x, 980, 1.05, { paso: andar(t, 5), brazoI: 0.25, brazoD: 0.25 }, 40);
  persona(ctx, x - 150, 1000, 1.08, { paso: andar(t, 5) + 1, brazoD: 1.1 }, 20);
  persona(ctx, x + 150, 1010, 1.1, { paso: andar(t, 5) + 2, brazoI: 1.1 }, 18);
  ctx.fillStyle = g(14); ctx.fillRect(x - 195, 1000 - 476, 90, 16); ctx.fillRect(x + 105, 1010 - 484, 90, 16);
}
function polvorin(ctx, t) {
  // IR nocturna: tonos claros sobre fondo oscuro
  rect(ctx, 0, 0, W, H, g(20)); rect(ctx, 0, 700, W, 380, g(34));
  // polvorín (construcción de hormigón con puerta metálica)
  rect(ctx, 520, 300, 820, 420, g(70)); rect(ctx, 820, 430, 220, 290, g(110));
  for (let k = 0; k < 6; k++) rect(ctx, 820, 445 + k * 46, 220, 3, g(90));
  // todoterreno con las luces apagadas
  rect(ctx, 1480, 600, 360, 150, g(54)); rect(ctx, 1540, 530, 240, 80, g(62));
  ctx.fillStyle = g(24); ctx.beginPath(); ctx.arc(1550, 760, 40, 0, 7); ctx.arc(1770, 760, 40, 0, 7); ctx.fill();
  persona(ctx, 1450, 880, 0.9, { brazoI: 0.2, cabeza: Math.sin(t * 0.9) * 8 }, 150);
  // persona con linterna frontal manipulando la cerradura
  persona(ctx, 920, 900, 1.0, { brazoD: 1.55 + 0.12 * Math.sin(t * 9), brazoI: 1.45, objD: 'barra' }, 170);
  const gr = ctx.createRadialGradient(950, 470, 5, 950, 470, 220);
  gr.addColorStop(0, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
}
function sinSenal(ctx, t) {
  rect(ctx, 0, 0, W, H, g(18));
  // nieve de interferencia gruesa
  const r = M.mulberry32((Math.floor(t * 30) * 9301 + 49297) | 0);
  for (let k = 0; k < 1400; k++) { const v = Math.floor(r() * 140); ctx.fillStyle = g(v); ctx.fillRect(r() * W, r() * H, 6, 3); }
  rect(ctx, W / 2 - 520, H / 2 - 110, 1040, 220, 'rgba(0,0,40,.85)');
  text(ctx, 'SIN SEÑAL DE VÍDEO', W / 2, H / 2 - 10, font(90, 700, UI), 'rgb(240,240,240)', 'center');
  text(ctx, 'Conexión con la instalación perdida', W / 2, H / 2 + 60, font(42, 500, UI), 'rgb(190,190,190)', 'center');
}
function patio(ctx, t) {
  rect(ctx, 0, 0, W, H, g(38)); rect(ctx, 0, 720, W, 360, g(50));
  // fachada con ventanas
  rect(ctx, 0, 180, W, 540, g(62));
  for (let k = 0; k < 6; k++) rect(ctx, 120 + k * 300, 280, 180, 220, g(86));
  // pintadas que crecen
  const p2 = prog(t, 0.5, 4.5);
  ctx.strokeStyle = 'rgba(230,230,230,.85)'; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.beginPath();
  for (let i = 0; i <= 40 * p2; i++) { const x = 1300 + i * 12, y = 600 + Math.sin(i * 0.7) * 50; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
  persona(ctx, 1420 + 120 * p2, 960, 0.95, { capucha: true, brazoD: 2.0 + 0.2 * Math.sin(t * 6), brazoI: 0.4 }, 20);
  // el segundo golpea un cristal
  const golpe = Math.sin(t * 4);
  persona(ctx, 520, 960, 1.0, { capucha: true, brazoD: 2.4 - 0.9 * (golpe * 0.5 + 0.5), objD: 'barra', brazoI: 0.5 }, 22);
  if (golpe < -0.9) rect(ctx, 420, 280, 180, 220, 'rgba(255,255,255,.45)');
}
function cajas(ctx, t) {
  sala(ctx, 66, 100, 84);
  for (let c = 0; c < 7; c++) rect(ctx, 420 + c * 150, 250, 120, 260, g(110 + (c % 2) * 14));
  // cajera tras la caja entrega billetes
  persona(ctx, 820, 840, 0.92, { brazoD: 1.5, brazoI: 0.4 }, 150);
  rect(ctx, 400, 690, 900, 380, g(72)); rect(ctx, 400, 690, 900, 20, g(130));
  const sale = E.inCubic(prog(t, 2.6, 5));
  const x = lerp(1060, 2200, sale);
  if (t < 2.6) for (let k = 0; k < 3; k++) rect(ctx, 930 + k * 12 + Math.sin(t * 3) * 6, 650 - k * 6, 60, 26, g(200));
  // hombre con gorra, mano en el bolsillo como si ocultara algo
  persona(ctx, x, 1060, 1.12, { paso: sale ? andar(t, 9) : 0, brazoD: 0.08, brazoI: sale ? 0.4 : 1.25 }, 24);
  ctx.fillStyle = g(90); ctx.fillRect(x - 46, 1060 - 520, 100, 20);
}

// ---------------------------------------------------------------- OSD de la cámara
function osd(ctx, clip, tl) {
  const [hh, mm, ss] = clip.hora;
  const tot = hh * 3600 + mm * 60 + ss + Math.floor(tl);
  const p2 = (n) => String(n).padStart(2, '0');
  const reloj = `${p2(Math.floor(tot / 3600) % 24)}:${p2(Math.floor(tot / 60) % 60)}:${p2(tot % 60)}`;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = 6;
  text(ctx, clip.cam, 60, 86, font(46, 700, UI), 'rgba(255,255,255,.92)');
  text(ctx, `16-10-2026  ${reloj}`, W - 60, 86, font(46, 700, UI), 'rgba(255,255,255,.92)', 'right');
  if (Math.floor(tl * 2) % 2 === 0) { ctx.fillStyle = 'rgb(230,40,40)'; ctx.beginPath(); ctx.arc(76, H - 72, 14, 0, Math.PI * 2); ctx.fill(); }
  text(ctx, 'REC', 102, H - 56, font(40, 700, UI), 'rgba(255,255,255,.92)');
  text(ctx, 'Grabación simulada · uso docente', W - 60, H - 56, font(30, 500, UI), 'rgba(255,255,255,.6)', 'right');
  ctx.restore();
}

// grano: pequeño lienzo de ruido sembrado por fotograma, escalado a toda la imagen
let grano = null, gctx = null;
function post(ctx, u, t) {
  const i = Math.min(CLIPS.length - 1, Math.floor(t / 5));
  const tl = t - i * 5;
  if (!grano) { grano = document.createElement('canvas'); grano.width = 480; grano.height = 270; gctx = grano.getContext('2d'); }
  const img = gctx.createImageData(480, 270);
  const r = M.mulberry32((Math.floor(t * 30) * 2654435761) | 0);
  for (let k = 0; k < img.data.length; k += 4) { const v = r() * 255; img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 34; }
  gctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(grano, 0, 0, W, H);
  // líneas de exploración y viñeta
  ctx.fillStyle = 'rgba(0,0,0,.10)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  osd(ctx, CLIPS[i], tl);
}

M.film({
  fonts: [font(40, 500, UI), font(40, 700, UI)],
  samples: 4,
  post,
  draw(ctx, u, t) {
    const i = Math.min(CLIPS.length - 1, Math.floor(t / 5));
    const tl = t - i * 5;
    const clip = CLIPS[i];
    ctx.save();
    // ligera inestabilidad de la imagen de vigilancia
    ctx.translate(Math.sin(t * 0.7) * 2, 0);
    clip.dibujar(ctx, tl);
    ctx.restore();
    if (!clip.color) {
      // desaturar ligeramente tintado (gris verdoso) salvo cámara en color
      ctx.fillStyle = 'rgba(40,70,60,.10)'; ctx.fillRect(0, 0, W, H);
    }
  },
});
