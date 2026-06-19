@echo off
REM Build de l'executable Windows autonome (.exe)
REM Prerequis : Python 3.10+ installe et dans le PATH

setlocal
cd /d "%~dp0"

echo === Installation des dependances ===
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install pyinstaller

echo === Build .exe ===
pyinstaller --noconfirm --onefile --windowed ^
    --name ContratsExtra ^
    --add-data "data;data" ^
    main.py

echo.
echo === Termine ===
echo Executable cree : dist\ContratsExtra.exe
pause
