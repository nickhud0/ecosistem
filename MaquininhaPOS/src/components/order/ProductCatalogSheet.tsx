import { useMemo, useState } from "react";
import { ArrowLeft, Check, Minus, Plus, Search, ShoppingBag, X } from "lucide-react";
import { brl, uid } from "../../lib/format";
import type { OrderItem, Product, ProductCategory } from "../../lib/types";

interface ProductCatalogSheetProps {
  tableNumber: number;
  categories: ProductCategory[];
  products: Product[];
  onConfirmOrder: (newItems: OrderItem[]) => void;
  onClose: () => void;
  isSubmitting?: boolean;
}

export function ProductCatalogSheet({
  tableNumber,
  categories,
  products,
  onConfirmOrder,
  onClose,
  isSubmitting,
}: ProductCatalogSheetProps) {
  const [selectedCat, setSelectedCat] = useState<string>("TODOS");
  const [search, setSearch] = useState<string>("");
  const [cart, setCart] = useState<Map<string, { product: Product; qty: number; notes?: string }>>(
    new Map()
  );

  // Lista de categorias incluindo TODOS
  const catTabs = useMemo(() => {
    return ["TODOS", ...categories.map((c) => c.name)];
  }, [categories]);

  // Produtos filtrados
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat =
        selectedCat === "TODOS" || p.category?.toLowerCase() === selectedCat.toLowerCase();
      const matchSearch =
        search.trim() === "" ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.category?.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, selectedCat, search]);

  const addToCart = (product: Product) => {
    if (product.soldOut) return;
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(product.id);
      if (existing) {
        next.set(product.id, { ...existing, qty: existing.qty + 1 });
      } else {
        next.set(product.id, { product, qty: 1 });
      }
      return next;
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(productId);
      if (!existing) return prev;
      if (existing.qty > 1) {
        next.set(productId, { ...existing, qty: existing.qty - 1 });
      } else {
        next.delete(productId);
      }
      return next;
    });
  };

  const cartItemsCount = Array.from(cart.values()).reduce((sum, item) => sum + item.qty, 0);
  const cartSubtotal = Array.from(cart.values()).reduce(
    (sum, item) => sum + item.qty * item.product.price,
    0
  );

  const handleSend = () => {
    if (cartItemsCount === 0) return;
    const itemsList: OrderItem[] = Array.from(cart.values()).map(({ product, qty }) => ({
      id: uid(),
      productId: product.id,
      name: product.name,
      qty,
      unitPrice: product.price,
      totalPrice: qty * product.price,
      sentToKitchen: false,
      createdAt: new Date().toISOString(),
    }));

    onConfirmOrder(itemsList);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#090d16] flex flex-col animate-in fade-in-50 duration-200">
      {/* Topo: Header com Botão Voltar e Número da Mesa */}
      <div className="bg-[#0f172a] border-b border-slate-800 p-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-300 active:scale-95 transition-transform"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-base font-bold text-white tracking-tight">
              Anotar Pedido • Mesa #{String(tableNumber).padStart(2, "0")}
            </h2>
            <p className="text-[11px] text-slate-400">Selecione os itens do cardápio</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-2 rounded-xl text-slate-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Barra de Busca de Produtos */}
      <div className="p-3 bg-[#0c1220] border-b border-slate-800/80 space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar prato, bebida ou sobremesa..."
            className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-10 pr-9 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="p-1 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Abas de Categorias */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {catTabs.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCat(cat)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                selectedCat === cat
                  ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20"
                  : "bg-slate-900 text-slate-400 border border-slate-800"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Lista Vertical de Produtos */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 pb-28">
        {filteredProducts.map((p) => {
          const inCart = cart.get(p.id);
          const currentQty = inCart ? inCart.qty : 0;

          return (
            <div
              key={p.id}
              className={`p-3 rounded-2xl border flex items-center justify-between transition-all ${
                p.soldOut
                  ? "bg-slate-900/40 border-slate-800/50 opacity-50"
                  : currentQty > 0
                  ? "bg-emerald-950/20 border-emerald-500/40 shadow-sm"
                  : "bg-slate-900/90 border-slate-800 hover:border-slate-700"
              }`}
            >
              {/* Lado Esquerdo: Emoji + Nome + Preço */}
              <div
                className="flex items-center gap-3 flex-1 min-w-0 pr-2 cursor-pointer"
                onClick={() => !p.soldOut && addToCart(p)}
              >
                <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-xl flex-shrink-0">
                  {p.emoji || "🍽️"}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-bold text-slate-100 truncate">{p.name}</h3>
                    {p.soldOut && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                        Esgotado
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-emerald-400 mt-0.5">
                    {brl(p.price)}
                  </p>
                </div>
              </div>

              {/* Lado Direito: Stepper de Quantidade */}
              <div>
                {p.soldOut ? (
                  <span className="text-xs text-slate-500 font-medium">Indisponível</span>
                ) : currentQty > 0 ? (
                  <div className="flex items-center gap-1.5 bg-slate-800/90 border border-emerald-500/40 p-1 rounded-xl">
                    <button
                      onClick={() => removeFromCart(p.id)}
                      className="w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 flex items-center justify-center active:scale-90 transition-transform"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-6 text-center font-extrabold text-sm text-emerald-300">
                      {currentQty}
                    </span>
                    <button
                      onClick={() => addToCart(p)}
                      className="w-8 h-8 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center font-bold active:scale-90 transition-transform"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => addToCart(p)}
                    className="h-9 px-3 rounded-xl bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 border border-slate-700 font-semibold text-xs text-slate-200 flex items-center gap-1 active:scale-95 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Barra Flutuante de Fechamento do Pedido */}
      {cartItemsCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-[#0c1220] border-t border-slate-800 flex items-center justify-between gap-3 shadow-2xl z-50 max-w-md mx-auto hardware-accelerated">
          <div>
            <div className="text-[11px] text-slate-400">
              Total ({cartItemsCount} {cartItemsCount === 1 ? "item" : "itens"})
            </div>
            <div className="text-lg font-black text-emerald-400">{brl(cartSubtotal)}</div>
          </div>

          <button
            onClick={handleSend}
            className="flex-1 h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 active:scale-95 transition-all"
          >
            <Check className="w-5 h-5" />
            <span>Adicionar à Mesa ({cartItemsCount} {cartItemsCount === 1 ? "item" : "itens"})</span>
          </button>
        </div>
      )}
    </div>
  );
}
