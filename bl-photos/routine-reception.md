# Routine — réception des BL photographiés

Procédure autoportante pour une session Claude Code tournant sur le PC du
restaurant. Tout ce qu'il faut savoir est ici : ne rien demander à l'utilisateur
pour démarrer.

Objectif : transformer les photos de bons de livraison en réceptions enregistrées
dans l'appli Cuisine, **sans jamais inventer un chiffre**.

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

## 6. Classer et rendre compte

Déplacer la photo dans `G:\Mon Drive\Bl\traités\`, puis **envoyer le récap par
mail** à braiseandcobiganos@gmail.com via le connecteur Gmail. Un récap affiché
dans une fenêtre du PC n'est lu par personne, et surtout pas depuis le téléphone,
d'où se pilotent les commandes.

Objet : `Réception du <date> — <n> livraison(s), <n> écart(s)`. L'envoyer **même
les jours sans livraison** : le silence doit vouloir dire « la routine est
cassée », jamais « rien à signaler ». Contenu :

- commandes réceptionnées, leur numéro, le total du BL ;
- écarts entre commandé et livré, ligne par ligne ;
- prix qui ont bougé ;
- ce qui n'a pas pu être traité, et pourquoi.

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
