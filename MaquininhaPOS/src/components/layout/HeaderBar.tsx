import React from "react";
import { LogOut, RefreshCw } from "lucide-react";
import type { UserWaiter } from "../../lib/types";

interface HeaderBarProps {
  waiter: UserWaiter | null;
  isRealtimeActive: boolean;
  isLoading: boolean;
  onRefresh: () => void;
  onLogout: () => void;
  occupiedCount: number;
  totalTables: number;
}

export const HeaderBar = React.memo(function HeaderBar({
  waiter,
  isRealtimeActive,
  isLoading,
  onRefresh,
  onLogout,
  occupiedCount,
  totalTables,
}: HeaderBarProps) {
  return (
    <header className="sticky top-0 z-30 bg-[#0c1220] border-b border-slate-800 px-3.5 py-2.5 flex items-center justify-between hardware-accelerated">
      {/* Lado Esquerdo: Identificação e Status da Nuvem */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-sm shadow-sm flex-shrink-0">
          ⚡
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-100 tracking-tight">Fluxo POS</span>
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                isRealtimeActive
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
              }`}
            >
              <span
                className={`w-1 h-1 rounded-full ${
                  isRealtimeActive ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
              {isRealtimeActive ? "Ao Vivo" : "Off"}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 leading-tight">
            {occupiedCount}/{totalTables} ocupadas
          </p>
        </div>
      </div>

      {/* Lado Direito: Garçom Logado e Ações */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={onRefresh}
          disabled={isLoading}
          aria-label="Atualizar dados"
          className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center active:scale-95 transition-transform"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-emerald-400" : ""}`} />
        </button>

        {waiter && (
          <div className="flex items-center gap-1.5 pl-1.5 border-l border-slate-800">
            <div className="flex items-center gap-1 bg-slate-800/80 px-2 py-1 rounded-lg">
              <span className="text-xs font-semibold text-slate-200 max-w-[80px] truncate">
                {waiter.name}
              </span>
            </div>

            <button
              onClick={onLogout}
              title="Trocar Atendente"
              aria-label="Sair"
              className="w-8 h-8 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 flex items-center justify-center active:scale-95 transition-transform"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
});
