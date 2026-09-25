import { useState } from "react";
import {
  AlertTriangle,
  Bike,
  Check,
  ChevronRight,
  Clock,
  ExternalLink,
  MapPin,
  MessageSquare,
  Phone,
  Printer,
  ShoppingBag,
  User,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePos } from "@/lib/pos-store";
import { useCouriers } from "@/hooks/useCouriers";
import { brl, elapsed } from "@/lib/pos-format";
import { IFOOD_CANCELLATION_REASONS, printDeliveryTicket } from "@/lib/ifood-service";
import { SOURCE_META, STAGE_LABELS, type DeliveryOrder, type DeliveryStage } from "@/lib/pos-types";
import { cn } from "@/lib/utils";

const nextStageMap: Record<DeliveryStage, DeliveryStage | null> = {
  novos: "preparo",
  preparo: "prontos",
  prontos: "entrega",
  entrega: "concluido",
  concluido: null,
};

export function DeliveryDetailsDialog({
  order,
  open,
  onOpenChange,
}: {
  order: DeliveryOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pos = usePos();
  const { activeCouriers } = useCouriers();
  const [printing, setPrinting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [selectedReasonCode, setSelectedReasonCode] = useState("502");
  const [cancelCustomReason, setCancelCustomReason] = useState("");

  if (!order) return null;

  const source = SOURCE_META[order.source];
  const nextStage = nextStageMap[order.stage];

  const handlePrint = async () => {
    try {
      setPrinting(true);
      await printDeliveryTicket(order, pos.kitchenPrinterConfig);
      toast.success("Comanda de delivery impressa com sucesso");
    } catch (err) {
      console.error("[DeliveryDetailsDialog Print Error]:", err);
      toast.error("Erro ao imprimir comanda de delivery");
    } finally {
      setPrinting(false);
    }
  };

  const handleAdvance = async () => {
    if (order.stage === "novos") {
      await pos.acceptDelivery(order.id);
      toast.success("Pedido aceito e enviado para preparo!");
    } else if (order.stage === "entrega") {
      await pos.finishDeliveryOrder(order.id);
      toast.success(`Pedido #${order.code} concluído com sucesso!`);
      onOpenChange(false);
    } else if (nextStage) {
      await pos.moveDelivery(order.id, nextStage);
      toast.success(`Pedido avançado para ${STAGE_LABELS[nextStage]}!`);
    }
  };

  const phoneDigits = order.phone ? order.phone.replace(/\D/g, "") : "";
  const waUrl = phoneDigits ? `https://wa.me/55${phoneDigits}` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto border-border bg-popover/98 p-6 sm:p-7 shadow-2xl">
        <DialogHeader className="border-b border-border/60 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold shadow-xs",
                  source.badge,
                )}
              >
                <i className={cn("size-2 rounded-full", source.dot)} />
                {source.label}
              </span>
              <DialogTitle className="font-display text-2xl font-bold tracking-tight text-foreground">
                Pedido {order.code}
              </DialogTitle>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-bold ring-1",
                  order.stage === "novos" && "bg-wait/15 text-wait ring-wait/30",
                  order.stage === "preparo" && "bg-brand/15 text-brand ring-brand/30",
                  order.stage === "prontos" && "bg-cyan/15 text-cyan ring-cyan/30",
                  order.stage === "entrega" && "bg-free/15 text-free ring-free/30",
                  order.stage === "concluido" && "bg-secondary text-muted-foreground ring-border",
                )}
              >
                {STAGE_LABELS[order.stage]}
              </span>
              <span className="flex items-center gap-1 rounded-full bg-secondary/80 px-2.5 py-1 text-xs text-muted-foreground">
                <Clock className="size-3.5 text-muted-foreground" />
                {elapsed(order.createdAt, pos.now)}
              </span>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {order.cancelled && (
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive">
              <div className="flex items-center gap-2 text-sm font-bold">
                <XCircle className="size-5 shrink-0" />
                PEDIDO CANCELADO
              </div>
              {order.cancelReason && (
                <p className="mt-1.5 font-medium text-foreground/90">
                  Motivo informado: <span className="font-semibold text-destructive">{order.cancelReason}</span>
                </p>
              )}
            </div>
          )}

          {/* Grid de 2 Colunas: Cliente & Entrega vs Expedição & Pagamento */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Card 1: Cliente e Endereço */}
            <div className="rounded-2xl bg-surface/60 border border-border/60 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-border/40 pb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <User className="size-3.5 text-brand" />
                  Cliente & Entrega
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(order.createdAt).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              <div>
                <h3 className="font-extrabold text-lg text-foreground leading-tight">{order.customer}</h3>
                {order.phone && (
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                      <Phone className="size-3.5 text-cyan" />
                      {order.phone}
                    </span>
                    {waUrl && (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="tap inline-flex items-center gap-1 rounded-lg bg-whats/15 px-2.5 py-1 text-xs font-bold text-whats hover:bg-whats/25 transition-colors"
                      >
                        <MessageSquare className="size-3.5" />
                        Conversar no WhatsApp
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-secondary/60 border border-border/50 p-3 text-xs space-y-1">
                <div className="flex items-start gap-2">
                  <MapPin className="size-4 shrink-0 text-brand mt-0.5" />
                  <div>
                    <p className="font-bold text-sm text-foreground">
                      {order.address || "Endereço não informado"}
                    </p>
                    <p className="text-xs text-foreground/80 font-medium mt-0.5">
                      Bairro: <span className="text-foreground font-bold">{order.bairro}</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Expedição e Pagamento */}
            <div className="rounded-2xl bg-surface/60 border border-border/60 p-4 space-y-3">
              <div className="border-b border-border/40 pb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Bike className="size-3.5 text-cyan" />
                  Expedição & Pagamento
                </span>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                  Motoboy Responsável
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Select
                      value={order.courier || "unassigned"}
                      onValueChange={(val) =>
                        pos.assignCourier(order.id, val === "unassigned" ? "" : val)
                      }
                    >
                      <SelectTrigger className="h-10 rounded-xl bg-secondary/80 border-border/60 text-xs font-medium">
                        <div className="flex items-center gap-2 truncate">
                          <Bike className="size-4 shrink-0 text-muted-foreground" />
                          <SelectValue placeholder="Selecione o motoboy…" />
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Não atribuído…</SelectItem>
                        {activeCouriers.map((c) => (
                          <SelectItem key={c.id} value={c.name}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {order.courier && (
                    <span className="flex items-center gap-1 rounded-xl bg-cyan/15 px-2.5 py-2 text-xs font-bold text-cyan shrink-0">
                      <Bike className="size-3.5" />
                      Em rota
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-xl bg-secondary/60 border border-border/50 p-2.5 text-xs space-y-1">
                <span className="text-[11px] font-semibold uppercase text-muted-foreground block">
                  Forma de Pagamento
                </span>
                <p className="font-extrabold text-base text-foreground">
                  {order.paymentMethod || "Não informado"}
                </p>
              </div>

              {order.notes && (
                <div className="rounded-xl bg-amber-500/15 border border-amber-500/30 p-3 text-xs">
                  <span className="text-[11px] font-bold uppercase text-amber-500 dark:text-amber-400 block mb-1">
                    Observação do Pedido
                  </span>
                  <p className="text-sm font-semibold text-foreground">{order.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Itens do Pedido */}
          <div className="rounded-2xl bg-surface/80 border border-border/80 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border/50 pb-2.5">
              <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <ShoppingBag className="size-4 text-brand" />
                Itens do Pedido ({order.items?.length || 0})
              </h4>
            </div>

            <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
              {order.items && order.items.length > 0 ? (
                order.items.map((item, idx) => {
                  const itemPrice =
                    item.unitPrice ?? (item as unknown as { price?: number }).price ?? 0;
                  return (
                    <div
                      key={item.id || idx}
                      className="rounded-xl bg-secondary/65 p-3.5 border border-border/60 transition-colors hover:bg-secondary/80"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="grid size-7 place-items-center rounded-lg bg-surface font-extrabold text-sm text-foreground border border-border/80 shadow-xs">
                            {item.qty}x
                          </span>
                          <span className="text-base font-bold text-foreground">
                            {item.name}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="num font-extrabold text-base text-foreground">
                            {brl(itemPrice * item.qty)}
                          </span>
                          {item.qty > 1 && (
                            <span className="block text-xs text-muted-foreground font-medium">
                              {brl(itemPrice)} un.
                            </span>
                          )}
                        </div>
                      </div>
                      {item.details && item.details.length > 0 && (
                        <div className="mt-2.5 space-y-1 rounded-lg bg-surface/85 p-2.5 border border-border/50">
                          {item.details.map((detail, dIdx) => (
                            <p key={dIdx} className="text-xs font-semibold text-foreground/90">
                              • {detail}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Sem itens discriminados
                </p>
              )}
            </div>

            {/* Totalizador */}
            <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 dark:bg-emerald-950/30 border border-emerald-500/25 p-4 mt-3">
              <div>
                <span className="text-xs text-muted-foreground block font-semibold uppercase tracking-wider">
                  Valor Total da Entrega
                </span>
                <span className="text-xs font-medium text-foreground/80">
                  {order.paymentMethod || "Pagamento registrado"}
                </span>
              </div>
              <span className="num text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400">
                {brl(order.total)}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-border/60 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handlePrint}
              disabled={printing}
              className="tap h-11 gap-2 rounded-xl text-xs font-semibold px-4"
            >
              <Printer className="size-4" />
              {printing ? "Imprimindo…" : "Imprimir Comanda"}
            </Button>

            {!order.cancelled && order.stage !== "concluido" && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCancelConfirm(true)}
                className="tap h-11 gap-1.5 rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive text-xs font-semibold px-4"
              >
                <XCircle className="size-4" />
                {order.stage === "novos" ? "Recusar Pedido" : "Cancelar Pedido"}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-11 rounded-xl text-xs font-semibold px-4"
            >
              Fechar
            </Button>
            {!order.cancelled && order.stage === "novos" && (
              <Button
                type="button"
                onClick={handleAdvance}
                className="tap h-11 rounded-xl bg-brand px-6 text-sm font-bold text-brand-foreground shadow hover:brightness-110 gap-2"
              >
                Aceitar Pedido
                <ChevronRight className="size-4" />
              </Button>
            )}
            {!order.cancelled && (order.stage === "preparo" || order.stage === "prontos") && (
              <Button
                type="button"
                onClick={handleAdvance}
                className="tap h-11 rounded-xl bg-brand px-6 text-sm font-bold text-brand-foreground shadow hover:brightness-110 gap-2"
              >
                Avançar para {STAGE_LABELS[nextStage!]}
                <ChevronRight className="size-4" />
              </Button>
            )}
            {!order.cancelled && order.stage === "entrega" && (
              <Button
                type="button"
                onClick={handleAdvance}
                className="tap h-11 rounded-xl bg-free px-6 text-sm font-bold text-free-foreground shadow hover:brightness-110 gap-2"
              >
                <Check className="size-4" />
                Concluir Entrega
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Diálogo de confirmação de Cancelamento / Recusa */}
      <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <DialogContent className="max-w-md border-border bg-popover/98 p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-destructive">
              <AlertTriangle className="size-5 shrink-0" />
              {order.stage === "novos" ? "Recusar Pedido" : "Cancelar Pedido"} {order.code}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3.5 py-2 text-xs">
            <p className="text-muted-foreground leading-relaxed">
              {order.source === "ifood"
                ? "Selecione o motivo oficial que será transmitido à Merchant API do iFood e registrado no cancelamento:"
                : "Selecione ou informe o motivo do cancelamento deste pedido no sistema:"}
            </p>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase text-muted-foreground">
                Motivo do cancelamento
              </label>
              <Select
                value={selectedReasonCode}
                onValueChange={(val) => {
                  setSelectedReasonCode(val);
                  const found = IFOOD_CANCELLATION_REASONS.find((r) => r.code === val);
                  if (found) setCancelCustomReason(found.description);
                }}
              >
                <SelectTrigger className="h-10 rounded-xl bg-secondary/80">
                  <SelectValue placeholder="Selecione o motivo..." />
                </SelectTrigger>
                <SelectContent>
                  {IFOOD_CANCELLATION_REASONS.map((r) => (
                    <SelectItem key={r.code} value={r.code}>
                      {r.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase text-muted-foreground">
                Detalhes adicionais (opcional)
              </label>
              <input
                type="text"
                value={cancelCustomReason}
                onChange={(e) => setCancelCustomReason(e.target.value)}
                placeholder="Ex: Item esgotado ou problema na cozinha..."
                className="h-10 w-full rounded-xl bg-secondary/80 px-3 text-xs outline-none ring-1 ring-border focus:ring-brand"
              />
            </div>
          </div>
          <DialogFooter className="mt-2 flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCancelConfirm(false)}
              className="rounded-xl"
            >
              Voltar
            </Button>
            <Button
              type="button"
              disabled={cancelling}
              onClick={async () => {
                try {
                  setCancelling(true);
                  const reasonObj = IFOOD_CANCELLATION_REASONS.find(
                    (r) => r.code === selectedReasonCode,
                  );
                  const finalReason =
                    cancelCustomReason || reasonObj?.description || "Cancelado pelo estabelecimento";
                  const ok = await pos.cancelDeliveryOrder(
                    order.id,
                    selectedReasonCode,
                    finalReason,
                  );
                  if (ok) {
                    toast.success(`Pedido #${order.code} cancelado com sucesso.`);
                    setShowCancelConfirm(false);
                    onOpenChange(false);
                  }
                } catch (err: any) {
                  toast.error("Falha ao cancelar pedido: " + (err?.message || err));
                } finally {
                  setCancelling(false);
                }
              }}
              className="rounded-xl bg-destructive font-semibold text-destructive-foreground hover:brightness-110"
            >
              {cancelling ? "Cancelando..." : "Confirmar Cancelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
