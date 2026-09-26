# Photos de bons de livraison

DS Restauration n'envoie pas de BL par mail : à la livraison, il n'y a qu'un
papier. Tant qu'il n'est pas saisi, l'appli n'a rien à comparer aux factures qui
arrivent trois semaines plus tard — c'est le vrai trou de la chaîne.

La photo bouche ce trou, à condition qu'elle atterrisse quelque part où on peut
la lire.

La même routine confronte ensuite chaque facture et chaque avoir à ces
livraisons. Les factures arrivent dans l'appli chaque soir par le script
d'import, et leur PDF sur le PC vers 18 h 50 (`Bureau\Factures fournisseurs`) :
elles sont contrôlées au passage suivant, dans le même mail.

Le mail ne dit que ce que le patron veut savoir : **les prix qui bougent**, et
**ce qui est facturé sans avoir été reçu**. Les écarts entre commandé et reçu —
ruptures, produits pesés — n'y figurent pas.

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
                     PC du restaurant ◄──── Factures fournisseurs (PDF, 18 h 50)
                             │  Claude Code au démarrage, suit routine-reception.md
                             ▼
              Réception enregistrée dans l'appli Cuisine
              Factures confrontées aux livraisons, écarts dans le mail
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

**a) Installer et connecter la commande.** `npm install -g @anthropic-ai/claude-code`,
puis `claude auth login` avec le compte Claude (abonnement). `claude mcp list`
doit montrer *claude.ai Supabase* et *claude.ai Gmail* connectés : ce sont les
connecteurs du compte, rien à brancher à part.

**b) Le lanceur.** Copier `reception-bl.bat` dans `%USERPROFILE%\bl\`. Il
relance Google Drive si le dossier BL manque, télécharge la consigne à côté de
lui, puis lance la session avec une liste fermée d'autorisations : lire la
consigne, le dossier BL et le dossier `Factures fournisseurs`, écrire les
registres `lus-a-blanc.txt` et `factures-rapprochees.txt`, `execute_sql`
Supabase, `send_message` Gmail. Tout le reste est refusé sans question
(`--permission-mode dontAsk`) : les factures, pièces du comptable, ne sont que
lues. Le compte rendu s'écrit dans `%USERPROFILE%\bl-reception.log`.

**c) Planifier.** Tâche Windows « Réception BL » :

| Réglage | Valeur |
|---|---|
| Déclencheurs | le mercredi et le samedi à 15h |
| Action | `cmd /c start "Reception BL" /min /wait cmd /c "%USERPROFILE%\bl\reception-bl.bat"` |
| Conditions | tourne sur batterie, réveille le PC, rattrape un passage manqué |
| Instances | une seule à la fois, arrêt au bout d'1 h |

Deux passages par semaine depuis le 26/09/2026, au lieu de deux par jour :
chaque passage coûte environ 0,40 $ rien que pour démarrer, alors qu'une photo
ou une facture n'est lue qu'une fois, quel que soit le rythme. Les livraisons
tombent du lundi au mercredi (YesFood le lundi), puis le jeudi et le vendredi :
le mercredi lit les premières, le samedi les suivantes, et son récap arrive la
veille des commandes du dimanche, avec les prix à valider sur les fiches.

## Du mode à blanc à l'écriture

Les premières consignes de `routine-reception.md` sont ses deux modes, `MODE`
pour les BL et `MODE FACTURES` pour les factures. Ils démarrent à **À BLANC** :
la routine lit, contrôle et envoie son récap, sans rien écrire en base — sauf le
registre des achats `cmd_achats`, une table d'analyse pour les stats de prix et
de volumes, que rien d'autre ne lit. La réception et le contrôle des factures
continuent de se faire à la main dans l'appli, et les deux se comparent.

La bascule en **ÉCRITURE** se décide sur un critère chiffré : **dix bons de
livraison d'affilée sans une seule correction à apporter** pour les BL, **dix
factures d'affilée** pour les factures. Une ligne à changer dans la consigne,
rien d'autre.

Le compteur des factures est tenu dans `BL\factures-rapprochees.txt` et affiché
dans chaque mail. Quand la routine s'est trompée sur une facture, écrire
au bout de sa ligne « CORRIGÉ le <date> : <ce qui était faux> » — ou le demander
à Claude : le compteur repart de zéro.

Calendrier visé : à blanc d'octobre à novembre 2026, bascule en décembre,
routine établie en janvier 2027. À la bascule, revoir le rythme : les réceptions
ne s'écriront qu'au passage du mercredi ou du samedi.

## Ce que la routine ne fera jamais

Écrire une réception dont elle n'est pas sûre. Trois contrôles arithmétiques
doivent passer — prix × quantité, somme contre sous-total, recoupement d'au moins
deux prix de fiches — et la commande doit être identifiée sans ambiguïté. Sinon
elle s'abstient et le signale dans son récap.

Elle rend compte à chaque passage, **même quand il n'y a rien**. Le silence doit
vouloir dire « la chaîne est cassée », jamais « rien à signaler ».

## Limites connues

- Rien ne se passe si le PC reste éteint. Les photos s'empilent dans Drive et
  seront traitées dès qu'il sera rallumé (passage rattrapé), mais les écarts
  sont signalés d'autant plus tard.
- Quatre maillons peuvent casser en silence, d'où un récap à chaque passage :
  pas de mail un mercredi ou un samedi, c'est que la chaîne est cassée.
- Si le PC finit par être trop souvent éteint, il existe une version qui ne
  dépend de rien : le script Google envoie lui-même la photo à l'API Claude et
  écrit la réception. Plus besoin ni de Drive, ni du PC — mais c'est payant,
  environ 1 à 2 centimes la photo. Écartée tant que le PC suffit.

## Cadrage des photos

Cadrer large à gauche : sur le BL du 22/09/2026, le premier chiffre de chaque
code produit était coupé. La lecture s'en est sortie par déduction, mais c'est
une fragilité gratuite. Une photo par BL, à plat, sans ombre portée sur le
tableau des lignes.
