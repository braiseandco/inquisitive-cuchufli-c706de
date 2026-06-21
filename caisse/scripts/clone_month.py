#!/usr/bin/env python3
"""
Clone calendrier-aware d'une feuille recap mensuelle.

- Lit le mois source (ex: juillet_2026) comme TEMPLATE de styles/formules.
- Construit le mois cible (ex: aout_2026) avec le bon calendrier :
    * 1 ligne par jour
    * Lundis = lignes vides
    * Formules ajustees aux bonnes lignes Excel
    * TOTAL GENE en bas avec SUM(B2:B<dernier>)
- Sortie : fichier preview a cote du source (jamais d'ecriture sur le source).
"""
import os, sys, re, shutil, zipfile, calendar
from datetime import date

SRC = r'C:\Users\brais\OneDrive\Bureau\chiffre2026.ods'

SOURCE_SHEET = 'juillet_2026'
TARGET_SHEET = 'aout_2026'
TARGET_YEAR  = 2026
TARGET_MONTH = 8

OUT = SRC + f'.preview-{TARGET_SHEET}'

if not os.path.exists(SRC):
    sys.exit(f'Introuvable: {SRC}')

with zipfile.ZipFile(SRC) as z:
    content = z.read('content.xml').decode('utf-8')

if re.search(r'<table:table\b[^>]*\btable:name="' + re.escape(TARGET_SHEET) + r'"', content):
    sys.exit(f'La feuille {TARGET_SHEET!r} existe deja dans le fichier source.')

# Extraire le bloc source
pat = re.compile(
    r'<table:table\b[^>]*\btable:name="' + re.escape(SOURCE_SHEET) + r'"[^>]*>.*?</table:table>',
    re.DOTALL
)
m = pat.search(content)
if not m: sys.exit(f'Feuille source introuvable: {SOURCE_SHEET}')
src_block = m.group(0)

# Decouper le bloc source en composants : opener, columns, rows, closer
opener_m = re.match(r'(<table:table\b[^>]*?>)', src_block)
opener = opener_m.group(1)
inner = src_block[opener_m.end():-len('</table:table>')]

# Recuperer les table-column definitions (avant la 1ere row)
col_re = re.compile(r'<table:table-column\b[^>]*(?:/>|>.*?</table:table-column>)', re.DOTALL)
cols_xml = ''.join(col_re.findall(inner))

# Recuperer les rows
row_re = re.compile(r'<table:table-row\b[^>]*>.*?</table:table-row>', re.DOTALL)
src_rows = row_re.findall(inner)
print(f'[debug] source: {len(src_rows)} lignes')

# Templates :
#   - header   = src_rows[0]
#   - data     = la 1ere ligne avec date-value (typiquement src_rows[1])
#   - empty    = la 1ere ligne SANS date-value, SANS texte autre que vide  (apres la header)
#   - total    = src_rows[-1] (ligne TOTAL GENE)
header_tpl = src_rows[0]

# Trouver la ligne TOTAL : elle contient SUM(...) et/ou le label TOTAL GENE
total_tpl = None
total_idx = None
for i, r in enumerate(src_rows[1:], start=1):
    if 'SUM(' in r or 'TOTAL GENE' in r:
        total_tpl = r; total_idx = i; break
if not total_tpl: sys.exit('Template TOTAL row introuvable')

data_tpl = None
empty_tpl = None
for r in src_rows[1:total_idx]:
    has_date = 'office:date-value=' in r
    if data_tpl is None and has_date:
        data_tpl = r
    if empty_tpl is None and not has_date:
        # Verifier qu'il n'y a pas de texte significatif (pas une ligne TOTAL)
        if '<text:p' not in r or re.search(r'<text:p[^>]*/>', r) or all(
            (txt.strip() == '') for txt in re.findall(r'<text:p[^>]*>([^<]*)</text:p>', r)
        ):
            empty_tpl = r
    if data_tpl and empty_tpl:
        break
if not data_tpl: sys.exit('Template data row introuvable dans la source')
if not empty_tpl: sys.exit('Template empty row introuvable dans la source')

