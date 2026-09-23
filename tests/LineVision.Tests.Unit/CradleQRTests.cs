using FluentAssertions;
using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using LineVision.Infrastructure.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace LineVision.Tests.Unit;

public class CradleQRTests
{
    private readonly Mock<IDatabaseService> _dbMock;
    private readonly CradleQRService _qrService;

    public CradleQRTests()
    {
        _dbMock = new Mock<IDatabaseService>();
        _qrService = new CradleQRService(_dbMock.Object, NullLogger<CradleQRService>.Instance);
    }

    [Fact]
    public async Task ValidateQR_WhenMatchesExpectedContext_ShouldReturnTrue()
    {
        var context = new ProductContext
        {
            Modelo = "P1B",
            Mano = "RH",
            Posicion = "FRONT"
        };

        _dbMock.Setup(d => d.QuerySingleOrDefaultAsync<CradleQRMapping>(
            It.IsAny<string>(), It.IsAny<object>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CradleQRMapping
            {
                QR_Pattern = "CUNA-P1B-RH-FRONT-01",
                Modelo = "P1B",
                Mano = "RH",
                Posicion = "FRONT",
                Activo = true
            });

        bool isValid = await _qrService.ValidateQRAsync("CUNA-P1B-RH-FRONT-01", context);
        isValid.Should().BeTrue();
    }

    [Fact]
    public async Task ValidateQR_WhenHandMismatches_ShouldReturnFalse()
    {
        var context = new ProductContext
        {
            Modelo = "P1B",
            Mano = "RH",
            Posicion = "FRONT"
        };

        // QR from an LH cradle mistakenly inserted
        _dbMock.Setup(d => d.QuerySingleOrDefaultAsync<CradleQRMapping>(
            It.IsAny<string>(), It.IsAny<object>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new CradleQRMapping
            {
                QR_Pattern = "CUNA-P1B-LH-FRONT-01",
                Modelo = "P1B",
                Mano = "LH", // Mismatch
                Posicion = "FRONT",
                Activo = true
            });

        bool isValid = await _qrService.ValidateQRAsync("CUNA-P1B-LH-FRONT-01", context);
        isValid.Should().BeFalse();
    }

    [Fact]
    public async Task ValidateQR_WhenEmptyOrWhitespace_ShouldReturnFalse()
    {
        var context = new ProductContext { Modelo = "P1B", Mano = "RH", Posicion = "FRONT" };
        bool isValid = await _qrService.ValidateQRAsync("", context);
        isValid.Should().BeFalse();
    }
}
