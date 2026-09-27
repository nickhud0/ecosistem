import { useMemo, useState } from "react";
import { ArrowLeft, Check, Minus, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { brl, uid } from "../../lib/format";
import type { OrderItem, Product, ProductCategory } from "../../lib/types";
import { ProductCustomizationSheet } from "./ProductCustomizationSheet";

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
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
  const [showCartReview, setShowCartReview] = useState(false);

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

  // Adição direta (simples)
  const addSimpleProduct = (product: Product) => {
    if (product.soldOut) return;
    setCartItems((prev) => {
      // Procura se já existe exatamente o mesmo produto sem detalhes/customizações
      const index = prev.findIndex(
        (it) => it.productId === product.id && (!it.details || it.details.length === 0)
      );
      if (index >= 0) {
        const updated = [...prev];
        const item = updated[index];
        const newQty = item.qty + 1;
        updated[index] = {
          ...item,
          qty: newQty,
          totalPrice: newQty * item.unitPrice,
        };
        return updated;
      }
      return [
        ...prev,
        {
          id: uid(),
          productId: product.id,
          name: product.name,
          qty: 1,
          unitPrice: product.price,
          totalPrice: product.price,
          details: [],
          sentToKitchen: false,
          createdAt: new Date().toISOString(),
        },
      ];
    });
  };

  // Subtração de item simples
  const removeSimpleProduct = (productId: string) => {
    setCartItems((prev) => {
      const index = prev.findIndex(
        (it) => it.productId === productId && (!it.details || it.details.length === 0)
      );
      if (index === -1) return prev;
      const item = prev[index];
      if (item.qty > 1) {
        const updated = [...prev];
        const newQty = item.qty - 1;
        updated[index] = {
          ...item,
          qty: newQty,
          totalPrice: newQty * item.unitPrice,
        };
        return updated;
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  // Adição de item customizado
  const handleConfirmCustomized = (item: OrderItem) => {
    setCartItems((prev) => [...prev, item]);
    setCustomizingProduct(null);
  };

  // Remoção de item específico por ID
  const removeItemById = (id: string) => {
    setCartItems((prev) => prev.filter((it) => it.id !== id));
  };

  const cartTotalItemsCount = cartItems.reduce((sum, item) => sum + item.qty, 0);
  const cartSubtotal = cartItems.reduce(
    (sum, item) => sum + (item.totalPrice ?? item.qty * item.unitPrice),
    0
  );

  const handleSend = () => {
    if (cartItems.length === 0) return;
    onConfirmOrder(cartItems);
  };

  // Contagem de um determinado produto no carrinho (incluindo variações)
  const getProductCountInCart = (productId: string) => {
    return cartItems
      .filter((it) => it.productId === productId)
      .reduce((sum, it) => sum + it.qty, 0);
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
            <p className="text-[11px] text-slate-400">Cardápio ágil com adicionais e notas</p>
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
      <div className="flex-1 overflow-y-auto p-3 space-y-2 pb-32">
        {filteredProducts.map((p) => {
          const totalInCart = getProductCountInCart(p.id);

          return (
            <div
              key={p.id}
              className={`p-3 rounded-2xl border flex items-center justify-between transition-all ${
                p.soldOut
                  ? "bg-slate-900/40 border-slate-800/50 opacity-50"
                  : totalInCart > 0
                  ? "bg-emerald-950/20 border-emerald-500/40 shadow-sm"
                  : "bg-slate-900/90 border-slate-800 hover:border-slate-700"
              }`}
            >
              {/* Lado Esquerdo: Emoji + Nome + Preço */}
              <div
                className="flex items-center gap-3 flex-1 min-w-0 pr-2 cursor-pointer"
                onClick={() => {
                  if (p.soldOut) return;
                  // Se for categoria com modificadores (Lanches, Pratos, etc.) abre a gaveta
                  const isCustomizable =
                    p.category?.toLowerCase().includes("lanche") ||
                    p.category?.toLowerCase().includes("prato") ||
                    p.category?.toLowerCase().includes("pizza") ||
                    p.name.toLowerCase().includes("burger") ||
                    p.name.toLowerCase().includes("picanha");
                  if (isCustomizable) {
                    setCustomizingProduct(p);
                  } else {
                    addSimpleProduct(p);
                  }
                }}
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
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs font-semibold text-emerald-400">{brl(p.price)}</p>
                    {totalInCart > 0 && (
                      <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/15 px-1.5 py-0.2 rounded">
                        {totalInCart} na comanda
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Lado Direito: Ações (Adicionar rápido e Personalizar) */}
              <div className="flex items-center gap-1.5">
                {!p.soldOut && (
                  <>
                    {/* Botão de Personalização (Modificadores) */}
                    <button
                      type="button"
                      onClick={() => setCustomizingProduct(p)}
                      title="Personalizar adicionais e ponto"
                      className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center border border-slate-700 active:scale-95 transition-all"
                    >
                      <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                    </button>

                    {/* Stepper Rápido ou Botão Adicionar */}
                    {totalInCart > 0 ? (
                      <div className="flex items-center gap-1 bg-slate-800/90 border border-emerald-500/40 p-1 rounded-xl">
                        <button
                          onClick={() => removeSimpleProduct(p.id)}
                          className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 flex items-center justify-center active:scale-90 transition-transform"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="w-5 text-center font-black text-xs text-emerald-300">
                          {totalInCart}
                        </span>
                        <button
                          onClick={() => addSimpleProduct(p)}
                          className="w-7 h-7 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center font-bold active:scale-90 transition-transform"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addSimpleProduct(p)}
                        className="h-9 px-3 rounded-xl bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 border border-slate-700 font-semibold text-xs text-slate-200 flex items-center gap-1 active:scale-95 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Adicionar</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal/Sheet de Customização */}
      {customizingProduct && (
        <ProductCustomizationSheet
          product={customizingProduct}
          onConfirm={handleConfirmCustomized}
          onClose={() => setCustomizingProduct(null)}
        />
      )}

      {/* Drawer de Revisão de Itens do Carrinho */}
      {showCartReview && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col justify-end animate-in fade-in-50 duration-200">
          <div className="bg-[#0f172a] rounded-t-3xl border-t border-slate-800 max-h-[80vh] flex flex-col max-w-md mx-auto w-full shadow-2xl p-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-white text-base">
                Itens a Lançar na Mesa #{tableNumber} ({cartTotalItemsCount})
              </h3>
              <button
                onClick={() => setShowCartReview(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-2.5">
              {cartItems.map((it) => (
                <div
                  key={it.id}
                  className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex items-start justify-between gap-2"
                >
                  <div>
                    <div className="text-xs font-bold text-white">
                      {it.qty}x {it.name}
                    </div>
                    {it.details && it.details.length > 0 && (
                      <div className="text-[11px] text-slate-400 mt-0.5 space-y-0.5">
                        {it.details.map((d, i) => (
                          <div key={i}>{d}</div>
                        ))}
                      </div>
                    )}
                    <div className="text-xs font-semibold text-emerald-400 mt-1">
                      {brl(it.totalPrice ?? it.qty * it.unitPrice)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeItemById(it.id)}
                    className="p-2 rounded-lg text-slate-500 hover:text-rose-400 active:scale-90 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400">Total a Lançar</span>
                <div className="text-lg font-black text-emerald-400">{brl(cartSubtotal)}</div>
              </div>
              <button
                onClick={() => {
                  setShowCartReview(false);
                  handleSend();
                }}
                disabled={isSubmitting}
                className="h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg active:scale-95"
              >
                <Check className="w-4 h-4" />
                <span>Confirmar e Despachar</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barra Flutuante de Fechamento do Pedido */}
      {cartTotalItemsCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-[#0c1220] border-t border-slate-800 flex items-center justify-between gap-3 shadow-2xl z-40 max-w-md mx-auto">
          <div
            className="cursor-pointer active:scale-95 transition-transform"
            onClick={() => setShowCartReview(true)}
          >
            <div className="text-[11px] text-slate-400 flex items-center gap-1">
              <span>Ver itens ({cartTotalItemsCount})</span>
              <span className="underline text-emerald-400 text-[10px]">revisar</span>
            </div>
            <div className="text-lg font-black text-emerald-400">{brl(cartSubtotal)}</div>
          </div>

          <button
            onClick={handleSend}
            disabled={isSubmitting}
            className="flex-1 h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 active:scale-95 transition-all disabled:opacity-50"
          >
            <Check className="w-5 h-5" />
            <span>
              {isSubmitting
                ? "Lançando..."
                : `Lançar na Mesa (${cartTotalItemsCount} ${
                    cartTotalItemsCount === 1 ? "item" : "itens"
                  })`}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
