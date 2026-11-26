// Espace organisateur : participants, invitations, modération des listes, réglages
import { initFirebase, isConfigured } from './firebase.js';
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where,
  onSnapshot, serverTimestamp, writeBatch, arrayRemove,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  $, el, render, safeUrl, formatPrice, hashPin, randomToken, randomPin, toast,
  openModal, confirmDialog, promptDialog, copyText, startCountdown, screen, EMOJIS, safePhoto,
} from './common.js';
import { openWishForm } from './wishform.js';
import { startSnow } from './snow.js';

startSnow($('#snow-toggle'));

const app = $('#app');
const state = {
  participants: [], invites: [], wishes: [], reservations: [], members: [], settings: {},
  tab: 'people', spoilers: false, unsubs: [],
};
const refreshCountdown = startCountdown(() => state.settings.christmasDate);
let auth, db;

if (!isConfigured) {
  render(app, screen('🛠️', 'Site pas encore configuré', 'Renseigne js/firebase-config.js (voir README.md).'));
} else {
  ({ auth, db } = initFirebase('admin'));
  onAuthStateChanged(auth, async user => {
    stopAll();
    if (!user || user.isAnonymous) return showLogin();
    const adminDoc = await getDoc(doc(db, 'admins', user.uid)).catch(() => null);
    if (!adminDoc || !adminDoc.exists()) return showNotAdmin(user);
    startAdmin(user);
  });
}

function stopAll() {
  state.unsubs.forEach(u => u());
  state.unsubs = [];
}

// ---------- Connexion ----------
function showLogin() {
  $('#user-chip').replaceChildren();
  const email = el('input', { type: 'email', required: true, autocomplete: 'username' });
  const pass = el('input', { type: 'password', required: true, autocomplete: 'current-password' });
  const err = el('p', { class: 'form-error' });
  const btn = el('button', { class: 'btn primary big', type: 'submit' }, 'Se connecter');
  const form = el('form', {
    class: 'form',
    onsubmit: async e => {
      e.preventDefault();
      btn.disabled = true;
      err.textContent = '';
      try {
        await signInWithEmailAndPassword(auth, email.value.trim(), pass.value);
      } catch (ex) {
        console.error(ex);
        err.textContent = 'Email ou mot de passe incorrect.';
        btn.disabled = false;
      }
    },
  },
  el('label', {}, 'Email', email),
  el('label', {}, 'Mot de passe', pass),
  err, btn,
  el('button', {
    class: 'btn ghost small', type: 'button',
    onclick: async () => {
      if (!email.value.trim()) { err.textContent = 'Tape ton email d\'abord.'; return; }
      try {
        await sendPasswordResetEmail(auth, email.value.trim());
        toast('Email de réinitialisation envoyé 📧');
      } catch { toast('Impossible d\'envoyer l\'email', 'error'); }
    },
  }, 'Mot de passe oublié ?'));
  render(app, screen('⭐', 'Espace organisateur', 'Connexion réservée à l\'organisateur.', form));
  email.focus();
}

function showNotAdmin(user) {
  render(app, screen('🚫', 'Compte non administrateur',
    'Ce compte n\'est pas encore déclaré comme admin. Si c\'est bien toi, crée dans Firestore la collection « admins » avec un document dont l\'identifiant est :',
    el('p', {}, el('span', { class: 'mono', text: user.uid })),
    el('div', { class: 'modal-actions' },
      el('button', { class: 'btn ghost', type: 'button', onclick: () => copyText(user.uid) }, '📋 Copier'),
      el('button', { class: 'btn primary', type: 'button', onclick: () => signOut(auth) }, 'Se déconnecter'))));
}

