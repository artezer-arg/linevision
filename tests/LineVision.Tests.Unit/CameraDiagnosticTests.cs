using System;
using System.IO;
using OpenCvSharp;
using Xunit;
using Xunit.Abstractions;

namespace LineVision.Tests.Unit;

public class CameraDiagnosticTests
{
    private readonly ITestOutputHelper _output;

    public CameraDiagnosticTests(ITestOutputHelper output)
    {
        _output = output;
    }

    [Fact]
    public void TestAllDirectShowIndices()
    {
        string outDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "CameraSnapshots");
        Directory.CreateDirectory(outDir);

        for (int i = 0; i < 5; i++)
        {
            try
            {
                using var cap = new VideoCapture(i, VideoCaptureAPIs.DSHOW);
                if (cap.IsOpened())
                {
                    using var mat = new Mat();
                    // Grab a few frames to allow auto-exposure / sensor warmup
                    for (int f = 0; f < 5; f++)
                    {
                        cap.Read(mat);
                    }

                    if (!mat.Empty())
                    {
                        var mean = Cv2.Mean(mat);
                        string filePath = Path.Combine(outDir, $"cam_index_{i}.jpg");
                        mat.SaveImage(filePath);
                        _output.WriteLine($"Device {i}: OPENED, Size={mat.Width}x{mat.Height}, MeanIntensity=({mean.Val0:F1}, {mean.Val1:F1}, {mean.Val2:F1}), Saved={filePath}");
                    }
                    else
                    {
                        _output.WriteLine($"Device {i}: OPENED but frame is empty");
                    }
                    cap.Release();
                }
                else
                {
                    _output.WriteLine($"Device {i}: NOT opened");
                }
            }
            catch (Exception ex)
            {
                _output.WriteLine($"Device {i}: Error - {ex.Message}");
            }
        }
    }
}
