# Photos de bons de livraison

DS Restauration n'envoie pas de BL par mail : à la livraison, il n'y a qu'un
papier. Tant qu'il n'est pas saisi, l'appli n'a rien à comparer aux factures qui
arrivent trois semaines plus tard — c'est le vrai trou de la chaîne.

La photo bouche ce trou, à condition qu'elle atterrisse quelque part où on peut
la lire.

## La chaîne

```
Le serveur photographie le BL à la réception
        │  mail à braiseandcobiganos@gmail.com, « BL » dans l'objet
        ▼
Gmail
        │  gmail-vers-drive.gs, toutes les 15 min
        ▼
Drive  /BL/2026-09-22/2026-09-22_1136_<id-du-mail>.jpg
        │  Google Drive pour ordinateur
        ▼
PC du restaurant
        │  Claude Code au démarrage, suit routine-reception.md
        ▼
Réception enregistrée dans l'appli Cuisine
```

Le détour par le PC n'est pas un caprice : le connecteur Gmail ne rend que la
fiche d'une pièce jointe, jamais l'image, et le connecteur Drive ne voit que les
fichiers qu'il a lui-même créés. Sur le PC, le fichier est un fichier : Claude
Code l'ouvre vraiment. C'est aussi ce qui donne la meilleure lecture — un BL
froissé et photographié de travers se lit à l'œil, pas au motif régulier.

## Installation

### 1. Le script Gmail → Drive

1. [script.google.com](https://script.google.com) → **Nouveau projet**, avec le
   compte qui reçoit les mails.
2. Coller `gmail-vers-drive.gs`, enregistrer.
3. Lancer `rangerLesBl` une fois à la main : Google demande les autorisations
   Gmail et Drive, les accorder.
4. Lancer `installerDeclencheur` une fois : le script tournera ensuite tout seul
   toutes les 15 minutes.

Le nom de chaque fichier porte l'identifiant du mail d'origine : relancer le
script ne crée jamais de doublon, et on peut toujours remonter du fichier au
mail.

### 2. La synchronisation

Installer **Google Drive pour ordinateur** sur le PC et rendre `Mon Drive`
disponible hors connexion, au moins pour le dossier `BL`. Sans ça, Windows ne
voit qu'un raccourci et Claude Code n'ouvrira rien.

### 3. La routine au démarrage

Planificateur de tâches Windows → nouvelle tâche, déclencheur « à l'ouverture de
session », action : lancer Claude Code dans ce dépôt en lui donnant
`bl-photos/routine-reception.md` comme consigne.

Le PC a besoin du connecteur Supabase pour écrire les réceptions.

## Ce que la routine ne fera jamais

Écrire une réception dont elle n'est pas sûre. Trois contrôles arithmétiques
doivent passer — prix × quantité, somme contre sous-total, recoupement d'au moins
deux prix de fiches — et la commande doit être identifiée sans ambiguïté. Sinon
elle s'abstient et le signale dans son récap.

Elle rend compte tous les jours, **même quand il n'y a rien**. Le silence doit
vouloir dire « la chaîne est cassée », jamais « rien à signaler ».

## Limites connues

- Rien ne se passe si le PC reste éteint. Les photos s'empilent dans Drive et
  seront traitées à la prochaine ouverture de session, mais les écarts sont
  signalés d'autant plus tard.
- Quatre maillons peuvent casser en silence, d'où le récap quotidien.
- Si le PC finit par être trop souvent éteint, la solution qui ne dépend de rien
  est un bouton « photo du BL » dans l'écran Réception, la photo partant dans le
  bucket `factures` et lue côté serveur par une edge function. Environ 1 à
  2 centimes la photo, et plus besoin ni du mail, ni de Drive, ni du PC.

## Cadrage des photos

Cadrer large à gauche : sur le BL du 22/09/2026, le premier chiffre de chaque
code produit était coupé. La lecture s'en est sortie par déduction, mais c'est
une fragilité gratuite. Une photo par BL, à plat, sans ombre portée sur le
tableau des lignes.
