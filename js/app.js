import { db, uid, getSettings, saveSettings } from './db.js';
import { renderInvoice, DESIGNS, totals, money, num, canvasToBlob, loadFonts } from './render.js';
import { jpegToPdf } from './pdf.js';
import { openSignaturePad, signatureFromFile } from './sigpad.js';

const DEFAULTS = {
  name: 'Fine Tec',
  address: 'Office 4-5 Nasrullah Plaza, Korey Stop,\nWalton Road, Cantt. Lahore.',
  phone: '+92 3269915915',
  email: 'finetecoffical@gmail.com',
  terms: 'Thank you for doing business with us.',
  design: 'classic',
  nextNumber: 1,
  signature: '',
};

const app = document.getElementById('app');
let settings = { ...DEFAULTS };
let invoices = [];
let customers = [];
let view = { q: '', filter: 'all' };

// ---------- small helpers ----------
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) el.append(k instanceof Node ? k : document.createTextNode(k ?? ''));
  return el;
}
let toastTimer;
function toast(msg, ms = 2600) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}
const pad2 = n => String(n).padStart(2, '0');
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const isoToDmy = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : (iso || ''); };
const dmyToIso = s => { const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s || ''); return m ? `${m[3]}-${m[2]}-${m[1]}` : todayIso(); };
const safeName = s => String(s || '').replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
const bizOf = inv => (inv && inv.biz) || { name: settings.name, address: settings.address, phone: settings.phone, email: settings.email };

async function loadAll() {
  settings = await getSettings(DEFAULTS);
  invoices = (await db.all('invoices')).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  customers = (await db.all('customers')).sort((a, b) => a.name.localeCompare(b.name));
}
function nextNumber() {
  const nums = invoices.map(i => parseInt(i.number, 10)).filter(Number.isFinite);
  return String(Math.max(num(settings.nextNumber) || 1, (nums.length ? Math.max(...nums) + 1 : 1)));
}
function download(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------- exporting ----------
async function renderToCanvas(inv, scale) {
  const c = document.createElement('canvas');
  await renderInvoice(c, inv, bizOf(inv), inv.design, scale);
  return c;
}
async function makeImage(inv) {
  const c = await renderToCanvas(inv, 3);
  return { blob: await canvasToBlob(c, 'image/png'), name: `FineTec-Invoice-${safeName(inv.number)}-${safeName(inv.customerName) || 'customer'}.png` };
}
async function makePdf(inv) {
  const c = await renderToCanvas(inv, 3);
  const jpg = await canvasToBlob(c, 'image/jpeg', 0.93);
  const bytes = new Uint8Array(await jpg.arrayBuffer());
  return { blob: jpegToPdf(bytes, c.width, c.height), name: `FineTec-Invoice-${safeName(inv.number)}-${safeName(inv.customerName) || 'customer'}.pdf` };
}
async function exportAs(inv, kind, share) {
  try {
    toast('Preparing…', 8000);
    const { blob, name } = kind === 'pdf' ? await makePdf(inv) : await makeImage(inv);
    if (share) {
      const file = new File([blob], name, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `Invoice ${inv.number} - Fine Tec` });
        toast('Shared'); return;
      }
      download(blob, name);
      toast('Sharing is not available here, so it was downloaded instead');
      return;
    }
    download(blob, name);
    toast(kind === 'pdf' ? 'PDF saved to your downloads' : 'Image saved to your downloads');
  } catch (e) {
    if (e && e.name === 'AbortError') { toast('Cancelled'); return; }
    console.error(e); toast('Something went wrong: ' + (e.message || e));
  }
}

// ---------- shell ----------
function topbar(title, { back, right } = {}) {
  return h('div', { class: 'topbar' },
    back ? h('button', { class: 'icon-btn', 'aria-label': 'Back', onclick: () => (typeof back === 'string' ? (location.hash = back) : history.back()) }, '‹') : h('img', { class: 'logo', src: 'assets/ft.png', alt: '' }),
    h('h1', {}, title),
    right || '');
}
function mount(...nodes) { app.replaceChildren(...nodes); window.scrollTo(0, 0); }

