using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using Microsoft.Extensions.Logging;

namespace LineVision.Infrastructure.Services;

public class InspectionPlanService : IInspectionPlanService
{
    private readonly IDatabaseService _db;
    private readonly ILogger<InspectionPlanService> _logger;

    public InspectionPlanService(IDatabaseService db, ILogger<InspectionPlanService> logger)
    {
        _db = db;
        _logger = logger;
    }

    public async Task<InspectionPlan?> GetActivePlanForVariantAsync(string pieceType, string modelo, string mano, string posicion, CancellationToken ct = default)
    {
        // 1. Buscar Plan Activo para la variante
        const string sqlPlan = @"
            SELECT * FROM InspectionPlan 
            WHERE PieceType = @pieceType 
              AND Modelo = @modelo 
              AND Mano = @mano 
              AND Posicion = @posicion 
              AND Enabled = 1 
            LIMIT 1";

        var plan = await _db.QuerySingleOrDefaultAsync<InspectionPlan>(sqlPlan, new { pieceType, modelo, mano, posicion }, ct);
        if (plan == null)
        {
            _logger.LogWarning("No active Inspection Plan found for PieceType={PieceType}, Model={Model}, Hand={Hand}, Pos={Pos}",
                pieceType, modelo, mano, posicion);
            return null;
        }

        // 2. Buscar versión activa correspondiente
        const string sqlVersion = @"
            SELECT * FROM InspectionPlanVersion 
            WHERE Plan_ID = @Plan_ID 
              AND VersionNumber = @ActiveVersion 
            LIMIT 1";

        var version = await _db.QuerySingleOrDefaultAsync<InspectionPlanVersion>(sqlVersion, new { plan.Plan_ID, plan.ActiveVersion }, ct);
        if (version == null)
        {
            _logger.LogError("Inspection Plan {Code} specifies ActiveVersion {Ver} but no version record exists in [InspectionPlanVersion]",
                plan.Code, plan.ActiveVersion);
            return null;
        }

        // 3. Cargar Detalles y Puntos de Inspección asociados a esta versión
        var points = await GetPointsForVersionAsync(version.Version_ID, ct);
        version.Details = points.Select(p => new InspectionPlanDetail
        {
            Version_ID = version.Version_ID,
            InspectionPoint_ID = p.InspectionPoint_ID,
            ExecutionOrder = p.ExecutionOrder,
            IsRequiredOverride = p.IsRequired,
            Point = p
        }).ToList();

        plan.Versions.Add(version);
        _logger.LogInformation("Loaded Inspection Plan '{Code}' (Version {Ver}) with {Count} inspection points",
            plan.Code, version.VersionNumber, points.Count);

        return plan;
    }

    public async Task<IReadOnlyList<InspectionPoint>> GetPointsForVersionAsync(int versionId, CancellationToken ct = default)
    {
        const string sql = @"
            SELECT 
                p.InspectionPoint_ID, p.Code, p.Name, p.Description, p.PieceType, 
                p.CameraId, p.AlgorithmType, p.ExpectedValue, p.Tolerance, p.MinConfidence, 
                COALESCE(d.IsRequiredOverride, p.IsRequired) as IsRequired,
                d.ExecutionOrder, p.TimeoutMs, p.Enabled
            FROM InspectionPlanDetail d
            INNER JOIN InspectionPoint p ON d.InspectionPoint_ID = p.InspectionPoint_ID
            WHERE d.Version_ID = @versionId AND p.Enabled = 1
            ORDER BY d.ExecutionOrder ASC";

        var points = (await _db.QueryAsync<InspectionPoint>(sql, new { versionId }, ct)).ToList();

        // Cargar ROIs para cada punto
        const string sqlRoi = "SELECT * FROM InspectionROI WHERE InspectionPoint_ID = @pointId";
        foreach (var pt in points)
        {
            var rois = await _db.QueryAsync<InspectionROI>(sqlRoi, new { pointId = pt.InspectionPoint_ID }, ct);
            pt.ROIs = rois.ToList();
        }

        return points;
    }

