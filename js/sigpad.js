// Full-screen signature pad (finger or mouse). Returns a transparent PNG data URL, or null if cancelled.
export function openSignaturePad() {
  return new Promise(resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet';
    wrap.innerHTML = `
      <div class="sheet-card">
        <h2>Sign here</h2>
        <p class="muted">Draw your signature with your finger or mouse.</p>
        <canvas class="pad"></canvas>
        <div class="row gap">
          <button class="btn ghost" data-a="clear">Clear</button>
          <span class="grow"></span>
          <button class="btn ghost" data-a="cancel">Cancel</button>
          <button class="btn primary" data-a="done">Use signature</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const cv = wrap.querySelector('canvas');
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const rect = cv.getBoundingClientRect();
    cv.width = Math.round(rect.width * dpr);
    cv.height = Math.round(rect.height * dpr);
    const ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111a3a'; ctx.lineWidth = 2.6;
    let drawing = false, last = null, inked = false;
    const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointerdown', e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); drawing = true; last = pos(e); ctx.beginPath(); ctx.arc(last.x, last.y, 1.3, 0, 7); ctx.fillStyle = '#111a3a'; ctx.fill(); inked = true; });
    cv.addEventListener('pointermove', e => {
      if (!drawing) return; e.preventDefault();
      const p = pos(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y);
      ctx.quadraticCurveTo(last.x, last.y, (last.x + p.x) / 2, (last.y + p.y) / 2);
      ctx.lineTo(p.x, p.y); ctx.stroke(); last = p;
    });
    const end = () => { drawing = false; };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    const close = val => { wrap.remove(); resolve(val); };
    wrap.addEventListener('click', e => {
      const a = e.target.dataset && e.target.dataset.a;
      if (a === 'clear') { ctx.clearRect(0, 0, rect.width, rect.height); inked = false; }
      if (a === 'cancel') close(null);
      if (a === 'done') close(inked ? cropToInk(cv) : null);
    });
  });
}

function cropToInk(cv) {
  const ctx = cv.getContext('2d');
  const { width: w, height: h } = cv;
  const data = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 <= x0) return null;
  const pad = 10;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(cv, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

// Turns a photo of a signature on paper into a transparent PNG (white paper becomes see-through).
export function signatureFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 700;
      const r = Math.min(1, maxW / img.width);
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * r); cv.height = Math.round(img.height * r);
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      const id = ctx.getImageData(0, 0, cv.width, cv.height);
      const d = id.data;
      for (let i = 0; i < d.length; i += 4) {
        const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        if (d[i + 3] > 0 && lum > 190) d[i + 3] = Math.max(0, Math.round((235 - lum) * 6));
        else if (d[i + 3] > 0) { d[i] = 17; d[i + 1] = 26; d[i + 2] = 58; }
      }
      ctx.putImageData(id, 0, 0);
      resolve(cropToInk(cv) || cv.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Could not read that image'));
    img.src = URL.createObjectURL(file);
  });
}
