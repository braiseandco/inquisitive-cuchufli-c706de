from datetime import datetime
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    PageBreak,
)

EMPLOYEUR = {
    "raison_sociale": "SAS ARP BIGANOS",
    "adresse": "174 AV DE LA COTE D ARGENT",
    "code_postal_ville": "33380 BIGANOS",
    "siret": "81990125700017",
    "ape": "5610A",
    "representant_civilite": "Monsieur",
    "representant_nom": "FARGE alexandre",
    "representant_qualite": "Gérant",
    "urssaf_num": "727000000601947167",
    "urssaf_region": "Aquitaine",
    "ville_signature": "BIGANOS",
    "signataire_qualite": "directeur",
    "retraite": "GROUPE KLESIA 1-13 RARP rue Denise Buisson 93554 MONTREUIL CEDEX",
}

MOIS_FR = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre",
]


def _date_fr(d=None):
    d = d or datetime.now()
    return f"{d.day} {MOIS_FR[d.month - 1]} {d.year}"


def _styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "Title", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=14,
            alignment=TA_CENTER, spaceAfter=14,
        ),
        "article": ParagraphStyle(
            "Article", parent=base["Normal"],
            fontName="Helvetica-Bold", fontSize=11,
            alignment=TA_LEFT, spaceBefore=8, spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "Body", parent=base["Normal"],
            fontName="Helvetica", fontSize=10.5,
            alignment=TA_JUSTIFY, leading=14, spaceAfter=4,
        ),
        "body_center": ParagraphStyle(
            "BodyC", parent=base["Normal"],
            fontName="Helvetica", fontSize=10.5,
            alignment=TA_CENTER, leading=14, spaceAfter=4,
        ),
        "sign": ParagraphStyle(
            "Sign", parent=base["Normal"],
            fontName="Helvetica", fontSize=10,
            alignment=TA_LEFT, leading=13, spaceAfter=2,
        ),
        "sign_small": ParagraphStyle(
            "SignS", parent=base["Normal"],
            fontName="Helvetica-Oblique", fontSize=8.5,
            alignment=TA_LEFT, leading=11, spaceAfter=2,
        ),
    }


def _nom_complet(emp):
    civ = emp.get("civilite", "Mr")
    return f"{civ} {emp.get('prenom', '')} {emp.get('nom', '')}".strip()


def _b(s):
    return f"<b>{s}</b>"


