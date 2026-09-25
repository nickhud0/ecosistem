import { Check, Info, X } from "lucide-react";
import type { MenuItem } from "@/lib/types";
import { getCategoryEmoji } from "@/components/CategoryNav";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function ProductModal({
  item,
  onClose,
}: {
  item: MenuItem | null;
  onClose: () => void;
}) {
  if (!item) return null;

  const categoryEmoji = getCategoryEmoji(item.category_name);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-sm sm:max-w-md rounded-3xl bg-[#14151b] border border-zinc-800 p-5 shadow-2xl shadow-black animate-in zoom-in-95 duration-150 select-none">
        {/* Botão Fechar no canto superior */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3.5 right-3.5 grid size-8 place-items-center rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          title="Fechar"
        >
          <X className="size-4" />
        </button>

        {/* Topo: Ícone proporcional + Nome e Preço Sutil com Boa Legibilidade */}
        <div className="flex items-start gap-3.5 pr-6">
          {/* Foto / Ícone Culinário */}
          <div className="relative size-18 rounded-2xl bg-gradient-to-br from-zinc-800 via-zinc-850 to-zinc-900 border border-zinc-700/60 shadow-inner grid place-items-center text-4xl shrink-0 overflow-hidden">
            <span>{item.emoji || "🍽️"}</span>

            {item.sold_out && (
              <div className="absolute inset-0 bg-black/75 backdrop-blur-[1px] grid place-items-center">
                <span className="text-[10px] font-black text-white uppercase tracking-wider bg-rose-600/90 px-1.5 py-0.5 rounded">
                  Fim
                </span>
              </div>
            )}
          </div>

          {/* Categoria, Nome e Preço Sutil */}
          <div className="flex-1 min-w-0 pt-0.5">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
              <span>{categoryEmoji}</span>
              <span>{item.category_name}</span>
            </span>

            <h2 className="mt-0.5 text-lg sm:text-xl font-bold text-white tracking-tight leading-snug line-clamp-2">
              {item.name}
            </h2>

            {/* Preço Sutil, porém Claro e Legível */}
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-xs sm:text-sm text-zinc-400 font-medium">Preço:</span>
              <span className="text-base sm:text-lg font-black text-emerald-400">
                {currencyFormatter.format(item.price)}
              </span>
            </div>
          </div>
        </div>

        {/* Linha Divisória */}
        <div className="my-3.5 h-px bg-zinc-800/80" />

        {/* Descrição do Prato com Fonte Aumentada e Nítida */}
        {item.description && (
          <p className="text-sm sm:text-[15px] text-zinc-200 leading-relaxed font-normal">
            {item.description}
          </p>
        )}

        {/* Ingredientes / Acompanhamentos */}
        {item.details && item.details.length > 0 && (
          <div className="mt-3.5">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-2">
              Acompanhamentos & Ingredientes:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {item.details.map((detail, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-medium text-zinc-200"
                >
                  <Check className="size-3 text-emerald-400 shrink-0" />
                  <span>{detail}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Aviso se Esgotado ou Dica Rápida */}
        {item.sold_out ? (
          <div className="mt-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 px-3 py-2 text-xs sm:text-sm text-rose-300 font-medium leading-relaxed">
            ⚠️ Este prato está temporariamente esgotado hoje na cozinha.
          </div>
        ) : (
          <div className="mt-3.5 flex items-center gap-2 text-xs sm:text-sm text-zinc-300">
            <Info className="size-4 text-emerald-400 shrink-0" />
            <span>Peça informando o nome deste item ao garçom ou no balcão.</span>
          </div>
        )}

        {/* Botão de Fechar com Boa Altura de Toque */}
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-[0.99] text-sm font-bold text-white transition-colors border border-zinc-700/60 shadow-md"
        >
          Voltar ao Cardápio
        </button>
      </div>
    </div>
  );
}
