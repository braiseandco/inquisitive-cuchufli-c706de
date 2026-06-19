# -*- coding: utf-8 -*-
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_JUSTIFY, TA_CENTER
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                PageBreak, HRFlowable, ListFlowable, ListItem)

OUT = r"C:\Users\brais\OneDrive\Documents\GitHub\inquisitive-cuchufli-c706de\Dossier_Atelier_des_Garcons_Rouillon.pdf"

NAVY = colors.HexColor("#1f3a5f")
GREY = colors.HexColor("#555555")
LIGHT = colors.HexColor("#eef2f7")
LINE = colors.HexColor("#b9c4d4")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle("TitleBig", parent=styles["Title"], fontSize=20, leading=24, textColor=NAVY, spaceAfter=6))
styles.add(ParagraphStyle("Sub", parent=styles["Normal"], fontSize=10.5, leading=14, textColor=GREY, alignment=TA_CENTER))
styles.add(ParagraphStyle("H1", parent=styles["Heading1"], fontSize=13.5, leading=17, textColor=colors.white,
                          backColor=NAVY, borderPadding=(5,6,5,6), spaceBefore=14, spaceAfter=8))
styles.add(ParagraphStyle("H2", parent=styles["Heading2"], fontSize=11.5, leading=15, textColor=NAVY, spaceBefore=9, spaceAfter=3))
styles.add(ParagraphStyle("Body", parent=styles["Normal"], fontSize=10, leading=14, alignment=TA_JUSTIFY, spaceAfter=5))
styles.add(ParagraphStyle("Small", parent=styles["Normal"], fontSize=8.4, leading=11, textColor=GREY))
styles.add(ParagraphStyle("Cell", parent=styles["Normal"], fontSize=9, leading=12))
styles.add(ParagraphStyle("CellB", parent=styles["Normal"], fontSize=9, leading=12, fontName="Helvetica-Bold"))
styles.add(ParagraphStyle("Note", parent=styles["Normal"], fontSize=9, leading=12.5, textColor=colors.HexColor("#7a3b00"),
                          backColor=colors.HexColor("#fff4e5"), borderColor=colors.HexColor("#e0a96d"),
                          borderWidth=0.5, borderPadding=(5,6,5,6), spaceAfter=6, alignment=TA_JUSTIFY))

def P(t, s="Body"): return Paragraph(t, styles[s])
def H1(t): return Paragraph(t, styles["H1"])
def H2(t): return Paragraph(t, styles["H2"])

def kv_table(rows, c0=44*mm):
    data = [[Paragraph(k, styles["CellB"]), Paragraph(v, styles["Cell"])] for k, v in rows]
    t = Table(data, colWidths=[c0, None])
    t.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("BACKGROUND", (0,0), (0,-1), LIGHT),
        ("LINEBELOW", (0,0), (-1,-1), 0.4, LINE),
        ("LINEAFTER", (0,0), (0,-1), 0.4, LINE),
        ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("LEFTPADDING", (0,0), (-1,-1), 6), ("RIGHTPADDING", (0,0), (-1,-1), 6),
    ]))
    return t

def grid_table(header, rows, widths):
    data = [[Paragraph(h, styles["CellB"]) for h in header]]
    for r in rows:
        data.append([Paragraph(str(x), styles["Cell"]) for x in r])
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), NAVY), ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, LIGHT]),
        ("GRID", (0,0), (-1,-1), 0.4, LINE), ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("TOPPADDING", (0,0), (-1,-1), 4), ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ("LEFTPADDING", (0,0), (-1,-1), 5), ("RIGHTPADDING", (0,0), (-1,-1), 5),
    ]))
    return t

def bullets(items):
    return ListFlowable([ListItem(P(i), leftIndent=6) for i in items], bulletType="bullet",
                        start="circle", leftIndent=12, spaceBefore=2, spaceAfter=4)

def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE); canvas.setLineWidth(0.4)
    canvas.line(20*mm, 14*mm, 190*mm, 14*mm)
    canvas.setFont("Helvetica", 7.5); canvas.setFillColor(GREY)
    canvas.drawString(20*mm, 9*mm, "Note de synthèse confidentielle - à l'attention du conseil. Sources publiques + déclarations du client.")
    canvas.drawRightString(190*mm, 9*mm, "Page %d" % doc.page)
    canvas.restoreState()

