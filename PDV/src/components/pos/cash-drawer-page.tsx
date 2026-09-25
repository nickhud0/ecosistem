import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Calculator,
  CheckCircle2,
  Clock,
  Coins,
  DollarSign,
  History,
  LockKeyhole,
  Printer,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/pos/app-shell";
import { Numpad, centsToNumber, popDigit, pushDigit } from "@/components/pos/numpad";
import { usePos } from "@/lib/pos-store";
import { isEditableElement } from "@/hooks/usePosShortcuts";
import { brl, clock, dateShort } from "@/lib/pos-format";
import { printShiftClosingReceipt } from "@/lib/printer-service";
import type { DbShiftRecord } from "@/lib/pos-types";
import { cn } from "@/lib/utils";

type Mode = null | "suprimento" | "sangria" | "fechar";
const bills = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05];

export function CashDrawerPage() {
  const pos = usePos();
  const [mode, setMode] = useState<Mode>(null);
  const [cents, setCents] = useState("");
  const [reason, setReason] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [forceClose, setForceClose] = useState(false);
  const [printReceiptOnClose, setPrintReceiptOnClose] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedClosedShift, setSelectedClosedShift] = useState<DbShiftRecord | null>(null);
  const [isProcessingClose, setIsProcessingClose] = useState(false);

  // Resumo financeiro consolidado e isolado ao turno atual
  const summary = useMemo(() => pos.getShiftSummary(), [pos]);
  const cashInDrawer = summary.expectedCash;

  const counted = bills.reduce((s, b) => s + b * (counts[String(b)] ?? 0), 0);
  const diff = counted - cashInDrawer;

  // Mesas e entregas abertas
  const openTables = pos.tables.filter(
    (t) => t.status !== "livre" || (t.items && t.items.length > 0),
  );
  const openDeliveries = pos.delivery;
  const hasOpenOrders = openTables.length > 0 || openDeliveries.length > 0;

  const close = () => {
    setMode(null);
    setCents("");
    setReason("");
    setCounts({});
    setForceClose(false);
  };

  const saveMovement = () => {
    if (mode !== "suprimento" && mode !== "sangria") return;
    const amount = centsToNumber(cents);
    if (amount <= 0) return;

    if (mode === "sangria" && amount > cashInDrawer) {
      toast.error("Saldo em dinheiro insuficiente na gaveta para esta sangria.", {
        description: `Saldo em dinheiro na gaveta: ${brl(cashInDrawer)}`,
      });
      return;
    }

    pos.addMovement(
      mode,
      amount,
      reason || (mode === "suprimento" ? "Reposição de troco" : "Retirada operacional"),
    );
    toast.success(mode === "suprimento" ? "Suprimento registrado" : "Sangria registrada", {
      description: brl(amount),
    });
    close();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isProcessingClose) return;

      // Escape: fecha modal se houver algum aberto
      if (e.key === "Escape") {
        if (mode !== null || historyOpen || selectedClosedShift) {
          e.preventDefault();
          close();
          setHistoryOpen(false);
          setSelectedClosedShift(null);
        }
        return;
      }

      // Enter no modal de suprimento/sangria: confirma a operação
      if ((mode === "suprimento" || mode === "sangria") && e.key === "Enter") {
        e.preventDefault();
        saveMovement();
        return;
      }

      // Se houver algum modal aberto, não dispara outros atalhos
      if (mode !== null || historyOpen || selectedClosedShift) return;

      // Alt+U: Suprimento
      if (e.altKey && (e.key === "u" || e.key === "U")) {
        e.preventDefault();
        setMode("suprimento");
        return;
      }

      // Alt+S: Sangria
      if (e.altKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        setMode("sangria");
        return;
      }

      // Alt+H: Histórico de turnos
      if (e.altKey && (e.key === "h" || e.key === "H")) {
        e.preventDefault();
        setHistoryOpen(true);
        return;
      }

      // F10: Fechar Caixa
      if (e.key === "F10") {
        e.preventDefault();
        setMode("fechar");
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, historyOpen, selectedClosedShift, isProcessingClose, cents, reason, cashInDrawer]);

  const handleConfirmClose = async () => {
    setIsProcessingClose(true);
    try {
      // 1. Encerra o caixa no store / SQLite
      await pos.closeRegister(counted);

      // 2. Se marcado, imprime comprovante de fechamento (Relatório Z / Fechamento de Caixa)
      if (printReceiptOnClose) {
        try {
          const res = await printShiftClosingReceipt(
            summary,
            pos.counterPrinterConfig,
            pos.kitchenPrinterConfig,
          );
          toast.info("Comprovante de fechamento emitido!", {
            description: res.message,
          });
        } catch (printErr) {
          console.warn("[handleConfirmClose print error]:", printErr);
        }
      }

      // 3. Notificação final de sucesso
      const diffLabel =
        diff === 0
          ? "Caixa exato (sem divergência)"
          : diff > 0
            ? `Sobra de caixa: +${brl(diff)}`
            : `Falta de caixa: ${brl(diff)}`;

      toast.success("Turno encerrado com sucesso!", {
        description: `Contado: ${brl(counted)} · Esperado: ${brl(cashInDrawer)} (${diffLabel})`,
      });

      close();
    } catch (err) {
      console.error("[handleConfirmClose Error]:", err);
      toast.error("Erro ao encerrar o turno do caixa.");
    } finally {
      setIsProcessingClose(false);
    }
  };

  const handleReprintClosedShift = async (shift: DbShiftRecord) => {
    // Monta dados do resumo histórico para impressão
    const shiftSummary = pos.getShiftSummary(shift.id);
    try {
      const res = await printShiftClosingReceipt(
        shiftSummary,
        pos.counterPrinterConfig,
        pos.kitchenPrinterConfig,
      );
      toast.success(`Comprovante do turno ${shift.name} impresso!`, {
        description: res.message,
      });
    } catch (err) {
      console.error("[reprint error]:", err);
      toast.error("Erro ao reimprimir comprovante de fechamento.");
    }
  };

  return (
    <AppShell title="Gestão da Gaveta" subtitle="Controle financeiro do operador e fechamento">
      <div className="grid h-full grid-cols-[1fr_380px] gap-5">
        {/* SEÇÃO ESQUERDA: AÇÕES RÁPIDAS + MOVIMENTAÇÕES */}
        <section className="flex min-h-0 flex-col overflow-y-auto pr-1">
          {/* BOTÕES DE AÇÃO DO CAIXA */}
          <div className="grid grid-cols-3 gap-4">
            {[
              {
                kind: "suprimento" as const,
                label: "Suprimento",
                desc: "Entrada de troco ou reforço de gaveta",
                icon: ArrowDownToLine,
                shortcut: "Alt+U",
                color: "text-free bg-free/15 ring-free/30",
              },
              {
                kind: "sangria" as const,
                label: "Sangria",
                desc: "Retirada de dinheiro para cofre/despesa",
                icon: ArrowUpFromLine,
                shortcut: "Alt+S",
                color: "text-busy bg-busy/15 ring-busy/30",
              },
              {
                kind: "fechar" as const,
                label: "Fechar Caixa",
                desc: "Contagem cega e encerramento de turno",
                icon: LockKeyhole,
                shortcut: "F10",
                color: "text-wait bg-wait/15 ring-wait/30",
              },
            ].map(({ kind, label, desc, icon: Icon, shortcut, color }) => (
              <button
                key={kind}
                type="button"
                onClick={() => setMode(kind)}
                title={`${label} (${shortcut})`}
                className="tap relative flex min-h-36 flex-col items-start rounded-3xl glass p-5 text-left transition-all hover:bg-secondary/40"
              >
                <span className="absolute top-4 right-4 font-mono text-[10px] font-semibold text-muted-foreground bg-surface px-1.5 py-0.5 rounded border border-border">
                  {shortcut}
                </span>
                <span className={cn("grid size-12 place-items-center rounded-2xl ring-1", color)}>
                  <Icon className="size-6" />
                </span>
                <h2 className="mt-4 font-display text-lg font-semibold">{label}</h2>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </button>
            ))}
          </div>

          {/* PAINEL DE MOVIMENTAÇÕES DO TURNO */}
          <div className="mt-5 flex-1 rounded-3xl glass p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="size-5 text-muted-foreground" />
                <h2 className="font-display font-semibold">Movimentações Avulsas do Turno</h2>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setHistoryOpen(true)}
                  title="Turnos Anteriores (Alt+H)"
                  className="rounded-xl text-xs gap-1.5 h-8"
                >
                  <History className="size-3.5" />
                  Turnos Anteriores
                  <kbd className="rounded bg-surface px-1 font-mono text-[9px] text-muted-foreground border border-border">
                    Alt+H
                  </kbd>
                </Button>
                <span className="text-xs text-muted-foreground bg-secondary/80 px-2.5 py-1 rounded-lg">
                  {pos.movements.length} lançamentos
                </span>
              </div>
            </div>

            {pos.movements.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <Coins className="size-10 mx-auto mb-2 opacity-30" />
                Nenhum suprimento ou sangria registrado no turno atual.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {pos.movements.map((m) => (
                  <div key={m.id} className="flex items-center gap-4 py-3">
                    <span
                      className={cn(
                        "grid size-10 place-items-center rounded-xl ring-1",
                        m.type === "sangria"
                          ? "bg-wait/15 text-wait ring-wait/30"
                          : "bg-free/15 text-free ring-free/30",
                      )}
                    >
                      {m.type === "sangria" ? (
                        <ArrowUpFromLine className="size-4" />
                      ) : (
                        <ArrowDownToLine className="size-4" />
                      )}
                    </span>
                    <div>
                      <p className="text-sm font-medium capitalize">{m.type}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.reason} · {clock(m.at)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "num ml-auto font-semibold",
                        m.type === "sangria" ? "text-wait" : "text-free",
                      )}
                    >
                      {m.type === "sangria" ? "−" : "+"}
                      {brl(m.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* SEÇÃO DIREITA (ASIDE): RECONCILIAÇÃO MATEMÁTICA E FATURAMENTO */}
        <aside className="flex flex-col gap-4 overflow-y-auto">
          {/* CARD DE SALDO EM DINHEIRO NA GAVETA */}
          <div className="rounded-3xl glass p-6">
            <div className="flex items-center justify-between">
              <p className="text-xs tracking-wider text-muted-foreground uppercase font-medium">
                Dinheiro na Gaveta
              </p>
              <span className="rounded-md bg-free/10 text-free text-[11px] font-semibold px-2 py-0.5">
                Projetado
              </span>
            </div>
            <p className="num mt-2 text-4xl font-bold text-free">{brl(cashInDrawer)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Total exato em espécie que deve estar na gaveta física.
            </p>

            {/* DEMONSTRATIVO MATEMÁTICO DA GAVETA */}
            <div className="mt-5 space-y-2.5 border-t border-border pt-4 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fundo inicial (Abertura)</span>
                <span className="num font-medium">{brl(summary.openingFloat)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vendas em Dinheiro (+)</span>
                <span className="num font-medium text-free">+{brl(summary.cashSales)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Suprimentos / Entradas (+)</span>
                <span className="num font-medium text-free">+{brl(summary.supplies)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sangrias / Retiradas (−)</span>
                <span className="num font-medium text-wait">
                  {summary.bleeds > 0 ? `−${brl(summary.bleeds)}` : brl(0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Estornos em Dinheiro (−)</span>
                <span className="num font-medium text-wait">
                  {summary.cashRefunds > 0 ? `−${brl(summary.cashRefunds)}` : brl(0)}
                </span>
              </div>
              <div className="flex justify-between border-t border-border/80 pt-2 font-semibold text-sm">
                <span>Saldo em Espécie</span>
                <span className="num text-free">{brl(cashInDrawer)}</span>
              </div>
            </div>
          </div>

          {/* CARD DE VENDAS DO TURNO POR FORMA DE PAGAMENTO */}
          <div className="rounded-3xl glass p-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs tracking-wider text-muted-foreground uppercase font-medium">
                Vendas do Turno
              </p>
              <span className="text-xs text-muted-foreground font-medium">
                {summary.totalSalesCount} {summary.totalSalesCount === 1 ? "venda" : "vendas"}
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">PIX</span>
                <span className="num font-medium">{brl(summary.salesByMethod.pix ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cartão de Crédito</span>
                <span className="num font-medium">{brl(summary.salesByMethod.credito ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cartão de Débito</span>
                <span className="num font-medium">{brl(summary.salesByMethod.debito ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dinheiro (Espécie)</span>
                <span className="num font-medium">{brl(summary.cashSales)}</span>
              </div>
              {((summary.salesByMethod.fiado ?? 0) > 0 ||
                (summary.salesByMethod.cortesia ?? 0) > 0) && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">A Prazo (Fiado) / Cortesia</span>
                  <span className="num font-medium">
                    {brl(
                      (summary.salesByMethod.fiado ?? 0) + (summary.salesByMethod.cortesia ?? 0),
                    )}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-4 border-t border-border pt-3 space-y-1 text-xs">
              {summary.cashRefunds > 0 && (
                <div className="flex justify-between text-wait">
                  <span>Estornos em Dinheiro</span>
                  <span className="num">−{brl(summary.cashRefunds)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold pt-1">
                <span>Total Faturado</span>
                <span className="num text-foreground">{brl(summary.totalSalesAmount)}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* MODAL: SUPRIMENTO / SANGRIA / FECHAMENTO */}
      <Dialog open={mode !== null} onOpenChange={(v) => (v ? null : close())}>
        <DialogContent
          className={cn(
            "border-border bg-popover/95 backdrop-blur-2xl",
            mode === "fechar" ? "max-w-2xl" : "max-w-md",
          )}
        >
          <DialogHeader>
            <DialogTitle>
              {mode === "suprimento"
                ? "Registrar Suprimento de Caixa"
                : mode === "sangria"
                  ? "Registrar Sangria de Dinheiro"
                  : "Fechamento Cego de Caixa"}
            </DialogTitle>
          </DialogHeader>

          {mode !== "fechar" ? (
            <div className="space-y-4">
              <div className="rounded-2xl glass-soft p-4 text-right">
                <p className="text-xs text-muted-foreground">Valor a lançar</p>
                <p className="num text-4xl font-bold">{brl(centsToNumber(cents))}</p>
              </div>

              <Numpad
                onDigit={(d) => setCents((c) => pushDigit(c, d))}
                onBackspace={() => setCents(popDigit)}
                onClear={() => setCents("")}
              />

              {/* Botões de motivo rápido */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {(mode === "suprimento"
                  ? ["Troco inicial", "Reforço de troco", "Entrada avulsa"]
                  : ["Pagamento fornecedor", "Depósito bancário", "Despesa da loja", "Retirada"]
                ).map((quick) => (
                  <button
                    key={quick}
                    type="button"
                    onClick={() => setReason(quick)}
                    className="text-xs rounded-lg bg-secondary/80 px-2.5 py-1 text-muted-foreground hover:text-foreground hover:bg-secondary"
                  >
                    {quick}
                  </button>
                ))}
              </div>

              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="h-11 w-full rounded-xl glass-soft px-3.5 text-sm outline-none placeholder:text-muted-foreground"
                placeholder="Motivo ou observação da operação"
              />

              <Button
                type="button"
                onClick={saveMovement}
                className="tap h-12 w-full rounded-xl bg-brand font-semibold text-brand-foreground hover:bg-brand/90"
              >
                Confirmar Lançamento
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* ALERTA DE PEDIDOS EM ABERTO */}
              {hasOpenOrders && (
                <div className="rounded-2xl border border-wait/40 bg-wait/10 p-3.5 text-xs text-wait space-y-2 text-left">
                  <div className="flex items-center gap-1.5 font-bold text-sm">
                    <AlertTriangle className="size-4 shrink-0" />
                    <span>Atenção: Existem Contas em Aberto!</span>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    Fechar o caixa agora fará com que os atendimentos pendentes sejam contabilizados
                    apenas no próximo turno:
                  </p>
                  <div className="font-semibold space-y-0.5 text-foreground pl-1">
                    {openTables.length > 0 && (
                      <div>
                        • {openTables.length}{" "}
                        {openTables.length === 1 ? "mesa aberta" : "mesas abertas"} (
                        {openTables
                          .map((t) => `Mesa ${String(t.number).padStart(2, "0")}`)
                          .join(", ")}
                        )
                      </div>
                    )}
                    {openDeliveries.length > 0 && (
                      <div>
                        • {openDeliveries.length}{" "}
                        {openDeliveries.length === 1 ? "entrega ativa" : "entregas ativas"} no
                        delivery
                      </div>
                    )}
                  </div>
                  <label className="flex items-center gap-2 pt-1 font-medium cursor-pointer text-foreground">
                    <input
                      type="checkbox"
                      checked={forceClose}
                      onChange={(e) => setForceClose(e.target.checked)}
                      className="size-4 rounded accent-wait cursor-pointer"
                    />
                    <span>Estou ciente e confirmo o encerramento do turno com contas abertas.</span>
                  </label>
                </div>
              )}

              <div className="rounded-xl bg-busy/10 p-3 text-xs text-busy ring-1 ring-busy/30">
                <strong>Contagem Cega:</strong> Insira a quantidade física de cada nota e moeda
                presente na gaveta. O saldo esperado e qualquer eventual divergência serão
                calculados na confirmação.
              </div>

              {/* GRID DE NOTAS E MOEDAS */}
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-1">
                {bills.map((b) => (
                  <label key={b} className="rounded-xl glass-soft p-2.5 block text-left">
                    <span className="text-xs text-muted-foreground block">
                      {b >= 1 ? brl(b) : `${Math.round(b * 100)} centavos`}
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={counts[String(b)] ?? ""}
                      onChange={(e) =>
                        setCounts((c) => ({
                          ...c,
                          [String(b)]: Math.max(0, Number(e.target.value)),
                        }))
                      }
                      className="num mt-1 h-9 w-full rounded-lg bg-secondary px-2 text-base font-semibold outline-none"
                      placeholder="0"
                    />
                  </label>
                ))}
              </div>

              {/* TOTAL CONTADO */}
              <div className="flex items-center justify-between rounded-2xl glass-soft p-4">
                <span className="font-semibold text-sm">Total Físico Contado</span>
                <span className="num text-2xl font-bold text-free">{brl(counted)}</span>
              </div>

              {/* OPÇÃO DE EMITIR COMPROVANTE */}
              <label className="flex items-center gap-2.5 text-xs text-muted-foreground cursor-pointer px-1">
                <input
                  type="checkbox"
                  checked={printReceiptOnClose}
                  onChange={(e) => setPrintReceiptOnClose(e.target.checked)}
                  className="size-4 rounded accent-brand cursor-pointer"
                />
                <span>
                  Emitir Comprovante de Fechamento de Caixa na impressora térmica (Relatório Z)
                </span>
              </label>

              {/* BOTÃO DE CONFIRMAÇÃO */}
              <Button
                type="button"
                disabled={(hasOpenOrders && !forceClose) || isProcessingClose}
                onClick={handleConfirmClose}
                className={cn(
                  "tap h-13 w-full rounded-xl font-semibold gap-2",
                  hasOpenOrders && !forceClose
                    ? "opacity-40 cursor-not-allowed bg-secondary text-muted-foreground"
                    : "bg-wait text-wait-foreground hover:bg-wait/90",
                )}
              >
                <Calculator className="size-5" />
                {isProcessingClose ? "Encerrando turno..." : "Confirmar Contagem e Fechar Caixa"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL: HISTÓRICO DE TURNOS ANTERIORES */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-2xl border-border bg-popover/95 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="size-5 text-brand" />
              Histórico de Turnos Fechados
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {pos.closedShifts.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                <Clock className="size-10 mx-auto mb-2 opacity-30" />
                Nenhum turno anterior arquivado no sistema.
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto divide-y divide-border pr-1">
                {pos.closedShifts.map((shift) => (
                  <div key={shift.id} className="py-3 flex items-center justify-between text-sm">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 font-semibold">
                        <span>{shift.name}</span>
                        <span className="text-xs text-muted-foreground font-normal">
                          ({shift.operatorName})
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {dateShort(shift.openedAt)} {clock(shift.openedAt)} →{" "}
                        {shift.closedAt ? `${clock(shift.closedAt)}` : "Fechado"}
                      </p>
                      <div className="flex items-center gap-3 text-xs pt-0.5">
                        <span>
                          Fundo: <strong>{brl(shift.openingFloat)}</strong>
                        </span>
                        <span>
                          Esperado: <strong>{brl(shift.closingExpected ?? 0)}</strong>
                        </span>
                        <span>
                          Contado: <strong>{brl(shift.closingCounted ?? 0)}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Diferença</p>
                        <p
                          className={cn(
                            "num font-bold",
                            (shift.closingDifference ?? 0) === 0
                              ? "text-free"
                              : (shift.closingDifference ?? 0) > 0
                                ? "text-cyan"
                                : "text-wait",
                          )}
                        >
                          {(shift.closingDifference ?? 0) > 0 ? "+" : ""}
                          {brl(shift.closingDifference ?? 0)}
                        </p>
                      </div>

                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        onClick={() => handleReprintClosedShift(shift)}
                        title="Reimprimir comprovante de fechamento deste turno"
                        className="size-9 rounded-xl hover:text-brand"
                      >
                        <Printer className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
