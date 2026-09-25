import { useState } from "react";
import {
  Bike,
  Check,
  ChevronRight,
  Clock,
  Eye,
  History,
  Kanban,
  MapPin,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pos/app-shell";
import { usePos } from "@/lib/pos-store";
import { useCouriers } from "@/hooks/useCouriers";
import { brl, elapsed } from "@/lib/pos-format";
import { SOURCE_META, STAGE_LABELS, type DeliveryOrder, type DeliveryStage } from "@/lib/pos-types";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NewDeliveryDialog } from "./new-delivery-dialog";
import { DeliveryDetailsDialog } from "./delivery-details-dialog";

const stages: DeliveryStage[] = ["novos", "preparo", "prontos", "entrega"];
const next: Record<DeliveryStage, DeliveryStage | null> = {
  novos: "preparo",
  preparo: "prontos",
  prontos: "entrega",
  entrega: null,
  concluido: null,
};

const STAGE_CONFIG: Record<
  DeliveryStage,
  { label: string; accentBorder: string; badgeBg: string; textAccent: string }
> = {
  novos: {
    label: "Novos Pedidos",
    accentBorder: "border-t-4 border-amber-500",
    badgeBg: "bg-amber-500/20 text-amber-500",
    textAccent: "text-amber-500",
  },
  preparo: {
    label: "Em Preparo",
    accentBorder: "border-t-4 border-brand",
    badgeBg: "bg-brand/20 text-brand",
    textAccent: "text-brand",
  },
  prontos: {
    label: "Prontos p/ Retirada",
    accentBorder: "border-t-4 border-cyan",
    badgeBg: "bg-cyan/20 text-cyan",
    textAccent: "text-cyan",
  },
  entrega: {
    label: "Saiu p/ Entrega",
    accentBorder: "border-t-4 border-free",
    badgeBg: "bg-free/20 text-free",
    textAccent: "text-free",
  },
  concluido: {
    label: "Concluído",
    accentBorder: "border-t-4 border-muted-foreground",
    badgeBg: "bg-muted text-muted-foreground",
    textAccent: "text-muted-foreground",
  },
};

