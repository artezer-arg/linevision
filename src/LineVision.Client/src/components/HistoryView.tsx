import React, { useEffect, useState } from 'react';
import { ProductionCycle } from '../types';
import { api } from '../services/api';
import { History, Search, CheckCircle2, XCircle, Clock, Eye } from 'lucide-react';

export const HistoryView: React.FC = () => {
  const [cycles, setCycles] = useState<ProductionCycle[]>([]);
  const [sequenceFilter, setSequenceFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [selectedCycle, setSelectedCycle] = useState<any | null>(null);

  const loadCycles = async () => {
    try {
      const data = await api.getCycles(sequenceFilter || undefined, outcomeFilter || undefined);
      setCycles(data);
    } catch (e) {
      console.error('Failed to load cycles', e);
    }
  };

  useEffect(() => {
    loadCycles();
  }, [outcomeFilter]);

  const viewDetails = async (id: string) => {
    try {
      const details = await api.getCycleDetails(id);
      setSelectedCycle(details);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-black tracking-tight text-white flex items-center space-x-2">
          <History className="w-6 h-6 text-emerald-400" />
          <span>HISTORIAL DE TRAZABILIDAD Y REGISTRO DL02</span>
        </h2>

        {/* Filters */}
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar secuencia..."
              value={sequenceFilter}
              onChange={e => setSequenceFilter(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadCycles()}
              className="bg-industrial-dark border border-industrial-border rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={outcomeFilter}
            onChange={e => setOutcomeFilter(e.target.value)}
            className="bg-industrial-dark border border-industrial-border rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">Todos los resultados</option>
            <option value="OK">Solo OK</option>
            <option value="NOK">Solo NOK</option>
          </select>

          <button
            onClick={loadCycles}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold"
          >
            Filtrar
          </button>
        </div>
      </div>

      {/* Cycles Table */}
      <div className="bg-industrial-card border border-industrial-border rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-industrial-dark text-slate-400 uppercase font-semibold border-b border-industrial-border">
            <tr>
              <th className="p-3">Secuencia</th>
              <th className="p-3">Modelo</th>
              <th className="p-3">Mano</th>
              <th className="p-3">Posición</th>
              <th className="p-3">QR Cuna</th>
              <th className="p-3">Receta (A / B)</th>
              <th className="p-3">Resultado DL02</th>
              <th className="p-3">Duración</th>
              <th className="p-3">Fecha y Hora</th>
              <th className="p-3 text-right">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-industrial-border text-slate-200">
            {cycles.length > 0 ? (
              cycles.map((c: any) => {
                const isOk = c.stationResult === 'OK';
                return (
                  <tr key={c.cycle_ID} className="hover:bg-slate-800/40 transition">
                    <td className="p-3 font-mono font-bold text-yellow-400">{c.secuencia}</td>
                    <td className="p-3 font-bold">{c.modelo}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded font-black ${c.mano === 'RH' ? 'text-emerald-400 bg-emerald-950/60' : 'text-cyan-400 bg-cyan-950/60'}`}>
                        {c.mano}
                      </span>
                    </td>
                    <td className="p-3">{c.posicion}</td>
                    <td className="p-3 font-mono text-slate-400">{c.qR_Cuna || '--'}</td>
                    <td className="p-3 font-mono">
                      {c.recipe_A !== null && c.recipe_A !== undefined ? `${c.recipe_A} / ${c.recipe_B}` : '--'}
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded-md font-black flex items-center space-x-1 w-max ${
                        isOk ? 'bg-emerald-950 text-emerald-400 border border-emerald-600' : 'bg-red-950 text-red-400 border border-red-600'
                      }`}>
                        {isOk ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                        <span>{c.stationResult || 'EN_PROCESO'}</span>
                      </span>
                    </td>
                    <td className="p-3 font-mono text-slate-400">
                      {c.cycleTimeMs ? `${(c.cycleTimeMs / 1000).toFixed(1)}s` : '--'}
                    </td>
                    <td className="p-3 text-slate-400">
                      {new Date(c.fechaInicio).toLocaleString()}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => viewDetails(c.cycle_ID)}
                        className="p-1.5 hover:bg-slate-700 rounded text-blue-400"
                        title="Ver detalle"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={10} className="p-8 text-center text-slate-500 font-medium">
                  No se encontraron ciclos con los filtros seleccionados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {selectedCycle && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-industrial-card border border-industrial-border rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-industrial-border pb-3">
              <h3 className="font-extrabold text-base text-white">
                Detalle de Trazabilidad: Secuencia {selectedCycle.cycle.Secuencia}
              </h3>
              <button
                onClick={() => setSelectedCycle(null)}
                className="text-slate-400 hover:text-white font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 bg-industrial-dark p-3 rounded-lg text-xs">
              <div>
                <span className="text-slate-400 block">ID Secuencia:</span>
                <span className="font-mono text-white font-bold">{selectedCycle.cycle.ID_Secuencia}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Variante:</span>
                <span className="font-bold text-white">
                  {selectedCycle.cycle.Modelo} {selectedCycle.cycle.Mano} {selectedCycle.cycle.Posicion}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Resultado DL02:</span>
                <span className="font-black text-emerald-400">{selectedCycle.cycle.StationResult}</span>
              </div>
            </div>

            <div>
              <h4 className="text-xs uppercase font-bold text-slate-300 mb-2">Puntos de Inspección Ejecutados:</h4>
              <div className="space-y-2">
                {selectedCycle.inspections.map((p: any, idx: number) => (
                  <div key={idx} className="bg-industrial-dark p-2.5 rounded border border-industrial-border flex items-center justify-between text-xs">
                    <div>
                      <span className="font-mono font-bold text-blue-400 mr-2">{p.InspectionPoint_ID}</span>
                      <span className="text-slate-200">{p.ExpectedValue}</span>
                    </div>
                    <div className="flex items-center space-x-3 font-mono">
                      <span>Confianza: {(p.Confidence * 100).toFixed(0)}%</span>
                      <span className={`px-2 py-0.5 rounded font-black ${p.Result === 'OK' ? 'bg-emerald-950 text-emerald-400' : 'bg-red-950 text-red-400'}`}>
                        {p.Result}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedCycle(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-bold"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
