import { ChevronRight } from "lucide-react";
import type { MenuItem } from "@/lib/types";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function ProductCard({
  item,
  onClick,
}: {
  item: MenuItem;
  onClick: () => void;
}) {
  const isSoldOut = item.sold_out;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`group relative w-full flex items-stretch justify-between gap-3 p-3.5 rounded-2xl transition-all duration-150 text-left cursor-pointer active:scale-[0.985] select-none ${
        isSoldOut
          ? "bg-zinc-900/40 border border-zinc-850 opacity-60"
          : "bg-zinc-900/85 hover:bg-zinc-900 border border-zinc-800/80 hover:border-emerald-500/30 shadow-sm"
      }`}
    >
      {/* Coluna de Informações */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          {/* Nome e Badge de Esgotado */}
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-white group-hover:text-emerald-300 transition-colors line-clamp-1">
              {item.name}
            </h3>
            {isSoldOut && (
              <span className="shrink-0 rounded-md bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.5 text-[9px] font-black text-rose-400 uppercase tracking-wider">
                Esgotado
              </span>
            )}
          </div>

          {/* Descrição */}
          {item.description && (
            <p className="mt-1 text-xs sm:text-[13px] text-zinc-300 line-clamp-2 leading-relaxed">
              {item.description}
            </p>
          )}

          {/* Ingredientes / Detalhes */}
          {item.details && item.details.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {item.details.slice(0, 2).map((detail, idx) => (
                <span
                  key={idx}
                  className="inline-block px-1.5 py-0.5 rounded bg-zinc-800/90 border border-zinc-700/50 text-[11px] text-zinc-300 font-medium"
                >
                  {detail}
                </span>
              ))}
              {item.details.length > 2 && (
                <span className="inline-block px-1.5 py-0.5 rounded bg-zinc-800/60 text-[11px] text-zinc-400">
                  +{item.details.length - 2}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Preço em Destaque */}
        <div className="mt-2.5 pt-1.5 flex items-center justify-between border-t border-zinc-800/50">
          <span className="text-base sm:text-lg font-black text-emerald-400 tracking-tight">
            {currencyFormatter.format(item.price)}
          </span>

          <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-zinc-400 group-hover:text-emerald-400 transition-colors">
            <span>Detalhes</span>
            <ChevronRight className="size-3.5" />
          </span>
        </div>
      </div>

      {/* Ícone Culinário / Imagem do Prato */}
      <div className="relative shrink-0 flex items-center justify-center">
        <div className="size-20 rounded-xl bg-gradient-to-br from-zinc-800/90 via-zinc-850 to-zinc-900 border border-zinc-700/60 shadow-inner grid place-items-center text-4xl group-hover:scale-105 transition-transform duration-150 relative overflow-hidden select-none">
          <span className="filter drop-shadow-sm">{item.emoji || "🍽️"}</span>

          {/* Brilho no topo */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.05] to-transparent pointer-events-none" />

          {/* Overlay de Esgotado */}
          {isSoldOut && (
            <div className="absolute inset-0 rounded-xl bg-black/75 backdrop-blur-[2px] grid place-items-center">
              <span className="text-[9px] font-black text-white uppercase tracking-wider bg-rose-600/90 px-1.5 py-0.5 rounded shadow">
                Esgotado
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