// ---------- HOME ----------
function homeScreen() {
  const q = view.q.trim().toLowerCase();
  const rows = invoices.filter(inv => {
    const t = totals(inv);
    if (view.filter === 'unpaid' && t.balance <= 0) return false;
    if (view.filter === 'paid' && t.balance > 0) return false;
    if (!q) return true;
    return [inv.number, inv.customerName, inv.customerPhone, inv.date, t.total.toFixed(2), String(Math.round(t.total))].join(' ').toLowerCase().includes(q);
  });
  const all = invoices.map(totals);
  const sales = all.reduce((s, t) => s + t.total, 0);
  const due = all.reduce((s, t) => s + t.balance, 0);

  const list = h('div', {});
  const draw = () => {
    list.replaceChildren(...(rows.length ? rows.map(invCard) : [
      h('div', { class: 'empty' },
        h('b', {}, invoices.length ? 'No invoice found' : 'No invoices yet'),
        invoices.length ? 'Try a different name, number or date.' : 'Tap the red + button to make your first invoice.')]));
  };
  draw();

  const search = h('input', { class: 'search', type: 'search', placeholder: 'Search by name, number, phone, date or amount', value: view.q, autocomplete: 'off',
    oninput: e => { view.q = e.target.value; refreshList(); } });
  function refreshList() { homeScreen.render(); }
  const chip = (id, label) => h('button', { class: 'chip' + (view.filter === id ? ' on' : ''), onclick: () => { view.filter = id; homeScreen.render(); } }, label);

  return [
    topbar('Fine Tec Invoices', { right: h('span', {}, h('button', { class: 'icon-btn', title: 'Customers', onclick: () => (location.hash = '#/customers') }, '👥'), h('button', { class: 'icon-btn', title: 'Settings', onclick: () => (location.hash = '#/settings') }, '⚙')) }),
    h('div', { class: 'screen' },
      search,
      h('div', { class: 'chips' }, chip('all', `All (${invoices.length})`), chip('unpaid', 'Unpaid'), chip('paid', 'Paid')),
      h('div', { class: 'stats', style: 'margin:0 0 14px' },
        h('div', { class: 'stat' }, h('span', { class: 'muted' }, 'Total sales'), h('b', {}, money(sales))),
        h('div', { class: 'stat warn' }, h('span', { class: 'muted' }, 'Still to receive'), h('b', {}, money(due)))),
      list),
    h('button', { class: 'fab', 'aria-label': 'New invoice', onclick: () => (location.hash = '#/new') }, '+'),
  ];
}
homeScreen.render = () => {
  const keepFocus = document.activeElement && document.activeElement.classList.contains('search');
  const pos = keepFocus ? document.activeElement.selectionStart : 0;
  mount(...homeScreen());
  if (keepFocus) { const s = app.querySelector('.search'); s.focus(); s.setSelectionRange(pos, pos); }
};
function invCard(inv) {
  const t = totals(inv);
  return h('div', { class: 'card inv', onclick: () => (location.hash = '#/view/' + inv.id) },
    h('div', { class: 'no' }, '#' + inv.number),
    h('div', { class: 'grow' },
      h('div', { class: 'who' }, inv.customerName || 'No name'),
      h('div', { class: 'muted' }, inv.date || '')),
    h('div', { class: 'amt' }, money(t.total),
      h('div', {}, h('span', { class: 'tag ' + (t.balance > 0 ? 'due' : 'paid') }, t.balance > 0 ? 'Due ' + money(t.balance) : 'Paid'))));
}

