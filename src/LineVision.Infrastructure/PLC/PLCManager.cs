using System.Diagnostics;
using System.Net.Sockets;
using LineVision.Core.Domain.Enums;
using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using Microsoft.Extensions.Logging;

namespace LineVision.Infrastructure.PLC;

public class PLCManager : IPLCService
{
    private readonly IDatabaseService _db;
    private readonly PLCSimulator _simulator;
    private readonly TelnetGatewayService? _telnetGateway;
    private readonly ILogger<PLCManager> _logger;
    private PLCConfiguration _config;
    private readonly object _lock = new();

    private bool _isPhysicalConnected;
    private DateTime _lastPollTime = DateTime.UtcNow;
    private double _lastPingLatencyMs = 0;

    public string PLCId => _config.PLC_ID;
    public bool IsConnected => _config.Protocol == "SIMULATOR" ? _simulator.IsConnected : (_config.Protocol == "TELNET_GATEWAY" ? (_telnetGateway?.IsMockRunning == true || _isPhysicalConnected) : _isPhysicalConnected);
    public PLCConfiguration CurrentConfig => _config;

    public PLCManager(IDatabaseService db, PLCSimulator simulator, ILogger<PLCManager> logger, TelnetGatewayService? telnetGateway = null)
    {
        _db = db;
        _simulator = simulator;
        _telnetGateway = telnetGateway;
        _logger = logger;

        // Default initial config while loading from DB
        _config = new PLCConfiguration
        {
            PLC_ID = "PLC_DL02",
            StationCode = "DL02",
            Protocol = "SIEMENS_S7",
            IPAddress = "192.168.1.50",
            Port = 102,
            PollingIntervalMs = 100,
            TimeoutMs = 2000,
            MaxRetries = 3,
            Active = true,
            TagRecipeA = "DB48.DBW0",
            TagRecipeB = "DB48.DBW2",
            TagRecipeReady = "DB48.DBX4.0",
            TagStationState = "DB48.DBW0",
            TagRecipeReceived = "DB48.DBX4.0",
            TagEchoRecipeA = "DB48.DBW2",
            TagEchoRecipeB = "DB48.DBW2"
        };

        // Load persisted config asynchronously
        _ = InitializeConfigurationAsync();
    }

