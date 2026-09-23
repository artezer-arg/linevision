# LineVision Industrial Automation - Station DL02 (Extensible a DL01-DL05)

Sistema industrial completo para el control del puesto **DL02** (Puertas Automotrices - Paneles Internos). Diseñado para operar 24/7 en PCs Industriales (IPC) bajo Windows, integrando Visión Artificial (OpenCV + ONNX), control Poka-Yoke de cunas e insertos, lectura configurable de QR, handshake seguro con PLC y Robot de soldadura, persistencia transaccional e idempotente en SQL Server, interfaz HMI de alta visibilidad para operadores y simuladores integrados de hardware para desarrollo sin equipos físicos.

---

## 1. Arquitectura del Sistema

La solución está diseñada con arquitectura desacoplada en capas:

```
LineVision/
├── sql/
│   ├── 01_CreateSchema.sql          # Script DDL completo (18 tablas, índices, constraints)
│   └── 02_SeedData_DL02.sql         # Datos semilla (recetas, cámaras, usuarios, planes DL02)
├── src/
│   ├── LineVision.Core/             # Entidades de dominio, Enums, Contratos e Interfaces
│   ├── LineVision.Infrastructure/   # SQL Server / SQLite, PLC Simulator & Handshake, Cámaras
│   ├── LineVision.Vision/           # OpenCV / ONNX, Algoritmos de Visión e InspectionEngine
│   ├── LineVision.Service/          # Máquina de Estados (22 estados), Orquestador, Watchdog, Recuperación
│   ├── LineVision.Api/              # Servidor Web ASP.NET Core, SignalR Hub, REST APIs
│   └── LineVision.Client/           # HMI Operador & Mantenimiento (React 18 + Vite + TailwindCSS)
└── tests/
    └── LineVision.Tests.Unit/       # 17 Pruebas Unitarias de Máquina de Estados, Handshake, QR, etc.
```

---

## 2. Flujo Secuencial Estricto (Inviolable)

```
LEER PUNTERO DL02 EN [Puesto]
       ↓
CARGAR ORDEN DE PRODUCCIÓN (SECUENCIA / MODELO / MANO / POSICIÓN)
       ↓
CARGAR PLAN DE INSPECCIÓN DE CUNA
       ↓
INSPECCIÓN DE CUNA E INSERTOS (CÁMARA CAM_CRADLE)  --> NOK? BLOQUEO A ERROR
       ↓
VALIDACIÓN DE QR DE CUNA (FORMATO PARAMÉTRICO)    --> NOK? BLOQUEO A ERROR
       ↓
CARGAR PLAN DE INSPECCIÓN DE PANEL
       ↓
INSPECCIÓN DEL PANEL (CÁMARAS CAM_PANEL_01 / 02) --> NOK? BLOQUEO A ERROR
       ↓
CONSULTAR DISPONIBILIDAD DE PLC (DEBE SER FREE)  --> NOK? BLOQUEO A ERROR
       ↓
BUSCAR RECETA (Recipe_A y Recipe_B según variante)
       ↓
ENVIAR RECETA AL PLC & ACTIVAR RecipeReady
       ↓
PLC CONFIRMA Y DEVUELVE ECO DE RECETAS A/B       --> DISCREPANCIA? BLOQUEO RECETA NOK
       ↓
ROBOT DE SOLDADURA EJECUTA CICLO (ROBOT_RUNNING)
       ↓
PLC CONFIRMA FIN DE CICLO (CYCLE_FINISHED)
       ↓
REGISTRO IDEMPOTENTE EN [Produccion_Secuencia] (Puesto = 'DL02', Resultado = 'OK')
       ↓
CERRAR [ProductionCycle] & AVANZAR PUNTERO DE [Puesto]
       ↓
VOLVER AL INICIO (SIGUIENTE PANEL)
```

---

## 3. Máquina de Estados (22 Estados Validados)

