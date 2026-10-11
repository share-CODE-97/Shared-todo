import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, onValue } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

/* ================= config ================= */
const DEFAULT_DB_URL = 'https://shared-todo-69144-default-rtdb.asia-southeast1.firebasedatabase.app';

/* ================= icons ================= */
const svg = (p, s = 18) =>
  `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const I = {
  check:  svg('<polyline points="20 6 9 17 4 12"/>', 15),
  chev:   svg('<polyline points="9 18 15 12 9 6"/>', 15),
  dots:   svg('<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>', 18),
  trash:  svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>', 15),
  sub:    svg('<polyline points="9 6 15 12 9 18"/>', 16),
  comment:svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>', 15),
  pencil: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>', 15),
  up:     svg('<path d="M12 19V5"/><polyline points="5 12 12 5 19 12"/>', 16),
  down:   svg('<path d="M12 5v14"/><polyline points="19 12 12 19 5 12"/>', 16),
};

/* ================= colors ================= */
const COLORS = ['#4f46e5','#10b981','#f59e0b','#f43f5e','#0ea5e9','#8b5cf6','#14b8a6','#f97316'];
const hexToRgba = (hex, a) => {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
};

/* ================= ring ================= */
const RING_R = 15.5;
const RING_C = 2 * Math.PI * RING_R;
function ringSVG(pct, allDone, empty) {
  if (empty) return `<svg viewBox="0 0 36 36" width="34" height="34"><circle cx="18" cy="18" r="${RING_R}" fill="none" stroke="currentColor" stroke-width="2.6" opacity="0.24" stroke-dasharray="3 4"/></svg>`;
  const off = RING_C - (RING_C * pct / 100);
  const inner = allDone
    ? `<polyline points="12.6,18.6 16.4,22.4 23.8,14.6" fill="none" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<text x="18" y="21.4" text-anchor="middle" font-size="10" font-weight="700" fill="currentColor" font-family="system-ui,-apple-system,sans-serif" letter-spacing="-0.3">${pct}%</text>`;
  return `<svg viewBox="0 0 36 36" width="34" height="34">
    <circle cx="18" cy="18" r="${RING_R}" fill="none" stroke="currentColor" stroke-width="2.6" opacity="0.16"/>
    <circle cx="18" cy="18" r="${RING_R}" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="${RING_C}" stroke-dashoffset="${off}" transform="rotate(-90 18 18)" style="transition:stroke-dashoffset .35s cubic-bezier(.4,0,.2,1)"/>
    ${inner}
  </svg>`;
}

/* ================= header height ================= */
function updateHeaderHeight(){
  const h = document.querySelector('header');
  if (h) document.documentElement.style.setProperty('--header-h', h.offsetHeight + 'px');
}
window.addEventListener('resize', updateHeaderHeight);
if (window.ResizeObserver) {
  const h = document.querySelector('header');
  if (h) new ResizeObserver(updateHeaderHeight).observe(h);
}

/* ================= theme ================= */
const LS_THEME = 'sharedtodo.theme';
const META = document.querySelector('meta[name="theme-color"]');
function storedTheme(){ return localStorage.getItem(LS_THEME) || 'auto'; }
function effectiveTheme(){
  const s = storedTheme();
  if (s === 'light' || s === 'dark') return s;
  return matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function applyTheme(mode){
  localStorage.setItem(LS_THEME, mode);
  const root = document.documentElement;
  if (mode === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
  updateMeta(); updateSeg();
}
function updateMeta(){ META.setAttribute('content', effectiveTheme() === 'dark' ? '#0d1014' : '#f4f5f8'); }
function updateSeg(){ document.querySelectorAll('#themeSeg button').forEach(b => b.classList.toggle('active', b.dataset.themeMode === storedTheme())); }
if (matchMedia) { const mq = matchMedia('(prefers-color-scheme: dark)'); (mq.addEventListener||mq.addListener).call(mq, 'change', () => { if (storedTheme()==='auto') updateMeta(); }); }
(function initTheme(){ const s = storedTheme(); if (s !== 'auto') document.documentElement.setAttribute('data-theme', s); updateMeta(); updateSeg(); })();

/* ================= storage ================= */
const LS_OPS = 'sharedtodo.ops';
const LS_DEV = 'sharedtodo.device';
const LS_UI = 'sharedtodo.ui';
const LS_PUSHED = 'sharedtodo.pushed';
const LS_FB = 'sharedtodo.firebase';

let deviceId = localStorage.getItem(LS_DEV);
if (!deviceId) { deviceId = 'dev-' + Math.random().toString(36).slice(2, 7); localStorage.setItem(LS_DEV, deviceId); }

let ui = { expanded: [], openComments: [], sortMode: 'manual' };
try { Object.assign(ui, JSON.parse(localStorage.getItem(LS_UI) || '{}')); } catch(e){}
ui.expanded = new Set(ui.expanded || []);
ui.openComments = new Set(ui.openComments || []);
if (!['manual','asc','desc'].includes(ui.sortMode)) ui.sortMode = 'manual';
function saveUI(){ localStorage.setItem(LS_UI, JSON.stringify({ expanded: [...ui.expanded], openComments: [...ui.openComments], sortMode: ui.sortMode })); }

let ops = [];
try { ops = JSON.parse(localStorage.getItem(LS_OPS) || '[]'); } catch(e){ ops = []; }

let pushedIds = new Set();
try { pushedIds = new Set(JSON.parse(localStorage.getItem(LS_PUSHED) || '[]')); } catch(e){}

/* ================= op log ================= */
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

function addOp(op){
  op.opId = uid();
  op.ts = Date.now();
  op.device = deviceId;
  ops.push(op);
  localStorage.setItem(LS_OPS, JSON.stringify(ops));
  refreshStatus();
  pushOpToFirebase(op);
}

let pendingFocus = null, pendingPop = null;
function push(op, focusId){ addOp(op); if (focusId) pendingFocus = focusId; render(); }
function updateField(id, field, value){ addOp({ type: field, id, value }); }

function mergeOps(incoming){
  const have = new Set(ops.map(o => o.opId));
  let added = 0;
  for (const o of incoming){
    if (o && o.opId && !have.has(o.opId)){ ops.push(o); have.add(o.opId); added++; }
  }
  if (added) localStorage.setItem(LS_OPS, JSON.stringify(ops));
  return added;
}

/* ================= Firebase ================= */
let fbApp = null, fbDb = null, fbOpsRef = null, fbUnsub = null;

function dbUrl(){ return localStorage.getItem(LS_FB) || DEFAULT_DB_URL; }
function timeStr(){ return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

function setCloudUI(state, title, url){
  const box = document.getElementById('cloudBox');
  const t = document.getElementById('cloudTitle');
  const u = document.getElementById('cloudUrl');
  box.classList.remove('on','warn');
  if (state === 'on') box.classList.add('on');
  if (state === 'warn') box.classList.add('warn');
  t.textContent = title;
  u.textContent = url || '—';
}

function connectFirebase(){
  const url = dbUrl();
  if (fbUnsub){ try { fbUnsub(); } catch(e){} fbUnsub = null; }
  if (fbApp){ try { fbApp.delete(); } catch(e){} fbApp = null; }
  try {
    fbApp = initializeApp({ databaseURL: url, projectId: 'shared-todo-69144' }, 'todo-' + Date.now());
    fbDb = getDatabase(fbApp);
    fbOpsRef = ref(fbDb, 'todo/ops');
  } catch(e){
    console.error(e);
    setStatus('Firebase init failed', 'warn');
    setCloudUI('warn', 'Init failed', url);
    return;
  }
  fbUnsub = onValue(fbOpsRef, (snap) => {
    const val = snap.val() || {};
    const incoming = Object.values(val);
    const added = mergeOps(incoming);
    if (added){ render(); }
    refreshStatus();
    setCloudUI('on', 'Connected', url);
  }, (err) => {
    console.error(err);
    const code = err && (err.code || err.message) || 'unknown';
    setStatus('Error: ' + code, 'warn');
    setCloudUI('warn', code.slice(0, 44), url);
  });
  setTimeout(pushAllUnsynced, 400);
}

async function pushOpToFirebase(op){
  if (!fbDb) return;
  if (pushedIds.has(op.opId)) return;
  try {
    await set(ref(fbDb, 'todo/ops/' + op.opId), op);
    pushedIds.add(op.opId);
    localStorage.setItem(LS_PUSHED, JSON.stringify([...pushedIds]));
    refreshStatus();
  } catch(e){
    console.error(e);
    setStatus('Push failed', 'warn');
  }
}

async function pushAllUnsynced(){
  if (!fbDb) return;
  const unsynced = ops.filter(o => !pushedIds.has(o.opId));
  for (const op of unsynced){ await pushOpToFirebase(op); }
}

/* ================= status ================= */
function setStatus(text, kind){
  document.getElementById('statusText').textContent = text;
  document.getElementById('status').className = 'status' + (kind ? ' ' + kind : '');
}
function refreshStatus(){
  const pending = ops.filter(o => !pushedIds.has(o.opId)).length;
  if (pending > 0) setStatus('Saving… ' + pending, 'warn');
  else setStatus('✓ Synced · ' + timeStr(), 'ok');
}

/* ================= DOM helpers ================= */
const app = document.getElementById('app');
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

/* ================= save tick ================= */
function attachSaveTick(wrap, input){
  const tick = el('button', 'save-tick', I.check);
  tick.type = 'button';
  tick.tabIndex = -1;
  tick.setAttribute('aria-label', 'Done editing');

  let blurTimer;

  input.addEventListener('focus', () => {
    clearTimeout(blurTimer);
    wrap.classList.add('focused');
  });

  input.addEventListener('blur', () => {
    clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      wrap.classList.remove('focused');
      tick.classList.remove('flash');
    }, 600);
  });

  tick.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(blurTimer);
    haptic(12);
    tick.classList.add('flash');
    input.blur();
    refreshStatus();
    blurTimer = setTimeout(() => {
      wrap.classList.remove('focused');
      tick.classList.remove('flash');
    }, 500);
  });

  wrap.appendChild(tick);
}

/* ================= derive ================= */
function derive(){
  const nodes = new Map();
  const sorted = [...ops].sort((a,b) => a.ts - b.ts || (a.device < b.device ? -1 : a.device > b.device ? 1 : 0) || (a.opId < b.opId ? -1 : 1));
  for (const op of sorted){
    if (op.type === 'add'){
      nodes.set(op.id, { id: op.id, parentId: op.parentId || null, kind: op.kind, title: op.title || '', comment: '', done: false, color: op.color || null, deleted: false, order: op.ts });
    } else {
      const n = nodes.get(op.id); if (!n) continue;
      if (op.type === 'title') n.title = op.value;
      else if (op.type === 'comment') n.comment = op.value;
      else if (op.type === 'done') n.done = !!op.value;
      else if (op.type === 'order') n.order = op.value;
      else if (op.type === 'delete') n.deleted = true;
      else if (op.type === 'undelete') n.deleted = false;
    }
  }
  return nodes;
}

function buildTree(nodes){
  const byParent = new Map();
  for (const n of nodes.values()){
    if (n.deleted) continue;
    const p = n.parentId || 'root';
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p).push(n);
  }

  const mode = ui.sortMode;
  const cmp = (a, b) => {
    if (mode === 'asc'){
      return (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' })
        || (a.order - b.order);
    }
    if (mode === 'desc'){
      return (b.title || '').localeCompare(a.title || '', undefined, { sensitivity: 'base' })
        || (a.order - b.order);
    }
    return a.order - b.order;
  };

  for (const arr of byParent.values()) arr.sort(cmp);
  return byParent;
}

function autosize(ta){
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}
function autosizeAll(){
  app.querySelectorAll('textarea.title').forEach(autosize);
}

function collectLeaves(id, tree, out = []){
  const children = tree.get(id) || [];
  for (const c of children){
    const grand = tree.get(c.id) || [];
    if (grand.length === 0) out.push(c);
    else collectLeaves(c.id, tree, out);
  }
  return out;
}

/* ================= reorder ================= */
function moveUp(id, tree){
  if (ui.sortMode !== 'manual') return;
  const nodes = derive();
  const n = nodes.get(id);
  if (!n) return;
  const parent = n.parentId || 'root';
  const siblings = tree.get(parent) || [];
  const idx = siblings.findIndex(s => s.id === id);
  if (idx <= 0) return;
  const prev = siblings[idx - 1];
  let newOrder;
  if (idx === 1) newOrder = prev.order - 1000;
  else newOrder = (siblings[idx - 2].order + prev.order) / 2;
  addOp({ type: 'order', id: n.id, value: newOrder });
  haptic(6);
  render();
}

function moveDown(id, tree){
  if (ui.sortMode !== 'manual') return;
  const nodes = derive();
  const n = nodes.get(id);
  if (!n) return;
  const parent = n.parentId || 'root';
  const siblings = tree.get(parent) || [];
  const idx = siblings.findIndex(s => s.id === id);
  if (idx < 0 || idx >= siblings.length - 1) return;
  const next = siblings[idx + 1];
  let newOrder;
  if (idx === siblings.length - 2) newOrder = next.order + 1000;
  else newOrder = (next.order + siblings[idx + 2].order) / 2;
  addOp({ type: 'order', id: n.id, value: newOrder });
  haptic(6);
  render();
}

/* Move menu items — only shown in Manual mode */
function moveMenuItems(id, tree){
  if (ui.sortMode !== 'manual') return [];
  const nodes = derive();
  const n = nodes.get(id);
  if (!n) return [];
  const parent = n.parentId || 'root';
  const siblings = tree.get(parent) || [];
  const idx = siblings.findIndex(s => s.id === id);
  const canUp = idx > 0;
  const canDown = idx < siblings.length - 1;
  return [
    { icon: I.up,   label: 'Move up',   disabled: !canUp,   onClick: () => canUp   && moveUp(id, tree) },
    { icon: I.down, label: 'Move down', disabled: !canDown, onClick: () => canDown && moveDown(id, tree) },
    { sep: true },
  ];
}

/* ================= render ================= */
function render(){
  const nodes = derive();
  const tree = buildTree(nodes);
  app.innerHTML = '';
  const sections = tree.get('root') || [];
  if (!sections.length){
    app.innerHTML = `
      <div class="empty">
        <div class="ico">${svg('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', 28)}</div>
        <h2>Nothing here yet</h2>
        <p>Tap <b>New section</b> to create your first list.<br>Everything syncs to the cloud.</p>
      </div>`;
    return;
  }
  sections.forEach((s, i) => app.appendChild(renderSection(s, tree, i)));

  if (pendingFocus){
    const t = app.querySelector(`[data-focus="${pendingFocus}"]`);
    if (t){ t.focus(); try { t.setSelectionRange(t.value.length, t.value.length); } catch(e){} t.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    pendingFocus = null;
  }
  if (pendingPop){
    const t = app.querySelector(`[data-tick="${pendingPop}"]`);
    if (t){ t.classList.add('pop'); setTimeout(() => t.classList.remove('pop'), 350); }
    pendingPop = null;
  }
  autosizeAll();
}

function renameItem(id){
  return { icon: I.pencil, label: 'Rename', onClick: () => {
    const t = app.querySelector(`[data-focus="${id}"]`);
    if (t){ t.focus(); try { t.select(); } catch(e){} t.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }};
}

function renderSection(s, tree, index){
  const color = s.color || COLORS[index % COLORS.length];
  const leaves = collectLeaves(s.id, tree);
  const doneCount = leaves.filter(t => t.done).length;
  const allDone = leaves.length > 0 && doneCount === leaves.length;
  const pct = leaves.length ? Math.round((doneCount / leaves.length) * 100) : 0;
  const visuallyDone = leaves.length ? allDone : s.done;

  const box = el('div', 'section' + (visuallyDone ? ' is-done' : ''));
  box.dataset.id = s.id;
  box.style.setProperty('--sec', color);
  box.style.setProperty('--sec-tint', hexToRgba(color, 0.14));
  box.style.setProperty('--sec-soft', hexToRgba(color, 0.45));

   const expanded = ui.expanded.has(s.id);
  if (!expanded) box.classList.add('collapsed');

  const head = el('div', 'shead');

  const chev = el('button', 'chev', I.chev);
  chev.type = 'button';
  chev.setAttribute('aria-label', collapsed ? 'Expand' : 'Collapse');
  chev.onclick = () => {
    if (ui.expanded.has(s.id)) ui.expanded.delete(s.id);
    else ui.expanded.add(s.id);
    saveUI(); render();
  };

  const titleWrap = el('div', 'field-wrap');
  const title = el('textarea', 'title');
  title.rows = 1; title.value = s.title; title.placeholder = 'Section name…'; title.dataset.focus = s.id;
  title.setAttribute('wrap', 'soft');
  title.oninput = () => { autosize(title); updateField(s.id, 'title', title.value); };
  title.onkeydown = (ev) => { if (ev.key === 'Enter'){ ev.preventDefault(); title.blur(); } };
  titleWrap.appendChild(title);
  attachSaveTick(titleWrap, title);

  const count = el('span', 'sec-count' + (allDone ? ' done' : ''), leaves.length ? `${doneCount}/${leaves.length}` : '0');

  const commentBtn = el('button', 'comment-btn' + (s.comment ? ' has-comment' : ''));
  commentBtn.type = 'button';
  commentBtn.title = s.comment ? 'View comment' : 'Add comment';
  commentBtn.innerHTML = I.comment;
  commentBtn.onclick = () => {
    if (ui.openComments.has(s.id)) ui.openComments.delete(s.id);
    else ui.openComments.add(s.id);
    saveUI(); render();
    if (ui.openComments.has(s.id)){ const ta = app.querySelector(`[data-comment="${s.id}"]`); if (ta) ta.focus(); }
  };

  const ring = el('button', 'ring-btn' + (leaves.length ? '' : ' empty'));
  ring.type = 'button'; ring.dataset.tick = s.id;
  ring.setAttribute('aria-label', leaves.length ? `Section ${pct}% complete` : 'No items yet');
  ring.innerHTML = ringSVG(pct, allDone, !leaves.length);
  if (leaves.length){
    ring.onclick = () => {
      haptic(); pendingPop = s.id;
      const newState = !allDone;
      leaves.forEach(leaf => addOp({ type: 'done', id: leaf.id, value: newState }));
      if (newState && !s.done) addOp({ type: 'done', id: s.id, value: true });
      if (!newState && s.done) addOp({ type: 'done', id: s.id, value: false });
      render();
    };
  }

  const dots = el('button', 'dots', I.dots);
  dots.type = 'button'; dots.setAttribute('aria-label', 'Section menu');
  dots.onclick = (e) => {
    e.stopPropagation();
    showPop(dots, [
      ...moveMenuItems(s.id, tree),
      { icon: I.sub, label: 'Add subsection', onClick: () => {
          const nid = uid();
          const existing = (tree.get(s.id) || []).filter(c => c.kind === 'sub').length;
          const sIdx = COLORS.indexOf(color);
          const subColor = COLORS[(sIdx + 1 + existing) % COLORS.length];
          ui.expanded.add(s.id); saveUI();          
        push({ type: 'add', id: nid, parentId: s.id, kind: 'sub', title: '', color: subColor }, nid);
        }},
      renameItem(s.id),
      { sep: true },
      { icon: I.trash, label: 'Delete section', danger: true, onClick: () => deleteNode(s.id, tree, 'Section') },
    ]);
  };

  head.append(chev, titleWrap, count, commentBtn, ring, dots);
  box.appendChild(head);

  if (leaves.length){
    const prog = el('div', 'progress');
    prog.innerHTML = `<div class="track"><div class="bar" style="width:${pct}%"></div></div>`;
    box.appendChild(prog);
  }

  if (ui.openComments.has(s.id)){
    const wrap = el('div', 'comment-wrap');
    const cmtWrap = el('div', 'field-wrap textarea-wrap');
    const cmt = el('textarea', 'comment');
    cmt.value = s.comment; cmt.placeholder = 'Comment for this section…'; cmt.rows = 2; cmt.dataset.comment = s.id;
    cmt.oninput = () => updateField(s.id, 'comment', cmt.value);
    cmtWrap.appendChild(cmt);
    attachSaveTick(cmtWrap, cmt);
    wrap.appendChild(cmtWrap);
    box.appendChild(wrap);
  }

  const kids = el('div', 'children');
  for (const c of (tree.get(s.id) || [])){
    const node = c.kind === 'sub' ? renderSub(c, tree, color) : renderTask(c, color);
    if (node) kids.appendChild(node);
  }
  box.appendChild(kids);
  return box;
}

function renderSub(sub, tree, parentColor){
  let color = sub.color;
  if (!color){
    const kids = tree.get(sub.parentId) || [];
    const idx = kids.filter(c => c.kind === 'sub').indexOf(sub);
    const base = COLORS.indexOf(parentColor) < 0 ? 0 : COLORS.indexOf(parentColor);
    color = COLORS[(base + 1 + Math.max(0, idx)) % COLORS.length];
  }
  const children = tree.get(sub.id) || [];
  const leaves = collectLeaves(sub.id, tree);
  const doneCount = leaves.filter(t => t.done).length;
  const allDone = leaves.length > 0 && doneCount === leaves.length;
  const visuallyDone = leaves.length ? allDone : sub.done;
  const pct = leaves.length ? Math.round((doneCount / leaves.length) * 100) : 0;

  const box = el('div', 'sub' + (visuallyDone ? ' is-done' : ''));
  box.dataset.id = sub.id;
  box.style.setProperty('--sec', color);
  box.style.setProperty('--sec-soft', hexToRgba(color, 0.55));
  box.style.setProperty('--sec-tint', hexToRgba(color, 0.14));
  /* subsections are always expanded */

  const head = el('div', 'shead');
  const tick = el('button', 'tick' + (visuallyDone ? ' done' : ''), visuallyDone ? I.check : '');
  tick.type = 'button'; tick.dataset.tick = sub.id;
  tick.setAttribute('aria-label', 'Mark subsection complete');
  tick.onclick = () => {
    haptic(); pendingPop = sub.id;
    if (leaves.length){
      const newState = !allDone;
      leaves.forEach(leaf => addOp({ type: 'done', id: leaf.id, value: newState }));
      if (newState && !sub.done) addOp({ type: 'done', id: sub.id, value: true });
      if (!newState && sub.done) addOp({ type: 'done', id: sub.id, value: false });
      render();
    } else { push({ type: 'done', id: sub.id, value: !sub.done }); }
  };

  const titleWrap = el('div', 'field-wrap');
  const title = el('textarea', 'title');
  title.rows = 1; title.value = sub.title; title.placeholder = 'Subsection name…'; title.dataset.focus = sub.id;
  title.setAttribute('wrap', 'soft');
  title.oninput = () => { autosize(title); updateField(sub.id, 'title', title.value); };
  title.onkeydown = (ev) => { if (ev.key === 'Enter'){ ev.preventDefault(); title.blur(); } };
  titleWrap.appendChild(title);
  attachSaveTick(titleWrap, title);

  const commentBtn = el('button', 'comment-btn' + (sub.comment ? ' has-comment' : ''));
  commentBtn.type = 'button';
  commentBtn.title = sub.comment ? 'View comment' : 'Add comment';
  commentBtn.innerHTML = I.comment;
  commentBtn.onclick = () => {
    if (ui.openComments.has(sub.id)) ui.openComments.delete(sub.id);
    else ui.openComments.add(sub.id);
    saveUI(); render();
    if (ui.openComments.has(sub.id)){ const ta = app.querySelector(`[data-comment="${sub.id}"]`); if (ta) ta.focus(); }
  };

  const dots = el('button', 'dots', I.dots);
  dots.type = 'button'; dots.setAttribute('aria-label', 'Subsection menu');
  dots.onclick = (e) => {
    e.stopPropagation();
    showPop(dots, [
      ...moveMenuItems(sub.id, tree),
      renameItem(sub.id),
      { sep: true },
      { icon: I.trash, label: 'Delete subsection', danger: true, onClick: () => deleteNode(sub.id, tree, 'Subsection') },
    ]);
  };

  head.append(tick, titleWrap, commentBtn, dots);
  box.appendChild(head);

  if (leaves.length){
    const prog = el('div', 'progress');
    prog.innerHTML = `<div class="track"><div class="bar" style="width:${pct}%"></div></div>`;
    box.appendChild(prog);
  }

  if (ui.openComments.has(sub.id)){
    const wrap = el('div', 'comment-wrap');
    const cmtWrap = el('div', 'field-wrap textarea-wrap');
    const cmt = el('textarea', 'comment');
    cmt.value = sub.comment; cmt.placeholder = 'Comment for this subsection…'; cmt.rows = 2; cmt.dataset.comment = sub.id;
    cmt.oninput = () => updateField(sub.id, 'comment', cmt.value);
    cmtWrap.appendChild(cmt);
    attachSaveTick(cmtWrap, cmt);
    wrap.appendChild(cmtWrap);
    box.appendChild(wrap);
  }

  const kids = el('div', 'children');
  for (const c of children){ const node = renderTask(c, color); if (node) kids.appendChild(node); }
  box.appendChild(kids);
  return box;
}

function renderTask(t, inheritedColor){
  const row = el('div', 'task' + (t.done ? ' is-done' : ''));
  row.dataset.id = t.id;
  if (inheritedColor) row.style.setProperty('--sec', inheritedColor);
  const tick = el('button', 'tick' + (t.done ? ' done' : ''), t.done ? I.check : '');
  tick.type = 'button'; tick.dataset.tick = t.id;
  tick.setAttribute('aria-label', 'Mark task complete');
  tick.onclick = () => { haptic(); pendingPop = t.id; push({ type: 'done', id: t.id, value: !t.done }); };
  const title = el('input', 'task-title');
  title.type = 'text'; title.value = t.title; title.placeholder = 'Task…'; title.dataset.focus = t.id;
  title.oninput = () => updateField(t.id, 'title', title.value);
  title.onkeydown = (ev) => {
    if (ev.key === 'Enter'){ ev.preventDefault(); const nid = uid(); push({ type: 'add', id: nid, parentId: t.parentId, kind: 'task', title: '' }, nid); }
    else if (ev.key === 'Backspace' && title.value === ''){
      ev.preventDefault();
      const prev = row.previousElementSibling;
      addOp({ type: 'delete', id: t.id }); render();
      if (prev){ const inp = prev.querySelector('input.task-title'); if (inp){ inp.focus(); try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch(e){} } }
    }
  };
  const cmt = el('input', 'comment-line');
  cmt.type = 'text'; cmt.value = t.comment; cmt.placeholder = 'comment…';
  cmt.oninput = () => updateField(t.id, 'comment', cmt.value);
  const del = el('button', 'tdel', I.trash);
  del.type = 'button'; del.setAttribute('aria-label', 'Delete task');
  del.onclick = () => deleteNode(t.id, buildTree(derive()), 'Task');
  row.append(tick, title, cmt, del);
  return row;
}

function deleteNode(id, tree, label){
  const ids = [];
  const stack = [id];
  while (stack.length){
    const cur = stack.pop(); ids.push(cur);
    for (const c of (tree.get(cur) || [])) stack.push(c.id);
  }
  for (const i of ids) addOp({ type: 'delete', id: i });
  render(); haptic(15);
  toast(`${label} deleted`, 'Undo', () => {
    for (const i of ids) addOp({ type: 'undelete', id: i });
    render(); toast('Restored');
  }, 5000);
}

/* ================= popover ================= */
let openPop = null;
function closePop(){ if (openPop){ openPop.remove(); openPop = null; } }
function showPop(anchor, items){
  closePop();
  const m = document.createElement('div'); m.className = 'popmenu';
  for (const it of items){
    if (it.sep){ m.appendChild(el('div', 'pmi-sep')); continue; }
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'pmi' + (it.danger ? ' danger' : '');
    if (it.disabled) b.disabled = true;
    b.innerHTML = `<span class="pmi-ico">${it.icon || ''}</span><span>${it.label}</span>`;
    b.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (it.disabled) return;
      const fn = it.onClick;
      fn();          // run the action first
      closePop();    // then hide the menu
    };
    m.appendChild(b);
  }
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  const mw = m.offsetWidth, mh = m.offsetHeight;
  let x = r.right - mw, y = r.bottom + 6;
  if (y + mh > innerHeight - 10) y = r.top - mh - 6;
  x = Math.max(8, Math.min(x, innerWidth - mw - 8));
  y = Math.max(8, y);
  m.style.left = x + 'px'; m.style.top = y + 'px';
  openPop = m;
}
document.addEventListener('click', (e) => { if (openPop && !openPop.contains(e.target)) closePop(); });
window.addEventListener('scroll', closePop, { passive: true });
window.addEventListener('resize', closePop);

/* ================= toast ================= */
const toastsEl = document.getElementById('toasts');
function toast(msg, actionLabel, actionFn, ms = 2600){
  const t = el('div', 'toast');
  const m = document.createElement('span'); m.className = 'msg'; m.textContent = msg; t.appendChild(m);
  let timer;
  const close = () => { clearTimeout(timer); t.classList.add('out'); setTimeout(() => t.remove(), 200); };
  if (actionLabel && actionFn){
    const b = document.createElement('button'); b.textContent = actionLabel;
    b.onclick = () => { actionFn(); close(); };
    t.appendChild(b);
  }
  toastsEl.appendChild(t);
  timer = setTimeout(close, ms);
}
function haptic(ms = 8){ if (navigator.vibrate){ try { navigator.vibrate(ms); } catch(e){} } }

/* ================= sort button ================= */
function syncSortLabel(){
  const l = document.getElementById('sortLabel');
  if (!l) return;
  if (ui.sortMode === 'asc')  l.textContent = 'A–Z';
  else if (ui.sortMode === 'desc') l.textContent = 'Z–A';
  else l.textContent = '↕';
  const b = document.getElementById('sortBtn');
  if (b){
    b.title = 'Sort: ' + (ui.sortMode === 'asc' ? 'A to Z' : ui.sortMode === 'desc' ? 'Z to A' : 'Manual');
  }
}
document.getElementById('sortBtn').onclick = () => {
  if (ui.sortMode === 'manual') ui.sortMode = 'asc';
  else if (ui.sortMode === 'asc') ui.sortMode = 'desc';
  else ui.sortMode = 'manual';
  saveUI();
  syncSortLabel();
  haptic(6);
  render();
};

/* ================= settings ================= */
const settingsSheet = document.getElementById('settingsSheet');
function openSheet(){ settingsSheet.hidden = false; }
function closeSheet(){ settingsSheet.hidden = true; }
document.getElementById('openSettings').onclick = openSheet;
settingsSheet.addEventListener('click', (e) => { if (e.target.hasAttribute('data-close')) closeSheet(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape'){ closeSheet(); closePop(); } });

document.querySelectorAll('#themeSeg button').forEach(b => {
  b.addEventListener('click', () => { applyTheme(b.dataset.themeMode); haptic(5); });
});

document.getElementById('cloudReconnect').onclick = () => { connectFirebase(); toast('Reconnecting…'); };

document.getElementById('exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify({ version: 1, device: deviceId, ops }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `todo-${deviceId}.json`;
  a.click(); URL.revokeObjectURL(a.href);
  closeSheet(); toast('Exported');
};

document.getElementById('importBtn').onclick = () => document.getElementById('importFile').click();

document.getElementById('importFile').onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const n = mergeOps(data.ops || []);
    if (n){ ops.filter(o => !pushedIds.has(o.opId)).forEach(pushOpToFirebase); render(); }
    closeSheet(); toast(n ? `Merged ${n} changes` : 'Nothing new');
  } catch(err){ toast('Could not read that file'); }
  e.target.value = '';
};

document.getElementById('resetBtn').onclick = () => {
  if (!confirm('Clear local cache on this device?\n(Cloud data is not affected)')) return;
  localStorage.removeItem(LS_OPS);
  localStorage.removeItem(LS_UI);
  localStorage.removeItem(LS_PUSHED);
  ops = []; pushedIds = new Set(); ui.collapsed = new Set(); ui.openComments = new Set();
  closeSheet(); render(); toast('Local cache cleared');
};

/* ================= add section ================= */
function nextColor(){ const count = (buildTree(derive()).get('root') || []).length; return COLORS[count % COLORS.length]; }
function addSection(){
  const nid = uid();
  ui.expanded.add(nid);
  saveUI();
  push({ type: 'add', id: nid, parentId: null, kind: 'section', title: '', color: nextColor() }, nid);
}
document.getElementById('addSectionTop').onclick = addSection;
document.getElementById('fab').onclick = addSection;

/* ================= start ================= */
syncSortLabel();
setCloudUI('warn', 'Connecting…', dbUrl());
connectFirebase();
render();
updateHeaderHeight();
