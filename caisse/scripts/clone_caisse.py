#!/usr/bin/env python3
"""
Clone calendrier-aware d'une feuille caisse mensuelle (caissejuillet -> caisseaout).

Structure attendue dans la source :
- r0 : titre 'CAISSE JUILLET 2026' ...
- r1 : en-tete (JOUR / DATE / C.A / OFFERT / COUVERT / ...)
- pour chaque semaine : N lignes-jour (Mar/Mer/Jeu/Ven/Sam/Dim, lundi exclus)
                       + 1 ligne TOTAL SEMAINE
- ligne TOTAL (somme des week-totals)
- ligne TOTAL MOIS
- section TR (UP DEJEUNER, PLUXEE, BIMPLI, EDENRED, totaux)
"""
import os, sys, re, shutil, zipfile, calendar
from datetime import date

SRC = r'C:\Users\brais\OneDrive\Bureau\chiffre2026.ods'

SOURCE_SHEET = 'caissejuillet'
TARGET_SHEET = 'caisseaout'
TARGET_YEAR  = 2026
TARGET_MONTH = 8
SOURCE_MONTH_NAME_CAPS = 'JUILLET'
TARGET_MONTH_NAME_CAPS = 'AOUT'

OUT = SRC + f'.preview-{TARGET_SHEET}'
OUT_CLEAN = os.path.dirname(SRC) + f'/preview_{TARGET_SHEET}.ods'

# Map jour de la semaine -> code  (Python: Mon=0)
JOUR_CODE = {1:'M', 2:'M', 3:'J', 4:'V', 5:'S', 6:'D'}   # Lun (0) absent : ligne sautee

if not os.path.exists(SRC):
    sys.exit(f'Introuvable: {SRC}')

with zipfile.ZipFile(SRC) as z:
    content = z.read('content.xml').decode('utf-8')

if re.search(r'<table:table\b[^>]*\btable:name="' + re.escape(TARGET_SHEET) + r'"', content):
    sys.exit(f'La feuille {TARGET_SHEET!r} existe deja.')

pat = re.compile(
    r'<table:table\b[^>]*\btable:name="' + re.escape(SOURCE_SHEET) + r'"[^>]*>.*?</table:table>',
    re.DOTALL
)
m = pat.search(content)
if not m: sys.exit(f'Feuille source introuvable: {SOURCE_SHEET}')
src_block = m.group(0)

opener_m = re.match(r'(<table:table\b[^>]*?>)', src_block)
opener = opener_m.group(1)
inner = src_block[opener_m.end():-len('</table:table>')]

col_re = re.compile(r'<table:table-column\b[^>]*(?:/>|>.*?</table:table-column>)', re.DOTALL)
cols_xml = ''.join(col_re.findall(inner))

row_re = re.compile(r'<table:table-row\b[^>]*>.*?</table:table-row>', re.DOTALL)
src_rows = row_re.findall(inner)
print(f'[debug] source: {len(src_rows)} lignes')

# Identifier les indices cles
def row_text(r):
    return ' '.join(re.findall(r'<text:p[^>]*>([^<]*)</text:p>', r))

# Trouver : 1ere data row (a date), 1ere week-total, total, total-mois
idx_title = 0
idx_header = 1
idx_first_data = None
idx_first_week_total = None
idx_total = None
idx_total_mois = None

def first_cell_text(r):
    """Texte de la 1ere cellule (col A)."""
    m1 = re.search(r'<table:table-cell\b[^>]*>(.*?)</table:table-cell>', r, re.DOTALL)
    if not m1: return ''
    texts = re.findall(r'<text:p[^>]*>([^<]*)</text:p>', m1.group(1))
    return ''.join(texts).strip()

for i, r in enumerate(src_rows):
    if i < 2: continue
    a = first_cell_text(r)
    if idx_first_data is None and 'office:date-value=' in r:
        idx_first_data = i
    if idx_first_week_total is None and a == 'TOTAL SEMAINE':
        idx_first_week_total = i
    if (idx_total is None and a == 'TOTAL'
        and idx_first_week_total is not None and i > idx_first_week_total):
        # On veut le TOTAL qui suit la derniere TOTAL SEMAINE, pas un eventuel sous-total intra-TR
        # On le met a jour a chaque match tant qu'on n'a pas trouve TOTAL MOIS
        if idx_total_mois is None:
            idx_total = i
    if a == 'TOTAL MOIS' and idx_total_mois is None:
        idx_total_mois = i
        break