    public async Task<IReadOnlyList<InspectionPlan>> GetAllPlansAsync(CancellationToken ct = default)
    {
        const string sql = "SELECT * FROM InspectionPlan ORDER BY PieceType, Modelo, Mano, Posicion";
        var plans = (await _db.QueryAsync<InspectionPlan>(sql, null, ct)).ToList();
        return plans;
    }

    public async Task<int> CreateNewVersionAsync(int planId, string createdBy, string notes, IEnumerable<InspectionPlanDetail> details, CancellationToken ct = default)
    {
        // 1. Obtener última versión existente
        const string sqlMax = "SELECT COALESCE(MAX(VersionNumber), 0) FROM InspectionPlanVersion WHERE Plan_ID = @planId";
        int maxVer = await _db.QuerySingleOrDefaultAsync<int>(sqlMax, new { planId }, ct);
        int newVer = maxVer + 1;

        // 2. Insertar nueva versión inmutable
        const string sqlInsertVer = @"
            INSERT INTO InspectionPlanVersion (Plan_ID, VersionNumber, IsLocked, CreatedDate, CreatedBy, ChangeNotes)
            VALUES (@planId, @newVer, 1, @now, @createdBy, @notes);
            SELECT last_insert_rowid();";

        int versionId = await _db.QuerySingleOrDefaultAsync<int>(sqlInsertVer, new
        {
            planId,
            newVer,
            now = DateTime.UtcNow.ToString("o"),
            createdBy,
            notes
        }, ct);

        // 3. Insertar detalles
        const string sqlInsertDetail = @"
            INSERT INTO InspectionPlanDetail (Version_ID, InspectionPoint_ID, ExecutionOrder, IsRequiredOverride)
            VALUES (@versionId, @InspectionPoint_ID, @ExecutionOrder, @IsRequiredOverride)";

        foreach (var d in details)
        {
            await _db.ExecuteAsync(sqlInsertDetail, new
            {
                versionId,
                d.InspectionPoint_ID,
                d.ExecutionOrder,
                IsRequiredOverride = d.IsRequiredOverride.HasValue ? (d.IsRequiredOverride.Value ? 1 : 0) : (int?)null
            }, ct);
        }

        // 4. Actualizar ActiveVersion en el plan
        const string sqlUpdatePlan = "UPDATE InspectionPlan SET ActiveVersion = @newVer WHERE Plan_ID = @planId";
        await _db.ExecuteAsync(sqlUpdatePlan, new { newVer, planId }, ct);

        _logger.LogInformation("Created and activated new Version {NewVer} for Plan ID {PlanId} (CreatedBy: {User})",
            newVer, planId, createdBy);

        return versionId;
    }

    public async Task<bool> SaveROIAsync(InspectionROI roi, CancellationToken ct = default)
    {
        if (roi.ROI_ID > 0)
        {
            const string updateSql = @"
                UPDATE InspectionROI SET
                    Name = @Name,
                    X = @X,
                    Y = @Y,
                    Width = @Width,
                    Height = @Height,
                    ShapeType = @ShapeType,
                    ReferenceImagePath = @ReferenceImagePath,
                    ParametersJson = @ParametersJson
                WHERE ROI_ID = @ROI_ID";

            int rows = await _db.ExecuteAsync(updateSql, roi, ct);
            return rows > 0;
        }
        else
        {
            const string insertSql = @"
                INSERT INTO InspectionROI (InspectionPoint_ID, Name, X, Y, Width, Height, ShapeType, ReferenceImagePath, ParametersJson)
                VALUES (@InspectionPoint_ID, @Name, @X, @Y, @Width, @Height, @ShapeType, @ReferenceImagePath, @ParametersJson)";

            int rows = await _db.ExecuteAsync(insertSql, roi, ct);
            return rows > 0;
        }
    }

