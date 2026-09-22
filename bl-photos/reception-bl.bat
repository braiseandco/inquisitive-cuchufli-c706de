@echo off
chcp 65001 >nul
rem ─────────────────────────────────────────────────────────────────────────
rem  Réception des bons de livraison — lancé à l'ouverture de session Windows
rem  par le Planificateur de tâches. Voir README.md pour l'installation.
rem
rem  Tout ce que fait la session est décrit dans routine-reception.md, dont le
rem  mode (À BLANC ou ÉCRITURE) est la première consigne. Ce fichier ne décide
rem  de rien : il ne fait que lancer la session.
rem ─────────────────────────────────────────────────────────────────────────

set "CONSIGNE=https://raw.githubusercontent.com/braiseandco/inquisitive-cuchufli-c706de/main/bl-photos/routine-reception.md"
set "JOURNAL=%USERPROFILE%\bl-reception.log"

echo. >> "%JOURNAL%"
echo ======== %DATE% %TIME% ======== >> "%JOURNAL%"

claude -p "Tu geres la reception des bons de livraison du restaurant Braise and Co a Biganos. Lis d'abord la consigne %CONSIGNE% : elle contient tout le contexte et le mode de fonctionnement, respecte-le a la lettre. Puis execute-la sur les photos en attente, et envoie le recap par mail a braiseandcobiganos@gmail.com meme s'il n'y a eu aucune livraison." >> "%JOURNAL%" 2>&1

if errorlevel 1 (
  echo [ECHEC] la session s'est terminee en erreur >> "%JOURNAL%"
) else (
  echo [OK] termine >> "%JOURNAL%"
)