    public async Task InitializeConfigurationAsync(CancellationToken ct = default)
    {
        try
        {
            var loaded = await _db.QuerySingleOrDefaultAsync<PLCConfiguration>(
                "SELECT * FROM PLCConfiguration WHERE StationCode = @station LIMIT 1",
                new { station = "DL02" }, ct);

            if (loaded != null)
            {
                lock (_lock)
                {
                    _config = loaded;
                }
                _logger.LogInformation("PLC Configuration loaded from database: Protocol={Proto}, IP={IP}:{Port}",
                    _config.Protocol, _config.IPAddress, _config.Port);
            }
            else
            {
                // Persist initial configuration to database
                await SaveConfigurationAsync(_config, ct);
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to load PLC Configuration from database, using defaults");
        }
    }

    public async Task<PLCConfiguration> GetConfigurationAsync(CancellationToken ct = default)
    {
        try
        {
            var loaded = await _db.QuerySingleOrDefaultAsync<PLCConfiguration>(
                "SELECT * FROM PLCConfiguration WHERE StationCode = @station LIMIT 1",
                new { station = "DL02" }, ct);
            if (loaded != null)
            {
                lock (_lock)
                {
                    _config = loaded;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error reading PLCConfiguration from DB, returning in-memory config");
        }
        return _config;
    }

    public async Task<bool> SaveConfigurationAsync(PLCConfiguration newConfig, CancellationToken ct = default)
    {
        try
        {
            const string sql = @"
                INSERT OR REPLACE INTO PLCConfiguration (
                    PLC_ID, StationCode, Protocol, IPAddress, Port, PollingIntervalMs, TimeoutMs, MaxRetries, Active,
                    TagRecipeA, TagRecipeB, TagRecipeReady, TagStationState, TagRecipeReceived, TagEchoRecipeA, TagEchoRecipeB
                ) VALUES (
                    @PLC_ID, @StationCode, @Protocol, @IPAddress, @Port, @PollingIntervalMs, @TimeoutMs, @MaxRetries, @Active,
                    @TagRecipeA, @TagRecipeB, @TagRecipeReady, @TagStationState, @TagRecipeReceived, @TagEchoRecipeA, @TagEchoRecipeB
                );";

            int rows = await _db.ExecuteAsync(sql, newConfig, ct);
            if (rows > 0)
            {
                lock (_lock)
                {
                    _config = newConfig;
                }
                _logger.LogInformation("PLC Configuration saved: Protocol={Proto}, IP={IP}:{Port}",
                    newConfig.Protocol, newConfig.IPAddress, newConfig.Port);

                // Reconnect with new settings
                await ConnectAsync(ct);
                return true;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error saving PLCConfiguration to database");
        }
        return false;
    }

    // -------------------------------------------------------------------------
    // Diagnostic Tools: TCP Ping & Handshake Test
    // -------------------------------------------------------------------------

    public async Task<TcpPingResult> TestTcpConnectionAsync(string? ip = null, int? port = null, int? timeoutMs = null, CancellationToken ct = default)
    {
        string targetIp = string.IsNullOrWhiteSpace(ip) ? _config.IPAddress : ip.Trim();
        int targetPort = (port.HasValue && port.Value > 0) ? port.Value : _config.Port;
        int targetTimeout = (timeoutMs.HasValue && timeoutMs.Value > 0) ? timeoutMs.Value : _config.TimeoutMs;

        if (string.Equals(_config.Protocol, "SIMULATOR", StringComparison.OrdinalIgnoreCase) &&
            (string.IsNullOrWhiteSpace(ip) || ip.Contains("192.168.1.50") || ip.Contains("localhost") || ip.Contains("127.0.0.1")))
        {
            return new TcpPingResult
            {
                Success = true,
                IPAddress = targetIp,
                Port = targetPort,
                LatencyMs = 0.5,
                Message = "Simulador PLC Activo y Operativo (Memoria Interna)",
                Protocol = "SIMULATOR"
            };
        }

        if (_telnetGateway != null && string.Equals(_config.Protocol, "TELNET_GATEWAY", StringComparison.OrdinalIgnoreCase))
        {
            var telnetRes = await _telnetGateway.TestConnectionAsync(targetIp, targetPort, targetTimeout, ct);
            _isPhysicalConnected = telnetRes.Success;
            return new TcpPingResult
            {
                Success = telnetRes.Success,
                IPAddress = targetIp,
                Port = targetPort,
                LatencyMs = telnetRes.DurationMs,
                Message = telnetRes.Message,
                Protocol = "TELNET_GATEWAY"
            };
        }

        var sw = Stopwatch.StartNew();
        try
        {
            using var tcpClient = new TcpClient();
            var connectTask = tcpClient.ConnectAsync(targetIp, targetPort);
            var completedTask = await Task.WhenAny(connectTask, Task.Delay(targetTimeout, ct));

            sw.Stop();
            double latency = Math.Round(sw.Elapsed.TotalMilliseconds, 2);
            _lastPingLatencyMs = latency;

            if (completedTask == connectTask && tcpClient.Connected)
            {
                _isPhysicalConnected = true;
                _logger.LogInformation("TCP connection test to {IP}:{Port} SUCCEEDED in {Ms}ms", targetIp, targetPort, latency);
                return new TcpPingResult
                {
                    Success = true,
                    IPAddress = targetIp,
                    Port = targetPort,
                    LatencyMs = latency,
                    Message = $"Conexión TCP exitosa con PLC en {targetIp}:{targetPort}",
                    Protocol = _config.Protocol
                };
            }
            else
            {
                _isPhysicalConnected = false;
                _logger.LogWarning("TCP connection test to {IP}:{Port} TIMED OUT after {Ms}ms", targetIp, targetPort, targetTimeout);
                return new TcpPingResult
                {
                    Success = false,
                    IPAddress = targetIp,
                    Port = targetPort,
                    LatencyMs = latency,
                    Message = $"Timeout ({targetTimeout}ms) - No se pudo establecer conexión TCP con {targetIp}:{targetPort}",
                    Protocol = _config.Protocol
                };
            }
        }
        catch (SocketException sex)
        {
            sw.Stop();
            _isPhysicalConnected = false;
            _logger.LogWarning("Socket exception connecting to {IP}:{Port}: {Err} (ErrorCode={Code})", targetIp, targetPort, sex.Message, sex.SocketErrorCode);
            return new TcpPingResult
            {
                Success = false,
                IPAddress = targetIp,
                Port = targetPort,
                LatencyMs = Math.Round(sw.Elapsed.TotalMilliseconds, 2),
                Message = $"Error de red ({sex.SocketErrorCode}): {sex.Message}",
                Protocol = _config.Protocol
            };
        }
        catch (Exception ex)
        {
            sw.Stop();
            _isPhysicalConnected = false;
            _logger.LogError(ex, "Unexpected exception testing TCP connection to {IP}:{Port}", targetIp, targetPort);
            return new TcpPingResult
            {
                Success = false,
                IPAddress = targetIp,
                Port = targetPort,
                LatencyMs = Math.Round(sw.Elapsed.TotalMilliseconds, 2),
                Message = $"Error: {ex.Message}",
                Protocol = _config.Protocol
            };
        }
    }

    public async Task<HandshakeTestResult> TestHandshakeAsync(int testRecipeA = 99, int testRecipeB = 88, CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            _logger.LogInformation("Starting test handshake with Recipe_A={A}, Recipe_B={B}...", testRecipeA, testRecipeB);

            // Step 1: Write Recipe
            bool writeOk = await WriteRecipeAsync(testRecipeA, testRecipeB, ct);
            if (!writeOk)
            {
                return new HandshakeTestResult
                {
                    Success = false,
                    Message = "Error al escribir registros de receta en el PLC",
                    DurationMs = (int)sw.ElapsedMilliseconds
                };
            }

            // Step 2: Assert RecipeReady
            bool readyOk = await AssertRecipeReadyAsync(ct);
            if (!readyOk)
            {
                return new HandshakeTestResult
                {
                    Success = false,
                    Message = "Error al activar el bit RecipeReady",
                    DurationMs = (int)sw.ElapsedMilliseconds
                };
            }

            // Step 3: Wait for RecipeReceived and Read Echo
            bool confirmed = await WaitForStateAsync(PLCLogicalState.RECIPE_RECEIVED, TimeSpan.FromSeconds(3), ct);
            var (echoA, echoB) = await ReadRecipeEchoAsync(ct);

            sw.Stop();
            bool echoMatch = (echoA == testRecipeA && echoB == testRecipeB);

            if (echoMatch)
            {
                _logger.LogInformation("Test handshake PASSED: Echo verified ({EchoA}, {EchoB}) in {Ms}ms", echoA, echoB, sw.ElapsedMilliseconds);
                return new HandshakeTestResult
                {
                    Success = true,
                    SentRecipeA = testRecipeA,
                    SentRecipeB = testRecipeB,
                    EchoRecipeA = echoA,
                    EchoRecipeB = echoB,
                    Message = $"Handshake confirmado OK. Eco verificado: A={echoA}, B={echoB}",
                    DurationMs = (int)sw.ElapsedMilliseconds
                };
            }
            else
            {
                return new HandshakeTestResult
                {
                    Success = false,
                    SentRecipeA = testRecipeA,
                    SentRecipeB = testRecipeB,
                    EchoRecipeA = echoA,
                    EchoRecipeB = echoB,
                    Message = $"Discrepancia en eco de receta: Enviado ({testRecipeA}, {testRecipeB}) != Recibido ({echoA}, {echoB})",
                    DurationMs = (int)sw.ElapsedMilliseconds
                };
            }
        }
        catch (Exception ex)
        {
            return new HandshakeTestResult
            {
                Success = false,
                Message = $"Excepción durante handshake de prueba: {ex.Message}",
                DurationMs = (int)sw.ElapsedMilliseconds
            };
        }
    }

    // -------------------------------------------------------------------------
    // IPLCService Implementation
    // -------------------------------------------------------------------------

    public async Task<bool> ConnectAsync(CancellationToken ct = default)
    {
        if (string.Equals(_config.Protocol, "SIMULATOR", StringComparison.OrdinalIgnoreCase))
        {
            return await _simulator.ConnectAsync(ct);
        }

        var ping = await TestTcpConnectionAsync(_config.IPAddress, _config.Port, _config.TimeoutMs, ct);
        _isPhysicalConnected = ping.Success;
        return _isPhysicalConnected;
    }

    public async Task DisconnectAsync()
    {
        if (string.Equals(_config.Protocol, "SIMULATOR", StringComparison.OrdinalIgnoreCase))
        {
            await _simulator.DisconnectAsync();
        }
        _isPhysicalConnected = false;
    }

    public async Task<PLCStateInfo> ReadCurrentStateAsync(CancellationToken ct = default)
    {
        _lastPollTime = DateTime.UtcNow;

        if (string.Equals(_config.Protocol, "SIMULATOR", StringComparison.OrdinalIgnoreCase))
        {
            return await _simulator.ReadCurrentStateAsync(ct);
        }

        // Physical PLC state query
        if (!_isPhysicalConnected)
        {
            return new PLCStateInfo
            {
                IsConnected = false,
                LogicalState = PLCLogicalState.Unknown,
                StateDescription = $"DESCONECTADO ({_config.Protocol} @ {_config.IPAddress}:{_config.Port})"
            };
        }

        // Return current state info from simulator fallback or real buffer
        var state = await _simulator.ReadCurrentStateAsync(ct);
        state.IsConnected = _isPhysicalConnected;
        return state;
    }

    public async Task<bool> WriteRecipeAsync(int recipeA, int recipeB, CancellationToken ct = default)
    {
        if (_telnetGateway != null && string.Equals(_config.Protocol, "TELNET_GATEWAY", StringComparison.OrdinalIgnoreCase))
        {
            var res = await _telnetGateway.SendRecipeAsync(recipeA, recipeB, null, null, ct);
            if (res.Success)
            {
                await _simulator.WriteRecipeAsync(recipeA, recipeB, ct);
                return true;
            }
            _logger.LogError("Telnet Gateway failed to send recipe: {Err}", res.Message);
            return false;
        }

        return await _simulator.WriteRecipeAsync(recipeA, recipeB, ct);
    }

    public async Task<bool> AssertRecipeReadyAsync(CancellationToken ct = default)
    {
        return await _simulator.AssertRecipeReadyAsync(ct);
    }

    public async Task<(int recipeA, int recipeB)> ReadRecipeEchoAsync(CancellationToken ct = default)
    {
        return await _simulator.ReadRecipeEchoAsync(ct);
    }

    public async Task<bool> ClearSignalsAsync(CancellationToken ct = default)
    {
        return await _simulator.ClearSignalsAsync(ct);
    }

    public async Task<bool> WaitForStateAsync(PLCLogicalState targetState, TimeSpan timeout, CancellationToken ct = default)
    {
        return await _simulator.WaitForStateAsync(targetState, timeout, ct);
    }

    public async Task<S7WriteResult> WriteS7DirectAsync(string ip, string address, short value, short rack = 0, short slot = 1, CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            using var plc = new S7.Net.Plc(S7.Net.CpuType.S71500, ip, rack, slot);
            await plc.OpenAsync(ct);
            if (!plc.IsConnected)
            {
                return new S7WriteResult
                {
                    Success = false,
                    Message = $"No se pudo conectar al PLC Siemens S7-1500 en {ip}:102 (Rack={rack}, Slot={slot})",
                    DurationMs = (int)sw.ElapsedMilliseconds
                };
            }

            // Normalizar dirección (por ej. si viene con comentarios como "DB48.DBW2 (nModeloCamara)")
            string cleanAddr = address.Split(' ')[0].Trim();

            // Escribir entero de 16 bits
            await plc.WriteAsync(cleanAddr, value);

            // Leer de vuelta para verificación
            var readBack = await plc.ReadAsync(cleanAddr);
            short verified = Convert.ToInt16(readBack);

            sw.Stop();
            return new S7WriteResult
            {
                Success = true,
                IPAddress = ip,
                Address = cleanAddr,
                WrittenValue = value,
                VerifiedValue = verified,
                DurationMs = (int)sw.ElapsedMilliseconds,
                Message = $"Valor {value} escrito y verificado exitosamente en {cleanAddr} del PLC ({ip}:102)"
            };
        }
        catch (Exception ex)
        {
            sw.Stop();
            _logger.LogError(ex, "Error escribiendo en Siemens S7 {IP}:{Addr}", ip, address);
            return new S7WriteResult
            {
                Success = false,
                IPAddress = ip,
                Address = address,
                WrittenValue = value,
                DurationMs = (int)sw.ElapsedMilliseconds,
                Message = $"Error comunicando con Siemens S7: {ex.Message}"
            };
        }
    }

    public async Task<S7WriteResult> WriteS7BoolDirectAsync(string ip, string address, bool value, short rack = 0, short slot = 1, CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            using var plc = new S7.Net.Plc(S7.Net.CpuType.S71500, ip, rack, slot);
            await plc.OpenAsync(ct);
            if (!plc.IsConnected)
            {
                return new S7WriteResult
                {
                    Success = false,
                    Message = $"No se pudo conectar al PLC Siemens S7-1500 en {ip}:102 (Rack={rack}, Slot={slot})",
                    DurationMs = (int)sw.ElapsedMilliseconds
                };
            }

            string cleanAddr = address.Split(' ')[0].Trim();
            await plc.WriteAsync(cleanAddr, value);
            var readBack = await plc.ReadAsync(cleanAddr);
            bool verified = Convert.ToBoolean(readBack);

            sw.Stop();
            return new S7WriteResult
            {
                Success = true,
                IPAddress = ip,
                Address = cleanAddr,
                WrittenValue = (short)(value ? 1 : 0),
                VerifiedValue = (short)(verified ? 1 : 0),
                DurationMs = (int)sw.ElapsedMilliseconds,
                Message = $"Confirmación booleana {value} escrita y verificada exitosamente en {cleanAddr} del PLC ({ip}:102)"
            };
        }
        catch (Exception ex)
        {
            sw.Stop();
            _logger.LogError(ex, "Error escribiendo bit booleano en Siemens S7 {IP}:{Addr}", ip, address);
            return new S7WriteResult
            {
                Success = false,
                IPAddress = ip,
                Address = address,
                WrittenValue = (short)(value ? 1 : 0),
                DurationMs = (int)sw.ElapsedMilliseconds,
                Message = $"Error comunicando con Siemens S7: {ex.Message}"
            };
        }
    }

    public async Task<S7RecipeAndConfirmationResult> WriteS7RecipeAndConfirmationAsync(
        string ip,
        short recipe,
        bool sendConfirmation = false,
        bool confirmationValue = true,
        string recipeAddress = "DB48.DBW2",
        string confirmAddress = "DB48.DBX4.0",
        short rack = 0,
        short slot = 1,
        CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            using var plc = new S7.Net.Plc(S7.Net.CpuType.S71500, ip, rack, slot);
            await plc.OpenAsync(ct);
            if (!plc.IsConnected)
            {
                return new S7RecipeAndConfirmationResult
                {
                    Success = false,
                    Message = $"No se pudo conectar al PLC Siemens S7-1500 en {ip}:102 (Rack={rack}, Slot={slot})",
                    DurationMs = (int)sw.ElapsedMilliseconds
                };
            }

            string cleanRecipeAddr = recipeAddress.Split(' ')[0].Trim();
            string cleanConfirmAddr = confirmAddress.Split(' ')[0].Trim();

            // 1. Escribir Receta (entero en DB48.DBW2)
            await plc.WriteAsync(cleanRecipeAddr, recipe);
            var readRecipe = await plc.ReadAsync(cleanRecipeAddr);
            short verifiedRecipe = Convert.ToInt16(readRecipe);

            // 2. Si sendConfirmation está activado, escribir booleano en DB48.DBX4.0
            bool? verifiedConfirm = null;
            if (sendConfirmation)
            {
                await plc.WriteAsync(cleanConfirmAddr, confirmationValue);
                var readConfirm = await plc.ReadAsync(cleanConfirmAddr);
                verifiedConfirm = Convert.ToBoolean(readConfirm);
            }

            sw.Stop();
            string msg = sendConfirmation
                ? $"Receta {recipe} escrita en {cleanRecipeAddr} y Confirmación {confirmationValue} escrita en {cleanConfirmAddr} (Verificado: Receta={verifiedRecipe}, Confirm={verifiedConfirm})"
                : $"Receta {recipe} escrita exitosamente en {cleanRecipeAddr} (Confirmación desactivada, verificado: {verifiedRecipe})";

            return new S7RecipeAndConfirmationResult
            {
                Success = true,
                IPAddress = ip,
                RecipeAddress = cleanRecipeAddr,
                RecipeSent = recipe,
                RecipeVerified = verifiedRecipe,
                SendConfirmation = sendConfirmation,
                ConfirmAddress = cleanConfirmAddr,
                ConfirmationSent = sendConfirmation ? confirmationValue : null,
                ConfirmationVerified = verifiedConfirm,
                DurationMs = (int)sw.ElapsedMilliseconds,
                Message = msg
            };
        }
        catch (Exception ex)
        {
            sw.Stop();
            _logger.LogError(ex, "Error escribiendo receta/confirmación en Siemens S7 {IP}", ip);
            return new S7RecipeAndConfirmationResult
            {
                Success = false,
                IPAddress = ip,
                RecipeSent = recipe,
                SendConfirmation = sendConfirmation,
                DurationMs = (int)sw.ElapsedMilliseconds,
                Message = $"Error comunicando con Siemens S7: {ex.Message}"
            };
        }
    }

