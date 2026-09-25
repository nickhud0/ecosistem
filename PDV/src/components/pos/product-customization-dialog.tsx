import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, SplitSquareHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { brl, uid } from "@/lib/pos-format";
import { getDefaultCustomizationForProduct, type OrderItem, type Product } from "@/lib/pos-types";
import { cn } from "@/lib/utils";

export function ProductCustomizationDialog({
  product,
  open,
  onOpenChange,
  onConfirm,
}: {
  product: Product | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (item: OrderItem) => void;
}) {
  const [excluded, setExcluded] = useState<string[]>([]);
  const [addons, setAddons] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [half, setHalf] = useState(false);
  const [secondFlavor, setSecondFlavor] = useState("");
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    if (!open) {
      setExcluded([]);
      setAddons({});
      setNote("");
      setHalf(false);
      setSecondFlavor("");
      setQuantity(1);
    }
  }, [open]);

  const customConfig = useMemo(() => {
    if (!product) return null;
    return (
      product.customization ?? getDefaultCustomizationForProduct(product.name, product.category)
    );
  }, [product]);

  const exclusions = customConfig?.exclusions ?? [];
  const addonsList = useMemo(() => customConfig?.addons ?? [], [customConfig]);
  const isPizza = Boolean(customConfig?.isPizza || product?.name.toLowerCase().includes("pizza"));
  const pizzaFlavors =
    customConfig?.pizzaFlavors && customConfig.pizzaFlavors.length > 0
      ? customConfig.pizzaFlavors
      : isPizza
        ? [
            { name: "Calabresa", price: 58 },
            { name: "Quatro Queijos", price: 64 },
            { name: "Margherita", price: 52 },
            { name: "Portuguesa", price: 62 },
          ]
        : [];

  const second = pizzaFlavors.find((flavor) => flavor.name === secondFlavor);
  const basePrice = product
    ? half && second
      ? Math.max(product.price, second.price)
      : product.price
    : 0;
  const addonTotal = useMemo(
    () => addonsList.reduce((sum, addon) => sum + addon.price * (addons[addon.name] ?? 0), 0),
    [addons, addonsList],
  );

  if (!product) return null;
  const confirm = () => {
    if (half && !second) return;
    const details = [
      ...(half && second
        ? [
            `Meia ${product.name.replace(/^Pizza\s*/i, "")} / Meia ${second.name}`,
            "Preço pela metade mais cara",
          ]
        : []),
      ...excluded,
      ...addonsList
        .filter((addon) => addons[addon.name])
        .map(
          (addon) =>
            `Adicional de ${addon.name}${(addons[addon.name] ?? 0) > 1 ? ` ×${addons[addon.name]}` : ""} (+ ${brl(addon.price * (addons[addon.name] ?? 0))})`,
        ),
      ...(note.trim() ? [`Obs.: ${note.trim()}`] : []),
    ];
    onConfirm({
      id: uid(),
      name: product.name,
      qty: Math.max(1, quantity),
      unitPrice: basePrice + addonTotal,
      details,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden border-border bg-popover/98 p-0 shadow-2xl">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="font-display">Personalizar · {product.name}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[72vh] space-y-5 overflow-y-auto p-6">
          {isPizza ? (
            <section>
              <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Formato da pizza
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setHalf(false)}
                  className={cn("h-14 rounded-xl", !half && "ring-2 ring-brand")}
                >
                  Sabor inteiro
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setHalf(true)}
                  className={cn("h-14 rounded-xl", half && "ring-2 ring-brand")}
                >
                  <SplitSquareHorizontal /> Meio a meio
                </Button>
              </div>
              {half ? (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {pizzaFlavors
                      .filter((flavor) => !product.name.includes(flavor.name))
                      .map((flavor) => (
                        <Button
                          key={flavor.name}
                          type="button"
                          variant="secondary"
                          onClick={() => setSecondFlavor(flavor.name)}
                          className={cn(
                            "h-14 justify-between rounded-xl px-3",
                            secondFlavor === flavor.name && "ring-2 ring-cyan",
                          )}
                        >
                          <span>Meia {flavor.name}</span>
                          <span className="num text-xs">{brl(flavor.price)}</span>
                        </Button>
                      ))}
                  </div>
                  <p className="mt-3 rounded-xl bg-busy/15 px-3 py-2 text-xs text-busy ring-1 ring-busy/30">
                    O valor da pizza será o preço do sabor mais caro.
                  </p>
                </>
              ) : null}
            </section>
          ) : null}

          {exclusions.length > 0 && (
            <section>
              <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Exclusões / Retirar ingredientes
              </p>
              <div className="grid grid-cols-2 gap-2">
                {exclusions.map((entry) => (
                  <label
                    key={entry}
                    className="flex h-12 cursor-pointer items-center gap-3 rounded-xl glass-soft px-3 text-sm"
                  >
                    <Checkbox
                      checked={excluded.includes(entry)}
                      onCheckedChange={(checked) =>
                        setExcluded((current) =>
                          checked
                            ? [...current, entry]
                            : current.filter((value) => value !== entry),
                        )
                      }
                    />
                    {entry}
                  </label>
                ))}
              </div>
            </section>
          )}

          {addonsList.length > 0 && (
            <section>
              <p className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Adicionais
              </p>
              <div className="space-y-2">
                {addonsList.map((addon) => {
                  const isAvailable = addon.available !== false;
                  return (
                    <div
                      key={addon.name}
                      className={cn(
                        "flex h-14 items-center rounded-xl glass-soft px-3",
                        !isAvailable && "opacity-50",
                      )}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{addon.name}</p>
                          {!isAvailable && (
                            <span className="rounded bg-wait/20 px-1.5 py-0.5 text-[10px] font-semibold text-wait">
                              Esgotado (86)
                            </span>
                          )}
                        </div>
                        <p className="num text-xs text-cyan">+ {brl(addon.price)}</p>
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-10 rounded-lg"
                          disabled={!addons[addon.name]}
                          onClick={() =>
                            setAddons((current) => ({
                              ...current,
                              [addon.name]: Math.max(0, (current[addon.name] ?? 0) - 1),
                            }))
                          }
                        >
                          <Minus />
                        </Button>
                        <span className="num w-5 text-center">{addons[addon.name] ?? 0}</span>
                        <Button
                          type="button"
                          size="icon"
                          variant="secondary"
                          className="size-10 rounded-lg"
                          disabled={!isAvailable}
                          onClick={() =>
                            setAddons((current) => ({
                              ...current,
                              [addon.name]: (current[addon.name] ?? 0) + 1,
                            }))
                          }
                        >
                          <Plus />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {!isPizza && exclusions.length === 0 && addonsList.length === 0 && (
            <div className="rounded-2xl glass-soft p-4 text-center text-xs text-muted-foreground">
              Este produto não possui adicionais ou exclusões configurados.
            </div>
          )}
          <section className="rounded-2xl glass-soft p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Quantidade</p>
                <p className="text-xs text-muted-foreground">
                  Quantas unidades deste item adicionar
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="size-11 rounded-xl"
                  disabled={quantity <= 1}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                >
                  <Minus className="size-5" />
                </Button>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={quantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 1) setQuantity(val);
                    else if (e.target.value === "") setQuantity(1);
                  }}
                  className="w-14 text-center font-display text-xl font-bold bg-transparent border-b border-border/80 outline-none"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="size-11 rounded-xl"
                  onClick={() => setQuantity((q) => q + 1)}
                >
                  <Plus className="size-5" />
                </Button>
              </div>
            </div>
          </section>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Observação livre
            </span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ex.: ponto da carne, molho à parte..."
              className="min-h-20 w-full resize-none rounded-xl border border-input bg-surface p-3 text-sm outline-none focus:ring-1 focus:ring-brand"
            />
          </label>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-border bg-surface px-6 py-4">
          <div>
            <div className="flex items-baseline gap-2">
              <p className="num text-2xl font-bold text-foreground">
                {brl((basePrice + addonTotal) * Math.max(1, quantity))}
              </p>
              {quantity > 1 && (
                <span className="text-xs text-muted-foreground font-medium">
                  ({quantity}x {brl(basePrice + addonTotal)})
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Total do item</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-xl bg-secondary/80 p-1">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-9 rounded-lg"
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              >
                <Minus className="size-4" />
              </Button>
              <span className="w-8 text-center font-bold text-sm">{quantity}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-9 rounded-lg"
                onClick={() => setQuantity((q) => q + 1)}
              >
                <Plus className="size-4" />
              </Button>
            </div>
            <Button
              type="button"
              disabled={half && !second}
              onClick={confirm}
              className="h-12 rounded-xl bg-brand px-6 font-semibold text-brand-foreground shadow-md shadow-brand/20"
            >
              Adicionar ao pedido {quantity > 1 ? `(${quantity})` : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