story = []

# ---------- COVER ----------
story.append(Spacer(1, 26*mm))
story.append(P("NOTE DE SYNTHÈSE", "Sub"))
story.append(Spacer(1, 4*mm))
story.append(Paragraph("Litige travaux d'aménagement extérieur<br/>L'Atelier des Garçons &amp; M. Romain ROUILLON", styles["TitleBig"]))
story.append(Spacer(1, 3*mm))
story.append(P("Inachèvement et malfaçons du chantier — facturation par une société tierce", "Sub"))
story.append(P("Document préparatoire destiné à l'avocat", "Sub"))
story.append(Spacer(1, 12*mm))
story.append(kv_table([
    ("Établi le", "19 juin 2026"),
    ("Client / maître d'ouvrage", "[À COMPLÉTER : nom et adresse du client]"),
    ("Entreprise ayant réalisé les travaux", "L'ATELIER DES GARÇONS (Mios, 33)"),
    ("Interlocuteur unique du client", "« Romain » = M. Romain-Roland ROUILLON"),
    ("Entité ayant émis la facture", "EXPORT CONSULTING DENIA SL (société espagnole)"),
    ("Constat d'huissier", "prévu le mardi 23 juin 2026"),
]))
story.append(Spacer(1, 10*mm))
story.append(Paragraph(
    "<b>Avertissement.</b> Les données d'entreprises proviennent de registres publics officiels (voir « Sources »). "
    "Les faits relatifs au chantier sont rapportés par le client et seront étayés par le constat d'huissier et les "
    "pièces (devis, facture, photographies). Le présent document est purement factuel et ne constitue pas une "
    "consultation juridique.", styles["Note"]))
story.append(PageBreak())

# ---------- 1. QUI EST QUI ----------
story.append(H1("1. Qui est qui — cartographie des intervenants"))
story.append(P("Point central du dossier : <b>la personne qui a réalisé et dirigé les travaux n'est ni la gérante "
               "officielle de l'entreprise, ni l'émetteur de la facture.</b> Trois entités, une seule personne aux commandes."))
story.append(grid_table(
    ["Personne / Société", "Statut", "Rôle dans l'affaire"],
    [
        ["<b>M. Romain-Roland ROUILLON</b><br/>(né en avril 1988)",
         "Personne physique. Sous le coup d'une <b>faillite personnelle de 10 ans</b> (jugement du Tribunal de commerce "
         "de Niort du 21/11/2023) — interdit de gérer une entreprise.",
         "<b>Interlocuteur unique du client et exécutant réel</b> des travaux sur le chantier."],
        ["<b>L'ATELIER DES GARÇONS</b><br/>(Mios, 33)",
         "EURL immatriculée au nom de <b>Mme Élodie MULLER</b>, gérante et associée unique (ex-infirmière, sans "
         "antériorité dans le paysage).",
         "<b>Entreprise qui a réalisé les travaux</b>, mais dont l'activité de terrain est conduite par M. ROUILLON."],
        ["<b>EXPORT CONSULTING DENIA SL</b><br/>(Oliva, Valencia — Espagne)",
         "Société espagnole dont M. ROUILLON est <b>l'associé et l'administrateur unique</b>. Objet déclaré : services "
         "administratifs / immobilier (aucun rapport avec le paysage).",
         "<b>A émis la facture remise au client</b>, alors qu'elle n'a pas réalisé les travaux."],
        ["<b>ROUILLON CRÉATEUR DE JARDINS</b><br/>(Chauray, 79 — antécédent)",
         "Ancienne société de M. ROUILLON (même métier : paysage/maçonnerie), <b>placée en liquidation judiciaire</b> "
         "le 02/02/2021.",
         "Antécédent éclairant : faillite à l'origine de l'interdiction de gérer."],
    ],
    [40*mm, 62*mm, 58*mm]))
story.append(Spacer(1, 2*mm))
story.append(P("<b>En clair :</b> M. ROUILLON dirige de fait L'Atelier des Garçons (immatriculée au nom de sa compagne, "
               "Mme MULLER) et facture le client via sa société espagnole Export Consulting Denia SL."))
