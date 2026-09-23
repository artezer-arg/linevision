using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using Microsoft.AspNetCore.Mvc;

namespace LineVision.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CalibrationController : ControllerBase
{
    private readonly IInspectionPlanService _planService;
    private readonly IRecipeService _recipeService;
    private readonly IDatabaseService _db;
    private readonly ICameraManager _cameraManager;
    private readonly IEnumerable<IVisionAlgorithm> _algorithms;
    private readonly ILogger<CalibrationController> _logger;

    public CalibrationController(
        IInspectionPlanService planService,
        IRecipeService recipeService,
        IDatabaseService db,
        ICameraManager cameraManager,
        IEnumerable<IVisionAlgorithm> algorithms,
        ILogger<CalibrationController> logger)
    {
        _planService = planService;
        _recipeService = recipeService;
        _db = db;
        _cameraManager = cameraManager;
        _algorithms = algorithms;
        _logger = logger;
    }

    [HttpGet("plans")]
    public async Task<IActionResult> GetPlans()
    {
        var plans = await _planService.GetAllPlansAsync();
        return Ok(plans);
    }

    [HttpGet("plan/{pieceType}/{model}/{hand}/{pos}")]
    public async Task<IActionResult> GetPlan(string pieceType, string model, string hand, string pos)
    {
        var plan = await _planService.GetActivePlanForVariantAsync(pieceType, model, hand, pos);
        if (plan == null) return NotFound(new { Message = "Plan not found" });
        return Ok(plan);
    }

    [HttpGet("points")]
    public async Task<IActionResult> GetAllPoints()
    {
        const string sqlPts = @"
            SELECT p.*, r.ROI_ID as r_ROI_ID, r.Name as r_Name, r.X as r_X, r.Y as r_Y, 
                   r.Width as r_Width, r.Height as r_Height, r.ShapeType as r_ShapeType
            FROM InspectionPoint p
            LEFT JOIN InspectionROI r ON p.InspectionPoint_ID = r.InspectionPoint_ID
            ORDER BY p.PieceType, p.ExecutionOrder";

        var pointsDict = new Dictionary<string, InspectionPoint>();
        var rows = await _db.QueryAsync<dynamic>(sqlPts);

        foreach (var r in rows)
        {
            string pId = (string)r.InspectionPoint_ID;
            if (!pointsDict.TryGetValue(pId, out var pt))
            {
                pt = new InspectionPoint
                {
                    InspectionPoint_ID = pId,
                    Code = r.Code ?? string.Empty,
                    Name = r.Name ?? string.Empty,
                    Description = r.Description,
                    PieceType = r.PieceType ?? "PANEL",
                    CameraId = r.CameraId ?? "CAM_PANEL_01",
                    AlgorithmType = r.AlgorithmType ?? "PRESENCE",
                    ExpectedValue = r.ExpectedValue ?? "PRESENT",
                    Tolerance = r.Tolerance != null ? Convert.ToDouble(r.Tolerance) : 0,
                    MinConfidence = r.MinConfidence != null ? Convert.ToDouble(r.MinConfidence) : 0.85,
                    IsRequired = r.IsRequired == 1,
                    ExecutionOrder = r.ExecutionOrder != null ? Convert.ToInt32(r.ExecutionOrder) : 1,
                    Enabled = r.Enabled == 1,
                    ROIs = new List<InspectionROI>()
                };
                pointsDict[pId] = pt;
            }

            if (r.r_ROI_ID != null)
            {
                pt.ROIs.Add(new InspectionROI
                {
                    ROI_ID = Convert.ToInt32(r.r_ROI_ID),
                    InspectionPoint_ID = pId,
                    Name = r.r_Name ?? "ROI",
                    X = Convert.ToInt32(r.r_X),
                    Y = Convert.ToInt32(r.r_Y),
                    Width = Convert.ToInt32(r.r_Width),
                    Height = Convert.ToInt32(r.r_Height),
                    ShapeType = r.r_ShapeType ?? "RECTANGLE"
                });
            }
        }

        return Ok(pointsDict.Values);
    }