// ---------- Tableau de bord ----------
function startAdmin(user) {
  $('#user-chip').replaceChildren(el('button', {
    class: 'user-chip', type: 'button', title: user.email,
    onclick: async () => { if (await confirmDialog('Se déconnecter de l\'espace organisateur ?', 'Se déconnecter', false)) signOut(auth); },
  }, el('span', { class: 'emoji' }, '⭐'), el('span', { class: 'name' }, 'Admin')));

  render(app,
    el('nav', { class: 'tabs', role: 'tablist' },
      [['people', '👥 Participants'], ['lists', '📋 Listes'], ['settings', '⚙️ Réglages']].map(([k, label]) =>
        el('button', { class: 'tab', type: 'button', role: 'tab', 'data-tab': k, onclick: () => { state.tab = k; renderMain(); } }, label))),
    el('section', { id: 'view' }, el('div', { class: 'loading' }, 'Chargement… ✨')));

  const watch = (name, key) => state.unsubs.push(onSnapshot(collection(db, name), snap => {
    state[key] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMain();
  }, e => { console.error(e); toast(`Accès refusé à « ${name} » : vérifie les règles Firestore`, 'error'); }));
  watch('participants', 'participants');
  watch('invites', 'invites');
  watch('wishes', 'wishes');
  watch('reservations', 'reservations');
  watch('members', 'members');
  state.unsubs.push(onSnapshot(doc(db, 'settings', 'main'), s => {
    state.settings = s.exists() ? s.data() : {};
    refreshCountdown();
    if (state.tab !== 'settings') renderMain();
  }));
}

const sortedPeople = () => [...state.participants].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
const personById = id => state.participants.find(p => p.id === id);
const nameOf = id => personById(id)?.name || '???';
const tokenOf = pid => state.invites.find(i => i.participantId === pid)?.id;
const inviteUrl = token => new URL(`./?i=${token}`, location.href).href;

function renderMain() {
  const view = $('#view');
  if (!view) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === state.tab));
  const content = state.tab === 'people' ? viewPeople() : state.tab === 'lists' ? viewLists() : viewSettings();
  view.replaceChildren(...[content].flat());
}

// ---------- Participants ----------
function viewPeople() {
  const people = sortedPeople();
  return [
    el('div', { class: 'section-head' },
      el('h2', {}, 'Participants'),
      el('button', { class: 'btn gold', type: 'button', onclick: openAddPerson }, '＋ Inviter quelqu\'un')),
    el('p', { class: 'hint' }, '💡 Pense à t\'ajouter toi aussi comme participant, puis ouvre ton propre lien pour faire ta liste.'),
    people.length
      ? el('div', { class: 'admin-list' }, people.map(p => {
        const devices = state.members.filter(m => m.participantId === p.id).length;
        const nWishes = state.wishes.filter(w => w.ownerId === p.id).length;
        const token = tokenOf(p.id);
        return el('div', { class: 'card admin-row' },
          el('div', { class: 'who' },
            el('span', { class: 'emoji' }, p.emoji || '🎁'),
            el('div', {},
              el('strong', { text: p.name }),
              el('small', {}, `${devices ? `📱 connecté sur ${devices} appareil${devices > 1 ? 's' : ''}` : '⏳ pas encore connecté'} · ${nWishes} souhait${nWishes > 1 ? 's' : ''}`))),
          el('div', { class: 'actions' },
            token && el('button', { class: 'btn secondary small', type: 'button', onclick: () => copyText(inviteUrl(token)) }, '📋 Lien'),
            el('button', { class: 'btn ghost small', type: 'button', onclick: () => editPerson(p) }, '✏️ Modifier'),
            el('button', { class: 'btn ghost small', type: 'button', onclick: () => newPin(p) }, '🔑 Nouveau PIN'),
            el('button', { class: 'btn ghost small', type: 'button', onclick: () => renewAccess(p) }, '♻️ Renouveler'),
            el('button', { class: 'btn danger small', type: 'button', onclick: () => removePerson(p) }, '🗑️')));
      }))
      : el('div', { class: 'empty' }, el('div', { class: 'big-emoji' }, '👪'), el('p', {}, 'Aucun participant. Commence par inviter la famille !')),
  ];
}

function emojiPicker(initial) {
  let value = initial;
  const box = el('div', { class: 'emoji-pick' });
  const draw = () => box.replaceChildren(...EMOJIS.map(e => el('button', {
    type: 'button', class: e === value ? 'active' : '', 'aria-label': e,
    onclick: () => { value = e; draw(); },
  }, e)));
  draw();
  return { box, get value() { return value; } };
}

