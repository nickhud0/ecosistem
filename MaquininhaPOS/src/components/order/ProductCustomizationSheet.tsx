import { useMemo, useState } from "react";
import { Check, Flame, MessageSquare, Minus, Plus, Utensils, X } from "lucide-react";
import { brl, uid } from "../../lib/format";
import type { OrderItem, Product } from "../../lib/types";

interface ProductCustomizationSheetProps {
  product: Product;
  onConfirm: (item: OrderItem) => void;
  onClose: () => void;
}

const DEFAULT_MEAT_OPTIONS = ["Mal passada", "Ao ponto", "Bem passada"];
const DEFAULT_QUICK_NOTES = [
  "Com gelo e limão",
  "Sem gelo",
  "Copos descartáveis",
  "Pouco sal",
  "Caprichado",
];

export function ProductCustomizationSheet({
  product,
  onConfirm,
  onClose,
}: ProductCustomizationSheetProps) {
  const [qty, setQty] = useState(1);
  const [selectedDoneness, setSelectedDoneness] = useState<string | null>(
    product.category?.toLowerCase().includes("lanche") ||
      product.category?.toLowerCase().includes("prato") ||
      product.name.toLowerCase().includes("burger") ||
      product.name.toLowerCase().includes("picanha")
      ? "Ao ponto"
      : null
  );
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [selectedAddons, setSelectedAddons] = useState<Map<string, number>>(new Map());
  const [customNote, setCustomNote] = useState("");

  const exclusions = useMemo(() => {
    if (product.customization?.exclusions && product.customization.exclusions.length > 0) {
      return product.customization.exclusions;
    }
    if (product.exclusions && product.exclusions.length > 0) {
      return product.exclusions;
    }
    // Padrão inteligente por categoria
    const cat = product.category?.toLowerCase() || "";
    if (cat.includes("lanche") || product.name.toLowerCase().includes("burger")) {
      return ["Sem cebola", "Sem tomate", "Sem alface", "Sem picles", "Sem maionese"];
    }
    if (cat.includes("prato")) {
      return ["Sem cebola", "Sem alho", "Molho à parte", "Pouco sal"];
    }
    return [];
  }, [product]);

  const addonsList = useMemo(() => {
    if (product.customization?.addons && product.customization.addons.length > 0) {
      return product.customization.addons;
    }
    if (product.addons && product.addons.length > 0) {
      return product.addons;
    }
    const cat = product.category?.toLowerCase() || "";
    if (cat.includes("lanche") || product.name.toLowerCase().includes("burger")) {
      return [
        { id: "add-bacon", name: "Bacon crocante", price: 5 },
        { id: "add-queijo", name: "Queijo cheddar duplo", price: 6 },
        { id: "add-ovo", name: "Ovo frito", price: 3 },
        { id: "add-hamburguer", name: "Hambúrguer extra (160g)", price: 12 },
      ];
    }
    if (cat.includes("prato") || cat.includes("entrada")) {
      return [
        { id: "add-batata", name: "Porção extra de batata", price: 10 },
        { id: "add-arroz", name: "Arroz extra", price: 6 },
        { id: "add-farofa", name: "Farofa especial", price: 5 },
      ];
    }
    if (cat.includes("sobremesa")) {
      return [
        { id: "add-sorvete", name: "Bola de sorvete extra", price: 6 },
        { id: "add-calda", name: "Calda de chocolate", price: 4 },
      ];
    }
    return [];
  }, [product]);

  const toggleExclusion = (item: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  };

  const setAddonQty = (addonName: string, delta: number) => {
    setSelectedAddons((prev) => {
      const next = new Map(prev);
      const current = next.get(addonName) || 0;
      const updated = Math.max(0, current + delta);
      if (updated === 0) next.delete(addonName);
      else next.set(addonName, updated);
      return next;
    });
  };

  const handleQuickNote = (note: string) => {
    setCustomNote((prev) => {
      if (prev.includes(note)) {
        return prev.replace(note, "").replace(/,\s*,/g, ",").trim();
      }
      return prev ? `${prev}, ${note}` : note;
    });
  };

  // Cálculo financeiro
  const addonsTotal = useMemo(() => {
    let total = 0;
    selectedAddons.forEach((count, addonName) => {
      const found = addonsList.find((a) => a.name === addonName);
      if (found) total += found.price * count;
    });
    return total;
  }, [selectedAddons, addonsList]);

  const unitPrice = product.price + addonsTotal;
  const totalPrice = unitPrice * qty;

  const handleConfirm = () => {
    const details: string[] = [];

    if (selectedDoneness) {
      details.push(`Ponto: ${selectedDoneness}`);
    }

    excluded.forEach((ex) => {
      details.push(ex);
    });

    selectedAddons.forEach((count, addonName) => {
      const found = addonsList.find((a) => a.name === addonName);
      const extraPrice = found ? ` (+ ${brl(found.price * count)})` : "";
      details.push(`+ ${count}x ${addonName}${extraPrice}`);
    });

    if (customNote.trim()) {
      details.push(`Obs: ${customNote.trim()}`);
    }

    const item: OrderItem = {
      id: uid(),
      productId: product.id,
      name: product.name,
      qty,
      unitPrice,
      totalPrice,
      details,
      sentToKitchen: false,
      createdAt: new Date().toISOString(),
    };

    onConfirm(item);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col justify-end animate-in fade-in-50 duration-200">
      <div className="bg-[#0f172a] rounded-t-3xl border-t border-slate-800 max-h-[90vh] flex flex-col max-w-md mx-auto w-full shadow-2xl overflow-hidden">
        {/* Topo: Detalhes do Produto & Fechar */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#0c1220]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-2xl flex-shrink-0">
              {product.emoji || "🍽️"}
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight leading-snug">
                {product.name}
              </h2>
              <div className="text-xs font-semibold text-emerald-400 mt-0.5">
                Base: {brl(product.price)}
                {addonsTotal > 0 && (
                  <span className="text-slate-400 font-normal ml-1">
                    (+ {brl(addonsTotal)} opcionais)
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-800/80 active:scale-95"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo com rolagem suave */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Stepper de Quantidade Geral */}
          <div className="flex items-center justify-between bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
            <span className="text-xs font-semibold text-slate-300">Quantidade deste item:</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center active:scale-90 transition-transform"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-8 text-center font-black text-lg text-emerald-300">{qty}</span>
              <button
                type="button"
                onClick={() => setQty((q) => q + 1)}
                className="w-9 h-9 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center font-bold active:scale-90 transition-transform"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Ponto da Carne (se aplicável) */}
          {selectedDoneness !== null && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                <span>Ponto da Carne / Preparo</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {DEFAULT_MEAT_OPTIONS.map((doneness) => (
                  <button
                    key={doneness}
                    type="button"
                    onClick={() => setSelectedDoneness(doneness)}
                    className={`py-2 px-1 rounded-xl text-xs font-bold transition-all ${
                      selectedDoneness === doneness
                        ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/25 scale-[1.02]"
                        : "bg-slate-900 border border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    {doneness}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Exclusões (Sem Cebola, etc.) */}
          {exclusions.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                <Utensils className="w-3.5 h-3.5 text-rose-400" />
                <span>Retirar Ingredientes (Toque para remover)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {exclusions.map((item) => {
                  const isExcluded = excluded.has(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleExclusion(item)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                        isExcluded
                          ? "bg-rose-500/20 border border-rose-500/60 text-rose-300 line-through"
                          : "bg-slate-900 border border-slate-800 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      {isExcluded && <X className="w-3 h-3 text-rose-400" />}
                      <span>{item}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Adicionais Pagos (+ Bacon R$ 5) */}
          {addonsList.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-emerald-400" />
                <span>Adicionais e Extras (Pagos)</span>
              </label>
              <div className="space-y-2">
                {addonsList.map((addon) => {
                  const count = selectedAddons.get(addon.name) || 0;
                  return (
                    <div
                      key={addon.id || addon.name}
                      className={`p-2.5 rounded-2xl border flex items-center justify-between transition-all ${
                        count > 0
                          ? "bg-emerald-950/20 border-emerald-500/50 shadow-sm"
                          : "bg-slate-900/90 border-slate-800"
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold text-slate-100">{addon.name}</div>
                        <div className="text-[11px] font-semibold text-emerald-400">
                          + {brl(addon.price)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {count > 0 ? (
                          <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-xl">
                            <button
                              type="button"
                              onClick={() => setAddonQty(addon.name, -1)}
                              className="w-7 h-7 rounded-lg bg-slate-700 text-slate-200 flex items-center justify-center active:scale-90"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-5 text-center font-bold text-xs text-emerald-300">
                              {count}
                            </span>
                            <button
                              type="button"
                              onClick={() => setAddonQty(addon.name, 1)}
                              className="w-7 h-7 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center font-bold active:scale-90"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setAddonQty(addon.name, 1)}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 active:scale-95 transition-all"
                          >
                            + Adicionar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Observações Rápidas e Campo de Texto */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
              <span>Observação para a Cozinha / Bar</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_QUICK_NOTES.map((chip) => {
                const isActive = customNote.includes(chip);
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleQuickNote(chip)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                      isActive
                        ? "bg-indigo-500/25 border border-indigo-500 text-indigo-300 font-bold"
                        : "bg-slate-900 border border-slate-800 text-slate-400"
                    }`}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="Digite outra instrução específica..."
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Rodapé Fixo de Confirmação */}
        <div className="p-3 bg-[#0c1220] border-t border-slate-800 flex items-center justify-between gap-3 shadow-2xl">
          <div>
            <div className="text-[11px] text-slate-400">Total do item ({qty}x)</div>
            <div className="text-lg font-black text-emerald-400">{brl(totalPrice)}</div>
          </div>

          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 active:scale-95 transition-all"
          >
            <Check className="w-5 h-5" />
            <span>Confirmar e Adicionar</span>
          </button>
        </div>
      </div>
    </div>
  );
}
