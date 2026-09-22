# Routine — réception des BL photographiés

Procédure à suivre par Claude Code, sur le PC du restaurant, au démarrage de la
session. Objectif : transformer les photos de bons de livraison en réceptions
enregistrées dans l'appli Cuisine, sans jamais inventer un chiffre.

## Où sont les photos

`%USERPROFILE%\Mon Drive\BL\AAAA-MM-JJ\` — un sous-dossier par jour de livraison,
alimenté depuis Gmail par `gmail-vers-drive.gs` et synchronisé par Google Drive
pour ordinateur. Les fichiers déjà traités sont dans `BL\traités\`.

Traiter uniquement les photos qui ne sont pas encore dans `traités`.

## 1. Ouvrir la photo

**Appliquer la rotation EXIF avant toute chose.** Les photos de téléphone sont
stockées couchées : à l'écran elles paraissent droites, sur disque elles ne le
sont pas. Sans cette rotation, le BL est illisible.

Si le premier caractère des codes produits est coupé sur le bord gauche, le
déduire du contexte (les codes DS font 5 chiffres) et le signaler dans le récap —
c'est un défaut de cadrage à corriger côté serveur, pas une fatalité.

## 2. Lire, puis vérifier la lecture

Relever pour chaque ligne : code produit, désignation, unité, quantité livrée,
prix unitaire, montant.

**Les colonnes chiffrées peuvent être décalées d'une ligne par rapport aux
désignations.** C'est arrivé sur le BL du 22/09/2026 et un OCR naïf y attribuerait
chaque prix au mauvais produit. La parade est arithmétique, et elle est
obligatoire :

1. `prix unitaire × quantité = montant` sur chaque ligne ;
2. la somme des montants = le sous-total imprimé ;
3. recouper au moins deux prix avec ceux des fiches produits.

Si les trois contrôles ne passent pas, la lecture est fausse : ne rien écrire,
le signaler dans le récap.

## 3. Retrouver la commande

Base Supabase `ugyrrnqpapeagpuocwob`, tables `cmd_*`.

```sql
select c.id, c.numero, c.statut, c.date_livraison, l.id, l.nom, l.unite, l.quantite, l.reference
from cmd_commandes c join cmd_commande_lignes l on l.commande_id = c.id
where c.fournisseur_id = (select id from cmd_fournisseurs where nom = 'DS Restauration')
  and c.statut in ('envoyee','confirmee')
order by c.date_livraison desc;
```

Rattacher par les références produits communes et la proximité de date. Plusieurs
BL peuvent couvrir une même commande (DS sépare par zone de température : le
22/09, 1192895 pour le surgelé et le sec, 1192885 pour l'huile).

**En cas de doute sur la commande, ne rien écrire.** Une réception posée sur la
mauvaise commande est plus coûteuse à rattraper qu'une réception oubliée.

## 4. Convertir dans l'unité de la ligne de commande

DS facture au kilo des produits commandés au colis. La fiche produit porte
`poids_kg`, le poids d'une unité de commande :

| Produit | Unité appli | `poids_kg` | Exemple |
|---|---|---|---|
| Haricots verts | Poche(s) | 2,5 | 5 kg au BL → **2 poches** |
| Tender poulet | Poche(s) | 2,5 | 20 kg au BL → **8 poches** |
| Framboise brisée | Carton(s) | 5 | 10 kg au BL → **2 cartons** |
| Champignons émincés | Boîte(s) | 2,5 | 2,5 kg au BL → **1 boîte** |

Convertir selon l'unité de **la ligne de commande**, pas celle de la fiche
produit : une commande partie en kilos avant la bascule en poches se compare
toujours en kilos.

## 5. Écrire la réception

```sql
update cmd_commande_lignes set qte_recue = <quantité convertie> where id = '<ligne>';

update cmd_commandes set
  statut = 'livree', date_reception = now(),
  numero_bl = '<n° du ou des BL>', recu_par = 'BL papier (photo)',
  reception_note = '<écarts constatés, n° de commande fournisseur>',
  updated_at = now()
where id = '<commande>';
```

Mettre à jour un prix de fiche produit **uniquement** si le BL le contredit et
que les trois contrôles du point 2 sont passés. Tracer alors le changement :

```sql
insert into cmd_prix_historique (produit_id, prix, source, date)
values ('<produit>', <prix>, 'BL <numéro> du <date>', '<date>');
```

## 6. Classer et rendre compte

Déplacer la photo dans `BL\traités\`, puis **envoyer le récap par mail** à
braiseandcobiganos@gmail.com, via le connecteur Gmail de la session. Un récap
qui reste affiché dans une fenêtre du PC n'est pas un récap : personne ne le lit,
et surtout pas depuis le téléphone, d'où se pilotent les commandes.

Objet : `Réception du <date> — <n> livraison(s), <n> écart(s)`. L'envoyer **même
les jours sans livraison** — le silence doit vouloir dire « la routine est
cassée », jamais « rien à signaler ». Contenu :

- commandes réceptionnées, avec leur numéro et le total du BL ;
- écarts entre commandé et livré, ligne par ligne ;
- prix qui ont bougé ;
- ce qui n'a pas pu être traité, et pourquoi.

## Exemple traité le 22/09/2026

BL 1192895 + 1192885, commande BC260920-02, 12 lignes. Colonnes décalées d'une
ligne, recalées par l'arithmétique : 383,21 € + 18,90 € = 402,11 € HT, exactement
la valorisation des quantités reçues. Un seul écart : haricots verts commandés
3 kg, livrés 5 kg — DS arrondit à la poche de 2,5 kg. Trois prix de fiches
corrigés au passage, dont la framboise brisée qui sous-estimait la commande de
52 €.
