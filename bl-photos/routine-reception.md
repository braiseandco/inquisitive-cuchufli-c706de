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

- **À BLANC** — faire la lecture et tous les contrôles comme en écriture, et en
  rendre compte au point 6. **N'écrire absolument rien en base** : ni
  `qte_recue`, ni statut, ni prix, ni `traite_at`. Ne pas déplacer les photos non
  plus. Seules écritures permises, une fois le récap envoyé : ajouter chaque
  photo lue au registre `BL\lus-a-blanc.txt` (voir « Où sont les photos »),
  écrire les lignes de chaque facture contrôlée au registre des achats
  `cmd_achats` (point 8 f bis), puis l'inscrire au registre
  `BL\factures-rapprochees.txt` (point 8 f), pour ne pas les reprendre au
  passage suivant.
- **ÉCRITURE** — appliquer la procédure complète : points 5 et 6 pour les BL,
  8 g pour les factures.

Pendant la période à blanc, le récap sert de preuve : ce qu'il signale doit
être vrai, et rien de ce qu'il fallait signaler ne doit manquer. La bascule est
décidée sur un critère chiffré — dix bons de livraison d'affilée
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
Pour lister un dossier, l'outil de recherche de fichiers (Glob) suffit :
PowerShell et Bash ne sont pas autorisés, inutile de les essayer. Si une photo manque, c'est au script de la ramener, pas à toi d'aller la
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

**Pièce commandée, kilos facturés** (fromages Lodifrais, boudin noir Lodifrais,
pièces de viande, caisse de lieu noir et coffre de saumon Mericq) : on
commande *une pièce* ou *un colis* dont le poids varie, le fournisseur le pèse et
facture son poids réel. La quantité reçue est le **nombre de pièces**, jamais le
poids. Le poids sert seulement au montant : une pièce plus légère ou plus lourde
fait varier le prix de la pièce sans que ce soit une hausse ou une baisse de
tarif — **ne comparer que le prix au kilo**, et ne rien signaler sur le poids.
Une ligne de commande restée en kilos pour un tel produit (le bleu d'Auvergne de
O26091454M6AA : « 1 kg » voulait dire un fromage) n'est pas une erreur de saisie.
Les fiches du bleu d'Auvergne et du boudin sont à la pièce, poids nominal dans
`poids_kg`. Depuis le 25/09/2026, le boudin commandé est le sans-nitrite
(réf. 65921, ≈ 1,3 kg, 4,92 €/kg) ; le Brient « 1K7 » (réf. 117848, 6,26 €/kg),
désactivé, ne sert plus qu'aux factures d'avant.

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

Un article offert (« GRATUIT », prix ou montant à 0,00 €) s'ajoute à
`qte_recue` avec l'écart « dont N offert(s) », sans toucher au prix de la ligne.

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

### Ce que le patron veut lire

Deux choses, et rien d'autre (sa demande du 25/09/2026) :

1. **les prix qui bougent** — c'est ainsi qu'on a vu le jus d'ananas Norbert
   facturé 2,93 € la bouteille pour 1,55 € sur la fiche ;
2. **ce qui est facturé sans avoir été reçu** — le fournisseur doit facturer ce
   qui a été réceptionné, pas davantage.

Les écarts entre commandé et reçu ne l'intéressent pas : ruptures de stock,
produits pesés au kilo, arrondis au colis ou à la pièce, ils s'expliquent
presque toujours, et le restaurant ne paie que ce qu'il reçoit. **Ne pas les
mettre dans le mail**, pas plus que les manquants, les offerts, les calculs
justes, les conversions d'unités ou ce qui serait écrit en base : ce travail
reste dans la session. Le mail se lit sur un écran de téléphone.

Objet : `Réception du <date> — ` suivi de l'essentiel : le nombre de hausses de
prix et leur effet total, le montant facturé sans avoir été reçu — ou « rien à
signaler » et ce qui a été contrôlé. L'envoyer **même les jours sans livraison
ni facture** : le silence doit vouloir dire « la routine est cassée », jamais
« rien à signaler ».

Le corps, dans cet ordre, chaque rubrique seulement si elle a quelque chose à
dire :

