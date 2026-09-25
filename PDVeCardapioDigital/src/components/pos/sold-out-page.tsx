import { useMemo, useState } from "react";
import {
  AlertOctagon,
  Layers,
  RefreshCw,
  Search,
  Sliders,
  Sparkles,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pos/app-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProducts } from "@/hooks/useProducts";
import { brl } from "@/lib/pos-format";
import { usePos } from "@/lib/pos-store";
import {
  getDefaultCustomizationForProduct,
  type PizzaFlavor,
  type Product,
  type ProductAddon,
  type ProductCustomization,
} from "@/lib/pos-types";
import { cn } from "@/lib/utils";

export function SoldOutPage() {
  const pos = usePos();
  const { products: dbProducts, toggleSoldOut, isLoading } = useProducts();
  const [activeTab, setActiveTab] = useState<"produtos" | "adicionais">("produtos");
  const [q, setQ] = useState("");

  // Modal de edição rápida de opcionais do produto
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [allowCustomization, setAllowCustomization] = useState(true);
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [newExclusionInput, setNewExclusionInput] = useState("");
  const [addons, setAddons] = useState<ProductAddon[]>([]);
  const [newAddonName, setNewAddonName] = useState("");
  const [newAddonPrice, setNewAddonPrice] = useState("");
  const [isPizza, setIsPizza] = useState(false);
  const [pizzaFlavors, setPizzaFlavors] = useState<PizzaFlavor[]>([]);
  const [newFlavorName, setNewFlavorName] = useState("");
  const [newFlavorPrice, setNewFlavorPrice] = useState("");

  const products = useMemo(
    () => dbProducts.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())),
    [dbProducts, q],
  );

  const offProductsCount = dbProducts.filter((p) => p.soldOut).length;

  // Lista agregada de todos os adicionais presentes em produtos
  const allAddons = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        price: number;
        available: boolean;
        productNames: string[];
      }
    >();

    for (const p of pos.products) {
      if (!p.customization?.addons?.length) continue;
      for (const addon of p.customization.addons) {
        const key = addon.name.trim().toLowerCase();
        const existing = map.get(key);
        if (existing) {
          if (!existing.productNames.includes(p.name)) {
            existing.productNames.push(p.name);
          }
        } else {
          map.set(key, {
            name: addon.name.trim(),
            price: addon.price,
            available: addon.available !== false,
            productNames: [p.name],
          });
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [pos.products]);

  const filteredAddons = useMemo(
    () => allAddons.filter((a) => a.name.toLowerCase().includes(q.toLowerCase())),
    [allAddons, q],
  );

  const offAddonsCount = allAddons.filter((a) => !a.available).length;

  const openProductOptions = (p: Product) => {
    setEditingProduct(p);
    const custom = p.customization ?? getDefaultCustomizationForProduct(p.name, p.category);
    setAllowCustomization(custom.allowCustomization);
    setExclusions([...custom.exclusions]);
    setAddons(custom.addons.map((a) => ({ ...a })));
    setIsPizza(Boolean(custom.isPizza));
    setPizzaFlavors(custom.pizzaFlavors ? custom.pizzaFlavors.map((f) => ({ ...f })) : []);
    setNewExclusionInput("");
    setNewAddonName("");
    setNewAddonPrice("");
    setNewFlavorName("");
    setNewFlavorPrice("");
  };

  const handleSaveOptions = async () => {
    if (!editingProduct) return;
    const config: ProductCustomization = {
      allowCustomization,
      exclusions,
      addons,
      isPizza,
      pizzaFlavors: isPizza ? pizzaFlavors : undefined,
    };
    await pos.updateProductCustomization(editingProduct.id, config);
    toast.success("Opcionais e adicionais atualizados com sucesso.", {
      description: editingProduct.name,
    });
    setEditingProduct(null);
  };

  const loadCategoryDefaults = () => {
    if (!editingProduct) return;
    const suggested = getDefaultCustomizationForProduct(
      editingProduct.name,
      editingProduct.category,
    );
    setAllowCustomization(suggested.allowCustomization);
    setExclusions([...suggested.exclusions]);
    setAddons(suggested.addons.map((a) => ({ ...a })));
    setIsPizza(Boolean(suggested.isPizza));
    setPizzaFlavors(suggested.pizzaFlavors ? suggested.pizzaFlavors.map((f) => ({ ...f })) : []);
    toast.info(`Sugestões carregadas para "${editingProduct.category}".`);
  };

  return (
    <AppShell
      title="Controle 86 / Sold Out"
      subtitle="Disponibilidade instantânea de produtos e adicionais em todo o sistema"
    >
      <div className="mx-auto h-full max-w-5xl overflow-hidden rounded-3xl glass p-6 flex flex-col min-h-0">
        <div className="mb-5 flex flex-wrap items-center gap-4">
          <div className="flex h-14 flex-1 min-w-64 items-center gap-3 rounded-2xl glass-soft px-4">
            <Search className="size-5 text-muted-foreground" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full bg-transparent outline-none text-sm"
              placeholder={
                activeTab === "produtos"
                  ? "Buscar produto para pausar ou configurar…"
                  : "Buscar adicional para pausar (86)…"
              }
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex h-14 items-center gap-2 rounded-2xl bg-wait/10 px-4 text-xs font-semibold text-wait ring-1 ring-wait/30">
              <AlertOctagon className="size-4" />
              {activeTab === "produtos"
                ? `${offProductsCount} produto${offProductsCount === 1 ? "" : "s"} pausado${offProductsCount === 1 ? "" : "s"}`
                : `${offAddonsCount} adicional${offAddonsCount === 1 ? "" : "is"} esgotado${offAddonsCount === 1 ? "" : "s"}`}
            </div>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "produtos" | "adicionais")}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="grid grid-cols-2 max-w-md mb-4 bg-secondary/80 rounded-xl h-11 p-1">
            <TabsTrigger
              value="produtos"
              className="text-xs font-semibold rounded-lg flex items-center gap-1.5"
            >
              <UtensilsCrossed className="size-3.5" />
              <span>Produtos ({products.length})</span>
            </TabsTrigger>
            <TabsTrigger
              value="adicionais"
              className="text-xs font-semibold rounded-lg flex items-center gap-1.5"
            >
              <Layers className="size-3.5" />
              <span>Adicionais & Ingredientes ({allAddons.length})</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: PRODUTOS */}
          <TabsContent value="produtos" className="flex-1 min-h-0 overflow-y-auto pr-1">
            {isLoading ? (
              <div className="py-16 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <RefreshCw className="size-4 animate-spin" /> Carregando produtos...
              </div>
            ) : products.length === 0 ? (
              <div className="py-20 text-center text-xs text-muted-foreground rounded-2xl glass-soft">
                <UtensilsCrossed className="size-10 mx-auto text-muted-foreground/50 mb-2" />
                {q
                  ? `Nenhum produto encontrado para "${q}".`
                  : "Nenhum produto cadastrado no momento. Acesse Configurações > Cardápio para cadastrar."}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {products.map((p) => {
                  const hasCustom = p.customization?.allowCustomization;
                  return (
                    <div
                      key={p.id}
                      className={cn(
                        "flex items-center gap-4 rounded-2xl glass-soft p-4 transition-all",
                        p.soldOut && "opacity-60 bg-wait/5 border border-wait/20",
                      )}
                    >
                      <span className="text-3xl shrink-0">{p.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm truncate">{p.name}</p>
                        </div>
                        <p
                          className={`text-xs ${p.soldOut ? "text-wait font-medium" : "text-free"}`}
                        >
                          {p.soldOut ? "Venda pausada (86)" : "Disponível para venda"}
                        </p>

                        <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground mt-1.5">
                          {hasCustom ? (
                            <>
                              <span className="inline-flex items-center gap-1 rounded bg-brand/15 text-brand px-1.5 py-0.5 text-[10px] font-semibold">
                                {p.customization?.addons?.length ?? 0} adicionais
                              </span>
                              {p.customization?.exclusions &&
                                p.customization.exclusions.length > 0 && (
                                  <span className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                    {p.customization.exclusions.length} exclusões
                                  </span>
                                )}
                              {p.customization?.isPizza && (
                                <span className="inline-flex items-center gap-1 rounded bg-cyan/15 text-cyan px-1.5 py-0.5 text-[10px] font-semibold">
                                  🍕 Meio a meio
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/70 italic">
                              Item simples (1 toque)
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => openProductOptions(p)}
                          title="Ajustar adicionais e exclusões deste item"
                          className="size-9 rounded-xl hover:bg-surface-strong"
                        >
                          <Sliders className="size-4 text-muted-foreground hover:text-foreground" />
                        </Button>
                        <Switch
                          checked={!p.soldOut}
                          onCheckedChange={async () => {
                            await toggleSoldOut(p.id);
                            await pos.toggleSoldOut(p.id);
                            toast(p.soldOut ? "Produto reativado" : "Produto pausado (86)", {
                              description: p.name,
                            });
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* TAB 2: ADICIONAIS & INGREDIENTES */}
          <TabsContent value="adicionais" className="flex-1 min-h-0 overflow-y-auto pr-1">
            <div className="mb-3 rounded-2xl bg-brand/10 p-3.5 text-xs text-brand border border-brand/20">
              <p className="font-semibold flex items-center gap-1.5">
                <Layers className="size-4 shrink-0" />
                Pausar ingredientes em tempo real (Controle 86 de Adicionais)
              </p>
              <p className="text-muted-foreground mt-0.5">
                Se acabar algum ingrediente na cozinha (ex: Bacon ou Queijo), desative-o abaixo. Ele
                ficará automaticamente bloqueado na personalização de todos os produtos do cardápio!
              </p>
            </div>

            {filteredAddons.length === 0 ? (
              <div className="py-16 text-center text-xs text-muted-foreground rounded-2xl glass-soft">
                <Layers className="size-10 mx-auto text-muted-foreground/50 mb-2" />
                {q
                  ? `Nenhum adicional encontrado para "${q}".`
                  : "Nenhum adicional cadastrado nos produtos."}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredAddons.map((addon) => (
                  <div
                    key={addon.name}
                    className={cn(
                      "flex items-center justify-between rounded-2xl glass-soft p-4 transition-all",
                      !addon.available && "opacity-60 bg-wait/5 border border-wait/20",
                    )}
                  >
                    <div className="min-w-0 pr-3">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{addon.name}</p>
                        <span className="num font-bold text-xs text-cyan">
                          + {brl(addon.price)}
                        </span>
                      </div>
                      <p
                        className={`text-xs mt-0.5 ${addon.available ? "text-free" : "text-wait font-medium"}`}
                      >
                        {addon.available
                          ? "Disponível para todos os produtos"
                          : "Esgotado na cozinha (86)"}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate mt-1">
                        Usado em: {addon.productNames.join(", ")}
                      </p>
                    </div>

                    <Switch
                      checked={addon.available}
                      onCheckedChange={async () => {
                        await pos.toggleAddonAvailability(addon.name);
                        toast(
                          addon.available
                            ? `Adicional "${addon.name}" pausado (86)`
                            : `Adicional "${addon.name}" reativado`,
                        );
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* MODAL: AJUSTE RÁPIDO DE MODIFICADORES */}
        <Dialog
          open={Boolean(editingProduct)}
          onOpenChange={(v) => {
            if (!v) setEditingProduct(null);
          }}
        >
          <DialogContent className="max-w-xl bg-popover/95 backdrop-blur-2xl max-h-[85vh] flex flex-col p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="text-2xl">{editingProduct?.emoji}</span>
                <span>Opcionais · {editingProduct?.name}</span>
              </DialogTitle>
              <DialogDescription>
                Configure adicionais, exclusões e divisão de sabores para este item.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
              <div className="flex items-center justify-between rounded-2xl glass-soft p-4">
                <div className="pr-4">
                  <p className="font-semibold text-sm">Permitir Personalização no PDV</p>
                  <p className="text-xs text-muted-foreground">
                    Se desativado, o produto é lançado com 1 toque rápido sem exibir modal.
                  </p>
                </div>
                <Switch checked={allowCustomization} onCheckedChange={setAllowCustomization} />
              </div>

              {allowCustomization && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Padrões da categoria {editingProduct?.category}:
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={loadCategoryDefaults}
                      className="rounded-xl text-xs flex items-center gap-1.5"
                    >
                      <Sparkles className="size-3.5 text-brand" />
                      Carregar sugestões
                    </Button>
                  </div>

                  {/* EXCLUSÕES */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                      Ingredientes Removíveis (Exclusões)
                    </label>
                    <div className="flex flex-wrap gap-1.5 min-h-10 items-center rounded-xl glass-soft p-2.5">
                      {exclusions.length === 0 ? (
                        <span className="text-xs text-muted-foreground italic">
                          Nenhum ingrediente configurado para remoção.
                        </span>
                      ) : (
                        exclusions.map((ex, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1 text-xs font-medium border border-border"
                          >
                            {ex}
                            <button
                              type="button"
                              onClick={() =>
                                setExclusions((curr) => curr.filter((_, i) => i !== idx))
                              }
                              className="text-muted-foreground hover:text-wait"
                            >
                              <X className="size-3" />
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={newExclusionInput}
                        onChange={(e) => setNewExclusionInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newExclusionInput.trim()) {
                            e.preventDefault();
                            setExclusions((curr) => [...curr, newExclusionInput.trim()]);
                            setNewExclusionInput("");
                          }
                        }}
                        placeholder="Ex: Sem cebola, Sem maionese"
                        className="rounded-xl h-9 text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          if (newExclusionInput.trim()) {
                            setExclusions((curr) => [...curr, newExclusionInput.trim()]);
                            setNewExclusionInput("");
                          }
                        }}
                        className="rounded-xl text-xs shrink-0"
                      >
                        + Adicionar
                      </Button>
                    </div>
                  </div>

                  {/* ADICIONAIS PAGOS */}
                  <div className="space-y-2 pt-2 border-t border-border/40">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                      Adicionais com Preço
                    </label>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {addons.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-2">
                          Nenhum adicional pago cadastrado para este produto.
                        </p>
                      ) : (
                        addons.map((add, idx) => (
                          <div
                            key={add.id || idx}
                            className="flex items-center justify-between rounded-xl glass-soft px-3 py-2 text-xs"
                          >
                            <span className="font-medium">{add.name}</span>
                            <div className="flex items-center gap-3">
                              <span className="num font-semibold text-cyan">
                                + {brl(add.price)}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setAddons((curr) => curr.filter((_, i) => i !== idx))
                                }
                                className="text-muted-foreground hover:text-wait p-1"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="grid grid-cols-[1fr_100px_auto] gap-2 pt-1">
                      <Input
                        value={newAddonName}
                        onChange={(e) => setNewAddonName(e.target.value)}
                        placeholder="Nome (ex: Bacon, Ovo)"
                        className="rounded-xl h-9 text-xs"
                      />
                      <Input
                        value={newAddonPrice}
                        onChange={(e) => setNewAddonPrice(e.target.value)}
                        placeholder="R$ (ex: 4.50)"
                        className="rounded-xl h-9 text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const p = parseFloat(newAddonPrice.replace(",", "."));
                          if (newAddonName.trim() && !isNaN(p) && p >= 0) {
                            setAddons((curr) => [
                              ...curr,
                              {
                                id: crypto.randomUUID(),
                                name: newAddonName.trim(),
                                price: p,
                                available: true,
                              },
                            ]);
                            setNewAddonName("");
                            setNewAddonPrice("");
                          } else {
                            toast.error("Informe nome e preço válido para o adicional.");
                          }
                        }}
                        className="rounded-xl text-xs shrink-0"
                      >
                        + Adicionar
                      </Button>
                    </div>
                  </div>

                  {/* DIVISÃO DE SABORES / PIZZA */}
                  <div className="space-y-3 pt-2 border-t border-border/40">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-xs">
                          Fracionamento em Sabores (Meio a Meio)
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Habilite para pizzas ou pratos que permitem escolher 2 metades.
                        </p>
                      </div>
                      <Switch checked={isPizza} onCheckedChange={setIsPizza} />
                    </div>

                    {isPizza && (
                      <div className="space-y-2 rounded-xl glass-soft p-3">
                        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                          Sabores Disponíveis
                        </label>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {pizzaFlavors.map((flv, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between bg-surface rounded-lg px-2.5 py-1.5 text-xs"
                            >
                              <span>{flv.name}</span>
                              <div className="flex items-center gap-2">
                                <span className="num font-semibold text-cyan">
                                  {brl(flv.price)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPizzaFlavors((curr) => curr.filter((_, i) => i !== idx))
                                  }
                                  className="text-muted-foreground hover:text-wait"
                                >
                                  <Trash2 className="size-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-[1fr_90px_auto] gap-2 pt-1">
                          <Input
                            value={newFlavorName}
                            onChange={(e) => setNewFlavorName(e.target.value)}
                            placeholder="Sabor (ex: Calabresa)"
                            className="rounded-xl h-8 text-xs"
                          />
                          <Input
                            value={newFlavorPrice}
                            onChange={(e) => setNewFlavorPrice(e.target.value)}
                            placeholder="Preço (ex: 58)"
                            className="rounded-xl h-8 text-xs"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              const p = parseFloat(newFlavorPrice.replace(",", "."));
                              if (newFlavorName.trim() && !isNaN(p) && p >= 0) {
                                setPizzaFlavors((curr) => [
                                  ...curr,
                                  { name: newFlavorName.trim(), price: p },
                                ]);
                                setNewFlavorName("");
                                setNewFlavorPrice("");
                              }
                            }}
                            className="rounded-xl text-xs h-8"
                          >
                            + Sabor
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <DialogFooter className="mt-4 pt-3 border-t border-border">
              <Button
                variant="secondary"
                onClick={() => setEditingProduct(null)}
                className="rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveOptions}
                className="rounded-xl bg-brand text-brand-foreground font-semibold"
              >
                Salvar Opcionais
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