function showInvite(name, token, pin, title = 'Invitation prête ! 🎉') {
  const url = inviteUrl(token);
  const message = `🎄 Coucou ${name} !\n\nVoici ton invitation pour notre liste de Noël en famille :\n${url}\n\nTon code PIN : ${pin}\n\nAjoute tes envies et réserve les cadeaux des autres. Chut, c'est secret ! 🤫`;
  const area = el('textarea', { readonly: true });
  area.value = message;
  const m = openModal(title,
    el('p', {}, `Envoie ce message à ${name} (SMS, WhatsApp…). Note bien le PIN : il ne sera plus affiché ensuite.`),
    el('div', { class: 'pin-show', text: pin }),
    el('div', { class: 'invite-box' }, area),
    el('div', { class: 'modal-actions' },
      navigator.share && el('button', {
        class: 'btn secondary', type: 'button',
        onclick: () => navigator.share({ text: message }).catch(() => {}),
      }, '📤 Partager'),
      el('button', { class: 'btn primary', type: 'button', onclick: () => copyText(message) }, '📋 Copier le message'),
      el('button', { class: 'btn ghost', type: 'button', onclick: () => m.close() }, 'Fermer')));
}

function openAddPerson() {
  const name = el('input', { type: 'text', required: true, maxlength: '40', placeholder: 'Prénom' });
  const pin = el('input', { type: 'text', required: true, inputmode: 'numeric', pattern: '[0-9]{4}', maxlength: '4', value: randomPin() });
  const pick = emojiPicker(EMOJIS[Math.floor(Math.random() * EMOJIS.length)]);
  const err = el('p', { class: 'form-error' });
  const save = el('button', { class: 'btn primary', type: 'submit' }, 'Créer l\'invitation');
  const form = el('form', {
    class: 'form',
    onsubmit: async e => {
      e.preventDefault();
      const n = name.value.trim();
      if (!n) return;
      if (!/^\d{4}$/.test(pin.value)) { err.textContent = 'Le PIN doit faire 4 chiffres.'; return; }
      if (state.participants.some(p => p.name.toLowerCase() === n.toLowerCase())) { err.textContent = 'Ce prénom existe déjà.'; return; }
      save.disabled = true;
      try {
        const pRef = doc(collection(db, 'participants'));
        const token = randomToken();
        const b = writeBatch(db);
        b.set(pRef, { name: n, emoji: pick.value, createdAt: serverTimestamp() });
        b.set(doc(db, 'invites', token), { participantId: pRef.id, name: n, createdAt: serverTimestamp() });
        b.set(doc(db, 'pins', token), { hash: await hashPin(token, pin.value) });
        await b.commit();
        m.close();
        showInvite(n, token, pin.value);
      } catch (ex) {
        console.error(ex);
        err.textContent = 'Erreur lors de la création.';
        save.disabled = false;
      }
    },
  },
  el('label', {}, 'Prénom', name),
  el('label', {}, 'Avatar', pick.box),
  el('label', {}, el('span', {}, 'Code PIN ', el('small', {}, '(4 chiffres, généré au hasard)')), pin),
  err,
  el('div', { class: 'modal-actions' },
    el('button', { class: 'btn ghost', type: 'button', onclick: () => m.close() }, 'Annuler'), save));
  const m = openModal('Inviter quelqu\'un', form);
  name.focus();
}

function editPerson(p) {
  const name = el('input', { type: 'text', required: true, maxlength: '40', value: p.name });
  const pick = emojiPicker(p.emoji || EMOJIS[0]);
  const form = el('form', {
    class: 'form',
    onsubmit: async e => {
      e.preventDefault();
      const n = name.value.trim();
      if (!n) return;
      try {
        const b = writeBatch(db);
        b.update(doc(db, 'participants', p.id), { name: n, emoji: pick.value });
        state.invites.filter(i => i.participantId === p.id).forEach(i => b.update(doc(db, 'invites', i.id), { name: n }));
        await b.commit();
        m.close();
        toast('Participant modifié');
      } catch (ex) { console.error(ex); toast('Erreur', 'error'); }
    },
  },
  el('label', {}, 'Prénom', name),
  el('label', {}, 'Avatar', pick.box),
  el('div', { class: 'modal-actions' },
    el('button', { class: 'btn ghost', type: 'button', onclick: () => m.close() }, 'Annuler'),
    el('button', { class: 'btn primary', type: 'submit' }, 'Enregistrer')));
  const m = openModal(`Modifier ${p.name}`, form);
}

