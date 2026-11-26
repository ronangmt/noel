// Petits outils partagés entre la page famille et la page admin

export const $ = (sel, root = document) => root.querySelector(sel);

// Création d'éléments DOM sans innerHTML (évite toute injection de code via les textes saisis)
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'value') node.value = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false || c === '') continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function render(container, ...nodes) {
  container.replaceChildren(...nodes.filter(Boolean));
}

// N'accepte que les liens http(s) (bloque les liens "javascript:" etc.)
export function safeUrl(u) {
  if (!u) return null;
  try {
    const url = new URL(String(u).trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

const priceFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
export function formatPrice(n) {
  return typeof n === 'number' && !Number.isNaN(n) ? priceFmt.format(n) : '';
}

export function domainOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export async function hashPin(token, pin) {
  const data = new TextEncoder().encode(`${token}:${pin}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function randomPin() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 10000;
  return String(n).padStart(4, '0');
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export const EMOJIS = ['🎅', '🤶', '🦌', '⛄', '🧝', '🎁', '🌟', '🍪', '🐧', '🐻‍❄️', '🔔', '🕯️', '🧸', '🎄', '❄️', '🦊'];

export function toast(message, type = 'ok') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = el('div', { id: 'toasts', 'aria-live': 'polite' });
    document.body.append(box);
  }
  const t = el('div', { class: `toast ${type}`, text: message });
  box.append(t);
  setTimeout(() => t.classList.add('hide'), 2800);
  setTimeout(() => t.remove(), 3300);
}

// Fenêtre modale générique. content = éléments ; retourne { dialog, close }
export function openModal(title, ...content) {
  const dialog = el('dialog', { class: 'modal' },
    el('div', { class: 'modal-head' },
      el('h2', { text: title }),
      el('button', { class: 'icon-btn close', type: 'button', 'aria-label': 'Fermer', onclick: () => close() }, '✕')),
    ...content);
  function close() {
    if (dialog.open) dialog.close();
    dialog.remove();
  }
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, close };
}

export function confirmDialog(message, okLabel = 'Confirmer', danger = true) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (done) return; done = true; m.close(); resolve(v); };
    const m = openModal('Confirmation',
      el('p', { class: 'confirm-text', text: message }),
      el('div', { class: 'modal-actions' },
        el('button', { class: 'btn ghost', type: 'button', onclick: () => finish(false) }, 'Annuler'),
        el('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'button', onclick: () => finish(true) }, okLabel)));
    m.dialog.addEventListener('close', () => finish(false));
  });
}

export function promptDialog(title, label, initial = '') {
  return new Promise(resolve => {
    let done = false;
    const input = el('input', { type: 'text', value: initial, required: true, maxlength: '40' });
    const finish = v => { if (done) return; done = true; m.close(); resolve(v); };
    const form = el('form', { class: 'form', onsubmit: e => { e.preventDefault(); finish(input.value.trim() || null); } },
      el('label', {}, label, input),
      el('div', { class: 'modal-actions' },
        el('button', { class: 'btn ghost', type: 'button', onclick: () => finish(null) }, 'Annuler'),
        el('button', { class: 'btn primary', type: 'submit' }, 'Valider')));
    const m = openModal(title, form);
    m.dialog.addEventListener('close', () => finish(null));
    input.focus();
    input.select();
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copié ! 📋');
  } catch {
    window.prompt('Copie ce texte :', text);
  }
}

function defaultChristmas() {
  const now = new Date();
  let y = now.getFullYear();
  if (now.getMonth() === 11 && now.getDate() > 26) y++;
  return `${y}-12-25`;
}

export function countdownText(dateStr) {
  const [y, m, d] = (dateStr || defaultChristmas()).split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((target - today) / 86400000);
  if (days > 1) return `🎅 J-${days} avant Noël`;
  if (days === 1) return '🎅 C\'est demain !';
  if (days === 0) return '🎄 Joyeux Noël !';
  return '✨ Vivement le prochain Noël !';
}

export function startCountdown(getDate) {
  const box = document.getElementById('countdown');
  const tick = () => { box.textContent = countdownText(getDate()); };
  tick();
  setInterval(tick, 60_000);
  return tick;
}

export function screen(emoji, title, ...lines) {
  return el('div', { class: 'card center-card' },
    el('div', { class: 'big-emoji', 'aria-hidden': 'true' }, emoji),
    el('h2', { text: title }),
    ...lines.map(l => (l instanceof Node ? l : el('p', { text: l }))));
}