    public async Task<InspectionPlan> EnsurePlanForVariantAsync(string pieceType, string modelo, string mano, string posicion, CancellationToken ct = default)
    {
        var existing = await GetActivePlanForVariantAsync(pieceType, modelo, mano, posicion, ct);
        if (existing != null) return existing;

        string now = DateTime.UtcNow.ToString("o");
        string code = $"PLAN_{pieceType}_{modelo}_{mano}_{posicion}".ToUpperInvariant();
        string name = $"Plan {pieceType} {modelo} {mano} {posicion}";

        const string sqlInsertPlan = @"
            INSERT INTO InspectionPlan (Code, Name, PieceType, Modelo, Mano, Posicion, ActiveVersion, Enabled, CreatedAt)
            VALUES (@code, @name, @pieceType, @modelo, @mano, @posicion, 1, 1, @now);
            SELECT last_insert_rowid();";

        int planId = await _db.QuerySingleOrDefaultAsync<int>(sqlInsertPlan, new { code, name, pieceType, modelo, mano, posicion, now }, ct);

        const string sqlInsertVer = @"
            INSERT INTO InspectionPlanVersion (Plan_ID, VersionNumber, IsLocked, CreatedDate, CreatedBy, ChangeNotes)
            VALUES (@planId, 1, 0, @now, 'SYSTEM', 'Plan generado para variante');";

        await _db.ExecuteAsync(sqlInsertVer, new { planId, now }, ct);

        var created = await GetActivePlanForVariantAsync(pieceType, modelo, mano, posicion, ct);
        return created ?? new InspectionPlan { Plan_ID = planId, Code = code, Name = name, PieceType = pieceType, Modelo = modelo, Mano = mano, Posicion = posicion };
    }

    public async Task<bool> AddPointToPlanVersionAsync(int versionId, string pointId, int executionOrder, bool isRequired, CancellationToken ct = default)
    {
        const string checkSql = "SELECT COUNT(1) FROM InspectionPlanDetail WHERE Version_ID = @versionId AND InspectionPoint_ID = @pointId";
        int count = await _db.QuerySingleOrDefaultAsync<int>(checkSql, new { versionId, pointId }, ct);

        if (count > 0)
        {
            const string updateSql = @"
                UPDATE InspectionPlanDetail 
                SET ExecutionOrder = @executionOrder, IsRequiredOverride = @isRequired 
                WHERE Version_ID = @versionId AND InspectionPoint_ID = @pointId";
            int rows = await _db.ExecuteAsync(updateSql, new { versionId, pointId, executionOrder, isRequired = isRequired ? 1 : 0 }, ct);
            return rows > 0;
        }
        else
        {
            const string insertSql = @"
                INSERT INTO InspectionPlanDetail (Version_ID, InspectionPoint_ID, ExecutionOrder, IsRequiredOverride)
                VALUES (@versionId, @pointId, @executionOrder, @isRequired)";
            int rows = await _db.ExecuteAsync(insertSql, new { versionId, pointId, executionOrder, isRequired = isRequired ? 1 : 0 }, ct);
            return rows > 0;
        }
    }

    public async Task<bool> RemovePointFromPlanVersionAsync(int versionId, string pointId, CancellationToken ct = default)
    {
        const string sql = "DELETE FROM InspectionPlanDetail WHERE Version_ID = @versionId AND InspectionPoint_ID = @pointId";
        int rows = await _db.ExecuteAsync(sql, new { versionId, pointId }, ct);
        return rows > 0;
    }

