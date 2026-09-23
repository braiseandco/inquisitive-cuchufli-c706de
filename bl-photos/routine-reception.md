# Routine — réception des BL photographiés

Procédure autoportante pour une session Claude Code tournant sur le PC du
restaurant. Tout ce qu'il faut savoir est ici : ne rien demander à l'utilisateur
pour démarrer.

Objectif : transformer les photos de bons de livraison en réceptions enregistrées
dans l'appli Cuisine, **sans jamais inventer un chiffre**.

## Mode de fonctionnement

    MODE = À BLANC

C'est la seule ligne à changer pour basculer. Les deux valeurs possibles :

- **À BLANC** — faire la lecture et tous les contrôles, puis écrire dans le récap
  *ce qui serait enregistré*, ligne par ligne, avec les écarts et les prix qui
  bougeraient. **N'écrire absolument rien en base** : ni `qte_recue`, ni statut,
  ni prix, ni `traite_at`. Ne pas déplacer les photos non plus — elles doivent
  rester à traiter pour que la réception manuelle serve de comparaison.
- **ÉCRITURE** — appliquer la procédure complète, points 5 et 6 compris.

Pendant la période à blanc, le récap sert de preuve : on le compare à la
réception faite à la main. La bascule en écriture est décidée sur un critère
chiffré — dix bons de livraison d'affilée sans une seule correction à apporter —
et pas sur une impression.

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
| `cmd_factures` | factures et documents fournisseurs reçus par mail |

Fournisseurs actifs : **DS Restauration** (mail, livraison mardi et vendredi,
facture au kilo, n° client 382952), **Lodifrais** (mail, livraison le mercredi,
envoie des accusés de réception lus automatiquement par l'appli), **Mericq**
(SMS), **Blason d'Or**, **Aux Jardins de l'Atlantique**, **Maison Lartigue**.

Certains fournisseurs n'envoient aucun BL par mail — DS notamment. Leur bon de
livraison n'existe que sur papier, photographié à la réception : c'est la raison
d'être de cette routine.

## Où sont les photos

Deux sources, à traiter toutes les deux.

### 1. Le bouton « Photographier le BL » de l'appli — source principale

Le serveur ouvre la commande dans l'écran Réception et photographie le bon.
**La commande est donc déjà connue** : aucun rattachement à deviner, ce qui
supprime le risque le plus sérieux de toute la chaîne.

```sql
select b.id, b.path, b.created_at, b.prise_par,
       c.id as commande_id, c.numero, c.date_livraison, f.nom as fournisseur
from cmd_bl_photos b
join cmd_commandes c on c.id = b.commande_id
join cmd_fournisseurs f on f.id = c.fournisseur_id
where b.traite_at is null
order by b.created_at;
```

Télécharger chaque photo depuis le bucket `factures` (la clé publique de l'appli
est dans la page, il n'y a pas de secret à manipuler) :

```bash
KEY=$(curl -s https://app.braiseandco.fr/boissons/index.html | grep -oP "const SB_KEY = '\K[^']+")
curl -s -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  "https://ugyrrnqpapeagpuocwob.supabase.co/storage/v1/object/authenticated/factures/<path>" -o bl.jpg
```

Une fois la réception écrite : `update cmd_bl_photos set traite_at = now() where id = '<id>';`
La photo reste dans le bucket, attachée à la commande — c'est la preuve pour une
contestation et la pièce du comptable.

### 2. Le dossier Drive — filet de sécurité

`G:\Mon Drive\Bl\` — un sous-dossier par jour de livraison, alimenté depuis
Gmail par le script `gmail-vers-drive.gs`. Sert aux photos envoyées par mail sans
passer par l'appli. Là, **la commande est à retrouver** (point 3).

Traiter toute photo qui n'est pas déjà dans `G:\Mon Drive\Bl\traités\`, **y
compris à la racine de `Bl`** : une photo déposée à la main n'est pas dans un
sous-dossier de date. Créer `traités` s'il n'existe pas.

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

Déplacer la photo dans `G:\Mon Drive\Bl\traités\`, puis **envoyer le récap par
mail** à braiseandcobiganos@gmail.com via le connecteur Gmail. Un récap affiché
dans une fenêtre du PC n'est lu par personne, et surtout pas depuis le téléphone,
d'où se pilotent les commandes.

Objet : `Réception du <date> — <n> livraison(s), <n> écart(s)`. L'envoyer **même
les jours sans livraison** : le silence doit vouloir dire « la routine est
cassée », jamais « rien à signaler ».

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

Ajouter ensuite, s'il y a lieu : ce qui n'a pas pu être traité et pourquoi, et
les réceptions en retard (point 7).

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

S'il n'y a aucun manquant, l'écrire : « Aucun manquant aujourd'hui. »

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

## Limites à respecter

- **Ne jamais écrire dans le doute.** Abstention + récap valent mieux qu'une
  écriture fausse.
- **Ne pas modifier le code de l'appli**, ni committer quoi que ce soit dans le
  dépôt. Cette routine ne touche qu'aux données de réception.
- **Ne pas supprimer de photo** : la déplacer dans `traités`, jamais l'effacer.

## Exemples déjà traités le 22/09/2026

**DS Restauration**, BL 1192895 + 1192885, commande BC260920-02, 12 lignes.
Colonnes décalées d'une ligne, recalées par l'arithmétique : 383,21 € + 18,90 €
= 402,11 € HT, exactement la valorisation des quantités reçues. Un seul écart :
haricots verts commandés 3 kg, livrés 5 kg — DS arrondit à la poche de 2,5 kg.

**Aux Jardins de l'Atlantique**, BL163993, commande O260921ZNIFUL, 14 lignes,
259,85 € HT. Écart : citron jaune 3,44 kg pesés pour 3 kg commandés. Quatre prix
recalés (chou blanc, courgette, poivron rouge, tomate grappe) — et c'est sur ce
BL qu'a été repéré l'oubli du report des prix sur les lignes de commande.