// ---------- VIEW ----------
async function viewScreen(id) {
  const inv = invoices.find(i => i.id === id);
  if (!inv) { location.hash = '#/'; return; }
  const t = totals(inv);
  const canvas = h('canvas', {});
  mount(
    topbar('Invoice #' + inv.number, { back: '#/' }),
    h('div', { class: 'screen' },
      h('div', { class: 'preview' }, canvas),
      h('div', { class: 'btns' },
        h('button', { class: 'btn primary', onclick: () => exportAs(inv, 'pdf', false) }, '⬇ Download PDF'),
        h('button', { class: 'btn primary', onclick: () => exportAs(inv, 'png', false) }, '🖼 Download Image'),
        h('button', { class: 'btn red', onclick: () => exportAs(inv, 'pdf', true) }, '↗ Share PDF'),
        h('button', { class: 'btn red', onclick: () => exportAs(inv, 'png', true) }, '↗ Share Image')),
      h('div', { class: 'btns' },
        h('button', { class: 'btn ghost', onclick: () => (location.hash = '#/edit/' + inv.id) }, '✎ Edit'),
        h('button', { class: 'btn ghost', onclick: () => (location.hash = '#/new?copy=' + inv.id) }, '⧉ Duplicate'),
        t.balance > 0 ? h('button', { class: 'btn ghost', onclick: async () => { inv.received = String(t.total); inv.updatedAt = Date.now(); await db.put('invoices', inv); toast('Marked as paid'); viewScreen(id); } }, '✔ Mark as paid') : '',
        h('button', { class: 'btn danger', onclick: async () => { if (confirm(`Delete invoice #${inv.number}? This cannot be undone.`)) { await db.del('invoices', inv.id); await loadAll(); toast('Invoice deleted'); location.hash = '#/'; } } }, '🗑 Delete'))));
  await renderInvoice(canvas, inv, bizOf(inv), inv.design, 1.6);
}

// ---------- EDITOR ----------
const SAMPLE = {
  number: '1', date: '01-01-2026', customerName: 'Sample Customer', customerAddress: 'Lahore', customerPhone: '', terms: 'Thank you for doing business with us.',
  items: [{ name: 'Sample item', qty: 2, rate: 1500 }], discount: 0, received: 0, showSignature: false,
};

