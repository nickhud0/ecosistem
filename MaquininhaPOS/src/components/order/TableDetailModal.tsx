import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChefHat,
  Clock,
  CreditCard,
  Plus,
  Printer,
  Receipt,
  Trash2,
  User,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { brl, elapsed } from "../../lib/format";
import { printReceipt } from "../../lib/printer-58mm";
import type { OrderItem, TableT, UserWaiter } from "../../lib/types";

interface TableDetailModalProps {
  table: TableT;
  activeWaiter: UserWaiter | null;
  onClose: () => void;
  onOpenTable: () => Promise<void> | void;
  onAddItems: () => void;
  onRemoveItem: (item: OrderItem) => void;
  onSendToKitchen: () => Promise<void> | void;
  onRequestBill: () => Promise<void> | void;
  onStartCheckout: () => void;
  isSubmitting: boolean;
}

export function TableDetailModal({
  table,
  activeWaiter,
  onClose,
  onOpenTable,
  onAddItems,
  onRemoveItem,
  onSendToKitchen,
  onRequestBill,
  onStartCheckout,
  isSubmitting,
}: TableDetailModalProps) {
  const [itemToDelete, setItemToDelete] = useState<OrderItem | null>(null);

  const isFree = table.status === "livre";
  const isBill = table.status === "conta";

  const pendingKitchenItems = table.items.filter((i) => !i.sentToKitchen);
  const pendingCount = pendingKitchenItems.reduce((acc, it) => acc + (it.qty || 1), 0);

  const subtotal = table.items.reduce(
    (acc, it) => acc + (it.totalPrice ?? it.qty * it.unitPrice),
    0
  );
  const serviceFee = subtotal * 0.1;
  const total = subtotal + serviceFee;

  const handlePrintPreConta = () => {
    printReceipt({
      title: "Conferência de Mesa (Pré-Conta)",
      tableNumber: table.number,
      waiter: table.waiter,
      items: table.items,
      subtotal,
      serviceFee,
      discount: 0,
      total,
      openedAt: table.openedAt,
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex flex-col justify-end hardware-accelerated">
      <div className="bg-[#0f172a] rounded-t-3xl border-t border-slate-800 max-h-[92vh] flex flex-col max-w-md mx-auto w-full shadow-2xl hardware-accelerated">
        {/* Barra superior de arrasto / Header */}
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-slate-800 flex items-center justify-center font-black text-lg text-emerald-400">
              #{String(table.number).padStart(2, "0")}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Mesa {table.number}
                </h2>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isBill
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                      : isFree
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  }`}
                >
                  {isBill ? "Pediu Conta" : isFree ? "Livre" : "Ocupada"}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {isFree ? `${table.seats} lugares` : `Atendente: ${table.waiter}`}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo Central */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isFree ? (
            /* Mesa Livre: Card de Boas-Vindas e Abertura */
            <div className="py-8 text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
                <Users className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-white">Mesa Disponível</h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Esta mesa está livre para novos clientes. Você pode abri-la agora e começar a anotar os pedidos.
              </p>
              <button
                onClick={onOpenTable}
                disabled={isSubmitting}
                className="w-full h-13 mt-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-base shadow-lg shadow-emerald-500/25 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                <span>Abrir Mesa #{table.number}</span>
              </button>
            </div>
          ) : (
            /* Mesa Ocupada: Extrato de Itens e Resumo */
            <>
              {/* Metadados: Tempo e Garçom */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <div>
                    <div className="text-[10px] text-slate-400">Permanência</div>
                    <div className="font-semibold text-slate-200">{elapsed(table.openedAt)}</div>
                  </div>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded-xl border border-slate-800 flex items-center gap-2">
                  <User className="w-4 h-4 text-indigo-400" />
                  <div>
                    <div className="text-[10px] text-slate-400">Atendimento</div>
                    <div className="font-semibold text-slate-200 truncate">{table.waiter}</div>
                  </div>
                </div>
              </div>

              {/* Lista de Itens Consumidos */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-400 px-1">
                  <span>Itens Consumidos ({table.items.length})</span>
                  <span>Valor</span>
                </div>

                {table.items.length > 0 ? (
                  <div className="bg-slate-900/60 rounded-2xl border border-slate-800 divide-y divide-slate-800/80 overflow-hidden">
                    {table.items.map((it) => (
                      <div key={it.id} className="p-3 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-2">
                          <span className="w-6 text-center font-bold text-emerald-400 text-xs bg-emerald-500/10 py-1 rounded-md border border-emerald-500/20 shrink-0">
                            {it.qty}x
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-medium text-slate-100">{it.name}</span>
                              {it.sentToKitchen ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/30">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Cozinha {it.kitchenRound ? `(R${it.kitchenRound})` : ""}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/40 animate-pulse">
                                  <Clock className="w-3 h-3" />
                                  Pendente
                                </span>
                              )}
                            </div>
                            {it.details && it.details.length > 0 && (
                              <div className="text-[11px] text-slate-400 truncate">
                                {it.details.join(", ")}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="font-bold text-slate-200">
                            {brl(it.totalPrice ?? it.qty * it.unitPrice)}
                          </div>
                          <button
                            type="button"
                            onClick={() => setItemToDelete(it)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/15 active:scale-90 transition-all"
                            title="Remover item da comanda"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center bg-slate-900/30 rounded-2xl border border-dashed border-slate-800 text-slate-500 text-xs">
                    Nenhum item lançado ainda nesta comanda.
                  </div>
                )}
              </div>

              {/* Bloco de Totais */}
              <div className="bg-slate-900/90 rounded-2xl border border-slate-800 p-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal</span>
                  <span className="font-medium text-slate-200">{brl(subtotal)}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Taxa de Serviço sugerida (10%)</span>
                  <span className="font-medium text-slate-200">{brl(serviceFee)}</span>
                </div>
                <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-sm font-extrabold text-white">
                  <span>Total da Mesa</span>
                  <span className="text-base text-emerald-400">{brl(total)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Rodapé com Botões de Ação para Mesa Ocupada */}
        {!isFree && (
          <div className="p-3 bg-[#0c1220] border-t border-slate-800/80 space-y-2">
            {/* Botão de Destaque Primário: Enviar para Cozinha quando houver itens pendentes */}
            {pendingCount > 0 && (
              <button
                onClick={onSendToKitchen}
                disabled={isSubmitting}
                className="w-full h-13 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-black text-sm flex items-center justify-between px-4 shadow-lg shadow-amber-500/30 active:scale-95 transition-all"
              >
                <div className="flex items-center gap-2">
                  <ChefHat className="w-5 h-5 text-slate-950" />
                  <span>
                    Enviar para Cozinha ({pendingCount}{" "}
                    {pendingCount === 1 ? "item pendente" : "itens pendentes"})
                  </span>
                </div>
                <span className="text-[11px] bg-slate-950/20 px-2.5 py-1 rounded-lg font-black uppercase tracking-wider">
                  Despachar
                </span>
              </button>
            )}

            {/* Linha 1: Anotar Mais Itens */}
            <button
              onClick={onAddItems}
              className="w-full h-12 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-bold text-sm flex items-center justify-center gap-2 border border-slate-700 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>Anotar Mais Itens / Pedidos</span>
            </button>

            {/* Linha 2: Imprimir Pré-conta e Cobrar na Maquininha */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handlePrintPreConta}
                disabled={table.items.length === 0}
                className="h-12 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-40"
              >
                <Printer className="w-4 h-4 text-slate-400" />
                <span>Imprimir Pré-Conta</span>
              </button>

              <button
                onClick={onStartCheckout}
                disabled={table.items.length === 0}
                className="h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/25 active:scale-95 transition-all disabled:opacity-40"
              >
                <CreditCard className="w-4 h-4" />
                <span>Cobrar na Mesa</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Diálogo de Confirmação de Exclusão de Item */}
      {itemToDelete && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 hardware-accelerated animate-in fade-in-50 duration-150">
          <div className="bg-[#0f172a] rounded-3xl border border-slate-800 p-5 max-w-sm w-full shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Cancelar Item</h3>
                <p className="text-xs text-slate-400">Deseja remover este item da mesa?</p>
              </div>
            </div>

            {/* Detalhes do item a remover */}
            <div className="bg-slate-900/80 p-3 rounded-2xl border border-slate-800 space-y-1">
              <div className="flex justify-between items-center text-sm font-bold text-slate-200">
                <span>
                  {itemToDelete.qty}x {itemToDelete.name}
                </span>
                <span className="text-emerald-400">
                  {brl(itemToDelete.totalPrice ?? itemToDelete.qty * itemToDelete.unitPrice)}
                </span>
              </div>
              {itemToDelete.details && itemToDelete.details.length > 0 && (
                <p className="text-[11px] text-slate-400">{itemToDelete.details.join(", ")}</p>
              )}
            </div>

            {/* Aviso crítico caso já esteja despachado para a cozinha */}
            {itemToDelete.sentToKitchen && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 flex items-start gap-2.5 text-xs text-amber-300">
                <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
                <div>
                  <div className="font-bold text-amber-200">Item já enviado para a Cozinha!</div>
                  <p className="text-[11px] text-amber-300/80 mt-0.5">
                    Este item foi despachado (Rodada #{itemToDelete.kitchenRound || 1}). Ao cancelar, avise a equipe da cozinha/bar para interromper o preparo.
                  </p>
                </div>
              </div>
            )}

            {/* Botões de Ação */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                className="h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs active:scale-95 transition-all"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => {
                  const it = itemToDelete;
                  setItemToDelete(null);
                  onRemoveItem(it);
                }}
                className="h-11 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 active:scale-95 transition-all flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirmar Exclusão</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