async function newPin(p) {
  const token = tokenOf(p.id);
  if (!token) return toast('Pas de lien pour ce participant : utilise « Renouveler »', 'error');
  if (!await confirmDialog(`Générer un nouveau PIN pour ${p.name} ? Le lien reste le même et les appareils déjà connectés restent connectés.`, 'Nouveau PIN', false)) return;
  const pin = randomPin();
  try {
    await setDoc(doc(db, 'pins', token), { hash: await hashPin(token, pin) });
    showInvite(p.name, token, pin, 'Nouveau PIN 🔑');
  } catch (e) { console.error(e); toast('Erreur', 'error'); }
}

async function renewAccess(p) {
  if (!await confirmDialog(`Renouveler l'accès de ${p.name} ? L'ancien lien ne marchera plus et tous ses appareils seront déconnectés. Sa liste est conservée.`, 'Renouveler')) return;
  try {
    const b = writeBatch(db);
    state.invites.filter(i => i.participantId === p.id).forEach(i => {
      b.delete(doc(db, 'invites', i.id));
      b.delete(doc(db, 'pins', i.id));
    });
    state.members.filter(m => m.participantId === p.id).forEach(m => b.delete(doc(db, 'members', m.id)));
    const token = randomToken();
    const pin = randomPin();
    b.set(doc(db, 'invites', token), { participantId: p.id, name: p.name, createdAt: serverTimestamp() });
    b.set(doc(db, 'pins', token), { hash: await hashPin(token, pin) });
    await b.commit();
    showInvite(p.name, token, pin, 'Nouvel accès ♻️');
  } catch (e) { console.error(e); toast('Erreur', 'error'); }
}

async function removePerson(p) {
  if (!await confirmDialog(`Retirer ${p.name} ? Sa liste, ses réservations et son accès seront définitivement supprimés.`, 'Supprimer définitivement')) return;
  try {
    const b = writeBatch(db);
    b.delete(doc(db, 'participants', p.id));
    state.invites.filter(i => i.participantId === p.id).forEach(i => {
      b.delete(doc(db, 'invites', i.id));
      b.delete(doc(db, 'pins', i.id));
    });
    state.members.filter(m => m.participantId === p.id).forEach(m => b.delete(doc(db, 'members', m.id)));
    state.wishes.filter(w => w.ownerId === p.id).forEach(w => b.delete(doc(db, 'wishes', w.id)));
    state.reservations.forEach(r => {
      if (r.ownerId === p.id) b.delete(doc(db, 'reservations', r.id));
      else if (r.by?.includes(p.id)) {
        if (r.by.length <= 1) b.delete(doc(db, 'reservations', r.id));
        else b.update(doc(db, 'reservations', r.id), { by: arrayRemove(p.id) });
      }
    });
    await b.commit();
    toast(`${p.name} a été retiré`);
  } catch (e) { console.error(e); toast('Erreur lors de la suppression', 'error'); }
}