1. **PRIX** — chaque prix qui bouge sur un BL lu ou une facture contrôlée, une
   ligne par produit : ▲ ou ▼ et le pourcentage, le produit, le fournisseur,
   l'ancien et le nouveau prix — au kilo pour tout ce qui se facture au poids,
   quel que soit le poids du colis —, **l'effet en euros** sur cette livraison ou
   cette facture — le seul chiffre qui parle vraiment —, le document, et « fiche
   à mettre à jour » si la fiche produit n'a pas encore le nouveau prix. L'ancien
   prix est celui de la ligne de commande ; sans commande, celui de la fiche
   avant ce document — si `cmd_prix_historique` montre qu'elle a déjà été mise à
   jour depuis lui (bouton « Valider » de l'appli, source « facture <n°> »),
   prendre le prix d'avant ; sans prix sur la fiche, le dernier prix payé, sur la
   facture précédente du fournisseur. Les hausses d'abord, de la plus coûteuse à
   la moins coûteuse, puis les baisses.
   Sous 1 % et sous 1 € sur la ligne, c'est de l'arrondi : rien à écrire. Un
   frais nouveau ou en hausse (8 e) est une hausse.
2. **FACTURÉ, PAS REÇU** — ce que le fournisseur fait payer, sur sa facture ou
   déjà sur son BL, sans que la réception l'ait enregistré : un BL facturé sans
   aucune réception, une commande déclarée non reçue dans l'appli (8 c), une
   ligne facturée mais notée non livrée ou refusée, une
   quantité facturée supérieure à la quantité reçue (8 d), un avoir attendu
   depuis plus de 15 jours. Pour chacun : le montant, et ce qu'il faut faire.
3. **CONTRÔLÉS** — une ligne par document : fournisseur, numéro, montant HT, et
   « conforme », ou le renvoi aux rubriques ci-dessus, ou ce qui a empêché le
   contrôle. Pour un produit acheté au poids en gros volume (le cœur de rumsteak
   YesFood, une centaine de kilos par semaine), le poids facturé et le prix au
   kilo sur la ligne du document : c'est le suivi des volumes, sans alerte. Pour
   un BL lu, s'il diffère de la réception déjà saisie dans l'appli, sur quelles
   lignes : pendant la période à blanc, c'est la preuve que la lecture est juste.
   Pour un avoir, ce qu'il solde.
4. **En pied**, une ligne chacun et seulement s'il y a lieu : les réceptions à
   saisir (point 7), les documents non lus et pourquoi, une action refusée qui a
   empêché quelque chose, les produits ajoutés au catalogue (5 bis), et toujours
   le compteur de fiabilité des factures (8 f).

Tout montant qui traduit une différence porte **un signe** : + ce qui coûte au
restaurant (payé plus cher, facturé sans avoir été reçu), − ce qui lui profite.

### Modèle

```
Objet : Réception du 25/09/2026 — 6 hausses de prix (+57,09 €) · facturé sans réception : 427,88 €

PRIX
  ▲ +89 %   Norbert jus d'ananas 1 L · Le Bihan    1,55 → 2,93 €/bouteille       +24,88 €   facture 20260950774 · fiche à mettre à jour
  ▲ +22 %   Filet de lieu noir · Mericq            8,99 → 9,99 puis 10,99 €/kg   +15,00 €   facture 47271835 · fiche à mettre à jour
  ▲ +99 %   Frais Mericq (éco-énergie + logistique, 4 livraisons)  10,50 → 20,90 €   +10,40 €   facture 47271835
  ▲ +8 %    Saucisse de Toulouse · Lodifrais       6,95 → 7,53 €/kg               +5,27 €   facture 73172530
  ▲ +13 %   Sauce salade 5 L · Lodifrais           7,50 → 8,50 €                  +1,00 €   facture 73172530
  ▲ +1,5 %  Préparation tiramisu · Lodifrais       6,20 → 6,29 €/L                +0,54 €   facture 73172530
  ▼ −19 %   Œufs, carton de 90 · Lodifrais        24,57 → 19,80 €                 −4,77 €   facture 73172530

FACTURÉ, PAS REÇU
  +427,88 €  Lodifrais, facture 73172530 : le BL IV296405 du 18/09 est facturé, mais sa commande
             O260917QM6IFB a été clôturée le 24/09 sans réception. Marchandise arrivée : rien à
             faire. Sinon : avoir à demander.

CONTRÔLÉS
  Lodifrais 73172530 — 1 654,80 € HT — conforme, hors ci-dessus
  Le Bihan 20260950774 — 596,80 € HT — conforme, hors prix
  Mericq 47271835 — 1 138,29 € HT — commandes passées hors appli : prix seuls contrôlés
  Les Platins 2026-09-0410 — 1 141,80 € HT — conforme
  DS, avoirs 6088625 (−44,51 €, retour de thon du 29/08) et 6088626 (−14,75 €, persil manquant le 05/09) — conformes
  Blason d'Or, BL 02297048 — 115,77 € HT — lu, réception pas encore saisie

Réceptions à saisir : Mericq BC260923-06, livraison prévue le 24/09
Factures : 3 d'affilée sans correction (bascule à 10)
```

## 7. Les réceptions à saisir

Tant qu'une commande livrée n'est pas réceptionnée, la facture qui arrivera
n'aura rien à quoi se comparer : c'est le vrai trou de la chaîne. Lister en pied
du mail, sur une ligne, les commandes dont la livraison est passée et qui ne
sont toujours pas réceptionnées :

```sql
select f.nom, c.numero, c.date_livraison
from cmd_commandes c join cmd_fournisseurs f on f.id = c.fournisseur_id
where c.statut in ('envoyee','confirmee') and c.date_livraison < current_date
order by c.date_livraison;
```

Une commande clôturée sans réception peut avoir été livrée quand même : c'est
la facture qui le dira (8 c).

## 8. Factures : les confronter aux livraisons

Une facture fournisseur est prélevée à l'échéance sans que personne la relise
ligne à ligne. C'est là que partent les euros d'un produit facturé mais jamais
reçu, ou d'un tarif qui a glissé. Chaque passage contrôle toutes les factures et
tous les avoirs arrivés depuis le passage précédent, et en rend compte dans le
même mail (point 6).

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
est cassée : l'écrire en pied du mail. Une facture sans PDF (saisie à la
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

Quatre cas à connaître :

- **Commande annulée, pourtant livrée.** Le 24/09/2026, quatorze commandes
  anciennes sont passées en `annulee`, note « Clôturée le 24/09/2026 : jamais
  réceptionnée dans l'appli, trop ancienne ». Certaines avaient bel et bien été
  livrées : le BL IV296405 du 18/09, 427,88 € HT sur la facture Lodifrais
  73172530, est celui de la commande O260917QM6IFB. Une commande annulée reste
  donc candidate ; si un BL facturé y mène, c'est une **livraison jamais
  réceptionnée**.
- **Commande déclarée non reçue** — statut `non_recue`, posé par la touche
  « Non reçue » de l'appli, qui l'efface des écrans : rien n'est arrivé. Elle
  reste en base pour ce contrôle-ci. Tout ce qu'une facture en porte
  va dans FACTURÉ, PAS REÇU et devient un avoir attendu. C'est la différence avec
  une commande annulée, qui peut avoir été livrée.
- **Réception « de principe ».** Quand toutes les quantités reçues d'une commande
  sont exactement les quantités commandées, produits pesés compris, la réception
  a presque toujours été validée sans relire le BL. Si la facture s'en écarte sur
  un produit pesé, c'est qu'elle reprend le poids du BL : le poids facturé fait
  foi, rien à signaler.
- **Aucune commande dans l'appli** — Mericq avant le 23/09/2026, commande
  téléphonée : contrôler les calculs et les prix des fiches, et dire que les
  quantités n'ont rien à quoi se comparer. Verdict « partielle ».

### 8 d. Comparer, ligne par ligne

- **Quantité** — une seule question : le fournisseur facture-t-il plus que ce
  qui a été **reçu** ? Jamais comparer à la quantité commandée. Ramener la
  quantité facturée à l'unité de la réception (point 4), en lisant le
  conditionnement dans la désignation : « 1L X6 » est un carton de 6 L, « 4K65 »
  un seau de 4,65 kg, « X90 » un carton de 90 œufs, « 25G X40 » un carton de 40
  choux, « 5K » un sac de 5 kg ; un fût Le Bihan se facture au litre, une caisse
  en « 24 COL ». Conversion ambiguë : ne rien affirmer. Produit pesé : le poids
  facturé fait foi, sauf si la réception porte un poids réellement relevé qui
  s'en écarte de plus de 10 %.
- **Prix** — prix facturé ramené à l'unité de l'appli en partant du montant de
  la ligne, le seul point fixe, puis comparé au prix de la ligne de commande et à
  celui de la fiche. Un écart compte s'il dépasse 1 % ou 1 € sur la ligne ; en
  dessous, c'est de l'arrondi.
- **Remplacement** — une autre référence livrée à la place de celle commandée :
  ne compte que si son prix diffère, comme une hausse ou une baisse.
- **Avoir** — retrouver la facture d'origine et la ligne créditée (dans
  `cmd_factures`, même `historique`) : même produit, même prix, quantité
  plausible ; puis l'avoir attendu qu'il solde au registre (8 f), s'il y en a un.