export function DeliveryPage() {
  const pos = usePos();
  const { activeCouriers } = useCouriers();
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [syncingIfood, setSyncingIfood] = useState(false);
  const [viewMode, setViewMode] = useState<"kanban" | "history">("kanban");

  // Mantém o pedido selecionado atualizado se o estado do store mudar
  const currentSelectedOrder = selectedOrder
    ? (pos.delivery.find((o) => o.id === selectedOrder.id) ??
       pos.deliveryHistory.find((o) => o.id === selectedOrder.id) ??
       selectedOrder)
    : null;

  return (
    <AppShell title="Delivery Omnichannel" subtitle="iFood · WhatsApp · Telefone">
      <div className="flex h-full flex-col gap-4">
        {/* Barra superior de ações e status organizada e espaçosa */}
        <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-surface/90 p-3 shadow-xs lg:flex-row lg:items-center lg:justify-between">
          {/* Lado Esquerdo: Seletor de visualização + status dos canais */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Alternador de Modo: Kanban Ativo vs Histórico */}
            <div className="flex items-center rounded-xl border border-border/60 bg-secondary/80 p-1">
              <button
                type="button"
                onClick={() => setViewMode("kanban")}
                className={cn(
                  "tap flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all",
                  viewMode === "kanban"
                    ? "bg-brand text-brand-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Kanban className="size-3.5" />
                Painel Ativo
                <span
                  className={cn(
                    "ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-black",
                    viewMode === "kanban"
                      ? "bg-brand-foreground/20 text-brand-foreground"
                      : "bg-surface text-foreground",
                  )}
                >
                  {pos.delivery.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("history")}
                className={cn(
                  "tap flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all",
                  viewMode === "history"
                    ? "bg-brand text-brand-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <History className="size-3.5" />
                Histórico
                <span
                  className={cn(
                    "ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-black",
                    viewMode === "history"
                      ? "bg-brand-foreground/20 text-brand-foreground"
                      : "bg-surface text-foreground",
                  )}
                >
                  {pos.deliveryHistory.length}
                </span>
              </button>
            </div>

            <div className="hidden sm:block h-6 w-px bg-border/60" />

            {/* iFood Status Badge */}
            <span
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border",
                pos.ifoodPaused
                  ? "bg-wait/15 text-wait border-wait/30"
                  : "bg-free/15 text-free border-free/30",
              )}
            >
              <span
                className={cn(
                  "size-2 rounded-full",
                  pos.ifoodPaused ? "bg-wait animate-pulse" : "bg-free",
                )}
              />
              {pos.ifoodPaused ? "iFood Pausado" : "iFood Operando"}
            </span>

            {pos.ifoodConfig?.enabled && (
              <span
                className={cn(
                  "hidden md:flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors",
                  pos.ifoodPollingStatus === "polling" && "bg-brand/15 text-brand border-brand/30",
                  pos.ifoodPollingStatus === "error" && "bg-busy/15 text-busy border-busy/30",
                  pos.ifoodPollingStatus === "idle" && "bg-secondary text-muted-foreground border-border",
                )}
                title={pos.ifoodLastPollMessage || undefined}
              >
                <span
                  className={cn(
                    "size-2 rounded-full",
                    pos.ifoodPollingStatus === "polling" && "bg-brand animate-ping",
                    pos.ifoodPollingStatus === "error" && "bg-busy",
                    pos.ifoodPollingStatus === "idle" && "bg-free",
                  )}
                />
                {pos.ifoodPollingStatus === "polling"
                  ? "Sincronizando..."
                  : pos.ifoodPollingStatus === "error"
                  ? "Aviso Conexão"
                  : "iFood Conectado"}
              </span>
            )}

            {pos.kitchenPrinterConfig.enabled && (
              <span className="hidden xl:flex items-center gap-1.5 rounded-full bg-secondary/80 border border-border/60 px-3 py-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full bg-cyan" />
                Impressão: {pos.kitchenPrinterConfig.ip || "Esc/Pos"}
              </span>
            )}
          </div>

          {/* Lado Direito: Ações rápidas */}
          <div className="flex flex-wrap items-center gap-2">
            {pos.ifoodConfig?.enabled && (
              <button
                type="button"
                disabled={syncingIfood || pos.ifoodPollingStatus === "polling"}
                onClick={async () => {
                  try {
                    setSyncingIfood(true);
                    const result = await pos.pollIfoodNow();
                    if (result.eventsCount > 0) {
                      toast.success(`${result.eventsCount} evento(s) do iFood processado(s)!`);
                    } else if (result.success) {
                      toast.info(result.message || "Fila de pedidos do iFood consultada. Nenhum pedido pendente.");
                    } else {
                      toast.error(result.message || "Falha ao sincronizar com iFood");
                    }
                  } catch (e: any) {
                    toast.error("Erro ao sincronizar com iFood: " + (e?.message || e));
                  } finally {
                    setSyncingIfood(false);
                  }
                }}
                className="tap flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
                title="Consultar fila de eventos e novos pedidos do iFood agora"
              >
                <RefreshCw className={cn("size-3.5 text-brand", syncingIfood && "animate-spin")} />
                <span className="hidden sm:inline">Sincronizar</span>
              </button>
            )}

            <button
              type="button"
              disabled={simulating}
              onClick={async () => {
                try {
                  setSimulating(true);
                  const o = await pos.simulateIfoodIncomingOrder();
                  toast.success(`Pedido simulado #${o.code} recebido!`);
                } catch (e) {
                  toast.error("Erro ao simular pedido");
                } finally {
                  setSimulating(false);
                }
              }}
              className="tap flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title="Simular recebimento em tempo real de um pedido iFood para testes"
            >
              <Sparkles className="size-3.5 text-brand" />
              <span className="hidden sm:inline">Simular iFood</span>
            </button>

            <button
              type="button"
              onClick={() => {
                pos.toggleIfood();
                toast(pos.ifoodPaused ? "iFood reativado" : "iFood pausado");
              }}
              className={cn(
                "tap flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold border transition-all",
                pos.ifoodPaused
                  ? "bg-free/15 text-free border-free/30 hover:bg-free/25"
                  : "bg-wait/15 text-wait border-wait/30 hover:bg-wait/25",
              )}
            >
              {pos.ifoodPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
              {pos.ifoodPaused ? "Reativar" : "Pausar"}
            </button>

            <button
              type="button"
              onClick={() => setNewOrderOpen(true)}
              className="tap flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-xs font-bold text-brand-foreground shadow-sm transition-all hover:brightness-110"
            >
              <Plus className="size-4 stroke-[3]" />
              Novo Pedido
            </button>
          </div>
        </div>

        {/* Quadro Kanban de Pedidos ou Histórico do Turno */}
        {viewMode === "kanban" ? (
          <div className="flex-1 min-h-0 overflow-x-auto pb-2">
            <div className="grid h-full grid-cols-4 gap-4 min-w-[1100px]">
              {stages.map((stage) => {
                const orders = pos.delivery.filter((o) => o.stage === stage);
                const config = STAGE_CONFIG[stage];
                return (
                  <section
                    key={stage}
                    className={cn(
                      "flex h-full min-h-0 flex-col rounded-2xl bg-surface/90 border border-border/80 p-3.5 shadow-xs",
                      config.accentBorder,
                    )}
                  >
                    {/* Cabeçalho da Coluna */}
                    <div className="mb-3 flex items-center justify-between pb-2 border-b border-border/50">
                      <h2 className="font-display text-sm font-bold text-foreground">
                        {config.label}
                      </h2>
                      <span
                        className={cn(
                          "grid size-6 place-items-center rounded-full text-xs font-black",
                          orders.length > 0 ? config.badgeBg : "bg-secondary text-muted-foreground",
                        )}
                      >
                        {orders.length}
                      </span>
                    </div>

                    {/* Lista de Pedidos com Scroll Suave */}
                    <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                      {orders.map((o) => {
                        const source = SOURCE_META[o.source];
                        const n = next[o.stage];
                        return (
                          <article
                            key={o.id}
                            className="rounded-xl border border-border/80 bg-background/95 p-3.5 shadow-xs transition-all hover:border-brand/40 hover:shadow-md"
                          >
                            {/* Linha Superior: Origem + Código + Botão Ver Detalhes */}
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={cn(
                                  "flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                                  source.badge,
                                )}
                              >
                                <i className={cn("size-2 rounded-full", source.dot)} />
                                {source.label}
                              </span>

                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs font-bold text-foreground">{o.code}</span>
                                <button
                                  type="button"
                                  onClick={() => setSelectedOrder(o)}
                                  className="tap grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                                  title="Ver detalhes completos"
                                >
                                  <Eye className="size-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Cliente e Endereço */}
                            <div className="mt-2.5">
                              <h3 className="text-base font-bold text-foreground truncate" title={o.customer}>
                                {o.customer}
                              </h3>
                              <p className="flex items-center gap-1 mt-0.5 text-xs text-foreground/75 truncate">
                                <MapPin className="size-3 shrink-0 text-brand" />
                                <span className="truncate font-medium">{o.bairro || "Retirada no balcão"}</span>
                              </p>
                            </div>

                            {/* Resumo Rápido dos Itens */}
                            <div
                              onClick={() => setSelectedOrder(o)}
                              className="mt-2.5 cursor-pointer rounded-xl border border-border/70 bg-secondary/60 p-2.5 text-xs transition-colors hover:bg-secondary/90 shadow-2xs"
                              title="Clique para ver os detalhes completos"
                            >
                              {o.items && o.items.length > 0 ? (
                                <div className="space-y-1.5">
                                  {o.items.slice(0, 3).map((item, idx) => {
                                    const itemPrice =
                                      item.unitPrice ??
                                      (item as unknown as { price?: number }).price ??
                                      0;
                                    return (
                                      <div
                                        key={idx}
                                        className="flex justify-between items-center text-xs"
                                      >
                                        <span className="truncate pr-1 text-foreground/90 font-medium">
                                          <span className="inline-block rounded-md bg-foreground/10 px-1 py-0.2 text-[11px] font-bold text-foreground mr-1.5">
                                            {item.qty}x
                                          </span>
                                          <span className="font-semibold text-foreground">{item.name}</span>
                                        </span>
                                        <span className="num font-bold text-foreground/90 shrink-0 text-xs">
                                          {brl(itemPrice * item.qty)}
                                        </span>
                                      </div>
                                    );
                                  })}
                                  {o.items.length > 3 && (
                                    <p className="text-xs text-brand font-semibold pt-0.5">
                                      + {o.items.length - 3} outro(s) item(ns)...
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <p className="text-muted-foreground text-xs font-medium">Ver detalhes do pedido</p>
                              )}
                            </div>

                            {/* Alerta SLA iFood se > 3 min na fila novos */}
                            {o.stage === "novos" && pos.now - o.createdAt > 3 * 60 * 1000 && (
                              <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-busy/15 px-2.5 py-1 text-xs font-bold text-busy border border-busy/30 animate-pulse">
                                <Clock className="size-3.5 shrink-0" />
                                <span>Alerta SLA iFood (&gt;3 min)</span>
                              </div>
                            )}

                            {/* Tempo Decorrido e Valor Total */}
                            <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2.5">
                              <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                                <Clock className="size-3.5 text-muted-foreground" />
                                {elapsed(o.createdAt, pos.now)}
                              </span>
                              <div className="text-right">
                                <span className="text-[10px] font-semibold text-muted-foreground uppercase mr-1.5">Total:</span>
                                <span className="num text-base font-black text-emerald-600 dark:text-emerald-400">
                                  {brl(o.total)}
                                </span>
                              </div>
                            </div>

                            {/* Ações por Estágio */}
                            {o.stage === "novos" ? (
                              <div className="mt-3 flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedOrder(o)}
                                  className="tap flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-destructive/30 text-destructive transition-colors hover:bg-destructive/10"
                                  title="Recusar pedido"
                                >
                                  <XCircle className="size-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await pos.acceptDelivery(o.id);
                                    toast.success("Pedido aceito e enviado à cozinha");
                                  }}
                                  className="tap flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand text-xs font-bold text-brand-foreground shadow-sm transition-all hover:brightness-110"
                                >
                                  Aceitar Pedido
                                  <ChevronRight className="size-4" />
                                </button>
                              </div>
                            ) : null}

                            {n && o.stage !== "novos" ? (
                              <button
                                type="button"
                                onClick={() => pos.moveDelivery(o.id, n)}
                                className="tap mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-brand/15 text-xs font-bold text-brand border border-brand/30 transition-all hover:bg-brand/25"
                              >
                                {o.stage === "preparo" && "Pronto p/ Retirada"}
                                {o.stage === "prontos" && "Despachar Entrega"}
                                <ChevronRight className="size-4" />
                              </button>
                            ) : null}

                            {o.stage === "entrega" ? (
                              <div className="mt-3 space-y-2">
                                <div>
                                  <Select
                                    value={o.courier || "unassigned"}
                                    onValueChange={(val) =>
                                      pos.assignCourier(o.id, val === "unassigned" ? "" : val)
                                    }
                                  >
                                    <SelectTrigger className="h-9 rounded-xl bg-secondary/80 border-border/60 text-xs">
                                      <div className="flex items-center gap-1.5 truncate">
                                        <Bike className="size-3.5 shrink-0 text-muted-foreground" />
                                        <SelectValue placeholder="Selecionar motoboy…" />
                                      </div>
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="unassigned">Selecionar motoboy…</SelectItem>
                                      {activeCouriers.map((c) => (
                                        <SelectItem key={c.id} value={c.name}>
                                          {c.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {activeCouriers.length === 0 && (
                                    <p className="mt-1 text-[10px] text-wait">
                                      Nenhum motoboy ativo. Cadastre em Configurações.
                                    </p>
                                  )}
                                  {o.courier ? (
                                    <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-cyan">
                                      <Bike className="size-3" />
                                      {o.courier} em rota
                                    </p>
                                  ) : null}
                                </div>

                                <button
                                  type="button"
                                  onClick={async () => {
                                    await pos.finishDeliveryOrder(o.id);
                                    toast.success(`Pedido #${o.code} concluído com sucesso!`);
                                  }}
                                  className="tap flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-free text-xs font-bold text-free-foreground shadow-sm transition-all hover:brightness-110"
                                >
                                  <Check className="size-4" />
                                  Concluir Entrega
                                </button>
                              </div>
                            ) : null}
                          </article>
                        );
                      })}
                      {!orders.length && (
                        <div className="flex h-36 flex-col items-center justify-center rounded-xl border border-dashed border-border/60 text-muted-foreground/60">
                          <p className="text-xs font-medium">Nenhum pedido</p>
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        ) : (
          /* Histórico de Entregas do Turno */
          <div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-surface/90 border border-border/80 p-5 space-y-4 overflow-hidden shadow-xs">
            {/* Header com Resumo Estatístico */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-4">
              <div>
                <h2 className="font-display text-lg font-bold text-foreground">Histórico de Entregas do Turno</h2>
                <p className="text-xs text-muted-foreground">
                  Entregas finalizadas e canceladas hoje ({pos.deliveryHistory.length} registros)
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 rounded-xl bg-secondary/80 border border-border/60 px-3.5 py-2">
                  <span className="size-2.5 rounded-full bg-free" />
                  <div className="text-xs">
                    <span className="text-muted-foreground">Concluídas: </span>
                    <b className="text-foreground">{pos.deliveryHistory.filter((d) => !d.cancelled).length}</b>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-xl bg-secondary/80 border border-border/60 px-3.5 py-2">
                  <span className="size-2.5 rounded-full bg-destructive" />
                  <div className="text-xs">
                    <span className="text-muted-foreground">Canceladas: </span>
                    <b className="text-foreground">{pos.deliveryHistory.filter((d) => d.cancelled).length}</b>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-xl bg-brand/10 border border-brand/20 px-3.5 py-2">
                  <div className="text-xs">
                    <span className="text-brand font-medium">Faturamento: </span>
                    <b className="text-brand font-bold">
                      {brl(pos.deliveryHistory.filter((d) => !d.cancelled).reduce((s, d) => s + d.total, 0))}
                    </b>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {pos.deliveryHistory.length === 0 ? (
                <div className="py-20 text-center text-muted-foreground">
                  <p className="font-semibold text-sm">Nenhuma entrega finalizada ou cancelada neste turno.</p>
                  <p className="text-xs mt-1">Conforme os pedidos forem concluídos no painel ativo, eles aparecerão aqui.</p>
                </div>
              ) : (
                pos.deliveryHistory.map((item) => {
                  const src = SOURCE_META[item.source];
                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "flex flex-wrap items-center justify-between gap-3 rounded-xl p-3.5 transition-all hover:bg-secondary/40 border",
                        item.cancelled
                          ? "bg-destructive/5 border-destructive/20"
                          : "bg-background/80 border-border/80"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                            src.badge,
                          )}
                        >
                          <i className={cn("size-2 rounded-full", src.dot)} />
                          {src.label}
                        </span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-foreground">{item.code}</span>
                            <span className="text-sm font-semibold text-foreground">{item.customer}</span>
                            {item.cancelled ? (
                              <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-bold text-destructive">
                                Cancelado
                              </span>
                            ) : (
                              <span className="rounded-full bg-free/15 px-2 py-0.5 text-[10px] font-bold text-free">
                                Concluído
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.bairro} {item.address ? `· ${item.address}` : ""}
                            {item.courier ? ` · Motoboy: ${item.courier}` : ""}
                            {item.cancelReason ? ` · Motivo: ${item.cancelReason}` : ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="block num font-black text-base text-emerald-600 dark:text-emerald-400">
                            {brl(item.total)}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {new Date(item.createdAt).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })} · {item.paymentMethod || "iFood"}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedOrder(item)}
                          className="tap flex h-9 items-center gap-1.5 rounded-xl bg-secondary px-3 text-xs font-semibold text-foreground border border-border transition-colors hover:bg-secondary/80"
                        >
                          <Eye className="size-3.5" />
                          Detalhes
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal de Criação de Pedido Manual (WhatsApp / Telefone) */}
      <NewDeliveryDialog open={newOrderOpen} onOpenChange={setNewOrderOpen} />

      {/* Modal de Detalhes e Ações do Pedido */}
      <DeliveryDetailsDialog
        order={currentSelectedOrder}
        open={Boolean(selectedOrder)}
        onOpenChange={(open) => {
          if (!open) setSelectedOrder(null);
        }}
      />
    </AppShell>
  );
}
