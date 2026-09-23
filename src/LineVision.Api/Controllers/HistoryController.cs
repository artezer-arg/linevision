using LineVision.Core.Domain.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace LineVision.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class HistoryController : ControllerBase
{
    private readonly ITraceabilityService _traceability;
    private readonly IDatabaseService _db;

    public HistoryController(ITraceabilityService traceability, IDatabaseService db)
    {
        _traceability = traceability;
        _db = db;
    }

    [HttpGet("cycles")]
    public async Task<IActionResult> QueryCycles(
        [FromQuery] DateTime? from,
        [FromQuery] DateTime? to,
        [FromQuery] string? sequence,
        [FromQuery] string? outcome)
    {
        var fromDate = from ?? DateTime.UtcNow.AddDays(-7);
        var toDate = to ?? DateTime.UtcNow.AddDays(1);

        var cycles = await _traceability.QueryCyclesAsync(fromDate, toDate, sequence, outcome);
        return Ok(cycles);
    }

    [HttpGet("cycle/{id}")]
    public async Task<IActionResult> GetCycleDetails(string id)
    {
        const string sqlCycle = "SELECT * FROM ProductionCycle WHERE Cycle_ID = @id";
        var cycle = await _db.QuerySingleOrDefaultAsync<dynamic>(sqlCycle, new { id });
        if (cycle == null) return NotFound(new { Message = "Cycle not found" });

        const string sqlPoints = "SELECT * FROM InspectionResult WHERE Cycle_ID = @id ORDER BY Timestamp ASC";
        var inspectionPoints = await _db.QueryAsync<dynamic>(sqlPoints, new { id });

        return Ok(new
        {
            Cycle = cycle,
            Inspections = inspectionPoints
        });
    }
}
