@echo off
setlocal
cd /d "%~dp0"
set "PYTHON_EXE=C:\Users\ASUS\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
rem No se usa PYTHONPATH: el prototipo incluye un servidor estandar de respaldo
rem para poder iniciar aun si no hay dependencias de FastAPI instaladas.

if not exist "%PYTHON_EXE%" (
  echo No se encontro el runtime Python incluido.
  echo Instale Python 3.11+ y ejecute: py -m pip install -r requirements.txt
  pause
  exit /b 1
)

echo Iniciando Vialseg en http://127.0.0.1:8000
"%PYTHON_EXE%" app.py
pause
