using FluentAssertions;
using LineVision.Core.Domain.Models;
using LineVision.Infrastructure.PLC;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace LineVision.Tests.Unit;

public class PLCHandshakeTests
{
    private readonly PLCConfiguration _config;
    private readonly PLCSimulator _plc;
    private readonly PLCHandshakeCoordinator _coordinator;

    public PLCHandshakeTests()
    {
        _config = new PLCConfiguration
        {
            PLC_ID = "TEST_PLC",
            StationCode = "DL02",
            Protocol = "SIMULATOR"
        };
        _plc = new PLCSimulator(_config, NullLogger<PLCSimulator>.Instance);
        _coordinator = new PLCHandshakeCoordinator(_plc, NullLogger<PLCHandshakeCoordinator>.Instance);
    }

    [Fact]
    public async Task Handshake_WhenSuccessful_ShouldMatchSentRecipes()
    {
        await _plc.ConnectAsync();
        var recipe = new RobotRecipe { Recipe_A = 12, Recipe_B = 4 };

        var result = await _coordinator.ExecuteHandshakeAsync(recipe, TimeSpan.FromSeconds(2));

        result.Success.Should().BeTrue();
        result.EchoRecipeA.Should().Be(12);
        result.EchoRecipeB.Should().Be(4);
        result.ErrorMessage.Should().BeNull();
    }

    [Fact]
    public async Task Handshake_WhenEchoMismatches_ShouldFailAndBlockStart()
    {
        await _plc.ConnectAsync();
        _plc.InjectFault("MISMATCH"); // Deliberately corrupts echo
        var recipe = new RobotRecipe { Recipe_A = 12, Recipe_B = 4 };

        var result = await _coordinator.ExecuteHandshakeAsync(recipe, TimeSpan.FromSeconds(2));

        result.Success.Should().BeFalse();
        result.ErrorMessage.Should().Contain("RECIPE MISMATCH");
    }

    [Fact]
    public async Task Handshake_WhenTimeoutOccurs_ShouldFailGracefully()
    {
        await _plc.ConnectAsync();
        _plc.InjectFault("TIMEOUT");
        var recipe = new RobotRecipe { Recipe_A = 12, Recipe_B = 4 };

        var result = await _coordinator.ExecuteHandshakeAsync(recipe, TimeSpan.FromMilliseconds(300));

        result.Success.Should().BeFalse();
        result.ErrorMessage.Should().Contain("failed to acknowledge");
    }

    [Fact]
    public async Task Handshake_WhenPlcNotReady_ShouldRejectStart()
    {
        await _plc.ConnectAsync();
        _plc.InjectFault("ERROR"); // Emergency stop active
        var recipe = new RobotRecipe { Recipe_A = 12, Recipe_B = 4 };

        var result = await _coordinator.ExecuteHandshakeAsync(recipe, TimeSpan.FromSeconds(1));

        result.Success.Should().BeFalse();
        result.ErrorMessage.Should().Contain("PLC is not ready");
    }
}
