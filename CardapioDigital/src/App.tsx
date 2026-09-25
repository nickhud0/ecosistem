import { useMemo, useState } from "react";
import { useMenu } from "@/hooks/useMenu";
import { Header } from "@/components/Header";
import { CategoryNav, getCategoryEmoji } from "@/components/CategoryNav";
import { ProductCard } from "@/components/ProductCard";
import { ProductModal } from "@/components/ProductModal";
import { Footer } from "@/components/Footer";
import type { MenuItem } from "@/lib/types";

export function App() {
  const { products, categories, restaurantInfo } = useMenu();

  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [activeItemModal, setActiveItemModal] = useState<MenuItem | null>(null);

  // Contagem de itens por categoria
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      Todos: products.length,
    };
    for (const p of products) {
      counts[p.category_name] = (counts[p.category_name] || 0) + 1;
    }
    return counts;
  }, [products]);

  // Filtra produtos pela categoria selecionada
  const filteredProducts = useMemo(() => {
    if (selectedCategory === "Todos") return products;
    return products.filter((item) => item.category_name === selectedCategory);
  }, [products, selectedCategory]);

  // Agrupa produtos por categoria para exibição limpa e estruturada
  const groupedProducts = useMemo(() => {
    if (selectedCategory !== "Todos") {
      return [{ category: selectedCategory, items: filteredProducts }];
    }

    const groups: { category: string; items: MenuItem[] }[] = [];
    for (const cat of categories) {
      const itemsInCat = products.filter((p) => p.category_name === cat.name);
      if (itemsInCat.length > 0) {
        groups.push({ category: cat.name, items: itemsInCat });
      }
    }

    // Itens de categorias não listadas formalmente
    const categorizedNames = new Set(categories.map((c) => c.name));
    const others = products.filter((p) => !categorizedNames.has(p.category_name));
    if (others.length > 0) {
      groups.push({ category: "Outros Itens", items: others });
    }

    return groups;
  }, [selectedCategory, filteredProducts, categories, products]);

  return (
    <div className="min-h-screen bg-[#0c0d10] text-zinc-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Título Limpo */}
      <Header title="Cardápio Digital" />

      {/* Menu de Navegação Flutuante e Semitransparente */}
      <CategoryNav
        categories={categories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        categoryCounts={categoryCounts}
      />

      {/* Lista de Pratos 100% Otimizada para Celular */}
      <main className="flex-1 w-full max-w-lg mx-auto px-2.5 sm:px-3 pt-3 pb-8 space-y-6">
        {groupedProducts.length === 0 ? (
          <div className="text-center py-16 px-4 space-y-3 rounded-2xl bg-zinc-900/40 border border-zinc-850">
            <span className="text-4xl block">🍽️</span>
            <h3 className="text-base font-bold text-zinc-200">Nenhum item nesta categoria</h3>
            <button
              type="button"
              onClick={() => setSelectedCategory("Todos")}
              className="mt-2 px-4 py-2 rounded-xl bg-emerald-500 text-zinc-950 font-bold text-xs shadow-md shadow-emerald-500/20"
            >
              Ver Todas as Opções
            </button>
          </div>
        ) : (
          groupedProducts.map((group) => {
            const emoji = getCategoryEmoji(group.category);

            return (
              <section key={group.category} className="space-y-2.5">
                {/* Título da Categoria Centralizado e Elegante */}
                <div className="pt-3 pb-1 flex flex-col items-center justify-center text-center select-none">
                  <div className="flex items-center justify-center gap-2.5 w-full">
                    <span className="flex-1 h-px bg-gradient-to-r from-transparent via-zinc-800 to-zinc-700" />
                    <div className="inline-flex items-center gap-2 px-2">
                      <span className="text-xl sm:text-2xl filter drop-shadow-sm">{emoji}</span>
                      <h2 className="text-lg sm:text-xl font-black text-white tracking-wide uppercase">
                        {group.category}
                      </h2>
                    </div>
                    <span className="flex-1 h-px bg-gradient-to-l from-transparent via-zinc-800 to-zinc-700" />
                  </div>
                  <span className="mt-1 text-[11px] font-semibold text-zinc-400">
                    {group.items.length} {group.items.length === 1 ? "opção disponível" : "opções disponíveis"}
                  </span>
                </div>

                {/* Cards de Pratos aproveitando a largura total */}
                <div className="flex flex-col gap-2.5">
                  {group.items.map((item) => (
                    <ProductCard
                      key={item.id}
                      item={item}
                      onClick={() => setActiveItemModal(item)}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </main>

      {/* Modal de Detalhes do Produto Selecionado */}
      <ProductModal
        item={activeItemModal}
        onClose={() => setActiveItemModal(null)}
      />

      {/* Rodapé Minimalista */}
      <Footer info={restaurantInfo} />
    </div>
  );
}

export default App;
