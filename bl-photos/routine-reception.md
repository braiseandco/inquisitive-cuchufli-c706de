# Routine — réception des BL photographiés et contrôle des factures

Procédure autoportante pour une session Claude Code tournant sur le PC du
restaurant. Tout ce qu'il faut savoir est ici : ne rien demander à l'utilisateur
pour démarrer.

Objectif : transformer les photos de bons de livraison en réceptions enregistrées
dans l'appli Cuisine, puis confronter chaque facture fournisseur à ces
livraisons, **sans jamais inventer un chiffre**.

## Mode de fonctionnement

    MODE = À BLANC
    MODE FACTURES = À BLANC

Deux étapes, deux lignes : `MODE` pour les BL (points 1 à 7), `MODE FACTURES`
pour les factures (point 8). Chacune bascule seule, et c'est la seule ligne à
changer pour la faire basculer. Les deux valeurs possibles :

- **À BLANC** — faire la lecture et tous les contrôles, puis écrire dans le récap
  *ce qui serait enregistré*, ligne par ligne, avec les écarts et les prix qui
  bougeraient. **N'écrire absolument rien en base** : ni `qte_recue`, ni statut,
  ni prix, ni `traite_at`. Ne pas déplacer les photos non plus. Seules écritures
  permises, une fois le récap envoyé : ajouter chaque photo lue au registre
  `BL\lus-a-blanc.txt` (voir « Où sont les photos ») et chaque facture contrôlée
  au registre `BL\factures-rapprochees.txt` (point 8 f), pour ne pas les
  reprendre au passage suivant.
- **ÉCRITURE** — appliquer la procédure complète : points 5 et 6 pour les BL,
  8 g pour les factures.

Pendant la période à blanc, le récap sert de preuve : on le compare à la
réception faite à la main, et au contrôle des factures fait dans l'appli. La
bascule est décidée sur un critère chiffré — dix bons de livraison d'affilée
sans une seule correction à apporter pour `MODE`, dix factures d'affilée pour
`MODE FACTURES`, compteur tenu par la routine (8 f) — et pas sur une impression.

## Contexte

