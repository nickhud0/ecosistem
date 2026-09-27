import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  HardDrive,
  Printer,
  Radio,
  RefreshCw,
  Send,
  Server,
  Settings,
  Wifi,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  getHubConfig,
  getOutboxPendingCount,
  subscribeOutboxChanges,
} from "../../lib/db-local";
import { lanSyncClient, type ConnectionMode } from "../../lib/lan-sync-client";
import { printTestReceipt } from "../../lib/printer-58mm";
import { getOrCreateDeviceId, setCustomDeviceId } from "../../lib/sync-events";

interface PosSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PosSettingsModal({ isOpen, onClose }: PosSettingsModalProps) {
  const [hubAddress, setHubAddress] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [connMode, setConnMode] = useState<ConnectionMode>("OFFLINE");
  const [latencyMs, setLatencyMs] = useState(0);
  const [outboxCount, setOutboxCount] = useState(0);
  const [isTesting, setIsTesting] = useState(false);
  const [isDraining, setIsDraining] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    // Carrega configurações atuais
    getHubConfig().then((cfg) => {
      if (cfg.hubUrl) {
        setHubAddress(cfg.hubUrl);
      } else {
        setHubAddress("ws://192.168.1.100:8080/sync/ws");
      }
    });

    setDeviceId(getOrCreateDeviceId());

    const status = lanSyncClient.getStatus();
    setConnMode(status.mode);
    setLatencyMs(status.latencyMs);

    const unsubStatus = lanSyncClient.subscribeStatus((st) => {
      setConnMode(st.mode);
      setLatencyMs(st.latencyMs);
    });

    const unsubOutbox = subscribeOutboxChanges((count) => {
      setOutboxCount(count);
    });

