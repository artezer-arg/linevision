using FluentAssertions;
using LineVision.Core.Domain.Enums;
using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using LineVision.Vision.Engine;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace LineVision.Tests.Unit;

public class InspectionEngineTests
{
    private readonly Mock<IVisionAlgorithm> _algoMock;
    private readonly InspectionEngine _engine;

    public InspectionEngineTests()
    {
        _algoMock = new Mock<IVisionAlgorithm>();
        _algoMock.SetupGet(a => a.AlgorithmType).Returns("PRESENCE");

        _engine = new InspectionEngine(new[] { _algoMock.Object }, NullLogger<InspectionEngine>.Instance);
    }

    [Fact]
    public async Task ExecutePlan_WhenAllRequiredPointsPass_OverallSuccessIsTrue()
    {
        var plan = new InspectionPlan
        {
            Code = "PLAN_TEST",
            ActiveVersion = 1,
            Versions = new List<InspectionPlanVersion>
            {
                new()
                {
                    VersionNumber = 1,
                    Details = new List<InspectionPlanDetail>
                    {
                        new()
                        {
                            ExecutionOrder = 1,
                            IsRequiredOverride = true,
                            Point = new InspectionPoint
                            {
                                InspectionPoint_ID = "IP01",
                                Code = "IP01",
                                Name = "Point 1",
                                CameraId = "CAM01",
                                AlgorithmType = "PRESENCE",
                                Enabled = true
                            }
                        }
                    }
                }
            }
        };

        var frames = new Dictionary<string, CameraFrame>
        {
            ["CAM01"] = new() { CameraId = "CAM01", Data = new byte[] { 1, 2, 3 } }
        };

        _algoMock.Setup(a => a.EvaluateAsync(It.IsAny<CameraFrame>(), It.IsAny<InspectionPoint>(), It.IsAny<IReadOnlyList<InspectionROI>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PointInspectionResult
            {
                Result = InspectionResultStatus.OK,
                Confidence = 0.95,
                DetectedValue = "PRESENT"
            });

        var report = await _engine.ExecutePlanAsync(plan, new ProductContext(), frames);

        report.OverallSuccess.Should().BeTrue();
        report.PassedPoints.Should().Be(1);
        report.FailedPoints.Should().Be(0);
        report.FailedRequiredPoints.Should().BeEmpty();
    }

    [Fact]
    public async Task ExecutePlan_WhenRequiredPointFails_OverallSuccessIsFalse()
    {
        var plan = new InspectionPlan
        {
            Code = "PLAN_TEST",
            ActiveVersion = 1,
            Versions = new List<InspectionPlanVersion>
            {
                new()
                {
                    VersionNumber = 1,
                    Details = new List<InspectionPlanDetail>
                    {
                        new()
                        {
                            ExecutionOrder = 1,
                            IsRequiredOverride = true,
                            Point = new InspectionPoint
                            {
                                InspectionPoint_ID = "IP_REQ",
                                Code = "IP_REQ",
                                Name = "Required Point",
                                CameraId = "CAM01",
                                AlgorithmType = "PRESENCE",
                                Enabled = true
                            }
                        }
                    }
                }
            }
        };

        var frames = new Dictionary<string, CameraFrame>
        {
            ["CAM01"] = new() { CameraId = "CAM01", Data = new byte[] { 1, 2, 3 } }
        };

        _algoMock.Setup(a => a.EvaluateAsync(It.IsAny<CameraFrame>(), It.IsAny<InspectionPoint>(), It.IsAny<IReadOnlyList<InspectionROI>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PointInspectionResult
            {
                Result = InspectionResultStatus.NOK,
                Confidence = 0.40,
                DetectedValue = "ABSENT"
            });

        var report = await _engine.ExecutePlanAsync(plan, new ProductContext(), frames);

        report.OverallSuccess.Should().BeFalse();
        report.FailedPoints.Should().Be(1);
        report.FailedRequiredPoints.Should().Contain("IP_REQ");
    }

    [Fact]
    public async Task ExecutePlan_WhenOptionalPointFails_OverallSuccessRemainsTrue()
    {
        var plan = new InspectionPlan
        {
            Code = "PLAN_TEST",
            ActiveVersion = 1,
            Versions = new List<InspectionPlanVersion>
            {
                new()
                {
                    VersionNumber = 1,
                    Details = new List<InspectionPlanDetail>
                    {
                        new()
                        {
                            ExecutionOrder = 1,
                            IsRequiredOverride = false, // Optional point!
                            Point = new InspectionPoint
                            {
                                InspectionPoint_ID = "IP_OPT",
                                Code = "IP_OPT",
                                Name = "Optional Point",
                                CameraId = "CAM01",
                                AlgorithmType = "PRESENCE",
                                Enabled = true
                            }
                        }
                    }
                }
            }
        };

        var frames = new Dictionary<string, CameraFrame>
        {
            ["CAM01"] = new() { CameraId = "CAM01", Data = new byte[] { 1, 2, 3 } }
        };

        _algoMock.Setup(a => a.EvaluateAsync(It.IsAny<CameraFrame>(), It.IsAny<InspectionPoint>(), It.IsAny<IReadOnlyList<InspectionROI>>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new PointInspectionResult
            {
                Result = InspectionResultStatus.WARNING,
                Confidence = 0.70,
                DetectedValue = "DEGRADED"
            });

        var report = await _engine.ExecutePlanAsync(plan, new ProductContext(), frames);

        report.OverallSuccess.Should().BeTrue(); // Passes because point is optional
        report.WarningPoints.Should().Be(1);
        report.FailedRequiredPoints.Should().BeEmpty();
    }
}
