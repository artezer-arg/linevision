using FluentAssertions;
using LineVision.Core.Domain.Enums;
using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using LineVision.Infrastructure.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace LineVision.Tests.Unit;

public class TraceabilityIdempotencyTests
{
    private readonly Mock<IDatabaseService> _dbMock;
    private readonly TraceabilityService _traceability;

    public TraceabilityIdempotencyTests()
    {
        _dbMock = new Mock<IDatabaseService>();
        var configMock = new Mock<IConfiguration>();
        _traceability = new TraceabilityService(_dbMock.Object, configMock.Object, NullLogger<TraceabilityService>.Instance);
    }

    [Fact]
    public async Task CommitStationResult_WhenNotYetCommitted_InsertsIntoProduccionSecuencia()
    {
        var cycleId = Guid.NewGuid();
        var cycle = new ProductionCycle
        {
            Cycle_ID = cycleId,
            ID_Secuencia = 382,
            ID_OrdenProduccion = 1001,
            ID_OrdenCliente = "CLI-01",
            Secuencia = "0382",
            Puesto = "DL02",
            FechaInicio = DateTime.UtcNow.AddSeconds(-10)
        };

        // Mock cycle query
        _dbMock.Setup(d => d.QuerySingleOrDefaultAsync<ProductionCycle>(
            It.Is<string>(s => s.Contains("FROM ProductionCycle")),
            It.IsAny<object>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(cycle);

        // Sequence count is 0 (not processed yet)
        _dbMock.Setup(d => d.QuerySingleOrDefaultAsync<int>(
            It.Is<string>(s => s.Contains("FROM Produccion_Secuencia")),
            It.IsAny<object>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(0);

        var success = await _traceability.CommitStationResultAsync(cycleId, StationResultOutcome.OK);

        success.Should().BeTrue();

        // Verify insertion into Produccion_Secuencia was called
        _dbMock.Verify(d => d.ExecuteAsync(
            It.Is<string>(s => s.Contains("INSERT INTO Produccion_Secuencia")),
            It.IsAny<object>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task CommitStationResult_WhenAlreadyCommitted_SkipsDuplicateInsert()
    {
        var cycleId = Guid.NewGuid();
        var cycle = new ProductionCycle
        {
            Cycle_ID = cycleId,
            ID_Secuencia = 382,
            ID_OrdenProduccion = 1001,
            ID_OrdenCliente = "CLI-01",
            Secuencia = "0382",
            Puesto = "DL02",
            FechaInicio = DateTime.UtcNow.AddSeconds(-10)
        };

        _dbMock.Setup(d => d.QuerySingleOrDefaultAsync<ProductionCycle>(
            It.Is<string>(s => s.Contains("FROM ProductionCycle")),
            It.IsAny<object>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(cycle);

        // Sequence count is 1 (already recorded in database)
        _dbMock.Setup(d => d.QuerySingleOrDefaultAsync<int>(
            It.Is<string>(s => s.Contains("FROM Produccion_Secuencia")),
            It.IsAny<object>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);

        var success = await _traceability.CommitStationResultAsync(cycleId, StationResultOutcome.OK);

        success.Should().BeTrue();

        // Verify that insertion into Produccion_Secuencia was SKIPPED to prevent duplicates
        _dbMock.Verify(d => d.ExecuteAsync(
            It.Is<string>(s => s.Contains("INSERT INTO Produccion_Secuencia")),
            It.IsAny<object>(), It.IsAny<CancellationToken>()), Times.Never);
    }
}