    return () => {
      unsubStatus();
      unsubOutbox();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveHubAddress = () => {
    const trimmed = hubAddress.trim();
    if (!trimmed) {
      toast.error("Informe o IP ou endereço do Local Hub.");
      return;
    }

    lanSyncClient.setHubAddress(trimmed);
    toast.success("Endereço do Local Hub atualizado!");
  };

  const handleTestConnection = () => {
    setIsTesting(true);
    handleSaveHubAddress();
    lanSyncClient.connectHub();

    setTimeout(() => {
      setIsTesting(false);
      const st = lanSyncClient.getStatus();
      if (st.mode === "LAN_HUB") {
        toast.success(`Conectado ao Local Hub! Latência: ${st.latencyMs}ms`);
      } else if (st.mode === "CLOUD_4G") {
        toast.info("Hub local não respondeu, operando via 4G Nuvem.");
      } else {
        toast.warning("Não foi possível conectar ao Hub nem à Nuvem.");
      }
    }, 1200);
  };

  const handleSaveDeviceId = () => {
    if (!deviceId.trim()) {
      toast.error("Informe um identificador para o terminal.");
      return;
    }
    setCustomDeviceId(deviceId.trim());
    toast.success("Nome do terminal salvo!");
  };

  const handleDrainOutboxNow = async () => {
    setIsDraining(true);
    try {
      await lanSyncClient.drainOutbox();
      const remaining = await getOutboxPendingCount();
      setOutboxCount(remaining);
      if (remaining === 0) {
        toast.success("Todos os eventos da Outbox foram transmitidos com sucesso!");
      } else {
        toast.info(`${remaining} eventos pendentes para envio.`);
      }
    } catch {
      toast.error("Falha ao forçar transmissão.");
    } finally {
      setIsDraining(false);
    }
  };

  const handlePrintTest = () => {
    try {
      printTestReceipt(deviceId);
      toast.success("Comprovante de teste enviado para a impressora!");
    } catch {
      toast.error("Falha ao disparar impressão de teste.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-[#0f172a] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header do Modal */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">Configurações do Terminal</h2>
              <p className="text-[10px] text-slate-400">Rede Local (LAN), Hub e Impressão</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-100 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo com Scroll */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Status Atual da Conexão */}
          <div className="bg-slate-900/80 rounded-xl p-3 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block font-semibold">
                Estado Atual da Rede
              </span>
              <div className="flex items-center gap-2 mt-1">
                {connMode === "LAN_HUB" && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Conectado ao Local Hub (LAN {latencyMs}ms)
                  </span>
                )}
                {connMode === "CLOUD_4G" && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                    <Radio className="w-3 h-3 text-amber-400" />
                    Modo 4G Nuvem (Hub Inacessível)
                  </span>
                )}
                {connMode === "OFFLINE" && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    Offline (Gravando na Outbox)
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={handleTestConnection}
              disabled={isTesting}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? "animate-spin text-emerald-400" : ""}`} />
              Testar
            </button>
          </div>

          {/* Configuração de Endereço do Local Hub (Caixa) */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              Endereço do Local Hub (PDV Caixa)
            </label>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Informe o IP do computador do Caixa na rede Wi-Fi do restaurante (Porta padrão 8080).
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={hubAddress}
                onChange={(e) => setHubAddress(e.target.value)}
                placeholder="ws://192.168.1.100:8080/sync/ws"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={handleSaveHubAddress}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-xl transition-colors"
              >
                Salvar
              </button>
            </div>

            {/* Atalhos Rápidos de IP */}
            <div className="flex gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setHubAddress("ws://192.168.1.100:8080/sync/ws")}
                className="text-[10px] px-2 py-1 bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-colors font-mono"
              >
                IP 192.168.1.100
              </button>
              <button
                type="button"
                onClick={() => setHubAddress("ws://192.168.0.100:8080/sync/ws")}
                className="text-[10px] px-2 py-1 bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-colors font-mono"
              >
                IP 192.168.0.100
              </button>
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined" && window.location.hostname) {
                    setHubAddress(`ws://${window.location.hostname}:8080/sync/ws`);
                  }
                }}
                className="text-[10px] px-2 py-1 bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg transition-colors font-mono"
              >
                Detectar Host
              </button>
            </div>
          </div>

          {/* Identificação do Terminal POS */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <label className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-blue-400" />
              Identificador do Dispositivo (Device ID)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                placeholder="pos-garcon-01"
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleSaveDeviceId}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors"
              >
                Salvar
              </button>
            </div>
          </div>

          {/* Fila de Sincronização Local (Outbox) */}
          <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                <CloudOff className="w-3.5 h-3.5 text-amber-400" />
                Fila de Saída Local (Outbox)
              </span>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 font-bold border border-amber-500/20 font-mono">
                {outboxCount} pendentes
              </span>
            </div>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Mutações salvas no IndexedDB desta maquininha que aguardam transmissão ao Hub ou Nuvem.
            </p>
            <button
              onClick={handleDrainOutboxNow}
              disabled={isDraining || outboxCount === 0}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
            >
              <Send className={`w-3.5 h-3.5 ${isDraining ? "animate-spin text-amber-400" : ""}`} />
              Forçar Transmissão Agora
            </button>
          </div>

          {/* Impressora da Cozinha e da Maquininha */}
          <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-slate-200 font-bold">
              <Printer className="w-3.5 h-3.5 text-emerald-400" />
              Impressão no Ecossistema
            </div>

            <div className="space-y-1.5 text-[10px] text-slate-400 leading-relaxed">
              <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800/80">
                <span className="text-emerald-400 font-bold block mb-0.5">🍳 Impressora de Produção (Cozinha por IP):</span>
                Ao despachar pedidos na mesa, os itens são transmitidos via LAN para o Local Hub (PDV Caixa), que imprime automaticamente na impressora térmica da cozinha pelo IP configurado no Caixa (TCP 9100).
              </div>

              <div className="p-2 bg-slate-950/60 rounded-lg border border-slate-800/80">
                <span className="text-blue-400 font-bold block mb-0.5">🧾 Impressora Integrada da Maquininha (58mm):</span>
                Utilizada para emitir o comprovante de pagamento ao cliente no momento do checkout na mesa.
              </div>
            </div>

            <button
              onClick={handlePrintTest}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <Printer className="w-3.5 h-3.5 text-slate-300" />
              Imprimir Teste na Bobina 58mm da Maquininha
            </button>
          </div>
        </div>

        {/* Rodapé do Modal */}
        <div className="p-3 bg-slate-900 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl transition-colors text-xs"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