// ---------- Listes ----------
function viewLists() {
  const resById = new Map(state.reservations.map(r => [r.id, r]));
  const wishIds = new Set(state.wishes.map(w => w.id));
  const orphans = state.reservations.filter(r => !wishIds.has(r.id));
  const spoilToggle = el('input', {
    type: 'checkbox',
    onchange: e => { state.spoilers = e.target.checked; renderMain(); },
  });
  spoilToggle.checked = state.spoilers;

  return [
    el('div', { class: 'section-head' },
      el('h2', {}, 'Toutes les listes'),
      el('label', { class: 'toggle-line' }, spoilToggle, '👀 Afficher les réservations (spoiler !)')),
    !state.spoilers && el('p', { class: 'hint' }, '🤫 Les réservations sont masquées pour ne pas te gâcher la surprise. Coche la case si tu dois corriger une erreur.'),
    el('div', { class: 'stack' }, sortedPeople().map(p => {
      const wishes = state.wishes.filter(w => w.ownerId === p.id);
      return el('div', { class: 'card gift-group' },
        el('h3', {}, el('span', {}, p.emoji || '🎁'), p.name, el('small', {}, ` · ${wishes.length} souhait${wishes.length > 1 ? 's' : ''}`)),
        wishes.length ? wishes.map(w => {
          const r = resById.get(w.id);
          const url = safeUrl(w.url);
          const pic = safePhoto(w.photo) || safeUrl(w.image);
          return el('div', { class: 'gift-row' },
            pic
              ? el('img', { class: 'thumb', src: pic, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: e => e.target.replaceWith(el('span', { class: 'thumb empty-thumb' }, '⚠️')) })
              : el('span', { class: 'thumb empty-thumb' }, '🎁'),
            el('div', { class: 'info' },
              el('strong', { text: w.title }),
              el('small', {}, [
                typeof w.price === 'number' ? formatPrice(w.price) : '',
                state.spoilers ? (r ? `🔒 ${r.shared ? 'Commun' : 'Réservé'} : ${r.by.map(nameOf).join(', ')}` : '✅ Libre') : '',
              ].filter(Boolean).join(' · '))),
            url && el('a', { class: 'btn ghost small', href: url, target: '_blank', rel: 'noopener noreferrer' }, '🔗'),
            el('button', { class: 'btn ghost small', type: 'button', onclick: () => editWish(w) }, '✏️ Modifier'),
            state.spoilers && r && el('button', { class: 'btn ghost small', type: 'button', onclick: () => cancelReservation(r, w.title) }, 'Annuler résa'),
            el('button', { class: 'btn danger small', type: 'button', onclick: () => deleteWish(w, r) }, '🗑️'));
        }) : el('p', { class: 'note' }, 'Liste vide.'));
    })),
    state.spoilers && orphans.length && el('div', { class: 'card gift-group', style: 'margin-top:16px' },
      el('h3', {}, '⚠️ Réservations de souhaits supprimés'),
      orphans.map(r => el('div', { class: 'gift-row' },
        el('div', { class: 'info' }, el('strong', {}, `Pour ${nameOf(r.ownerId)}`), el('small', {}, `par ${r.by.map(nameOf).join(', ')}`)),
        el('button', { class: 'btn danger small', type: 'button', onclick: () => cancelReservation(r, 'ce souhait supprimé') }, 'Nettoyer')))),
  ];
}

function editWish(w) {
  openWishForm({
    wish: w,
    title: `Souhait de ${nameOf(w.ownerId)}`,
    saveLabel: 'Enregistrer',
    successMsg: 'Souhait modifié ✏️',
    onSave: data => updateDoc(doc(db, 'wishes', w.id), { ...data, updatedAt: serverTimestamp() }),
  });
}

async function cancelReservation(r, title) {
  if (!await confirmDialog(`Annuler la réservation de « ${title} » ?`, 'Annuler la réservation')) return;
  try { await deleteDoc(doc(db, 'reservations', r.id)); toast('Réservation annulée'); } catch (e) { console.error(e); toast('Erreur', 'error'); }
}

async function deleteWish(w, r) {
  if (!await confirmDialog(`Supprimer « ${w.title} » de la liste de ${nameOf(w.ownerId)} ?`, 'Supprimer')) return;
  try {
    const b = writeBatch(db);
    b.delete(doc(db, 'wishes', w.id));
    if (r) b.delete(doc(db, 'reservations', r.id));
    await b.commit();
    toast('Souhait supprimé');
  } catch (e) { console.error(e); toast('Erreur', 'error'); }
}

// ---------- Réglages ----------
function viewSettings() {
  const title = el('input', { type: 'text', maxlength: '40', value: state.settings.title || '', placeholder: 'Noël en famille' });
  const date = el('input', { type: 'date', value: state.settings.christmasDate || `${new Date().getFullYear()}-12-25` });
  const form = el('form', {
    class: 'form',
    onsubmit: async e => {
      e.preventDefault();
      try {
        await setDoc(doc(db, 'settings', 'main'), {
          title: title.value.trim() || 'Noël en famille',
          christmasDate: date.value || `${new Date().getFullYear()}-12-25`,
        });
        toast('Réglages enregistrés ⚙️');
      } catch (ex) { console.error(ex); toast('Erreur', 'error'); }
    },
  },
  el('label', {}, 'Titre du site', title),
  el('label', {}, 'Date du compte à rebours', date),
  el('div', { class: 'modal-actions' }, el('button', { class: 'btn primary', type: 'submit' }, 'Enregistrer')));

  return [
    el('div', { class: 'section-head' }, el('h2', {}, 'Réglages')),
    el('div', { class: 'card' }, form),
  ];
}
