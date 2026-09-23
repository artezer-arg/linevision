namespace LineVision.Core.Domain.Models;

public class ProductionOrder
{
    public int ID_OrdenProduccion { get; set; }
    public string ID_OrdenCliente { get; set; } = string.Empty;
    public int ID_Secuencia { get; set; }
    public string Secuencia { get; set; } = string.Empty;
    public string Modelo { get; set; } = string.Empty;
    public string Mano { get; set; } = string.Empty;     // "RH" / "LH"
    public string Posicion { get; set; } = string.Empty; // "FRONT" / "REAR"
    public int Orden { get; set; }
    public string Estado { get; set; } = "PENDIENTE";
    public DateTime FechaCreacion { get; set; } = DateTime.UtcNow;

    public string VariantKey => $"{Modelo}_{Mano}_{Posicion}".ToUpperInvariant();
}

public class ProductionCycle
{
    public Guid Cycle_ID { get; set; } = Guid.NewGuid();
    public int ID_Secuencia { get; set; }
    public int ID_OrdenProduccion { get; set; }
    public string ID_OrdenCliente { get; set; } = string.Empty;
    public string Secuencia { get; set; } = string.Empty;
    public string Modelo { get; set; } = string.Empty;
    public string Mano { get; set; } = string.Empty;
    public string Posicion { get; set; } = string.Empty;
    public string Puesto { get; set; } = "DL02";
    public DateTime FechaInicio { get; set; } = DateTime.UtcNow;
    public DateTime? FechaFin { get; set; }
    public string? QR_Cuna { get; set; }
    public string? CradleResult { get; set; } // "OK", "NOK", "BYPASS"
    public string? PanelResult { get; set; }  // "OK", "NOK", "BYPASS"
    public string? InspectionPlan { get; set; }
    public int? InspectionPlanVersion { get; set; }
    public int? Recipe_A { get; set; }
    public int? Recipe_B { get; set; }
    public string? PLCStartState { get; set; }
    public string? PLCFinalState { get; set; }
    public string? RobotResult { get; set; }
    public string? StationResult { get; set; }
    public string Usuario { get; set; } = "OPERATOR";
    public string? ErrorCode { get; set; }
    public string? ErrorDescription { get; set; }
    public int? CycleTimeMs { get; set; }
    public int? VisionTimeMs { get; set; }
    public int? PLCTimeMs { get; set; }
    public int? DBTimeMs { get; set; }
}

public class StationResultRecord
{
    public long ID_ProduccionSecuencia { get; set; }
    public int ID_Secuencia { get; set; }
    public int ID_OrdenProduccion { get; set; }
    public string ID_OrdenCliente { get; set; } = string.Empty;
    public string Puesto { get; set; } = "DL02";
    public DateTime Fecha { get; set; } = DateTime.UtcNow;
    public int Orden { get; set; }
    public string Resultado { get; set; } = "OK"; // "OK", "NOK"
}
