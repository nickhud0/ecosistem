import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Minus, Plus, RefreshCw, Search, ShoppingCart, Trash2, UserPlus } from "lucide-react";
import { AppShell } from "@/components/pos/app-shell";
import { CheckoutDialog } from "@/components/pos/checkout-dialog";
import { CustomerDialog } from "@/components/pos/customer-dialog";
import { ProductCustomizationDialog } from "@/components/pos/product-customization-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { usePos } from "@/lib/pos-store";
import { useProducts } from "@/hooks/useProducts";
import { isEditableElement } from "@/hooks/usePosShortcuts";
import { brl, itemsTotal, uid } from "@/lib/pos-format";
import type { OrderItem, Product } from "@/lib/pos-types";
import { cn } from "@/lib/utils";

export function CounterPage() {
  const pos = usePos();
  const { products, categories, isLoading, error, refetch } = useProducts();
  const [category, setCategory] = useState("Todos");
  const [productSearch, setProductSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [customer, setCustomer] = useState("");
  const [checkout, setCheckout] = useState(false);
  const [customerDialog, setCustomerDialog] = useState(false);
  const [customizing, setCustomizing] = useState<Product | null>(null);

  const visible = useMemo(() => {
    return products.filter((product) => {
      const matchCat = category === "Todos" || product.category === category;
      if (!matchCat) return false;
      if (!productSearch.trim()) return true;
      const query = productSearch.toLowerCase();
      return (
        product.name.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query)
      );
    });
  }, [products, category, productSearch]);

  const addCustomized = (item: OrderItem) => setCart((current) => [...current, item]);

  const handleProductClick = (product: Product) => {
    const custom = product.customization;
    const hasCustomization =
      custom?.allowCustomization &&
      ((custom.exclusions && custom.exclusions.length > 0) ||
        (custom.addons && custom.addons.length > 0) ||
        custom.isPizza);

    if (hasCustomization) {
      setCustomizing(product);
    } else {
      setCart((current) => [
        ...current,
        {
          id: uid(),
          name: product.name,
          qty: 1,
          unitPrice: product.price,
          details: [],
        },
      ]);
    }
  };

  const qty = (id: string, delta: number) =>
    setCart((current) =>
      current
        .map((item) => (item.id === id ? { ...item, qty: item.qty + delta } : item))
        .filter((item) => item.qty > 0),
    );

  // Atalhos de teclado específicos do Balcão
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Se algum diálogo modal estiver aberto, não intercepta
      if (customizing || customerDialog || checkout) return;

      // Alt+C: Diálogo de cliente
      if (e.altKey && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        setCustomerDialog(true);
        return;
      }

      // F12: Checkout rápido
      if (e.key === "F12") {
        e.preventDefault();
        if (cart.length > 0) {
          setCheckout(true);
        }
        return;
      }

      // Ctrl + Delete / Ctrl + Backspace: Limpar carrinho inteiro
      if (e.ctrlKey && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        setCart([]);
        return;
      }

      // Se estiver digitando em input/textarea, não captura as teclas de caractere único
      if (isEditableElement(e.target)) {
        return;
      }

      // / ou Ctrl+K: Focar busca de produtos
      if (e.key === "/" || (e.ctrlKey && (e.key === "k" || e.key === "K"))) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      // Espaço: Abrir checkout se houver itens
      if (e.key === " " && cart.length > 0) {
        e.preventDefault();
        setCheckout(true);
        return;
      }

      // + ou = : Aumenta a quantidade do último item adicionado
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        const last = cart[cart.length - 1];
        if (last) {
          qty(last.id, 1);
        }
        return;
      }

      // - ou _ : Diminui a quantidade do último item adicionado
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        const last = cart[cart.length - 1];
        if (last) {
          qty(last.id, -1);
        }
        return;
      }

      // Delete ou Backspace: Remove o último item do carrinho
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        const last = cart[cart.length - 1];
        if (last) {
          setCart((current) => current.filter((entry) => entry.id !== last.id));
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cart, checkout, customerDialog, customizing]);

  return (
    <AppShell title="Venda Balcão" subtitle="Venda rápida · envio após pagamento">
      <div className="grid h-full grid-cols-[190px_1fr_360px] gap-5">
        {/* Categorias */}
        <aside className="rounded-3xl glass p-4">
          <p className="mb-3 text-[11px] tracking-wider text-muted-foreground uppercase">
            Categorias
          </p>
          <div className="space-y-2">
            {isLoading
              ? Array.from({ length: 6 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-14 w-full rounded-xl" />
                ))
              : categories.map((entry) => (
                  <Button
                    key={entry}
                    type="button"
                    variant="secondary"
                    onClick={() => setCategory(entry)}
                    className={cn(
                      "h-14 w-full justify-start rounded-xl px-4 text-sm font-semibold transition-all",
                      category === entry && "bg-brand/25 text-brand ring-1 ring-brand/40 shadow-sm",
                    )}
                  >
                    {entry}
                  </Button>
                ))}
          </div>
        </aside>

        {/* Grade de Produtos */}
        <section className="min-h-0 flex flex-col rounded-3xl glass p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <h2 className="font-display font-semibold">
                Produtos {products.length ? `(${visible.length})` : ""}
              </h2>
              <span className="hidden sm:inline text-xs text-muted-foreground">Toque ou [Enter] p/ incluir</span>
            </div>

            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                ref={searchInputRef}
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && visible.length > 0) {
                    e.preventDefault();
                    const topProduct = visible.find((p) => !p.soldOut) || visible[0];
                    if (topProduct && !topProduct.soldOut) {
                      handleProductClick(topProduct);
                    }
                  } else if (e.key === "Escape") {
                    setProductSearch("");
                    searchInputRef.current?.blur();
                  }
                }}
                placeholder="Buscar produto (Enter p/ incluir)..."
                className="h-9 w-full rounded-xl glass-soft pl-9 pr-8 text-xs outline-none focus:ring-1 focus:ring-brand placeholder:text-muted-foreground"
              />
              <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 select-none rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground border border-border">
                /
              </kbd>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-3 gap-3 content-start auto-rows-[140px]">
              {Array.from({ length: 9 }).map((_, idx) => (
                <div
                  key={idx}
                  className="flex h-[140px] flex-col items-start justify-between rounded-2xl border border-border/40 p-4 glass-soft"
                >
                  <Skeleton className="size-10 rounded-lg" />
                  <div className="w-full space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <AlertCircle className="size-10 text-wait" />
              <p className="mt-2 text-sm font-semibold">Erro ao buscar produtos do SQLite</p>
              <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => refetch()}
                className="mt-4 flex items-center gap-2 rounded-xl"
              >
                <RefreshCw className="size-4" />
                Tentar novamente
              </Button>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto grid grid-cols-3 gap-3 pr-1 content-start auto-rows-[140px]">
              {visible.map((product) => (
                <Button
                  key={product.id}
                  type="button"
                  variant="secondary"
                  disabled={product.soldOut}
                  onClick={() => handleProductClick(product)}
                  className="relative flex h-[140px] flex-col items-start justify-between rounded-2xl p-4 text-left transition-colors hover:bg-secondary/80 active:scale-[0.98] disabled:opacity-45"
                >
                  <div className="flex w-full items-start justify-between">
                    <span className="text-3xl">{product.emoji}</span>
                    {product.soldOut ? (
                      <span className="rounded-md bg-wait/15 px-2 py-0.5 text-[10px] font-bold text-wait ring-1 ring-wait/30">
                        ESGOTADO
                      </span>
                    ) : null}
                  </div>
                  <div className="w-full">
                    <span className="line-clamp-2 block whitespace-normal text-sm font-semibold leading-snug">
                      {product.name}
                    </span>
                    <span className="num mt-1 block font-bold text-cyan">{brl(product.price)}</span>
                  </div>
                </Button>
              ))}
              {!visible.length && (
                <p className="col-span-3 py-16 text-center text-sm text-muted-foreground">
                  Nenhum produto cadastrado nesta categoria.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Carrinho / Resumo do Pedido */}
        <aside className="flex min-h-0 flex-col rounded-3xl glass p-5">
          <div className="mb-3 flex items-center gap-2">
            <ShoppingCart className="size-5 text-cyan" />
            <h2 className="font-display font-semibold">Pedido</h2>
            <span className="ml-auto rounded-full bg-brand/20 px-2 py-0.5 text-xs font-bold text-brand">
              {cart.reduce((sum, item) => sum + item.qty, 0)}
            </span>
          </div>

          <div className="mb-3 flex gap-2">
            <input
              value={customer}
              onChange={(event) => setCustomer(event.target.value)}
              className="h-12 min-w-0 flex-1 rounded-xl glass-soft px-3 text-sm outline-none focus:ring-1 focus:ring-brand"
              placeholder="Nome do cliente"
            />
            <Button
              type="button"
              size="icon"
              variant="secondary"
              title="Cadastrar ou selecionar cliente (Alt+C)"
              onClick={() => setCustomerDialog(true)}
              className="relative size-12 rounded-xl"
            >
              <UserPlus />
              <span className="absolute -bottom-1 -right-1 font-mono text-[8px] font-bold text-muted-foreground bg-surface px-1 rounded border border-border">
                Alt+C
              </span>
            </Button>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {cart.length ? (
              cart.map((item) => (
                <div key={item.id} className="rounded-xl glass-soft p-3">
                  <div className="flex items-start">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.name}</p>
                      {item.details?.map((detail) => (
                        <p key={detail} className="truncate text-[11px] text-muted-foreground">
                          {detail}
                        </p>
                      ))}
                      <p className="num text-xs text-cyan">{brl(item.unitPrice)}</p>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        setCart((current) => current.filter((entry) => entry.id !== item.id))
                      }
                      className="ml-auto size-9 text-wait hover:bg-wait/10"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      onClick={() => qty(item.id, -1)}
                      className="size-9 rounded-lg"
                    >
                      <Minus className="size-4" />
                    </Button>
                    <span className="num w-6 text-center font-semibold">{item.qty}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="secondary"
                      onClick={() => qty(item.id, 1)}
                      className="size-9 rounded-lg"
                    >
                      <Plus className="size-4" />
                    </Button>
                    <span className="num ml-auto font-semibold">
                      {brl(item.qty * item.unitPrice)}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">Carrinho vazio</p>
            )}
          </div>

          <div className="mt-4 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="num text-2xl font-bold">{brl(itemsTotal(cart))}</span>
            </div>
            <Button
              type="button"
              disabled={!cart.length}
              onClick={() => setCheckout(true)}
              className="mt-3 h-16 w-full rounded-2xl bg-linear-to-br from-brand to-cyan font-display font-bold text-brand-foreground shadow-lg shadow-brand/30 flex items-center justify-between px-5"
            >
              <span>Pagar e Enviar à Cozinha</span>
              <kbd className="rounded-lg bg-black/20 px-2 py-0.5 font-mono text-xs font-semibold text-brand-foreground border border-white/20">
                F12
              </kbd>
            </Button>
          </div>
        </aside>
      </div>

      <ProductCustomizationDialog
        product={customizing}
        open={!!customizing}
        onOpenChange={(value) => {
          if (!value) setCustomizing(null);
        }}
        onConfirm={addCustomized}
      />

      <CustomerDialog
        open={customerDialog}
        onOpenChange={setCustomerDialog}
        onCreated={(created) => setCustomer(created.name)}
      />

      <CheckoutDialog
        open={checkout}
        onOpenChange={setCheckout}
        originLabel={customer ? `Balcão · ${customer}` : "Balcão"}
        items={cart}
        allowSplit={false}
        onFinish={(data) => {
          pos.registerCounterSale({ customer, ...data });
          setCart([]);
          setCustomer("");
        }}
      />
    </AppShell>
  );
}