# Renommer la table
new_opener = re.sub(
    r'(table:name=")' + re.escape(SOURCE_SHEET) + r'(")',
    r'\g<1>' + TARGET_SHEET + r'\g<2>',
    opener, count=1
)

# Decouvrir le row Excel de reference dans le template data
# (premiere ref a une ligne dans une formule)
data_tpl_refs = re.findall(r'\[\.\$?[A-Z]+\$?(\d+)\]', data_tpl)
src_data_excel_row = int(data_tpl_refs[0]) if data_tpl_refs else 2

def make_data_row(d, excel_row):
    row = data_tpl
    # 1. Decaler date-value : "2026-MM-DD"
    new_date_iso = d.isoformat()
    row = re.sub(r'office:date-value="\d{4}-\d{2}-\d{2}"',
                 f'office:date-value="{new_date_iso}"', row, count=1)
    # 2. Decaler le texte affiche (format "X/M/26" sans zero pour recap)
    new_disp = f'{d.day}/{d.month}/{str(d.year)[-2:]}'
    row = re.sub(r'(<text:p[^>]*>)\d{1,2}/\d{1,2}/\d{2}(</text:p>)',
                 r'\g<1>' + new_disp + r'\g<2>', row, count=1)
    # 3. Ajuster les refs de formule self-row (decalage src_data_excel_row -> excel_row)
    delta = excel_row - src_data_excel_row
    if delta != 0:
        def shift_ref(mm):
            return f'{mm.group(1)}{int(mm.group(2)) + delta}{mm.group(3)}'
        row = re.sub(r'(\[\.\$?[A-Z]+\$?)(\d+)(\])', shift_ref, row)
    # 4. Vider les valeurs calculees (LibreOffice recalcule)
    row = re.sub(r'\s+office:value="[^"]*"', '', row)
    return row

def make_empty_row():
    return empty_tpl

def make_total_row(last_data_excel_row):
    row = total_tpl
    # Ajuster les ranges SUM([.X2:.X<old>]) -> SUM([.X2:.X<new>])
    def shift_sum(mm):
        return f'{mm.group(1)}{last_data_excel_row}{mm.group(2)}'
    row = re.sub(r'(SUM\(\[\.\$?[A-Z]+\$?2:\.\$?[A-Z]+\$?)\d+(\]\))', shift_sum, row)
    # Vider les valeurs calculees
    row = re.sub(r'\s+office:value="[^"]*"', '', row)
    return row

# Construire le nouveau contenu
new_rows_xml = [header_tpl]
days_in_month = calendar.monthrange(TARGET_YEAR, TARGET_MONTH)[1]
for day in range(1, days_in_month + 1):
    d = date(TARGET_YEAR, TARGET_MONTH, day)
    excel_row = day + 1   # header = Excel row 1, day 1 = Excel row 2, etc.
    if d.weekday() == 0:   # Lundi
        new_rows_xml.append(make_empty_row())
    else:
        new_rows_xml.append(make_data_row(d, excel_row))
last_data_excel_row = days_in_month + 1
new_rows_xml.append(make_total_row(last_data_excel_row))

new_inner = cols_xml + ''.join(new_rows_xml)
new_block = new_opener + new_inner + '</table:table>'

# Inserer apres le bloc source
new_content = content[:m.end()] + new_block + content[m.end():]

# Ecrire le preview (jamais d'ecriture sur le source)
with zipfile.ZipFile(SRC) as zin, zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        if item.filename == 'content.xml':
            zout.writestr(item, new_content.encode('utf-8'))
        else:
            zout.writestr(item, zin.read(item.filename))

print(f'[ok] Preview ecrite : {OUT}')
print(f'[info] Source {os.path.basename(SRC)} NON modifie.')
print(f'[info] aout_2026 contient {days_in_month} jours dont {sum(1 for d in range(1, days_in_month+1) if date(TARGET_YEAR, TARGET_MONTH, d).weekday() == 0)} lundis vides.')