1. `WAITING_ORDER`: Esperando puntero en base de datos.
2. `ORDER_LOADED`: Orden leída con variante (Modelo, Mano, Posición).
3. `CHECKING_CRADLE`: Cámara inspecciona asiento e insertos de cuna física.
4. `CRADLE_OK`: Cuna validada para la variante esperada.
5. `CHECKING_CRADLE_QR`: Captura y decodificación de código QR de la cuna.
6. `CRADLE_QR_OK`: QR verificado contra variante en base de datos.
7. `LOADING_PANEL_INSPECTION_PLAN`: Carga de puntos y ROIs de versión activa.
8. `CHECKING_PANEL`: Control de clips e insertos del panel interno.
9. `PANEL_OK`: Todos los puntos requeridos resultaron aprobados.
10. `WAITING_PLC`: Consulta del estado lógico del PLC de soldadura.
11. `PLC_READY`: PLC en estado libre y listo para recibir receta.
12. `LOADING_RECIPE`: Búsqueda de recetas Recipe_A y Recipe_B en matriz.
13. `SENDING_RECIPE`: Escritura de registros y pulso RecipeReady.
14. `WAITING_RECIPE_CONFIRMATION`: Esperando confirmación y eco de recetas.
15. `RECIPE_CONFIRMED`: Verificación de eco 100% coincidente.
16. `ROBOT_RUNNING`: Robot ejecutando soldadura (estación bloqueada).
17. `WAITING_ROBOT_FINISH`: Esperando señal CYCLE_FINISHED del PLC.
18. `SAVING_STATION_RESULT`: Registro transaccional en `Produccion_Secuencia`.
19. `CYCLE_COMPLETE`: Ciclo finalizado y registrado con éxito.
20. `ERROR`: Estado seguro de falla (bloquea arranque de soldadura).
21. `MAINTENANCE`: Modo calibración y diagnóstico para ingenieros.
22. `SIMULATION`: Modo de pruebas sin hardware físico.

---

## 4. Garantías Industriales Críticas

- **Seguridad Fail-Safe**: Si hay discrepancia en el eco de recetas (`Echo_A != Recipe_A`), el robot **NUNCA** arranca. Se genera alarma crítica de seguridad.
- **Idempotencia Transaccional**: Antes de insertar en `Produccion_Secuencia`, se evalúa `(ID_Secuencia, Puesto)`. Si ya existe registro previo, se descarta la duplicación para proteger contra doble señal del PLC, rebotes o reinicios de software.
- **Recuperación tras Reinicio (`CycleRecoveryService`)**: Si la IPC se apaga o reinicia a mitad de ciclo, al arrancar consulta el PLC, la base de datos y la tabla de secuencias para reconciliar el estado y evitar colisiones o pérdida de piezas.
- **Auditoría de Bypass Obligatoria (`BypassLog`)**: Ningún paso puede forzarse silenciosamente. Requiere usuario autorizado (ADMIN/ENGINEER/MAINTENANCE) y motivo obligatorio guardado en bitácora inmutable.
- **Cero Hardcoding**: Nombres de tablas, tags del PLC, puntos de inspección, ROIs, tolerancias y recetas provienen de configuración y base de datos.

---

## 5. Ejecución Rápida

### Backend & API
```powershell
# Compilar solución completa
dotnet build LineVision.sln

# Ejecutar suite de pruebas unitarias (17 tests)
dotnet test LineVision.sln

# Iniciar servidor industrial en puerto 5000
dotnet run --project src/LineVision.Api/LineVision.Api.csproj --urls "http://localhost:5000"
```

### Frontend HMI (Kiosk / Navegador)
La aplicación web React ya está compilada y embebida en `src/LineVision.Api/wwwroot`. Al abrir:
👉 **`http://localhost:5000`**

Se accede a:
- **Pantalla Operador**: Datos gigantes de SECUENCIA, MODELO, MANO y POSICIÓN legibles a distancia, barra visual de estados y preview de cámaras con resaltado de fallas.
- **Diagnóstico Técnico**: Conectividad en tiempo real de DB, Cámaras, PLC, Robot y telemetría de latencias.
- **Consola de Simuladores**: Inyección interactiva de fallas al PLC (Timeout, Mismatch, Error, Disconnect), patrones de cámaras y generador de órdenes MES.
- **Mantenimiento & Bypass**: Forzado de estados auditado con control de acceso por roles.
- **Historial de Trazabilidad**: Consulta y drill-down de ciclos ejecutados con evidencia fotográfica.
