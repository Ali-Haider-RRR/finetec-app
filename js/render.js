// Draws the Fine Tec invoice onto a canvas (A4 = 794 x 1123 design units).
// The same drawing code is used for preview, PNG and PDF, so they always match.
import { amountInWords } from './words.js';

export const PW = 794, PH = 1123;
const NAVY = '#1b3262', RED = '#c01230', LINE = '#9aa3b8', GREY = '#5b6784';
const FONT = '"FineTecSans", "Liberation Sans", Arial, Helvetica, sans-serif';

export const DESIGNS = [
  { id: 'table', name: 'Simple Invoice', note: 'Boxed table, orange', bg: null, products: null, custom: true },
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
  text(ctx, 'For: ' + String((inv.forName != null ? inv.forName : biz.name) || 'FINE TEC').toUpperCase(), rx + colR / 2, sy, { size: 14, align: 'center' });
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


// ---------- "Table Style" design (boxed grid table, orange accents) ----------
const ORANGE = '#f2a02a', INK = '#1d1d1f', GRID = '#2b2b2e';
function drawTableInvoice(ctx, inv, biz, logo, mark, sigImg) {
  const t = totals(inv);
  const X = 44, W = PW - 88;
  // soft warm paper tint
  const g = ctx.createLinearGradient(0, 0, 0, PH);
  g.addColorStop(0, '#fffdf8'); g.addColorStop(1, '#fff6e6');
  ctx.fillStyle = g; ctx.fillRect(0, 0, PW, PH);
  // header: logo left, INVOICE right
  drawContain(ctx, logo, X, 34, 230, 68);
  text(ctx, 'INVOICE', PW - X, 40, { size: 52, bold: true, color: INK, align: 'right' });
  hline(ctx, X, PW - X, 122, ORANGE, 3);

  // Bill To / meta / From
  const colW = 230;
  let y = 142;
  text(ctx, 'From:', X, y, { size: 20, bold: true, color: INK });
  text(ctx, 'Bill To:', PW - X, y, { size: 20, bold: true, color: INK, align: 'right' });
  y += 34;
  const cust = [inv.customerName, inv.customerPhone, ...wrap(ctx, inv.customerAddress, colW, 14, false)].filter(Boolean);
  cust.slice(0, 5).forEach((ln, i) => text(ctx, ln, PW - X, y + i * 20, { size: 14, bold: i === 0, color: INK, align: 'right' }));
  const from = [biz.name, biz.phone, biz.email, ...wrap(ctx, biz.address, colW, 13, false)].filter(Boolean);
  from.slice(0, 6).forEach((ln, i) => text(ctx, ln, X, y + i * 19, { size: i === 0 ? 14 : 13, bold: i === 0, color: INK }));
  text(ctx, 'Date : ' + (inv.date || ''), PW / 2, y + 2, { size: 14, color: INK, align: 'center' });
  text(ctx, 'Invoice No : ' + (inv.number || ''), PW / 2, y + 26, { size: 14, color: INK, align: 'center' });

  // Table
  const tt = 322;
  const cols = [46, 318, 64, 118, W - 46 - 318 - 64 - 118];
  const heads = ['Item', 'Description', 'Qty', 'Unit Price', 'Amount'];
  const xs = [X]; cols.forEach(c => xs.push(xs[xs.length - 1] + c));
  const headH = 28, footH = 30, subH = 24;
  const bottom = 790;
  const rowsArea = bottom - tt - headH - footH - subH * 2;
  const items = (inv.items || []).filter(i => String(i.name || '').trim() || num(i.rate) > 0);
  const nRows = Math.max(10, items.length);
  const rh = Math.min(rowsArea / nRows, 40);
  const fs = rh >= 30 ? 14 : Math.max(9, Math.floor(rh * 0.45));
  const tableH = headH + rh * nRows + footH + subH * 2;
  // header
  ctx.fillStyle = ORANGE; ctx.fillRect(X, tt, W, headH);
  heads.forEach((hd, i) => text(ctx, hd, xs[i] + cols[i] / 2, tt + 7, { size: 14, bold: true, color: INK, align: 'center' }));
  // body background
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(X, tt + headH, W, rh * nRows);
  for (let r = 0; r < nRows; r++) {
    const ry = tt + headH + r * rh, it = items[r];
    if (!it) continue;
    const ty = ry + (rh - fs) / 2 - 1;
    text(ctx, String(r + 1), xs[0] + cols[0] / 2, ty, { size: fs, color: INK, align: 'center' });
    text(ctx, fitText(ctx, it.name, cols[1] - 16, fs, false), xs[1] + 8, ty, { size: fs, color: INK });
    text(ctx, String(num(it.qty || 1)), xs[2] + cols[2] / 2, ty, { size: fs, color: INK, align: 'center' });
    text(ctx, plain(num(it.rate)), xs[3] + cols[3] - 8, ty, { size: fs, color: INK, align: 'right' });
    text(ctx, plain(num(it.qty || 1) * num(it.rate)), xs[4] + cols[4] - 8, ty, { size: fs, color: INK, align: 'right' });
  }
  // totals rows
  const fy = tt + headH + rh * nRows;
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(X, fy, W, footH + subH * 2);
  ctx.fillStyle = ORANGE; ctx.fillRect(xs[4], fy, cols[4], footH);
  text(ctx, t.discount > 0 ? 'Total (after discount ' + plain(t.discount) + ')' : 'Total', X + 10, fy + 7, { size: 15, bold: true, color: INK });
  text(ctx, plain(t.total), xs[4] + cols[4] - 8, fy + 7, { size: 15, bold: true, color: INK, align: 'right' });
  text(ctx, 'Received', xs[3] + cols[3] - 8, fy + footH + 5, { size: 13, color: INK, align: 'right' });
  text(ctx, plain(t.received), xs[4] + cols[4] - 8, fy + footH + 5, { size: 13, color: INK, align: 'right' });
  text(ctx, 'Balance', xs[3] + cols[3] - 8, fy + footH + subH + 5, { size: 13, bold: true, color: INK, align: 'right' });
  text(ctx, plain(t.balance), xs[4] + cols[4] - 8, fy + footH + subH + 5, { size: 13, bold: true, color: INK, align: 'right' });
  // grid lines
  ctx.strokeStyle = GRID; ctx.lineWidth = 1.1;
  ctx.strokeRect(X, tt, W, tableH);
  for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(xs[i], tt); ctx.lineTo(xs[i], i === 4 || i === 3 ? tt + tableH : fy); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(xs[3] + 1, fy + 1, cols[3] - 1, footH - 2); ctx.strokeStyle = GRID;
  ctx.beginPath(); ctx.moveTo(X, fy); ctx.lineTo(PW - X, fy); ctx.stroke();
  for (let r = 0; r <= nRows; r++) { const ly = tt + headH + r * rh; ctx.beginPath(); ctx.moveTo(X, ly); ctx.lineTo(PW - X, ly); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(xs[3], fy + footH); ctx.lineTo(PW - X, fy + footH); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(xs[3], fy + footH + subH); ctx.lineTo(PW - X, fy + footH + subH); ctx.stroke();

  // amount in words
  const wy = tt + tableH + 12;
  const words = wrap(ctx, 'Amount in words: ' + amountInWords(t.total), W, 13, false).slice(0, 2);
  words.forEach((ln, i) => text(ctx, ln, X, wy + i * 18, { size: 13, color: INK }));

  // bottom section
  const by = 850;
  text(ctx, 'THANK YOU!', X, by, { size: 24, bold: true, color: INK });
  const info = [wrap(ctx, String(biz.address || '').replace(/\n/g, ' '), 270, 13, false)[0], biz.phone, biz.email];
  const addrLines = wrap(ctx, String(biz.address || '').replace(/\n/g, ' '), 270, 13, false).slice(0, 2);
  const contact = [...addrLines, biz.phone, biz.email].filter(Boolean);
  let cy = by + 42;
  contact.forEach(ln => {
    ctx.fillStyle = ORANGE; ctx.beginPath(); ctx.arc(X + 6, cy + 8, 5, 0, Math.PI * 2); ctx.fill();
    text(ctx, ln, X + 22, cy, { size: 13, color: INK });
    cy += 26;
  });
  const nx = 400;
  text(ctx, 'Note:', nx, by, { size: 22, bold: true, color: INK });
  const notes = wrap(ctx, inv.terms, PW - X - nx, 13, false).slice(0, 2);
  [0, 1].forEach(i => { hline(ctx, nx, PW - X, by + 56 + i * 26, INK, 1.2); if (notes[i]) text(ctx, notes[i], nx, by + 56 + i * 26 - 19, { size: 13, color: INK }); });
  // signature
  const sx = nx + (PW - X - nx) / 2;
  text(ctx, 'For: ' + String((inv.forName != null ? inv.forName : biz.name) || 'FINE TEC').toUpperCase(), sx, by + 100, { size: 13, align: 'center', color: INK });
  if (sigImg) drawContain(ctx, sigImg, sx - 95, by + 120, 190, 62);
  hline(ctx, sx - 95, sx + 95, by + 184, INK, 1.1);
  text(ctx, 'Authorized Signatory', sx, by + 190, { size: 13, color: INK, align: 'center' });

  // bottom bar
  ctx.fillStyle = ORANGE; ctx.fillRect(0, PH - 26, PW, 16);
  ctx.fillStyle = INK; ctx.fillRect(0, PH - 10, PW, 10);
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
  if (design.custom) { drawTableInvoice(ctx, inv, biz, logo, mark, sig); return canvas; }
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
