import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  Check,
  CheckCircle,
  Copy,
  CreditCard,
  Plus,
  QrCode,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { brl, uid } from "../../lib/format";
import { generatePixPayload, generateQrCodeSvg } from "../../lib/pix-emvco";
import { PAYMENT_LABELS, type Payment, type PaymentMethod, type TableT } from "../../lib/types";

interface CheckoutModalProps {
  table: TableT;
  onFinishCheckout: (summary: {
    subtotal: number;
    serviceFee: number;
    discount: number;
    total: number;
    payments: Payment[];
    cpf?: string | null;
  }) => Promise<boolean>;
  onClose: () => void;
  isSubmitting: boolean;
}

export function CheckoutModal({
  table,
  onFinishCheckout,
  onClose,
  isSubmitting,
}: CheckoutModalProps) {
  const [includeServiceFee, setIncludeServiceFee] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("credito");
  const [amountInput, setAmountInput] = useState<string>("");
  const [cashGiven, setCashGiven] = useState<string>("");
  const [cpf, setCpf] = useState<string>("");
  const [showPixQr, setShowPixQr] = useState<boolean>(false);
  const [paidSuccess, setPaidSuccess] = useState<boolean>(false);

  // Cálculos base
  const subtotal = table.items.reduce(
    (acc, it) => acc + (it.totalPrice ?? it.qty * it.unitPrice),
    0
  );
  const serviceFee = includeServiceFee ? subtotal * 0.1 : 0;
  const total = subtotal + serviceFee;

  const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
  const remaining = Math.max(0, Number((total - totalPaid).toFixed(2)));

  // Valor a pagar na parcela atual
  const currentParcelAmount = useMemo(() => {
    if (!amountInput) return remaining;
    const parsed = parseFloat(amountInput.replace(",", "."));
    if (isNaN(parsed) || parsed <= 0) return remaining;
    return Math.min(parsed, remaining);
  }, [amountInput, remaining]);

  // Cálculo de troco para dinheiro
  const cashNum = parseFloat(cashGiven.replace(",", ".")) || 0;
  const change = Math.max(0, cashNum - currentParcelAmount);

  // Payload e SVG do PIX local (100% offline)
  const { pixPayload, pixSvg } = useMemo(() => {
    if (selectedMethod !== "pix" || currentParcelAmount <= 0) {
      return { pixPayload: "", pixSvg: "" };
    }
    const payload = generatePixPayload({
      pixKey: "restaurante@fluxopdv.com.br",
      merchantName: "FLUXO RESTAURANTE",
      merchantCity: "SAO PAULO",
      amount: currentParcelAmount,
      txId: `MESA${table.number}`,
      description: `Mesa ${table.number}`,
    });
    const svg = generateQrCodeSvg(payload, 180);
    return { pixPayload: payload, pixSvg: svg };
  }, [selectedMethod, currentParcelAmount, table.number]);

  // Adiciona pagamento parcial à lista
  const handleAddPayment = () => {
    if (currentParcelAmount <= 0) return;

    const newPayment: Payment = {
      id: uid(),
      method: selectedMethod,
      amount: currentParcelAmount,
      changeAmount: selectedMethod === "dinheiro" ? change : 0,
      timestamp: Date.now(),
    };

    setPayments((prev) => [...prev, newPayment]);
    setAmountInput("");
    setCashGiven("");
    setShowPixQr(false);

    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate(20);
      }
    } catch {
      // Ignora
    }
  };

  const handleRemovePayment = (index: number) => {
    setPayments((prev) => prev.filter((_, i) => i !== index));
  };

  // Finalização definitiva da mesa
  const handleFinalizeCheckout = async () => {
    let finalPayments = [...payments];

    // Se o operador não adicionou pagamentos avulsos mas clicou direto com saldo total
    if (finalPayments.length === 0 && remaining > 0) {
      finalPayments = [
        {
          id: uid(),
          method: selectedMethod,
          amount: total,
          changeAmount: selectedMethod === "dinheiro" ? change : 0,
          timestamp: Date.now(),
        },
      ];
    }

    const success = await onFinishCheckout({
      subtotal,
      serviceFee,
      discount: 0,
      total,
      payments: finalPayments,
      cpf: cpf.trim() || null,
    });

    if (success) {
      setPaidSuccess(true);
      try {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate([25, 50, 25]);
        }
      } catch {
        // Ignora
      }
      setTimeout(() => {
        onClose();
      }, 1600);
    }
  };

  const handleCopyPix = () => {
    if (!pixPayload) return;
    try {
      navigator.clipboard.writeText(pixPayload);
      toast.success("Código PIX Copia e Cola copiado!");
    } catch {
      toast.error("Falha ao copiar código PIX.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#090d16] flex flex-col justify-between animate-in fade-in-50 duration-200">
      {/* Topo: Header */}
      <div className="bg-[#0f172a] border-b border-slate-800 p-3.5 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 rounded-xl bg-slate-800 text-slate-300 active:scale-95 transition-transform"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Cobrança • Mesa #{String(table.number).padStart(2, "0")}
            </h2>
            <p className="text-[11px] text-slate-400">Checkout com suporte a múltiplos pagamentos</p>
          </div>
        </div>

        <button
          onClick={onClose}
          disabled={isSubmitting}
          className="p-2 rounded-xl text-slate-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Conteúdo Central */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-md mx-auto w-full pb-28">
        {paidSuccess ? (
          /* Estado de Sucesso */
          <div className="py-16 text-center space-y-3">
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto animate-bounce">
              <CheckCircle className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-black text-white">Pagamento Concluído!</h3>
            <p className="text-xs text-slate-400">
              Mesa #{table.number} liberada com sucesso. Comprovante emitido na bobina!
            </p>
          </div>
        ) : (
          <>
            {/* Bloco de Totais e Saldo Restante */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/40 p-4 rounded-3xl border border-slate-800 text-center shadow-lg">
              <div className="grid grid-cols-2 gap-2 pb-3 border-b border-slate-800/80 text-left">
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase">
                    Total da Conta
                  </span>
                  <div className="text-lg font-black text-white">{brl(total)}</div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] text-slate-400 font-semibold uppercase">
                    Saldo a Pagar
                  </span>
                  <div
                    className={`text-2xl font-black ${
                      remaining === 0 ? "text-emerald-400" : "text-amber-400"
                    }`}
                  >
                    {brl(remaining)}
                  </div>
                </div>
              </div>

              {/* Toggle de Taxa de Serviço */}
              <div className="mt-3 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  Taxa de Serviço 10%: <strong className="text-slate-300">{brl(subtotal * 0.1)}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setIncludeServiceFee(!includeServiceFee)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                    includeServiceFee
                      ? "bg-emerald-500 text-slate-950"
                      : "bg-slate-800 text-slate-400 border border-slate-700"
                  }`}
                >
                  {includeServiceFee ? "Incluída" : "Dispensada"}
                </button>
              </div>
            </div>

            {/* Lista de Pagamentos Parciais Já Efetuados */}
            {payments.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs font-semibold text-slate-400 px-1">
                  <span>Pagamentos Efetuados ({payments.length})</span>
                  <span className="text-emerald-400 font-bold">Pago: {brl(totalPaid)}</span>
                </div>

                <div className="bg-slate-900/80 rounded-2xl border border-slate-800 divide-y divide-slate-800 overflow-hidden">
                  {payments.map((p, idx) => (
                    <div
                      key={p.id || idx}
                      className="p-2.5 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-[10px]">
                          {idx + 1}
                        </span>
                        <div>
                          <span className="font-bold text-white">
                            {PAYMENT_LABELS[p.method]}
                          </span>
                          {p.changeAmount && p.changeAmount > 0 ? (
                            <span className="text-[10px] text-amber-400 ml-1.5">
                              (Troco: {brl(p.changeAmount)})
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-emerald-400">
                          {brl(p.amount)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemovePayment(idx)}
                          className="p-1 rounded text-slate-500 hover:text-rose-400 active:scale-90"
                          title="Remover parcela"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Se ainda há saldo a pagar: Seleção de Método e Valor */}
            {remaining > 0 ? (
              <>
                {/* Métodos de Pagamento */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-400">
                    Forma de Pagamento da Parcela
                  </label>

                  <div className="grid grid-cols-2 gap-2">
                    {/* Cartão de Crédito */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethod("credito");
                        setShowPixQr(false);
                      }}
                      className={`p-3 rounded-2xl border text-left flex items-center gap-2.5 transition-all ${
                        selectedMethod === "credito"
                          ? "bg-indigo-950/30 border-indigo-500 shadow-md ring-1 ring-indigo-500/40"
                          : "bg-slate-900 border-slate-800 text-slate-300"
                      }`}
                    >
                      <div className="w-9 h-9 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                        <CreditCard className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">Crédito</div>
                        <div className="text-[10px] text-slate-400">Inserir / aproximação</div>
                      </div>
                    </button>

                    {/* Cartão de Débito */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethod("debito");
                        setShowPixQr(false);
                      }}
                      className={`p-3 rounded-2xl border text-left flex items-center gap-2.5 transition-all ${
                        selectedMethod === "debito"
                          ? "bg-teal-950/30 border-teal-500 shadow-md ring-1 ring-teal-500/40"
                          : "bg-slate-900 border-slate-800 text-slate-300"
                      }`}
                    >
                      <div className="w-9 h-9 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center shrink-0">
                        <CreditCard className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">Débito</div>
                        <div className="text-[10px] text-slate-400">Inserir / aproximação</div>
                      </div>
                    </button>

                    {/* PIX Dinâmico Offline */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethod("pix");
                        setShowPixQr(true);
                      }}
                      className={`p-3 rounded-2xl border text-left flex items-center gap-2.5 transition-all ${
                        selectedMethod === "pix"
                          ? "bg-emerald-950/30 border-emerald-500 shadow-md ring-1 ring-emerald-500/40"
                          : "bg-slate-900 border-slate-800 text-slate-300"
                      }`}
                    >
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                        <QrCode className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">PIX QR Code</div>
                        <div className="text-[10px] text-slate-400">EMVCo na tela</div>
                      </div>
                    </button>

                    {/* Dinheiro */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethod("dinheiro");
                        setShowPixQr(false);
                      }}
                      className={`p-3 rounded-2xl border text-left flex items-center gap-2.5 transition-all ${
                        selectedMethod === "dinheiro"
                          ? "bg-amber-950/30 border-amber-500 shadow-md ring-1 ring-amber-500/40"
                          : "bg-slate-900 border-slate-800 text-slate-300"
                      }`}
                    >
                      <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                        <Banknote className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">Dinheiro</div>
                        <div className="text-[10px] text-slate-400">Cálculo de troco</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Seleção do Valor da Parcela com Atalhos de Split */}
                <div className="space-y-2 bg-slate-900/90 p-3.5 rounded-2xl border border-slate-800">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-slate-300">
                      Valor desta Parcela (R$)
                    </label>
                    <span className="text-xs font-extrabold text-emerald-400">
                      {brl(currentParcelAmount)}
                    </span>
                  </div>

                  {/* Atalhos de Divisão Rápida */}
                  <div className="grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAmountInput(remaining.toFixed(2))}
                      className="py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-200 border border-slate-700 active:scale-95"
                    >
                      Restante ({brl(remaining)})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAmountInput((remaining / 2).toFixed(2))}
                      className="py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-200 border border-slate-700 active:scale-95"
                    >
                      1/2 ({brl(remaining / 2)})
                    </button>
                    <button
                      type="button"
                      onClick={() => setAmountInput((remaining / 3).toFixed(2))}
                      className="py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-[11px] font-bold text-slate-200 border border-slate-700 active:scale-95"
                    >
                      1/3 ({brl(remaining / 3)})
                    </button>
                  </div>

                  <input
                    type="number"
                    step="0.01"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder={`Valor personalizado (máx: ${remaining.toFixed(2)})`}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm font-bold text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* Bloco Condicional: PIX QR Code Local EMVCo */}
                {selectedMethod === "pix" && showPixQr && pixSvg && (
                  <div className="p-4 bg-slate-900 rounded-2xl border border-emerald-500/30 text-center space-y-3 animate-in fade-in-50">
                    <span className="text-xs font-bold text-emerald-400">
                      Aproxime o celular do cliente para escanear
                    </span>

                    {/* Renderizador Vetorial SVG Local */}
                    <div
                      className="flex items-center justify-center mx-auto"
                      dangerouslySetInnerHTML={{ __html: pixSvg }}
                    />

                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyPix}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 active:scale-95"
                      >
                        <Copy className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copiar Chave Copia e Cola</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Bloco Condicional: Calculadora de Troco para Dinheiro */}
                {selectedMethod === "dinheiro" && (
                  <div className="p-3.5 bg-slate-900 rounded-2xl border border-slate-800 space-y-2">
                    <label className="text-xs font-semibold text-slate-300">
                      Valor em Dinheiro Entregue (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={cashGiven}
                      onChange={(e) => setCashGiven(e.target.value)}
                      placeholder={`Ex: ${(currentParcelAmount + 10).toFixed(2)}`}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-base font-bold text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                    />
                    {cashNum > currentParcelAmount && (
                      <div className="flex justify-between items-center pt-2 border-t border-slate-800 text-xs">
                        <span className="text-slate-400">Troco a Devolver:</span>
                        <span className="text-base font-extrabold text-amber-400">
                          {brl(change)}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Campo Opcional: CPF na Nota */}
                <div className="pt-2">
                  <input
                    type="text"
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                    placeholder="CPF do cliente para a nota (opcional)..."
                    maxLength={14}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </>
            ) : (
              /* Saldo Totalmente Liquidado */
              <div className="p-4 bg-emerald-950/20 border border-emerald-500/40 rounded-2xl text-center space-y-1">
                <Check className="w-8 h-8 text-emerald-400 mx-auto" />
                <h4 className="text-sm font-bold text-white">Saldo Totalmente Liquidado!</h4>
                <p className="text-xs text-slate-400">
                  Todos os pagamentos foram registrados. Clique abaixo para emitir o comprovante e liberar a mesa.
                </p>
                {/* Campo Opcional: CPF na Nota quando quitado */}
                <div className="pt-3">
                  <input
                    type="text"
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                    placeholder="CPF do cliente para a nota (opcional)..."
                    maxLength={14}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Rodapé com Botão Principal de Conclusão */}
      {!paidSuccess && (
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-[#0f172a] border-t border-slate-800 shadow-xl max-w-md mx-auto w-full z-40">
          <button
            onClick={() => {
              if (remaining === 0) {
                handleFinalizeCheckout();
              } else if (currentParcelAmount < remaining - 0.009) {
                handleAddPayment();
              } else if (payments.length === 0) {
                handleFinalizeCheckout();
              } else {
                handleAddPayment();
              }
            }}
            disabled={isSubmitting}
            className="w-full h-13 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 active:scale-95 transition-all disabled:opacity-50"
          >
            <Check className="w-5 h-5" />
            <span>
              {isSubmitting
                ? "Processando..."
                : remaining === 0
                ? "Liberar Mesa e Imprimir Comprovante"
                : currentParcelAmount < remaining - 0.009
                ? `Registrar Parcela de ${brl(currentParcelAmount)}`
                : payments.length === 0
                ? `Confirmar ${brl(total)} e Liberar Mesa`
                : `Registrar Restante de ${brl(currentParcelAmount)}`}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