    [HttpPost("point")]
    public async Task<IActionResult> SavePoint([FromBody] InspectionPoint point)
    {
        const string sql = @"
            UPDATE InspectionPoint SET
                Name = @Name,
                Description = @Description,
                CameraId = @CameraId,
                AlgorithmType = @AlgorithmType,
                ExpectedValue = @ExpectedValue,
                Tolerance = @Tolerance,
                MinConfidence = @MinConfidence,
                IsRequired = @IsRequired
            WHERE InspectionPoint_ID = @InspectionPoint_ID";

        int rows = await _db.ExecuteAsync(sql, new
        {
            point.Name,
            point.Description,
            point.CameraId,
            point.AlgorithmType,
            point.ExpectedValue,
            point.Tolerance,
            point.MinConfidence,
            IsRequired = point.IsRequired ? 1 : 0,
            point.InspectionPoint_ID
        });

        if (point.ROIs != null && point.ROIs.Any())
        {
            foreach (var roi in point.ROIs)
            {
                roi.InspectionPoint_ID = point.InspectionPoint_ID;
                await _planService.SaveROIAsync(roi);
            }
        }

        return Ok(new { Success = true, Point = point });
    }

    [HttpPost("point/create")]
    public async Task<IActionResult> CreatePoint([FromBody] CreatePointDto point)
    {
        if (string.IsNullOrWhiteSpace(point.InspectionPoint_ID))
        {
            point.InspectionPoint_ID = "IP_" + Guid.NewGuid().ToString("N")[..8].ToUpperInvariant();
        }
        if (string.IsNullOrWhiteSpace(point.Code))
        {
            point.Code = "PT_" + Guid.NewGuid().ToString("N")[..4].ToUpperInvariant();
        }

        const string sqlInsertPoint = @"
            INSERT INTO InspectionPoint (
                InspectionPoint_ID, Code, Name, Description, PieceType, CameraId,
                AlgorithmType, ExpectedValue, Tolerance, MinConfidence, IsRequired,
                ExecutionOrder, TimeoutMs, Enabled
            ) VALUES (
                @InspectionPoint_ID, @Code, @Name, @Description, @PieceType, @CameraId,
                @AlgorithmType, @ExpectedValue, @Tolerance, @MinConfidence, @IsRequired,
                @ExecutionOrder, @TimeoutMs, @Enabled
            )";

        await _db.ExecuteAsync(sqlInsertPoint, new
        {
            point.InspectionPoint_ID,
            point.Code,
            point.Name,
            point.Description,
            point.PieceType,
            point.CameraId,
            point.AlgorithmType,
            point.ExpectedValue,
            point.Tolerance,
            point.MinConfidence,
            IsRequired = point.IsRequired ? 1 : 0,
            point.ExecutionOrder,
            point.TimeoutMs,
            Enabled = point.Enabled ? 1 : 0
        });

        if (point.ROIs != null && point.ROIs.Any())
        {
            foreach (var roi in point.ROIs)
            {
                roi.InspectionPoint_ID = point.InspectionPoint_ID;
                await _planService.SaveROIAsync(roi);
            }
        }
        else
        {
            await _planService.SaveROIAsync(new InspectionROI
            {
                InspectionPoint_ID = point.InspectionPoint_ID,
                Name = "ROI_1",
                X = 150,
                Y = 150,
                Width = 140,
                Height = 120,
                ShapeType = "RECTANGLE"
            });
        }

        // Si se especificó variante, vincular directamente al plan activo
        if (!string.IsNullOrWhiteSpace(point.Modelo) && !string.IsNullOrWhiteSpace(point.Mano) && !string.IsNullOrWhiteSpace(point.Posicion))
        {
            var plan = await _planService.EnsurePlanForVariantAsync(point.PieceType, point.Modelo, point.Mano, point.Posicion);
            if (plan != null && plan.Versions.Any())
            {
                await _planService.AddPointToPlanVersionAsync(plan.Versions[0].Version_ID, point.InspectionPoint_ID, point.ExecutionOrder, point.IsRequired);
            }
        }

        return Ok(new { Success = true, Point = point });
    }

    [HttpPost("plan/clone")]
    public async Task<IActionResult> ClonePlan([FromBody] ClonePlanRequest req)
    {
        try
        {
            int count = await _planService.ClonePlanVariantAsync(
                req.PieceType,
                req.SrcModel, req.SrcHand, req.SrcPos,
                req.DstModel, req.DstHand, req.DstPos,
                req.MirrorX, req.ImageWidth);

            return Ok(new { Success = count > 0, ClonedCount = count });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error cloning plan");
            return StatusCode(500, new { Success = false, Message = ex.Message });
        }
    }

