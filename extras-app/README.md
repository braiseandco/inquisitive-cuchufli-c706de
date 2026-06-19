# Contrats Extra — SAS ARP Biganos

Application Windows pour générer automatiquement les contrats d'extra à partir d'un planning CSV.

## Installation

### Option 1 — Utilisation directe (Python requis)

1. Installer Python 3.10+ (https://www.python.org/) — cocher "Add Python to PATH"
2. Double-cliquer sur `run.bat`

### Option 2 — Construire un .exe autonome

1. Installer Python 3.10+
2. Double-cliquer sur `build.bat`
3. L'exécutable est créé dans `dist\ContratsExtra.exe` — copiable n'importe où, plus besoin de Python

## Utilisation

### 1. Créer les fiches employés

Onglet **Employés** → Nouveau → remplir, Enregistrer.

Champs : civilité, prénom, nom, adresse, date de naissance, nationalité, n° SS, fonction, niveau, échelon, taux horaire.

Sauvegardés dans `data\employes.json`.

### 2. Préparer le planning

**Format A — ODS hebdomadaire (LibreOffice Calc)** — c'est ton format habituel.

Structure :
```
JOUR     | mardi      | mercredi   | jeudi      | vendredi   | samedi     | dimanche
KOHLER   | 11h 15h30  | 11h 15h30  | 11h 15h30  |            | 18h 24h    |          | 18h 24h | 10h30 16h | 28
         | 4          | 4          | 4          |            | 5,5        |          | 5,5     | 5
HSUP
```

Les 8 colonnes de services correspondent à :
1. mardi midi · 2. mercredi midi · 3. jeudi midi · 4. vendredi midi · 5. vendredi soir · 6. samedi midi · 7. samedi soir · 8. dimanche midi

Le **total déclaré** (dernière colonne) est utilisé dans le contrat (c'est ce qui est payé).

**Format B — CSV simple** :
```
employe;date;heure_debut;heure_fin;repas
kohler ethan-Chris;09/06/2026;11:00;15:30;1
```

Exemple fourni : `data\exemple_planning.csv`.

### 3. Importer le planning

Onglet **Planning** :
1. Renseigner la **date du mardi de la semaine** (boutons "Cette semaine" / "Semaine ±1")
2. Bouton **Importer planning** → choisir le `.ods` (ou `.csv`)

L'app regroupe par employé et calcule total heures + repas.

### 4. Générer les contrats

Onglet **Générer contrats** → vérifier les associations CSV ↔ fiche employé → bouton **Générer TOUS les contrats**.

Les PDF sont créés dans `output\` :
`contrat_extra_kohler_ethan-chris_09-06-2026_au_11-06-2026.pdf`

## Structure du projet

```
extras-app/
├── main.py             # UI Tkinter (point d'entrée)
├── employes.py         # CRUD fiches employés
├── planning.py         # Parser CSV planning
├── contrat_pdf.py      # Génération PDF via ReportLab
├── data/
│   ├── employes.json           (créé au 1er enregistrement)
│   └── exemple_planning.csv
├── output/             # PDF générés
├── run.bat             # Lancement direct (Python requis)
├── build.bat           # Build .exe autonome
└── requirements.txt
```

## Évolutions prévues

- Phase 2 : export du planning vers l'app planning tablette (Supabase)
