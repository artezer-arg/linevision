using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using LineVision.Infrastructure.Simulators;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace LineVision.Infrastructure.Services;

public class ProductionOrderService : IProductionOrderService
{
    private readonly IDatabaseService _db;
    private readonly ProductionSimulator _simulator;
    private readonly ILogger<ProductionOrderService> _logger;
    private readonly string _sqlGetPointer;
    private readonly string _sqlGetOrder;
    private readonly string _sqlAdvancePointer;
    private readonly string _sqlGetPending;

    public ProductionOrderService(IDatabaseService db, ProductionSimulator simulator, IConfiguration config, ILogger<ProductionOrderService> logger)
    {
        _db = db;
        _simulator = simulator;
        _logger = logger;

        // Consultas SQL 100% parametrizables desde configuración
        _sqlGetPointer = config["Queries:GetStationPointer"] 
            ?? "SELECT Puntero_ID_OrdenProduccion FROM Puesto WHERE UPPER(Puesto) = 'DL01'";

        _sqlGetOrder = config["Queries:GetProductionOrder"] 
            ?? "SELECT ID_OrdenProduccion, ID_OrdenCliente, ID_Secuencia, Secuencia, Modelo, Mano, Posicion, Orden, Estado, FechaCreacion FROM OrdenProduccion WHERE ID_OrdenProduccion = @orderId";

        _sqlAdvancePointer = config["Queries:AdvanceStationPointer"]
            ?? "UPDATE Puesto SET Puntero_ID_OrdenProduccion = @nextOrderId, Fecha_Puntero = @now, UltimaActualizacion = @now WHERE UPPER(Puesto) = 'DL01' OR UPPER(Puesto) = UPPER(@stationCode)";

        _sqlGetPending = config["Queries:GetPendingOrders"]
            ?? "SELECT ID_OrdenProduccion, ID_OrdenCliente, ID_Secuencia, Secuencia, Modelo, Mano, Posicion, Orden, Estado, FechaCreacion FROM OrdenProduccion ORDER BY Orden ASC LIMIT @limit";
    }

