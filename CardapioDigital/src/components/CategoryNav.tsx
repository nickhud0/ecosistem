import type { MenuCategory } from "@/lib/types";

export function getCategoryEmoji(name: string): string {
  const n = name.toLowerCase();
  if (n === "todos") return "✨";
  if (n.includes("lanche") || n.includes("burger") || n.includes("sandu")) return "🍔";
  if (n.includes("pizza")) return "🍕";
  if (n.includes("bebida") || n.includes("drink") || n.includes("suco") || n.includes("refrig") || n.includes("cervej") || n.includes("água") || n.includes("agua")) return "🥤";
  if (n.includes("porç") || n.includes("porc") || n.includes("petisco") || n.includes("entrada") || n.includes("batata") || n.includes("frit")) return "🍟";
  if (n.includes("sobremesa") || n.includes("doce") || n.includes("sorvete") || n.includes("açaí") || n.includes("acai")) return "🍨";
  if (n.includes("prato") || n.includes("refei") || n.includes("carne") || n.includes("almoço") || n.includes("almoco") || n.includes("grelhad")) return "🥩";
  if (n.includes("massa") || n.includes("macarr")) return "🍝";
  if (n.includes("café") || n.includes("cafe")) return "☕";
  if (n.includes("salada")) return "🥗";
  if (n.includes("combo") || n.includes("promoc") || n.includes("promoç")) return "🔥";
  return "🍽️";
}

export function CategoryNav({
  categories,
  selectedCategory,
  onSelectCategory,
  categoryCounts,
}: {
  categories: MenuCategory[];
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  categoryCounts: Record<string, number>;
}) {
  return (
    <nav className="sticky top-0 z-40 bg-zinc-950/85 backdrop-blur-md border-b border-zinc-800/60 py-2 px-2.5 sm:px-3 shadow-md shadow-black/30">
      <div className="w-full flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {/* Chip Todos */}
        <button
          type="button"
          onClick={() => onSelectCategory("Todos")}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-150 select-none ${
            selectedCategory === "Todos"
              ? "bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/25 ring-2 ring-emerald-400/30 scale-[1.02]"
              : "bg-zinc-900/90 text-zinc-300 border border-zinc-800/80 hover:text-white"
          }`}
        >
          <span>✨ Todos</span>
          <span
            className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
              selectedCategory === "Todos"
                ? "bg-zinc-950/20 text-zinc-950"
                : "bg-zinc-800 text-zinc-400"
            }`}
          >
            {categoryCounts["Todos"] ?? 0}
          </span>
        </button>

        {/* Chips das Categorias com Emojis */}
        {categories.map((cat) => {
          const count = categoryCounts[cat.name] ?? 0;
          const isSelected = selectedCategory === cat.name;
          const emoji = getCategoryEmoji(cat.name);

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(cat.name)}
              className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-150 select-none ${
                isSelected
                  ? "bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/25 ring-2 ring-emerald-400/30 scale-[1.02]"
                  : "bg-zinc-900/90 text-zinc-300 border border-zinc-800/80 hover:text-white"
              }`}
            >
              <span>{emoji} {cat.name}</span>
              {count > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                    isSelected
                      ? "bg-zinc-950/20 text-zinc-950"
                      : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
