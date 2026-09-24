using LineVision.Api.Hubs;
using LineVision.Api.Services;
using LineVision.Core.Domain.Interfaces;
using LineVision.Core.Domain.Models;
using LineVision.Infrastructure.Cameras;
using LineVision.Infrastructure.Data;
using LineVision.Infrastructure.PLC;
using LineVision.Infrastructure.Services;
using LineVision.Infrastructure.Simulators;
using LineVision.Service.Coordination;
using LineVision.Service.Monitoring;
using LineVision.Service.StateMachine;
using LineVision.Vision.Algorithms;
using LineVision.Vision.Engine;

var builder = WebApplication.CreateBuilder(args);

// 1. Core Services & Database
builder.Services.AddSingleton<IDatabaseService, DatabaseService>();
builder.Services.AddSingleton<ProductionSimulator>();
builder.Services.AddSingleton<IProductionOrderService, ProductionOrderService>();
builder.Services.AddSingleton<ITraceabilityService, TraceabilityService>();
builder.Services.AddSingleton<IRecipeService, RecipeService>();
builder.Services.AddSingleton<ICradleQRService, CradleQRService>();
builder.Services.AddSingleton<IInspectionPlanService, InspectionPlanService>();
builder.Services.AddSingleton<IAuthenticationService, AuthenticationService>();

// 2. Hardware Layer & Simulators
builder.Services.AddSingleton<PLCConfiguration>(sp =>
{
    var config = sp.GetRequiredService<IConfiguration>();
    return new PLCConfiguration
    {
        PLC_ID = "PLC_DL02",
        StationCode = config["Station:Code"] ?? "DL02",
        Protocol = "SIMULATOR",
        IPAddress = "192.168.1.50",
        Port = 44818
    };
});
builder.Services.AddSingleton<PLCSimulator>();
builder.Services.AddSingleton<TelnetGatewayService>();
builder.Services.AddSingleton<PLCManager>();
builder.Services.AddSingleton<IPLCService>(sp => sp.GetRequiredService<PLCManager>());
builder.Services.AddSingleton<PLCHandshakeCoordinator>();
builder.Services.AddSingleton<ICameraManager, CameraManager>();

// 3. Vision Engine & Algorithms
builder.Services.AddSingleton<IVisionAlgorithm, PresenceAbsenceAlgorithm>();
builder.Services.AddSingleton<IVisionAlgorithm, TemplateMatchingAlgorithm>();
builder.Services.AddSingleton<IVisionAlgorithm, ColorMatchingAlgorithm>();
builder.Services.AddSingleton<IVisionAlgorithm, QRCodeAlgorithm>();
builder.Services.AddSingleton<IInspectionEngine, InspectionEngine>();

// 4. Industrial State Machine & Health Monitoring
builder.Services.AddSingleton<IStateMachineController, StateMachineController>();
builder.Services.AddSingleton<IHealthMonitoringService, HealthMonitoringService>();
builder.Services.AddSingleton<CycleRecoveryService>();

// 5. Industrial Background Orchestration & Realtime Broadcasting
builder.Services.AddSingleton<StationOrchestrator>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<StationOrchestrator>());
builder.Services.AddHostedService<UiStreamBroadcaster>();

// 6. Web API, SignalR & CORS
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
    });
builder.Services.AddSignalR(options =>
{
    options.EnableDetailedErrors = true;
}).AddJsonProtocol(options =>
{
    options.PayloadSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

builder.Services.AddCors(options =>
{
    options.AddPolicy("IndustrialPolicy", policy =>
    {
        policy.SetIsOriginAllowed(_ => true)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

// Run post-restart industrial safety recovery before accepting cycle commands
using (var scope = app.Services.CreateScope())
{
    var recoveryService = scope.ServiceProvider.GetRequiredService<CycleRecoveryService>();
    var stationCode = builder.Configuration["Station:Code"] ?? "DL02";
    await recoveryService.PerformStartupReconciliationAsync(stationCode);

    // Initialize all industrial and physical cameras on startup
    var cameraManager = scope.ServiceProvider.GetRequiredService<ICameraManager>();
    await cameraManager.InitializeCamerasAsync();
}

// HTTP Pipeline
if (app.Environment.IsDevelopment() || true)
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("IndustrialPolicy");
app.UseStaticFiles();

app.UseRouting();
app.UseAuthorization();

app.MapControllers();
app.MapHub<LineVisionHub>("/hubs/linevision");

// Fallback to static SPA index if present
app.MapFallbackToFile("index.html");

app.Run();