    [HttpGet("matrix")]
    public async Task<IActionResult> GetCalibrationMatrix()
    {
        try
        {
            var hands = new[] { "LH", "RH" };
            var positions = new[] { "FRONT", "REAR" };

            // Obtener modelos únicos registrados
            var modelRows = await _db.QueryAsync<string>("SELECT DISTINCT Modelo FROM InspectionPlan WHERE Modelo IS NOT NULL AND Modelo <> ''");
            var models = modelRows.Distinct().ToList();
            if (!models.Contains("P1B")) models.Insert(0, "P1B");

            var matrix = new List<object>();

            foreach (var m in models)
            {
                foreach (var h in hands)
                {
                    foreach (var p in positions)
                    {
                        var qrMapping = await _db.QuerySingleOrDefaultAsync<CradleQRMapping>(
                            "SELECT * FROM CradleQR WHERE Modelo = @m AND Mano = @h AND Posicion = @p AND Activo = 1 LIMIT 1",
                            new { m, h, p });

                        var recipe = await _recipeService.GetRecipeAsync("DL02", m, h, p);

                        var cradlePlan = await _planService.GetActivePlanForVariantAsync("CRADLE", m, h, p);
                        var panelPlan = await _planService.GetActivePlanForVariantAsync("PANEL", m, h, p);

                        int cradlePts = cradlePlan?.Versions.FirstOrDefault()?.Details.Count ?? 0;
                        int panelPts = panelPlan?.Versions.FirstOrDefault()?.Details.Count ?? 0;

                        bool hasQr = qrMapping != null && !string.IsNullOrWhiteSpace(qrMapping.QR_Pattern);
                        bool hasRecipe = recipe != null && recipe.Recipe_A > 0;
                        bool hasVision = cradlePts > 0 && panelPts > 0;

                        matrix.Add(new
                        {
                            Modelo = m,
                            Mano = h,
                            Posicion = p,
                            VariantKey = $"{m}_{h}_{p}".ToUpperInvariant(),
                            CradleQR = qrMapping?.QR_Pattern,
                            RecipeA = recipe?.Recipe_A,
                            RecipeB = recipe?.Recipe_B,
                            CradlePointsCount = cradlePts,
                            PanelPointsCount = panelPts,
                            TotalPointsCount = cradlePts + panelPts,
                            IsComplete = hasQr && hasRecipe && hasVision,
                            Status = (hasQr && hasRecipe && hasVision) ? "COMPLETO" : "PARCIAL"
                        });
                    }
                }
            }

            return Ok(matrix);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting calibration matrix");
            return StatusCode(500, new { Success = false, Message = ex.Message });
        }
    }

    [HttpDelete("point/{id}")]
    public async Task<IActionResult> DeletePoint(string id)
    {
        try
        {
            await _db.ExecuteAsync("DELETE FROM InspectionROI WHERE InspectionPoint_ID = @id", new { id });
            await _db.ExecuteAsync("DELETE FROM InspectionPlanDetail WHERE InspectionPoint_ID = @id", new { id });
            await _db.ExecuteAsync("DELETE FROM InspectionResult WHERE InspectionPoint_ID = @id", new { id });
            int rows = await _db.ExecuteAsync("DELETE FROM InspectionPoint WHERE InspectionPoint_ID = @id", new { id });
            return Ok(new { Success = rows > 0, Message = $"Punto {id} eliminado correctamente", Id = id });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error eliminando punto de inspección {Id}", id);
            return StatusCode(500, new { Success = false, Message = ex.Message });
        }
    }

    [HttpGet("recipes")]
    public async Task<IActionResult> GetRecipes()
    {
        var recipes = await _recipeService.GetAllRecipesAsync("DL02");
        return Ok(recipes);
    }

    [HttpPost("recipe")]
    public async Task<IActionResult> SaveRecipe([FromBody] RobotRecipe recipe)
    {
        bool success = await _recipeService.SaveRecipeAsync(recipe);
        return Ok(new { Success = success, Recipe = recipe });
    }

