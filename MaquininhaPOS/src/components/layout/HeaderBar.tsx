import React, { useEffect, useState } from "react";
import { CloudOff, LogOut, Radio, RefreshCw, Wifi } from "lucide-react";
import { subscribeOutboxChanges } from "../../lib/db-local";
import { lanSyncClient, type ConnectionMode } from "../../lib/lan-sync-client";
import type { UserWaiter } from "../../lib/types";

interface HeaderBarProps {
  waiter: UserWaiter | null;
  isRealtimeActive: boolean;
  isLoading: boolean;
  onRefresh: () => void;
  onLogout: () => void;
  onOpenSettings?: () => void;
  occupiedCount: number;
  totalTables: number;
}

export const HeaderBar = React.memo(function HeaderBar({
  waiter,
  isRealtimeActive,
  isLoading,
  onRefresh,
  onLogout,
  onOpenSettings,
  occupiedCount,
  totalTables,
}: HeaderBarProps) {
  const [outboxCount, setOutboxCount] = useState(0);
  const [connStatus, setConnStatus] = useState<{ mode: ConnectionMode; latencyMs: number }>({
    mode: "OFFLINE",
    latencyMs: 0,
  });

  useEffect(() => {
    const unsubOutbox = subscribeOutboxChanges((count) => {
      setOutboxCount(count);
    });

    const unsubConn = lanSyncClient.subscribeStatus((st) => {
      setConnStatus({ mode: st.mode, latencyMs: st.latencyMs });
    });

    return () => {
      unsubOutbox();
      unsubConn();
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 bg-[#0c1220] border-b border-slate-800 px-3.5 py-2.5 flex items-center justify-between hardware-accelerated">
      {/* Lado Esquerdo: Identificação e Status da Conexão */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-emerald-500 text-slate-950 font-black flex items-center justify-center text-sm shadow-sm flex-shrink-0">
          ⚡
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold text-slate-100 tracking-tight">Fluxo POS</span>

            {/* Status Triplo: LAN Hub | 4G Cloud | Offline (Clicável para abrir configurações de rede) */}
            <button
              onClick={onOpenSettings}
              title="Clique para configurar o IP do Local Hub"
              className="inline-flex items-center cursor-pointer transition-transform active:scale-95"
            >
              {connStatus.mode === "LAN_HUB" && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  LAN Hub ({connStatus.latencyMs}ms)
                </span>
              )}
              {connStatus.mode === "CLOUD_4G" && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  <Radio className="w-2.5 h-2.5 text-amber-400" />
                  4G Nuvem
                </span>
              )}
              {connStatus.mode === "OFFLINE" && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                  Offline
                </span>
              )}
            </button>

            {/* Badge de Outbox Pendente (Clicável para forçar drenagem) */}
            {outboxCount > 0 && (
              <button
                onClick={onOpenSettings}
                title="Clique para ver eventos pendentes"
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse cursor-pointer"
              >
                <CloudOff className="w-2.5 h-2.5" />
                <span>{outboxCount} outbox</span>
              </button>
            )}
          </div>
          <p className="text-[10px] text-slate-400 leading-tight">
            {occupiedCount}/{totalTables} ocupadas
          </p>
        </div>
      </div>

      {/* Lado Direito: Garçom Logado, Configurações e Ações */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={onRefresh}
          disabled={isLoading}
          aria-label="Atualizar dados"
          className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center active:scale-95 transition-transform"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-emerald-400" : ""}`} />
        </button>

        {/* Botão de Configurações do Terminal */}
        <button
          onClick={onOpenSettings}
          title="Configurações do Terminal e IP do Hub"
          aria-label="Configurações"
          className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center active:scale-95 transition-transform"
        >
          <Settings className="w-3.5 h-3.5" />
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
