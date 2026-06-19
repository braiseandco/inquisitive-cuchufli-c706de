import json
from pathlib import Path

DATA_FILE = Path(__file__).parent / "data" / "employes.json"

CHAMPS = [
    ("civilite", "Civilité (Mr/Mme)"),
    ("prenom", "Prénom"),
    ("nom", "Nom"),
    ("adresse", "Adresse complète"),
    ("date_naissance", "Date de naissance (jj/mm/aaaa)"),
    ("nationalite", "Nationalité"),
    ("num_secu", "N° sécurité sociale"),
    ("fonction", "Fonction"),
    ("niveau", "Niveau"),
    ("echelon", "Échelon"),
    ("taux_horaire", "Taux horaire brut (EUR)"),
]

DEFAULTS = {
    "civilite": "Mr",
    "nationalite": "française",
    "fonction": "employé polyvalent",
    "niveau": "1",
    "echelon": "1",
    "taux_horaire": "12.31",
}

# SMIC horaire brut HCR niveau 1 échelon 1 — à mettre à jour si le SMIC bouge
SMIC_HORAIRE = 12.31


def _load():
    if not DATA_FILE.exists():
        return []
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def _save(employes):
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(employes, f, ensure_ascii=False, indent=2)


def list_employes():
    return _load()


def get_employe(emp_id):
    for e in _load():
        if e.get("id") == emp_id:
            return e
    return None


def find_by_name(query):
    q = query.lower().strip()
    for e in _load():
        full = f"{e.get('prenom', '')} {e.get('nom', '')}".lower().strip()
        full_rev = f"{e.get('nom', '')} {e.get('prenom', '')}".lower().strip()
        if q == full or q == full_rev or q in full or q in full_rev:
            return e
    return None


def save_employe(data):
    employes = _load()
    if data.get("id"):
        for i, e in enumerate(employes):
            if e["id"] == data["id"]:
                employes[i] = data
                break
    else:
        next_id = max((e["id"] for e in employes), default=0) + 1
        data["id"] = next_id
        employes.append(data)
    _save(employes)
    return data


def delete_employe(emp_id):
    employes = [e for e in _load() if e.get("id") != emp_id]
    _save(employes)


def display_name(e):
    return f"{e.get('prenom', '')} {e.get('nom', '')}".strip()