    [HttpGet("qr-mappings")]
    public async Task<IActionResult> GetQRMappings()
    {
        const string sql = "SELECT * FROM CradleQR ORDER BY Modelo, Mano, Posicion";
        var mappings = await _db.QueryAsync<CradleQRMapping>(sql);
        return Ok(mappings);
    }

    [HttpPost("qr-mapping")]
    public async Task<IActionResult> SaveQRMapping([FromBody] CradleQRMapping mapping)
    {
        const string sql = @"
            INSERT OR REPLACE INTO CradleQR (QR_ID, QR_Pattern, Modelo, Mano, Posicion, Variante, Activo)
            VALUES (@QR_ID, @QR_Pattern, @Modelo, @Mano, @Posicion, @Variante, @Activo)";

        int rows = await _db.ExecuteAsync(sql, mapping);
        return Ok(new { Success = rows > 0, Mapping = mapping });
    }

    [HttpPost("roi")]
    public async Task<IActionResult> SaveROI([FromBody] InspectionROI roi)
    {
        bool success = await _planService.SaveROIAsync(roi);
        return Ok(new { Success = success, ROI = roi });
    }

    [HttpPost("test-point")]
    public async Task<IActionResult> TestPoint([FromBody] TestPointRequest req)
    {
        try
        {
            var cam = _cameraManager.GetCamera(req.Point.CameraId);
            if (cam == null) return BadRequest(new { Message = $"Camera {req.Point.CameraId} not found" });

            var frame = await cam.CaptureFrameAsync();
            var algo = _algorithms.FirstOrDefault(a => string.Equals(a.AlgorithmType, req.Point.AlgorithmType, StringComparison.OrdinalIgnoreCase))
                ?? _algorithms.First(a => a.AlgorithmType == "PRESENCE");

            var result = await algo.EvaluateAsync(frame, req.Point, req.ROIs);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error testing point {PointCode}", req.Point?.Code);
            return Ok(new PointInspectionResult
            {
                InspectionPoint_ID = req.Point?.InspectionPoint_ID ?? "",
                PointCode = req.Point?.Code ?? "TEST",
                PointName = req.Point?.Name ?? "Test Point",
                ExpectedValue = req.Point?.ExpectedValue ?? "",
                Result = LineVision.Core.Domain.Enums.InspectionResultStatus.NOK,
                DetectedValue = "TEST_ERROR",
                FailureReason = $"Error durante prueba de visión: {ex.Message}",
                Confidence = 0.0,
                Timestamp = DateTime.UtcNow
            });
        }
    }

