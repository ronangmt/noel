// Page famille : invitation + PIN, ma liste, les listes des autres, mes cadeaux à offrir
import { initFirebase, isConfigured } from './firebase.js';
import { onAuthStateChanged, signInAnonymously } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection, query, where,
  onSnapshot, serverTimestamp, arrayUnion, arrayRemove,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  $, el, render, safeUrl, formatPrice, domainOf, hashPin, sleep, toast,
  confirmDialog, startCountdown, screen, safePhoto,
} from './common.js';
import { openWishForm as openFormFor } from './wishform.js';
import { startSnow } from './snow.js';

startSnow($('#snow-toggle'));

const app = $('#app');
const state = {
  pid: null,
  participants: new Map(),
  wishes: [],
  resByOwner: new Map(),   // ownerId -> [réservations]
  reservations: new Map(), // wishId -> réservation
  settings: {},
  tab: 'mine',
  selected: null,
  unsubs: [],
  resUnsubs: new Map(),
};

const refreshCountdown = startCountdown(() => state.settings.christmasDate);
let auth, db;

if (!isConfigured) {
  render(app, screen('🛠️', 'Site pas encore configuré',
    'Il faut renseigner la configuration Firebase dans js/firebase-config.js (voir le fichier README.md).'));
} else {
  boot().catch(err => {
    console.error(err);
    render(app, screen('😕', 'Oups…', 'Impossible de se connecter. Vérifie ta connexion internet puis recharge la page.'));
  });
}

// ---------- Démarrage ----------
async function boot() {
  ({ auth, db } = initFirebase());
  const existing = await new Promise(resolve => {
    const off = onAuthStateChanged(auth, u => { off(); resolve(u); });
  });
  const user = existing || (await signInAnonymously(auth)).user;
  const token = new URLSearchParams(location.search).get('i');

  const member = await getDoc(doc(db, 'members', user.uid)).catch(() => null);
  const memberData = member && member.exists() ? member.data() : null;

  if (token) {
    if (memberData && memberData.token === token) {
      cleanUrl();
      return startApp(memberData.participantId);
    }
    return showPin(token);
  }
  if (memberData) return startApp(memberData.participantId);
  showInviteOnly();
}

function cleanUrl() {
  // Retire le jeton de l'adresse pour éviter de le partager par erreur
  history.replaceState(null, '', location.pathname);
}

function showInviteOnly(message) {
  renderUserChip(null);
  render(app, screen('✉️', 'Sur invitation uniquement',
    message || 'Cette liste de Noël est réservée à la famille. Ouvre le lien d\'invitation que l\'organisateur t\'a envoyé.'));
}

// ---------- Écran PIN ----------
async function showPin(token) {
  const inv = await getDoc(doc(db, 'invites', token)).catch(() => null);
  if (!inv || !inv.exists()) {
    cleanUrl();
    return showInviteOnly('Ce lien d\'invitation n\'est pas (ou plus) valide. Demande un nouveau lien à l\'organisateur.');
  }
  const { name, participantId } = inv.data();
  const input = el('input', {
    type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '6',
    autocomplete: 'one-time-code', class: 'pin-input', placeholder: '••••',
    required: true, 'aria-label': 'Code PIN',
  });
  const err = el('p', { class: 'form-error' });
  const btn = el('button', { class: 'btn primary big', type: 'submit' }, 'Entrer 🎁');
  let fails = 0;

  const form = el('form', {
    onsubmit: async e => {
      e.preventDefault();
      const pin = input.value.trim();
      if (!/^\d{4,6}$/.test(pin)) { err.textContent = 'Le code PIN est composé de 4 chiffres.'; return; }
      btn.disabled = true;
      err.textContent = '';
      try {
        await setDoc(doc(db, 'members', auth.currentUser.uid), {
          participantId, token, pinHash: await hashPin(token, pin), joinedAt: serverTimestamp(),
        });
        cleanUrl();
        toast(`Bienvenue ${name} ! 🎄`);
        startApp(participantId);
      } catch (ex) {
        console.error(ex);
        fails++;
        err.textContent = ex.code === 'permission-denied'
          ? 'Code PIN incorrect, réessaie.'
          : 'Problème de connexion, réessaie.';
        input.value = '';
        await sleep(Math.min(fails, 5) * 1000); // ralentit les essais au hasard
        btn.disabled = false;
        input.focus();
      }
    },
  }, input, err, btn);

  render(app, screen('🎅', `Bonjour ${name} !`,
    'Entre ton code PIN pour accéder à la liste de Noël de la famille.', form));
  input.focus();
}

