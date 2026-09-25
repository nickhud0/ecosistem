import { useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  DollarSign,
  Eye,
  Layers,
  Printer,
  RotateCcw,
  Search,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppShell } from "@/components/pos/app-shell";
import { usePos } from "@/lib/pos-store";
import { brl, clock, dateShort } from "@/lib/pos-format";
import { printSaleReceipt } from "@/lib/printer-service";
import { PAYMENT_LABELS, type Sale } from "@/lib/pos-types";
import { cn } from "@/lib/utils";

export function HistoryPage() {
  const pos = usePos();
  const [period, setPeriod] = useState("hoje");
  const [shift, setShift] = useState("todos");
  const [status, setStatus] = useState("todos");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Sale | null>(null);
  const [saleToCancel, setSaleToCancel] = useState<Sale | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);

  // Lista dinâmica de turnos presentes nas vendas
  const availableShifts = useMemo(() => {
    const set = new Set<string>();
    pos.sales.forEach((s) => {
      if (s.shift) set.add(s.shift);
    });
    return Array.from(set).sort();
  }, [pos.sales]);

  // Filtro avançado: período, turno, status e busca
  const rows = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    const thirtyDaysAgo = Date.now() - 30 * 86400000;

    const term = search.trim().toLowerCase();

    return pos.sales.filter((sale) => {
      // Filtro de Turno
      if (shift !== "todos" && sale.shift !== shift) {
        return false;
      }

      // Filtro de Status
      if (status === "concluidos" && sale.cancelled) return false;
      if (status === "cancelados" && !sale.cancelled) return false;

      // Filtro de Período
      if (period === "hoje" && sale.createdAt < startOfToday) {
        return false;
      }
      if (
        period === "ontem" &&
        (sale.createdAt < startOfYesterday || sale.createdAt >= startOfToday)
      ) {
        return false;
      }
      if (period === "semana" && sale.createdAt < sevenDaysAgo) {
        return false;
      }
      if (period === "mes" && sale.createdAt < thirtyDaysAgo) {
        return false;
      }

      // Busca textual
      if (term) {
        const matchesCode = sale.code.toLowerCase().includes(term);
        const matchesOrigin = sale.origin.toLowerCase().includes(term);
        const matchesItem = sale.items.some((i) => i.name.toLowerCase().includes(term));
        const matchesCpf = sale.cpf ? sale.cpf.includes(term) : false;
        if (!matchesCode && !matchesOrigin && !matchesItem && !matchesCpf) {
          return false;
        }
      }

      return true;
    });
  }, [pos.sales, shift, status, period, search]);

  // Métricas agregadas da seleção atual
  const metrics = useMemo(() => {
    const concluded = rows.filter((s) => !s.cancelled);
    const cancelled = rows.filter((s) => s.cancelled);
    const netTotal = concluded.reduce((acc, s) => acc + s.total, 0);
    const concludedCount = concluded.length;
    const avgTicket = concludedCount > 0 ? netTotal / concludedCount : 0;
    const cancelledTotal = cancelled.reduce((acc, s) => acc + s.total, 0);

    return {
      netTotal,
      concludedCount,
      avgTicket,
      cancelledTotal,
      cancelledCount: cancelled.length,
    };
  }, [rows]);

  const handlePrint = async (sale: Sale) => {
    setIsPrinting(true);
    try {
      const res = await printSaleReceipt(
        sale,
        pos.counterPrinterConfig,
        pos.kitchenPrinterConfig,
      );
      if (res.success) {
        toast.success(`Comprovante ${sale.code} emitido!`, {
          description: res.message,
        });
      } else {
        toast.error(`Falha ao imprimir ${sale.code}`, {
          description: res.message,
        });
      }
    } catch (err) {
      console.error("[handlePrint Error]:", err);
      toast.error("Erro inesperado ao imprimir comprovante.");
    } finally {
      setIsPrinting(false);
    }
  };

  const selectedCustomer = selected?.creditCustomerId
    ? pos.customers.find((customer) => customer.id === selected.creditCustomerId)
    : null;

  return (
    <AppShell title="Histórico de Vendas" subtitle="Cupons emitidos, auditoria e reimpressões">
      <div className="flex h-full flex-col gap-4">
        {/* CARDS DE INDICADORES (KPIS) */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="flex items-center gap-3.5 rounded-2xl glass p-4">
            <span className="grid size-11 place-items-center rounded-xl bg-free/15 text-free ring-1 ring-free/30">
              <DollarSign className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Total Líquido</p>
              <p className="num text-xl font-bold">{brl(metrics.netTotal)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-2xl glass p-4">
            <span className="grid size-11 place-items-center rounded-xl bg-brand/15 text-brand ring-1 ring-brand/30">
              <CheckCircle2 className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Vendas Concluídas</p>
              <p className="num text-xl font-bold">{metrics.concludedCount}</p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-2xl glass p-4">
            <span className="grid size-11 place-items-center rounded-xl bg-cyan/15 text-cyan ring-1 ring-cyan/30">
              <TrendingUp className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Ticket Médio</p>
              <p className="num text-xl font-bold">{brl(metrics.avgTicket)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 rounded-2xl glass p-4">
            <span className="grid size-11 place-items-center rounded-xl bg-wait/15 text-wait ring-1 ring-wait/30">
              <XCircle className="size-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">Estornos / Cancelados</p>
              <p className="num text-xl font-bold">
                {brl(metrics.cancelledTotal)}{" "}
                <span className="text-xs font-normal text-muted-foreground">
                  ({metrics.cancelledCount})
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* ÁREA PRINCIPAL: FILTROS + TABELA */}
        <div className="flex min-h-0 flex-1 flex-col rounded-3xl glass p-5">
          {/* BARRA DE FILTROS */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {/* Campo de Busca */}
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por cupom, cliente ou produto..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 w-full rounded-xl bg-secondary/80 pl-10 pr-4 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-brand"
              />
            </div>

            {/* Período */}
            <div className="w-full sm:w-44">
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="h-11 rounded-xl bg-secondary/80 border-border/60">
                  <div className="flex items-center gap-2 truncate">
                    <Calendar className="size-4 shrink-0 text-muted-foreground" />
                    <SelectValue placeholder="Período" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hoje">Hoje</SelectItem>
                  <SelectItem value="ontem">Ontem</SelectItem>
                  <SelectItem value="semana">Últimos 7 dias</SelectItem>
                  <SelectItem value="mes">Últimos 30 dias</SelectItem>
                  <SelectItem value="todos">Todo o Histórico</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Turno */}
            <div className="w-full sm:w-48">
              <Select value={shift} onValueChange={setShift}>
                <SelectTrigger className="h-11 rounded-xl bg-secondary/80 border-border/60">
                  <div className="flex items-center gap-2 truncate">
                    <Layers className="size-4 shrink-0 text-muted-foreground" />
                    <SelectValue placeholder="Turno" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os turnos</SelectItem>
                  {availableShifts.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div className="w-full sm:w-44">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-11 rounded-xl bg-secondary/80 border-border/60">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os status</SelectItem>
                  <SelectItem value="concluidos">Apenas Concluídos</SelectItem>
                  <SelectItem value="cancelados">Apenas Estornados</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* TABELA DE CUPONS */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full border-separate border-spacing-0 text-left">
              <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur-xl">
                <tr className="text-[11px] tracking-wider text-muted-foreground uppercase">
                  <th className="border-b border-border px-3 py-3">Cupom</th>
                  <th className="border-b border-border px-3 py-3">Data / hora</th>
                  <th className="border-b border-border px-3 py-3">Turno</th>
                  <th className="border-b border-border px-3 py-3">Origem</th>
                  <th className="border-b border-border px-3 py-3">Pagamento</th>
                  <th className="border-b border-border px-3 py-3 text-right">Total</th>
                  <th className="border-b border-border px-3 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-sm text-muted-foreground">
                      Nenhum cupom encontrado para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  rows.map((sale) => (
                    <tr
                      key={sale.id}
                      className={cn(
                        "text-sm transition-colors hover:bg-secondary/30",
                        sale.cancelled && "opacity-50 line-through-text",
                      )}
                    >
                      <td className="border-b border-border px-3 py-3.5">
                        <span className="num font-semibold">{sale.code}</span>
                        {sale.cancelled ? (
                          <span className="ml-2 inline-flex items-center rounded-md bg-wait/15 px-2 py-0.5 text-[10px] font-bold text-wait ring-1 ring-wait/30">
                            CANCELADO
                          </span>
                        ) : null}
                      </td>
                      <td className="border-b border-border px-3 py-3.5 text-muted-foreground whitespace-nowrap">
                        {dateShort(sale.createdAt)} · {clock(sale.createdAt)}
                      </td>
                      <td className="border-b border-border px-3 py-3.5 text-muted-foreground text-xs">
                        <span className="rounded-md bg-secondary/80 px-2 py-1 font-medium">
                          {sale.shift || "Turno 1"}
                        </span>
                      </td>
                      <td className="border-b border-border px-3 py-3.5 font-medium">
                        {sale.origin}
                      </td>
                      <td className="border-b border-border px-3 py-3.5 text-muted-foreground">
                        {sale.payments.length > 0
                          ? sale.payments
                              .map((p) => PAYMENT_LABELS[p.method] ?? p.method)
                              .join(" + ")
                          : "Dinheiro"}
                      </td>
                      <td className="num border-b border-border px-3 py-3.5 text-right font-semibold">
                        <span
                          className={sale.cancelled ? "line-through text-muted-foreground" : ""}
                        >
                          {brl(sale.total)}
                        </span>
                      </td>
                      <td className="border-b border-border px-3 py-3.5">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            onClick={() => setSelected(sale)}
                            title="Ver extrato completo"
                            className="size-9 rounded-xl"
                          >
                            <Eye className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            disabled={isPrinting}
                            onClick={() => handlePrint(sale)}
                            title="Reimprimir cupom fiscal / comprovante"
                            className="size-9 rounded-xl hover:text-brand"
                          >
                            <Printer className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            disabled={sale.cancelled}
                            onClick={() => setSaleToCancel(sale)}
                            title={sale.cancelled ? "Venda já estornada" : "Estornar venda"}
                            className="size-9 rounded-xl bg-wait/10 text-wait ring-1 ring-wait/30 hover:bg-wait/20"
                          >
                            <RotateCcw className="size-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL: VER EXTRATO COMPLETO */}
      <Dialog
        open={!!selected}
        onOpenChange={(value) => {
          if (!value) setSelected(null);
        }}
      >
        <DialogContent className="max-w-lg border-border bg-popover/95 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between pr-6">
              <span>Extrato de Venda · {selected?.code}</span>
              {selected?.cancelled && (
                <span className="rounded-md bg-wait/15 px-2 py-0.5 text-xs font-bold text-wait ring-1 ring-wait/30">
                  ESTORNADO
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          {selected ? (
            <div className="space-y-4">
              {/* Metadados */}
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground">
                <div>
                  Origem: <strong className="text-foreground">{selected.origin}</strong>
                </div>
                <div>
                  Turno: <strong className="text-foreground">{selected.shift || "Turno 1"}</strong>
                </div>
                <div>
                  Data:{" "}
                  <strong className="text-foreground">
                    {dateShort(selected.createdAt)} às {clock(selected.createdAt)}
                  </strong>
                </div>
                {selected.cpf && (
                  <div>
                    CPF na Nota: <strong className="text-foreground">{selected.cpf}</strong>
                  </div>
                )}
              </div>

              {/* Lista de Itens */}
              <div className="max-h-60 overflow-y-auto divide-y divide-border rounded-xl border border-border px-3">
                {selected.items.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">
                    Sem detalhes de itens registrados.
                  </p>
                ) : (
                  selected.items.map((item) => (
                    <div key={item.id} className="flex items-start justify-between py-2.5">
                      <div className="min-w-0 pr-3">
                        <p className="text-sm font-semibold">{item.name}</p>
                        {item.details && item.details.length > 0 && (
                          <div className="mt-0.5 space-y-0.5">
                            {item.details.map((detail) => (
                              <p key={detail} className="text-xs text-muted-foreground">
                                {detail}
                              </p>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {item.qty} × {brl(item.unitPrice)}
                        </p>
                      </div>
                      <span className="num font-semibold text-sm">
                        {brl(item.qty * item.unitPrice)}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Totais e Adicionais */}
              <div className="space-y-1.5 border-t border-border pt-3 text-sm">
                {selected.serviceFee > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Taxa de serviço</span>
                    <span className="num">{brl(selected.serviceFee)}</span>
                  </div>
                )}
                {selected.tip > 0 && (
                  <div className="flex justify-between text-cyan">
                    <span>Gorjeta manual</span>
                    <span className="num">{brl(selected.tip)}</span>
                  </div>
                )}
                {selected.discount > 0 && (
                  <div className="flex justify-between text-wait">
                    <span>Desconto aplicado</span>
                    <span className="num">−{brl(selected.discount)}</span>
                  </div>
                )}

                {/* Fiado ou Cortesia se houver */}
                {selectedCustomer && (
                  <div className="mt-2 rounded-xl bg-busy/10 p-3 text-sm ring-1 ring-busy/30">
                    <p className="font-semibold text-busy">Venda a Prazo (Fiado)</p>
                    <p className="text-xs text-foreground mt-0.5">
                      {selectedCustomer.name} · {selectedCustomer.phone}
                    </p>
                  </div>
                )}
                {selected.courtesyReason && (
                  <div className="mt-2 rounded-xl bg-wait/10 p-3 text-sm ring-1 ring-wait/30">
                    <p className="font-semibold text-wait">Justificativa da Cortesia</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {selected.courtesyReason}
                    </p>
                  </div>
                )}

                {/* Pagamentos */}
                <div className="mt-2 pt-2 border-t border-border">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Formas de Pagamento
                  </p>
                  <div className="space-y-1">
                    {selected.payments.map((p, idx) => (
                      <div key={idx} className="flex justify-between text-xs">
                        <span>{PAYMENT_LABELS[p.method] ?? p.method}</span>
                        <span className="num font-semibold">{brl(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Total Final */}
                <div className="flex justify-between border-t border-border pt-3">
                  <span className="font-bold text-base">Total da Venda</span>
                  <span className="num text-2xl font-bold text-free">{brl(selected.total)}</span>
                </div>
              </div>

              {/* Botões do Rodapé */}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelected(null)}
                  className="rounded-xl"
                >
                  Fechar
                </Button>
                <Button
                  type="button"
                  disabled={isPrinting}
                  onClick={() => handlePrint(selected)}
                  className="rounded-xl bg-brand text-brand-foreground gap-2 font-semibold hover:bg-brand/90"
                >
                  <Printer className="size-4" />
                  Imprimir Comprovante / 2ª Via
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ALERT DIALOG: CONFIRMAR ESTORNO DE VENDA */}
      <AlertDialog
        open={saleToCancel !== null}
        onOpenChange={(open) => !open && setSaleToCancel(null)}
      >
        <AlertDialogContent className="bg-popover/95 backdrop-blur-2xl border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-wait">
              <RotateCcw className="size-5" />
              Estornar Venda {saleToCancel?.code}?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2 text-left">
              <p>
                Atenção: Esta ação cancelará a venda <strong>{saleToCancel?.code}</strong> no valor
                de{" "}
                <strong className="text-foreground">
                  {saleToCancel && brl(saleToCancel.total)}
                </strong>
                .
              </p>
              <div className="rounded-xl border border-border bg-secondary/50 p-3 text-xs text-muted-foreground space-y-1">
                <div>
                  Origem:{" "}
                  <span className="font-semibold text-foreground">{saleToCancel?.origin}</span>
                </div>
                <div>
                  Turno:{" "}
                  <span className="font-semibold text-foreground">
                    {saleToCancel?.shift || "Turno 1"}
                  </span>
                </div>
                <div>
                  Data/Hora:{" "}
                  <span className="font-semibold text-foreground">
                    {saleToCancel &&
                      `${dateShort(saleToCancel.createdAt)} às ${clock(saleToCancel.createdAt)}`}
                  </span>
                </div>
                <div>
                  Forma de Pagamento:{" "}
                  <span className="font-semibold text-foreground">
                    {saleToCancel?.payments
                      .map((p) => PAYMENT_LABELS[p.method] ?? p.method)
                      .join(" + ")}
                  </span>
                </div>
              </div>
              <p className="text-xs text-wait font-medium">
                Esta operação estornará o valor do saldo do caixa e marcará o cupom como CANCELADO.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Voltar / Não estornar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!saleToCancel) return;
                pos.cancelSale(saleToCancel.id);
                toast.success("Venda cancelada e estornada com sucesso", {
                  description: `${saleToCancel.code} · ${brl(saleToCancel.total)}`,
                });
                setSaleToCancel(null);
              }}
              className="rounded-xl bg-wait text-wait-foreground hover:bg-wait/90 font-semibold"
            >
              Sim, Estornar Venda
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
