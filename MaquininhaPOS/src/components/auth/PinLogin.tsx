import { useState } from "react";
import { Delete, KeyRound, ShieldAlert, Sparkles, User, UserCheck } from "lucide-react";
import type { UserWaiter } from "../../lib/types";

interface PinLoginProps {
  waitersList: UserWaiter[];
  onLogin: (pin: string) => Promise<{ success: boolean; message?: string }>;
  isLoading: boolean;
}

export function PinLogin({ waitersList, onLogin, isLoading }: PinLoginProps) {
  const [pin, setPin] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserWaiter | null>(null);

  const handleDigit = (digit: string) => {
    if (pin.length >= 6) return;
    const nextPin = pin + digit;
    setPin(nextPin);
    setErrorMsg(null);

    // Se atingir 4 dígitos e já tiver selecionado usuário ou for login direto, tenta validar
    if (nextPin.length === 4) {
      submitPin(nextPin);
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setErrorMsg(null);
  };

  const handleClear = () => {
    setPin("");
    setErrorMsg(null);
  };

  const submitPin = async (inputPin = pin) => {
    if (inputPin.length < 4) {
      setErrorMsg("Digite o PIN de 4 dígitos.");
      return;
    }
    setErrorMsg(null);
    try {
      const res = await onLogin(inputPin);
      if (!res.success) {
        setErrorMsg(res.message || "PIN inválido.");
        if (typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }
        setPin("");
      }
    } catch {
      setErrorMsg("Erro ao validar PIN.");
      setPin("");
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] flex flex-col justify-between p-4 max-w-md mx-auto">
      {/* Topo: Logo & Título */}
      <div className="pt-6 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-slate-950 font-black shadow-xl shadow-emerald-500/20 mb-3 text-2xl">
          ⚡
        </div>
        <h2 className="text-xl font-bold text-white tracking-tight">Fluxo POS Garçom</h2>
        <p className="text-xs text-slate-400 mt-1">Terminal de Atendimento Móvel & Salão</p>

        {/* Seleção rápida de atendente (se houver lista) */}
        {waitersList.length > 0 && (
          <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
            {waitersList.map((w) => {
              const isSelected = selectedUser?.id === w.id;
              return (
                <button
                  key={w.id}
                  onClick={() => {
                    setSelectedUser(isSelected ? null : w);
                    setPin("");
                    setErrorMsg(null);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                    isSelected
                      ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/30 scale-105"
                      : "bg-slate-800/80 text-slate-300 border border-slate-700 hover:border-slate-600"
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>{w.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Meio: Indicadores de Dígitos e Mensagens */}
      <div className="my-auto py-4 text-center">
        <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 mb-3">
          <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
          <span>
            {selectedUser
              ? `Digite o PIN de ${selectedUser.name}`
              : "Digite seu PIN de 4 dígitos"}
          </span>
        </div>

        {/* Indicador visual de 4 pontinhos */}
        <div className="flex justify-center items-center gap-3.5 mb-3">
          {[0, 1, 2, 3].map((idx) => {
            const hasVal = pin.length > idx;
            return (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full transition-all duration-200 ${
                  hasVal
                    ? "bg-emerald-400 scale-110 shadow-lg shadow-emerald-500/50"
                    : "bg-slate-800 border border-slate-700"
                }`}
              />
            );
          })}
        </div>

        {errorMsg && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs rounded-lg animate-shake">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Base: Teclado Numérico Ergonômico de Alta Resposta */}
      <div className="pb-6">
        <div className="grid grid-cols-3 gap-2.5 max-w-[320px] mx-auto">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-16 rounded-2xl bg-slate-800/80 hover:bg-slate-700 active:bg-emerald-600 active:text-slate-950 border border-slate-700/70 text-2xl font-bold text-slate-100 flex items-center justify-center shadow-md active:scale-95 transition-all"
            >
              {digit}
            </button>
          ))}

          {/* Botão Limpar */}
          <button
            type="button"
            onClick={handleClear}
            className="h-16 rounded-2xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-400 flex items-center justify-center uppercase tracking-wider active:scale-95 transition-all"
          >
            Limpar
          </button>

          {/* Zero */}
          <button
            type="button"
            onClick={() => handleDigit("0")}
            className="h-16 rounded-2xl bg-slate-800/80 hover:bg-slate-700 active:bg-emerald-600 active:text-slate-950 border border-slate-700/70 text-2xl font-bold text-slate-100 flex items-center justify-center shadow-md active:scale-95 transition-all"
          >
            0
          </button>

          {/* Apagar */}
          <button
            type="button"
            onClick={handleBackspace}
            className="h-16 rounded-2xl bg-slate-900/90 hover:bg-slate-800 active:bg-rose-500/20 active:text-rose-400 border border-slate-800 text-slate-300 flex items-center justify-center active:scale-95 transition-all"
          >
            <Delete className="w-6 h-6" />
          </button>
        </div>

        <p className="text-[11px] text-center text-slate-500 mt-4">
          PIN de demonstração rápida: <span className="font-mono text-emerald-400 font-bold">1234</span>
        </p>
      </div>
    </div>
  );
}
