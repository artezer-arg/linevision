using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using Microsoft.Extensions.Logging;

namespace LineVision.Infrastructure.Simulators;

public class ProductionSimulator
{
    private readonly IDatabaseService _db;
    private readonly ILogger<ProductionSimulator> _logger;
    private int _sequenceCounter = 400;

    public ProductionSimulator(IDatabaseService db, ILogger<ProductionSimulator> logger)
    {
        _db = db;
        _logger = logger;
    }

    private async Task EnsureSequenceCounterInitializedAsync(CancellationToken ct = default)
    {
        try
        {
            const string sqlMax = "SELECT COALESCE(MAX(ID_Secuencia), 400) FROM OrdenProduccion";
            var maxSeq = await _db.QuerySingleOrDefaultAsync<int?>(sqlMax, null, ct) ?? 400;
            if (maxSeq > _sequenceCounter)
            {
                _sequenceCounter = maxSeq;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not initialize sequence counter from database");
        }
    }

    public async Task<ProductionOrder> EnqueueRandomOrderAsync(string stationCode = "DL02", CancellationToken ct = default)
    {
        await EnsureSequenceCounterInitializedAsync(ct);

        var variants = new[]
        {
            ("P1B", "LH", "REAR"),
            ("P1B", "RH", "REAR"),
            ("P1B", "LH", "FRONT"),
            ("P1B", "RH", "FRONT")
        };

        _sequenceCounter++;
        var (model, hand, pos) = variants[_sequenceCounter % variants.Length];
        int orderId = 2000 + _sequenceCounter;
        string sequenceStr = _sequenceCounter.ToString("D4");

        var order = new ProductionOrder
        {
            ID_OrdenProduccion = orderId,
            ID_OrdenCliente = $"CLI-SIM-{_sequenceCounter}",
            ID_Secuencia = _sequenceCounter,
            Secuencia = sequenceStr,
            Modelo = model,
            Mano = hand,
            Posicion = pos,
            Orden = 1,
            Estado = "PENDIENTE",
            FechaCreacion = DateTime.UtcNow
        };

        const string sqlOrder = @"
            INSERT INTO OrdenProduccion (ID_OrdenProduccion, ID_OrdenCliente, ID_Secuencia, Secuencia, Modelo, Mano, Posicion, Orden, Estado, FechaCreacion)
            VALUES (@ID_OrdenProduccion, @ID_OrdenCliente, @ID_Secuencia, @Secuencia, @Modelo, @Mano, @Posicion, @Orden, @Estado, @FechaCreacion)";

        await _db.ExecuteAsync(sqlOrder, new
        {
            order.ID_OrdenProduccion,
            order.ID_OrdenCliente,
            order.ID_Secuencia,
            order.Secuencia,
            order.Modelo,
            order.Mano,
            order.Posicion,
            order.Orden,
            order.Estado,
            FechaCreacion = order.FechaCreacion.ToString("o")
        }, ct);

        // Update station pointer to this new order
        const string sqlPointer = @"
            UPDATE Puesto SET 
                Puntero_ID_OrdenProduccion = @orderId,
                UltimaActualizacion = @now 
            WHERE Puesto = @stationCode";

        await _db.ExecuteAsync(sqlPointer, new { orderId, now = DateTime.UtcNow.ToString("o"), stationCode }, ct);

        _logger.LogInformation("SIMULATOR: Enqueued order ID {OrderId}, Sequence {Seq}, Variant {Model}/{Hand}/{Pos} for station {Station}",
            orderId, sequenceStr, model, hand, pos, stationCode);

        return order;
    }

    public async Task SetStationPointerAsync(string stationCode, int orderId, CancellationToken ct = default)
    {
        const string sql = "UPDATE Puesto SET Puntero_ID_OrdenProduccion = @orderId, UltimaActualizacion = @now WHERE Puesto = @stationCode";
        await _db.ExecuteAsync(sql, new { orderId, now = DateTime.UtcNow.ToString("o"), stationCode }, ct);
        _logger.LogInformation("SIMULATOR: Pointer for station {Station} explicitly set to {OrderId}", stationCode, orderId);
    }
}
