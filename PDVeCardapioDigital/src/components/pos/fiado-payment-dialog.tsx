import { useEffect, useState } from "react";
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Printer,
  QrCode,
  Receipt,
  User,
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
import { usePos } from "@/lib/pos-store";
import { brl } from "@/lib/pos-format";
import { printFiadoPaymentReceipt } from "@/lib/printer-service";
import type { Customer } from "@/lib/pos-types";
import { cn } from "@/lib/utils";

export function FiadoPaymentDialog({
  open,
  onOpenChange,
  customer,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  onSuccess?: () => void;
}) {
  const pos = usePos();
  const [payMode, setPayMode] = useState<"total" | "partial">("total");
  const [amount, setAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"dinheiro" | "pix" | "debito" | "credito">(
    "pix",
  );
  const [notes, setNotes] = useState("");
  const [printReceipt, setPrintReceipt] = useState(true);
  const [cashTendered, setCashTendered] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const balanceDue = customer?.balanceDue ?? 0;

  useEffect(() => {
    if (customer && open) {
      setPayMode("total");
      setAmount(balanceDue.toFixed(2));
      setPaymentMethod("pix");
      setNotes("");
      setPrintReceipt(true);
      setCashTendered("");
    }
  }, [customer, open, balanceDue]);

  const numAmount = parseFloat(amount.replace(",", ".")) || 0;
  const numCashTendered = parseFloat(cashTendered.replace(",", ".")) || 0;
  const change = Math.max(0, numCashTendered - numAmount);
  const remainingBalance = Math.max(0, balanceDue - numAmount);

  const handlePay = async () => {
    if (!customer) return;

    if (numAmount <= 0) {
      toast.error("Informe um valor de pagamento válido maior que zero");
      return;
    }

    if (numAmount > balanceDue + 0.01) {
      toast.error(
        `O valor informado (${brl(numAmount)}) é maior que a dívida total (${brl(balanceDue)})`,
      );
      return;
    }

    try {
      setLoading(true);
      const tx = await pos.receiveCustomerPayment({
        customerId: customer.id,
        amount: numAmount,
        paymentMethod,
        notes: notes.trim() || undefined,
      });

      if (printReceipt) {
        try {
          printFiadoPaymentReceipt(customer, tx);
        } catch (printErr) {
          console.warn("[FiadoPaymentDialog] Erro ao imprimir comprovante:", printErr);
        }
      }

      toast.success(
        `Pagamento de ${brl(numAmount)} baixado com sucesso na conta de ${customer.name}!`,
      );
      onSuccess?.();
      onOpenChange(false);
    } catch (err: any) {
      console.error("[FiadoPaymentDialog Error]:", err);
      toast.error("Erro ao registrar baixa de fiado: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border bg-popover/98 p-6 shadow-2xl">
        <DialogHeader className="border-b border-border/60 pb-3">
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <Receipt className="size-5 text-emerald-500" />
            Baixar / Receber Fiado
          </DialogTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
            <User className="size-3.5" />
            <span className="font-semibold text-foreground">{customer.name}</span>
            {customer.phone && <span>· {customer.phone}</span>}
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Card Resumo do Saldo Devedor */}
          <div className="flex items-center justify-between rounded-2xl bg-surface/90 border border-border/80 p-3.5">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground block">
                Saldo Devedor Atual
              </span>
              <span className="text-xs text-muted-foreground">Em aberto na caderneta</span>
            </div>
            <span className="num font-black text-2xl text-busy">{brl(balanceDue)}</span>
          </div>

          {/* Alternador Quitação Total vs Parcial */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setPayMode("total");
                setAmount(balanceDue.toFixed(2));
              }}
              className={cn(
                "tap flex h-11 items-center justify-center gap-1.5 rounded-xl border text-xs font-bold transition-all",
                payMode === "total"
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 shadow-xs"
                  : "bg-surface text-muted-foreground border-border hover:bg-secondary",
              )}
            >
              <CheckCircle2 className="size-4" />
              Quitar Total ({brl(balanceDue)})
            </button>
            <button
              type="button"
              onClick={() => {
                setPayMode("partial");
                setAmount("");
              }}
              className={cn(
                "tap flex h-11 items-center justify-center gap-1.5 rounded-xl border text-xs font-bold transition-all",
                payMode === "partial"
                  ? "bg-brand/15 text-brand border-brand/40 shadow-xs"
                  : "bg-surface text-muted-foreground border-border hover:bg-secondary",
              )}
            >
              <DollarSign className="size-4" />
              Pagamento Parcial
            </button>
          </div>

          {/* Campo de Valor */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              Valor a Receber (R$) <b className="text-busy">*</b>
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-3 text-sm font-bold text-muted-foreground">
                R$
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={balanceDue}
                disabled={payMode === "total"}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-surface pl-10 pr-3 font-mono text-base font-bold text-foreground outline-none focus:border-brand focus:ring-1 focus:ring-brand disabled:opacity-85"
                placeholder="0,00"
              />
            </div>
            {numAmount > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                Saldo após este pagamento:{" "}
                <b
                  className={cn(
                    "font-bold",
                    remainingBalance > 0
                      ? "text-busy"
                      : "text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {brl(remainingBalance)}
                </b>
              </p>
            )}
          </div>

          {/* Método de Pagamento Recebido */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground uppercase">
              Forma de Recebimento
            </label>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod("pix")}
                className={cn(
                  "tap flex flex-col items-center justify-center gap-1 rounded-xl p-2 text-xs font-semibold border transition-all",
                  paymentMethod === "pix"
                    ? "bg-cyan/15 text-cyan border-cyan/40 shadow-xs"
                    : "bg-surface text-muted-foreground border-border hover:bg-secondary",
                )}
              >
                <QrCode className="size-4" />
                PIX
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("dinheiro")}
                className={cn(
                  "tap flex flex-col items-center justify-center gap-1 rounded-xl p-2 text-xs font-semibold border transition-all",
                  paymentMethod === "dinheiro"
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 shadow-xs"
                    : "bg-surface text-muted-foreground border-border hover:bg-secondary",
                )}
              >
                <Banknote className="size-4" />
                Dinheiro
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("debito")}
                className={cn(
                  "tap flex flex-col items-center justify-center gap-1 rounded-xl p-2 text-xs font-semibold border transition-all",
                  paymentMethod === "debito"
                    ? "bg-brand/15 text-brand border-brand/40 shadow-xs"
                    : "bg-surface text-muted-foreground border-border hover:bg-secondary",
                )}
              >
                <CreditCard className="size-4" />
                Débito
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("credito")}
                className={cn(
                  "tap flex flex-col items-center justify-center gap-1 rounded-xl p-2 text-xs font-semibold border transition-all",
                  paymentMethod === "credito"
                    ? "bg-brand/15 text-brand border-brand/40 shadow-xs"
                    : "bg-surface text-muted-foreground border-border hover:bg-secondary",
                )}
              >
                <CreditCard className="size-4" />
                Crédito
              </button>
            </div>
          </div>

          {/* Troco se Dinheiro */}
          {paymentMethod === "dinheiro" && (
            <div className="rounded-xl bg-secondary/60 border border-border/60 p-3 space-y-2">
              <label className="block text-xs font-semibold text-muted-foreground">
                Valor Entregue pelo Cliente (para calcular troco)
              </label>
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-muted-foreground">
                    R$
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={cashTendered}
                    onChange={(e) => setCashTendered(e.target.value)}
                    className="h-9 w-full rounded-lg border border-input bg-surface pl-9 pr-2 font-mono text-sm font-bold text-foreground outline-none focus:border-brand"
                    placeholder="Ex: 50,00"
                  />
                </div>
                {change > 0 && (
                  <div className="text-right">
                    <span className="text-[10px] text-muted-foreground block font-medium">Troco:</span>
                    <span className="num font-extrabold text-sm text-emerald-600 dark:text-emerald-400">
                      {brl(change)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Observações */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Observação (Opcional)
            </label>
            <input
              type="text"
              placeholder="Ex: Acerto referente ao mês passado..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-xs outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>

          {/* Checkbox Imprimir Comprovante */}
          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={printReceipt}
              onChange={(e) => setPrintReceipt(e.target.checked)}
              className="size-4 rounded accent-brand"
            />
            <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
              <Printer className="size-3.5 text-muted-foreground" />
              Imprimir recibo térmico de pagamento para o cliente
            </span>
          </label>
        </div>

        <DialogFooter className="mt-4 gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => onOpenChange(false)}
            className="h-11 rounded-xl"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={loading || numAmount <= 0}
            onClick={handlePay}
            className="tap h-11 rounded-xl bg-emerald-600 font-bold text-white shadow-sm hover:bg-emerald-500"
          >
            <CheckCircle2 className="size-4 mr-1.5" />
            {loading ? "Processando…" : `Confirmar Baixa (${brl(numAmount)})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
