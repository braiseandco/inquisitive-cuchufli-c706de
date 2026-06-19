"""Parser du planning hebdomadaire au format ODS (LibreOffice Calc).

Structure attendue (Feuille1) :
    JOUR | mardi | mercredi | jeudi | vendredi | samedi | dimanche | TOTAL

Chaque salarié occupe 3 lignes :
    NOM | s1 | s2 | s3 | s4 | s5 | s6 | s7 | s8 | TOTAL_HEURES
        |  h1 |  h2 | ...  (heures comptées par service, optionnel)
    H.SUP | ...

Mapping des 8 services (semaine standard restaurant) :
    s1 = mardi midi          (jour J+0)
    s2 = mercredi midi       (J+1)
    s3 = jeudi midi          (J+2)
    s4 = vendredi midi       (J+3)
    s5 = vendredi soir       (J+3)
    s6 = samedi midi         (J+4)
    s7 = samedi soir         (J+4)
    s8 = dimanche midi       (J+5)

J = date du mardi de référence (fournie par l'utilisateur).
"""
import re
import zipfile
import xml.etree.ElementTree as ET
from collections import OrderedDict
from datetime import datetime, timedelta

NS = {
    "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0",
    "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
}

# Décalage en jours par rapport au mardi pour chaque colonne (s1..s8)
SERVICE_OFFSETS = [0, 1, 2, 3, 3, 4, 4, 5]
SERVICE_LABELS = [
    "mardi midi", "mercredi midi", "jeudi midi",
    "vendredi midi", "vendredi soir",
    "samedi midi", "samedi soir",
    "dimanche midi",
]

REPOS_TOKENS = {"REPOS", "OFF", "X", "-", "CP", "MALADIE", "ACCIDENT", "AT"}


def _q(tag, ns="table"):
    return f"{{{NS[ns]}}}{tag}"


def _cell_text(cell):
    parts = []
    for p in cell.iter(_q("p", "text")):
        if p.text:
            parts.append(p.text)
        for child in p.iter():
            if child.tag.endswith("}span") and child.text:
                parts.append(child.text)
    return "".join(parts).strip()


def _read_rows(ods_path):
    """Retourne la liste des lignes de la première feuille, chaque ligne = liste de strings."""
    with zipfile.ZipFile(ods_path) as z:
        with z.open("content.xml") as f:
            tree = ET.parse(f)
    root = tree.getroot()
    table = root.find(f".//{_q('table')}")
    if table is None:
        return []
    rows = []
    for row in table.findall(_q("table-row")):
        cells = []
        for cell in row.findall(_q("table-cell")):
            txt = _cell_text(cell)
            repeat = int(cell.get(_q("number-columns-repeated"), "1"))
            if repeat > 50:
                repeat = 1
            for _ in range(repeat):
                cells.append(txt)
        while cells and cells[-1] == "":
            cells.pop()
        rows.append(cells)
    return rows


_TIME_RE = re.compile(r"(\d{1,2})[hH:](\d{2})?(?!\d)")


def _parse_slot(text):
    """Parse '11h 15h30' -> ('11h', '15h30', duree_h). Retourne None si REPOS/vide."""
    if not text:
        return None
    clean = text.strip()
    upper = clean.upper()
    if any(tok in upper for tok in REPOS_TOKENS):
        return None
    matches = _TIME_RE.findall(clean)
    if len(matches) < 2:
        return None

    def to_hm(m):
        h = int(m[0])
        mn = int(m[1]) if m[1] else 0
        return h, mn

    h1, m1 = to_hm(matches[0])
    h2, m2 = to_hm(matches[1])
    minutes = (h2 * 60 + m2) - (h1 * 60 + m1)
    if minutes <= 0:
        minutes += 24 * 60
    duree = minutes / 60.0
    fmt = lambda h, m: f"{h}h{m:02d}" if m else f"{h}h"
    return fmt(h1, m1), fmt(h2, m2), duree


def _fmt_hours(hours):
    h = int(hours)
    m = round((hours - h) * 60)
    if m == 0:
        return f"{h}h"
    return f"{h}h{m:02d}"


def _is_employee_row(cells):
    """Une ligne employé a un nom (uppercase) en col 0 et au moins une donnée plus loin."""
    if not cells or not cells[0]:
        return False
    first = cells[0].strip()
    if not first:
        return False
    # Ignore les en-têtes connus
    if first.upper() in {"JOUR", "TOTAL", "H.SUP", "HSUP"}:
        return False
    # Au moins une lettre alphabétique
    if not re.search(r"[A-Za-zÀ-ÿ]", first):
        return False
    return True


def parse_ods(path, mardi_ref):
    """Parse l'ODS et retourne OrderedDict[nom_employe] -> dict planning.

    mardi_ref : datetime.date — date du mardi de la semaine.
    """
    rows = _read_rows(path)
    plannings = OrderedDict()

    for cells in rows:
        if not _is_employee_row(cells):
            continue
        nom = cells[0].strip()
        # Colonnes 1..8 = services s1..s8
        slots_raw = cells[1:9]
        # Compléter si moins de 8 cellules
        slots_raw += [""] * (8 - len(slots_raw))
        # Total déclaré dans la feuille (dernière cellule numérique)
        total_declare = None
        for c in reversed(cells[9:] + [cells[8]] if len(cells) > 8 else cells):
            txt = c.replace(",", ".").strip()
            try:
                total_declare = float(txt)
                break
            except (ValueError, AttributeError):
                continue

        jours = []
        for i, slot_txt in enumerate(slots_raw):
            parsed = _parse_slot(slot_txt)
            if not parsed:
                continue
            hd, hf, duree = parsed
            date = mardi_ref + timedelta(days=SERVICE_OFFSETS[i])
            jours.append({
                "date": date.strftime("%d/%m/%Y"),
                "heure_debut": hd,
                "heure_fin": hf,
                "duree": duree,
                "service": SERVICE_LABELS[i],
                "repas": 1,  # défaut : 1 repas par service
            })

        if not jours:
            continue

        total_calcule = sum(j["duree"] for j in jours)
        total_repas = sum(j["repas"] for j in jours)
        plannings[nom] = {
            "jours": jours,
            "total_heures": total_declare if total_declare else total_calcule,
            "total_heures_str": _fmt_hours(total_declare if total_declare else total_calcule),
            "total_repas": total_repas,
            "total_calcule": total_calcule,
            "total_declare": total_declare,
            "date_debut": jours[0]["date"],
            "date_fin": jours[-1]["date"],
        }

    return plannings