print(f'[debug] idx_first_data={idx_first_data} idx_first_week_total={idx_first_week_total}')
print(f'[debug] idx_total={idx_total} idx_total_mois={idx_total_mois}')

if None in (idx_first_data, idx_first_week_total, idx_total, idx_total_mois):
    sys.exit('Detection des templates incomplete')

# Templates
title_tpl = src_rows[idx_title]
header_tpl = src_rows[idx_header]
data_tpl = src_rows[idx_first_data]
week_total_tpl = src_rows[idx_first_week_total]
total_tpl = src_rows[idx_total]
total_mois_tpl = src_rows[idx_total_mois]

# Section TR : tout ce qui suit total_mois
tr_section = src_rows[idx_total_mois + 1:]

# Determiner le row Excel de reference dans les templates (pour calcul du delta)
def first_row_ref(xml):
    m2 = re.search(r'\[\.\$?[A-Z]+\$?(\d+)\]', xml)
    return int(m2.group(1)) if m2 else None

data_tpl_ref = first_row_ref(data_tpl) or 3   # ex: r2 (Excel 3) ref [.C3]

# Renommage table
new_opener = re.sub(
    r'(table:name=")' + re.escape(SOURCE_SHEET) + r'(")',
    r'\g<1>' + TARGET_SHEET + r'\g<2>',
    opener, count=1
)

# ---------- Constructeurs de ligne ----------
def update_refs_in_formula(xml, mapping_fn):
    """Pour chaque ref de cellule (.X<n> avec X = lettres colonne), applique mapping_fn(n).
    Couvre :
      - ref simple [.X<n>]
      - debut/fin de plage [.X<a>:.X<b>]
    """
    def repl(mm):
        old_n = int(mm.group(2))
        new_n = mapping_fn(old_n)
        return f'{mm.group(1)}{new_n}'
    # Pattern : un '.' suivi d'un $ optionnel, lettres col, $ optionnel, chiffres
    # On ne consomme PAS le ']' final pour pouvoir matcher les deux moities d'une plage [.X<a>:.X<b>]
    return re.sub(r'(\.\$?[A-Z]+\$?)(\d+)', repl, xml)

def clear_values(xml):
    """Vide office:value="X" et les contenus de text:p (sauf labels statiques)."""
    xml = re.sub(r'\s+office:value="[^"]*"', '', xml)
    # Remplace <text:p>...</text:p> par <text:p/> uniquement si le contenu est un nombre/devise/erreur
    # On garde les libelles texte (JOUR, DATE, TOTAL SEMAINE, etc.)
    def repl_p(mm):
        content = mm.group(1)
        # Nettoyer balises imbriquees (text:s, etc.)
        text_only = re.sub(r'<[^>]+>', '', content).strip()
        # Si c'est un nombre ou une erreur (chiffres, virgules, espaces, "DIV/0", "€", "-")
        if re.fullmatch(r'[-\d\s.,]+|#DIV/0\s*!?|-+\s*€?\s*|0[,.]?\d*', text_only):
            return '<text:p/>'
        return mm.group(0)
    xml = re.sub(r'<text:p\b[^>]*>(.*?)</text:p>', repl_p, xml, flags=re.DOTALL)
    return xml

