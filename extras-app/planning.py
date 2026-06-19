import csv
from collections import OrderedDict
from datetime import datetime


def _parse_time(s):
    s = s.strip().replace("h", ":").replace("H", ":")
    if ":" not in s:
        s = s + ":00"
    parts = s.split(":")
    h = int(parts[0])
    m = int(parts[1]) if len(parts) > 1 and parts[1] else 0
    return h, m


def _duration_hours(debut, fin):
    h1, m1 = _parse_time(debut)
    h2, m2 = _parse_time(fin)
    total = (h2 * 60 + m2) - (h1 * 60 + m1)
    if total < 0:
        total += 24 * 60
    return total / 60.0


def _fmt_time(s):
    h, m = _parse_time(s)
    return f"{h}h{m:02d}" if m else f"{h}h"


def _fmt_hours(hours):
    h = int(hours)
    m = round((hours - h) * 60)
    if m == 0:
        return f"{h}h"
    return f"{h}h{m:02d}"


def parse_csv(path):
    """Parse CSV planning.

    Format attendu: employe;date;heure_debut;heure_fin;repas
    Retourne: OrderedDict { nom_employe: { 'jours': [...], 'total_heures': float, 'total_repas': int } }
    """
    plannings = OrderedDict()
    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            nom = row["employe"].strip()
            if not nom:
                continue
            date = row["date"].strip()
            debut = row["heure_debut"].strip()
            fin = row["heure_fin"].strip()
            try:
                repas = int(row.get("repas", "0") or "0")
            except ValueError:
                repas = 0

            duree = _duration_hours(debut, fin)
            jour = {
                "date": date,
                "heure_debut": _fmt_time(debut),
                "heure_fin": _fmt_time(fin),
                "duree": duree,
                "repas": repas,
            }
            if nom not in plannings:
                plannings[nom] = {"jours": [], "total_heures": 0.0, "total_repas": 0}
            plannings[nom]["jours"].append(jour)
            plannings[nom]["total_heures"] += duree
            plannings[nom]["total_repas"] += repas

    for p in plannings.values():
        p["total_heures_str"] = _fmt_hours(p["total_heures"])
        p["jours"].sort(key=lambda j: datetime.strptime(j["date"], "%d/%m/%Y"))
        p["date_debut"] = p["jours"][0]["date"] if p["jours"] else ""
        p["date_fin"] = p["jours"][-1]["date"] if p["jours"] else ""

    return plannings
