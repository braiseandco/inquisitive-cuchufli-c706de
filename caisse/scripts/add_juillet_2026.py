#!/usr/bin/env python3
"""
Ajoute les feuilles juillet_2026 et 'caisse juillet 2026' a chiffre2026.ods.
- Clone juin_2026 (recap) en adaptant au calendrier de juillet
- Clone 'caisse juin' (caisse) idem, regroupe par semaines
- Met a jour la feuille Totalisation pour pointer sur juillet_2026
- Conserve tous les styles, formats, formules
- Backup automatique
"""
import os, sys, re, shutil, zipfile, calendar, copy
from datetime import date
from xml.etree import ElementTree as ET

SRC = r'C:\Users\brais\OneDrive\Bureau\chiffre2026.ods'
BAK = SRC + '.bak-pre-juillet'

if not os.path.exists(SRC):
    sys.exit(f'Introuvable: {SRC}')
if not os.path.exists(BAK):
    shutil.copy2(SRC, BAK)
    print(f'[backup] {BAK}')

NS = {
    'office': 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
    'table':  'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
    'text':   'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
}
def q(ns, tag): return f'{{{NS[ns]}}}{tag}'
TR = q('table','table-row'); TC = q('table','table-cell'); TCC = q('table','covered-table-cell')
TCOL = q('table','table-column'); TT = q('table','table')
TNAME = q('table','name'); TFORMULA = q('table','formula')
OVAL = q('office','value'); OVALT = q('office','value-type'); ODATE = q('office','date-value')
TXP = q('text','p')

# Enregistrer namespaces (pour la sortie)
for k, v in NS.items():
    ET.register_namespace(k, v)
# Conserve les autres namespaces declares en racine
EXTRA_NS = {
    'style':'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
    'fo':'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
    'number':'urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0',
    'svg':'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
    'calcext':'urn:org:documentfoundation:names:experimental:calc:xmlns:calcext:1.0',
    'draw':'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
    'xlink':'http://www.w3.org/1999/xlink',
    'meta':'urn:oasis:names:tc:opendocument:xmlns:meta:1.0',
    'dc':'http://purl.org/dc/elements/1.1/',
    'presentation':'urn:oasis:names:tc:opendocument:xmlns:presentation:1.0',
    'chart':'urn:oasis:names:tc:opendocument:xmlns:chart:1.0',
    'form':'urn:oasis:names:tc:opendocument:xmlns:form:1.0',
    'script':'urn:oasis:names:tc:opendocument:xmlns:script:1.0',
    'config':'urn:oasis:names:tc:opendocument:xmlns:config:1.0',
    'math':'http://www.w3.org/1998/Math/MathML',
    'ooo':'http://openoffice.org/2004/office',
    'ooow':'http://openoffice.org/2004/writer',
    'oooc':'http://openoffice.org/2004/calc',
    'dom':'http://www.w3.org/2001/xml-events',
    'rpt':'http://openoffice.org/2005/report',
    'of':'urn:oasis:names:tc:opendocument:xmlns:of:1.2',
    'xhtml':'http://www.w3.org/1999/xhtml',
    'grddl':'http://www.w3.org/2003/g/data-view#',
    'tableooo':'http://openoffice.org/2009/table',
    'css3t':'http://www.w3.org/TR/css3-text/',
    'formx':'urn:openoffice:names:experimental:ooxml-odf-interop:xmlns:form:1.0',
}
for k, v in EXTRA_NS.items():
    ET.register_namespace(k, v)

# Lecture
with zipfile.ZipFile(SRC) as z:
    content_bytes = z.read('content.xml')

root = ET.fromstring(content_bytes)
body = root.find(q('office','body'))
spreadsheet = body.find(q('office','spreadsheet'))

def find_table(name):
    for t in spreadsheet.findall(TT):
        if t.get(TNAME) == name: return t
    return None

juin_recap = find_table('juin_2026')
caisse_juin = find_table('caisse juin')
totalisation = find_table('Totalisation')
if juin_recap is None or caisse_juin is None or totalisation is None:
    sys.exit('Feuilles juin_2026 / caisse juin / Totalisation introuvables')

# Verifie qu'on ne re-cree pas
if find_table('juillet_2026') is not None:
    sys.exit('juillet_2026 existe deja. Supprime-la avant de relancer.')