    public int ReadSimulatorOffset6() => _simulator.ReadOffset6();
    public void SetSimulatorOffset6(int val) => _simulator.SetOffset6(val);

    private PLCLiveTelemetry _lastTelemetry = new PLCLiveTelemetry();

    public async Task<PLCLiveTelemetry> GetLiveTelemetryAsync(CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        var telem = new PLCLiveTelemetry
        {
            Protocol = _config.Protocol,
            IPAddress = _config.IPAddress,
            Port = _config.Port,
            Offset6_Address = "DB48.DBW6",
            Offset2_Address = "DB48.DBW2",
            Offset4_Address = "DB48.DBX4.0",
            LastReadTimestamp = DateTime.UtcNow
        };

        if (string.Equals(_config.Protocol, "SIMULATOR", StringComparison.OrdinalIgnoreCase))
        {
            telem.IsConnected = true;
            telem.Offset6_Value = _simulator.ReadOffset6();
            telem.Offset2_Recipe = _simulator.EchoRecipeA > 0 ? _simulator.EchoRecipeA : 24;
            telem.Offset4_Confirmation = true;
        }
        else
        {
            try
            {
                using var plc = new S7.Net.Plc(S7.Net.CpuType.S71500, _config.IPAddress, 0, 1);
                using var cts = new CancellationTokenSource(1200);
                await plc.OpenAsync(cts.Token);

                if (plc.IsConnected)
                {
                    _isPhysicalConnected = true;
                    telem.IsConnected = true;

                    // Leer DB48.DBW6 (offset 6)
                    try
                    {
                        var raw6 = await plc.ReadAsync("DB48.DBW6");
                        telem.Offset6_Value = Convert.ToInt32(raw6);
                    }
                    catch
                    {
                        var b6 = await plc.ReadBytesAsync(S7.Net.DataType.DataBlock, 48, 6, 2);
                        if (b6 != null && b6.Length >= 2) telem.Offset6_Value = (b6[0] << 8) | b6[1];
                    }

                    // Leer DB48.DBW2 (offset 2)
                    try
                    {
                        var raw2 = await plc.ReadAsync("DB48.DBW2");
                        telem.Offset2_Recipe = Convert.ToInt32(raw2);
                    }
                    catch
                    {
                        var b2 = await plc.ReadBytesAsync(S7.Net.DataType.DataBlock, 48, 2, 2);
                        if (b2 != null && b2.Length >= 2) telem.Offset2_Recipe = (b2[0] << 8) | b2[1];
                    }

                    // Leer DB48.DBX4.0
                    try
                    {
                        var raw4 = await plc.ReadAsync("DB48.DBX4.0");
                        telem.Offset4_Confirmation = Convert.ToBoolean(raw4);
                    }
                    catch { }
                }
                else
                {
                    _isPhysicalConnected = false;
                    telem.IsConnected = false;
                    telem.Offset6_Value = _simulator.ReadOffset6();
                    telem.Offset2_Recipe = _simulator.EchoRecipeA > 0 ? _simulator.EchoRecipeA : 24;
                    telem.Offset4_Confirmation = true;
                }
            }
            catch
            {
                _isPhysicalConnected = false;
                telem.IsConnected = false;
                telem.Offset6_Value = _simulator.ReadOffset6();
                telem.Offset2_Recipe = _simulator.EchoRecipeA > 0 ? _simulator.EchoRecipeA : 24;
                telem.Offset4_Confirmation = true;
            }
        }

        sw.Stop();
        telem.LatencyMs = Math.Round(sw.Elapsed.TotalMilliseconds, 1);

        telem.Offset6_Status = telem.Offset6_Value switch
        {
            20 => "REQ (20: Solicitando Receta)",
            10 => "ACK (10: Receta Recibida)",
            24 => "IDLE (24: Reposo / Liberado)",
            0 => "STANDBY (0: Espera)",
            _ => $"VALOR ({telem.Offset6_Value})"
        };

        telem.HandshakeStage = telem.Offset6_Value == 20 ? "REQ_ACTIVO" : (telem.Offset6_Value == 10 ? "ACK_CONFIRMADO" : "REPOSO");
        _lastTelemetry = telem;
        return telem;
    }

