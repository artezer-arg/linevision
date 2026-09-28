using FluentAssertions;
using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using LineVision.Infrastructure.Services;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace LineVision.Tests.Unit;

public class WorkflowConfigTests
{
    private readonly Mock<IDatabaseService> _dbMock;
    private readonly WorkflowConfigService _service;

    public WorkflowConfigTests()
    {
        _dbMock = new Mock<IDatabaseService>();
        _dbMock.Setup(d => d.CurrentProvider).Returns("Sqlite");
        _service = new WorkflowConfigService(_dbMock.Object, NullLogger<WorkflowConfigService>.Instance);
    }

    [Fact]
    public async Task GetConfig_DefaultValues_ShouldReturn5StepMode()
    {
        _dbMock.Setup(d => d.QuerySingleOrDefaultAsync<string>(It.IsAny<string>(), null, It.IsAny<CancellationToken>()))
            .ReturnsAsync((string?)null);

        var config = await _service.GetConfigAsync();

        config.Should().NotBeNull();
        config.WorkflowMode.Should().Be("DIRECT_5_STEP");
        config.RecipeAddress.Should().Be("DB48.DBW2");
        config.ConfirmationAddress.Should().Be("DB48.DBX4.0");
        config.SendConfirmation.Should().BeTrue();
        config.ConfirmationValue.Should().BeTrue();
    }

    [Fact]
    public async Task SaveConfig_ShouldExecuteSqlAndCacheValues()
    {
        _dbMock.Setup(d => d.ExecuteAsync(It.IsAny<string>(), It.IsAny<object>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(1);

        var customConfig = new StationWorkflowConfig
        {
            WorkflowMode = "DIRECT_5_STEP",
            RecipeAddress = "DB48.DBW2",
            ConfirmationAddress = "DB48.DBX4.0",
            SendConfirmation = false, // disabled as requested by user option
            RetryIntervalMs = 800
        };

        var saved = await _service.SaveConfigAsync(customConfig);
        saved.Should().BeTrue();

        var loaded = await _service.GetConfigAsync();
        loaded.SendConfirmation.Should().BeFalse();
        loaded.RetryIntervalMs.Should().Be(800);
    }
}
