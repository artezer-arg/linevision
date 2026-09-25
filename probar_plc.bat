@echo off
chcp 65001 >nul
title Probar Conexión con PLC Siemens S7-1500
color 0b

echo =======================================================================
echo          HERRAMIENTA DE DIAGNÓSTICO DE RED - PLC SIEMENS S7-1500
echo =======================================================================
echo.
echo Esta herramienta verifica si la IP del PLC responde y si el puerto 102
echo (Siemens ISO-on-TCP / S7comm) está abierto para comunicación.
echo.

set /p PLC_IP=">> Ingrese la dirección IP del PLC (ejemplo 192.168.1.50): "

if "%PLC_IP%"=="" (
    echo [ERROR] No se ingresó ninguna dirección IP.
    goto FIN
)

echo.
echo -----------------------------------------------------------------------
echo 1. Comprobando PING ICMP hacia %PLC_IP%...
echo -----------------------------------------------------------------------
ping -n 2 %PLC_IP%

echo.
echo -----------------------------------------------------------------------
echo 2. Comprobando PUERTO 102 (Protocolo Siemens S7)...
echo -----------------------------------------------------------------------
powershell -NoProfile -Command "$ip = '%PLC_IP%'.Trim(); try { $client = New-Object System.Net.Sockets.TcpClient; $iar = $client.BeginConnect($ip, 102, $null, $null); $ok = $iar.AsyncWaitHandle.WaitOne(3000, $false); if ($ok -and $client.Connected) { $client.EndConnect($iar); $client.Close(); Write-Host '[ÉXITO] ¡Puerto 102 ABIERTO! El PLC Siemens S7-1500 está respondiendo en '$ip':102' -ForegroundColor Green } else { $client.Close(); Write-Host '[FALLO] Timeout: No se pudo conectar al puerto 102 en '$ip'. Verifique cable, IP o subred.' -ForegroundColor Red } } catch { Write-Host '[ERROR] Error de red: ' $_.Exception.Message -ForegroundColor Red }"

echo.
echo -----------------------------------------------------------------------
echo Presione cualquier tecla para salir.
echo -----------------------------------------------------------------------
:FIN
pause