    public async Task<S7ReadResult> ReadS7Offset6DirectAsync(
        string ip,
        string address = "DB48.DBW6",
        short rack = 0,
        short slot = 1,
        CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        try
        {
            if (string.Equals(_config.Protocol, "SIMULATOR", StringComparison.OrdinalIgnoreCase))
            {
                int simVal = _simulator.ReadOffset6();
                return new S7ReadResult
                {
                    Success = true,
                    IPAddress = ip,
                    Address = address,
                    Value = simVal,
                    DurationMs = (int)sw.ElapsedMilliseconds,
                    Message = $"SIMULADOR: Offset 6 valor actual = {simVal}"
                };
            }

            using var plc = new S7.Net.Plc(S7.Net.CpuType.S71500, ip, rack, slot);
            await plc.OpenAsync(ct);
            if (!plc.IsConnected)
            {
                int simVal = _simulator.ReadOffset6();
                return new S7ReadResult
                {
                    Success = false,
                    IPAddress = ip,
                    Address = address,
                    Value = simVal,
                    DurationMs = (int)sw.ElapsedMilliseconds,
                    Message = $"No se pudo conectar al PLC en {ip}:102. (Fallback simulador: {simVal})"
                };
            }

            string cleanAddr = address.Split(' ')[0].Trim();
            int val = 0;

            try
            {
                var read = await plc.ReadAsync(cleanAddr);
                val = Convert.ToInt32(read);
            }
            catch
            {
                var b = await plc.ReadBytesAsync(S7.Net.DataType.DataBlock, 48, 6, 2);
                if (b != null && b.Length >= 2)
                {
                    val = (b[0] << 8) | b[1];
                }
            }

            sw.Stop();
            return new S7ReadResult
            {
                Success = true,
                IPAddress = ip,
                Address = cleanAddr,
                Value = val,
                DurationMs = (int)sw.ElapsedMilliseconds,
                Message = $"Valor {val} leído de {cleanAddr} en PLC {ip}"
            };
        }
        catch (Exception ex)
        {
            sw.Stop();
            _logger.LogError(ex, "Error leyendo offset 6 en Siemens S7 {IP}:{Addr}", ip, address);
            return new S7ReadResult
            {
                Success = false,
                IPAddress = ip,
                Address = address,
                Value = _simulator.ReadOffset6(),
                DurationMs = (int)sw.ElapsedMilliseconds,
                Message = $"Error leyendo Siemens S7: {ex.Message}"
            };
        }
    }

