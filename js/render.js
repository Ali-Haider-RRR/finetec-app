// Draws the Fine Tec invoice onto a canvas (A4 = 794 x 1123 design units).
// The same drawing code is used for preview, PNG and PDF, so they always match.
import { amountInWords } from './words.js';

export const PW = 794, PH = 1123;
const NAVY = '#1b3262', RED = '#c01230', LINE = '#9aa3b8', GREY = '#5b6784';
const FONT = '"FineTecSans", "Liberation Sans", Arial, Helvetica, sans-serif';

export const DESIGNS = [
  { id: 'classic', name: 'Classic', note: 'Plain white', bg: null, products: null, top: 172, limit: 1015 },
  { id: 'light', name: 'Light Products', note: 'Faint product rows', bg: null, products: 'soft', top: 270, limit: 890 },
  { id: 'pool-light', name: 'Pool Light', note: 'Very light pool photo', bg: 'assets/bg-pool-light.jpg', panel: 0.3, products: 'soft', top: 270, limit: 890 },
  { id: 'pool-mid', name: 'Pool', note: 'Pool photo + products', bg: 'assets/bg-pool-mid.jpg', panel: 0.66, products: 'soft', top: 270, limit: 890 },
  { id: 'bold', name: 'Bold Products', note: 'Clear product rows', bg: null, products: 'bold', top: 300, limit: 886 },
];

const PRODUCTS = [
  { file: 'sand-filter', label: 'Sand Filters', row: 0, col: 0 },
  { file: 'pool-pump', label: 'Pool Pumps', row: 0, col: 1 },
  { file: 'skimmer', label: 'Skimmers', row: 0, col: 2 },
  { file: 'heater', label: 'Heating & Cooling', row: 0, col: 3 },
  { file: 'ladder', label: 'Pool Ladders', row: 1, col: 0 },
  { file: 'maintenance-kit', label: 'Maintenance Kit', row: 1, col: 1 },
  { file: 'drain-led', label: 'Drain & LED Lights', row: 1, col: 2 },
  { file: 'valve', label: 'Valves & Fittings', row: 1, col: 3 },
];

// ---------- asset loading ----------
const imgCache = new Map();
export function loadImage(src) {
  if (!imgCache.has(src)) {
    imgCache.set(src, new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('Could not load ' + src));
      im.src = src;
    }));
  }
  return imgCache.get(src);
}
let fontsReady;
export function loadFonts() {
  if (!fontsReady) {
    fontsReady = (async () => {
      const faces = [
        new FontFace('FineTecSans', 'url(assets/fonts/LiberationSans-Regular.ttf)', { weight: '400' }),
        new FontFace('FineTecSans', 'url(assets/fonts/LiberationSans-Bold.ttf)', { weight: '700' }),
      ];
      for (const f of faces) { await f.load(); document.fonts.add(f); }
    })().catch(() => {});
  }
  return fontsReady;
}

// ---------- money helpers ----------
export const num = v => { const n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) ? n : 0; };
export function money(v) {
  const n = Math.round((Number(v) || 0) * 100) / 100;
  return 'Rs ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function plain(v) {
  const n = Math.round((Number(v) || 0) * 100) / 100;
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function totals(inv) {
  const sub = (inv.items || []).reduce((s, it) => s + num(it.qty || 1) * num(it.rate), 0);
  const discount = Math.min(num(inv.discount), sub);
  const total = Math.round((sub - discount) * 100) / 100;
  const received = Math.min(num(inv.received), total);
  return { sub, discount, total, received, balance: Math.round((total - received) * 100) / 100 };
}

// ---------- drawing helpers ----------
function setFont(ctx, size, bold) { ctx.font = `${bold ? 700 : 400} ${size}px ${FONT}`; }
function text(ctx, str, x, top, { size = 14, bold = false, color = NAVY, align = 'left' } = {}) {
  setFont(ctx, size, bold);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(str, x, top + size * 0.82);
}
function hline(ctx, x1, x2, y, color = LINE, w = 1.2) {
  ctx.strokeStyle = color; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
}
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}
function wrap(ctx, str, maxW, size, bold) {
  setFont(ctx, size, bold);
  const out = [];
  for (const para of String(str || '').split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    if (!words.length) { out.push(''); continue; }
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width <= maxW || !line) line = t; else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}
function fitText(ctx, str, maxW, size, bold) {
  setFont(ctx, size, bold);
  let s = String(str || '');
  if (ctx.measureText(s).width <= maxW) return s;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}
