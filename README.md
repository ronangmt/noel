# 🎄 Liste de Noël en famille

Un petit site pour que chacun fasse sa liste de Noël et réserve les cadeaux des autres. Les réservations restent secrètes pour la personne qui reçoit le cadeau.

- **Accès uniquement sur invitation** : chaque personne reçoit un lien personnel et un code PIN.
- **Effet surprise** : on ne voit jamais ce qui est réservé sur sa propre liste. C'est la base de données qui l'interdit, pas seulement l'affichage.
- **Cadeaux communs** : plusieurs personnes peuvent participer au même cadeau.
- **Espace organisateur** (`admin.html`) : inviter ou retirer des participants, changer un PIN, couper un accès, corriger les listes.
- Flocons qui tombent ❄️ (bouton pour les couper), compte à rebours, responsive téléphone et tablette.

Hébergement : **GitHub Pages** (gratuit). Données : **Firebase** (gratuit à cette échelle).

---

## Mise en place (environ 15 minutes, une seule fois)

### 1. Créer le projet Firebase
1. Va sur https://console.firebase.google.com et connecte-toi avec un compte Google.
2. **Ajouter un projet** → donne-lui un nom (ex. `noel-famille`). Tu peux désactiver Google Analytics.
3. Sur la page d'accueil du projet, clique sur l'icône **`</>`** (application Web) → donne un nom → **Enregistrer**.
4. Firebase affiche un bloc `const firebaseConfig = { ... }`. Copie ces valeurs dans **`js/firebase-config.js`** à la place des `REMPLACE_MOI`.

### 2. Activer la connexion
1. Menu **Build › Authentication** → **Commencer**.
2. Onglet **Mode de connexion** : active **Anonyme** (utilisé par la famille) et **Adresse e-mail/Mot de passe** (pour toi seul).
3. Onglet **Utilisateurs** → **Ajouter un utilisateur** : ton email + un mot de passe solide. C'est ton compte organisateur.
4. Copie l'**UID** de cet utilisateur (colonne « UID utilisateur »).

### 3. Créer la base de données
1. Menu **Build › Firestore Database** → **Créer une base de données** → emplacement en Europe (ex. `europe-west9 (Paris)`) → **mode production**.
2. Onglet **Règles** : remplace tout par le contenu du fichier **`firestore.rules`** → **Publier**.
3. Onglet **Données** → **Commencer une collection** :
   - ID de la collection : `admins`
   - ID du document : **colle ton UID** (étape 2.4)
   - Ajoute un champ `role` (type string) = `admin` → **Enregistrer**

   👉 C'est ce document qui te donne, à toi seul, les droits d'organisateur.

### 4. Mettre le site en ligne sur GitHub Pages
1. Sur https://github.com, crée un dépôt (ex. `noel`).
2. Envoie-y tous les fichiers de ce dossier (bouton **Add file › Upload files**, puis glisse `index.html`, `admin.html`, `README.md`, `firestore.rules` et les dossiers `css` et `js`).
3. **Settings › Pages** → Source : **Deploy from a branch**, branche `main`, dossier `/ (root)` → **Save**.
4. Après 1 à 2 minutes, le site est en ligne sur `https://TON-PSEUDO.github.io/noel/`.
5. Retourne dans Firebase : **Authentication › Paramètres › Domaines autorisés** → **Ajouter un domaine** → `TON-PSEUDO.github.io`.

### 5. Inviter la famille
1. Ouvre `https://TON-PSEUDO.github.io/noel/admin.html` et connecte-toi.
2. **Inviter quelqu'un** pour chacun des participants, **toi compris**.
3. Pour chaque personne, une fenêtre affiche un message tout prêt avec son lien et son PIN : **Copier** ou **Partager** (SMS, WhatsApp…).
4. Ouvre ton propre lien pour faire ta liste comme les autres.

> ⚠️ Le PIN n'est affiché qu'une seule fois. S'il est perdu : **🔑 Nouveau PIN**.

---

## Utilisation au quotidien

| Situation | Que faire dans l'espace organisateur |
|---|---|
| Quelqu'un a perdu son PIN | 🔑 **Nouveau PIN** (le lien reste le même) |
| Un lien a circulé par erreur | ♻️ **Renouveler** : nouveau lien + nouveau PIN, tous ses appareils sont déconnectés, sa liste est conservée |
| Retirer quelqu'un | 🗑️ : supprime sa liste, ses réservations et son accès |
| Corriger une réservation | Onglet **Listes** → coche « Afficher les réservations » (attention, ça te dévoile tes propres cadeaux !) |
| Changer le titre ou la date | Onglet **Réglages** |

Une fois son lien ouvert et son PIN validé, chacun reste connecté sur son téléphone. Le lien et le PIN ne servent à nouveau que sur un autre appareil.

---

## Sécurité, en bref
- Le code du site est public (GitHub), mais **les données sont protégées par les règles Firestore** :
  - sans lien valide + bon PIN, impossible de lire quoi que ce soit ;
  - personne ne peut lire les réservations faites sur sa propre liste ;
  - on ne peut modifier que sa propre liste, et on ne peut ajouter ou retirer que soi-même d'une réservation ;
  - seul ton compte (déclaré dans `admins`) peut gérer les participants.
- La configuration Firebase dans `js/firebase-config.js` n'est **pas** un secret, c'est normal qu'elle soit visible.
- Le site demande aux moteurs de recherche de ne pas l'indexer.

## Tester sur ton ordinateur (facultatif)
Les modules JavaScript ne marchent pas en double-cliquant sur `index.html`. Il faut lancer un petit serveur dans le dossier :

```powershell
python -m http.server 8000
```

puis ouvrir http://localhost:8000. Pense à ajouter `localhost` dans les domaines autorisés Firebase s'il n'y est pas déjà.

## Structure
```
index.html          page famille
admin.html          espace organisateur
css/style.css       thème de Noël + responsive
js/app.js           logique famille (invitation, listes, réservations)
js/admin.js         logique organisateur
js/common.js        outils partagés
js/snow.js          flocons
js/firebase.js      initialisation Firebase
js/firebase-config.js   ⚠️ à remplir avec ta config
firestore.rules     règles de sécurité à coller dans Firebase
```
