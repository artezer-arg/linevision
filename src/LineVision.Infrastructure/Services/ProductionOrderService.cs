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
            ?? "SELECT Puntero_ID_OrdenProduccion FROM Puesto WHERE Puesto = @stationCode AND Activo = 1";

        _sqlGetOrder = config["Queries:GetProductionOrder"] 
            ?? "SELECT ID_OrdenProduccion, ID_OrdenCliente, ID_Secuencia, Secuencia, Modelo, Mano, Posicion, Orden, Estado, FechaCreacion FROM OrdenProduccion WHERE ID_OrdenProduccion = @orderId";

        _sqlAdvancePointer = config["Queries:AdvanceStationPointer"]
            ?? "UPDATE Puesto SET Puntero_ID_OrdenProduccion = @nextOrderId, UltimaActualizacion = @now WHERE Puesto = @stationCode";

        _sqlGetPending = config["Queries:GetPendingOrders"]
            ?? "SELECT ID_OrdenProduccion, ID_OrdenCliente, ID_Secuencia, Secuencia, Modelo, Mano, Posicion, Orden, Estado, FechaCreacion FROM OrdenProduccion ORDER BY Orden ASC LIMIT @limit";
    }

    public async Task<ProductionOrder?> GetCurrentOrderForStationAsync(string stationCode, CancellationToken ct = default)
    {
        try
        {
            var pointerId = await _db.QuerySingleOrDefaultAsync<int?>(_sqlGetPointer, new { stationCode }, ct);
            int currentPointer = pointerId.GetValueOrDefault(2401);
            if (currentPointer <= 0) currentPointer = 2401;

            var order = await _db.QuerySingleOrDefaultAsync<ProductionOrder>(_sqlGetOrder, new { orderId = currentPointer }, ct);
            if (order == null)
            {
                // Buscar siguiente orden existente >= pointer
                const string sqlFindNext = @"
                    SELECT ID_OrdenProduccion, ID_OrdenCliente, ID_Secuencia, Secuencia, Modelo, Mano, Posicion, Orden, Estado, FechaCreacion 
                    FROM OrdenProduccion 
                    WHERE ID_OrdenProduccion >= @orderId 
                    ORDER BY ID_OrdenProduccion ASC 
                    LIMIT 1";
                order = await _db.QuerySingleOrDefaultAsync<ProductionOrder>(sqlFindNext, new { orderId = currentPointer }, ct);

                if (order != null)
                {
                    await AdvanceStationPointerAsync(stationCode, order.ID_OrdenProduccion, ct);
                    _logger.LogInformation("Corrected pointer for station {Station} to existing order {OrderId} (Seq {Seq})",
                        stationCode, order.ID_OrdenProduccion, order.Secuencia);
                }
                else
                {
                    // No hay más órdenes en cola: generar automáticamente el siguiente panel
                    _logger.LogInformation("No more pending orders in queue for station {Station}. Automatically generating next sequential panel...", stationCode);
                    order = await _simulator.EnqueueRandomOrderAsync(stationCode, ct);
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
            string now = DateTime.UtcNow.ToString("o");
            int rows = await _db.ExecuteAsync(_sqlAdvancePointer, new { nextOrderId, now, stationCode }, ct);
            _logger.LogInformation("Station {Station} pointer advanced to next order ID {NextOrderId} (rows affected: {Rows})", stationCode, nextOrderId, rows);
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