Braise & Co, restaurant à Biganos (174 avenue de la Côte d'Argent, 33380). Les
commandes fournisseurs passent par l'onglet **Cuisine** de l'appli « Commande
Suivi Boisson » (app.braiseandco.fr/boissons), adossée au projet Supabase
`ugyrrnqpapeagpuocwob`, tables `cmd_*` :

| Table | Contenu |
|---|---|
| `cmd_fournisseurs` | fournisseurs, mode de commande, délais |
| `cmd_produits` | fiches produits : unité, prix, référence, `poids_kg`, stock mini |
| `cmd_commandes` | commandes : statut brouillon → envoyee → confirmee → livree |
| `cmd_commande_lignes` | lignes : `quantite` commandée, `qte_recue`, `prix`, `ecart` |
| `cmd_prix_historique` | traçabilité des changements de prix |
| `cmd_factures` | factures et avoirs (`type`), BL et accusés reçus par mail ; `lignes_json` = lecture faite par l'appli |

Fournisseurs actifs : **DS Restauration** (mail, livraison mardi et vendredi,
facture au kilo, n° client 382952), **Lodifrais** (mail, livraison le mercredi,
envoie des accusés de réception lus automatiquement par l'appli), **Mericq**
(SMS), **Blason d'Or**, **Aux Jardins de l'Atlantique**, **Maison Lartigue**.

Certains fournisseurs n'envoient aucun BL par mail — DS notamment. Leur bon de
livraison n'existe que sur papier, photographié à la réception : c'est la raison
d'être de cette routine.

## Où sont les photos

**Un seul endroit : `G:\.shortcut-targets-by-id\1FOsC4oL_N13Yjdpzr41SlKRJT82yKDL9\BL\AAAA-MM-JJ\`.**

Ce dossier appartient au compte braiseandcobiganos, où tourne le script, et il
est partagé avec alex.farge, le compte synchronisé sur le PC. Dans `G:\Mon Drive`,
il n'apparaît que sous la forme d'un raccourci Windows `BL.lnk`, qu'on ne peut
pas parcourir comme un dossier : passer par le chemin ci-dessus. Si le dossier
est introuvable, relancer Google Drive pour ordinateur avant de conclure qu'il
n'y a rien.

Un script Google y dépose tout, toutes les 15 minutes, quelle que soit la
provenance : les photos prises depuis le bouton « Photographier le BL » de
l'appli comme celles envoyées par mail à la boîte du restaurant. Google Drive
pour ordinateur les synchronise ensuite sur le PC.

**Ne rien télécharger, ne manipuler aucune clé, n'appeler aucune API de
stockage.** Ce sont des fichiers ordinaires sur un disque : ouvre-les comme tels.
Si une photo manque, c'est au script de la ramener, pas à toi d'aller la
chercher — le dire dans le récap et passer à la suite.

**Sauter toute photo déjà listée dans `BL\lus-a-blanc.txt`** (une ligne par photo :
chemin sous `BL` ; date ; ce qui en a été fait). Sans ce registre, chaque passage
relisait toutes les photos du mode à blanc et renvoyait les mêmes récaps. Après
l'envoi du récap, y ajouter une ligne par photo lue — y compris celles qui n'ont
pas pu l'être, avec la raison. Créer le fichier s'il n'existe pas.

Traiter toute photo qui n'est ni dans le registre ni dans `BL\traités\`, **y
compris à la racine de `BL`** : une photo déposée à la main n'est pas dans un
sous-dossier de date. Créer `traités` s'il n'existe pas.

### Retrouver la commande d'une photo

Le nom du fichier porte le numéro de la commande — `BC260920-02_1790152339379.jpg`
— parce que la photo a été prise depuis l'écran Réception de cette commande-là.
**Aucun rattachement à deviner**, ce qui supprime le risque le plus sérieux de
la chaîne.

Pour retrouver sa fiche en base, et la marquer traitée le moment venu :

```sql
select b.id, b.path, b.prise_par, b.traite_at, c.numero, f.nom as fournisseur
from cmd_bl_photos b
join cmd_commandes c on c.id = b.commande_id
join cmd_fournisseurs f on f.id = c.fournisseur_id
where b.path like '%' || '<nom du fichier>';
```

Une photo venue du mail n'a pas de fiche : là, **la commande est à retrouver**
(point 3).

Une fois la réception écrite : `update cmd_bl_photos set traite_at = now() where id = '<id>';`
puis déplacer le fichier dans `traités`. La photo reste dans le stockage de
l'appli, attachée à la commande — c'est la preuve en cas de contestation et la
pièce du comptable.

## 1. Ouvrir la photo

**Remettre la photo d'aplomb avant toute chose**, sans se fier aux seules
métadonnées. Deux cas se sont présentés :

- l'EXIF porte une orientation à appliquer (photo de téléphone stockée couchée :
  droite à l'écran, couchée sur disque) ;
- l'EXIF est propre — orientation 1 — mais le papier était posé de travers sur
  la table.

Donc : appliquer l'EXIF s'il y a lieu, regarder le résultat, et pivoter selon le
contenu si le texte n'est pas horizontal.

Si le premier caractère des codes produits est coupé sur le bord gauche, le
déduire du contexte (les codes DS font 5 chiffres) et le signaler dans le récap —
c'est un défaut de cadrage, à corriger côté serveur.

## 2. Lire, puis vérifier la lecture

Relever pour chaque ligne : code produit, désignation, unité, quantité livrée,
prix unitaire, montant.

**Les colonnes chiffrées peuvent être décalées d'une ligne par rapport aux
désignations.** C'est arrivé sur un BL DS du 22/09/2026, et un OCR naïf y
attribuerait chaque prix au mauvais produit. La parade est arithmétique, et elle
est obligatoire :

1. `prix unitaire × quantité = montant` sur chaque ligne ;
2. la somme des montants = le sous-total imprimé ;
3. recouper au moins deux prix avec ceux des fiches produits.

Si les trois contrôles ne passent pas, la lecture est fausse : **ne rien écrire**,
le signaler dans le récap.

## 3. Retrouver la commande

```sql
select c.id, c.numero, c.statut, c.date_livraison, l.id, l.nom, l.unite, l.quantite, l.reference
from cmd_commandes c join cmd_commande_lignes l on l.commande_id = c.id
join cmd_fournisseurs f on f.id = c.fournisseur_id
where f.nom = '<fournisseur du BL>' and c.statut in ('envoyee','confirmee')
order by c.date_livraison desc;
```

Rattacher par les références produits communes et la proximité de date. Plusieurs
BL peuvent couvrir une même commande : DS sépare par zone de température (le
22/09, BL 1192895 pour le surgelé et le sec, BL 1192885 pour l'huile).

**En cas de doute sur la commande, ne rien écrire.** Une réception posée sur la
mauvaise commande coûte plus cher à rattraper qu'une réception oubliée.

## 4. Convertir dans l'unité de la ligne de commande

DS facture au kilo des produits commandés au colis. La fiche produit porte
`poids_kg`, poids d'une unité de commande :

| Produit | Unité appli | `poids_kg` | Exemple |
|---|---|---|---|
| Haricots verts | Poche(s) | 2,5 | 5 kg au BL → **2 poches** |
| Tender poulet | Poche(s) | 2,5 | 20 kg au BL → **8 poches** |
| Framboise brisée | Carton(s) | 5 | 10 kg au BL → **2 cartons** |
| Champignons émincés | Boîte(s) | 2,5 | 2,5 kg au BL → **1 boîte** |

Convertir selon l'unité de **la ligne de commande**, pas celle de la fiche
produit : une commande partie en kilos avant la bascule en poches se compare
toujours en kilos.

Sur les produits pesés (unité en kilos), l'appli tolère 10 % d'écart sans le
considérer comme un litige.

**Pièce commandée, kilos facturés** (fromages Lodifrais, pièces de viande) : on
commande *une pièce*, le fournisseur facture son poids réel. La quantité reçue
est le **nombre de pièces**, jamais le poids. Le poids sert seulement au montant :
une pièce plus légère ou plus lourde que `poids_kg` fait varier le prix de la
pièce sans que ce soit une hausse ou une baisse de tarif — ne comparer que le
prix au kilo. Si une ancienne ligne de commande est restée en kilos pour un tel
produit (le bleu d'Auvergne de O26091454M6AA : « 1 kg » voulait dire un fromage),
ce n'est pas une erreur de saisie : le signaler comme ligne à passer en pièces,
avec l'écart de valorisation qu'elle entraîne.

## 5. Écrire la réception

```sql
update cmd_commande_lignes set qte_recue = <quantité convertie>,
       ecart = '<description>' -- uniquement si écart, sinon laisser null
where id = '<ligne>';

update cmd_commandes set
  statut = 'livree', date_reception = now(),
  numero_bl = '<n° du ou des BL>', recu_par = 'BL papier (photo)',
  reception_note = '<total du BL, écarts, n° de commande fournisseur>',
  updated_at = now()
where id = '<commande>';
```

Mettre à jour un prix de fiche produit **uniquement** si le BL le contredit et que
les trois contrôles du point 2 sont passés. Tracer le changement, **et reporter le
prix sur la ligne de commande** — comme le fait l'appli quand un accusé
fournisseur arrive. Sans ce report, la fiche est juste mais la commande reste
valorisée à l'ancien prix et son total ne correspond plus au BL :

```sql
insert into cmd_prix_historique (produit_id, prix, source, date)
values ('<produit>', <prix>, 'BL <numéro> du <date>', '<date>');

update cmd_commande_lignes set prix = <prix> where id = '<ligne>';

update cmd_commandes c set total_estime = (
  select round(sum(l.prix * l.quantite), 2) from cmd_commande_lignes l where l.commande_id = c.id
) where c.id = '<commande>';
```

**Contrôle final, systématique :** la somme `prix × qte_recue` sur toutes les
lignes doit retomber sur le total HT du BL. Sinon, quelque chose a été mal lu ou
mal reporté — le dire dans le récap.

## 5 bis. Compléter le catalogue

Un BL porte régulièrement un produit qui n'est pas encore dans la liste du
fournisseur : dépannage, nouveauté, article commandé par téléphone. Tant qu'il
n'y est pas, il n'est pas commandable depuis l'appli, et surtout **aucune facture
future ne saura le rapprocher**.

Pour chaque ligne du BL sans produit correspondant :

```sql
-- d'abord chercher par référence, puis par nom, avant de conclure qu'il manque
select id, nom, unite, prix, reference from cmd_produits
where fournisseur_id = '<fournisseur>'
  and (regexp_replace(coalesce(reference,''), '\D', '', 'g') = regexp_replace('<ref du BL>', '\D', '', 'g')
       or lower(nom) like '%<mot clé>%');
```

S'il manque vraiment :

```sql
insert into cmd_produits (fournisseur_id, nom, unite, prix, reference, conditionnement, ordre, actif)
values ('<fournisseur>', '<nom lisible>', '<unité du BL ramenée à celles de l''appli>',
        <prix unitaire>, '<référence>', '<ce que dit la désignation>', 900, true);

insert into cmd_prix_historique (produit_id, prix, source, date)
values ('<nouveau produit>', <prix>, 'BL <numéro> du <date>', '<date>');
```

Règles :

- **Le nom doit être lisible par un cuisinier**, pas la désignation brute du
  fournisseur : « Haricots verts (poche 2,5 kg) », pas « HARICOT VERT T/F CE2
  2.5K FR Q ». Garder la désignation d'origine dans `conditionnement`.
- **Toujours renseigner la référence** quand le BL en porte une : c'est par elle
  que se feront tous les rapprochements suivants.
- Si le fournisseur facture au poids un article vendu au colis, renseigner
  `poids_kg` (voir point 4).
- Laisser `categorie_id` vide et `stock_mini` vide : c'est au restaurant de les
  décider.
- **Ne jamais créer un produit sur un doute de lecture.** Un doublon dans le
  catalogue se paie ensuite à chaque commande.

Tout produit créé est **listé dans le récap**, pour qu'il puisse être renommé,
rangé dans une catégorie ou corrigé.

## 6. Classer et rendre compte

Déplacer la photo dans `BL\traités\` (même chemin qu'au début), puis, une fois
les factures contrôlées (point 8), **envoyer le récap par mail** — un seul par
passage — à braiseandcobiganos@gmail.com via le connecteur Gmail. Un récap affiché
dans une fenêtre du PC n'est lu par personne, et surtout pas depuis le téléphone,
d'où se pilotent les commandes.

Objet : `Réception du <date> — <n> livraison(s), <n> écart(s) — <n> facture(s), <n> écart(s)`.
L'envoyer **même les jours sans livraison ni facture** : le silence doit vouloir
dire « la routine est cassée », jamais « rien à signaler ».

### Règle d'écriture des écarts

Tout chiffre qui traduit une différence porte **un signe et un sens**, jamais une
valeur nue. Le lecteur doit savoir en un coup d'œil si ça lui coûte ou si ça lui
rapporte, sans refaire le calcul.

- **+** = en sa défaveur : payé plus cher, ou reçu en plus que commandé.
- **−** = en sa faveur : payé moins cher, ou reçu en moins.
- Chaque prix qui bouge est annoncé **hausse** ou **baisse**, avec l'ancien prix,
  le nouveau, l'écart unitaire, le pourcentage, et surtout **l'effet en euros sur
  cette livraison** — c'est le seul chiffre qui parle vraiment.

**Séparer l'effet prix de l'effet quantité.** Les mélanger donne un total juste
mais illisible : on ne sait plus si la facture grimpe parce que le fournisseur a
augmenté ses tarifs ou parce qu'il a livré davantage.

### Modèle

```
Aux Jardins de l'Atlantique — BL163993 — commande O260921ZNIFUL
Total BL : 259,85 € HT

Effet prix     : −7,96 €   (les tarifs ont baissé)
Effet quantité : +1,31 €   (un peu plus livré que commandé)
────────────────────────────────
Écart / commande : −6,65 €

PRIX
  ▼ baisse   Tomate grappe    19,90 → 14,90 €/colis   −5,00   −25,1 %   → −5,00 € (1 colis)
  ▼ baisse   Poivron rouge    17,40 → 14,90 €/colis   −2,50   −14,4 %   → −5,00 € (2 colis)
  ▲ hausse   Courgette verte  11,40 → 13,40 €/colis   +2,00   +17,5 %   → +2,00 € (1 colis)
  ▲ hausse   Chou blanc        2,94 →  2,98 €/pièce   +0,04    +1,4 %   → +0,04 € (1 pièce)

QUANTITÉS
  + Citron jaune : 3,44 kg reçus pour 3 kg commandés  (+0,44 kg, +1,31 €)

CATALOGUE
  Nouveau produit ajouté : Persil plat (botte) — réf. 04412 — 1,20 €/botte
  → à ranger dans une catégorie et à doter d'un stock mini si besoin

Photo : bl/2026-09-22/O260921ZNIFUL_1758547200.jpg
```

Ajouter ensuite la rubrique FACTURES (point 8 f), puis, s'il y a lieu : ce qui
n'a pas pu être traité et pourquoi, et les réceptions en retard (point 7).

## 6 bis. Les manquants, en tête du mail

**La question à laquelle le récap doit répondre en premier : qu'est-ce qui n'est
pas arrivé ?** C'est la seule information qui demande une action le jour même —
relancer le fournisseur, retirer un plat de la carte, dépanner ailleurs.

Balayer **toutes les réceptions du jour**, pas seulement celles que la routine a
traitées : une réception saisie à la main dans l'appli compte autant.

```sql
select f.nom as fournisseur, c.numero, c.date_reception,
       l.nom as produit, l.unite, l.quantite as commande, l.qte_recue as recu, l.ecart
from cmd_commande_lignes l
join cmd_commandes c on c.id = l.commande_id
join cmd_fournisseurs f on f.id = c.fournisseur_id
where c.date_reception::date = current_date
  and l.qte_recue is not null and l.qte_recue < l.quantite
order by (l.quantite - l.qte_recue) * coalesce(l.prix,0) desc;
```

Présenter en tête du mail, sous le titre **MANQUANTS**, avec pour chaque ligne :
le produit, le fournisseur, ce qui manque, et la valeur — c'est elle qui dit s'il
faut décrocher le téléphone ou laisser courir. Distinguer deux cas :

- **manque annoncé** — le fournisseur a prévenu, le reste suit. Pour mémoire.
- **manque non annoncé** — rien n'a été dit. C'est celui-là qui doit ressortir.

Exemple du 23/09/2026 : la saucisse manquait de 13,8 kg mais Lodifrais avait
téléphoné ; le spéculoos manquait sans un mot. Le second est le vrai sujet, même
à 6,33 €, parce que personne ne l'a su avant de le chercher en cuisine.

**Livré moins, facturé moins : ce n'est pas un litige.** Le fournisseur envoie ce
qu'il a — rupture, produit pesé — et le BL facture la quantité réellement livrée.
Le 23/09/2026, Lodifrais a livré 8,3 kg d'échine pour 10 kg commandés et facturé
8,3 kg : le restaurant ne paie que ce qu'il reçoit. Le lister parmi les manquants
(il faut peut-être recommander ou adapter la carte), mais sans le présenter comme
une erreur ni comme quelque chose à réclamer. Ne parler de réclamation que si le
BL facture plus que ce qui est arrivé, ou si le prix a bougé.

S'il n'y a aucun manquant, l'écrire : « Aucun manquant aujourd'hui. »

## 6 ter. Les offerts, toujours signalés

Toute ligne gratuite du BL — « GRATUIT », « offert », prix ou montant à 0,00 €,
unité gratuite d'une promotion — est **signalée dans le mail**, sous le titre
**OFFERTS**, juste après les manquants : produit, fournisseur, quantité, et ce
qu'elle vaudrait au prix de la ligne payante du même produit. Le 23/09/2026, Le
Bihan a ajouté 2 cartons d'Abatilles pétillante 1 L gratuits aux 10 commandés
(≈ 22 €) : la réception à la main ne l'avait pas vu.

En mode ÉCRITURE, un offert s'ajoute à `qte_recue` avec l'écart « dont N
offert(s) », sans toucher au prix de la ligne.

## 7. Signaler les réceptions en retard

Avant d'envoyer le récap, lister les commandes dont la livraison est passée et
qui n'ont toujours pas été réceptionnées, et les ajouter au mail :

```sql
select f.nom, c.numero, c.date_livraison
from cmd_commandes c join cmd_fournisseurs f on f.id = c.fournisseur_id
where c.statut in ('envoyee','confirmee') and c.date_livraison < current_date
order by c.date_livraison;
```

Tant qu'une commande n'est pas réceptionnée, la facture qui arrivera n'aura rien
à quoi se comparer. C'est le vrai trou de la chaîne. Au 22/09/2026, quatre
commandes DS et quatre Lodifrais de septembre étaient dans ce cas.

## 8. Factures : les confronter aux livraisons

Une facture fournisseur est prélevée à l'échéance sans que personne la relise
ligne à ligne. C'est là que partent les euros d'un produit facturé mais jamais
arrivé, d'un poids arrondi, d'un tarif qui a glissé. Chaque passage contrôle
toutes les factures et tous les avoirs arrivés depuis le passage précédent, et
en rend compte dans le même mail, rubrique **FACTURES**.

### 8 a. Les factures à contrôler

Le script d'import les range chaque soir vers 18 h 35 dans `cmd_factures`, et
une copie de chaque PDF arrive sur le PC vers 18 h 50 :

    C:\Users\brais\OneDrive\Bureau\Factures fournisseurs\<fournisseur>\<année>\AAAA-MM-JJ <fournisseur> <n°>.pdf

Chercher le fichier par son numéro (`*<n°>*.pdf` dans le dossier du
fournisseur), pas par la date du nom. Une facture arrivée en plusieurs PDF donne
« … (PDF 1 sur 2).pdf », « … (PDF 2 sur 2).pdf » : les lire tous. Ce dossier est
la pièce du comptable : **n'y rien écrire, n'y rien déplacer**.

```sql
select x.id, f.nom as fournisseur, x.type, x.numero, x.date_facture, x.date_echeance,
       x.montant_ht, x.montant_tva, x.montant_ttc, x.statut, x.pdf_path, x.pdf_suite,
       x.lignes_json, x.note, x.created_at
from cmd_factures x join cmd_fournisseurs f on f.id = x.fournisseur_id
where x.type in ('facture', 'avoir')
  and x.statut <> 'historique'  -- factures d'avant le 25/09/2026, laissées telles quelles
  and exists (select 1 from cmd_produits p where p.fournisseur_id = x.fournisseur_id)  -- écarte Meta Ads
order by x.created_at;
```

Sauter toute facture dont l'`id` figure déjà au registre
`BL\factures-rapprochees.txt` (8 f). Si son PDF n'est pas encore sur le PC, la
dire « reportée » dans le récap sans l'inscrire au registre : elle sera reprise
au passage suivant. Plus de deux jours sans copie, c'est la copie du soir qui
est cassée : l'écrire en tête de la rubrique. Une facture sans PDF (saisie à la
main dans l'appli) ne se contrôle que sur ses totaux.

### 8 b. Lire la facture

Ouvrir le PDF et relever : numéro, date, échéance et mode de règlement ; pour
chaque BL couvert, son numéro, sa date et le numéro de commande du fournisseur
(« CDE N° » chez Lodifrais, « Ref cde » chez DS) ; chaque ligne — référence,
désignation, quantité et unité, prix unitaire, montant ; chaque « Total BL » ;
les frais hors produits ; les totaux HT, TVA par taux et TTC. Pour un avoir : la
facture d'origine (« S/FRE 6072313 »), le motif (« RETOUR », « PDT MANQUANT »),
le BL.

**Contrôles arithmétiques, obligatoires, comme pour un BL** (point 2) :

1. `quantité × prix unitaire = montant` sur chaque ligne, à un centime près ;
2. la somme des lignes d'un BL = son « Total BL » ;
3. somme des BL + frais = total HT ; HT × taux = TVA ; HT + TVA = TTC.

Un contrôle qui échoue encore après relecture : ne rien conclure sur cette
facture, dire lequel échoue, verdict « illisible » (8 f).

Si l'appli a déjà lu la facture (`lignes_json` rempli), comparer les deux
lectures : un désaccord oblige à relire, et le PDF fait foi. Ne jamais s'en
tenir à `lignes_json` : le lecteur de l'appli ignore les frais — sur la facture
Lodifrais 73172530 du 20/09/2026, ses 60 lignes font 1 653,30 € pour
1 654,80 € HT.

### 8 c. Retrouver les livraisons

Pour chaque BL de la facture, trouver la commande — par le numéro de BL, puis
par le numéro de commande du fournisseur, puis par la date et les références
communes :

```sql
select c.id, c.numero, c.statut, c.date_livraison, c.date_reception, c.numero_bl,
       c.recu_par, c.reception_note, c.note, c.confirmation_json->>'numero' as accuses,
       c.bl_json->>'numero' as bl_mail
from cmd_commandes c join cmd_fournisseurs f on f.id = c.fournisseur_id
where f.nom = '<fournisseur>'
  and (c.numero_bl like '%<n° BL>%'
       or c.numero = '<n° commande fournisseur>'
       or c.confirmation_json::text like '%<n° commande fournisseur>%'
       or c.date_livraison between '<date du BL>'::date - 3 and '<date du BL>'::date + 3)
order by c.date_livraison;
```

Puis ce qui a été livré, dans cet ordre de préférence :

1. la réception saisie : `qte_recue`, `ecart`, et `reception_note`, qui dit
   souvent ce que les quantités taisent ;
2. le BL reçu par mail : `bl_json` de la commande, ou `cmd_factures` de type `bl` ;
3. le BL photographié : `BL\lus-a-blanc.txt` dit quelle photo porte quel BL, la
   rouvrir au besoin avec les règles des points 1 et 2.

```sql
select l.commande_id, l.reference, l.nom, l.unite, l.quantite, l.qte_recue, l.prix, l.ecart,
       p.prix as prix_fiche, p.unite as unite_fiche, p.poids_kg, p.conditionnement
from cmd_commande_lignes l left join cmd_produits p on p.id = l.produit_id
where l.commande_id in ('<commande>')
order by l.commande_id, l.ordre;
```

Même règle qu'au point 3 : **en cas de doute sur la commande, ne rien affirmer.**

Trois cas à connaître :

- **Commande annulée, pourtant livrée.** Le 24/09/2026, quatorze commandes
  anciennes sont passées en `annulee`, note « Clôturée le 24/09/2026 : jamais
  réceptionnée dans l'appli, trop ancienne ». Certaines avaient bel et bien été
  livrées : le BL IV296405 du 18/09, 427,88 € HT sur la facture Lodifrais
  73172530, est celui de la commande O260917QM6IFB. Une commande annulée reste
  donc candidate ; si un BL facturé y mène, c'est une **livraison jamais
  réceptionnée**.
- **Réception « de principe ».** Quand toutes les quantités reçues d'une commande
  sont exactement les quantités commandées, produits pesés compris, la réception
  a presque toujours été validée sans relire le BL. Si la facture s'en écarte sur
  un produit pesé, c'est qu'elle reprend le poids du BL : demander de vérifier le
  BL papier, ne pas réclamer d'avoir.
- **Aucune commande dans l'appli** — Mericq avant le 23/09/2026, commande
  téléphonée : contrôler les calculs et les prix des fiches, et dire que les
  quantités n'ont rien à quoi se comparer. Verdict « partielle ».

### 8 d. Comparer, ligne par ligne

- **Quantité** — ramener la quantité facturée à l'unité de la ligne de commande
  (point 4), en lisant le conditionnement dans la désignation : « 1L X6 » est un
  carton de 6 L, « 4K65 » un seau de 4,65 kg, « X90 » un carton de 90 œufs,
  « 25G X40 » un carton de 40 choux, « 5K » un sac de 5 kg ; un fût Le Bihan se
  facture au litre, une caisse en « 24 COL ». Écrire la conversion dans le mail
  quand elle ne saute pas aux yeux ; ambiguë, « unité non comparable » et aucun
  écart affirmé. Comparer ensuite à ce qui a été livré (8 c). Produit pesé :
  10 % de tolérance, le poids facturé est le poids réel.
- **Prix** — prix facturé ramené à l'unité de l'appli en partant du montant de
  la ligne, le seul point fixe, puis comparé au prix de la ligne de commande et à
  celui de la fiche. Un écart compte s'il dépasse 1 % ou 1 € sur la ligne ; en
  dessous, c'est de l'arrondi.
- **Remplacement** — une autre référence livrée à la place de celle commandée :
  « remplacé par », comparer les prix, pas d'écart de quantité.
- **Livré, pas facturé** — toute ligne reçue (`qte_recue` > 0) d'une commande
  couverte par la facture et absente de celle-ci. Vérifier d'abord qu'elle
  n'est pas sur une autre facture du fournisseur.
- **Avoir** — retrouver la facture d'origine et la ligne créditée (dans
  `cmd_factures`, même `historique`) : même produit, même prix, quantité
  plausible ; puis l'avoir attendu qu'il solde au registre (8 f), s'il y en a un.

**Livré moins, facturé moins, n'est pas un écart** (point 6 bis) ; un offert non
facturé non plus (point 6 ter).

### 8 e. Pièges déjà rencontrés

- **Point décimal Lodifrais** : « 8.300 KG » vaut 8,3 kg, jamais 8 300 — erreur
  commise le 23/09/2026. Plus généralement, une quantité trois fois supérieure à
  la commande ou un prix double de la fiche se relisent avant d'y croire.
- **Factures qui couvrent plusieurs BL** : Lodifrais et DS par décade, Mericq par
  semaine, Blason d'Or au mois, et le relevé mensuel « REL… » d'Aux Jardins de
  l'Atlantique, plus de dix BL et plus de cent lignes. Contrôler BL par BL,
  total de BL compris.
- **Frais hors produits**, absents des lignes : « FA:1.50€ » Lodifrais (frais
  administratifs, dans le cadre TVA, à 20 %), « F.G. » en pied de facture Le
  Bihan en plus de la ligne « surcoût temporaire frais gestion », « Contrib. Eco
  Energie » et « Forfait Logistique » Mericq, participation au transport
  Carniato.
- **Le Bihan** : `montant = quantité × prix + droits` (colonne « Dt Droits ») ;
  les prix de l'appli sont droits compris, à la bouteille ou au litre ; les
  consignes et déconsignes sont hors HT (net facture = TTC + consignes −
  déconsignes).
- **Mericq** : sur une ligne en « U » (glace), le montant est `pièces × prix`, la
  colonne poids n'est pas une quantité ; « NetNet » = prix net. Les fiches sont à
  la caisse ou à la boîte et `poids_kg` est vide : prendre le poids dans le
  conditionnement (« caisse 5 kg ») et signaler que `poids_kg` est à remplir.
- **DS** : facture au kilo ce qui se commande au colis (point 4) ; ses avoirs
  citent la facture d'origine (« S/FRE ») et la commande sans son O initial
  (« 0260903YDLOCK » = O260903YDLOCK).
- **Pièce commandée, kilos facturés** (fromages Lodifrais, point 4) : la facture
  est juste, c'est la ligne de commande restée en kilos qui est à passer en
  pièces — pour mémoire, pas un écart de facture. Et l'inverse, **pièce entière
  livrée pour des kilos commandés** : le boudin Lodifrais « 1K7 » se livre au
  boudin entier, 4 kg commandés donnent 3 boudins, 5,1 kg. L'écart est réel
  mais attendu : le dire comme tel, pas comme une erreur de facturation.

### 8 f. Rendre compte

Dans le mail, rubrique **FACTURES**, après les livraisons. Pour chaque facture,
dans cet ordre, et seulement ce qui a quelque chose à dire :

1. **FACTURÉ, PAS LIVRÉ** — ou facturé plus que livré au-delà de la tolérance :
   l'avoir à obtenir, en euros. Il devient un avoir attendu (registre, plus bas).
2. **LIVRAISON JAMAIS RÉCEPTIONNÉE** — BL facturé sans réception dans l'appli :
   la marchandise est-elle arrivée ? Avec le montant du BL.
3. **QUANTITÉS** — les autres écarts de quantité, et ce qu'il faut vérifier.
4. **PRIX** — hausses et baisses par rapport à la commande, avec la règle
   d'écriture du point 6 (ancien → nouveau, écart, %, effet en euros sur la
   facture), et si la fiche est déjà à jour ou le serait.
5. **POUR MÉMOIRE** — livré pas facturé, remplacements, frais, avoirs reçus et
   ce qu'ils soldent.

Chaque ligne des rubriques 1 à 4 compte pour un écart, dans l'objet du mail
comme dans le registre ; « pour mémoire » ne compte pas. Terminer la rubrique
par les **avoirs attendus** du registre toujours pas arrivés, avec leur
ancienneté : au-delà de 15 jours, « à relancer ». Un jour sans facture nouvelle,
l'écrire — « Aucune facture nouvelle. » — et donner quand même le compteur et
les avoirs attendus.

```
FACTURES — 2 contrôlées, 7 écarts
Fiabilité : 4 factures d'affilée sans correction (bascule à 10)

Lodifrais — facture 73172530 du 20/09/2026 — 1 654,80 € HT, 1 756,29 € TTC, prélevée le 10/10
4 BL : IV293958 (11/09) · IV295169 (16/09) · IV295361 (16/09) · IV296405 (18/09)
Calculs justes : 60 lignes, 4 totaux BL, + 1,50 € de frais administratifs = 1 654,80 € HT

LIVRAISON JAMAIS RÉCEPTIONNÉE
  BL IV296405 du 18/09 — 427,88 € HT, 15 lignes — commande O260917QM6IFB,
  clôturée le 24/09 « jamais réceptionnée » : la marchandise est-elle arrivée ?
  Les 15 lignes suivent la commande, boudin mis à part (5,108 kg pour 4 kg : 3 boudins entiers).

QUANTITÉS
  + Boudin noir (BL IV293958) : 7,06 kg facturés, 6 kg à une réception de
    principe → +1,06 kg, +6,64 € — à vérifier sur le BL papier

PRIX — effet total sur la facture : +2,04 €
  ▲ hausse   Saucisse de Toulouse    6,95 → 7,531 €/kg   +0,581   +8,4 %   → +5,27 € (9,074 kg)
  ▲ hausse   Sauce salade 5 L        7,50 → 8,50 €       +1,00   +13,3 %   → +1,00 €
  ▲ hausse   Préparation tiramisu    6,20 → 6,29 €/L     +0,09    +1,5 %   → +0,54 € (6 L)
  ▼ baisse   Œufs (carton de 90)    24,57 → 19,80 €      −4,77   −19,4 %   → −4,77 €
  Fiches déjà à ces prix : rien à mettre à jour.

POUR MÉMOIRE
  Crème sous pression 56253 livrée à la place de la bombe chantilly 249507 : 7,42 € au lieu de 7,62 €
  Bleu d'Auvergne : 1 fromage de 2,308 kg à 10,53 €/kg, conforme ; sa ligne de commande est en kilos, à passer en pièces
  Frais administratifs : 1,50 € HT (20 %)

Verdict : rapprochée, 6 écarts
```

**Registre `BL\factures-rapprochees.txt`.** Une fois le mail parti, y ajouter une
ligne par facture ou avoir contrôlé — pas pour une facture reportée. Le créer
avec son en-tête s'il n'existe pas ; ne jamais effacer une ligne.

    # id ; fournisseur ; document ; date ; HT ; BL couverts ; contrôlé le ; verdict ; écarts ; correction
    f1fd5aaa-2029-4d22-9e01-cf1ecad74075 ; Lodifrais ; facture 73172530 ; 20/09/2026 ; 1654,80 ; IV293958 IV295169 IV295361 IV296405 ; 25/09/2026 ; rapprochée ; 6 écarts ;
    AVOIR ATTENDU ; Lodifrais ; facture <n°> ; spéculoos, 1 pièce, BL IV297811 ; 6,33 € ; noté le <date> ; en attente

Verdict **rapprochée** : toutes les lignes comparées à une livraison ;
**partielle** : une partie n'avait rien à quoi se comparer ; **illisible** :
lecture ou calculs en échec, rien conclu. Chaque montant à obtenir (1 ci-dessus)
ajoute une ligne AVOIR ATTENDU ; quand l'avoir arrive, remplacer « en attente »
par « reçu : avoir <n°> du <date> ».

**Compteur de fiabilité.** Une erreur de la routine sur une facture — écart
inventé, écart manqué, mauvaise lecture — se note au bout de sa ligne :
« CORRIGÉ le <date> : <ce qui était faux> », à la main ou en le demandant à
Claude. Compter, en remontant le registre depuis la fin, les factures
« rapprochée » jusqu'à la première ligne CORRIGÉ : c'est le nombre de factures
d'affilée sans correction, affiché en tête de la rubrique. « partielle »,
« illisible » et les avoirs ne comptent pas et ne remettent pas à zéro. À dix,
proposer la bascule de `MODE FACTURES` dans le mail ; c'est au patron de la
faire.

### 8 g. En mode ÉCRITURE

- Facture **rapprochée sans écart** : faire ce que fait le bouton « Valider » de
  l'appli — la passer en `validee` ; chaque prix facturé qui diffère de la fiche,
  à unité comparable, devient le prix de la fiche, tracé.

  ```sql
  update cmd_factures set statut = 'validee', note = '<résumé du contrôle>', updated_at = now()
  where id = '<facture>' and statut = 'a_controler';

  update cmd_produits set prix = <prix facturé ramené à l'unité>, updated_at = now() where id = '<produit>';
  insert into cmd_prix_historique (produit_id, prix, source, date)
  values ('<produit>', <prix>, 'facture <n°>', '<date de la facture>');
  ```
- Facture **avec écarts** : la laisser « À contrôler », écarts et montants dans
  `note`.
- Jamais « Contestée », jamais un mot au fournisseur : c'est au patron d'en
  décider.

## Limites à respecter

- **Ne jamais écrire dans le doute.** Abstention + récap valent mieux qu'une
  écriture fausse.
- **Ne pas modifier le code de l'appli**, ni committer quoi que ce soit dans le
  dépôt. Cette routine ne touche qu'aux données de réception et au statut des
  factures.
- **Ne pas supprimer de photo** : la déplacer dans `traités`, jamais l'effacer.
- **Ne rien écrire ni déplacer dans `Factures fournisseurs`**, ne jamais
  contester une facture ni écrire à un fournisseur.

## Exemples déjà traités le 22/09/2026

**DS Restauration**, BL 1192895 + 1192885, commande BC260920-02, 12 lignes.
Colonnes décalées d'une ligne, recalées par l'arithmétique : 383,21 € + 18,90 €
= 402,11 € HT, exactement la valorisation des quantités reçues. Un seul écart :
haricots verts commandés 3 kg, livrés 5 kg — DS arrondit à la poche de 2,5 kg.

**Aux Jardins de l'Atlantique**, BL163993, commande O260921ZNIFUL, 14 lignes,
259,85 € HT. Écart : citron jaune 3,44 kg pesés pour 3 kg commandés. Quatre prix
recalés (chou blanc, courgette, poivron rouge, tomate grappe) — et c'est sur ce
BL qu'a été repéré l'oubli du report des prix sur les lignes de commande.
