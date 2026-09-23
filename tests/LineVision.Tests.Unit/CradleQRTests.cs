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
    public async Task ResolveCradleCode_WhenPatternInDB_ShouldReturnCradleCode()
    {
        _dbMock.Setup(d => d.QuerySingleOrDefaultAsync<string>(
            It.Is<string>(s => s.Contains("SELECT Cradle_Code FROM CradleQR")),
            It.IsAny<object>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("CUNA-02");

        var code = await _qrService.ResolveCradleCodeAsync("QR_SPECIAL_TAG");
        code.Should().Be("CUNA-02");
    }

    [Fact]
    public async Task ValidateCradleCompatibility_WhenMatchesDB_ShouldReturnTrue()
    {
        var context = new ProductContext
        {
            Modelo = "P1B",
            Mano = "RH",
            Posicion = "FRONT"
        };

        _dbMock.Setup(d => d.QuerySingleOrDefaultAsync<int>(
            It.Is<string>(s => s.Contains("FROM CradleQR")),
            It.IsAny<object>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);

        bool isValid = await _qrService.ValidateCradleCompatibilityAsync("CUNA-01", context);
        isValid.Should().BeTrue();
    }

    [Fact]
    public async Task ValidateCradleCompatibility_WhenNoMappingOrRecipe_ShouldReturnFalse()
    {
        var context = new ProductContext
        {
            Modelo = "P1B",
            Mano = "RH",
            Posicion = "FRONT"
        };

        _dbMock.Setup(d => d.QuerySingleOrDefaultAsync<int>(
            It.IsAny<string>(), It.IsAny<object>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(0);

        bool isValid = await _qrService.ValidateCradleCompatibilityAsync("CUNA-99", context);
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