story.append(PageBreak())

# ---------- 2. SITUATION DU CHANTIER ----------
story.append(H1("2. État du chantier — désordres à faire constater"))
story.append(P("Le chantier d'aménagement extérieur, comprenant notamment un <b>pool house</b>, a été <b>laissé "
               "inachevé</b>. Les désordres ci-dessous, relevés par le client, ont vocation à être constatés par "
               "l'huissier le 23 juin 2026 (liste à compléter et préciser lors du constat) :"))
story.append(bullets([
    "<b>Pool house non terminé</b> : ouvrage inachevé, non réceptionnable en l'état ;",
    "<b>Finitions absentes</b> ;",
    "<b>Malfaçons</b> [à détailler précisément lors du constat] ;",
    "<b>Gouttières manquantes</b> ;",
    "<b>Jardin laissé à l'abandon</b> (aménagement non achevé, entretien non assuré) ;",
    "[Autres désordres / réserves à consigner par l'huissier].",
]))
story.append(P("<b>Objet du constat :</b> faire constater officiellement l'<b>inachèvement</b> de l'ouvrage (en particulier "
               "le pool house), les <b>malfaçons</b> et l'<b>abandon du chantier</b>, afin d'établir l'état réel des "
               "lieux et le préjudice du client."))

story.append(H2("Arbres facturés mais non livrés"))
story.append(P("La <b>facture émise par la société espagnole Export Consulting Denia SL mentionne 5 arbres</b>. "
               "Or, <b>seuls 3 arbres ont effectivement été installés</b> par L'Atelier des Garçons — et le jardin a "
               "été laissé à l'abandon. <b>Deux arbres facturés n'ont donc pas été livrés.</b>"))

story.append(H2("Anomalie de facturation"))
story.append(P("Les travaux ont été réalisés <b>en France</b> par L'Atelier des Garçons, mais la facture émane d'une "
               "<b>société espagnole</b> (Export Consulting Denia SL) qui n'a pas exécuté la prestation et dont l'objet "
               "social n'a aucun lien avec le paysage. L'émetteur de la facture n'est donc pas le prestataire réel."))
story.append(PageBreak())

# ---------- 3. FICHES ENTREPRISES ----------
story.append(H1("3. Fiches des entreprises (données de registres publics)"))

story.append(H2("3.1 L'ATELIER DES GARÇONS — entreprise ayant réalisé les travaux"))
story.append(kv_table([
    ("SIREN / SIRET siège", "928 730 464 / 928 730 464 00015"),
    ("Forme / capital", "EURL (SARL à associé unique) — capital 5 000 €"),
    ("Immatriculation", "13 mai 2024 — RCS de Bordeaux"),
    ("Gérante / associée unique", "Mme Élodie MULLER (née en octobre 1990), depuis le 15/05/2024"),
    ("Activité", "Aménagement paysager (NAF 81.30Z) ; objet élargi le 01/09/2025 à : espaces verts, travaux paysagers "
        "et <b>maçonnerie</b>."),
    ("Siège / dépôt", "Siège : 9 Allée des Mimosas, 33380 Mios. Dépôt : 76 Allée des Compagnons, 40460 Sanguinet."),
    ("Effectif / comptes", "0 salarié déclaré ; aucun compte annuel déposé."),
    ("Assurance", "Aucune mention d'assurance décennale ni RC pro (site officiel / mentions légales)."),
]))

story.append(H2("3.2 EXPORT CONSULTING DENIA SL — entité ayant émis la facture (Espagne)"))
story.append(kv_table([
    ("NIF / CIF", "B75493643"),
    ("Forme / capital", "Sociedad limitada unipersonal — capital 3 000 €"),
    ("Constitution", "18 novembre 2024 — Registre du commerce de Valence"),
    ("Associé &amp; administrateur unique", "M. Romain-Roland ROUILLON (nommé le 26/11/2024)"),
    ("Siège", "C/ Isla de Córcega, 9 - bajo, 46780 Oliva (Valencia), Espagne"),
    ("Objet social", "Services administratifs combinés ; location / promotion immobilière ; construction. "
        "<b>Aucune activité de paysage.</b>"),
    ("Comptes", "Aucun compte déposé."),
]))

