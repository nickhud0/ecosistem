import { useMemo, useState } from "react";
import { ArrowRight, Check, MoveRight, Users, X } from "lucide-react";
import { brl } from "../../lib/format";
import type { TableT } from "../../lib/types";

interface TableTransferModalProps {
  sourceTable: TableT;
  allTables: TableT[];
  onTransfer: (sourceTable: TableT, targetTable: TableT) => Promise<boolean>;
  onClose: () => void;
  isSubmitting: boolean;
}

export function TableTransferModal({
  sourceTable,
  allTables,
  onTransfer,
  onClose,
  isSubmitting,
}: TableTransferModalProps) {
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  // Filtra mesas disponíveis (exclui a própria mesa de origem)
  const candidateTables = useMemo(() => {
    return allTables.filter((t) => t.id !== sourceTable.id);
  }, [allTables, sourceTable]);

  const targetTable = candidateTables.find((t) => t.id === selectedTargetId) || null;

  const totalSource = sourceTable.items.reduce(
    (sum, it) => sum + (it.totalPrice ?? it.qty * it.unitPrice),
    0
  );

  const handleConfirm = async () => {
    if (!targetTable) return;
    const ok = await onTransfer(sourceTable, targetTable);
    if (ok) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col justify-end animate-in fade-in-50 duration-200">
      <div className="bg-[#0f172a] rounded-t-3xl border-t border-slate-800 max-h-[85vh] flex flex-col max-w-md mx-auto w-full shadow-2xl p-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">
              Transferir Mesa #{String(sourceTable.number).padStart(2, "0")}
            </h3>
            <p className="text-[11px] text-slate-400">
              {sourceTable.items.length} itens • {brl(totalSource)}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Prévia da Transferência */}
        <div className="py-3">
          <div className="bg-slate-900/90 p-3 rounded-2xl border border-slate-800 flex items-center justify-between text-xs">
            <div className="text-center flex-1">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Origem</span>
              <div className="text-lg font-black text-amber-400">
                #{String(sourceTable.number).padStart(2, "0")}
              </div>
            </div>

            <MoveRight className="w-5 h-5 text-slate-500" />

            <div className="text-center flex-1">
              <span className="text-[10px] text-slate-400 uppercase font-semibold">Destino</span>
              <div className="text-lg font-black text-emerald-400">
                {targetTable ? `#${String(targetTable.number).padStart(2, "0")}` : "---"}
              </div>
            </div>
          </div>
        </div>

        {/* Seleção da Mesa de Destino */}
        <div className="flex-1 overflow-y-auto space-y-2 pb-4">
          <span className="text-xs font-semibold text-slate-400">
            Selecione a Mesa de Destino:
          </span>

          <div className="grid grid-cols-3 gap-2">
            {candidateTables.map((t) => {
              const isSelected = selectedTargetId === t.id;
              const isFree = t.status === "livre";

              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTargetId(t.id)}
                  className={`p-3 rounded-2xl border text-center transition-all active:scale-95 ${
                    isSelected
                      ? "bg-emerald-950/40 border-emerald-500 ring-2 ring-emerald-500/50"
                      : isFree
                      ? "bg-slate-900 border-slate-800 hover:border-slate-700"
                      : "bg-amber-950/20 border-amber-800/40"
                  }`}
                >
                  <div className="text-base font-black text-white">#{t.number}</div>
                  <div className="text-[10px] font-semibold mt-1">
                    {isFree ? (
                      <span className="text-emerald-400">Livre</span>
                    ) : (
                      <span className="text-amber-400">Juntar</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Botão de Confirmação */}
        <div className="pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!targetTable || isSubmitting}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 active:scale-95 transition-all disabled:opacity-40"
          >
            <Check className="w-5 h-5" />
            <span>
              {isSubmitting
                ? "Transferindo..."
                : targetTable
                ? `Confirmar Transferência para Mesa #${targetTable.number}`
                : "Selecione a Mesa de Destino"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