async function editScreen(id, copyId) {
  const existing = id ? invoices.find(i => i.id === id) : null;
  if (id && !existing) { location.hash = '#/'; return; }
  const src = existing || (copyId ? invoices.find(i => i.id === copyId) : null);
  const params = new URLSearchParams((location.hash.split('?')[1] || ''));
  const prefill = params.get('customer') ? customers.find(c => c.id === params.get('customer')) : null;
  const d = src ? JSON.parse(JSON.stringify(src)) : {
    number: nextNumber(), date: isoToDmy(todayIso()),
    customerName: prefill ? prefill.name : '', customerPhone: prefill ? prefill.phone : '', customerAddress: prefill ? prefill.address : '',
    items: [{ name: '', qty: '1', rate: '' }], discount: '', received: '',
    terms: settings.terms, design: settings.design, signature: settings.signature || '', showSignature: !!settings.signature,
  };
  if (!existing) { if (copyId) { d.number = nextNumber(); d.date = isoToDmy(todayIso()); d.received = ''; delete d.id; } }
  d.design = d.design || settings.design;
  d.items = (d.items && d.items.length ? d.items : [{ name: '', qty: '1', rate: '' }]).map(i => ({ name: i.name || '', qty: String(i.qty ?? '1'), rate: String(i.rate ?? '') }));

  // --- design picker
  const designs = h('div', { class: 'designs' });
  const designCards = {};
  for (const ds of DESIGNS) {
    const cv = h('canvas', {});
    const card = h('div', { class: 'design' + (d.design === ds.id ? ' on' : ''), onclick: () => { d.design = ds.id; Object.entries(designCards).forEach(([k, c]) => c.classList.toggle('on', k === ds.id)); } },
      cv, h('b', {}, ds.name), h('small', {}, ds.note));
    designCards[ds.id] = card; designs.append(card);
    renderInvoice(cv, SAMPLE, bizOf(null), ds.id, 0.3).catch(() => {});
  }

  // --- customer
  const dl = h('datalist', { id: 'custlist' }, customers.map(c => h('option', { value: c.name })));
  const nameIn = h('input', { value: d.customerName, list: 'custlist', placeholder: 'Customer name', autocomplete: 'off',
    oninput: e => { d.customerName = e.target.value; const c = customers.find(x => x.name.toLowerCase() === e.target.value.trim().toLowerCase()); if (c) { if (!phoneIn.value) { phoneIn.value = c.phone || ''; d.customerPhone = phoneIn.value; } if (!addrIn.value) { addrIn.value = c.address || ''; d.customerAddress = addrIn.value; } } } });
  const phoneIn = h('input', { value: d.customerPhone, type: 'tel', inputmode: 'tel', placeholder: 'Phone (optional)', oninput: e => (d.customerPhone = e.target.value) });
  const addrIn = h('textarea', { placeholder: 'Address (optional)', oninput: e => (d.customerAddress = e.target.value) }, d.customerAddress || '');

  // --- items
  const itemsBox = h('div', {});
  const sumBox = h('div', { class: 'sum' });
  const paidBtn = h('button', { class: 'btn ghost', type: 'button', onclick: () => { recompute(); receivedIn.value = String(totals(d).total); d.received = receivedIn.value; recompute(); } }, 'Fully paid');
  function recompute() {
    const t = totals(d);
    sumBox.replaceChildren(
      h('div', { class: 'r' }, h('span', {}, 'Subtotal'), h('span', {}, money(t.sub))),
      t.discount > 0 ? h('div', { class: 'r' }, h('span', {}, 'Discount'), h('span', {}, '- ' + money(t.discount))) : '',
      h('div', { class: 'r big' }, h('span', {}, 'Total'), h('span', {}, money(t.total))),
      h('div', { class: 'r' }, h('span', {}, 'Received'), h('span', {}, money(t.received))),
      h('div', { class: 'r' }, h('span', {}, 'Balance'), h('span', {}, money(t.balance))));
    document.getElementById('savetotal') && (document.getElementById('savetotal').textContent = money(t.total));
  }
  function drawItems() {
    itemsBox.replaceChildren(...d.items.map((it, i) => {
      const lt = h('div', { class: 'line-total' }, money(num(it.qty || 1) * num(it.rate)));
      const upd = () => { lt.textContent = money(num(it.qty || 1) * num(it.rate)); recompute(); };
      return h('div', { class: 'item' },
        h('div', { class: 'row gap' },
          h('input', { value: it.name, placeholder: `Item ${i + 1} (description)`, oninput: e => (it.name = e.target.value) }),
          d.items.length > 1 ? h('button', { class: 'x', type: 'button', 'aria-label': 'Remove item', onclick: () => { d.items.splice(i, 1); drawItems(); recompute(); } }, '✕') : ''),
        h('div', { class: 'grid3' },
          h('input', { value: it.qty, type: 'number', inputmode: 'decimal', min: '0', step: 'any', placeholder: 'Qty', 'aria-label': 'Quantity', oninput: e => { it.qty = e.target.value; upd(); } }),
          h('input', { value: it.rate, type: 'number', inputmode: 'decimal', min: '0', step: 'any', placeholder: 'Rate (Rs)', 'aria-label': 'Rate', oninput: e => { it.rate = e.target.value; upd(); } }),
          lt));
    }));
  }
  drawItems();
  const discIn = h('input', { value: d.discount, type: 'number', inputmode: 'decimal', min: '0', step: 'any', placeholder: '0', oninput: e => { d.discount = e.target.value; recompute(); } });
  const receivedIn = h('input', { value: d.received, type: 'number', inputmode: 'decimal', min: '0', step: 'any', placeholder: '0', oninput: e => { d.received = e.target.value; recompute(); } });

  // --- signature
  const sigImg = h('img', { alt: 'Signature' });
  const sigEmpty = h('span', { class: 'muted' }, 'No signature yet');
  const sigBox = h('div', { class: 'sigbox' });
  const showCb = h('input', { type: 'checkbox', checked: d.showSignature !== false && !!d.signature, style: 'width:auto', onchange: e => (d.showSignature = e.target.checked) });
  const remember = h('input', { type: 'checkbox', checked: true, style: 'width:auto' });
  function drawSig() {
    if (d.signature) { sigImg.src = d.signature; sigBox.replaceChildren(sigImg); } else sigBox.replaceChildren(sigEmpty);
  }
  drawSig();
  async function setSig(data) {
    if (!data) return;
    d.signature = data; d.showSignature = true; showCb.checked = true; drawSig();
    if (remember.checked) { settings.signature = data; await saveSettings(settings); }
  }
  const fileIn = h('input', { type: 'file', accept: 'image/*', class: 'hide', onchange: async e => { const f = e.target.files[0]; if (!f) return; try { await setSig(await signatureFromFile(f)); } catch (er) { toast(er.message); } e.target.value = ''; } });

  const root = h('div', { class: 'screen' },
    dl,
    h('div', { class: 'sec' }, '1. Choose design'), designs,
    h('div', { class: 'sec' }, '2. Customer'),
    h('div', { class: 'card' }, h('label', { class: 'f' }, 'Name'), nameIn, h('label', { class: 'f' }, 'Phone'), phoneIn, h('label', { class: 'f' }, 'Address'), addrIn),
    h('div', { class: 'sec' }, '3. Invoice details'),
    h('div', { class: 'card grid2' },
      h('div', {}, h('label', { class: 'f', style: 'margin-top:0' }, 'Invoice No. (auto)'), h('input', { value: d.number, readonly: true, 'aria-label': 'Invoice number (automatic)', style: 'background:#eef1f7;font-weight:700' })),
      h('div', {}, h('label', { class: 'f', style: 'margin-top:0' }, 'Date'), h('input', { type: 'date', value: dmyToIso(d.date), onchange: e => (d.date = isoToDmy(e.target.value)) }))),
    h('div', { class: 'sec' }, '4. Items'),
    itemsBox,
    h('button', { class: 'btn ghost block', type: 'button', onclick: () => { d.items.push({ name: '', qty: '1', rate: '' }); drawItems(); itemsBox.lastElementChild.querySelector('input').focus(); } }, '+ Add item'),
    h('div', { class: 'sec' }, '5. Payment'),
    h('div', { class: 'card grid2' },
      h('div', {}, h('label', { class: 'f', style: 'margin-top:0' }, 'Discount (Rs)'), discIn),
      h('div', {}, h('label', { class: 'f', style: 'margin-top:0' }, 'Received (Rs)'), receivedIn)),
    h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:-4px' }, paidBtn),
    sumBox,
    h('div', { class: 'sec' }, '6. Terms'),
    h('textarea', { oninput: e => (d.terms = e.target.value) }, d.terms || ''),
    h('div', { class: 'sec' }, '7. Signature'),
    sigBox,
    h('div', { class: 'btns', style: 'grid-template-columns:1fr 1fr 1fr' },
      h('button', { class: 'btn ghost', type: 'button', onclick: async () => setSig(await openSignaturePad()) }, '✍ Draw'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => fileIn.click() }, '📷 Upload'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { d.signature = ''; d.showSignature = false; showCb.checked = false; drawSig(); } }, 'Remove')),
    fileIn,
    h('label', { class: 'row gap muted', style: 'margin:6px 2px' }, showCb, 'Show signature on this invoice'),
    h('label', { class: 'row gap muted', style: 'margin:6px 2px' }, remember, 'Remember it for next invoices'),
    h('div', { style: 'height:90px' }));
  recompute();

  async function save() {
    const t = totals(d);
    const cleanItems = d.items.filter(i => i.name.trim() || num(i.rate) > 0).map(i => ({ name: i.name.trim(), qty: num(i.qty || 1) || 1, rate: num(i.rate) }));
    if (!cleanItems.length || t.total <= 0) { toast('Add at least one item with a rate'); return; }
    if (!existing) d.number = nextNumber(); // always a fresh, never-used number
    const now = Date.now();
    const inv = {
      id: existing ? existing.id : uid(), createdAt: existing ? existing.createdAt : now, updatedAt: now,
      number: String(d.number).trim(), date: d.date, customerName: d.customerName.trim(), customerPhone: d.customerPhone.trim(), customerAddress: d.customerAddress.trim(),
      items: cleanItems, discount: num(d.discount), received: num(d.received), terms: d.terms, design: d.design,
      signature: d.signature, showSignature: !!d.signature && d.showSignature !== false,
      biz: existing && existing.biz ? existing.biz : { name: settings.name, address: settings.address, phone: settings.phone, email: settings.email },
    };
    await db.put('invoices', inv);
    if (inv.customerName) {
      const cid = inv.customerName.toLowerCase();
      await db.put('customers', { id: cid, name: inv.customerName, phone: inv.customerPhone, address: inv.customerAddress });
    }
    const n = parseInt(inv.number, 10);
    if (Number.isFinite(n) && n >= num(settings.nextNumber)) { settings.nextNumber = n + 1; }
    settings.design = inv.design;
    await saveSettings(settings);
    await loadAll();
    toast('Invoice saved');
    location.replace('#/view/' + inv.id);
  }

  mount(
    topbar(existing ? 'Edit invoice' : 'New invoice', { back: existing ? '#/view/' + existing.id : '#/' }),
    root,
    h('div', { class: 'savebar' }, h('div', {},
      h('div', { class: 'grow' }, h('div', { class: 'muted' }, 'Total'), h('b', { id: 'savetotal', style: 'color:var(--navy);font-size:18px' }, money(totals(d).total))),
      h('button', { class: 'btn red', style: 'min-width:150px', onclick: save }, 'Save invoice'))));
}

