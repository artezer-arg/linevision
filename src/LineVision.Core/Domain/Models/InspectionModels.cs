using LineVision.Core.Domain.Enums;

namespace LineVision.Core.Domain.Models;

public class InspectionROI
{
    public int ROI_ID { get; set; }
    public string InspectionPoint_ID { get; set; } = string.Empty;
    public string Name { get; set; } = "ROI_1";
    public int X { get; set; }
    public int Y { get; set; }
    public int Width { get; set; }
    public int Height { get; set; }
    public string ShapeType { get; set; } = "RECTANGLE";
    public string? ReferenceImagePath { get; set; }
    public string? ParametersJson { get; set; }
}

public class InspectionPoint
{
    public string InspectionPoint_ID { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string PieceType { get; set; } = "PANEL"; // "CRADLE" or "PANEL"
    public string CameraId { get; set; } = string.Empty;
    public string AlgorithmType { get; set; } = "PRESENCE"; // "PRESENCE", "TEMPLATE_MATCH", "QR", "COLOR", "YOLO_ONNX"
    public string ExpectedValue { get; set; } = "PRESENT";
    public double Tolerance { get; set; } = 0.0;
    public double MinConfidence { get; set; } = 0.85;
    public bool IsRequired { get; set; } = true;
    public int ExecutionOrder { get; set; } = 1;
    public int TimeoutMs { get; set; } = 1500;
    public bool Enabled { get; set; } = true;
    public List<InspectionROI> ROIs { get; set; } = new();
}

public class InspectionPlanDetail
{
    public int Detail_ID { get; set; }
    public int Version_ID { get; set; }
    public string InspectionPoint_ID { get; set; } = string.Empty;
    public int ExecutionOrder { get; set; }
    public bool? IsRequiredOverride { get; set; }
    public InspectionPoint? Point { get; set; }
}

public class InspectionPlanVersion
{
    public int Version_ID { get; set; }
    public int Plan_ID { get; set; }
    public int VersionNumber { get; set; } = 1;
    public bool IsLocked { get; set; }
    public DateTime CreatedDate { get; set; } = DateTime.UtcNow;
    public string CreatedBy { get; set; } = "SYSTEM";
    public string? ChangeNotes { get; set; }
    public List<InspectionPlanDetail> Details { get; set; } = new();
}

public class InspectionPlan
{
    public int Plan_ID { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string PieceType { get; set; } = "PANEL"; // "CRADLE" or "PANEL"
    public string Modelo { get; set; } = string.Empty;
    public string Mano { get; set; } = string.Empty;
    public string Posicion { get; set; } = string.Empty;
    public int ActiveVersion { get; set; } = 1;
    public bool Enabled { get; set; } = true;
    public List<InspectionPlanVersion> Versions { get; set; } = new();
}

public class ProductContext
{
    public string Modelo { get; set; } = string.Empty;
    public string Mano { get; set; } = string.Empty;
    public string Posicion { get; set; } = string.Empty;
    public string Secuencia { get; set; } = string.Empty;
    public int ID_Secuencia { get; set; }
    public int ID_OrdenProduccion { get; set; }
}

public class PointInspectionResult
{
    public long InspectionResult_ID { get; set; }
    public Guid Cycle_ID { get; set; }
    public string InspectionPoint_ID { get; set; } = string.Empty;
    public string PointCode { get; set; } = string.Empty;
    public string PointName { get; set; } = string.Empty;
    public int? InspectionPlan_ID { get; set; }
    public int? InspectionPlanVersion { get; set; }
    public string ExpectedValue { get; set; } = string.Empty;
    public string DetectedValue { get; set; } = string.Empty;
    public double Confidence { get; set; }
    public InspectionResultStatus Result { get; set; } = InspectionResultStatus.NOK;
    public bool IsRequired { get; set; } = true;
    public string? ImagePath { get; set; }
    public string? ROIImagePath { get; set; }
    public int ProcessingTimeMs { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public string? FailureReason { get; set; }
}

public class InspectionReport
{
    public string PlanCode { get; set; } = string.Empty;
    public int PlanVersion { get; set; }
    public bool OverallSuccess { get; set; }
    public int TotalPoints { get; set; }
    public int PassedPoints { get; set; }
    public int FailedPoints { get; set; }
    public int WarningPoints { get; set; }
    public int ExecutionDurationMs { get; set; }
    public List<PointInspectionResult> Details { get; set; } = new();
    public List<string> FailedRequiredPoints { get; set; } = new();
}