if find_table('caisse juillet 2026') is not None:
    sys.exit("'caisse juillet 2026' existe deja.")

YEAR, MONTH = 2026, 7
DAYS = calendar.monthrange(YEAR, MONTH)[1]   # 31
JOUR_CODE = {1:'M', 2:'M', 3:'J', 4:'V', 5:'S', 6:'D'}  # weekday(): Tue=1,...,Sun=6. Mon=0 exclu.

def update_relative_formula(fml, new_row):
    """Remplace toutes les refs [.X<num>] par [.X<new_row>] dans une formule self-row."""
    return re.sub(r'(\[\.\$?[A-Z]+\$?)\d+(\])', lambda m: f'{m.group(1)}{new_row}{m.group(2)}', fml)

def clear_value_and_text(cell):
    """Vide la valeur et le contenu texte d'une cellule (mais garde formule/type)."""
    if OVAL in cell.attrib: del cell.attrib[OVAL]
    for p in list(cell.findall(TXP)): cell.remove(p)

# ============================================================
# 1) RECAP : juillet_2026
# ============================================================
juin_rows = juin_recap.findall(TR)
recap_header = juin_rows[0]          # ligne en-tete
recap_empty  = juin_rows[1]          # ligne vide (lundi 1er juin)
recap_data   = juin_rows[2]          # ligne data exemple (mardi 2 juin)
recap_total  = juin_rows[31]         # TOTAL GENE (Excel row 32)

juillet_recap = ET.Element(TT)
for k, v in juin_recap.attrib.items(): juillet_recap.set(k, v)
juillet_recap.set(TNAME, 'juillet_2026')

# Colonnes (definitions de largeurs)
for col in juin_recap.findall(TCOL):
    juillet_recap.append(copy.deepcopy(col))

# Header
juillet_recap.append(copy.deepcopy(recap_header))

def make_recap_data(d, excel_row):
    """Clone une ligne data, met la nouvelle date, vide les valeurs, ajuste les formules."""
    new_row = copy.deepcopy(recap_data)
    cells = new_row.findall(TC)
    for ci, cell in enumerate(cells):
        if ci == 0:
            # Cellule date
            cell.set(ODATE, d.isoformat())
            for p in list(cell.findall(TXP)): cell.remove(p)
            p = ET.SubElement(cell, TXP)
            p.text = f'{d.day}/{d.month}/{str(d.year)[-2:]}'
        else:
            fml = cell.get(TFORMULA)
            if fml:
                cell.set(TFORMULA, update_relative_formula(fml, excel_row))
                clear_value_and_text(cell)
            else:
                # Cellule de saisie : vider valeur et texte mais garder style.
                # Si le type est float, on enleve aussi value-type pour cellule vide.
                if cell.get(OVALT) == 'float':
                    del cell.attrib[OVALT]
                clear_value_and_text(cell)
    return new_row

def make_recap_empty():
    return copy.deepcopy(recap_empty)

for day in range(1, DAYS + 1):
    d = date(YEAR, MONTH, day)
    if d.weekday() == 0:  # Lundi
        juillet_recap.append(make_recap_empty())
    else:
        juillet_recap.append(make_recap_data(d, day + 1))

# TOTAL row (Excel row = DAYS+2 = 33)
total_row = copy.deepcopy(recap_total)
last_data_excel_row = DAYS + 1   # 32
for cell in total_row.findall(TC):
    fml = cell.get(TFORMULA)
    if fml:
        # Met a jour la borne haute du SUM
        fml = re.sub(r'(SUM\(\[\.\$?[A-Z]+\$?2\s*:\s*\.\$?[A-Z]+\$?)\d+(\]\))',
                     lambda m: f'{m.group(1)}{last_data_excel_row}{m.group(2)}', fml)
        cell.set(TFORMULA, fml)
        clear_value_and_text(cell)
    else:
        # Cellule libellee "TOTAL GENE" : on garde
        pass
juillet_recap.append(total_row)

# Insertion apres juin_2026
juin_idx = list(spreadsheet).index(juin_recap)
spreadsheet.insert(juin_idx + 1, juillet_recap)
print(f'[ok] juillet_2026 cree ({DAYS} jours)')

