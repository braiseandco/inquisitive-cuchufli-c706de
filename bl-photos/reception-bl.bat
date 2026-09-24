@echo off
chcp 65001 >nul
setlocal
rem -------------------------------------------------------------------------
rem  Reception des bons de livraison et controle des factures - lance par la
rem  tache Windows " Reception BL " (ouverture de session + 15h). Voir README.md.
rem
rem  Tout ce que fait la session est decrit dans routine-reception.md, dont les
rem  modes (A BLANC ou ECRITURE) sont la premiere consigne. Ce fichier ne decide
rem  de rien : il prepare le terrain, lance la session et lui donne d'avance
rem  les seules autorisations dont elle a besoin. Toute autre action lui est
rem  refusee (--permission-mode dontAsk), au lieu de la bloquer sur une question.
rem  Les factures ne sont que lues : le dossier est la piece du comptable.
rem
rem  Passage en ECRITURE : il faudra aussi l'autoriser a deplacer les photos
rem  dans BL\traites.
rem -------------------------------------------------------------------------

set "BL=G:\.shortcut-targets-by-id\1FOsC4oL_N13Yjdpzr41SlKRJT82yKDL9\BL"
set "BL_REGLE=//g/.shortcut-targets-by-id/1FOsC4oL_N13Yjdpzr41SlKRJT82yKDL9/BL"
rem Copie locale des factures, faite chaque soir par la tache " Braise - Factures fournisseurs ".
set "FACTURES=%USERPROFILE%\OneDrive\Bureau\Factures fournisseurs"
set "FACTURES_REGLE=//c/Users/brais/OneDrive/Bureau/Factures fournisseurs"
set "CONSIGNE_URL=https://raw.githubusercontent.com/braiseandco/inquisitive-cuchufli-c706de/main/bl-photos/routine-reception.md"
set "CONSIGNE=%~dp0routine-reception.md"
set "JOURNAL=%USERPROFILE%\bl-reception.log"
rem Installation native : celle de npm, faite depuis l'appli Claude, reste invisible hors de l'appli.
set "CLAUDE=%USERPROFILE%\.local\bin\claude.exe"
set "SUPABASE_SQL=mcp__claude_ai_Supabase__execute_sql"
set "GMAIL_ENVOI=mcp__claude_ai_Gmail__send_message"

cd /d "%~dp0"
echo. >> "%JOURNAL%"
echo ======== %DATE% %TIME% ======== >> "%JOURNAL%"

rem Sans Drive, la routine ne voit aucune photo : on le relance et on l'attend 3 minutes.
set "ALERTE="
set /a ESSAIS=0
:attente_drive
if exist "%BL%\" goto drive_ok
if %ESSAIS%==0 (
  echo [Drive] dossier BL absent, lancement de Google Drive >> "%JOURNAL%"
  tasklist /fi "imagename eq GoogleDriveFS.exe" | find /i "GoogleDriveFS" >nul || start "" "C:\Program Files\Google\Drive File Stream\launch.bat"
)
set /a ESSAIS+=1
if %ESSAIS% gtr 18 goto drive_absent
ping -n 11 127.0.0.1 >nul
goto attente_drive

:drive_absent
echo [Drive] dossier BL toujours absent apres 3 minutes >> "%JOURNAL%"
set "ALERTE= ALERTE : le dossier BL est introuvable sur le PC, Google Drive pour ordinateur ne l'a pas monte. Mets-le en tete du recap, en premier, et envoie le recap quand meme."

:drive_ok
if not exist "%FACTURES%\" (
  echo [Factures] dossier introuvable : %FACTURES% >> "%JOURNAL%"
  set "ALERTE=%ALERTE% ALERTE : le dossier des factures est introuvable sur le PC, aucune facture ne peut etre lue. Dis-le en tete de la rubrique FACTURES."
)
rem Copie locale de la consigne : lue telle quelle, sans resume. En cas d'echec, la precedente sert.
curl.exe -fsSL "%CONSIGNE_URL%" -o "%CONSIGNE%.tmp" && move /y "%CONSIGNE%.tmp" "%CONSIGNE%" >nul || echo [consigne] telechargement impossible, copie precedente utilisee >> "%JOURNAL%"
if not exist "%CONSIGNE%" (
  echo [ECHEC] aucune consigne disponible >> "%JOURNAL%"
  exit /b 1
)

"%CLAUDE%" -p "Tu geres la reception des bons de livraison et le controle des factures du restaurant Braise and Co a Biganos. Lis d'abord la consigne %CONSIGNE% : elle contient tout le contexte et les modes de fonctionnement, respecte-la a la lettre. Les photos sont dans %BL%, les factures dans %FACTURES%. Puis execute-la sur les photos en attente et sur les factures et avoirs pas encore controles, et envoie le recap par mail a braiseandcobiganos@gmail.com meme s'il n'y a eu ni livraison ni facture. Tu n'as que les outils strictement necessaires : si une action t'est refusee, ne cherche pas de contournement, dis-le dans le recap.%ALERTE%" --permission-mode dontAsk --add-dir "%BL%" "%FACTURES%" --allowedTools "Read(./routine-reception.md)" "Read(%BL_REGLE%/**)" "Read(%FACTURES_REGLE%/**)" "Edit(%BL_REGLE%/lus-a-blanc.txt)" "Edit(%BL_REGLE%/factures-rapprochees.txt)" "%SUPABASE_SQL%" "%GMAIL_ENVOI%" >> "%JOURNAL%" 2>&1

if errorlevel 1 (
  echo [ECHEC] la session s'est terminee en erreur >> "%JOURNAL%"
) else (
  echo [OK] termine >> "%JOURNAL%"
)
