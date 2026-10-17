@echo off
setlocal
title Nexus Backend Setup

echo ==========================================
echo   Nexus backend - Python 3.11 environment
echo ==========================================
echo.

where py >nul 2>nul
if errorlevel 1 (
  echo ERROR: Python Launcher ^(py^) was not found.
  echo Install Python 3.11 and enable "Python Launcher" during setup.
  pause
  exit /b 1
)

py -3.11 --version
if errorlevel 1 (
  echo ERROR: Python 3.11 was not found.
  echo Install Python 3.11 from https://www.python.org/downloads/
  pause
  exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
  echo Creating isolated virtual environment...
  py -3.11 -m venv .venv
  if errorlevel 1 goto failed
)

echo.
echo Upgrading pip...
".venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 goto failed

echo.
echo Installing requirements...
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto failed

echo.
echo Checking Firebase Admin import...
".venv\Scripts\python.exe" -c "import firebase_admin; print('Firebase Admin import OK')"
if errorlevel 1 goto failed

echo.
echo Setup complete.
echo To start your API, run:
echo   .venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
echo.
pause
exit /b 0

:failed
echo.
echo Setup failed. Read the error above, fix it, then run this script again.
pause
exit /b 1
