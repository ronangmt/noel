// Formulaire d'un souhait (ajout / modification), partagé entre la page famille et l'espace admin
import { el, safeUrl, compressImage, safePhoto, openModal, toast } from './common.js';

/**
 * @param {object} opts
 * @param {object|null} opts.wish   souhait existant (null pour un nouveau)
 * @param {string} opts.title       titre de la fenêtre
 * @param {string} opts.saveLabel   texte du bouton d'enregistrement
 * @param {string} opts.successMsg  message affiché après enregistrement
 * @param {(data: object) => Promise<void>} opts.onSave  enregistre les données (lève une erreur si échec)
 */
export function openWishForm({ wish: w = null, title, saveLabel, successMsg, onSave }) {
  const f = {
    title: el('input', { type: 'text', required: true, maxlength: '150', value: w?.title || '', placeholder: 'Ex : Un pull tout doux' }),
    url: el('input', { type: 'url', maxlength: '2000', value: w?.url || '', placeholder: 'https://…' }),
    price: el('input', { type: 'number', min: '0', step: '0.01', inputmode: 'decimal', value: w?.price ?? '', placeholder: '25' }),
    priority: el('select', {},
      el('option', { value: '1' }, '⭐ Ça me ferait plaisir'),
      el('option', { value: '2' }, '⭐⭐ J\'aimerais beaucoup'),
      el('option', { value: '3' }, '⭐⭐⭐ Mon rêve !')),
    image: el('input', { type: 'url', maxlength: '2000', value: w?.image || '', placeholder: 'https://…/image.jpg' }),
    note: el('textarea', { maxlength: '500', placeholder: 'Taille, couleur, modèle…' }),
  };
  f.priority.value = String(w?.priority || 1);
  f.note.value = w?.note || '';
  const err = el('p', { class: 'form-error' });

  // --- Photo depuis le téléphone (appareil photo ou galerie), réduite automatiquement ---
  let photo = safePhoto(w?.photo) || '';
  const fileInput = el('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', tabindex: '-1' });
  const preview = el('div', { class: 'photo-preview' });
  const pickBtn = el('button', { class: 'btn secondary', type: 'button', onclick: () => fileInput.click() });
  const drawPhoto = () => {
    pickBtn.textContent = photo ? '📷 Changer la photo' : '📷 Prendre / choisir une photo';
    preview.replaceChildren(...(photo ? [
      el('img', { src: photo, alt: 'Aperçu de la photo' }),
      el('button', { class: 'btn danger small', type: 'button', onclick: () => { photo = ''; drawPhoto(); } }, '✕ Retirer'),
    ] : []));
  };
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    pickBtn.disabled = true;
    pickBtn.textContent = '⏳ Préparation de la photo…';
    err.textContent = '';
    try {
      photo = await compressImage(file);
    } catch (ex) {
      console.error(ex);
      err.textContent = 'Impossible d\'utiliser cette photo, essaies-en une autre.';
    }
    pickBtn.disabled = false;
    drawPhoto();
  });
  drawPhoto();

  // --- Aperçu de l'image par lien ---
  const linkPreview = el('div', { class: 'photo-preview' });
  const drawLink = () => {
    const src = safeUrl(f.image.value.trim());
    linkPreview.replaceChildren(...(src ? [
      el('img', { src, alt: 'Aperçu de l\'image', referrerpolicy: 'no-referrer', onerror: e => e.target.remove() }),
      el('button', { class: 'btn danger small', type: 'button', onclick: () => { f.image.value = ''; drawLink(); } }, '✕ Retirer'),
    ] : []));
  };
  f.image.addEventListener('change', drawLink);
  drawLink();

  const save = el('button', { class: 'btn primary', type: 'submit' }, saveLabel);

  const form = el('form', {
    class: 'form',
    onsubmit: async e => {
      e.preventDefault();
      const url = f.url.value.trim();
      const image = f.image.value.trim();
      if (url && !safeUrl(url)) { err.textContent = 'Le lien doit commencer par https://'; return; }
      if (image && !safeUrl(image)) { err.textContent = 'Le lien de l\'image doit commencer par https://'; return; }
      const data = {
        title: f.title.value.trim(),
        url, image,
        price: f.price.value === '' ? null : Math.round(Number(f.price.value) * 100) / 100,
        note: f.note.value.trim(),
        priority: Number(f.priority.value),
      };
      // le champ photo n'est envoyé que s'il y a (ou s'il y avait) une photo
      if (photo || w?.photo) data.photo = photo;
      if (!data.title) { err.textContent = 'Donne un nom à ce souhait.'; return; }
      save.disabled = true;
      try {
        await onSave(data);
        m.close();
        toast(successMsg);
      } catch (ex) {
        console.error(ex);
        err.textContent = 'Impossible d\'enregistrer. Réessaie.';
        save.disabled = false;
      }
    },
  },
  el('label', {}, 'Qu\'est-ce qui ferait plaisir ? *', f.title),
  el('label', {}, 'Lien vers le produit', f.url),
  el('div', { class: 'form-row' },
    el('label', {}, 'Prix indicatif (€)', f.price),
    el('label', {}, 'Niveau d\'envie', f.priority)),
  el('div', { class: 'photo-field' },
    el('span', { class: 'field-title' }, 'Photo'),
    pickBtn, fileInput, preview),
  el('label', {}, el('span', {}, 'ou lien d\'une image ', el('small', {}, '(clic droit sur une photo > « Copier l\'adresse de l\'image »)')), f.image),
  linkPreview,
  el('label', {}, 'Précisions', f.note),
  err,
  el('div', { class: 'modal-actions' },
    el('button', { class: 'btn ghost', type: 'button', onclick: () => m.close() }, 'Annuler'),
    save));

  const m = openModal(title, form);
  f.title.focus();
}