Facturé moins que reçu, livré mais pas facturé, offert : en faveur du
restaurant, rien à signaler.

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
  Carniato. Ils entrent dans le calcul du total ; ne les signaler que s'ils sont
  nouveaux ou en hausse par rapport à la facture précédente du fournisseur.
- **Le Bihan** : `montant = quantité × prix + droits` (colonne « Dt Droits ») ;
  les prix de l'appli sont droits compris, à la bouteille ou au litre ; les
  consignes et déconsignes sont hors HT (net facture = TTC + consignes −
  déconsignes).
- **Mericq** : sur une ligne en « U » (glace), le montant est `pièces × prix`, la
  colonne poids n'est pas une quantité ; « NetNet » = prix net. Les fiches sont à
  la caisse, à la boîte ou au coffre, avec leur poids nominal dans `poids_kg`
  (mises à jour le 25/09/2026 depuis la facture 47271835). Ce poids varie d'une
  livraison à l'autre : ne contrôler que le prix au kilo.
- **DS** : facture au kilo ce qui se commande au colis (point 4) ; ses avoirs
  citent la facture d'origine (« S/FRE ») et la commande sans son O initial
  (« 0260903YDLOCK » = O260903YDLOCK).
- **Pièce ou colis commandé, kilos facturés** (point 4) : fromages Lodifrais,
  boudin noir Lodifrais, lieu noir et saumon Mericq — commandés à la
  pièce ou au colis, pesés et facturés au poids. Seul le prix au kilo compte ; le
  poids ne se compare pas.
