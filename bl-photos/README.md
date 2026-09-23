# Photos de bons de livraison

DS Restauration n'envoie pas de BL par mail : à la livraison, il n'y a qu'un
papier. Tant qu'il n'est pas saisi, l'appli n'a rien à comparer aux factures qui
arrivent trois semaines plus tard — c'est le vrai trou de la chaîne.

La photo bouche ce trou, à condition qu'elle atterrisse quelque part où on peut
la lire.

## La chaîne

```
Le serveur ouvre la commande et appuie sur « 📷 Prendre photo »
        │  la photo part dans le stockage de l'appli, rattachée à la commande
        ▼                                    ┌─ ou, en secours : mail à la boîte
Supabase (bucket factures)                   │   du restaurant, « BL » dans l'objet
        │                                    ▼
        └──────────► gmail-vers-drive.gs ◄── Gmail
                     toutes les 15 min
                             │
                             ▼
              Drive  /BL/2026-09-23/BC260920-02_1790152339379.jpg
                             │  Google Drive pour ordinateur
                             ▼
                     PC du restaurant
                             │  Claude Code au démarrage, suit routine-reception.md
                             ▼
              Réception enregistrée dans l'appli Cuisine
```

Le script va chercher les photos dans le stockage de l'appli **et** dans Gmail,
et dépose tout au même endroit. C'est lui, et lui seul, qui manipule la clé de
l'appli — il tourne chez Google, sous le compte du restaurant.

La session du PC, elle, ne voit que des fichiers sur un disque : rien à
télécharger, aucune clé, aucune API à appeler. Ce n'est pas un détail de
confort. Une session qui tourne sans personne devant elle n'a pas à aller
chercher des identifiants où que ce soit, et une consigne qui le lui demande est
une mauvaise consigne — celle d'origine l'était, et le garde-fou de la session
locale a eu raison de la refuser.

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

Le PC a besoin de deux connecteurs : **Supabase** pour écrire les réceptions, et
**Gmail** pour envoyer le récap. Aucun des deux n'est facturé à l'usage — c'est
la session Claude qui travaille, il n'y a pas d'appel d'API payant dans la chaîne.

**a) Vérifier que la commande existe.** Dans un terminal : `claude --version`.
Si la commande est inconnue, installer Claude Code en ligne de commande avant
d'aller plus loin.

**b) Essayer le lanceur à la main.** Copier `reception-bl.bat` sur le PC (par
exemple dans `%USERPROFILE%\bl\`) et le double-cliquer. Le compte rendu s'écrit
dans `%USERPROFILE%\bl-reception.log`. Si la session s'arrête en demandant une
autorisation d'outil, c'est normal au premier passage : il faudra la lui accorder
une fois, ou préciser les outils autorisés dans la commande.

**c) Planifier.** Planificateur de tâches Windows → *Créer une tâche* :

| Onglet | Réglage |
|---|---|
| Général | nom « Réception BL », *Exécuter même si l'utilisateur n'est pas connecté* décoché |
| Déclencheurs | *À l'ouverture de session*, différer de 2 minutes (le temps que Drive et le réseau soient là) |
| Actions | *Démarrer un programme* → le chemin complet de `reception-bl.bat` |
| Conditions | décocher *Ne démarrer que si l'ordinateur est sur secteur* |

## Du mode à blanc à l'écriture

La première consigne de `routine-reception.md` est son mode. Il démarre à
**À BLANC** : la routine lit, contrôle, et envoie un récap disant ce qu'elle
écrirait — sans rien écrire. La réception continue de se faire à la main, et les
deux se comparent.

La bascule en **ÉCRITURE** se décide sur un critère chiffré : **dix bons de
livraison d'affilée sans une seule correction à apporter**. Une ligne à changer
dans la consigne, rien d'autre.

Calendrier visé : à blanc d'octobre à novembre 2026, bascule en décembre,
routine établie en janvier 2027.

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
- Si le PC finit par être trop souvent éteint, il existe une version qui ne
  dépend de rien : le script Google envoie lui-même la photo à l'API Claude et
  écrit la réception. Plus besoin ni de Drive, ni du PC — mais c'est payant,
  environ 1 à 2 centimes la photo. Écartée tant que le PC suffit.

## Cadrage des photos

Cadrer large à gauche : sur le BL du 22/09/2026, le premier chiffre de chaque
code produit était coupé. La lecture s'en est sortie par déduction, mais c'est
une fragilité gratuite. Une photo par BL, à plat, sans ombre portée sur le
tableau des lignes.
