using System.Diagnostics;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using LineVision.Core.Domain.Models;
using Microsoft.Extensions.Logging;

namespace LineVision.Infrastructure.PLC;

public class TelnetGatewayService : IAsyncDisposable
{
    private readonly ILogger<TelnetGatewayService> _logger;
    private readonly string _configFilePath;
    private TelnetGatewayConfig _config;
    private readonly object _lock = new();
    private readonly List<TelnetLogEntry> _terminalLogs = new();
    private const int MaxLogs = 100;

    // Built-in Mock / Test Server
    private TcpListener? _mockListener;
    private CancellationTokenSource? _mockCts;
    private Task? _mockListenerTask;
    private bool _isMockRunning;

    public TelnetGatewayConfig CurrentConfig => _config;
    public bool IsMockRunning => _isMockRunning;

    public TelnetGatewayService(ILogger<TelnetGatewayService> logger)
    {
        _logger = logger;
        _configFilePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "telnet_gateway_config.json");
        _config = LoadConfiguration();
    }

    private TelnetGatewayConfig LoadConfiguration()
    {
        try
        {
            if (File.Exists(_configFilePath))
            {
                string json = File.ReadAllText(_configFilePath);
                var loaded = JsonSerializer.Deserialize<TelnetGatewayConfig>(json);
                if (loaded != null)
                {
                    _logger.LogInformation("TelnetGatewayConfig cargada desde {Path}: Host={Host}, Port={Port}",
                        _configFilePath, loaded.Host, loaded.Port);
                    return loaded;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error al cargar configuración de Telnet Gateway, usando defaults");
        }

        return new TelnetGatewayConfig
        {
            Host = "127.0.0.1",
            Port = 12345,
            TimeoutMs = 3000,
            CommandTemplate = "RECIPE:{recipeA},{recipeB}",
            LineTerminator = "CRLF",
            WaitForResponse = true,
            ExpectedResponsePattern = "OK|ACK|RECIPE",
            MockServerEnabled = false,
            Active = true
        };
    }

    public bool SaveConfiguration(TelnetGatewayConfig newConfig)
    {
        try
        {
            lock (_lock)
            {
                _config = newConfig;
                string json = JsonSerializer.Serialize(newConfig, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(_configFilePath, json);
            }

            Log("INFO", $"Configuración guardada: {_config.Host}:{_config.Port} | Template: {_config.CommandTemplate} | Term: {_config.LineTerminator}");
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al guardar configuración de Telnet Gateway");
            Log("ERROR", $"Error al guardar configuración: {ex.Message}");
            return false;
        }
    }

    public List<TelnetLogEntry> GetLogs(int count = 50)
    {
        lock (_terminalLogs)
        {
            return _terminalLogs.TakeLast(count).ToList();
        }
    }

    public void ClearLogs()
    {
        lock (_terminalLogs)
        {
            _terminalLogs.Clear();
        }
    }

    private void Log(string direction, string message)
    {
        var entry = new TelnetLogEntry
        {
            Timestamp = DateTime.UtcNow,
            Direction = direction,
            Content = message
        };

        lock (_terminalLogs)
        {
            _terminalLogs.Add(entry);
            if (_terminalLogs.Count > MaxLogs)
            {
                _terminalLogs.RemoveAt(0);
            }
        }

        _logger.LogDebug("[TELNET {Dir}] {Msg}", direction, message);
    }

    // -------------------------------------------------------------------------
    // Diagnostic Ping TCP
    // -------------------------------------------------------------------------
    public async Task<TelnetSendResult> TestConnectionAsync(string? host = null, int? port = null, int? timeoutMs = null, CancellationToken ct = default)
    {
        string targetHost = string.IsNullOrWhiteSpace(host) ? _config.Host : host.Trim();
        int targetPort = (port.HasValue && port.Value > 0) ? port.Value : _config.Port;
        int targetTimeout = (timeoutMs.HasValue && timeoutMs.Value > 0) ? timeoutMs.Value : _config.TimeoutMs;

        Log("SEND", $"[PING TCP] Conectando a {targetHost}:{targetPort} (Timeout: {targetTimeout}ms)...");

        var sw = Stopwatch.StartNew();
        try
        {
            using var client = new TcpClient();
            var connectTask = client.ConnectAsync(targetHost, targetPort);
            var completedTask = await Task.WhenAny(connectTask, Task.Delay(targetTimeout, ct));

            sw.Stop();
            int latency = (int)sw.ElapsedMilliseconds;

            if (completedTask == connectTask && client.Connected)
            {
                string okMsg = $"Conexión TCP establecida exitosamente con la app del PLC en {targetHost}:{targetPort} ({latency}ms).";
                Log("RECV", $"[CONECTADO] {okMsg}");
                return new TelnetSendResult
                {
                    Success = true,
                    SentPayload = "TCP_CONNECT_PING",
                    ReceivedResponse = "CONNECTED",
                    DurationMs = latency,
                    Message = okMsg
                };
            }
            else
            {
                string failMsg = $"Timeout ({targetTimeout}ms) - La app del PLC en {targetHost}:{targetPort} no responde o no está en ejecución.";
                Log("ERROR", $"[TIMEOUT] {failMsg}");
                return new TelnetSendResult
                {
                    Success = false,
                    SentPayload = "TCP_CONNECT_PING",
                    DurationMs = latency,
                    Message = failMsg
                };
            }
        }
        catch (SocketException sex)
        {
            sw.Stop();
            string failMsg = $"Error de Socket ({sex.SocketErrorCode}): {sex.Message}. Verifique que la aplicación del proveedor esté iniciada y escuchando en el puerto {targetPort}.";
            Log("ERROR", $"[SOCKET ERROR] {failMsg}");
            return new TelnetSendResult
            {
                Success = false,
                SentPayload = "TCP_CONNECT_PING",
                DurationMs = (int)sw.ElapsedMilliseconds,
                Message = failMsg
            };
        }
        catch (Exception ex)
        {
            sw.Stop();
            string failMsg = $"Excepción al conectar: {ex.Message}";
            Log("ERROR", $"[ERROR] {failMsg}");
            return new TelnetSendResult
            {
                Success = false,
                SentPayload = "TCP_CONNECT_PING",
                DurationMs = (int)sw.ElapsedMilliseconds,
                Message = failMsg
            };
        }
    }

    // -------------------------------------------------------------------------
    // Format and Send Recipe
    // -------------------------------------------------------------------------
    public async Task<TelnetSendResult> SendRecipeAsync(
        int recipeA,
        int recipeB,
        string? cradleCode = null,
        string? model = null,
        CancellationToken ct = default)
    {
        string template = string.IsNullOrWhiteSpace(_config.CommandTemplate)
            ? "RECIPE:{recipeA},{recipeB}"
            : _config.CommandTemplate;

        string payload = template
            .Replace("{recipeA}", recipeA.ToString())
            .Replace("{recipeB}", recipeB.ToString())
            .Replace("{cradleCode}", cradleCode ?? "CUNA-01")
            .Replace("{model}", model ?? "P1B");

        return await SendRawCommandAsync(payload, appendTerminator: true, ct);
    }

    // -------------------------------------------------------------------------
    // Send Raw String Command over TCP
    // -------------------------------------------------------------------------
    public async Task<TelnetSendResult> SendRawCommandAsync(
        string rawCommand,
        bool appendTerminator = true,
        CancellationToken ct = default)
    {
        var result = new TelnetSendResult
        {
            SentPayload = rawCommand,
            Timestamp = DateTime.UtcNow
        };

        string terminatorStr = _config.LineTerminator switch
        {
            "CRLF" => "\r\n",
            "LF" => "\n",
            "CR" => "\r",
            _ => ""
        };

        string finalPayload = appendTerminator ? rawCommand + terminatorStr : rawCommand;
        byte[] bytesToSend = Encoding.UTF8.GetBytes(finalPayload);

        Log("SEND", $">> [{_config.Host}:{_config.Port}] {rawCommand} ({_config.LineTerminator})");

        var sw = Stopwatch.StartNew();
        try
        {
            using var client = new TcpClient();
            var connectTask = client.ConnectAsync(_config.Host, _config.Port);
            var completedTask = await Task.WhenAny(connectTask, Task.Delay(_config.TimeoutMs, ct));

            if (completedTask != connectTask || !client.Connected)
            {
                sw.Stop();
                result.Success = false;
                result.DurationMs = (int)sw.ElapsedMilliseconds;
                result.Message = $"Timeout al conectar con la app del PLC en {_config.Host}:{_config.Port}.";
                Log("ERROR", $"[ERROR ENVIO] {result.Message}");
                return result;
            }

            using var stream = client.GetStream();
            stream.ReadTimeout = _config.TimeoutMs;
            stream.WriteTimeout = _config.TimeoutMs;

            // Send bytes
            await stream.WriteAsync(bytesToSend, 0, bytesToSend.Length, ct);
            await stream.FlushAsync(ct);

            // Wait for response if configured
            if (_config.WaitForResponse)
            {
                byte[] buffer = new byte[2048];
                using var ctsWithTimeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
                ctsWithTimeout.CancelAfter(_config.TimeoutMs);

                try
                {
                    int bytesRead = await stream.ReadAsync(buffer, 0, buffer.Length, ctsWithTimeout.Token);
                    sw.Stop();
                    result.DurationMs = (int)sw.ElapsedMilliseconds;

                    if (bytesRead > 0)
                    {
                        string responseText = Encoding.UTF8.GetString(buffer, 0, bytesRead).TrimEnd('\r', '\n');
                        result.ReceivedResponse = responseText;
                        Log("RECV", $"<< [{_config.Host}:{_config.Port}] {responseText} ({result.DurationMs}ms)");

                        // Check pattern if configured
                        if (!string.IsNullOrWhiteSpace(_config.ExpectedResponsePattern))
                        {
                            bool patternMatches = Regex.IsMatch(responseText, _config.ExpectedResponsePattern, RegexOptions.IgnoreCase);
                            if (patternMatches)
                            {
                                result.Success = true;
                                result.Message = $"Receta enviada y confirmada por la app del PLC: \"{responseText}\"";
                            }
                            else
                            {
                                result.Success = false;
                                result.Message = $"Respuesta recibida ({responseText}) no coincide con el patrón esperado ({_config.ExpectedResponsePattern}).";
                            }
                        }
                        else
                        {
                            result.Success = true;
                            result.Message = $"Comando enviado y respuesta recibida: \"{responseText}\"";
                        }
                    }
                    else
                    {
                        result.Success = false;
                        result.DurationMs = (int)sw.ElapsedMilliseconds;
                        result.Message = "El servidor cerró la conexión sin enviar respuesta.";
                        Log("ERROR", $"[ERROR RESPUESTA] {result.Message}");
                    }
                }
                catch (OperationCanceledException)
                {
                    sw.Stop();
                    result.Success = false;
                    result.DurationMs = (int)sw.ElapsedMilliseconds;
                    result.Message = $"Timeout esperando respuesta de la app del PLC ({_config.TimeoutMs}ms).";
                    Log("ERROR", $"[TIMEOUT RESPUESTA] {result.Message}");
                }
            }
            else
            {
                sw.Stop();
                result.Success = true;
                result.DurationMs = (int)sw.ElapsedMilliseconds;
                result.Message = "Comando transmitido exitosamente (Modo sin espera de respuesta).";
            }
        }
        catch (SocketException sex)
        {
            sw.Stop();
            result.Success = false;
            result.DurationMs = (int)sw.ElapsedMilliseconds;
            result.Message = $"Error de socket ({sex.SocketErrorCode}): {sex.Message}";
            Log("ERROR", $"[SOCKET ERROR] {result.Message}");
        }
        catch (Exception ex)
        {
            sw.Stop();
            result.Success = false;
            result.DurationMs = (int)sw.ElapsedMilliseconds;
            result.Message = $"Excepción al transmitir: {ex.Message}";
            Log("ERROR", $"[EXCEPTION] {result.Message}");
        }

        return result;
    }

    // -------------------------------------------------------------------------
    // Built-in Mock Server on Port 12345
    // Permite al usuario probar INMEDIATAMENTE sin depender de que la app externa
    // esté abierta en ese instante.
    // -------------------------------------------------------------------------
    public bool ToggleMockServer(bool enable, int port = 12345)
    {
        if (enable)
        {
            if (_isMockRunning) return true;

            try
            {
                _mockCts = new CancellationTokenSource();
                _mockListener = new TcpListener(IPAddress.Parse("127.0.0.1"), port);
                _mockListener.Start();
                _isMockRunning = true;

                _mockListenerTask = Task.Run(() => RunMockServerLoopAsync(_mockListener, _mockCts.Token));

                Log("INFO", $"[SERVIDOR SIMULADO INICIADO] Escuchando en 127.0.0.1:{port} (Listo para recibir pruebas de Telnet)");
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al iniciar servidor simulado en puerto {Port}", port);
                Log("ERROR", $"No se pudo iniciar servidor simulado en 127.0.0.1:{port}: {ex.Message}");
                _isMockRunning = false;
                return false;
            }
        }
        else
        {
            if (!_isMockRunning) return true;

            try
            {
                _mockCts?.Cancel();
                _mockListener?.Stop();
                _isMockRunning = false;
                Log("INFO", $"[SERVIDOR SIMULADO DETENIDO] Puerto 127.0.0.1:{port} liberado.");
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al detener servidor simulado");
                return false;
            }
        }
    }

    private async Task RunMockServerLoopAsync(TcpListener listener, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                var client = await listener.AcceptTcpClientAsync(ct);
                _ = HandleMockClientAsync(client, ct);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                if (!ct.IsCancellationRequested)
                {
                    _logger.LogError(ex, "Excepción en bucle de servidor simulado");
                }
            }
        }
    }

    private async Task HandleMockClientAsync(TcpClient client, CancellationToken ct)
    {
        using (client)
        using (var stream = client.GetStream())
        {
            byte[] buffer = new byte[2048];
            try
            {
                int read = await stream.ReadAsync(buffer, 0, buffer.Length, ct);
                if (read > 0)
                {
                    string incoming = Encoding.UTF8.GetString(buffer, 0, read).TrimEnd('\r', '\n');
                    Log("INFO", $"[MOCK APP DEL PROVEEDOR] Solicitud recibida: \"{incoming}\"");

                    // Generate appropriate ACK response
                    string responseText;
                    if (incoming.StartsWith("RECIPE:", StringComparison.OrdinalIgnoreCase))
                    {
                        var parts = incoming.Substring(7).Split(',');
                        string rA = parts.Length > 0 ? parts[0] : "0";
                        string rB = parts.Length > 1 ? parts[1] : "0";
                        responseText = $"OK RECIPE RECEIVED: A={rA} B={rB}\r\n";
                    }
                    else if (incoming.Contains(","))
                    {
                        var parts = incoming.Split(',');
                        string p1 = parts.Length > 1 ? parts[1] : "0";
                        responseText = $"OK RECIPE {parts[0]},{p1} INJECTED_TO_PLC\r\n";
                    }
                    else if (incoming.Equals("PING", StringComparison.OrdinalIgnoreCase))
                    {
                        responseText = "OK PONG\r\n";
                    }
                    else
                    {
                        responseText = $"OK ACK: {incoming}\r\n";
                    }

                    byte[] replyBytes = Encoding.UTF8.GetBytes(responseText);
                    await stream.WriteAsync(replyBytes, 0, replyBytes.Length, ct);
                    await stream.FlushAsync(ct);

                    Log("INFO", $"[MOCK APP DEL PROVEEDOR] Respuesta enviada: \"{responseText.TrimEnd('\r', '\n')}\"");
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error atendiendo cliente en servidor simulado");
            }
        }
    }

    public async ValueTask DisposeAsync()
    {
        ToggleMockServer(false);
        if (_mockListenerTask != null)
        {
            try { await _mockListenerTask; } catch { }
        }
    }
}
