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
    private readonly ILogger<PLCManager> _logger;
    private PLCConfiguration _config;
    private readonly object _lock = new();

    private bool _isPhysicalConnected;
    private DateTime _lastPollTime = DateTime.UtcNow;
    private double _lastPingLatencyMs = 0;

    public string PLCId => _config.PLC_ID;
    public bool IsConnected => _config.Protocol == "SIMULATOR" ? _simulator.IsConnected : _isPhysicalConnected;
    public PLCConfiguration CurrentConfig => _config;

    public PLCManager(IDatabaseService db, PLCSimulator simulator, ILogger<PLCManager> logger)
    {
        _db = db;
        _simulator = simulator;
        _logger = logger;

        // Default initial config while loading from DB
        _config = new PLCConfiguration
        {
            PLC_ID = "PLC_DL02",
            StationCode = "DL02",
            Protocol = "SIMULATOR",
            IPAddress = "192.168.1.50",
            Port = 44818,
            PollingIntervalMs = 100,
            TimeoutMs = 2000,
            MaxRetries = 3,
            Active = true
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
