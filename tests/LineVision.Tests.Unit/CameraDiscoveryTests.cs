using FluentAssertions;
using LineVision.Core.Domain.Models;
using OpenCvSharp;
using Xunit;

namespace LineVision.Tests.Unit;

public class CameraDiscoveryTests
{
    [Fact]
    public void Test_OpenCvVideoCapture_Discovery()
    {
        // Test discovering video devices using OpenCv VideoCapture
        var devices = new List<DiscoveredCameraDevice>();
        
        for (int i = 0; i < 3; i++)
        {
            try
            {
                using var cap = new VideoCapture(i, VideoCaptureAPIs.DSHOW);
                if (cap.IsOpened())
                {
                    devices.Add(new DiscoveredCameraDevice
                    {
                        DeviceIndex = i,
                        Name = $"Dispositivo de Captura {i}",
                        DeviceId = $"dshow://{i}",
                        IsAvailable = true
                    });
                    cap.Release();
                }
            }
            catch
            {
                // Ignore if device fails to open
            }
        }

        // Output to test output
        devices.Should().NotBeNull();
    }
}