def make_data_row(d, excel_row):
    row = data_tpl
    # Decaler date-value
    row = re.sub(r'office:date-value="\d{4}-\d{2}-\d{2}"',
                 f'office:date-value="{d.isoformat()}"', row, count=1)
    # Decaler le libelle DD/MM/AA
    new_disp = f'{d.day:02d}/{d.month:02d}/{str(d.year)[-2:]}'
    row = re.sub(r'(<text:p[^>]*>)\d{1,2}/\d{1,2}/\d{2}(</text:p>)',
                 r'\g<1>' + new_disp + r'\g<2>', row, count=1)
    # Code jour (M/J/V/S/D)
    code = JOUR_CODE[d.weekday()]
    # Le code jour est dans la 1ere cellule, dans un text:p simple
    # On le remplace si c'est M/J/V/S/D
    row = re.sub(r'(<table:table-cell\b[^>]*>\s*<text:p[^>]*>)[MJVSD](</text:p>\s*</table:table-cell>)',
                 r'\g<1>' + code + r'\g<2>', row, count=1)
    # Ajuster les refs row (delta)
    delta = excel_row - data_tpl_ref
    if delta:
        row = update_refs_in_formula(row, lambda n: n + delta)
    # Vider les valeurs
    row = clear_values(row)
    return row

def make_week_total_row(first_excel_row, last_excel_row):
    """SUM(X<first>:X<last>) sur les cellules avec SUM, et formules ratio TM auto-ref."""
    row = week_total_tpl
    # SUM([.X<a>:.X<b>]) -> SUM([.X<first>:.X<last>])
    def repl_sum(mm):
        return f'{mm.group(1)}{first_excel_row}{mm.group(2)}{last_excel_row}{mm.group(3)}'
    row = re.sub(r'(SUM\(\[\.\$?[A-Z]+\$?)\d+(:\.\$?[A-Z]+\$?)\d+(\]\))', repl_sum, row)
    # Formules ratio TM (multi-colonnes, meme row) -> remplacer le row par last+1 (ligne TOTAL SEMAINE elle-meme)
    self_row = last_excel_row + 1
    def is_self_ref_block(text):
        refs = re.findall(r'\[\.\$?([A-Z]+)\$?(\d+)\]', text)
        if not refs: return False
        cols = set(r[0] for r in refs); rows_s = set(r[1] for r in refs)
        return 'SUM' not in text and len(cols) > 1 and len(rows_s) == 1
    # Remplacer le row dans les formules ratio (TM) cellules par cellule
    def process_cell(mm):
        cell_xml = mm.group(0)
        fml_m = re.search(r'table:formula="([^"]+)"', cell_xml)
        if not fml_m: return cell_xml
        fml = fml_m.group(1)
        if 'SUM' in fml or 'SEMAINE' in fml: return cell_xml
        refs = re.findall(r'\[\.\$?([A-Z]+)\$?(\d+)\]', fml)
        if not refs: return cell_xml
        cols = set(r[0] for r in refs); rows_s = set(r[1] for r in refs)
        if len(cols) > 1 and len(rows_s) == 1:
            new_fml = re.sub(r'(\[\.\$?[A-Z]+\$?)\d+(\])',
                             lambda m: f'{m.group(1)}{self_row}{m.group(2)}', fml)
            cell_xml = cell_xml.replace(fml, new_fml)
        return cell_xml
    row = re.sub(r'<table:table-cell\b[^>]*?(?:/>|>.*?</table:table-cell>)', process_cell, row, flags=re.DOTALL)
    row = clear_values(row)
    return row

def make_total_row(week_total_excel_rows, self_excel_row):
    row = total_tpl
    # Formules mono-colonne multi-lignes (somme des week-totals) -> remplacer toutes les refs par les week_total_excel_rows
    def process_cell(mm):
        cell_xml = mm.group(0)
        fml_m = re.search(r'table:formula="([^"]+)"', cell_xml)
        if not fml_m: return cell_xml
        fml = fml_m.group(1)
        refs = re.findall(r'\[\.\$?([A-Z]+)\$?(\d+)\]', fml)
        if not refs: return cell_xml
        cols = set(r[0] for r in refs); rows_s = set(r[1] for r in refs)
        if len(cols) == 1 and len(rows_s) > 1:
            # Somme des week-totals : remplacer par +.X<wt1>+.X<wt2>+...
            col = next(iter(cols))
            new_fml = '=' + '+'.join(f'[.{col}{r}]' for r in week_total_excel_rows)
            # remplacer la partie apres "of:" si presente
            if fml.startswith('of:'):
                new_fml = 'of:' + new_fml
            cell_xml = cell_xml.replace(fml, new_fml)
        elif len(cols) > 1 and len(rows_s) == 1:
            # Ratio TM : remplacer row par self_excel_row
            new_fml = re.sub(r'(\[\.\$?[A-Z]+\$?)\d+(\])',
                             lambda m: f'{m.group(1)}{self_excel_row}{m.group(2)}', fml)
            cell_xml = cell_xml.replace(fml, new_fml)
        return cell_xml
    row = re.sub(r'<table:table-cell\b[^>]*?(?:/>|>.*?</table:table-cell>)', process_cell, row, flags=re.DOTALL)
    row = clear_values(row)
    return row