// ---------- Application ----------
function stopAll() {
  state.unsubs.forEach(u => u());
  state.unsubs = [];
  state.resUnsubs.forEach(u => u());
  state.resUnsubs.clear();
  state.resByOwner.clear();
  state.reservations.clear();
}

function onDenied(e) {
  console.error(e);
  if (e.code === 'permission-denied') revoked();
}

function revoked() {
  stopAll();
  showInviteOnly('Ton accès a été renouvelé ou retiré. Demande un nouveau lien à l\'organisateur.');
}

function startApp(pid) {
  stopAll();
  state.pid = pid;
  renderShell();

  state.unsubs.push(onSnapshot(collection(db, 'participants'), snap => {
    state.participants = new Map(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    if (!state.participants.has(pid)) return revoked();
    syncReservationListeners();
    renderUserChip(state.participants.get(pid));
    renderMain();
  }, onDenied));

  state.unsubs.push(onSnapshot(collection(db, 'wishes'), snap => {
    state.wishes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMain();
  }, onDenied));

  state.unsubs.push(onSnapshot(doc(db, 'settings', 'main'), s => {
    state.settings = s.exists() ? s.data() : {};
    if (state.settings.title) {
      $('#site-title').textContent = state.settings.title;
      document.title = state.settings.title;
    }
    refreshCountdown();
  }, e => console.warn(e)));
}

// Une écoute par personne (sauf moi) : les règles interdisent de lire les réservations de sa propre liste
function syncReservationListeners() {
  for (const [ownerId, unsub] of state.resUnsubs) {
    if (!state.participants.has(ownerId)) {
      unsub();
      state.resUnsubs.delete(ownerId);
      state.resByOwner.delete(ownerId);
    }
  }
  for (const ownerId of state.participants.keys()) {
    if (ownerId === state.pid || state.resUnsubs.has(ownerId)) continue;
    const q = query(collection(db, 'reservations'), where('ownerId', '==', ownerId));
    state.resUnsubs.set(ownerId, onSnapshot(q, snap => {
      state.resByOwner.set(ownerId, snap.docs.map(d => ({ id: d.id, ...d.data() })));
      state.reservations = new Map([...state.resByOwner.values()].flat().map(r => [r.id, r]));
      renderMain();
    }, e => console.warn(e)));
  }
}

const nameOf = id => state.participants.get(id)?.name || '???';
const emojiOf = id => state.participants.get(id)?.emoji || '🎁';
const others = () => [...state.participants.values()]
  .filter(p => p.id !== state.pid)
  .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
const byPriority = (a, b) => (b.priority || 0) - (a.priority || 0)
  || (a.createdAt?.seconds || 9e12) - (b.createdAt?.seconds || 9e12);

function renderUserChip(p) {
  const box = $('#user-chip');
  if (!p) return box.replaceChildren();
  box.replaceChildren(el('button', { class: 'user-chip', type: 'button', title: 'Mon compte', onclick: logout },
    el('span', { class: 'emoji' }, p.emoji || '🎁'),
    el('span', { class: 'name', text: p.name })));
}

async function logout() {
  const ok = await confirmDialog(
    'Te déconnecter de cet appareil ? Pour revenir, il te faudra ton lien d\'invitation et ton code PIN.',
    'Se déconnecter');
  if (!ok) return;
  stopAll();
  await deleteDoc(doc(db, 'members', auth.currentUser.uid)).catch(() => {});
  showInviteOnly('Tu es déconnecté. À bientôt ! 👋');
}

// ---------- Rendu ----------
const TABS = [['mine', '📝 Ma liste'], ['others', '🎁 Leurs listes'], ['gifts', '🛍️ Mes cadeaux']];

function renderShell() {
  render(app,
    el('nav', { class: 'tabs', role: 'tablist' },
      TABS.map(([k, label]) => el('button', {
        class: 'tab', type: 'button', role: 'tab', 'data-tab': k,
        onclick: () => { state.tab = k; renderMain(); },
      }, label))),
    el('section', { id: 'view' }, el('div', { class: 'loading' }, 'Chargement… ✨')));
}

function renderMain() {
  const view = $('#view');
  if (!view || !state.participants.size) return;
  document.querySelectorAll('.tab').forEach(t => {
    const on = t.dataset.tab === state.tab;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', String(on));
  });
  const content = state.tab === 'mine' ? viewMine() : state.tab === 'others' ? viewOthers() : viewGifts();
  view.replaceChildren(...[content].flat());
}

function emptyBox(emoji, text) {
  return el('div', { class: 'empty' }, el('div', { class: 'big-emoji' }, emoji), el('p', { text }));
}

function wishCard(w, { footer, status } = {}) {
  const url = safeUrl(w.url);
  const img = safePhoto(w.photo) || safeUrl(w.image);
  return el('article', { class: `wish-card ${status || ''}` },
    img && el('div', { class: 'wish-img' },
      el('img', { src: img, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer',
        onerror: e => e.target.parentElement.remove() })),
    el('div', { class: 'wish-body' },
      el('div', { class: 'wish-head' },
        el('h3', { text: w.title }),
        w.priority ? el('span', { class: 'prio', title: 'Niveau d\'envie', text: '⭐'.repeat(w.priority) }) : null),
      typeof w.price === 'number' && el('div', { class: 'price', text: formatPrice(w.price) }),
      w.note && el('p', { class: 'note', text: w.note }),
      url && el('a', { class: 'link', href: url, target: '_blank', rel: 'noopener noreferrer' },
        `🔗 Voir sur ${domainOf(url) || 'le site'} ↗`),
      footer));
}

// --- Ma liste ---
function viewMine() {
  const mine = state.wishes.filter(w => w.ownerId === state.pid).sort(byPriority);
  return [
    el('div', { class: 'section-head' },
      el('h2', {}, 'Ma liste'),
      el('button', { class: 'btn gold', type: 'button', onclick: () => openWishForm() }, '＋ Ajouter un souhait')),
    el('p', { class: 'hint' }, '🤫 Surprise oblige : tu ne vois pas ce que les autres ont réservé sur ta liste.'),
    mine.length
      ? el('div', { class: 'grid' }, mine.map(w => wishCard(w, {
        footer: el('div', { class: 'card-actions' },
          el('button', { class: 'btn ghost small', type: 'button', onclick: () => openWishForm(w) }, '✏️ Modifier'),
          el('button', { class: 'btn danger small', type: 'button', onclick: () => removeWish(w) }, '🗑️ Supprimer')),
      })))
      : emptyBox('🎁', 'Ta liste est vide… Ajoute ce qui te ferait plaisir !'),
  ];
}

function openWishForm(w = null) {
  openFormFor({
    wish: w,
    title: w ? 'Modifier le souhait' : 'Nouveau souhait',
    saveLabel: w ? 'Enregistrer' : 'Ajouter 🎁',
    successMsg: w ? 'Souhait modifié ✏️' : 'Souhait ajouté 🎁',
    onSave: data => (w
      ? updateDoc(doc(db, 'wishes', w.id), { ...data, updatedAt: serverTimestamp() })
      : addDoc(collection(db, 'wishes'), { ...data, ownerId: state.pid, createdAt: serverTimestamp() })),
  });
}

async function removeWish(w) {
  if (!await confirmDialog(`Supprimer « ${w.title} » de ta liste ?`, 'Supprimer')) return;
  try {
    await deleteDoc(doc(db, 'wishes', w.id));
    toast('Souhait supprimé');
  } catch (e) {
    console.error(e);
    toast('Impossible de supprimer', 'error');
  }
}

// --- Les listes des autres ---
function viewOthers() {
  const people = others();
  if (!people.length) return emptyBox('⛄', 'Personne d\'autre n\'est encore invité.');
  if (!state.selected || !state.participants.has(state.selected) || state.selected === state.pid) {
    state.selected = people[0].id;
  }
  const wishes = state.wishes.filter(w => w.ownerId === state.selected).sort(byPriority);
  const free = wishes.filter(w => !state.reservations.has(w.id)).length;

  return [
    el('div', { class: 'people' }, people.map(p => {
      const n = state.wishes.filter(w => w.ownerId === p.id).length;
      return el('button', {
        class: `person ${p.id === state.selected ? 'active' : ''}`, type: 'button',
        onclick: () => { state.selected = p.id; renderMain(); },
      }, el('span', { class: 'emoji' }, p.emoji || '🎁'), el('span', { text: p.name }), el('span', { class: 'count' }, String(n)));
    })),
    el('div', { class: 'section-head' },
      el('h2', { text: `La liste de ${nameOf(state.selected)}` }),
      wishes.length ? el('span', {}, `${wishes.length} souhait${wishes.length > 1 ? 's' : ''} · ${free} disponible${free > 1 ? 's' : ''}`) : null),
    wishes.length
      ? el('div', { class: 'grid' }, wishes.map(w => {
        const { footer, status } = reservationBox(w);
        return wishCard(w, { footer, status });
      }))
      : emptyBox('📭', `${nameOf(state.selected)} n'a encore rien ajouté à sa liste.`),
  ];
}

function reservationBox(w) {
  const r = state.reservations.get(w.id);
  if (!r) {
    const chk = el('input', { type: 'checkbox' });
    return {
      status: '',
      footer: el('div', { class: 'res-box' },
        el('span', { class: 'badge free' }, '✅ Disponible'),
        el('label', { class: 'shared-opt' }, chk, 'Cadeau commun (d\'autres pourront participer)'),
        el('button', { class: 'btn primary', type: 'button', onclick: e => reserve(w, chk.checked, e.currentTarget) }, '🎁 Je réserve')),
    };
  }
  const names = r.by.map(nameOf).join(', ');
  if (r.by.includes(state.pid)) {
    const leaveLabel = r.shared && r.by.length > 1 ? 'Je ne participe plus' : 'Annuler ma réservation';
    return {
      status: 'mine-res',
      footer: el('div', { class: 'res-box' },
        el('span', { class: 'badge mine' }, r.shared ? `🤝 Cadeau commun : ${names}` : '🎁 C\'est toi qui l\'offres !'),
        el('button', { class: 'btn ghost', type: 'button', onclick: () => unreserve(w.id, r) }, leaveLabel)),
    };
  }
  if (r.shared) {
    return {
      status: 'shared',
      footer: el('div', { class: 'res-box' },
        el('span', { class: 'badge shared' }, `🤝 Cadeau commun : ${names}`),
        el('button', { class: 'btn secondary', type: 'button', onclick: () => join(w.id) }, '🙋 Je participe aussi')),
    };
  }
  return {
    status: 'taken',
    footer: el('div', { class: 'res-box' }, el('span', { class: 'badge taken' }, `🔒 Réservé par ${names}`)),
  };
}

async function reserve(w, shared, btn) {
  if (btn) btn.disabled = true;
  try {
    await setDoc(doc(db, 'reservations', w.id), {
      ownerId: w.ownerId, by: [state.pid], shared, createdAt: serverTimestamp(),
    });
    toast(shared ? 'Cadeau commun créé 🤝' : 'Réservé ! Chut, c\'est un secret 🤫');
  } catch (e) {
    console.error(e);
    toast('Quelqu\'un vient de le réserver juste avant toi !', 'error');
    if (btn) btn.disabled = false;
  }
}

async function join(wishId) {
  try {
    await updateDoc(doc(db, 'reservations', wishId), { by: arrayUnion(state.pid) });
    toast('Tu participes au cadeau commun 🤝');
  } catch (e) {
    console.error(e);
    toast('Impossible de rejoindre ce cadeau', 'error');
  }
}

async function unreserve(wishId, r) {
  const alone = r.by.length <= 1;
  if (!await confirmDialog(alone ? 'Annuler ta réservation ? Le cadeau redeviendra disponible.' : 'Ne plus participer à ce cadeau commun ?', 'Oui')) return;
  try {
    if (alone) await deleteDoc(doc(db, 'reservations', wishId));
    else await updateDoc(doc(db, 'reservations', wishId), { by: arrayRemove(state.pid) });
    toast('C\'est noté');
  } catch (e) {
    console.error(e);
    toast('Impossible d\'annuler', 'error');
  }
}

// --- Mes cadeaux à offrir ---
function viewGifts() {
  const wishById = new Map(state.wishes.map(w => [w.id, w]));
  const mine = [...state.reservations.values()].filter(r => r.by.includes(state.pid));
  if (!mine.length) {
    return [
      el('div', { class: 'section-head' }, el('h2', {}, 'Mes cadeaux à offrir')),
      emptyBox('🛍️', 'Tu n\'as encore rien réservé. Va voir les listes des autres !'),
    ];
  }
  let total = 0;
  const groups = new Map();
  for (const r of mine) {
    const w = wishById.get(r.id);
    if (w && typeof w.price === 'number') total += w.price / r.by.length;
    if (!groups.has(r.ownerId)) groups.set(r.ownerId, []);
    groups.get(r.ownerId).push({ r, w });
  }
  return [
    el('div', { class: 'section-head' }, el('h2', {}, 'Mes cadeaux à offrir')),
    el('div', { class: 'budget' },
      el('div', { class: 'stat' }, el('b', {}, String(mine.length)), el('span', {}, `cadeau${mine.length > 1 ? 'x' : ''} réservé${mine.length > 1 ? 's' : ''}`)),
      el('div', { class: 'stat' }, el('b', {}, formatPrice(total)), el('span', {}, 'budget estimé (ta part)'))),
    el('div', { class: 'stack' }, [...groups.entries()].map(([ownerId, items]) =>
      el('div', { class: 'card gift-group' },
        el('h3', {}, el('span', {}, emojiOf(ownerId)), `Pour ${nameOf(ownerId)}`),
        items.map(({ r, w }) => {
          const url = w && safeUrl(w.url);
          const share = w && typeof w.price === 'number' ? formatPrice(w.price / r.by.length) : '';
          return el('div', { class: 'gift-row' },
            el('div', { class: 'info' },
              w ? el('strong', { text: w.title }) : el('strong', { class: 'warn' }, '⚠️ Ce souhait a été retiré de sa liste'),
              el('small', {}, [
                r.shared ? `Cadeau commun avec ${r.by.filter(id => id !== state.pid).map(nameOf).join(', ') || 'personne pour l\'instant'}` : 'Cadeau perso',
                share ? ` · ta part : ${share}` : '',
              ].join(''))),
            url && el('a', { class: 'btn ghost small', href: url, target: '_blank', rel: 'noopener noreferrer' }, '🔗 Lien'),
            el('button', { class: 'btn danger small', type: 'button', onclick: () => unreserve(r.id, r) }, w ? 'Annuler' : 'Retirer'));
        })))),
  ];
}