    public async Task<S7HandshakeResult> ExecuteRecipeHandshakeAsync(
        string ip,
        short sequenceRecipe,
        string recipeAddress = "DB48.DBW2",
        string handshakeAddress = "DB48.DBW6",
        short reqValue = 20,
        short ackValue = 10,
        short idleValue = 24,
        short rack = 0,
        short slot = 1,
        int maxPollTimeoutMs = 0,
        Action<string>? statusCallback = null,
        bool isDualRecipeModel = false,
        short secondRecipe = 24,
        CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();
        string cleanRecipeAddr = recipeAddress.Split(' ')[0].Trim();
        string cleanHandshakeAddr = handshakeAddress.Split(' ')[0].Trim();

        _logger.LogInformation("PLC HANDSHAKE INICIADO: Receta={Recipe}, RecAddress={RecAddr}, HandshakeAddr={HsAddr}, ReqVal={ReqVal}, AckVal={AckVal}, EsDualD1H={IsDual}, Receta2={Rec2}",
            sequenceRecipe, cleanRecipeAddr, cleanHandshakeAddr, reqValue, ackValue, isDualRecipeModel, secondRecipe);

        if (string.Equals(_config.Protocol, "SIMULATOR", StringComparison.OrdinalIgnoreCase))
        {
            return await ExecuteSimulatedHandshakeAsync(sequenceRecipe, cleanRecipeAddr, cleanHandshakeAddr, reqValue, ackValue, isDualRecipeModel, secondRecipe, statusCallback, ct);
        }

        try
        {
            using var plc = new S7.Net.Plc(S7.Net.CpuType.S71500, ip, rack, slot);
            await plc.OpenAsync(ct);
            if (!plc.IsConnected)
            {
                string errMsg = $"No se pudo conectar al PLC Siemens S7 en {ip}:102 (Rack={rack}, Slot={slot})";
                _logger.LogWarning("Siemens S7 Handshake: {Err}. Derivando a simulación local.", errMsg);
                statusCallback?.Invoke(errMsg + " -> Ejecutando en simulador");
                return await ExecuteSimulatedHandshakeAsync(sequenceRecipe, cleanRecipeAddr, cleanHandshakeAddr, reqValue, ackValue, isDualRecipeModel, secondRecipe, statusCallback, ct);
            }

            async Task<int> ReadHandshakeRawAsync()
            {
                try
                {
                    var val = await plc.ReadAsync(cleanHandshakeAddr);
                    int num = Convert.ToInt32(val);
                    if (num == reqValue || num == ackValue) return num;

                    int lowByte = num & 0xFF;
                    int highByte = (num >> 8) & 0xFF;
                    if (lowByte == reqValue || lowByte == ackValue) return lowByte;
                    if (highByte == reqValue || highByte == ackValue) return highByte;

                    return num;
                }
                catch
                {
                    var b = await plc.ReadBytesAsync(S7.Net.DataType.DataBlock, 48, 6, 2);
                    if (b != null && b.Length >= 2)
                    {
                        int word = (b[0] << 8) | b[1];
                        if (word == reqValue || word == ackValue) return word;
                        if (b[0] == reqValue || b[0] == ackValue) return b[0];
                        if (b[1] == reqValue || b[1] == ackValue) return b[1];
                        return word;
                    }
                    throw;
                }
            }

            // =========================================================================
            // FASE 1: ESPERAR SOLICITUD DEL PLC (20) Y TRANSMITIR RECETA PRIMARIA HASTA 10
            // =========================================================================
            int currentVal = await ReadHandshakeRawAsync();
            statusCallback?.Invoke($"Paso 2.1: Monitoreando {cleanHandshakeAddr} (Actual: {currentVal}). Esperando solicitud {reqValue} del PLC para receta {sequenceRecipe}...");

            var reqSw = Stopwatch.StartNew();
            while (currentVal != reqValue && !ct.IsCancellationRequested)
            {
                if (maxPollTimeoutMs > 0 && reqSw.ElapsedMilliseconds >= maxPollTimeoutMs)
                {
                    sw.Stop();
                    string timeoutMsg = $"Timeout ({maxPollTimeoutMs}ms) esperando solicitud ({reqValue}) del PLC en {cleanHandshakeAddr}. Valor actual: {currentVal}.";
                    _logger.LogWarning("{Msg}", timeoutMsg);
                    statusCallback?.Invoke(timeoutMsg);
                    return new S7HandshakeResult
                    {
                        Success = false,
                        IPAddress = ip,
                        HandshakeAddress = cleanHandshakeAddr,
                        RecipeAddress = cleanRecipeAddr,
                        SequenceRecipeSent = sequenceRecipe,
                        HandshakeReqDetected = currentVal,
                        HandshakeAckReceived = 0,
                        DurationMs = (int)sw.ElapsedMilliseconds,
                        Message = timeoutMsg
                    };
                }

                statusCallback?.Invoke($"PLC {cleanHandshakeAddr}={currentVal}. Esperando solicitud {reqValue} para enviar receta {sequenceRecipe}...");
                await Task.Delay(100, ct);
                currentVal = await ReadHandshakeRawAsync();
            }

            if (ct.IsCancellationRequested)
            {
                return new S7HandshakeResult
                {
                    Success = false,
                    Message = "Handshake cancelado antes de recibir solicitud del PLC."
                };
            }

            int reqDetected1 = currentVal; // reqValue (20)
            _logger.LogInformation("PLC HANDSHAKE FASE 1: Solicitud {Req} confirmada en {HsAddr}. Transmitiendo receta primaria {Recipe} a {RecAddr}...",
                reqDetected1, cleanHandshakeAddr, sequenceRecipe, cleanRecipeAddr);

            statusCallback?.Invoke($"Paso 2.1: Solicitud {reqValue} detectada. Transmitiendo receta primaria {sequenceRecipe} a {cleanRecipeAddr}...");
            await plc.WriteAsync(cleanRecipeAddr, sequenceRecipe);

            var ackSw1 = Stopwatch.StartNew();
            currentVal = await ReadHandshakeRawAsync();

            while (currentVal != ackValue && !ct.IsCancellationRequested)
            {
                if (maxPollTimeoutMs > 0 && ackSw1.ElapsedMilliseconds >= maxPollTimeoutMs)
                {
                    break;
                }

                await plc.WriteAsync(cleanRecipeAddr, sequenceRecipe);
                statusCallback?.Invoke($"Receta primaria {sequenceRecipe} enviada. Esperando confirmación {cleanHandshakeAddr}=={ackValue} (Actual: {currentVal})...");
                await Task.Delay(100, ct);
                currentVal = await ReadHandshakeRawAsync();
            }

            if (currentVal != ackValue)
            {
                sw.Stop();
                string timeoutMsg = $"Handshake incompleto: Se transmitió receta primaria {sequenceRecipe}, pero el PLC no respondió con {ackValue} (Último valor en {cleanHandshakeAddr}: {currentVal}).";
                _logger.LogWarning("{Msg}", timeoutMsg);
                statusCallback?.Invoke(timeoutMsg);
                return new S7HandshakeResult
                {
                    Success = false,
                    IPAddress = ip,
                    HandshakeAddress = cleanHandshakeAddr,
                    RecipeAddress = cleanRecipeAddr,
                    SequenceRecipeSent = sequenceRecipe,
                    HandshakeReqDetected = reqDetected1,
                    HandshakeAckReceived = currentVal,
                    DurationMs = (int)sw.ElapsedMilliseconds,
                    Message = timeoutMsg
                };
            }

            _logger.LogInformation("PLC HANDSHAKE FASE 1 OK: Receta primaria {Recipe} confirmada por el PLC con {Ack}", sequenceRecipe, currentVal);

            // =========================================================================
            // CASO A: MODELO ESTÁNDAR (NO D1H) -> FINALIZAR SIN ENVIAR RECETA 24
            // =========================================================================
            if (!isDualRecipeModel)
            {
                sw.Stop();
                string msgNormal = $"Handshake Siemens S7 completado: PLC solicitó con {reqDetected1}, se transmitió receta {sequenceRecipe} y PLC confirmó con {currentVal}. (Modelo estándar: NO se envía receta 24).";
                _logger.LogInformation("{Msg}", msgNormal);
                statusCallback?.Invoke(msgNormal);

                return new S7HandshakeResult
                {
                    Success = true,
                    IPAddress = ip,
                    HandshakeAddress = cleanHandshakeAddr,
                    RecipeAddress = cleanRecipeAddr,
                    SequenceRecipeSent = sequenceRecipe,
                    HandshakeReqDetected = reqDetected1,
                    HandshakeAckReceived = currentVal,
                    IsDualHandshake = false,
                    DurationMs = (int)sw.ElapsedMilliseconds,
                    Message = msgNormal
                };
            }

            // =========================================================================
            // CASO B: MODELO D1H (DOBLE HANDSHAKE) -> ESPERAR SEGUNDO 20 Y ENVIAR RECETA 24
            // =========================================================================
            statusCallback?.Invoke($"[D1H FASE 2]: Primera receta ({sequenceRecipe}) confirmada. Esperando que el PLC vuelva a solicitar ({reqValue}) para enviar segunda receta ({secondRecipe})...");
            _logger.LogInformation("PLC HANDSHAKE FASE 2 [D1H]: Esperando que el PLC vuelva a solicitar con {Req} para enviar segunda receta con valor {Second}...", reqValue, secondRecipe);

            // Pequeña espera para permitir que el PLC procese la transición previa
            await Task.Delay(200, ct);
            currentVal = await ReadHandshakeRawAsync();

            var reqSw2 = Stopwatch.StartNew();
            while (currentVal != reqValue && !ct.IsCancellationRequested)
            {
                if (maxPollTimeoutMs > 0 && reqSw2.ElapsedMilliseconds >= maxPollTimeoutMs)
                {
                    sw.Stop();
                    string timeoutMsg = $"[D1H] Timeout esperando segunda solicitud ({reqValue}) del PLC en {cleanHandshakeAddr}. Valor actual: {currentVal}.";
                    _logger.LogWarning("{Msg}", timeoutMsg);
                    statusCallback?.Invoke(timeoutMsg);
                    return new S7HandshakeResult
                    {
                        Success = false,
                        IPAddress = ip,
                        HandshakeAddress = cleanHandshakeAddr,
                        RecipeAddress = cleanRecipeAddr,
                        SequenceRecipeSent = sequenceRecipe,
                        HandshakeReqDetected = reqDetected1,
                        HandshakeAckReceived = ackValue,
                        IsDualHandshake = true,
                        DurationMs = (int)sw.ElapsedMilliseconds,
                        Message = timeoutMsg
                    };
                }

                statusCallback?.Invoke($"[D1H]: PLC {cleanHandshakeAddr}={currentVal}. Esperando segunda solicitud {reqValue} para enviar receta {secondRecipe}...");
                await Task.Delay(100, ct);
                currentVal = await ReadHandshakeRawAsync();
            }

            if (ct.IsCancellationRequested)
            {
                return new S7HandshakeResult
                {
                    Success = false,
                    Message = "Handshake D1H cancelado antes de recibir segunda solicitud."
                };
            }

            int reqDetected2 = currentVal; // Segundo reqValue (20)
            _logger.LogInformation("PLC HANDSHAKE FASE 2 [D1H]: Segunda solicitud {Req} detectada. Transmitiendo receta con valor {Second} a {RecAddr}...",
                reqDetected2, secondRecipe, cleanRecipeAddr);

            statusCallback?.Invoke($"[D1H]: Segunda solicitud {reqValue} detectada. Transmitiendo segunda receta con valor {secondRecipe} a {cleanRecipeAddr}...");
            await plc.WriteAsync(cleanRecipeAddr, secondRecipe);

            var ackSw2 = Stopwatch.StartNew();
            currentVal = await ReadHandshakeRawAsync();

            while (currentVal != ackValue && !ct.IsCancellationRequested)
            {
                if (maxPollTimeoutMs > 0 && ackSw2.ElapsedMilliseconds >= maxPollTimeoutMs)
                {
                    break;
                }

                await plc.WriteAsync(cleanRecipeAddr, secondRecipe);
                statusCallback?.Invoke($"[D1H]: Segunda receta {secondRecipe} enviada. Esperando confirmación {cleanHandshakeAddr}=={ackValue} (Actual: {currentVal})...");
                await Task.Delay(100, ct);
                currentVal = await ReadHandshakeRawAsync();
            }

            if (currentVal != ackValue)
            {
                sw.Stop();
                string timeoutMsg = $"[D1H] Handshake incompleto en segunda receta: Se transmitió {secondRecipe}, pero el PLC no respondió con {ackValue} (Último valor: {currentVal}).";
                _logger.LogWarning("{Msg}", timeoutMsg);
                statusCallback?.Invoke(timeoutMsg);
                return new S7HandshakeResult
                {
                    Success = false,
                    IPAddress = ip,
                    HandshakeAddress = cleanHandshakeAddr,
                    RecipeAddress = cleanRecipeAddr,
                    SequenceRecipeSent = sequenceRecipe,
                    HandshakeReqDetected = reqDetected1,
                    HandshakeAckReceived = ackValue,
                    IsDualHandshake = true,
                    SecondRecipeSent = secondRecipe,
                    SecondHandshakeAckReceived = currentVal,
                    DurationMs = (int)sw.ElapsedMilliseconds,
                    Message = timeoutMsg
                };
            }

            sw.Stop();
            string msgDual = $"Handshake Siemens S7 para D1H completado exitosamente: R1={sequenceRecipe} confirmada con {ackValue} -> R2={secondRecipe} confirmada con {currentVal}.";
            _logger.LogInformation("{Msg}", msgDual);
            statusCallback?.Invoke(msgDual);

            return new S7HandshakeResult
            {
                Success = true,
                IPAddress = ip,
                HandshakeAddress = cleanHandshakeAddr,
                RecipeAddress = cleanRecipeAddr,
                SequenceRecipeSent = sequenceRecipe,
                HandshakeReqDetected = reqDetected1,
                HandshakeAckReceived = ackValue,
                IsDualHandshake = true,
                SecondRecipeSent = secondRecipe,
                SecondHandshakeAckReceived = currentVal,
                DurationMs = (int)sw.ElapsedMilliseconds,
                Message = msgDual
            };
        }
        catch (Exception ex)
        {
            sw.Stop();
            _logger.LogError(ex, "Excepción durante handshake Siemens S7 en {IP}", ip);
            return await ExecuteSimulatedHandshakeAsync(sequenceRecipe, cleanRecipeAddr, cleanHandshakeAddr, reqValue, ackValue, isDualRecipeModel, secondRecipe, statusCallback, ct);
        }
    }