def make_total_mois_row(total_excel_row):
    row = total_mois_tpl
    # Toutes les refs row -> total_excel_row
    row = update_refs_in_formula(row, lambda n: total_excel_row)
    row = clear_values(row)
    return row

def make_title_row():
    row = title_tpl
    row = row.replace(SOURCE_MONTH_NAME_CAPS, TARGET_MONTH_NAME_CAPS)
    return row

# ---------- Calculer le calendrier d'aout ----------
days_in_month = calendar.monthrange(TARGET_YEAR, TARGET_MONTH)[1]
weeks = []
cur = []
for day in range(1, days_in_month + 1):
    d = date(TARGET_YEAR, TARGET_MONTH, day)
    if d.weekday() == 0:  # Lundi -> coupure de semaine
        if cur: weeks.append(cur); cur = []
        continue
    cur.append(d)
if cur: weeks.append(cur)

print(f'[debug] {len(weeks)} semaines de {[len(w) for w in weeks]} jours')

# ---------- Construire les lignes ----------
new_rows_xml = []
new_rows_xml.append(make_title_row())
new_rows_xml.append(header_tpl)   # en-tete identique

excel_row = 3   # 1=title, 2=header, 3=premier jour
week_total_excel_rows = []
for w in weeks:
    first = excel_row
    for d in w:
        new_rows_xml.append(make_data_row(d, excel_row))
        excel_row += 1
    last = excel_row - 1
    new_rows_xml.append(make_week_total_row(first, last))
    week_total_excel_rows.append(excel_row)
    excel_row += 1

# TOTAL row
total_excel_row = excel_row
new_rows_xml.append(make_total_row(week_total_excel_rows, total_excel_row))
excel_row += 1

# TOTAL MOIS row
new_rows_xml.append(make_total_mois_row(total_excel_row))
excel_row += 1

# Section TR : on clone et on DECALE les refs row du nombre de lignes
# que la section calendrier a perdu/gagne par rapport a la source.
# Source TR commencait a Excel row = idx_total_mois + 2 (0-based +1)
src_tr_first_excel = idx_total_mois + 2     # idx 0-based -> Excel 1-based
# Cible TR commence apres TOTAL MOIS dans new_rows_xml :
# new_rows_xml a deja [title, header, ...semaines..., total, total_mois]
# excel_row pointe deja sur la prochaine ligne a placer (= 1ere ligne TR cible)
dst_tr_first_excel = excel_row
tr_delta = dst_tr_first_excel - src_tr_first_excel
print(f'[debug] TR delta = {tr_delta}  (src TR start row {src_tr_first_excel}, dst {dst_tr_first_excel})')

for src_row in tr_section:
    row = src_row
    if tr_delta != 0:
        row = update_refs_in_formula(row, lambda n: n + tr_delta)
    row = clear_values(row)
    new_rows_xml.append(row)

new_inner = cols_xml + ''.join(new_rows_xml)
new_block = new_opener + new_inner + '</table:table>'

new_content = content[:m.end()] + new_block + content[m.end():]

# Sortie preview
with zipfile.ZipFile(SRC) as zin, zipfile.ZipFile(OUT_CLEAN, 'w', zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        if item.filename == 'content.xml':
            zout.writestr(item, new_content.encode('utf-8'))
        else:
            zout.writestr(item, zin.read(item.filename))

print(f'[ok] Preview : {OUT_CLEAN}')
print(f'[info] Source NON modifie.')
print(f'[info] {TARGET_SHEET} : {len(weeks)} semaines, {sum(len(w) for w in weeks)} jours travailles')
