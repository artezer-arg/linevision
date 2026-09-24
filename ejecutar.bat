@echo off
title LineVision - Puesto DL02
echo ===================================================================
echo     LINEVISION DL02 - INSPECCION DE SOLDADURA Y VISION POKA-YOKE
echo ===================================================================
echo.
echo Iniciando servidor industrial en puerto 5000...
echo Abriendo navegador en http://localhost:5000...
echo.
start http://localhost:5000
LineVision.Api.exe --urls "http://0.0.0.0:5000"
pause