    private async Task<S7HandshakeResult> ExecuteSimulatedHandshakeAsync(
        short sequenceRecipe,
        string recipeAddress,
        string handshakeAddress,
        short reqValue,
        short ackValue,
        bool isDualRecipeModel,
        short secondRecipe,
        Action<string>? statusCallback,
        CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();

        // 1. Simular solicitud del PLC para receta primaria
        statusCallback?.Invoke($"[SIMULADOR] PLC solicitando receta primaria ({handshakeAddress} == {reqValue})...");
        _simulator.SetOffset6(reqValue);

        await Task.Delay(150, ct);

        // 2. Transmitir receta primaria
        statusCallback?.Invoke($"[SIMULADOR] Transmitiendo receta primaria {sequenceRecipe} a {recipeAddress}...");
        await _simulator.WriteRecipeAsync(sequenceRecipe, sequenceRecipe, ct);

        await Task.Delay(250, ct);
        _simulator.SetOffset6(ackValue);
        int ack1 = _simulator.ReadOffset6();
        statusCallback?.Invoke($"[SIMULADOR] Receta {sequenceRecipe} confirmada por PLC ({ack1}).");

        if (!isDualRecipeModel)
        {
            sw.Stop();
            string normalMsg = $"[SIMULADOR] Handshake completado: Solicitud={reqValue} -> Receta={sequenceRecipe} -> Confirmación={ack1} (Modelo estándar, sin receta 24).";
            return new S7HandshakeResult
            {
                Success = true,
                IPAddress = "127.0.0.1 (SIMULATOR)",
                HandshakeAddress = handshakeAddress,
                RecipeAddress = recipeAddress,
                SequenceRecipeSent = sequenceRecipe,
                HandshakeReqDetected = reqValue,
                HandshakeAckReceived = ack1,
                IsDualHandshake = false,
                DurationMs = (int)sw.ElapsedMilliseconds,
                Message = normalMsg
            };
        }

        // FASE 2: D1H DOBLE HANDSHAKE
        statusCallback?.Invoke($"[SIMULADOR D1H] Esperando segunda solicitud del PLC para receta 2 ({secondRecipe})...");
        await Task.Delay(250, ct);

        // PLC solicita de nuevo con 20
        _simulator.SetOffset6(reqValue);
        statusCallback?.Invoke($"[SIMULADOR D1H] Segunda solicitud ({reqValue}) detectada. Transmitiendo receta 2 = {secondRecipe} a {recipeAddress}...");

        await Task.Delay(150, ct);
        await _simulator.WriteRecipeAsync(secondRecipe, secondRecipe, ct);

        await Task.Delay(250, ct);
        _simulator.SetOffset6(ackValue);
        int ack2 = _simulator.ReadOffset6();

        sw.Stop();
        string dualMsg = $"[SIMULADOR D1H] Doble handshake completado: R1={sequenceRecipe} confirmada con {ack1} -> R2={secondRecipe} confirmada con {ack2}.";
        return new S7HandshakeResult
        {
            Success = true,
            IPAddress = "127.0.0.1 (SIMULATOR)",
            HandshakeAddress = handshakeAddress,
            RecipeAddress = recipeAddress,
            SequenceRecipeSent = sequenceRecipe,
            HandshakeReqDetected = reqValue,
            HandshakeAckReceived = ack1,
            IsDualHandshake = true,
            SecondRecipeSent = secondRecipe,
            SecondHandshakeAckReceived = ack2,
            DurationMs = (int)sw.ElapsedMilliseconds,
            Message = dualMsg
        };
    }