story.append(H2("3.3 ROUILLON CRÉATEUR DE JARDINS — ancienne société de M. ROUILLON (liquidée)"))
story.append(kv_table([
    ("SIREN", "800 520 876"),
    ("Forme / capital", "SARL unipersonnelle (EURL) — capital 6 000 €"),
    ("Création / siège", "24/02/2014 — 7 et 7 bis rue de la Gare, 79180 Chauray (RCS de Niort)"),
    ("Gérant &amp; associé unique", "M. Romain ROUILLON (aucun autre associé, aucun co-gérant)"),
    ("Activité", "« Maçonnerie paysagère terrasses » (NAF 81.30Z) — même métier que L'Atelier des Garçons"),
    ("Liquidation judiciaire", "Ouverte le 02/02/2021 (liquidateur : Me Julie PERROT, SELARL ACTIS, Niort)."),
    ("Faillite personnelle", "Prononcée le 21/11/2023 (Tribunal de commerce de Niort) — 10 ans."),
    ("Repère financier", "Dernier exercice (2018) : ~864 K€ de CA, 15 salariés, ~999 K€ de dettes à un an (dont "
        "~901 K€ fiscales/sociales). Aucun compte déposé après 2018."),
]))
story.append(PageBreak())

# ---------- 4. CONSTAT & PIECES ----------
story.append(H1("4. Constat d'huissier et pièces du dossier"))
story.append(H2("À faire constater le 23 juin 2026"))
story.append(bullets([
    "État d'<b>inachèvement du pool house</b> et de l'ensemble du chantier ;",
    "<b>Finitions absentes</b> et <b>malfaçons</b> (à détailler poste par poste) ;",
    "<b>Gouttières manquantes</b> ;",
    "<b>Jardin laissé à l'abandon</b> ; <b>3 arbres</b> seulement plantés (sur 5 facturés) ;",
    "Clôture béton du client <b>démontée sur ~2 m</b> et laissée ouverte depuis ~3 semaines (propriété non sécurisée) ;",
    "Présence de la <b>mini-pelle</b> du prestataire sur le terrain.",
]))
story.append(H2("Pièces à réunir"))
story.append(bullets([
    "Le <b>devis</b> et la <b>facture</b> (émise par Export Consulting Denia SL) ;",
    "Le <b>courriel du client (vers le 07/06/2026)</b> signalant la clôture ouverte, resté sans suite ;",
    "Les <b>SMS</b> échangés avec « Romain » ;",
    "<b>Photographies datées</b> du chantier (pool house, gouttières, jardin, arbres, clôture) ;",
    "Le <b>constat d'huissier</b> du 23/06/2026 ;",
    "Les <b>justificatifs de paiement</b> déjà effectués (le cas échéant).",
]))
story.append(Spacer(1, 4*mm))
story.append(HRFlowable(width="100%", thickness=0.6, color=LINE, spaceBefore=4, spaceAfter=6))
story.append(H2("Sources (données d'entreprises)"))
src = [
    "Annuaire des Entreprises (data.gouv.fr) ; Pappers ; Societe.com ; Verif.com (Altares - D&amp;B) — pour "
    "L'Atelier des Garçons (928 730 464), Rouillon Créateur de Jardins (800 520 876) et le dirigeant R. Rouillon.",
    "BODACC — jugements de liquidation et de faillite personnelle (annonces A n°20210025/2537 et A n°20230228/3247).",
    "Infonif (economia3) et eInforma — Export Consulting Denia SL (NIF B75493643), Registre du commerce de Valence.",
    "Site officiel atelier-des-garcons.fr (présentation, mentions légales).",
]
story.append(ListFlowable([ListItem(Paragraph(s, styles["Small"]), leftIndent=6) for s in src],
                          bulletType="bullet", start="square", leftIndent=12, spaceBefore=2, spaceAfter=3))

doc = SimpleDocTemplate(OUT, pagesize=A4,
                        leftMargin=20*mm, rightMargin=20*mm, topMargin=18*mm, bottomMargin=20*mm,
                        title="Note de synthèse - L'Atelier des Garcons / Rouillon", author="Note preparatoire")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print("OK ->", OUT)
