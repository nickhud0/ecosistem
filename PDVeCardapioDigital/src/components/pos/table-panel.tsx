import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  ChefHat,
  Clock,
  Link2,
  Merge,
  Percent,
  Plus,
  Printer,
  RotateCcw,
  SplitSquareHorizontal,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AddItemsDialog } from "@/components/pos/add-items-dialog";
import { CheckoutDialog } from "@/components/pos/checkout-dialog";
import { ProductCustomizationDialog } from "@/components/pos/product-customization-dialog";
import { Numpad, centsToNumber, popDigit, pushDigit } from "@/components/pos/numpad";
import { usePos } from "@/lib/pos-store";
import { brl, elapsed, itemsTotal, uid } from "@/lib/pos-format";
import {
  printKitchenTicket,
  printPreContaTicket,
  type KitchenTicketData,
  type PreContaTicketData,
} from "@/lib/printer-service";
import type { Product, TableT } from "@/lib/pos-types";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<TableT["status"], string> = {
  livre: "bg-free/15 text-free ring-free/30",
  ocupada: "bg-busy/15 text-busy ring-busy/30",
  conta: "bg-wait/15 text-wait ring-wait/30",
};

const STATUS_LABEL: Record<TableT["status"], string> = {
  livre: "Livre",
  ocupada: "Ocupada",
  conta: "Aguardando conta",
};

type Mode = null | "cancelar" | "transferir" | "juntar" | "desconto" | "separar";