# ============================================================
# 2) CAISSE : 'caisse juillet 2026'
# ============================================================
cj_rows = caisse_juin.findall(TR)
# Identifiers dans caisse juin :
cj_title = cj_rows[0]   # ligne titre
cj_header = cj_rows[1]  # ligne en-tete
cj_data = cj_rows[2]    # data Mardi 2 juin (template)
cj_week = cj_rows[8]    # TOTAL SEMAINE (template)
cj_total = cj_rows[32]  # ligne TOTAL (somme des semaines)
cj_total_mois = cj_rows[33]  # TOTAL MOIS

caisse_juillet = ET.Element(TT)
for k, v in caisse_juin.attrib.items(): caisse_juillet.set(k, v)
caisse_juillet.set(TNAME, 'caisse juillet 2026')

for col in caisse_juin.findall(TCOL):
    caisse_juillet.append(copy.deepcopy(col))

# Titre row : remplacer 'CAISSE JUIN 2026' par 'CAISSE JUILLET 2026'
title_row = copy.deepcopy(cj_title)
for cell in title_row.findall(TC):
    for p in cell.findall(TXP):
        if p.text and 'JUIN' in p.text.upper():
            p.text = p.text.upper().replace('JUIN','JUILLET')
caisse_juillet.append(title_row)

# Header row
caisse_juillet.append(copy.deepcopy(cj_header))

def make_cj_data(d, excel_row):
    """Ligne quotidienne dans la caisse mensuelle."""
    new_row = copy.deepcopy(cj_data)
    cells = new_row.findall(TC)
    for ci, cell in enumerate(cells):
        if ci == 0:
            # Code jour (M/J/V/S/D)
            code = JOUR_CODE[d.weekday()]
            for p in list(cell.findall(TXP)): cell.remove(p)
            p = ET.SubElement(cell, TXP); p.text = code
        elif ci == 1:
            # Date
            cell.set(ODATE, d.isoformat())
            for p in list(cell.findall(TXP)): cell.remove(p)
            p = ET.SubElement(cell, TXP)
            p.text = f'{d.day:02d}/{d.month:02d}/{str(d.year)[-2:]}'
        else:
            fml = cell.get(TFORMULA)
            if fml:
                cell.set(TFORMULA, update_relative_formula(fml, excel_row))
                clear_value_and_text(cell)
            else:
                if cell.get(OVALT) == 'float':
                    del cell.attrib[OVALT]
                clear_value_and_text(cell)
    return new_row

def make_cj_week_total(first_excel_row, last_excel_row):
    """Clone la ligne TOTAL SEMAINE et ajuste les SUM aux bornes voulues."""
    new_row = copy.deepcopy(cj_week)
    for cell in new_row.findall(TC):
        fml = cell.get(TFORMULA)
        if not fml: continue
        # SUM([.X<a>:.X<b>])
        fml = re.sub(r'(SUM\(\[\.\$?[A-Z]+\$?)\d+(:\.\$?[A-Z]+\$?)\d+(\]\))',
                     lambda m: f'{m.group(1)}{first_excel_row}{m.group(2)}{last_excel_row}{m.group(3)}', fml)
        # ([.X<n>]+[.Y<n>]+[.G<n>])/([.E<n>]+[.F<n>]) : ratio relatif au TM row+1 (ligne suivante).
        # Dans caisse juin r8, la formule TM est sur la ligne r8 et reference la ligne r9 (TOTAL SEMAINE+1)
        # → on rend relatif au row du week-total +1.
        # Pattern non-SUM relatif a un seul row
        if 'SUM' not in fml:
            # Trouver le row de reference dans la formule (1er chiffre apres [.X)
            m = re.search(r'\[\.\$?[A-Z]+\$?(\d+)\]', fml)
            if m:
                old_row = int(m.group(1))
                # offset par rapport au last_excel_row+1 (deja: r8 referencait r9 = r8+1)
                # On remplace tous les <num> par last_excel_row + 1
                fml = re.sub(r'(\[\.\$?[A-Z]+\$?)\d+(\])',
                             lambda mm: f'{mm.group(1)}{last_excel_row + 1}{mm.group(2)}', fml)
        cell.set(TFORMULA, fml)
        clear_value_and_text(cell)
    return new_row

