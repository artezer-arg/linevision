using FluentAssertions;
using LineVision.Core.Domain.Enums;
using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using LineVision.Service.StateMachine;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace LineVision.Tests.Unit;

public class StateMachineTests
{
    private readonly Mock<ITraceabilityService> _traceabilityMock;
    private readonly StateMachineController _stateMachine;

    public StateMachineTests()
    {
        _traceabilityMock = new Mock<ITraceabilityService>();
        _stateMachine = new StateMachineController(NullLogger<StateMachineController>.Instance, _traceabilityMock.Object);
    }

    [Fact]
    public void InitialState_ShouldBeWaitingOrder()
    {
        _stateMachine.CurrentState.Should().Be(StationState.WAITING_ORDER);
    }

    [Fact]
    public async Task ValidSequence_ShouldProgressStepByStep()
    {
        var order = new ProductionOrder { Secuencia = "0382", Modelo = "P1B", Mano = "RH", Posicion = "FRONT" };

        // 1. Order detected
        var ok1 = await _stateMachine.TriggerAsync(StationTrigger.OrderDetected, order);
        ok1.Should().BeTrue();
        _stateMachine.CurrentState.Should().Be(StationState.ORDER_LOADED);

        // 2. Cradle check
        var ok2 = await _stateMachine.TriggerAsync(StationTrigger.CradleCheckStarted);
        ok2.Should().BeTrue();
        _stateMachine.CurrentState.Should().Be(StationState.CHECKING_CRADLE);

        var ok3 = await _stateMachine.TriggerAsync(StationTrigger.CradlePassed);
        ok3.Should().BeTrue();
        _stateMachine.CurrentState.Should().Be(StationState.CRADLE_OK);

        // 3. Cradle QR
        var ok4 = await _stateMachine.TriggerAsync(StationTrigger.CradleQRRead);
        ok4.Should().BeTrue();
        _stateMachine.CurrentState.Should().Be(StationState.CHECKING_CRADLE_QR);

        var ok5 = await _stateMachine.TriggerAsync(StationTrigger.CradleQRMatched);
        ok5.Should().BeTrue();
        _stateMachine.CurrentState.Should().Be(StationState.CRADLE_QR_OK);

        // 4. Panel check
        var ok6 = await _stateMachine.TriggerAsync(StationTrigger.PanelPlanLoaded);
        ok6.Should().BeTrue();
        _stateMachine.CurrentState.Should().Be(StationState.LOADING_PANEL_INSPECTION_PLAN);

        var ok7 = await _stateMachine.TriggerAsync(StationTrigger.PanelCheckStarted);
        ok7.Should().BeTrue();
        _stateMachine.CurrentState.Should().Be(StationState.CHECKING_PANEL);

        var ok8 = await _stateMachine.TriggerAsync(StationTrigger.PanelPassed);
        ok8.Should().BeTrue();
        _stateMachine.CurrentState.Should().Be(StationState.PANEL_OK);

        // 5. PLC Ready & Recipe
        var ok9 = await _stateMachine.TriggerAsync(StationTrigger.PLCPollReady);
        ok9.Should().BeTrue();
        _stateMachine.CurrentState.Should().Be(StationState.WAITING_PLC);

        var ok10 = await _stateMachine.TriggerAsync(StationTrigger.PLCPollReady);
        ok10.Should().BeTrue();
        _stateMachine.CurrentState.Should().Be(StationState.PLC_READY);

        var ok11 = await _stateMachine.TriggerAsync(StationTrigger.RecipeLoaded);
        ok11.Should().BeTrue();
        _stateMachine.CurrentState.Should().Be(StationState.LOADING_RECIPE);

        var ok12 = await _stateMachine.TriggerAsync(StationTrigger.RecipeSent);
        ok12.Should().BeTrue();
        _stateMachine.CurrentState.Should().Be(StationState.SENDING_RECIPE);

        var ok13 = await _stateMachine.TriggerAsync(StationTrigger.RecipeSent);
        ok13.Should().BeTrue();
        _stateMachine.CurrentState.Should().Be(StationState.WAITING_RECIPE_CONFIRMATION);

        var ok14 = await _stateMachine.TriggerAsync(StationTrigger.RecipeEchoVerified);
        ok14.Should().BeTrue();
        _stateMachine.CurrentState.Should().Be(StationState.RECIPE_CONFIRMED);

        // 6. Robot execution
        var ok15 = await _stateMachine.TriggerAsync(StationTrigger.RobotStarted);
        ok15.Should().BeTrue();
        _stateMachine.CurrentState.Should().Be(StationState.ROBOT_RUNNING);

        var ok16 = await _stateMachine.TriggerAsync(StationTrigger.RobotStarted);
        ok16.Should().BeTrue();
        _stateMachine.CurrentState.Should().Be(StationState.WAITING_ROBOT_FINISH);

        var ok17 = await _stateMachine.TriggerAsync(StationTrigger.RobotFinished);
        ok17.Should().BeTrue();
        _stateMachine.CurrentState.Should().Be(StationState.SAVING_STATION_RESULT);

        // 7. Result committed
        var ok18 = await _stateMachine.TriggerAsync(StationTrigger.ResultSaved);
        ok18.Should().BeTrue();
        _stateMachine.CurrentState.Should().Be(StationState.CYCLE_COMPLETE);

        // 8. Next cycle reset
        var ok19 = await _stateMachine.TriggerAsync(StationTrigger.CycleReset);
        ok19.Should().BeTrue();
        _stateMachine.CurrentState.Should().Be(StationState.WAITING_ORDER);
    }

