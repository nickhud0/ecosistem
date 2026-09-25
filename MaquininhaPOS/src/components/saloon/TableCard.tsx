import React from "react";
import { Clock, Users } from "lucide-react";
import { brl, elapsed } from "../../lib/format";
import type { TableT } from "../../lib/types";

interface TableCardProps {
  table: TableT;
  onSelect: (table: TableT) => void;
  isMyTable?: boolean;
}

export const TableCard = React.memo(function TableCard({
  table,
  onSelect,
  isMyTable,
}: TableCardProps) {
  const isFree = table.status === "livre";
  const isBill = table.status === "conta";
  const isBusy = table.status === "ocupada";

  const totalConsumed = table.items.reduce(
    (acc, it) => acc + (it.totalPrice ?? it.qty * it.unitPrice),
    0
  );

  const itemsCount = table.items.reduce((acc, it) => acc + it.qty, 0);

  // Cores limpas e sólidas (sem sombras pesadas que travam GPUs fracas)
  const cardBorder = isBill
    ? "border-rose-500 bg-rose-950/20"
    : isBusy
    ? "border-amber-500/60 bg-amber-950/15"
    : "border-slate-800 hover:border-emerald-500/50 bg-slate-900";

  const badgeBg = isBill
    ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
    : isBusy
    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
    : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40";

  const badgeText = isBill ? "Conta" : isBusy ? "Ocupada" : "Livre";

  return (
    <button
      onClick={() => onSelect(table)}
      type="button"
      className={`relative w-full rounded-2xl p-3 border ${cardBorder} text-left flex flex-col justify-between h-[125px] active:scale-[0.97] transition-transform touch-manipulation`}
    >
      {/* Topo do Card: Número da Mesa e Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-xl font-black text-white tracking-tight">
            #{String(table.number).padStart(2, "0")}
          </span>
          {isMyTable && !isFree && (
            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Minha
            </span>
          )}
        </div>

        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${badgeBg}`}>
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isBill ? "bg-rose-400" : isBusy ? "bg-amber-400" : "bg-emerald-400"
            }`}
          />
          {badgeText}
        </span>
      </div>

      {/* Meio: Consumo ou Lugares */}
      <div className="my-auto">
        {isFree ? (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            <span>{table.seats} lugares</span>
          </div>
        ) : (
          <div>
            <div className="text-base font-extrabold text-white tracking-tight leading-none">
              {brl(totalConsumed)}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1">
              <span className="flex items-center gap-0.5">
                <Clock className="w-3 h-3 text-slate-500" />
                {elapsed(table.openedAt)}
              </span>
              <span>•</span>
              <span>{itemsCount} {itemsCount === 1 ? "item" : "itens"}</span>
            </div>
          </div>
        )}
      </div>

      {/* Rodapé: Garçom ou Toque para Abrir */}
      <div className="pt-1.5 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
        {isFree ? (
          <span className="text-emerald-400 font-semibold">+ Abrir Mesa</span>
        ) : (
          <>
            <span className="text-slate-400 truncate max-w-[100px]">
              {table.waiter}
            </span>
            <span className="text-slate-300 font-bold">Ver ➔</span>
          </>
        )}
      </div>
    </button>
  );
});