def generer_contrat(employe, planning, fichier_pdf, date_signature=None):
    """Génère le PDF du contrat extra.

    employe : dict (issu de employes.py)
    planning : dict { jours: [...], total_heures_str, total_repas, ... }
    fichier_pdf : Path ou str
    """
    fichier_pdf = str(fichier_pdf)
    Path(fichier_pdf).parent.mkdir(parents=True, exist_ok=True)

    styles = _styles()
    doc = SimpleDocTemplate(
        fichier_pdf, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=1.8 * cm, bottomMargin=1.8 * cm,
        title="Contrat de travail extra",
    )

    nom = _nom_complet(employe)
    emp = EMPLOYEUR
    story = []

    story.append(Paragraph("CONTRAT DE TRAVAIL EXTRA", styles["title"]))
    story.append(Paragraph("Entre les soussignés :", styles["body"]))
    story.append(Spacer(1, 6))

    bloc_employeur = (
        f"La {_b(emp['raison_sociale'])}<br/>"
        f"{emp['adresse']}<br/>"
        f"{emp['code_postal_ville']}<br/>"
        f"Siret : {emp['siret']} &nbsp;&nbsp; APE : {emp['ape']}<br/>"
        f"Agissant par l'intermédiaire de son représentant légal, "
        f"{_b(emp['representant_civilite'] + ' ' + emp['representant_nom'])}, {emp['representant_qualite']}. "
        f"Les cotisations de sécurité sociale sont versées sous le numéro "
        f"{_b(emp['urssaf_num'])} à l'Urssaf d'{emp['urssaf_region']} "
        f"auprès de laquelle l'employeur est immatriculé."
    )
    story.append(Paragraph(bloc_employeur, styles["body"]))
    story.append(Spacer(1, 8))
    story.append(Paragraph("ET", styles["body_center"]))
    story.append(Spacer(1, 6))

    bloc_salarie = (
        f"{_b(nom)}<br/>"
        f"Adresse : {employe.get('adresse', '')}<br/>"
        f"Né(e) le {employe.get('date_naissance', '')}<br/>"
        f"de nationalité {employe.get('nationalite', 'française')}<br/>"
        f"Numéro de sécurité sociale {employe.get('num_secu', '')}"
    )
    story.append(Paragraph(bloc_salarie, styles["body"]))
    story.append(Spacer(1, 8))
    story.append(Paragraph("Il a été convenu et arrêté ce qui suit :", styles["body"]))

    story.append(Paragraph("Article 1 : Objet", styles["article"]))
    story.append(Paragraph(
        f"La {_b(emp['raison_sociale'])} engage {_b(nom)} "
        f"pour un contrat extra, emploi temporaire par nature.",
        styles["body"],
    ))

    story.append(Paragraph("Article 2 : Fonction", styles["article"]))
    fonction = employe.get("fonction", "employé polyvalent")
    niveau = employe.get("niveau", "1")
    echelon = employe.get("echelon", "1")
    story.append(Paragraph(
        f"{_b(nom)} est embauché(e) en qualité de {_b(fonction)} au niveau {niveau} "
        f"à l'échelon {echelon} selon la classification de la Convention Collective "
        f"Nationale des hôtels, cafés, restaurants, actuellement applicable à la société "
        f"et, pour autant qu'elle le demeurera.",
        styles["body"],
    ))

    story.append(Paragraph("Article 3 : Durée du contrat", styles["article"]))
    story.append(Paragraph(f"La durée de travail de {_b(nom)} :", styles["body"]))
    for j in planning["jours"]:
        ligne = f"{j['date']} : {j['heure_debut']} {j['heure_fin']}"
        story.append(Paragraph(ligne, styles["body"]))
    story.append(Spacer(1, 4))
    repas_str = f" et {planning['total_repas']} repas" if planning["total_repas"] else ""
    story.append(Paragraph(
        f"soit : {_b(planning['total_heures_str'])}{repas_str}",
        styles["body"],
    ))

    story.append(Paragraph("Article 4 : Rémunération", styles["article"]))
    taux = str(employe.get("taux_horaire", "12.31")).replace(".", ",")
    story.append(Paragraph(
        f"{_b(nom)} percevra un salaire brut à un taux horaire de "
        f"{_b(taux + ' EUROS')}, plus les avantages en nature.",
        styles["body"],
    ))

    story.append(Paragraph("Article 5 : Congés payés", styles["article"]))
    story.append(Paragraph(
        "Vous avez droit à une indemnité de congés payés qui sera égale à 10 % "
        "de votre rémunération brute perçue.",
        styles["body"],
    ))

    story.append(Paragraph("Article 6 : Caisse de retraite et de prévoyance", styles["article"]))
    story.append(Paragraph(
        f"{_b(nom)} sera affilié(e) à la caisse de retraite complémentaire, "
        f"prévoyance et mutuelle dont dépend la {_b(emp['raison_sociale'])} : "
        f"{emp['retraite']}.",
        styles["body"],
    ))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        f"La déclaration préalable à l'embauche de {_b(nom)} a été effectuée à l'URSSAF "
        f"dont ci-joint copie.",
        styles["body"],
    ))
    story.append(Spacer(1, 4))
    story.append(Paragraph(
        f"Conformément à la loi n° 78-17 du 06/01/1978 modifiée par la loi n° 2004-801 "
        f"du 06/08/2004 relative à l'informatique, aux fichiers et aux libertés, "
        f"{_b(nom)} dispose d'un droit d'accès et de rectification aux informations "
        f"qui sont enregistrées dans le fichier informatisé tenu par l'organisme de "
        f"protection sociale (URSSAF).",
        styles["body"],
    ))

    story.append(Spacer(1, 14))
    story.append(Paragraph("Fait en deux exemplaires", styles["body"]))
    date_str = _date_fr(date_signature) if date_signature else _date_fr()
    story.append(Paragraph(f"À {emp['ville_signature']}, le {date_str}", styles["body"]))
    story.append(Spacer(1, 20))

    story.append(Paragraph("Signature Employeur", styles["sign"]))
    story.append(Paragraph("(Précisez le nom et la qualité du signataire)", styles["sign_small"]))
    story.append(Paragraph(
        f"{emp['representant_nom']} ({emp['signataire_qualite']})",
        styles["sign"],
    ))
    story.append(Spacer(1, 24))
    story.append(Paragraph("Signature Salarié", styles["sign"]))
    story.append(Paragraph(
        "(Précédée de la mention manuscrite « lu et approuvé » de la main du salarié)",
        styles["sign_small"],
    ))

    doc.build(story)
    return fichier_pdf