    [Fact]
    public async Task StateSkipping_ShouldBeStrictlyRejected()
    {
        // Try jumping straight from WAITING_ORDER to ROBOT_RUNNING
        var rejected = await _stateMachine.TriggerAsync(StationTrigger.RobotStarted);
        rejected.Should().BeFalse();
        _stateMachine.CurrentState.Should().Be(StationState.WAITING_ORDER);

        // Try jumping to recipe sending without inspecting cradle or panel
        var rejectedRecipe = await _stateMachine.TriggerAsync(StationTrigger.RecipeSent);
        rejectedRecipe.Should().BeFalse();
        _stateMachine.CurrentState.Should().Be(StationState.WAITING_ORDER);
    }

    [Fact]
    public async Task Fault_ShouldImmediatelyTransitionToError()
    {
        await _stateMachine.TriggerAsync(StationTrigger.OrderDetected);
        await _stateMachine.TriggerAsync(StationTrigger.CradleCheckStarted);

        // Fault occurs during cradle check
        await _stateMachine.TriggerAsync(StationTrigger.FaultOccurred, "Camera disconnected");
        _stateMachine.CurrentState.Should().Be(StationState.ERROR);

        // Cannot proceed with normal workflow while in ERROR
        var cannotProceed = await _stateMachine.TriggerAsync(StationTrigger.CradlePassed);
        cannotProceed.Should().BeFalse();
        _stateMachine.CurrentState.Should().Be(StationState.ERROR);

        // Clear fault resets to safe state
        await _stateMachine.ResetFaultAsync("OPERATOR");
        _stateMachine.CurrentState.Should().Be(StationState.WAITING_ORDER);
    }

    [Fact]
    public async Task ManualBypass_ShouldRecordAuditLog()
    {
        await _stateMachine.ForceStateAsync(StationState.MAINTENANCE, "Routine calibration", "ENG01");
        _stateMachine.CurrentState.Should().Be(StationState.MAINTENANCE);

        _traceabilityMock.Verify(t => t.RecordBypassAsync(
            It.Is<BypassRecord>(b => b.User == "ENG01" && b.TargetState == StationState.MAINTENANCE && b.Reason == "Routine calibration"),
            It.IsAny<CancellationToken>()), Times.Once);
    }
}