# Calculer les semaines de juillet
weeks = []  # liste de (list_of_dates,)
cur = []
for day in range(1, DAYS + 1):
    d = date(YEAR, MONTH, day)
    if d.weekday() == 0:  # Lundi → on saute et on coupe la semaine
        if cur:
            weeks.append(cur); cur = []
        continue
    cur.append(d)
if cur:
    weeks.append(cur)

# Genere les lignes. Excel row demarre a 3 (1=title, 2=header).
week_total_excel_rows = []
excel_row = 3  # prochain Excel row a placer
for w in weeks:
    first = excel_row
    for d in w:
        caisse_juillet.append(make_cj_data(d, excel_row))
        excel_row += 1
    last = excel_row - 1
    # Ligne TOTAL SEMAINE
    caisse_juillet.append(make_cj_week_total(first, last))
    week_total_excel_rows.append(excel_row)
    excel_row += 1

# Ligne TOTAL (somme des week-totals + ratio TM auto-reference)
total_row = copy.deepcopy(cj_total)
total_excel_row = excel_row
for cell in total_row.findall(TC):
    fml = cell.get(TFORMULA)
    if not fml: continue
    refs = re.findall(r'\[\.\$?([A-Z]+)\$?(\d+)\]', fml)
    if not refs: continue
    cols = set(r[0] for r in refs)
    rows_set = set(r[1] for r in refs)
    if len(cols) == 1 and len(rows_set) > 1:
        # Mono-colonne, multi-lignes : somme des week-totals (ex: =C9+C16+C23+C30+C32)
        col = next(iter(cols))
        new_fml = '+'.join(f'[.{col}{r}]' for r in week_total_excel_rows)
        fml = re.sub(r'=.*', '=' + new_fml, fml)
    else:
        # Multi-colonne et/ou mono-ligne : ratio auto-reference (ex: =(C33+D33+G33)/(E33+F33))
        # On remplace toutes les lignes par la ligne du TOTAL lui-meme
        fml = re.sub(r'(\[\.\$?[A-Z]+\$?)\d+(\])',
                     lambda m: f'{m.group(1)}{total_excel_row}{m.group(2)}', fml)
    cell.set(TFORMULA, fml)
    clear_value_and_text(cell)
caisse_juillet.append(total_row)
excel_row += 1

# Ligne TOTAL MOIS
tm_row = copy.deepcopy(cj_total_mois)
for cell in tm_row.findall(TC):
    fml = cell.get(TFORMULA)
    if not fml: continue
    # Remplacer chaque ref ligne par total_excel_row
    fml = re.sub(r'(\[\.\$?[A-Z]+\$?)\d+(\])',
                 lambda m: f'{m.group(1)}{total_excel_row}{m.group(2)}', fml)
    cell.set(TFORMULA, fml)
    clear_value_and_text(cell)
caisse_juillet.append(tm_row)
excel_row += 1

# Lignes restantes (sections TR : UP / PLUXEE / BIMPLI / EDENRED + totaux)
# On clone telles quelles depuis caisse juin (lignes 34+), en VIDANT les NOMBRE.
# Cela conserve les denominations / formules. L'app re-remplira au cumul mensuel.
remaining_rows = cj_rows[34:]
# Detection des lignes 'NOMBRE' : on vide leurs cellules de valeur (pas la cellule A 'NOMBRE')
for src_row in remaining_rows:
    new_row = copy.deepcopy(src_row)
    cells = new_row.findall(TC)
    # label de la 1ere cellule
    first_cell = cells[0] if cells else None
    first_text = ''
    if first_cell is not None:
        for p in first_cell.findall(TXP):
            if p.text: first_text += p.text
    is_nombre = first_text.strip().upper() == 'NOMBRE'
    is_total = first_text.strip().upper() == 'TOTAL'
    for ci, cell in enumerate(cells):
        if ci == 0: continue  # garde le label
        # Pour les lignes NOMBRE : on vide les valeurs saisies (non-formules)
        # Pour les lignes TOTAL : on garde les formules
        # Pour la ligne titre 'UP DEJEUNER' etc : on garde les denominations
        fml = cell.get(TFORMULA)
        if is_nombre and not fml:
            if OVAL in cell.attrib: del cell.attrib[OVAL]
            if cell.get(OVALT) == 'float': del cell.attrib[OVALT]
            for p in list(cell.findall(TXP)): cell.remove(p)
        elif fml:
            # Recalculer la valeur : on la vide, la formule fera le reste
            clear_value_and_text(cell)
    caisse_juillet.append(new_row)

