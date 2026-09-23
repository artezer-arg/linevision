using LineVision.Core.Domain.Enums;
using LineVision.Core.Domain.Models;

namespace LineVision.Core.Domain.Interfaces;

public interface IPLCService : IAsyncDisposable
{
    string PLCId { get; }
    bool IsConnected { get; }
    Task<bool> ConnectAsync(CancellationToken ct = default);
    Task DisconnectAsync();
    Task<PLCStateInfo> ReadCurrentStateAsync(CancellationToken ct = default);
    Task<bool> WriteRecipeAsync(int recipeA, int recipeB, CancellationToken ct = default);
    Task<bool> AssertRecipeReadyAsync(CancellationToken ct = default);
    Task<(int recipeA, int recipeB)> ReadRecipeEchoAsync(CancellationToken ct = default);
    Task<bool> ClearSignalsAsync(CancellationToken ct = default);
    Task<bool> WaitForStateAsync(PLCLogicalState targetState, TimeSpan timeout, CancellationToken ct = default);
    
    // Simulación & Control de Fallas
    void SetSimulationState(PLCLogicalState state, int? echoA = null, int? echoB = null);
    void InjectFault(string faultType);
}

public interface ICameraProvider : IAsyncDisposable
{
    string CameraId { get; }
    string Name { get; }
    bool IsConnected { get; }
    Task<bool> ConnectAsync(CancellationToken ct = default);
    Task DisconnectAsync();
    Task<CameraFrame> CaptureFrameAsync(CancellationToken ct = default);
    
    // Simulación
    void SetSimulationImage(byte[] imageBytes);
    void SetSimulationPattern(string pattern);
}

public interface ICameraManager
{
    Task InitializeCamerasAsync(CancellationToken ct = default);
    ICameraProvider? GetCamera(string cameraId);
    IReadOnlyCollection<ICameraProvider> GetAllCameras();
    Task<Dictionary<string, CameraFrame>> CaptureAllFramesAsync(CancellationToken ct = default);
    Task<IReadOnlyList<CameraConfig>> GetCameraConfigurationsAsync(CancellationToken ct = default);
    Task<bool> ConfigureCameraProviderAsync(string cameraId, string providerType, string connectionUri, CancellationToken ct = default);
    Task<IReadOnlyList<DiscoveredCameraDevice>> DiscoverAvailableDevicesAsync(CancellationToken ct = default);
}

public interface IProductionOrderService
{
    Task<ProductionOrder?> GetCurrentOrderForStationAsync(string stationCode, CancellationToken ct = default);
    Task<bool> AdvanceStationPointerAsync(string stationCode, int nextOrderId, CancellationToken ct = default);
    Task<IReadOnlyList<ProductionOrder>> GetPendingOrdersAsync(int limit = 10, CancellationToken ct = default);
}

public interface IRecipeService
{
    Task<RobotRecipe?> GetRecipeAsync(string stationCode, string cradleCode, string modelo, string mano, string posicion, CancellationToken ct = default);
    Task<RobotRecipe?> GetRecipeAsync(string stationCode, string modelo, string mano, string posicion, CancellationToken ct = default);
    Task<IReadOnlyList<RobotRecipe>> GetAllRecipesAsync(string stationCode, string? cradleCode = null, CancellationToken ct = default);
    Task<IReadOnlyList<string>> GetAvailableCradlesAsync(string stationCode, CancellationToken ct = default);
    Task<bool> SaveRecipeAsync(RobotRecipe recipe, CancellationToken ct = default);
}

public interface ICradleQRService
{
    Task<string> ResolveCradleCodeAsync(string qrCode, CancellationToken ct = default);
    Task<bool> ValidateCradleCompatibilityAsync(string cradleCode, ProductContext expectedContext, CancellationToken ct = default);
    Task<bool> ValidateQRAsync(string qrCode, ProductContext expectedContext, CancellationToken ct = default);
    Task<CradleQRConfig> GetConfigAsync(CancellationToken ct = default);
    Task SaveConfigAsync(CradleQRConfig config, CancellationToken ct = default);
}