// ---------- CUSTOMERS ----------
function customersScreen() {
  let q = '';
  const list = h('div', {});
  const draw = () => {
    const rows = customers.filter(c => !q || (c.name + ' ' + c.phone).toLowerCase().includes(q));
    list.replaceChildren(...(rows.length ? rows.map(c =>
      h('div', { class: 'card cust' },
        h('div', { class: 'grow', onclick: () => (location.hash = '#/new?customer=' + encodeURIComponent(c.id)), style: 'cursor:pointer' },
          h('b', {}, c.name), h('div', { class: 'muted' }, [c.phone, c.address].filter(Boolean).join(' · ') || 'Tap to make an invoice')),
        h('button', { class: 'x', 'aria-label': 'Delete customer', onclick: async () => { if (confirm(`Remove ${c.name} from your customer list? Their invoices stay.`)) { await db.del('customers', c.id); await loadAll(); customersScreen(); } } }, '🗑'))) :
      [h('div', { class: 'empty' }, h('b', {}, 'No customers yet'), 'Customers are saved automatically when you save an invoice.')]));
  };
  draw();
  mount(topbar('Customers', { back: '#/' }), h('div', { class: 'screen' },
    h('input', { class: 'search', type: 'search', placeholder: 'Search customers', oninput: e => { q = e.target.value.trim().toLowerCase(); draw(); } }),
    h('div', { style: 'height:12px' }), list));
}