# Insertion apres caisse juin
cj_idx = list(spreadsheet).index(caisse_juin)
spreadsheet.insert(cj_idx + 1, caisse_juillet)
print(f'[ok] caisse juillet 2026 cree ({len(weeks)} semaines, {sum(len(w) for w in weeks)} jours)')

# ============================================================
# 3) Totalisation : ajouter les formules sur la ligne 'Juillet'
# ============================================================
# Total row pour juillet_2026 = Excel row DAYS+2 = 33
TOTAL_EXCEL_ROW_JUILLET = DAYS + 2
total_rows = totalisation.findall(TR)
# Trouver la ligne dont la 1ere cellule = 'Juillet'
found = False
for row in total_rows:
    cells = row.findall(TC)
    if not cells: continue
    txt = ''
    for p in cells[0].findall(TXP):
        if p.text: txt += p.text
    if txt.strip().lower() == 'juillet':
        # Cellules I et J (indices 9 et 10 dans notre comptage) :
        # En XML, certaines cellules ont number-columns-repeated. Il faut compter en col.
        # Simple : on enumere et compte des col.
        col = 0; target_cells = {9: None, 10: None}
        for cell in cells:
            rep = int(cell.get(q('table','number-columns-repeated'),'1'))
            for k in target_cells:
                if target_cells[k] is None and col <= k < col + rep:
                    # Si la cellule est "repeated", il faut la splitter avant.
                    if rep > 1:
                        # Reset rep et inserer copies adjacentes
                        del cell.attrib[q('table','number-columns-repeated')]
                        # Insere AVANT (rep-1) copies dans la meme ligne pour pas decaler ?
                        # Plus simple : on cree des copies et on remplace par rep cellules adjacentes.
                        idx = list(row).index(cell)
                        for _ in range(rep - 1):
                            row.insert(idx, copy.deepcopy(cell))
                        # Maintenant on cherche a nouveau la cellule a la position k
                    # Au prochain tour de boucle, on re-trouvera. Plus simple : on relance.
                    # Pour eviter la complexite, on marque a faire et on re-execute apres.
                    pass
            col += rep
        # Strategie plus simple : si I/J n'existent pas en colonnes 9/10, on saute le splitter
        # et on construit a la main avec re.
        # Approche alternative : refaire l'enumeration en aplatissant repeats.
        flat = []
        for cell in list(cells):
            rep = int(cell.get(q('table','number-columns-repeated'),'1'))
            if rep > 1:
                # Splitter
                del cell.attrib[q('table','number-columns-repeated')]
                idx = list(row).index(cell)
                for _ in range(rep - 1):
                    row.insert(idx + 1, copy.deepcopy(cell))
            flat.append(cell)
        # Re-list apres modif
        cells = row.findall(TC)
        # Cell index 9 = I = formule  [juillet_2026.H<row>]/1.1+[juillet_2026.I<row>]/1.2
        if len(cells) > 10:
            c9 = cells[9]
            c10 = cells[10]
            c9.set(TFORMULA, f'of:=[juillet_2026.H{TOTAL_EXCEL_ROW_JUILLET}]/1.1+[juillet_2026.I{TOTAL_EXCEL_ROW_JUILLET}]/1.2')
            clear_value_and_text(c9)
            c10.set(TFORMULA, f'of:=[juillet_2026.J{TOTAL_EXCEL_ROW_JUILLET}]')
            clear_value_and_text(c10)
            found = True
        break
if found:
    print('[ok] Totalisation : juillet -> juillet_2026 (row {})'.format(TOTAL_EXCEL_ROW_JUILLET))
else:
    print('[warn] Ligne Juillet de Totalisation non modifiee')

# ============================================================
# Serialisation et reecriture du .ods
# ============================================================
new_content = ET.tostring(root, encoding='utf-8', xml_declaration=True)

# Reecrit le zip : copie tous les autres fichiers, remplace content.xml
tmp = SRC + '.tmp'
with zipfile.ZipFile(SRC) as zin, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        if item.filename == 'content.xml':
            zout.writestr(item, new_content)
        else:
            zout.writestr(item, zin.read(item.filename))
shutil.move(tmp, SRC)
print('[ok] chiffre2026.ods reecrit')
