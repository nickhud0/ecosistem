import { useState } from "react";
import {
  ArrowLeft,
  Banknote,
  Check,
  CheckCircle,
  CreditCard,
  QrCode,
  Receipt,
  Users,
  X,
} from "lucide-react";
import { brl } from "../../lib/format";
import type { Payment, PaymentMethod, TableT } from "../../lib/types";

interface CheckoutModalProps {
  table: TableT;
  onFinishCheckout: (summary: {
    subtotal: number;
    serviceFee: number;
    discount: number;
    total: number;
    payments: Payment[];
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
  const [splitCount, setSplitCount] = useState<number>(1);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>("credito");
  const [cashGiven, setCashGiven] = useState<string>("");
  const [showPixQr, setShowPixQr] = useState<boolean>(false);
  const [paidSuccess, setPaidSuccess] = useState<boolean>(false);

  const subtotal = table.items.reduce(
    (acc, it) => acc + (it.totalPrice ?? it.qty * it.unitPrice),
    0
  );
  const serviceFee = includeServiceFee ? subtotal * 0.1 : 0;
  const total = subtotal + serviceFee;
  const perPerson = total / splitCount;

  // Cálculo de troco para dinheiro
  const cashNum = parseFloat(cashGiven.replace(",", ".")) || 0;
  const change = Math.max(0, cashNum - total);

  const handleConfirmPayment = async () => {
    const paymentPayload: Payment = {
      method: selectedMethod,
      amount: total,
      changeAmount: selectedMethod === "dinheiro" ? change : 0,
    };

    const success = await onFinishCheckout({
      subtotal,
      serviceFee,
      discount: 0,
      total,
      payments: [paymentPayload],
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
      }, 1500);
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
            <p className="text-[11px] text-slate-400">Checkout e encerramento da comanda</p>
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-md mx-auto w-full">
        {paidSuccess ? (
          /* Estado de Sucesso */
          <div className="py-16 text-center space-y-3">
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto animate-bounce">
              <CheckCircle className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-black text-white">Pagamento Aprovado!</h3>
            <p className="text-xs text-slate-400">
              Mesa #{table.number} liberada com sucesso. Comprovante emitido!
            </p>
          </div>
        ) : (
          <>
            {/* Bloco de Valor Total em Destaque */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/40 p-4 rounded-3xl border border-slate-800 text-center shadow-lg">
              <span className="text-xs text-slate-400 font-medium">Total a Pagar</span>
              <div className="text-3xl font-black text-white tracking-tight mt-1">
                {brl(total)}
              </div>

              {/* Divisão por pessoa */}
              {splitCount > 1 && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/15 border border-emerald-500/30 rounded-xl mt-2 text-xs font-bold text-emerald-300">
                  <Users className="w-3.5 h-3.5" />
                  <span>
                    {brl(perPerson)} por pessoa ({splitCount}x)
                  </span>
                </div>
              )}

              {/* Toggle de Taxa de Serviço */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <span className="text-slate-400">Taxa de Serviço (10%): {brl(subtotal * 0.1)}</span>
                <button
                  type="button"
                  onClick={() => setIncludeServiceFee(!includeServiceFee)}
                  className={`px-3 py-1 rounded-lg font-bold transition-all ${
                    includeServiceFee
                      ? "bg-emerald-500 text-slate-950"
                      : "bg-slate-800 text-slate-400 border border-slate-700"
                  }`}
                >
                  {includeServiceFee ? "Incluída" : "Dispensada"}
                </button>
              </div>
            </div>

            {/* Divisão da Conta (Split) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-indigo-400" />
                <span>Dividir Conta Entre Clientes</span>
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setSplitCount(num)}
                    className={`h-11 rounded-xl text-xs font-bold transition-all ${
                      splitCount === num
                        ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/30"
                        : "bg-slate-900 border border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    {num === 1 ? "1 (Total)" : `${num} pessoas`}
                  </button>
                ))}
              </div>
            </div>

            {/* Métodos de Pagamento na Maquininha */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400">
                Forma de Pagamento na Maquininha
              </label>

              <div className="grid grid-cols-2 gap-2">
                {/* Cartão de Crédito */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMethod("credito");
                    setShowPixQr(false);
                  }}
                  className={`p-3 rounded-2xl border text-left flex items-center gap-3 transition-all ${
                    selectedMethod === "credito"
                      ? "bg-indigo-950/30 border-indigo-500 shadow-md ring-1 ring-indigo-500/40"
                      : "bg-slate-900 border-slate-800 text-slate-300"
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">Cartão Crédito</div>
                    <div className="text-[10px] text-slate-400">Inserir ou aproximar</div>
                  </div>
                </button>

                {/* Cartão de Débito */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMethod("debito");
                    setShowPixQr(false);
                  }}
                  className={`p-3 rounded-2xl border text-left flex items-center gap-3 transition-all ${
                    selectedMethod === "debito"
                      ? "bg-teal-950/30 border-teal-500 shadow-md ring-1 ring-teal-500/40"
                      : "bg-slate-900 border-slate-800 text-slate-300"
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">Cartão Débito</div>
                    <div className="text-[10px] text-slate-400">Inserir ou aproximar</div>
                  </div>
                </button>

                {/* PIX Dinâmico com QR Code na Maquininha */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMethod("pix");
                    setShowPixQr(true);
                  }}
                  className={`p-3 rounded-2xl border text-left flex items-center gap-3 transition-all ${
                    selectedMethod === "pix"
                      ? "bg-emerald-950/30 border-emerald-500 shadow-md ring-1 ring-emerald-500/40"
                      : "bg-slate-900 border-slate-800 text-slate-300"
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <QrCode className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">PIX QR Code</div>
                    <div className="text-[10px] text-slate-400">Exibir na tela</div>
                  </div>
                </button>

                {/* Dinheiro */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMethod("dinheiro");
                    setShowPixQr(false);
                  }}
                  className={`p-3 rounded-2xl border text-left flex items-center gap-3 transition-all ${
                    selectedMethod === "dinheiro"
                      ? "bg-amber-950/30 border-amber-500 shadow-md ring-1 ring-amber-500/40"
                      : "bg-slate-900 border-slate-800 text-slate-300"
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <Banknote className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">Dinheiro</div>
                    <div className="text-[10px] text-slate-400">Calculadora troco</div>
                  </div>
                </button>
              </div>
            </div>

            {/* Bloco Condicional: PIX QR Code na Tela */}
            {selectedMethod === "pix" && showPixQr && (
              <div className="p-4 bg-slate-900 rounded-2xl border border-emerald-500/30 text-center space-y-2">
                <span className="text-xs font-bold text-emerald-400">
                  Aproxime o celular do cliente para escanear
                </span>
                <div className="w-40 h-40 bg-white p-3 rounded-2xl mx-auto flex items-center justify-center shadow-lg">
                  {/* Simulação de QR Code de alta densidade */}
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=PIX_MESA_${table.number}_VALOR_${total.toFixed(2)}`}
                    alt="QR Code PIX"
                    className="w-full h-full object-contain"
                  />
                </div>
                <p className="text-[11px] text-slate-400">
                  Valor exato: <strong className="text-white font-mono">{brl(total)}</strong>
                </p>
              </div>
            )}

            {/* Bloco Condicional: Calculadora de Troco para Dinheiro */}
            {selectedMethod === "dinheiro" && (
              <div className="p-3.5 bg-slate-900 rounded-2xl border border-slate-800 space-y-2">
                <label className="text-xs font-semibold text-slate-300">
                  Valor Recebido do Cliente (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={cashGiven}
                  onChange={(e) => setCashGiven(e.target.value)}
                  placeholder={`Ex: ${(total + 10).toFixed(2)}`}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-base font-bold text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
                {cashNum > total && (
                  <div className="flex justify-between items-center pt-2 border-t border-slate-800 text-xs">
                    <span className="text-slate-400">Troco a Devolver:</span>
                    <span className="text-base font-extrabold text-amber-400">{brl(change)}</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Rodapé com Botão de Confirmação */}
      {!paidSuccess && (
        <div className="p-3 bg-[#0f172a] border-t border-slate-800 shadow-xl max-w-md mx-auto w-full">
          <button
            onClick={handleConfirmPayment}
            disabled={isSubmitting}
            className="w-full h-13 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 active:scale-95 transition-all disabled:opacity-50"
          >
            <Check className="w-5 h-5" />
            <span>
              {isSubmitting
                ? "Processando..."
                : `Confirmar ${brl(total)} e Liberar Mesa`}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