public interface IInspectionPlanService
{
    Task<InspectionPlan?> GetActivePlanForVariantAsync(string pieceType, string modelo, string mano, string posicion, CancellationToken ct = default);
    Task<IReadOnlyList<InspectionPoint>> GetPointsForVersionAsync(int versionId, CancellationToken ct = default);
    Task<IReadOnlyList<InspectionPlan>> GetAllPlansAsync(CancellationToken ct = default);
    Task<int> CreateNewVersionAsync(int planId, string createdBy, string notes, IEnumerable<InspectionPlanDetail> details, CancellationToken ct = default);
    Task<bool> SaveROIAsync(InspectionROI roi, CancellationToken ct = default);
    Task<InspectionPlan> EnsurePlanForVariantAsync(string pieceType, string modelo, string mano, string posicion, CancellationToken ct = default);
    Task<bool> AddPointToPlanVersionAsync(int versionId, string pointId, int executionOrder, bool isRequired, CancellationToken ct = default);
    Task<bool> RemovePointFromPlanVersionAsync(int versionId, string pointId, CancellationToken ct = default);
    Task<int> ClonePlanVariantAsync(string pieceType, string srcModel, string srcHand, string srcPos, string dstModel, string dstHand, string dstPos, bool mirrorX, int imageWidth = 640, CancellationToken ct = default);
}

public interface ITraceabilityService
{
    Task<Guid> StartCycleAsync(ProductionOrder order, string stationCode, string user, CancellationToken ct = default);
    Task UpdateCycleStateAsync(Guid cycleId, Action<ProductionCycle> updateAction, CancellationToken ct = default);
    Task LogInspectionResultsAsync(Guid cycleId, IEnumerable<PointInspectionResult> results, CancellationToken ct = default);
    Task<bool> CommitStationResultAsync(Guid cycleId, StationResultOutcome outcome, CancellationToken ct = default);
    Task<bool> IsSequenceAlreadyProcessedAsync(int sequenceId, string stationCode, CancellationToken ct = default);
    Task RecordBypassAsync(BypassRecord bypass, CancellationToken ct = default);
    Task<IReadOnlyList<ProductionCycle>> QueryCyclesAsync(DateTime from, DateTime to, string? sequence = null, string? outcome = null, CancellationToken ct = default);
}

public interface IInspectionEngine
{
    Task<InspectionReport> ExecutePlanAsync(
        InspectionPlan plan, 
        ProductContext context, 
        IReadOnlyDictionary<string, CameraFrame> frames, 
        CancellationToken ct = default);
}

public interface IVisionAlgorithm
{
    string AlgorithmType { get; }
    Task<PointInspectionResult> EvaluateAsync(
        CameraFrame frame, 
        InspectionPoint point, 
        IReadOnlyList<InspectionROI> rois, 
        CancellationToken ct = default);
}

public interface IStateMachineController
{
    StationState CurrentState { get; }
    ProductionOrder? CurrentOrder { get; }
    ProductionCycle? CurrentCycle { get; }
    event EventHandler<StationStateChangedEventArgs>? StateChanged;
    
    Task<bool> StartCycleAsync(CancellationToken ct = default);
    Task<bool> TriggerAsync(StationTrigger trigger, object? payload = null, CancellationToken ct = default);
    Task RequestEmergencyStopAsync(string reason, CancellationToken ct = default);
    Task<bool> ForceStateAsync(StationState targetState, string reason, string authorizedUser, CancellationToken ct = default);
    Task ResetFaultAsync(string authorizedUser, CancellationToken ct = default);
    void AttachActiveCycle(ProductionCycle? cycle);
}

public class StationStateChangedEventArgs : EventArgs
{
    public StationState PreviousState { get; set; }
    public StationState NewState { get; set; }
    public StationTrigger Trigger { get; set; }
    public string? Reason { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

public interface IHealthMonitoringService
{
    Task<StationHealthStatus> CheckHealthAsync(CancellationToken ct = default);
    Task RegisterHeartbeatAsync(string componentName);
}

public class StationHealthStatus
{
    public bool IsHealthy { get; set; }
    public bool DatabaseConnected { get; set; }
    public bool PLCConnected { get; set; }
    public bool CamerasConnected { get; set; }
    public double DiskFreeSpaceGb { get; set; }
    public double MemoryUsageMb { get; set; }
    public List<IndustrialAlarm> ActiveAlarms { get; set; } = new();
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
}

public interface IAuthenticationService
{
    Task<User?> AuthenticateAsync(string username, string password, CancellationToken ct = default);
    Task<bool> HasPermissionAsync(string username, string permission, CancellationToken ct = default);
}

public interface IDatabaseService
{
    Task<T?> QuerySingleOrDefaultAsync<T>(string sql, object? param = null, CancellationToken ct = default);
    Task<IEnumerable<T>> QueryAsync<T>(string sql, object? param = null, CancellationToken ct = default);
    Task<int> ExecuteAsync(string sql, object? param = null, CancellationToken ct = default);
    Task<bool> TestConnectionAsync(CancellationToken ct = default);
}
