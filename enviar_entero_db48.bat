@echo off
chcp 65001 >nul
title Enviar Entero a Siemens S7-1500 - DB48.DBW2
color 0a

python "%~dp0enviar_entero_db48.py" %*

echo.
pause