function drawContain(ctx, img, x, y, w, h) {
  const r = Math.min(w / img.width, h / img.height);
  const dw = img.width * r, dh = img.height * r;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

// ---------- page furniture ----------
function drawHeader(ctx, biz, logo) {
  // top bar
  ctx.fillStyle = NAVY; ctx.fillRect(0, 0, PW, 10);
  ctx.fillStyle = RED; ctx.fillRect(PW - 170, 0, 170, 10);
  // business block (left)
  text(ctx, (biz.name || 'FINE TEC').toUpperCase(), 40, 42, { size: 24, bold: true });
  const lines = [];
  String(biz.address || '').split(/\r?\n/).forEach(l => l.trim() && lines.push(l.trim()));
  if (biz.phone) lines.push('Phone no.: ' + biz.phone);
  if (biz.email) lines.push('Email: ' + biz.email);
  let y = 74;
  for (const l of lines.slice(0, 5)) { text(ctx, l, 40, y, { size: 13 }); y += 19.5; }
  // logo (right)
  if (logo) drawContain(ctx, logo, PW - 40 - 230, 42, 230, 68);
  // header rule
  ctx.fillStyle = NAVY; ctx.fillRect(40, 148, PW - 80, 4);
  ctx.fillStyle = RED; ctx.fillRect(PW - 40 - 120, 148, 120, 4);
}
function drawFooter(ctx, biz, mark) {
  ctx.fillStyle = NAVY; ctx.fillRect(40, 1031, PW - 80, 4);
  ctx.fillStyle = RED; ctx.fillRect(PW - 40 - 120, 1031, 120, 4);
  if (mark) drawContain(ctx, mark, 40, 1047, 56, 52);
  text(ctx, 'Address:', 112, 1051, { size: 14, bold: true });
  const addr = String(biz.address || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    .reduce((a, l) => (a ? a + (a.endsWith(',') ? ' ' : ', ') + l : l), '');
  text(ctx, fitText(ctx, addr, PW - 112 - 40, 14, false), 112, 1072, { size: 14 });
  ctx.fillStyle = RED; ctx.fillRect(0, PH - 10, 170, 10);
  ctx.fillStyle = NAVY; ctx.fillRect(170, PH - 10, PW - 170, 10);
}
async function drawProducts(ctx, mode) {
  for (const p of PRODUCTS) {
    const x = 40 + p.col * 182, y = p.row === 0 ? 162 : 896;
    const im = await loadImage(`assets/products/${p.file}.png`);
    ctx.save();
    ctx.globalAlpha = mode === 'bold' ? 1 : 0.2;
    drawContain(ctx, im, x, y, 168, 102);
    ctx.restore();
    // name tag (only on the 'bold' design; the faint designs keep the page clean behind the text)
    ctx.save();
    if (mode !== 'bold') {
      /* no tag */
    } else if (mode === 'bold') {
      ctx.fillStyle = NAVY; rrect(ctx, x + 14, y + 106, 140, 18, 9); ctx.fill();
      text(ctx, p.label, x + 84, y + 106 + 3, { size: 11, bold: true, color: '#fff', align: 'center' });
    } else {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = 'rgba(27,50,98,0.10)'; rrect(ctx, x + 14, y + 106, 140, 18, 9); ctx.fill();
      text(ctx, p.label, x + 84, y + 106 + 3, { size: 11, bold: true, align: 'center' });
    }
    ctx.restore();
  }
}

// ---------- invoice body ----------
// Draws the invoice content with its top-left at (0,0) and width W. Returns height used.
function drawBody(ctx, inv, biz, sigImg, W) {
  const t = totals(inv);
  const items = inv.items || [];
  const colL = 330;                 // left column width
  const colR = Math.min(354, W - colL - 24); // right column width
  const rx = W - colR;              // right column x
  text(ctx, 'Invoice', W / 2, 0, { size: 30, bold: true, color: RED, align: 'center' });

  // Bill To / Invoice Details
  text(ctx, 'Bill To', 0, 64, { size: 15, bold: true });
  text(ctx, 'Invoice Details', W, 64, { size: 15, bold: true, align: 'right' });
  const lx = 52, lw = 260;
  text(ctx, 'Name:', 0, 94, { size: 14 });
  text(ctx, fitText(ctx, inv.customerName, lw - 6, 14, true), lx + 4, 94, { size: 14, bold: true });
  hline(ctx, lx, lx + lw, 110);
  text(ctx, 'Address:', 0, 128, { size: 14 });
  const addrLines = wrap(ctx, inv.customerAddress, lw - 6, 14, false).slice(0, 3);
  let ay = 128;
  const nAddr = Math.max(2, addrLines.length);
  for (let i = 0; i < nAddr; i++) {
    if (addrLines[i]) text(ctx, addrLines[i], 64, ay, { size: 14 });
    hline(ctx, i === 0 ? 64 : 0, lx + lw, ay + 16);
    ay += 26;
  }
  text(ctx, 'Phone:', 0, ay + 8, { size: 14 });
  text(ctx, fitText(ctx, inv.customerPhone, lw - 6, 14, false), lx + 4, ay + 8, { size: 14 });
  hline(ctx, lx, lx + lw, ay + 24);
  const billBottom = ay + 24;

  const dx = W - 260, dlx = W - 174;
  text(ctx, 'Invoice No.:', dx, 94, { size: 14 });
  text(ctx, fitText(ctx, inv.number, 166, 14, false), dlx + 4, 94, { size: 14 });
  hline(ctx, dlx, W, 110);
  text(ctx, 'Date:', dx, 128, { size: 14 });
  text(ctx, inv.date || '', dlx + 4, 128, { size: 14 });
  hline(ctx, dlx, W, 144);

  // Description (left) + totals (right)
  const y1 = Math.max(268, billBottom + 44);
  text(ctx, 'Description', 0, y1, { size: 15, bold: true });
  let y = y1 + 16; // top of the first row; each row's bottom line is y after adding its height
  const amtW = 86, qtyW = 92;
  const nameW = colL - amtW - qtyW - 8;
  let rows = 0;
  for (const it of items) {
    const qty = num(it.qty || 1), rate = num(it.rate), amount = qty * rate;
    const lines = wrap(ctx, it.name, nameW, 14, false).slice(0, 3);
    const h = Math.max(30, lines.length * 17 + 13);
    y += h;
    lines.forEach((ln, i) => text(ctx, ln, 0, y - h + 8 + i * 17, { size: 14 }));
    const detail = `${qty} x ${plain(rate).replace(/\.00$/, '')}`;
    text(ctx, detail, colL - amtW - 4, y - 21, { size: 11, color: GREY, align: 'right' });
    text(ctx, plain(amount), colL, y - 23, { size: 14, align: 'right' });
    hline(ctx, 0, colL, y);
    rows++;
  }
  for (; rows < 6; rows++) { y += 30; hline(ctx, 0, colL, y); }
  const yl = y; // last ruled line

  // Totals box
  let ty = y1;
  const row = (label, value, style) => {
    if (style === 'head') {
      ctx.fillStyle = NAVY; ctx.fillRect(rx, ty, colR, 34);
      text(ctx, label, rx + 10, ty + 9, { size: 14, bold: true, color: '#fff' });
      text(ctx, value, rx + colR - 10, ty + 9, { size: 14, bold: true, color: '#fff', align: 'right' });
    } else {
      text(ctx, label, rx + 10, ty + 9, { size: 14 });
      text(ctx, value, rx + colR - 10, ty + 9, { size: 14, align: 'right' });
      hline(ctx, rx, rx + colR, ty + 34, LINE, 1);
    }
    ty += style === 'head' ? 34 : 38;
    if (style === 'head') ty += 4;
  };
  if (t.discount > 0) { row('Subtotal', money(t.sub)); row('Discount', '- ' + money(t.discount)); }
  row('Total', money(t.total), 'head');
  row('Received', money(t.received));
  row('Balance', money(t.balance));

  // Signature block
  const sy = Math.max(ty + 38, y1 + 150);
  text(ctx, 'For: ' + String(biz.name || 'FINE TEC').toUpperCase(), rx + colR / 2, sy, { size: 14, align: 'center' });
  const sigTop = sy + 22, sigH = 78;
  if (sigImg) drawContain(ctx, sigImg, rx + colR / 2 - 100, sigTop, 200, sigH);
  const lineY = sigTop + sigH + 6;
  hline(ctx, rx + colR / 2 - 97, rx + colR / 2 + 97, lineY);
  text(ctx, 'Authorized Signatory', rx + colR / 2, lineY + 8, { size: 14, bold: true, align: 'center' });
  const rightBottom = lineY + 30;

  // Words + terms (left column)
  let wy = yl + 24;
  text(ctx, 'Invoice Amount In Words', 0, wy, { size: 15, bold: true });
  wy += 52;
  const words = wrap(ctx, amountInWords(t.total), colL, 14, false).slice(0, 3);
  const nW = Math.max(2, words.length);
  for (let i = 0; i < nW; i++) {
    if (words[i]) text(ctx, words[i], 0, wy - 21, { size: 14 });
    hline(ctx, 0, colL, wy);
    wy += 30;
  }
  wy -= 30;
  wy += 6;
  text(ctx, 'Terms And Conditions', 0, wy, { size: 15, bold: true });
  wy += 28;
  const terms = wrap(ctx, inv.terms, colL + 60, 14, false).slice(0, 5);
  terms.forEach((ln, i) => text(ctx, ln, 0, wy + i * 19, { size: 14 }));
  const leftBottom = wy + Math.max(1, terms.length) * 19;
  return Math.max(leftBottom, rightBottom);
}

// ---------- public API ----------
const sigCache = new Map();
async function sigImage(src) {
  if (!src) return null;
  if (!sigCache.has(src)) sigCache.set(src, loadImage(src));
  try { return await sigCache.get(src); } catch { return null; }
}

export async function renderInvoice(canvas, inv, biz, designId, scale = 2) {
  await loadFonts();
  const design = DESIGNS.find(d => d.id === designId) || DESIGNS[0];
  const [logo, mark, bg, sig] = await Promise.all([
    loadImage('assets/logo.png'), loadImage('assets/ft.png'),
    design.bg ? loadImage(design.bg) : null,
    inv.showSignature === false ? null : sigImage(inv.signature),
  ]);
  canvas.width = Math.round(PW * scale);
  canvas.height = Math.round(PH * scale);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PW, PH);
  if (bg) ctx.drawImage(bg, 0, 0, PW, PH);
  if (design.panel) {
    // soft white panel behind the writing area so text stays easy to read over the photo
    ctx.save(); ctx.globalAlpha = design.panel; ctx.fillStyle = '#fff';
    rrect(ctx, 26, 160, PW - 52, 864, 10); ctx.fill(); ctx.restore();
  }
  if (design.products) await drawProducts(ctx, design.products);
  drawHeader(ctx, biz, logo);
  drawFooter(ctx, biz, mark);

  // measure body height, then fit it between design.top and design.limit
  const probe = document.createElement('canvas').getContext('2d');
  const avail = design.limit - design.top;
  let s = 1, w = PW - 80;
  let h = drawBody(probe, inv, biz, sig, w);
  if (h > avail) {
    s = avail / h;
    w = (PW - 80) / s;
    h = drawBody(probe, inv, biz, sig, w);
    s = Math.min(s, avail / h);
  }
  ctx.save();
  ctx.translate(40, design.top);
  ctx.scale(s, s);
  drawBody(ctx, inv, biz, sig, (PW - 80) / s);
  ctx.restore();
  return canvas;
}

export const canvasToBlob = (canvas, type = 'image/png', q = 0.92) =>
  new Promise(res => canvas.toBlob(res, type, q));
