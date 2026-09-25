import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  CreditCard,
  Gift,
  Landmark,
  NotebookTabs,
  QrCode,
  Receipt,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CustomerDialog } from "@/components/pos/customer-dialog";
import { Numpad, centsToNumber, popDigit, pushDigit } from "@/components/pos/numpad";
import { usePos } from "@/lib/pos-store";
import { isEditableElement } from "@/hooks/usePosShortcuts";
import { brl, itemsTotal } from "@/lib/pos-format";
import { PAYMENT_LABELS, type OrderItem, type Payment, type PaymentMethod } from "@/lib/pos-types";
import { cn } from "@/lib/utils";

const METHODS = [
  { method: "pix", icon: QrCode },
  { method: "credito", icon: CreditCard },
  { method: "debito", icon: Landmark },
  { method: "dinheiro", icon: Banknote },
  { method: "fiado", icon: NotebookTabs },
  { method: "cortesia", icon: Gift },
] satisfies { method: PaymentMethod; icon: typeof QrCode }[];

const METHOD_SHORTCUTS: Record<PaymentMethod, string> = {
  pix: "1",
  credito: "2",
  debito: "3",
  dinheiro: "4",
  fiado: "5",
  cortesia: "6",
};

type FinishData = {
  items: OrderItem[];
  payments: Payment[];
  serviceFee: number;
  tip: number;
  discount: number;
  cpf: string | null;
  creditCustomerId?: string;
  courtesyReason?: string;
};