    public async Task<int> ClonePlanVariantAsync(
        string pieceType, 
        string srcModel, string srcHand, string srcPos, 
        string dstModel, string dstHand, string dstPos, 
        bool mirrorX, int imageWidth = 640, 
        CancellationToken ct = default)
    {
        var srcPlan = await GetActivePlanForVariantAsync(pieceType, srcModel, srcHand, srcPos, ct);
        if (srcPlan == null || !srcPlan.Versions.Any())
        {
            _logger.LogWarning("Clone source plan {PieceType} {M}-{H}-{P} not found", pieceType, srcModel, srcHand, srcPos);
            return 0;
        }

        var srcPoints = srcPlan.Versions[0].Details.Select(d => d.Point).Where(p => p != null).ToList();
        if (!srcPoints.Any())
        {
            _logger.LogWarning("No points found in source plan to clone");
            return 0;
        }

        var dstPlan = await EnsurePlanForVariantAsync(pieceType, dstModel, dstHand, dstPos, ct);
        int dstVerId = dstPlan.Versions[0].Version_ID;

        // Limpiar detalles anteriores para la versión destino
        await _db.ExecuteAsync("DELETE FROM InspectionPlanDetail WHERE Version_ID = @dstVerId", new { dstVerId }, ct);

        int clonedCount = 0;
        foreach (var pt in srcPoints)
        {
            if (pt == null) continue;

            // Generar nuevo ID único para la variante destino
            string newPtId = $"IP_{pieceType}_{dstModel}_{dstHand}_{dstPos}_{pt.Code}".ToUpperInvariant();
            string newCode = $"{pt.Code}_{dstHand}{dstPos[0]}".ToUpperInvariant();

            const string upsertPointSql = @"
                INSERT OR REPLACE INTO InspectionPoint (
                    InspectionPoint_ID, Code, Name, Description, PieceType, CameraId,
                    AlgorithmType, ExpectedValue, Tolerance, MinConfidence, IsRequired,
                    ExecutionOrder, TimeoutMs, Enabled
                ) VALUES (
                    @newPtId, @newCode, @Name, @Description, @PieceType, @CameraId,
                    @AlgorithmType, @ExpectedValue, @Tolerance, @MinConfidence, @IsRequired,
                    @ExecutionOrder, @TimeoutMs, @Enabled
                )";

            await _db.ExecuteAsync(upsertPointSql, new
            {
                newPtId,
                newCode,
                pt.Name,
                pt.Description,
                pt.PieceType,
                pt.CameraId,
                pt.AlgorithmType,
                pt.ExpectedValue,
                pt.Tolerance,
                pt.MinConfidence,
                IsRequired = pt.IsRequired ? 1 : 0,
                pt.ExecutionOrder,
                pt.TimeoutMs,
                Enabled = pt.Enabled ? 1 : 0
            }, ct);

            // Eliminar ROIs previas del punto destino si existían
            await _db.ExecuteAsync("DELETE FROM InspectionROI WHERE InspectionPoint_ID = @newPtId", new { newPtId }, ct);

            // Clonar ROIs con posible espejo horizontal
            if (pt.ROIs != null && pt.ROIs.Any())
            {
                foreach (var r in pt.ROIs)
                {
                    int clonedX = mirrorX ? Math.Max(0, imageWidth - r.X - r.Width) : r.X;
                    await SaveROIAsync(new InspectionROI
                    {
                        InspectionPoint_ID = newPtId,
                        Name = r.Name,
                        X = clonedX,
                        Y = r.Y,
                        Width = r.Width,
                        Height = r.Height,
                        ShapeType = r.ShapeType,
                        ReferenceImagePath = r.ReferenceImagePath,
                        ParametersJson = r.ParametersJson
                    }, ct);
                }
            }

            // Asociar a la versión del plan destino
            await AddPointToPlanVersionAsync(dstVerId, newPtId, pt.ExecutionOrder, pt.IsRequired, ct);
            clonedCount++;
        }

        _logger.LogInformation("Cloned {Count} inspection points from {SrcM}-{SrcH}-{SrcP} to {DstM}-{DstH}-{DstP} (MirrorX: {Mirror})",
            clonedCount, srcModel, srcHand, srcPos, dstModel, dstHand, dstPos, mirrorX);

        return clonedCount;
    }
}