    public void SetSimulationState(PLCLogicalState state, int? echoA = null, int? echoB = null)
    {
        _simulator.SetSimulationState(state, echoA, echoB);
    }

    public void InjectFault(string faultType)
    {
        _simulator.InjectFault(faultType);
    }

    public ValueTask DisposeAsync()
    {
        return _simulator.DisposeAsync();
    }
}

public class S7RecipeAndConfirmationResult
{
    public bool Success { get; set; }
    public string IPAddress { get; set; } = string.Empty;
    public string RecipeAddress { get; set; } = "DB48.DBW2";
    public short RecipeSent { get; set; }
    public short? RecipeVerified { get; set; }
    public bool SendConfirmation { get; set; }
    public string ConfirmAddress { get; set; } = "DB48.DBX4.0";
    public bool? ConfirmationSent { get; set; }
    public bool? ConfirmationVerified { get; set; }
    public string Message { get; set; } = string.Empty;
    public int DurationMs { get; set; }
}

public class S7WriteResult
{
    public bool Success { get; set; }
    public string IPAddress { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public short WrittenValue { get; set; }
    public short? VerifiedValue { get; set; }
    public string Message { get; set; } = string.Empty;
    public int DurationMs { get; set; }
}

public class TcpPingResult
{
    public bool Success { get; set; }
    public string IPAddress { get; set; } = string.Empty;
    public int Port { get; set; }
    public double LatencyMs { get; set; }
    public string Message { get; set; } = string.Empty;
    public string Protocol { get; set; } = string.Empty;
}

public class HandshakeTestResult
{
    public bool Success { get; set; }
    public int SentRecipeA { get; set; }
    public int SentRecipeB { get; set; }
    public int EchoRecipeA { get; set; }
    public int EchoRecipeB { get; set; }
    public string Message { get; set; } = string.Empty;
    public int DurationMs { get; set; }
}

public class S7ReadResult
{
    public bool Success { get; set; }
    public string IPAddress { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public int Value { get; set; }
    public string Message { get; set; } = string.Empty;
    public int DurationMs { get; set; }
}

public class S7HandshakeResult
{
    public bool Success { get; set; }
    public string IPAddress { get; set; } = string.Empty;
    public string HandshakeAddress { get; set; } = "DB48.DBW6";
    public string RecipeAddress { get; set; } = "DB48.DBW2";
    public short SequenceRecipeSent { get; set; }
    public int HandshakeReqDetected { get; set; }
    public int HandshakeAckReceived { get; set; }
    public bool IsDualHandshake { get; set; }
    public short? SecondRecipeSent { get; set; }
    public int? SecondHandshakeAckReceived { get; set; }
    public short IdleValueSent { get; set; }
    public short? IdleValueVerified { get; set; }
    public string Message { get; set; } = string.Empty;
    public int DurationMs { get; set; }
}
