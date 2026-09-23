@echo off
chcp 65001 >nul
setlocal
rem -------------------------------------------------------------------------
rem  Reception des bons de livraison - lance par la tache Windows " Reception BL "
rem  (ouverture de session + 15h). Voir README.md pour l'installation.
rem
rem  Tout ce que fait la session est decrit dans routine-reception.md, dont le
rem  mode (A BLANC ou ECRITURE) est la premiere consigne. Ce fichier ne decide
rem  de rien : il prepare le terrain, lance la session et lui donne d'avance
rem  les seules autorisations dont elle a besoin. Toute autre action lui est
rem  refusee (--permission-mode dontAsk), au lieu de la bloquer sur une question.
rem
rem  Passage en ECRITURE : il faudra aussi l'autoriser a deplacer les photos
rem  dans BL\traites.
rem -------------------------------------------------------------------------

set "BL=G:\.shortcut-targets-by-id\1FOsC4oL_N13Yjdpzr41SlKRJT82yKDL9\BL"
set "BL_REGLE=//g/.shortcut-targets-by-id/1FOsC4oL_N13Yjdpzr41SlKRJT82yKDL9/BL"
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
rem Copie locale de la consigne : lue telle quelle, sans resume. En cas d'echec, la precedente sert.
curl.exe -fsSL "%CONSIGNE_URL%" -o "%CONSIGNE%.tmp" && move /y "%CONSIGNE%.tmp" "%CONSIGNE%" >nul || echo [consigne] telechargement impossible, copie precedente utilisee >> "%JOURNAL%"
if not exist "%CONSIGNE%" (
  echo [ECHEC] aucune consigne disponible >> "%JOURNAL%"
  exit /b 1
)

"%CLAUDE%" -p "Tu geres la reception des bons de livraison du restaurant Braise and Co a Biganos. Lis d'abord la consigne %CONSIGNE% : elle contient tout le contexte et le mode de fonctionnement, respecte-la a la lettre. Les photos sont dans %BL%. Puis execute-la sur les photos en attente, et envoie le recap par mail a braiseandcobiganos@gmail.com meme s'il n'y a eu aucune livraison. Tu n'as que les outils strictement necessaires : si une action t'est refusee, ne cherche pas de contournement, dis-le dans le recap.%ALERTE%" --permission-mode dontAsk --add-dir "%BL%" --allowedTools "Read(./routine-reception.md)" "Read(%BL_REGLE%/**)" "Edit(%BL_REGLE%/lus-a-blanc.txt)" "%SUPABASE_SQL%" "%GMAIL_ENVOI%" >> "%JOURNAL%" 2>&1

if errorlevel 1 (
  echo [ECHEC] la session s'est terminee en erreur >> "%JOURNAL%"
) else (
  echo [OK] termine >> "%JOURNAL%"
)