- **YesFood** : une centaine de kilos de cœur de rumsteak commandés, entre 80
  et 110 livrés, c'est normal — jamais d'alerte sur le poids. Suivre le prix au
  kilo (10,90 € en juillet 2026, 9,90 € depuis le 17/08) et le volume. La fiche
  n'a pas de prix : comparer à la facture YesFood précédente. Toutes les
  désignations de cœur de rumsteak (« PAD 2.0+ », « 2.5+ », « 3.5+ »,
  « Simmental », « cœur de rumsteck »…) se rattachent à la fiche « Coeur
  Rumsteak Pad 2.0+ » (réf. BCR2) : le patron suit le rumsteak dans son
  ensemble. L'entrecôte est un autre produit.

### 8 f. Rendre compte

Chaque facture nourrit le mail du point 6 : ses prix qui bougent dans **PRIX**,
ce qu'elle fait payer sans réception dans **FACTURÉ, PAS REÇU**, et une ligne
dans **CONTRÔLÉS** — « conforme », ou ce qui a empêché le contrôle : reportée,
illisible, commandes passées hors appli. Chaque ligne de PRIX ou de FACTURÉ,
PAS REÇU compte pour un écart de la facture.

**Registre `BL\factures-rapprochees.txt`.** Une fois le mail parti, y ajouter une
ligne par facture ou avoir contrôlé — pas pour une facture reportée. Le créer
avec son en-tête s'il n'existe pas ; ne jamais effacer une ligne.

    # id ; fournisseur ; document ; date ; HT ; BL couverts ; contrôlé le ; verdict ; écarts ; correction
    f1fd5aaa-2029-4d22-9e01-cf1ecad74075 ; Lodifrais ; facture 73172530 ; 20/09/2026 ; 1654,80 ; IV293958 IV295169 IV295361 IV296405 ; 25/09/2026 ; rapprochée ; 4 prix, 1 facturé pas reçu ;
    AVOIR ATTENDU ; Lodifrais ; facture <n°> ; spéculoos, 1 pièce, BL IV297811 ; 6,33 € ; noté le <date> ; en attente