export function TablePanel({
  table,
  onClose,
}: {
  table: TableT;
  onClose?: () => void;
}) {
  const pos = usePos();
  // Busca a versão viva e reativa da mesa no pos.tables
  const liveTable = pos.tables.find((t) => t.id === table.id) ?? table;

  const [mode, setMode] = useState<Mode>(null);
  const [addItemsOpen, setAddItemsOpen] = useState(false);
  const [pickedItem, setPickedItem] = useState<string | null>(null);
  const [discountType, setDiscountType] = useState<"percent" | "value">("percent");
  const [cents, setCents] = useState("");
  const [checkout, setCheckout] = useState(false);
  const [customizing, setCustomizing] = useState<Product | null>(null);
  const [previewTicket, setPreviewTicket] = useState<KitchenTicketData | null>(null);
  const [previewPreConta, setPreviewPreConta] = useState<PreContaTicketData | null>(null);
  const [isPrintingPreConta, setIsPrintingPreConta] = useState(false);
  const [pendingMergeTarget, setPendingMergeTarget] = useState<TableT | null>(null);

  const tableItems = liveTable.items ?? [];
  const pendingKitchenItems = tableItems.filter((i) => !i.sentToKitchen);
  const pendingCount = pendingKitchenItems.reduce((sum, it) => sum + it.qty, 0);
  const mergedWith = liveTable.mergedWith ?? [];
  const subtotal = itemsTotal(tableItems);
  const discount = liveTable.discount
    ? liveTable.discount.type === "percent"
      ? (subtotal * liveTable.discount.amount) / 100
      : liveTable.discount.amount
    : 0;

  const others = pos.tables.filter((t) => t.id !== liveTable.id);

  const closeModal = () => {
    setMode(null);
    setPickedItem(null);
    setCents("");
    setPendingMergeTarget(null);
  };

  const handleSendToKitchen = async () => {
    if (pendingCount === 0) {
      toast.info("Nenhum item pendente para enviar à cozinha");
      return;
    }
    const ticket = await pos.sendTableToKitchen(liveTable.id);
    if (ticket) {
      setPreviewTicket(ticket);
      toast.success("Pedido enviado para a cozinha!", {
        description: `Mesa ${String(liveTable.number).padStart(2, "0")} · Rodada #${ticket.round} (${ticket.items.length} itens)`,
      });
    }
  };

  const handlePrintPreConta = async () => {
    if (tableItems.length === 0) {
      toast.error("Nenhum item lançado na mesa para gerar a pré-conta");
      return;
    }
    setIsPrintingPreConta(true);
    try {
      const res = await pos.printPreConta(liveTable.id);
      if (res.success && res.ticketData) {
        setPreviewPreConta(res.ticketData);
        toast.success("Pré-conta enviada para impressão", {
          description: `Mesa ${String(liveTable.number).padStart(2, "0")} · Total: ${brl(res.ticketData.totalWithService)}`,
        });
      } else {
        toast.error("Não foi possível imprimir a pré-conta", {
          description: res.message,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Erro ao emitir pré-conta", { description: msg });
    } finally {
      setIsPrintingPreConta(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Se algum diálogo modal estiver aberto, não dispara atalhos de mesa
      if (mode !== null || addItemsOpen || checkout || customizing || previewTicket || previewPreConta) {
        return;
      }

      if (e.key === "F2") {
        e.preventDefault();
        setAddItemsOpen(true);
        return;
      }

      if (e.key === "F4") {
        e.preventDefault();
        handleSendToKitchen();
        return;
      }

      if (e.key === "F8") {
        e.preventDefault();
        handlePrintPreConta();
        return;
      }

      if (e.key === "F12") {
        e.preventDefault();
        if (tableItems.length > 0) {
          setCheckout(true);
        } else {
          toast.info("A mesa não possui itens a pagar.");
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [liveTable.id, mode, addItemsOpen, checkout, customizing, previewTicket, previewPreConta, pendingCount, tableItems.length, onClose]);

  const actions = [
    { label: "Adicionar Item", icon: Plus, shortcut: "F2", onClick: () => setAddItemsOpen(true) },
    { label: "Cancelar Item", icon: Trash2, onClick: () => setMode("cancelar") },
    { label: "Transferir", icon: ArrowLeftRight, onClick: () => setMode("transferir") },
    { label: "Juntar Mesas", icon: Merge, onClick: () => setMode("juntar") },
    ...(mergedWith.length > 0
      ? [{ label: "Separar Mesas", icon: SplitSquareHorizontal, onClick: () => setMode("separar") }]
      : []),
    { label: "Desconto", icon: Percent, onClick: () => setMode("desconto") },
    {
      label: "Reimprimir",
      icon: ChefHat,
      onClick: async () => {
        if (tableItems.length === 0) {
          toast.error("Nenhum item na mesa para reimpressão");
          return;
        }
        const ticket = await pos.reprintKitchenTicket(liveTable.id);
        if (ticket) {
          setPreviewTicket(ticket);
          toast.success("Comanda reenviada para a cozinha", {
            description: `Mesa ${String(liveTable.number).padStart(2, "0")} · ${ticket.items.length} itens`,
          });
        }
      },
    },
    {
      label: "Pré-Conta",
      icon: Printer,
      shortcut: "F8",
      onClick: handlePrintPreConta,
    },
  ];

  return (
    <section className="flex min-h-0 flex-col rounded-3xl glass p-5">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-display font-semibold text-lg">
              Mesa {String(liveTable.number ?? 1).padStart(2, "0")}
            </h2>
            {mergedWith.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2.5 py-0.5 text-xs font-semibold text-brand ring-1 ring-brand/30">
                <Link2 className="size-3" /> Mesa conjunta com{" "}
                {mergedWith.map((n) => `Mesa ${String(n).padStart(2, "0")}`).join(", ")}
              </span>
            )}
            <span className="text-xs font-normal text-muted-foreground">
              · {liveTable.seats ?? 4} pessoas
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {liveTable.openedAt ? `Aberta há ${elapsed(liveTable.openedAt, pos.now)} · ` : ""}Garçom{" "}
            {liveTable.waiter && liveTable.waiter !== "Equipe"
              ? liveTable.waiter
              : pos.user || "Equipe"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs ring-1",
              STATUS_BADGE[liveTable.status] ?? STATUS_BADGE.livre,
            )}
          >
            {STATUS_LABEL[liveTable.status] ?? "Livre"}
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Fechar painel da mesa (Esc)"
              className="tap grid size-7 place-items-center rounded-lg text-muted-foreground hover:bg-surface hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl glass-soft p-4">
        <div className="mb-3 grid grid-cols-[1fr_auto_auto] gap-4 text-[11px] tracking-wider text-muted-foreground uppercase">
          <span>Produto</span>
          <span className="w-20 text-right">Unitário</span>
          <span className="w-24 text-right">Total</span>
        </div>
        {tableItems.length ? (
          <div className="divide-y divide-border">
            {tableItems.map((i) => (
              <div key={i.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 py-2.5">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium">{i.name}</p>
                    {mergedWith.length > 0 && (
                      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold bg-brand/15 text-brand ring-1 ring-brand/30">
                        M{String(i.originTableNumber ?? liveTable.number).padStart(2, "0")}
                      </span>
                    )}
                    {i.sentToKitchen ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <Check className="size-3" />
                        Cozinha {i.kitchenRound ? `(R${i.kitchenRound})` : ""}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400 animate-pulse">
                        <Clock className="size-3" />
                        Pendente
                      </span>
                    )}
                  </div>
                  {i.details?.map((detail) => (
                    <p key={detail} className="text-[11px] text-muted-foreground">
                      {detail}
                    </p>
                  ))}
                  <p className="text-xs text-muted-foreground">Qtd {i.qty}</p>
                </div>
                <span className="num w-20 text-right text-sm text-muted-foreground">
                  {brl(i.unitPrice)}
                </span>
                <span className="num w-24 text-right text-sm font-semibold">
                  {brl(i.qty * i.unitPrice)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhum item lançado nesta mesa.
          </p>
        )}
        <div className="mt-2 border-t border-border pt-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="num font-semibold">{brl(subtotal)}</span>
          </div>
          {discount > 0 ? (
            <div className="flex items-center justify-between text-sm text-cyan">
              <span>
                Desconto{" "}
                {liveTable.discount?.type === "percent"
                  ? `${liveTable.discount.amount}%`
                  : brl(liveTable.discount?.amount ?? 0)}
              </span>
              <span className="num">-{brl(discount)}</span>
            </div>
          ) : null}
          <div className="mt-1 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="num font-display text-xl font-bold">{brl(subtotal - discount)}</span>
          </div>
        </div>

        {pendingCount > 0 && (
          <button
            type="button"
            onClick={handleSendToKitchen}
            className="tap mt-3 flex h-13 w-full items-center justify-between px-4 rounded-2xl bg-amber-500 hover:bg-amber-600 font-display font-bold text-white shadow-lg shadow-amber-500/25 transition-all animate-in fade-in zoom-in-95"
          >
            <div className="flex items-center gap-2">
              <ChefHat className="size-5" />
              <span>
                Enviar para Cozinha ({pendingCount}{" "}
                {pendingCount === 1 ? "item pendente" : "itens pendentes"})
              </span>
            </div>
            <kbd className="rounded-lg bg-black/20 px-2 py-0.5 font-mono text-xs font-semibold text-white border border-white/20">
              F4
            </kbd>
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {actions.map(({ label, icon: Icon, shortcut, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            title={shortcut ? `${label} (${shortcut})` : label}
            className="tap relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl glass-soft text-[11px] font-medium hover:bg-surface-strong text-center px-1"
          >
            <Icon className="size-4 text-muted-foreground" />
            <span className="leading-tight truncate w-full">{label}</span>
            {shortcut && (
              <span className="absolute top-1 right-1 font-mono text-[8px] font-bold text-muted-foreground bg-surface px-1 rounded border border-border">
                {shortcut}
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCheckout(true)}
          title="Pagamento (F12)"
          className="tap relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-xl bg-linear-to-br from-brand to-cyan text-[11px] font-semibold text-brand-foreground shadow-lg shadow-brand/30"
        >
          <Wallet className="size-4" />
          <span>Pagamento</span>
          <span className="absolute top-1 right-1 font-mono text-[8px] font-bold text-brand-foreground bg-black/20 px-1 rounded border border-white/20">
            F12
          </span>
        </button>
      </div>

      {/* Modal de ações */}
      <Dialog open={mode !== null} onOpenChange={(v) => (v ? null : closeModal())}>
        <DialogContent className="max-w-md border-border bg-popover/98 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">
              {mode === "cancelar" && "Cancelar item"}
              {mode === "transferir" && "Transferir item"}
              {mode === "juntar" && "Juntar mesas"}
              {mode === "separar" && "Separar mesas conjuntas"}
              {mode === "desconto" && "Aplicar desconto"}
            </DialogTitle>
          </DialogHeader>

          {(mode === "cancelar" || mode === "transferir") && (
            <div className="space-y-2">
              <p className="text-xs tracking-wider text-muted-foreground uppercase">
                Selecione o item
              </p>
              <div className="max-h-60 space-y-1 overflow-y-auto">
                {liveTable.items.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => setPickedItem(i.id)}
                    className={cn(
                      "tap flex w-full items-center justify-between rounded-xl px-3 py-3 text-sm",
                      pickedItem === i.id ? "bg-brand/25 ring-1 ring-brand/40" : "glass-soft",
                    )}
                  >
                    <span>
                      {i.qty}× {i.name}
                    </span>
                    <span className="num">{brl(i.qty * i.unitPrice)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === "cancelar" &&
            (() => {
              const itemObj = liveTable.items.find((i) => i.id === pickedItem);
              return (
                <div className="space-y-3 pt-2">
                  {itemObj?.sentToKitchen && (
                    <div className="rounded-xl border border-wait/40 bg-wait/10 p-3 text-xs text-wait space-y-1 text-left">
                      <div className="font-bold flex items-center gap-1.5 text-sm">
                        <AlertTriangle className="size-4 shrink-0" />
                        <span>Item já despachado para a Cozinha!</span>
                      </div>
                      <p className="text-muted-foreground">
                        Este item já foi enviado para a produção (Rodada #
                        {itemObj.kitchenRound || 1}). Ao cancelar, certifique-se de avisar o
                        cozinheiro/bar para interromper o preparo.
                      </p>
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={!pickedItem}
                    onClick={async () => {
                      if (!pickedItem) return;
                      await pos.removeItem(liveTable.id, pickedItem);
                      toast.success(`Item "${itemObj?.name}" cancelado`);
                      closeModal();
                    }}
                    className="tap h-14 w-full rounded-xl bg-wait/20 font-semibold text-wait ring-1 ring-wait/40 disabled:opacity-40 hover:bg-wait/30"
                  >
                    Confirmar cancelamento {itemObj ? `de ${itemObj.name}` : ""}
                  </button>
                </div>
              );
            })()}

          {mode === "transferir" && pickedItem && (
            <div className="space-y-2">
              <p className="text-xs tracking-wider text-muted-foreground uppercase">Mesa destino</p>
              <div className="grid grid-cols-4 gap-2">
                {others.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={async () => {
                      await pos.transferItem(liveTable.id, t.id, pickedItem);
                      toast.success(
                        `Item transferido para a mesa ${String(t.number).padStart(2, "0")}`,
                      );
                      closeModal();
                    }}
                    className="tap num h-14 rounded-xl glass-soft font-semibold"
                  >
                    {String(t.number).padStart(2, "0")}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mode === "juntar" && pendingMergeTarget && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
                <div className="flex items-center gap-2 text-amber-500 font-semibold text-sm">
                  <AlertTriangle className="size-5 shrink-0" />
                  <span>Atenção: Ambas as mesas já possuem pedidos!</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Você está prestes a unificar a comanda da{" "}
                  <strong className="text-foreground">
                    Mesa {String(liveTable.number).padStart(2, "0")}
                  </strong>{" "}
                  com a{" "}
                  <strong className="text-foreground">
                    Mesa {String(pendingMergeTarget.number).padStart(2, "0")}
                  </strong>
                  .
                </p>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="rounded-xl border bg-card/60 p-3 space-y-1">
                    <p className="text-xs font-semibold text-foreground">
                      Mesa {String(liveTable.number).padStart(2, "0")} (Atual)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {liveTable.items.length} {liveTable.items.length === 1 ? "item" : "itens"}
                    </p>
                    <p className="text-sm font-bold text-brand font-mono">{brl(subtotal)}</p>
                  </div>
                  <div className="rounded-xl border bg-card/60 p-3 space-y-1">
                    <p className="text-xs font-semibold text-foreground">
                      Mesa {String(pendingMergeTarget.number).padStart(2, "0")} (Parceira)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {pendingMergeTarget.items.length}{" "}
                      {pendingMergeTarget.items.length === 1 ? "item" : "itens"}
                    </p>
                    <p className="text-sm font-bold text-brand font-mono">
                      {brl(itemsTotal(pendingMergeTarget.items))}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-background/50 p-2.5 text-[11px] text-muted-foreground border">
                  💡 <strong>Segurança do PDV:</strong> Os itens manterão o registro de sua mesa de
                  origem na comanda conjunta. Se isso tiver sido feito por engano, você poderá
                  clicar em <strong>"Separar Mesas"</strong> a qualquer momento e restaurar as
                  comandas de cada mesa sem misturar ou perder nada!
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="secondary"
                  onClick={() => setPendingMergeTarget(null)}
                  className="rounded-xl text-xs"
                >
                  Voltar
                </Button>
                <Button
                  onClick={async () => {
                    await pos.mergeTables(liveTable.id, pendingMergeTarget.id);
                    toast.success(
                      `Mesa ${String(pendingMergeTarget.number).padStart(2, "0")} juntada com a Mesa ${String(liveTable.number).padStart(2, "0")}!`,
                      {
                        description: "Comanda compartilhada com histórico de origem preservado.",
                      },
                    );
                    closeModal();
                  }}
                  className="rounded-xl bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs"
                >
                  Sim, Unificar Comandas
                </Button>
              </div>
            </div>
          )}

          {mode === "juntar" && !pendingMergeTarget && (
            <div className="space-y-3">
              <div>
                <p className="text-xs tracking-wider text-muted-foreground uppercase font-semibold">
                  Juntar com qual mesa?
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  As mesas selecionadas se tornarão uma só, compartilhando a mesma comanda e
                  pedidos.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2.5 max-h-60 overflow-y-auto pr-1">
                {others
                  .filter((t) => !mergedWith.includes(t.number))
                  .map((t) => {
                    const isOccupied = t.status !== "livre" && t.items.length > 0;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={async () => {
                          if (isOccupied) {
                            setPendingMergeTarget(t);
                          } else {
                            await pos.mergeTables(liveTable.id, t.id);
                            toast.success(
                              `Mesa ${String(t.number).padStart(2, "0")} juntada com a Mesa ${String(liveTable.number).padStart(2, "0")}!`,
                              {
                                description:
                                  "Ambas agora formam uma única mesa com comanda compartilhada.",
                              },
                            );
                            closeModal();
                          }
                        }}
                        className={cn(
                          "tap flex flex-col items-center justify-center p-3 rounded-2xl border transition-all text-center",
                          isOccupied
                            ? "border-busy/40 bg-busy/10 hover:border-busy"
                            : "border-free/40 bg-free/10 hover:border-free",
                        )}
                      >
                        <span className="num font-display text-xl font-bold">
                          Mesa {String(t.number).padStart(2, "0")}
                        </span>
                        <span
                          className={cn(
                            "mt-1 text-[11px] font-semibold px-2 py-0.5 rounded-full",
                            isOccupied ? "bg-busy/20 text-busy" : "bg-free/20 text-free",
                          )}
                        >
                          {isOccupied ? `Ocupada (${t.items.length} itens)` : "Livre"}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {mode === "separar" && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-brand/30 bg-brand/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <SplitSquareHorizontal className="size-4 text-brand" />
                    Separar Mesas Conjuntas
                  </p>
                  <span className="text-xs font-mono font-medium text-brand">
                    {[liveTable.number, ...mergedWith]
                      .sort((a, b) => a - b)
                      .map((n) => `Mesa ${String(n).padStart(2, "0")}`)
                      .join(" + ")}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">
                  Confira abaixo os itens lançados de acordo com a mesa de origem física:
                </p>

                {/* Resumo por Mesa de Origem */}
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  {[liveTable.number, ...mergedWith]
                    .sort((a, b) => a - b)
                    .map((num) => {
                      const its = liveTable.items.filter(
                        (i) => (i.originTableNumber ?? liveTable.number) === num,
                      );
                      const itsSub = itemsTotal(its);
                      return (
                        <div
                          key={num}
                          className="rounded-xl border bg-card/60 p-2.5 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between font-semibold">
                            <span>Mesa {String(num).padStart(2, "0")}</span>
                            <span className="text-brand font-mono">{brl(itsSub)}</span>
                          </div>
                          <p className="text-muted-foreground text-[11px]">
                            {its.length} {its.length === 1 ? "item lançado" : "itens lançados"}
                          </p>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Opção 1: Restaurar Origens (Recomendada) */}
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-3.5 space-y-2">
                <div className="flex items-start gap-2.5">
                  <div className="size-8 rounded-lg bg-emerald-500/20 text-emerald-500 flex items-center justify-center shrink-0 mt-0.5">
                    <RotateCcw className="size-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">
                      Restaurar Comandas de Origem (Recomendado)
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      Devolve cada item para a sua mesa física de origem. Se juntou duas mesas por
                      engano, ambas voltarão ativas exatamente como estavam antes da junção!
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={async () => {
                    await pos.unmergeTable(liveTable.id, "restore_origins");
                    toast.success("Comandas originais restauradas!", {
                      description: "Cada mesa recuperou seus respectivos itens e consumos.",
                    });
                    closeModal();
                  }}
                  className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs h-9 mt-1"
                >
                  Restaurar Itens para Mesas Originais
                </Button>
              </div>

              {/* Opção 2 e Cancelar */}
              <div className="flex items-center justify-between pt-1 gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={closeModal}
                  className="rounded-xl text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await pos.unmergeTable(liveTable.id, "keep_here");
                    toast.success("Mesas desvinculadas", {
                      description: `Todos os itens permaneceram na Mesa ${String(liveTable.number).padStart(2, "0")}.`,
                    });
                    closeModal();
                  }}
                  className="rounded-xl text-xs text-muted-foreground hover:text-foreground"
                >
                  Manter todos os itens apenas na Mesa {String(liveTable.number).padStart(2, "0")}
                </Button>
              </div>
            </div>
          )}

          {mode === "desconto" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {(["percent", "value"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDiscountType(t)}
                    className={cn(
                      "tap h-12 rounded-xl text-sm font-semibold",
                      discountType === t
                        ? "bg-brand/25 text-brand ring-1 ring-brand/40"
                        : "glass-soft",
                    )}
                  >
                    {t === "percent" ? "Percentual (%)" : "Valor (R$)"}
                  </button>
                ))}
              </div>
              <div className="rounded-xl glass-soft p-3 text-right">
                <span className="num text-3xl font-bold">
                  {discountType === "percent"
                    ? `${Math.min(100, parseInt(cents || "0", 10))}%`
                    : brl(centsToNumber(cents))}
                </span>
              </div>
              <Numpad
                onDigit={(d) => setCents((c) => pushDigit(c, d))}
                onBackspace={() => setCents(popDigit)}
                onClear={() => setCents("")}
              />
              <button
                type="button"
                onClick={async () => {
                  const rawAmount =
                    discountType === "percent"
                      ? Math.min(100, parseInt(cents || "0", 10))
                      : centsToNumber(cents);
                  const amount =
                    discountType === "percent" ? rawAmount : Math.min(subtotal, rawAmount);
                  if (discountType === "value" && rawAmount > subtotal) {
                    toast.warning("Desconto limitado ao valor total da comanda.");
                  }
                  await pos.applyDiscount(liveTable.id, discountType, amount);
                  toast.success("Desconto aplicado");
                  closeModal();
                }}
                className="tap h-14 w-full rounded-xl bg-brand font-semibold text-brand-foreground"
              >
                Aplicar desconto
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AddItemsDialog
        open={addItemsOpen}
        onOpenChange={setAddItemsOpen}
        table={liveTable}
        onItemAdded={async (product, qty) => {
          await pos.addItemsToTable(liveTable.id, [
            {
              id: uid(),
              name: product.name,
              qty: qty,
              unitPrice: product.price,
              details: [],
            },
          ]);
        }}
        onCustomizeProduct={(product) => {
          setCustomizing(product);
          setAddItemsOpen(false);
        }}
      />

      <CheckoutDialog
        open={checkout}
        onOpenChange={setCheckout}
        originLabel={`Mesa ${String(liveTable.number).padStart(2, "0")}`}
        items={liveTable.items}
        onFinish={(data) => pos.finishTable(liveTable.id, data)}
      />
      <ProductCustomizationDialog
        product={customizing}
        open={!!customizing}
        onOpenChange={(value) => {
          if (!value) setCustomizing(null);
        }}
        onConfirm={async (item) => {
          await pos.addItemsToTable(liveTable.id, [item]);
          toast.success("Item adicionado à comanda", {
            description: `${item.name} · Mesa ${String(liveTable.number).padStart(2, "0")}`,
          });
        }}
      />

      {/* Modal de Pré-visualização do Cupom de Cozinha */}
      <Dialog
        open={previewTicket !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewTicket(null);
        }}
      >
        <DialogContent className="max-w-sm border-border bg-popover/98 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display text-base">
              <ChefHat className="size-5 text-amber-500" />
              Comanda de Produção (Cozinha & Bar)
            </DialogTitle>
          </DialogHeader>
          {previewTicket && (
            <div className="space-y-4">
              <div className="rounded-xl border border-dashed border-border bg-white p-4 font-mono text-black dark:bg-zinc-100 shadow-inner text-xs">
                <div className="text-center font-bold text-sm tracking-wider uppercase">
                  *** PRODUÇÃO / COZINHA ***
                </div>
                <div className="my-2 border-y border-black py-1.5 text-center">
                  <div className="text-lg font-black tracking-widest">
                    MESA {String(previewTicket.tableNumber).padStart(2, "0")}
                  </div>
                  {previewTicket.orderCode && (
                    <div className="text-[10px] font-bold text-zinc-600">
                      {previewTicket.orderCode}
                    </div>
                  )}
                </div>
                <div className="flex justify-between text-[11px]">
                  <span>Atendente:</span>
                  <span className="font-bold">{previewTicket.waiter}</span>
                </div>
                <div className="my-1.5 rounded bg-zinc-200 border border-zinc-400 py-0.5 text-center text-[10px] font-bold">
                  {previewTicket.round === 1
                    ? "1ª RODADA (PEDIDO INICIAL)"
                    : `${previewTicket.round}ª RODADA (PEDIDO ADICIONAL)`}
                </div>
                <div className="my-2 border-t border-dashed border-zinc-400 pt-2 font-bold text-[10px]">
                  ITENS A PREPARAR:
                </div>
                <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                  {previewTicket.items.map((item) => (
                    <div key={item.id} className="border-b border-dotted border-zinc-300 pb-1.5">
                      <div className="flex items-start gap-1.5">
                        <span className="font-black text-sm">[{item.qty}x]</span>
                        <span className="font-bold text-xs uppercase">{item.name}</span>
                      </div>
                      {item.details && item.details.length > 0 && (
                        <div className="mt-1 pl-4 text-[10px] font-semibold text-zinc-700 italic">
                          {item.details.map((d, i) => (
                            <div key={i}>• {d}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex justify-between border-t border-black pt-1.5 font-bold text-xs">
                  <span>TOTAL DE ITENS:</span>
                  <span className="text-sm">
                    {previewTicket.items.reduce((s, it) => s + it.qty, 0)}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await printKitchenTicket(previewTicket, pos.kitchenPrinterConfig);
                    toast.success("Comanda reenviada para a impressora");
                  }}
                  className="tap flex-1 h-12 rounded-xl bg-secondary font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-surface-strong"
                >
                  <Printer className="size-4" />
                  Imprimir Novamente
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTicket(null)}
                  className="tap flex-1 h-12 rounded-xl bg-brand font-semibold text-xs text-brand-foreground"
                >
                  Fechar
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Pré-Visualização / Reimpressão da Pré-Conta */}
      <Dialog
        open={Boolean(previewPreConta)}
        onOpenChange={(open) => !open && setPreviewPreConta(null)}
      >
        <DialogContent className="max-w-xs p-5 bg-card rounded-3xl">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-base font-display font-bold flex items-center gap-2">
              <Printer className="size-4 text-brand" />
              Pré-Conta / Conferência
            </DialogTitle>
          </DialogHeader>

          {previewPreConta && (
            <div className="space-y-4">
              <div className="rounded-xl border border-zinc-300 bg-white p-4 font-mono text-zinc-900 shadow-inner">
                <div className="text-center font-bold text-sm tracking-wide">
                  *** CONFERÊNCIA DE MESA ***
                </div>
                <div className="text-center text-[10px] text-zinc-500 mb-2">
                  (PRÉ-CONTA NÃO FISCAL)
                </div>
                <div className="border-t border-b border-black py-1.5 my-1 text-xs">
                  <div className="flex justify-between font-bold">
                    <span>
                      Mesa {String(previewPreConta.tableNumber).padStart(2, "0")}
                      {previewPreConta.mergedWith && previewPreConta.mergedWith.length > 0
                        ? ` (+${previewPreConta.mergedWith.map((n) => String(n).padStart(2, "0")).join(", ")})`
                        : ""}
                    </span>
                    <span>{previewPreConta.seats} Lugares</span>
                  </div>
                  <div className="flex justify-between text-[11px] text-zinc-600 mt-0.5">
                    <span>Garçom: {previewPreConta.waiter}</span>
                  </div>
                </div>

                <div className="my-2 text-[10px] font-bold text-zinc-600">
                  ITENS CONSUMIDOS:
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {previewPreConta.items.map((item) => (
                    <div key={item.id} className="border-b border-dotted border-zinc-200 pb-1">
                      <div className="flex justify-between items-start text-xs">
                        <span className="font-bold">
                          [{item.qty}x] {item.name}
                        </span>
                        <span className="font-semibold">{brl(item.unitPrice * item.qty)}</span>
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {item.qty} x {brl(item.unitPrice)}
                      </div>
                      {item.details && item.details.length > 0 && (
                        <div className="pl-3 text-[10px] text-zinc-600 italic">
                          {item.details.map((d, i) => (
                            <div key={i}>• {d}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-2 border-t border-zinc-400 pt-1.5 space-y-0.5 text-xs">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>{brl(previewPreConta.subtotal)}</span>
                  </div>
                  {previewPreConta.discount > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>Desconto:</span>
                      <span>-{brl(previewPreConta.discount)}</span>
                    </div>
                  )}
                  {previewPreConta.serviceFee > 0 && (
                    <div className="flex justify-between text-zinc-700">
                      <span>Taxa de Serviço ({previewPreConta.serviceFeePercent}%):</span>
                      <span>{brl(previewPreConta.serviceFee)}</span>
                    </div>
                  )}
                  <div className="border-t border-black pt-1 flex justify-between font-bold text-sm">
                    <span>TOTAL:</span>
                    <span>
                      {brl(
                        previewPreConta.serviceFee > 0
                          ? previewPreConta.totalWithService
                          : previewPreConta.totalWithoutService,
                      )}
                    </span>
                  </div>
                  {previewPreConta.seats > 1 && (
                    <div className="text-[11px] text-zinc-600 border-t border-dotted border-zinc-300 pt-1 mt-1">
                      <div className="flex justify-between">
                        <span>Por pessoa ({previewPreConta.seats}p):</span>
                        <span className="font-semibold">
                          {brl(
                            previewPreConta.serviceFee > 0
                              ? previewPreConta.perPersonWithService
                              : previewPreConta.perPersonWithoutService,
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await printPreContaTicket(
                      previewPreConta,
                      pos.counterPrinterConfig,
                      pos.kitchenPrinterConfig,
                    );
                    toast.success("Pré-conta reenviada para a impressora");
                  }}
                  className="tap flex-1 h-12 rounded-xl bg-secondary font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-surface-strong"
                >
                  <Printer className="size-4" />
                  Reimprimir
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewPreConta(null)}
                  className="tap flex-1 h-12 rounded-xl bg-brand font-semibold text-xs text-brand-foreground"
                >
                  Fechar
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