export function CheckoutDialog({
  open,
  onOpenChange,
  originLabel,
  items,
  allowSplit = true,
  onFinish,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  originLabel: string;
  items: OrderItem[];
  allowSplit?: boolean;
  onFinish: (data: FinishData) => void;
}) {
  const pos = usePos();
  const [service, setService] = useState(true);
  const [parts, setParts] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [cents, setCents] = useState("");
  const [tipCents, setTipCents] = useState("");
  const [cpf, setCpf] = useState("");
  const [creditCustomerId, setCreditCustomerId] = useState("");
  const [customerDialog, setCustomerDialog] = useState(false);
  const [courtesyReason, setCourtesyReason] = useState("");

  const payingItems = useMemo(
    () => (selected.length ? items.filter((item) => selected.includes(item.id)) : items),
    [items, selected],
  );
  const subtotal = itemsTotal(payingItems);
  const serviceFee = service ? subtotal * 0.1 : 0;
  const tip = centsToNumber(tipCents);
  const courtesy = method === "cortesia";
  const total = courtesy ? 0 : subtotal + serviceFee + tip;
  const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
  const remaining = Math.max(0, total - paid);
  const cashPaid = payments
    .filter((payment) => payment.method === "dinheiro")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const change = Math.max(0, paid - total);
  const perPart = parts > 1 ? total / parts : total;

  const reset = () => {
    setPayments([]);
    setCents("");
    setTipCents("");
    setSelected([]);
    setParts(1);
    setCpf("");
    setService(true);
    setMethod("pix");
    setCreditCustomerId("");
    setCourtesyReason("");
  };
  const chooseMethod = (next: PaymentMethod) => {
    setMethod(next);
    if (next === "cortesia") setPayments([]);
  };
  const addPayment = () => {
    if (method === "cortesia") return;
    if (method === "fiado" && !creditCustomerId) {
      toast.error("Selecione o cliente do Fiado");
      return;
    }
    const value = centsToNumber(cents) || remaining;
    if (value <= 0) return;
    setPayments((current) => [
      ...current,
      { method, amount: value, ...(method === "fiado" ? { customerId: creditCustomerId } : {}) },
    ]);
    setCents("");
  };
  const finish = () => {
    if (courtesy && !courtesyReason.trim()) {
      toast.error("Informe a justificativa da cortesia");
      return;
    }
    if (!courtesy && remaining > 0.009) {
      toast.error("Valor pendente", {
        description: `Faltam ${brl(remaining)} para fechar a conta.`,
      });
      return;
    }
    onFinish({
      items: payingItems,
      payments: courtesy ? [{ method: "cortesia", amount: 0 }] : payments,
      serviceFee: courtesy ? 0 : serviceFee,
      tip: courtesy ? 0 : tip,
      discount: courtesy ? subtotal : 0,
      cpf: cpf || null,
      ...(creditCustomerId ? { creditCustomerId } : {}),
      ...(courtesy ? { courtesyReason: courtesyReason.trim() } : {}),
    });
    toast.success(courtesy ? "Cortesia registrada" : "Venda finalizada", {
      description: `${originLabel} · ${brl(total)}${change > 0 ? ` · Troco ${brl(change)}` : ""}`,
    });
    reset();
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (customerDialog) return;

      // Atalhos F1 a F6 funcionam sempre
      if (e.key === "F1") {
        e.preventDefault();
        chooseMethod("pix");
        return;
      }
      if (e.key === "F2") {
        e.preventDefault();
        chooseMethod("credito");
        return;
      }
      if (e.key === "F3") {
        e.preventDefault();
        chooseMethod("debito");
        return;
      }
      if (e.key === "F4") {
        e.preventDefault();
        chooseMethod("dinheiro");
        return;
      }
      if (e.key === "F5") {
        e.preventDefault();
        chooseMethod("fiado");
        return;
      }
      if (e.key === "F6") {
        e.preventDefault();
        chooseMethod("cortesia");
        return;
      }

      // Enter para adicionar pagamento ou finalizar
      if (e.key === "Enter") {
        e.preventDefault();
        if (courtesy || remaining <= 0.009) {
          finish();
          return;
        }
        const value = centsToNumber(cents);
        if (value > 0) {
          addPayment();
          return;
        }
        // Se cents estiver vazio e restar valor a pagar, quita o restante no método selecionado
        if (!courtesy && remaining > 0) {
          if (method === "fiado" && !creditCustomerId) {
            toast.error("Selecione o cliente do Fiado");
            return;
          }
          setPayments((current) => [
            ...current,
            { method, amount: remaining, ...(method === "fiado" ? { customerId: creditCustomerId } : {}) },
          ]);
          setCents("");
        }
        return;
      }

      // Se estiver digitando em um input (como CPF, gorjeta, justificativa), não intercepta números e espaço
      if (isEditableElement(e.target)) {
        return;
      }

      if (e.key === "1") {
        e.preventDefault();
        chooseMethod("pix");
        return;
      }
      if (e.key === "2") {
        e.preventDefault();
        chooseMethod("credito");
        return;
      }
      if (e.key === "3") {
        e.preventDefault();
        chooseMethod("debito");
        return;
      }
      if (e.key === "4") {
        e.preventDefault();
        chooseMethod("dinheiro");
        return;
      }
      if (e.key === "5") {
        e.preventDefault();
        chooseMethod("fiado");
        return;
      }
      if (e.key === "6") {
        e.preventDefault();
        chooseMethod("cortesia");
        return;
      }

      // Barra de espaço preenche o restante
      if (e.key === " ") {
        e.preventDefault();
        setCents(String(Math.round(remaining * 100)));
        return;
      }

      // Tecla + ou = adiciona o pagamento
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        addPayment();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    open,
    customerDialog,
    courtesy,
    remaining,
    cents,
    method,
    creditCustomerId,
    courtesyReason,
    payingItems,
    payments,
    serviceFee,
    tip,
    subtotal,
    cpf,
    originLabel,
  ]);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) reset();
          onOpenChange(value);
        }}
      >
        <DialogContent className="max-w-6xl gap-0 border-border bg-popover/98 p-0 shadow-2xl">
          <DialogHeader className="border-b border-border px-6 py-4">
            <DialogTitle className="font-display text-lg">Pagamento · {originLabel}</DialogTitle>
          </DialogHeader>
          <div className="grid max-h-[82vh] grid-cols-[0.9fr_1.1fr] overflow-hidden">
            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto border-r border-border p-6">
              <div className="rounded-2xl glass-soft p-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="num font-semibold">{brl(subtotal)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between rounded-xl bg-brand/10 p-3 ring-1 ring-brand/30">
                  <div>
                    <p className="text-sm font-semibold">Taxa de serviço (10%)</p>
                    <p className="text-xs text-muted-foreground">Opcional para o cliente</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="num text-sm">{brl(serviceFee)}</span>
                    <Switch
                      aria-label="Taxa de serviço"
                      checked={service}
                      onCheckedChange={setService}
                    />
                  </div>
                </div>
                <label className="mt-3 block">
                  <span className="mb-1.5 block text-xs font-medium text-muted-foreground">
                    Gorjeta adicional / manual
                  </span>
                  <div className="flex h-12 items-center rounded-xl border border-input bg-surface px-3">
                    <span className="mr-2 text-sm text-muted-foreground">R$</span>
                    <input
                      aria-label="Gorjeta adicional manual"
                      inputMode="decimal"
                      value={tipCents ? centsToNumber(tipCents).toFixed(2).replace(".", ",") : ""}
                      onChange={(event) =>
                        setTipCents(event.target.value.replace(/\D/g, "").slice(0, 8))
                      }
                      placeholder="0,00"
                      className="num w-full bg-transparent text-right text-lg outline-none"
                    />
                  </div>
                </label>
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                  <span className="text-sm text-muted-foreground">Total final</span>
                  <span className="num text-2xl font-bold">{brl(total)}</span>
                </div>
              </div>
              {allowSplit ? (
                <div className="rounded-2xl glass-soft p-4">
                  <p className="mb-3 text-[11px] tracking-wider text-muted-foreground uppercase">
                    Divisão de conta
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="mr-auto text-sm">Partes iguais</span>
                    {[1, 2, 3, 4, 5, 6].map((part) => (
                      <Button
                        key={part}
                        type="button"
                        size="icon"
                        variant="secondary"
                        onClick={() => setParts(part)}
                        className={cn(
                          "num size-10 rounded-xl",
                          parts === part && "bg-brand text-brand-foreground",
                        )}
                      >
                        {part}
                      </Button>
                    ))}
                  </div>
                  {parts > 1 ? (
                    <p className="mt-3 num text-sm text-cyan">
                      {parts}× {brl(perPart)} por pessoa
                    </p>
                  ) : null}
                  <p className="mt-5 mb-2 text-[11px] tracking-wider text-muted-foreground uppercase">
                    Pagar apenas o consumido
                  </p>
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {items.map((item) => (
                      <label
                        key={item.id}
                        className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface"
                      >
                        <Checkbox
                          checked={selected.includes(item.id)}
                          onCheckedChange={(checked) =>
                            setSelected((current) =>
                              checked
                                ? [...current, item.id]
                                : current.filter((id) => id !== item.id),
                            )
                          }
                        />
                        <span className="text-sm">
                          {item.qty}× {item.name}
                        </span>
                        <span className="num ml-auto text-sm">
                          {brl(item.qty * item.unitPrice)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-6">
              <div className="grid grid-cols-6 gap-2">
                {METHODS.map(({ method: option, icon: Icon }) => (
                  <Button
                    key={option}
                    type="button"
                    variant="secondary"
                    onClick={() => chooseMethod(option)}
                    title={`${PAYMENT_LABELS[option]} (${METHOD_SHORTCUTS[option]} ou F${METHOD_SHORTCUTS[option]})`}
                    className={cn(
                      "relative h-20 flex-col gap-1 rounded-2xl px-1 text-[11px]",
                      method === option && "bg-brand/25 text-brand ring-1 ring-brand/40",
                      option === "cortesia" &&
                        method === option &&
                        "bg-wait/15 text-wait ring-wait/40",
                    )}
                  >
                    <span className="absolute top-1.5 right-1.5 font-mono text-[9px] font-bold text-muted-foreground bg-surface px-1 rounded border border-border">
                      {METHOD_SHORTCUTS[option]}
                    </span>
                    <Icon className="size-6" />
                    {PAYMENT_LABELS[option]}
                  </Button>
                ))}
              </div>
              {method === "fiado" ? (
                <div className="rounded-2xl bg-busy/10 p-4 ring-1 ring-busy/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">Cliente da conta corrente</p>
                      <p className="text-xs text-muted-foreground">
                        Obrigatório para lançar a prazo
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      className="size-11 rounded-xl"
                      title="Cadastrar cliente"
                      onClick={() => setCustomerDialog(true)}
                    >
                      <UserPlus />
                    </Button>
                  </div>
                  <div className="mt-3">
                    <Select
                      value={creditCustomerId || "none"}
                      onValueChange={(val) => setCreditCustomerId(val === "none" ? "" : val)}
                    >
                      <SelectTrigger className="h-12 w-full rounded-xl border border-input bg-secondary px-3.5 text-sm">
                        <SelectValue placeholder="Selecione um cliente" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Selecione um cliente</SelectItem>
                        {pos.customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.id}>
                            {customer.name} · {customer.phone}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}
              {courtesy ? (
                <div className="rounded-2xl bg-wait/10 p-4 ring-1 ring-wait/30">
                  <p className="text-sm font-semibold text-wait">Fechamento sem pagamento</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    O total será zerado e a justificativa ficará no histórico.
                  </p>
                  <textarea
                    aria-label="Justificativa da cortesia"
                    value={courtesyReason}
                    onChange={(event) => setCourtesyReason(event.target.value)}
                    placeholder="Justificativa obrigatória"
                    className="mt-3 min-h-24 w-full resize-none rounded-xl border border-input bg-surface p-3 text-sm outline-none focus:ring-1 focus:ring-wait"
                  />
                </div>
              ) : (
                <div className="rounded-2xl glass-soft p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-muted-foreground">
                      Valor em {PAYMENT_LABELS[method]}
                    </span>
                    <span className="num text-3xl font-bold">{brl(centsToNumber(cents))}</span>
                  </div>
                  <Numpad
                    className="mt-3"
                    onDigit={(digit) => setCents((current) => pushDigit(current, digit))}
                    onBackspace={() => setCents(popDigit)}
                    onClear={() => setCents("")}
                  />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setCents(String(Math.round(remaining * 100)))}
                      className="h-12 rounded-xl text-xs flex items-center justify-between px-3"
                    >
                      <span>Restante {brl(remaining)}</span>
                      <kbd className="rounded bg-surface px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground border border-border">
                        Espaço
                      </kbd>
                    </Button>
                    <Button
                      type="button"
                      onClick={addPayment}
                      className="h-12 rounded-xl bg-brand/25 text-xs text-brand ring-1 ring-brand/40 flex items-center justify-between px-3"
                    >
                      <span>Adicionar pagamento</span>
                      <kbd className="rounded bg-brand/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-brand border border-brand/30">
                        +
                      </kbd>
                    </Button>
                  </div>
                </div>
              )}
              {payments.length ? (
                <div className="rounded-2xl glass-soft p-4">
                  {payments.map((payment, index) => (
                    <div
                      key={`${payment.method}-${index}`}
                      className="flex items-center justify-between py-1.5 text-sm"
                    >
                      <span>{PAYMENT_LABELS[payment.method]}</span>
                      <div className="flex items-center gap-3">
                        <span className="num">{brl(payment.amount)}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-8 px-2 text-xs text-wait"
                          onClick={() =>
                            setPayments((current) =>
                              current.filter((_, itemIndex) => itemIndex !== index),
                            )
                          }
                        >
                          remover
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm">
                    <span className="text-muted-foreground">Pendente</span>
                    <span className="num font-semibold">{brl(remaining)}</span>
                  </div>
                </div>
              ) : null}
              {change > 0 && cashPaid > 0 ? (
                <div className="rounded-2xl bg-free/15 p-4 ring-1 ring-free/40">
                  <p className="text-xs tracking-wider text-free uppercase">Troco</p>
                  <p className="num text-4xl font-bold text-free">{brl(change)}</p>
                </div>
              ) : null}
              <div className="mt-auto space-y-3">
                <div className="flex items-center gap-2 rounded-xl glass-soft px-3 py-2">
                  <Receipt className="size-4 text-muted-foreground" />
                  <input
                    value={cpf}
                    onChange={(event) => setCpf(event.target.value.replace(/\D/g, "").slice(0, 11))}
                    placeholder="CPF na nota (opcional)"
                    className="num w-full bg-transparent text-sm outline-none placeholder:font-sans placeholder:text-muted-foreground"
                  />
                </div>
                <Button
                  type="button"
                  onClick={finish}
                  className="h-16 w-full rounded-2xl bg-linear-to-br from-brand to-cyan font-display text-lg font-bold text-brand-foreground shadow-lg shadow-brand/30 flex items-center justify-between px-6"
                >
                  <span>{courtesy ? "Registrar Cortesia" : "Finalizar e Emitir NFC-e"}</span>
                  <kbd className="rounded-lg bg-black/20 px-2.5 py-1 font-mono text-xs font-semibold text-brand-foreground border border-white/20">
                    Enter ↵
                  </kbd>
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <CustomerDialog
        open={customerDialog}
        onOpenChange={setCustomerDialog}
        onCreated={(customer) => setCreditCustomerId(customer.id)}
      />
    </>
  );
}
