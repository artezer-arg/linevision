@echo off
chcp 65001 >nul
title Enviar Receta y Confirmación a Siemens S7-1500 (DB48)
color 0b

python "%~dp0enviar_receta_db48.py" %*

echo.
pause
