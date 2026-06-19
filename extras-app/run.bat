@echo off
REM Lancement rapide en mode dev (sans build)
setlocal
cd /d "%~dp0"
python -m pip install -r requirements.txt >nul 2>&1
python main.py