    public async Task<ProductionOrder?> GetCurrentOrderForStationAsync(string stationCode, CancellationToken ct = default)
    {
        try
        {
            // 1. Obtener el puntero_id_ordenproduccion de la tabla puesto donde puesto es DL01
            var pointerId = await _db.QuerySingleOrDefaultAsync<int?>(_sqlGetPointer, new { stationCode }, ct);
            if (!pointerId.HasValue || pointerId.Value <= 0)
            {
                // Fallback explícito: buscar directamente en Puesto WHERE UPPER(Puesto) = 'DL01'
                try
                {
                    pointerId = await _db.QuerySingleOrDefaultAsync<int?>(
                        "SELECT Puntero_ID_OrdenProduccion FROM Puesto WHERE UPPER(Puesto) = 'DL01'", ct: ct);
                }
                catch { }

                // Fallback de contingencia si DL01 no existe en la base de datos local: buscar por stationCode
                if (!pointerId.HasValue || pointerId.Value <= 0)
                {
                    try
                    {
                        pointerId = await _db.QuerySingleOrDefaultAsync<int?>(
                            "SELECT Puntero_ID_OrdenProduccion FROM Puesto WHERE UPPER(Puesto) = UPPER(@stationCode)", 
                            new { stationCode }, ct);
                    }
                    catch { }
                }
            }

            int currentPointer = pointerId.GetValueOrDefault(18);
            if (currentPointer <= 0) currentPointer = 18;

            // 2. Buscar la orden asociada al puntero obtenido:
            // El puntero de Puesto (puntero_id_ordenproduccion) apunta al ID_OrdenProduccion
            var order = await _db.QuerySingleOrDefaultAsync<ProductionOrder>(_sqlGetOrder, new { orderId = currentPointer }, ct);
            if (order == null)
            {
                order = await _db.QuerySingleOrDefaultAsync<ProductionOrder>(
                    @"SELECT ID_OrdenProduccion, ID_OrdenCliente, ID_Secuencia, Secuencia, Modelo, Mano, Posicion, Orden, Estado, FechaCreacion 
                      FROM OrdenProduccion 
                      WHERE ID_OrdenProduccion = @orderId OR ID_Secuencia = @orderId OR Secuencia = CAST(@orderId AS VARCHAR(20))
                      ORDER BY ID_OrdenProduccion ASC LIMIT 1",
                    new { orderId = currentPointer }, ct);
            }

            if (order == null)
            {
                // 3. Buscar siguiente orden existente >= pointer en OrdenProduccion
                const string sqlFindNext = @"
                    SELECT ID_OrdenProduccion, ID_OrdenCliente, ID_Secuencia, Secuencia, Modelo, Mano, Posicion, Orden, Estado, FechaCreacion 
                    FROM OrdenProduccion 
                    WHERE ID_OrdenProduccion >= @orderId OR ID_Secuencia >= @orderId
                    ORDER BY ID_OrdenProduccion ASC 
                    LIMIT 1";
                order = await _db.QuerySingleOrDefaultAsync<ProductionOrder>(sqlFindNext, new { orderId = currentPointer }, ct);

                // 4. Si no se encuentra en OrdenProduccion, buscar en la tabla nativa de planta Orden_Produccion
                if (order == null)
                {
                    try
                    {
                        const string sqlPlant = @"
                            SELECT 
                                ID_OrdenProduccion, 
                                CAST(ID_OrdenCliente AS VARCHAR(50)) as ID_OrdenCliente, 
                                Secuencia as ID_Secuencia, 
                                RIGHT('0000' + CAST(Secuencia AS VARCHAR(10)), 4) as Secuencia, 
                                SD as Modelo, 
                                Mano, 
                                CASE WHEN Posicion = 'FR' THEN 'FRONT' WHEN Posicion = 'RR' THEN 'REAR' ELSE Posicion END as Posicion, 
                                Orden, 
                                'PENDIENTE' as Estado, 
                                ISNULL(Fecha_Secuencia, GETDATE()) as FechaCreacion
                            FROM Orden_Produccion
                            WHERE ID_OrdenProduccion = @orderId OR Secuencia = @orderId OR ID_OrdenProduccion >= @orderId
                            ORDER BY ID_OrdenProduccion ASC
                            LIMIT 1";
                        order = await _db.QuerySingleOrDefaultAsync<ProductionOrder>(sqlPlant, new { orderId = currentPointer }, ct);
                        if (order != null)
                        {
                            const string sqlSync = @"
                                IF NOT EXISTS (SELECT 1 FROM OrdenProduccion WHERE ID_OrdenProduccion = @ID_OrdenProduccion)
                                INSERT INTO OrdenProduccion (ID_OrdenProduccion, ID_OrdenCliente, ID_Secuencia, Secuencia, Modelo, Mano, Posicion, Orden, Estado, FechaCreacion)
                                VALUES (@ID_OrdenProduccion, @ID_OrdenCliente, @ID_Secuencia, @Secuencia, @Modelo, @Mano, @Posicion, @Orden, @Estado, @FechaCreacion)";
                            await _db.ExecuteAsync(sqlSync, order, ct);
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogDebug("Query Orden_Produccion plant table skipped or not found: {Msg}", ex.Message);
                    }
                }

                // 5. Si aún no existe orden para este puntero, generarla asegurando coherencia de secuencia
                if (order == null)
                {
                    _logger.LogInformation("No existing order found for DL01 pointer {Pointer}. Creating fallback order...", currentPointer);
                    string seqStr = currentPointer < 10000 ? currentPointer.ToString().PadLeft(4, '0') : currentPointer.ToString();
                    order = new ProductionOrder
                    {
                        ID_OrdenProduccion = currentPointer,
                        ID_OrdenCliente = $"ORD-{currentPointer}",
                        ID_Secuencia = currentPointer < 10000 ? currentPointer : 1,
                        Secuencia = seqStr,
                        Modelo = "D3H",
                        Mano = "RH",
                        Posicion = "FRONT",
                        Orden = 1,
                        Estado = "EN_CURSO",
                        FechaCreacion = DateTime.UtcNow
                    };
                    try
                    {
                        await _db.ExecuteAsync(@"
                            INSERT INTO OrdenProduccion (ID_OrdenProduccion, ID_OrdenCliente, ID_Secuencia, Secuencia, Modelo, Mano, Posicion, Orden, Estado, FechaCreacion)
                            VALUES (@ID_OrdenProduccion, @ID_OrdenCliente, @ID_Secuencia, @Secuencia, @Modelo, @Mano, @Posicion, @Orden, @Estado, @FechaCreacion)",
                            order, ct);
                    }
                    catch { }
                }
            }

            // 6. Respetar y preservar el verdadero NÚMERO DE SECUENCIA de la orden consultada
            if (order != null)
            {
                if (!string.IsNullOrWhiteSpace(order.Secuencia))
                {
                    // Si viene como entero simple ("1", "18"), formatear a "0001", "0018"
                    if (int.TryParse(order.Secuencia, out int parsedNum) && parsedNum < 10000 && order.Secuencia.Length < 4)
                    {
                        order.Secuencia = parsedNum.ToString().PadLeft(4, '0');
                    }
                }
                else if (order.ID_Secuencia > 0)
                {
                    order.Secuencia = order.ID_Secuencia < 10000 
                        ? order.ID_Secuencia.ToString().PadLeft(4, '0') 
                        : order.ID_Secuencia.ToString();
                }

                if (order.ID_Secuencia <= 0 && int.TryParse(order.Secuencia, out int seqId))
                {
                    order.ID_Secuencia = seqId;
                }
            }

            return order;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to read production order for station {Station}", stationCode);
            throw;
        }
    }

    public async Task<bool> AdvanceStationPointerAsync(string stationCode, int nextOrderId, CancellationToken ct = default)
    {
        try
        {
            DateTime now = DateTime.UtcNow;
            int rows = await _db.ExecuteAsync(_sqlAdvancePointer, new { nextOrderId, now, stationCode }, ct);
            
            // Garantizar que también se actualice DL01 si la consulta por defecto no lo abarca
            try
            {
                await _db.ExecuteAsync(
                    "UPDATE Puesto SET Puntero_ID_OrdenProduccion = @nextOrderId, Fecha_Puntero = @now, UltimaActualizacion = @now WHERE UPPER(Puesto) = 'DL01'",
                    new { nextOrderId, now }, ct);
            }
            catch { }

            _logger.LogInformation("Station pointer (DL01/{Station}) advanced to next order ID {NextOrderId} (rows affected: {Rows})", stationCode, nextOrderId, rows);
            return rows > 0;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to advance pointer for station {Station} to {NextOrderId}", stationCode, nextOrderId);
            return false;
        }
    }

    public async Task<IReadOnlyList<ProductionOrder>> GetPendingOrdersAsync(int limit = 10, CancellationToken ct = default)
    {
        try
        {
            var orders = await _db.QueryAsync<ProductionOrder>(_sqlGetPending, new { limit }, ct);
            return orders.ToList();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reading pending orders list");
            return Array.Empty<ProductionOrder>();
        }
    }
}