    [HttpGet("scan-qr")]
    public async Task<IActionResult> ScanQR([FromQuery] string cameraId = "CAM_CRADLE")
    {
        try
        {
            var cam = _cameraManager.GetCamera(cameraId);
            if (cam == null) return BadRequest(new { Message = $"Camera {cameraId} not found" });

            var frame = await cam.CaptureFrameAsync();
            if (frame.Data == null || frame.Data.Length == 0)
                return Ok(new { Success = false, DetectedText = "", Message = "Empty frame" });

            using var mat = OpenCvSharp.Cv2.ImDecode(frame.Data, OpenCvSharp.ImreadModes.Color);
            if (mat.Empty())
                return Ok(new { Success = false, DetectedText = "", Message = "Failed to decode frame" });

            var qrAlgo = _algorithms.OfType<LineVision.Vision.Algorithms.QRCodeAlgorithm>().FirstOrDefault();
            string? decodedText = qrAlgo?.DecodeText(mat);

            if (!string.IsNullOrEmpty(decodedText))
            {
                const string sql = "SELECT * FROM CradleQR WHERE QR_Pattern = @decodedText AND Activo = 1";
                var mapping = await _db.QuerySingleOrDefaultAsync<CradleQRMapping>(sql, new { decodedText });

                return Ok(new
                {
                    Success = true,
                    DetectedText = decodedText,
                    Confidence = 0.99,
                    Mapping = mapping,
                    Matched = mapping != null
                });
            }

            return Ok(new
            {
                Success = false,
                DetectedText = "",
                Message = "No se detectó ningún código QR"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error scanning QR on camera {CameraId}", cameraId);
            return Ok(new
            {
                Success = false,
                DetectedText = "",
                Message = $"Error al procesar escaneo QR: {ex.Message}"
            });
        }
    }

    [HttpPost("point/{id}/capture-template")]
    public async Task<IActionResult> CaptureTemplate(string id)
    {
        var pt = (await _db.QueryAsync<InspectionPoint>("SELECT * FROM InspectionPoint WHERE InspectionPoint_ID = @id", new { id })).FirstOrDefault();
        if (pt == null) return NotFound(new { Message = "Point not found" });

        var rois = (await _db.QueryAsync<InspectionROI>("SELECT * FROM InspectionROI WHERE InspectionPoint_ID = @id", new { id })).ToList();
        var roi = rois.FirstOrDefault() ?? new InspectionROI { X = 100, Y = 100, Width = 150, Height = 150 };

        var cam = _cameraManager.GetCamera(pt.CameraId);
        if (cam == null) return BadRequest(new { Message = $"Camera {pt.CameraId} not found" });

        var frame = await cam.CaptureFrameAsync();
        if (frame.Data == null || frame.Data.Length == 0)
            return BadRequest(new { Message = "Camera frame empty" });

        using var mat = OpenCvSharp.Cv2.ImDecode(frame.Data, OpenCvSharp.ImreadModes.Color);
        if (mat.Empty()) return BadRequest(new { Message = "Failed to decode frame" });

        int rx = Math.Clamp(roi.X, 0, mat.Width - 1);
        int ry = Math.Clamp(roi.Y, 0, mat.Height - 1);
        int rw = Math.Clamp(roi.Width, 1, mat.Width - rx);
        int rh = Math.Clamp(roi.Height, 1, mat.Height - ry);

        var roiRect = new OpenCvSharp.Rect(rx, ry, rw, rh);
        using var crop = new OpenCvSharp.Mat(mat, roiRect);

        var templatesDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "templates");
        Directory.CreateDirectory(templatesDir);
        string filename = $"{pt.InspectionPoint_ID}_template.png";
        string filePath = Path.Combine(templatesDir, filename);

        crop.SaveImage(filePath);

        await _db.ExecuteAsync(
            "UPDATE InspectionROI SET ReferenceImagePath = @filePath WHERE InspectionPoint_ID = @id",
            new { filePath, id });

        return Ok(new { Success = true, ImagePath = filePath, FileName = filename });
    }

    [HttpPost("point/{id}/parameters")]
    public async Task<IActionResult> SavePointParameters(string id, [FromBody] PointParametersRequest req)
    {
        if (!string.IsNullOrEmpty(req.ExpectedValue))
        {
            await _db.ExecuteAsync("UPDATE InspectionPoint SET ExpectedValue = @val WHERE InspectionPoint_ID = @id",
                new { val = req.ExpectedValue, id });
        }
        if (!string.IsNullOrEmpty(req.ShapeType))
        {
            await _db.ExecuteAsync("UPDATE InspectionROI SET ShapeType = @shape WHERE InspectionPoint_ID = @id",
                new { shape = req.ShapeType, id });
        }
        if (!string.IsNullOrEmpty(req.ParametersJson))
        {
            await _db.ExecuteAsync("UPDATE InspectionROI SET ParametersJson = @json WHERE InspectionPoint_ID = @id",
                new { json = req.ParametersJson, id });
        }
        return Ok(new { Success = true });
    }
}

public class PointParametersRequest
{
    public string? ExpectedValue { get; set; }
    public string? ShapeType { get; set; }
    public string? ParametersJson { get; set; }
}

public class TestPointRequest
{
    public InspectionPoint Point { get; set; } = new();
    public List<InspectionROI> ROIs { get; set; } = new();
}

public class CreatePointDto : InspectionPoint
{
    public string? Modelo { get; set; }
    public string? Mano { get; set; }
    public string? Posicion { get; set; }
}

public class ClonePlanRequest
{
    public string PieceType { get; set; } = "PANEL";
    public string SrcModel { get; set; } = "P1B";
    public string SrcHand { get; set; } = "RH";
    public string SrcPos { get; set; } = "FRONT";
    public string DstModel { get; set; } = "P1B";
    public string DstHand { get; set; } = "LH";
    public string DstPos { get; set; } = "FRONT";
    public bool MirrorX { get; set; } = true;
    public int ImageWidth { get; set; } = 640;
}
