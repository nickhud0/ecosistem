import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Layers,
  Plus,
  Search,
  SlidersHorizontal,
  Utensils,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useProducts } from "@/hooks/useProducts";
import { brl, uid } from "@/lib/pos-format";
import type { Product, TableT } from "@/lib/pos-types";
import { cn } from "@/lib/utils";

interface AddItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  table: TableT;
  onItemAdded: (product: Product, qty: number) => void;
  onCustomizeProduct: (product: Product) => void;
}

export function AddItemsDialog({
  open,
  onOpenChange,
  table,
  onItemAdded,
  onCustomizeProduct,
}: AddItemsDialogProps) {
  const { products, categories } = useProducts();
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const itemsContainerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Limpa estados ao abrir/fechar o modal
  useEffect(() => {
    if (open) {
      setSearchQuery("");
      setSelectedCategory("Todos");
      setHighlightedIndex(0);
      setSessionCount(0);
      setSessionTotal(0);
      setRecentlyAddedId(null);
      // Auto-foco ágil na barra de busca
      requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
    }
  }, [open]);

  // Lista de produtos filtrados por categoria e termo de busca
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchCategory =
        selectedCategory === "Todos" ||
        product.category.toLowerCase() === selectedCategory.toLowerCase();

      if (!matchCategory) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        product.name.toLowerCase().includes(q) ||
        product.category.toLowerCase().includes(q)
      );
    });
  }, [products, selectedCategory, searchQuery]);

  // Sempre que a lista filtrada mudar, reseta o índice em destaque para o primeiro item
  useEffect(() => {
    setHighlightedIndex(0);
  }, [selectedCategory, searchQuery]);

  // Scroll instantâneo sem atraso de animação suave para navegação por teclado veloz
  const scrollToItem = (index: number) => {
    const el = itemRefs.current[index];
    if (el) {
      el.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  };

  const handleSelectProduct = (product: Product) => {
    if (product.soldOut) {
      toast.error("Este produto está esgotado no estoque.");
      return;
    }

    const custom = product.customization;
    const hasCustomization =
      custom?.allowCustomization &&
      ((custom.exclusions && custom.exclusions.length > 0) ||
        (custom.addons && custom.addons.length > 0) ||
        custom.isPizza);

    if (hasCustomization) {
      onCustomizeProduct(product);
    } else {
      onItemAdded(product, 1);
      setSessionCount((prev) => prev + 1);
      setSessionTotal((prev) => prev + product.price);
      setRecentlyAddedId(product.id);

      // Feedback sonoro/visual breve
      setTimeout(() => {
        setRecentlyAddedId((curr) => (curr === product.id ? null : curr));
      }, 700);

      toast.success(`+1 ${product.name} adicionado`, {
        description: `Mesa ${String(table.number).padStart(2, "0")} · ${brl(product.price)}`,
        duration: 1500,
      });
    }
  };

  // Tratamento dos atalhos de teclado (Setas cima/baixo, Enter e Esc)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!filteredProducts.length) return;
      setHighlightedIndex((prev) => {
        const next = prev < filteredProducts.length - 1 ? prev + 1 : 0;
        scrollToItem(next);
        return next;
      });
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!filteredProducts.length) return;
      setHighlightedIndex((prev) => {
        const next = prev > 0 ? prev - 1 : filteredProducts.length - 1;
        scrollToItem(next);
        return next;
      });
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const current = filteredProducts[highlightedIndex];
      if (current) {
        handleSelectProduct(current);
      }
      return;
    }

    if (e.key === "Escape") {
      if (searchQuery) {
        e.preventDefault();
        setSearchQuery("");
      } else {
        onOpenChange(false);
      }
      return;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onKeyDown={handleKeyDown}
        className="max-w-4xl p-0 gap-0 border-border bg-popover/98 shadow-2xl flex flex-col h-[85vh] max-h-[780px] overflow-hidden"
      >
        {/* CABEÇALHO */}
        <DialogHeader className="border-b border-border px-6 py-4 flex flex-row items-center justify-between shrink-0">
          <div>
            <DialogTitle className="font-display text-lg font-bold flex items-center gap-2.5">
              <Utensils className="size-5 text-brand" />
              <span>Lançar Itens na Comanda</span>
              <span className="rounded-lg bg-brand/15 text-brand px-2 py-0.5 text-xs font-mono font-bold border border-brand/30">
                Mesa {String(table.number).padStart(2, "0")}
              </span>
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Navegue com as setas do teclado e tecle Enter para lançar produtos
            </p>
          </div>
        </DialogHeader>

        {/* CORPO: CATEGORIAS (ESQUERDA) + BUSCA E PRODUTOS (DIREITA) */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* BARRA LATERAL DE CATEGORIAS */}
          <aside className="w-52 shrink-0 border-r border-border p-4 flex flex-col gap-1.5 overflow-y-auto bg-card/20">
            <div className="mb-2 px-2 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Layers className="size-3.5 text-brand" />
                Categorias
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {categories.length}
              </span>
            </div>

            {categories.map((cat) => {
              const isSelected = selectedCategory.toLowerCase() === cat.toLowerCase();
              const count =
                cat === "Todos"
                  ? products.length
                  : products.filter((p) => p.category.toLowerCase() === cat.toLowerCase()).length;

              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat);
                    setHighlightedIndex(0);
                    searchInputRef.current?.focus();
                  }}
                  className={cn(
                    "tap flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold transition-all text-left",
                    isSelected
                      ? "bg-brand/25 text-brand ring-1 ring-brand/40 shadow-xs"
                      : "glass-soft text-muted-foreground hover:bg-surface-strong hover:text-foreground"
                  )}
                >
                  <span className="truncate">{cat}</span>
                  <span
                    className={cn(
                      "ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded-full",
                      isSelected
                        ? "bg-brand/30 text-brand"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </aside>

          {/* ÁREA PRINCIPAL: BARRA DE BUSCA + LISTA DE PRODUTOS */}
          <main className="flex-1 min-w-0 flex flex-col overflow-hidden bg-background/50">
            {/* BARRA DE PESQUISA RÁPIDA */}
            <div className="p-4 border-b border-border bg-card/30">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar produto pelo nome ou categoria... (↑ e ↓ navegam, Enter adiciona)"
                  className="w-full h-11 rounded-xl glass-soft pl-10 pr-24 text-sm outline-none focus:ring-1 focus:ring-brand placeholder:text-muted-foreground"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-14 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                    title="Limpar busca"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : null}
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none select-none">
                  <kbd className="rounded bg-surface px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground border border-border">
                    ↑↓
                  </kbd>
                  <kbd className="rounded bg-surface px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground border border-border">
                    ↵
                  </kbd>
                </div>
              </div>
            </div>

            {/* LISTA ROLÁVEL DE PRODUTOS */}
            <div
              ref={itemsContainerRef}
              className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2"
            >
              {filteredProducts.map((product, idx) => {
                const isHighlighted = idx === highlightedIndex;
                const isRecentlyAdded = recentlyAddedId === product.id;
                const hasCustom = Boolean(
                  product.customization?.allowCustomization &&
                    ((product.customization.exclusions &&
                      product.customization.exclusions.length > 0) ||
                      (product.customization.addons &&
                        product.customization.addons.length > 0) ||
                      product.customization.isPizza)
                );

                return (
                  <button
                    key={product.id}
                    ref={(el) => {
                      itemRefs.current[idx] = el;
                    }}
                    type="button"
                    disabled={product.soldOut}
                    onClick={() => handleSelectProduct(product)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={cn(
                      "tap group relative flex w-full items-center gap-3.5 rounded-2xl p-3 text-left transition-all",
                      isHighlighted
                        ? "bg-brand/20 ring-2 ring-brand/50 shadow-md"
                        : "glass-soft hover:bg-surface-strong",
                      isRecentlyAdded && "bg-emerald-500/25 ring-2 ring-emerald-500",
                      product.soldOut && "opacity-45 pointer-events-none"
                    )}
                  >
                    <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-surface/80 text-2xl border border-border/50">
                      {product.emoji || "🍽️"}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm truncate">
                          {product.name}
                        </span>
                        {hasCustom && (
                          <span className="inline-flex items-center gap-1 rounded bg-cyan/15 text-cyan px-1.5 py-0.5 text-[10px] font-medium border border-cyan/30">
                            <SlidersHorizontal className="size-2.5" />
                            Personalizável
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground capitalize">
                        {product.category}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="num font-bold text-base text-cyan">
                        {brl(product.price)}
                      </span>

                      {product.soldOut ? (
                        <span className="rounded-md bg-wait/15 px-2 py-1 text-[10px] font-bold text-wait ring-1 ring-wait/30">
                          ESGOTADO
                        </span>
                      ) : (
                        <span
                          className={cn(
                            "flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all",
                            isRecentlyAdded
                              ? "bg-emerald-500 text-white shadow-sm"
                              : isHighlighted
                                ? "bg-brand text-brand-foreground shadow-sm"
                                : "bg-secondary text-foreground group-hover:bg-brand/20 group-hover:text-brand"
                          )}
                        >
                          {isRecentlyAdded ? (
                            <>
                              <Check className="size-3.5" />
                              <span>Adicionado</span>
                            </>
                          ) : (
                            <>
                              <Plus className="size-3.5" />
                              <span>Adicionar</span>
                              {isHighlighted && (
                                <kbd className="ml-1 rounded bg-black/20 px-1 py-0.2 font-mono text-[9px] text-brand-foreground">
                                  ↵
                                </kbd>
                              )}
                            </>
                          )}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}

              {filteredProducts.length === 0 && (
                <div className="py-16 text-center text-muted-foreground flex flex-col items-center justify-center">
                  <AlertCircle className="size-10 mb-2 opacity-40 text-muted-foreground" />
                  <p className="text-sm font-semibold">Nenhum produto encontrado</p>
                  <p className="text-xs mt-1">
                    {searchQuery
                      ? `Não encontramos resultados para "${searchQuery}" na categoria ${selectedCategory}.`
                      : `Nenhum produto cadastrado na categoria ${selectedCategory}.`}
                  </p>
                  {selectedCategory !== "Todos" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedCategory("Todos")}
                      className="mt-3 rounded-xl text-xs"
                    >
                      Mostrar todas as categorias
                    </Button>
                  )}
                </div>
              )}
            </div>
          </main>
        </div>

        {/* RODAPÉ DO MODAL: RESUMO DA SESSÃO E BOTÃO CONCLUIR */}
        <div className="flex items-center justify-between border-t border-border px-6 py-3.5 bg-card/60 rounded-b-3xl shrink-0">
          <div className="flex items-center gap-3">
            {sessionCount > 0 ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold">
                  ✓
                </span>
                <span className="text-muted-foreground">
                  Lançados agora na comanda:{" "}
                  <strong className="text-foreground font-semibold">
                    {sessionCount} {sessionCount === 1 ? "item" : "itens"}
                  </strong>{" "}
                  (<span className="num text-cyan font-bold">{brl(sessionTotal)}</span>)
                </span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground flex items-center gap-2">
                <kbd className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground border border-border">
                  ↑↓
                </kbd>
                Navegar
                <span className="text-border">·</span>
                <kbd className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground border border-border">
                  Enter
                </kbd>
                Adicionar
                <span className="text-border">·</span>
                <kbd className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground border border-border">
                  Esc
                </kbd>
                Concluir
              </span>
            )}
          </div>

          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
            className="rounded-xl px-5 text-xs font-semibold gap-2"
          >
            <span>{sessionCount > 0 ? "Concluir Lançamentos" : "Fechar"}</span>
            <kbd className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground border border-border">
              Esc
            </kbd>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