// ---------- SETTINGS ----------
function settingsScreen() {
  const s = { ...settings };
  const field = (label, key, type = 'text', rows) => h('div', {}, h('label', { class: 'f' }, label),
    rows ? h('textarea', { rows, oninput: e => (s[key] = e.target.value) }, s[key] || '') : h('input', { type, value: s[key] ?? '', oninput: e => (s[key] = e.target.value) }));
  const sigPrev = h('div', { class: 'sigbox' });
  const drawSig = () => (s.signature ? sigPrev.replaceChildren(h('img', { src: s.signature, alt: 'Saved signature' })) : sigPrev.replaceChildren(h('span', { class: 'muted' }, 'No saved signature')));
  drawSig();
  const fileIn = h('input', { type: 'file', accept: 'image/*', class: 'hide', onchange: async e => { const f = e.target.files[0]; if (!f) return; try { s.signature = await signatureFromFile(f); drawSig(); } catch (er) { toast(er.message); } e.target.value = ''; } });
  const restoreIn = h('input', { type: 'file', accept: 'application/json,.json', class: 'hide', onchange: async e => { const f = e.target.files[0]; if (f) await restore(f); e.target.value = ''; } });
  const store = h('div', { class: 'muted' }, '');
  if (navigator.storage && navigator.storage.persisted) navigator.storage.persisted().then(p => (store.textContent = p ? 'Storage is protected: your browser will not clear it automatically.' : 'Tip: install the app to your home screen and press “Protect my data” so the phone does not clear it.'));

  mount(topbar('Settings', { back: '#/' }), h('div', { class: 'screen' },
    h('div', { class: 'sec' }, 'Your business (printed on every invoice)'),
    h('div', { class: 'card' }, field('Business name', 'name'), field('Address (one line per row)', 'address', 'text', 3), field('Phone', 'phone', 'tel'), field('Email', 'email', 'email')),
    h('div', { class: 'sec' }, 'Defaults'),
    h('div', { class: 'card' },
      field('Default terms', 'terms', 'text', 3),
      h('label', { class: 'f' }, 'Default design'),
      h('select', { onchange: e => (s.design = e.target.value) }, DESIGNS.map(ds => h('option', { value: ds.id, selected: s.design === ds.id }, ds.name + ' - ' + ds.note)))),
    h('div', { class: 'sec' }, 'My signature'),
    sigPrev,
    h('div', { class: 'btns', style: 'grid-template-columns:1fr 1fr 1fr' },
      h('button', { class: 'btn ghost', onclick: async () => { const d = await openSignaturePad(); if (d) { s.signature = d; drawSig(); } } }, '✍ Draw'),
      h('button', { class: 'btn ghost', onclick: () => fileIn.click() }, '📷 Upload'),
      h('button', { class: 'btn ghost', onclick: () => { s.signature = ''; drawSig(); } }, 'Remove')), fileIn,
    h('button', { class: 'btn red block', style: 'margin-top:6px', onclick: async () => { Object.assign(settings, s, { nextNumber: settings.nextNumber }); await saveSettings(settings); toast('Settings saved'); } }, 'Save settings'),
    h('div', { class: 'sec' }, 'Backup (important)'),
    h('div', { class: 'note' }, 'Your invoices live only on this device. Make a backup file now and then and keep it safe (for example in WhatsApp “Saved messages” or Google Drive).'),
    h('div', { class: 'btns' },
      h('button', { class: 'btn primary', onclick: backup }, '⬇ Backup all data'),
      h('button', { class: 'btn ghost', onclick: () => restoreIn.click() }, '⬆ Restore backup')), restoreIn,
    h('button', { class: 'btn ghost block', onclick: async () => { const ok = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; toast(ok ? 'Your data is now protected' : 'Your browser did not allow it - install the app first'); settingsScreen(); } }, '🔒 Protect my data'),
    h('div', { style: 'margin:8px 2px' }, store),
    h('div', { class: 'sec' }, 'Danger zone'),
    h('button', { class: 'btn danger block', onclick: async () => { if (confirm('Delete ALL invoices and customers from this device? Make a backup first!') && confirm('Really delete everything?')) { await db.clear('invoices'); await db.clear('customers'); await loadAll(); toast('Everything deleted'); location.hash = '#/'; } } }, 'Delete all data'),
    h('p', { class: 'muted', style: 'text-align:center;margin:22px 0' }, 'Fine Tec Invoices · works offline')));
}
async function backup() {
  const data = { app: 'finetec-invoices', version: 1, exportedAt: new Date().toISOString(), settings, invoices: await db.all('invoices'), customers: await db.all('customers') };
  download(new Blob([JSON.stringify(data)], { type: 'application/json' }), `finetec-backup-${todayIso()}.json`);
  toast('Backup file saved');
}
async function restore(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.app !== 'finetec-invoices') throw new Error('This is not a Fine Tec backup file');
    if (!confirm(`Restore ${data.invoices.length} invoices? Invoices with the same ID will be replaced.`)) return;
    for (const i of data.invoices) await db.put('invoices', i);
    for (const c of data.customers || []) await db.put('customers', c);
    if (data.settings) { settings = { ...DEFAULTS, ...data.settings }; await saveSettings(settings); }
    await loadAll(); toast('Backup restored'); location.hash = '#/';
  } catch (e) { toast('Could not restore: ' + e.message, 4000); }
}

// ---------- router ----------
async function route() {
  const hash = location.hash || '#/';
  const [path] = hash.slice(1).split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(hash.split('?')[1] || '');
  if (!parts.length) homeScreen.render();
  else if (parts[0] === 'new') await editScreen(null, params.get('copy'));
  else if (parts[0] === 'edit') await editScreen(parts[1]);
  else if (parts[0] === 'view') await viewScreen(parts[1]);
  else if (parts[0] === 'customers') customersScreen();
  else if (parts[0] === 'settings') settingsScreen();
  else location.hash = '#/';
}

async function start() {
  try { await loadFonts(); await loadAll(); } catch (e) { console.error(e); toast('Storage is not available in this browser mode'); }
  window.addEventListener('hashchange', route);
  await route();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(() => {
      if (!localStorage.getItem('ft-offline-ready')) { localStorage.setItem('ft-offline-ready', '1'); navigator.serviceWorker.ready.then(() => toast('Ready to work offline ✔', 3500)); }
    }).catch(() => {});
  }
}
start();