Verdict **rapprochée** : toutes les lignes comparées à une réception ;
**partielle** : une partie n'avait rien à quoi se comparer ; **illisible** :
lecture ou calculs en échec, rien conclu. Une ligne facturée alors que la
réception dit qu'elle n'est pas arrivée, a été refusée ou reçue en moindre
quantité ajoute une ligne AVOIR ATTENDU ; un BL facturé sans aucune réception
attend d'abord la réponse du patron. Quand l'avoir arrive, remplacer « en
attente » par « reçu : avoir <n°> du <date> ». Un avoir attendu ne revient dans
le mail qu'après 15 jours sans nouvelles.

**Compteur de fiabilité.** Une erreur de la routine sur une facture — écart
inventé, écart manqué, mauvaise lecture — se note au bout de sa ligne :
« CORRIGÉ le <date> : <ce qui était faux> », à la main ou en le demandant à
Claude. Compter, en remontant le registre depuis la fin, les factures
« rapprochée » jusqu'à la première ligne CORRIGÉ : c'est le nombre de factures
d'affilée sans correction, affiché en pied du mail. « partielle »,
« illisible » et les avoirs ne comptent pas et ne remettent pas à zéro. À dix,
proposer la bascule de `MODE FACTURES` dans le mail ; c'est au patron de la
faire.

### 8 f bis. Le registre des achats

Seule écriture en base permise dès le mode À BLANC : le registre des achats
`cmd_achats`, une table d'analyse que ni l'appli ni les commandes ne lisent. Il
nourrira les statistiques de prix et de volumes (décision du patron du
25/09/2026). Pour chaque facture ou avoir contrôlé — pas pour une facture
reportée ou illisible —, une fois le mail parti et avant l'inscription au
registre `factures-rapprochees.txt`, y écrire **toutes ses lignes** : les
produits et les frais, pas les consignes.

```sql
insert into cmd_achats (facture_id, ligne, fournisseur_id, produit_id, date_livraison, numero_bl,
  type, reference, designation, quantite, unite, quantite_base, unite_base, prix_base, montant_ht)
values
  ('<facture>', 1, '<fournisseur>', '<produit ou null>', '<date du BL>', '<n° du BL>',
   'produit', '<réf.>', '<désignation de la facture>', <quantité>, '<unité facturée>',
   <quantité de base>, '<kg | L | pièce>', <montant ÷ quantité de base>, <montant HT>)
on conflict (facture_id, ligne) do nothing;
```

- `ligne` : le rang de la ligne sur la facture, 1, 2, 3… C'est ce qui empêche
  un doublon si la facture repasse.
- `date_livraison` : la date du BL de la ligne ; à défaut, celle de la facture.
- `produit_id` : la fiche retrouvée au point 8 c ; au moindre doute, `null`.
- Unité de base : **kg** pour une ligne facturée au poids, **L** au volume,
  sinon **pièce** — bouteille, boîte, colis, tel que facturé. Le prix de base
  est le montant divisé par cette quantité, droits compris chez Le Bihan.
- Avoir : quantités et montants négatifs.
- Frais (FA, F.G., logistique, transport…) : `type = 'frais'`, le montant seul.

Contrôle : la somme des montants insérés pour une facture retombe sur son total
HT, à quelques centimes d'arrondi près.

Rattrapage : une facture inscrite au registre `factures-rapprochees.txt` mais
absente de `cmd_achats` — les six contrôlées le 25/09/2026 au matin — se relit
et s'écrit au registre des achats, sans revenir dans le mail.

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
