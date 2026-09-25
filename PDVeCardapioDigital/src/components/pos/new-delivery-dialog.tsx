import { useState } from "react";
import { Bike, MessageSquare, Phone, Plus, ShoppingBag, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePos } from "@/lib/pos-store";
import { brl, uid } from "@/lib/pos-format";
import type { DeliverySource, OrderItem } from "@/lib/pos-types";
import { cn } from "@/lib/utils";

export function NewDeliveryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pos = usePos();

  const [source, setSource] = useState<DeliverySource>("whatsapp");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [bairro, setBairro] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("PIX");
  const [deliveryFee, setDeliveryFee] = useState(5.0);
  const [notes, setNotes] = useState("");

  // Items selection
  const [selectedProductId, setSelectedProductId] = useState("");
  const [itemQty, setItemQty] = useState(1);
  const [itemNotes, setItemNotes] = useState("");
  const [items, setItems] = useState<OrderItem[]>([]);

  const resetForm = () => {
    setSource("whatsapp");
    setCustomerName("");
    setPhone("");
    setAddress("");
    setBairro("");
    setPaymentMethod("PIX");
    setDeliveryFee(5.0);
    setNotes("");
    setSelectedProductId("");
    setItemQty(1);
    setItemNotes("");
    setItems([]);
  };

  const handleAddItem = () => {
    if (!selectedProductId) {
      toast.error("Selecione um produto do cardápio");
      return;
    }
    const product = pos.products.find((p) => p.id === selectedProductId);
    if (!product) return;

    const newItem: OrderItem = {
      id: uid(),
      name: product.name,
      qty: itemQty,
      unitPrice: product.price,
      price: product.price,
      details: itemNotes.trim() ? [itemNotes.trim()] : undefined,
    };

    setItems((prev) => [...prev, newItem]);
    setSelectedProductId("");
    setItemQty(1);
    setItemNotes("");
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const itemsSubtotal = items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0);
  const orderTotal = Number((itemsSubtotal + deliveryFee).toFixed(2));

  const handleSubmit = async () => {
    if (!customerName.trim()) {
      toast.error("Informe o nome do cliente");
      return;
    }
    if (!address.trim()) {
      toast.error("Informe o endereço de entrega");
      return;
    }
    if (!bairro.trim()) {
      toast.error("Informe o bairro de entrega");
      return;
    }
    if (items.length === 0) {
      toast.error("Adicione ao menos um item ao pedido");
      return;
    }

    const codeNumber = 500 + pos.delivery.length + 1;
    const prefix = source === "whatsapp" ? "WPP" : source === "telefone" ? "TEL" : "IFOOD";
    const code = `#${prefix}-${codeNumber}`;

    try {
      await pos.addDeliveryOrder({
        code,
        source,
        customer: customerName.trim(),
        phone: phone.trim() || undefined,
        address: address.trim(),
        bairro: bairro.trim(),
        total: orderTotal,
        items,
        paymentMethod,
        notes: notes.trim() || undefined,
      });

      toast.success(`Pedido ${code} criado com sucesso!`);
      resetForm();
      onOpenChange(false);
    } catch (err) {
      console.error("[NewDeliveryDialog Error]:", err);
      toast.error("Erro ao registrar pedido de delivery");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border-border bg-popover/98 p-6 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <Bike className="size-6 text-brand" />
            Novo Pedido de Entrega
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Origem do Pedido */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground uppercase">
              Canal de Venda
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSource("whatsapp")}
                className={cn(
                  "tap flex h-11 items-center justify-center gap-2 rounded-xl text-xs font-semibold ring-1 transition-all",
                  source === "whatsapp"
                    ? "bg-whats/20 text-whats ring-whats/50"
                    : "bg-surface text-muted-foreground ring-border hover:bg-secondary",
                )}
              >
                <MessageSquare className="size-4" />
                WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setSource("telefone")}
                className={cn(
                  "tap flex h-11 items-center justify-center gap-2 rounded-xl text-xs font-semibold ring-1 transition-all",
                  source === "telefone"
                    ? "bg-fone/20 text-fone ring-fone/50"
                    : "bg-surface text-muted-foreground ring-border hover:bg-secondary",
                )}
              >
                <Phone className="size-4" />
                Telefone
              </button>
              <button
                type="button"
                onClick={() => setSource("ifood")}
                className={cn(
                  "tap flex h-11 items-center justify-center gap-2 rounded-xl text-xs font-semibold ring-1 transition-all",
                  source === "ifood"
                    ? "bg-ifood/20 text-ifood ring-ifood/50"
                    : "bg-surface text-muted-foreground ring-border hover:bg-secondary",
                )}
              >
                <ShoppingBag className="size-4" />
                iFood (Manual)
              </button>
            </div>
          </div>

          {/* Dados do Cliente e Entrega */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Nome do Cliente <b className="text-busy">*</b>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Ex: Carlos Oliveira"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="h-11 w-full rounded-xl border border-input bg-surface pl-9 pr-3 text-sm outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Telefone / WhatsApp
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="(11) 98765-4321"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-11 w-full rounded-xl border border-input bg-surface pl-9 pr-3 text-sm outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Endereço Completo (Rua, Número, Apto/Bloco) <b className="text-busy">*</b>
              </label>
              <input
                type="text"
                placeholder="Rua das Palmeiras, 142 - Apto 32"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-surface px-3 text-sm outline-none focus:ring-1 focus:ring-brand"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Bairro <b className="text-busy">*</b>
              </label>
              <input
                type="text"
                placeholder="Ex: Centro"
                value={bairro}
                onChange={(e) => setBairro(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-surface px-3 text-sm outline-none focus:ring-1 focus:ring-brand"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Taxa de Entrega (R$)
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(Number(e.target.value) || 0)}
                className="h-11 w-full rounded-xl border border-input bg-surface px-3 text-sm outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>

          {/* Adicionar Itens */}
          <div className="rounded-2xl border border-border/80 bg-surface/60 p-4">
            <h4 className="mb-3 font-semibold text-sm">Itens do Cardápio</h4>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex-1">
                <Select
                  value={selectedProductId || "none"}
                  onValueChange={(val) => setSelectedProductId(val === "none" ? "" : val)}
                >
                  <SelectTrigger className="h-11 rounded-xl bg-surface/80 border-input">
                    <SelectValue placeholder="Selecione um produto…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Selecione um produto…</SelectItem>
                    {pos.products
                      .filter((p) => !p.soldOut)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} - {brl(p.price)} ({p.category})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={itemQty}
                  onChange={(e) => setItemQty(Math.max(1, Number(e.target.value) || 1))}
                  className="h-11 w-20 rounded-xl border border-input bg-surface px-3 text-center text-sm outline-none focus:ring-1 focus:ring-brand"
                />
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="tap flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand px-4 font-semibold text-brand-foreground text-xs sm:flex-none"
                >
                  <Plus className="size-4" />
                  Adicionar
                </button>
              </div>
            </div>

            {selectedProductId && (
              <div className="mt-2">
                <input
                  type="text"
                  placeholder="Observação do item (ex: bem passado, sem salada...)"
                  value={itemNotes}
                  onChange={(e) => setItemNotes(e.target.value)}
                  className="h-9 w-full rounded-lg border border-input bg-surface px-3 text-xs outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
            )}

            {/* Lista de itens já adicionados */}
            <div className="mt-4 space-y-2">
              {items.length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  Nenhum item adicionado ainda
                </p>
              ) : (
                items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl bg-secondary/60 p-3 border border-border/60 text-xs transition-colors"
                  >
                    <div>
                      <span className="font-bold text-sm text-foreground">
                        {item.qty}x {item.name}
                      </span>
                      {item.details && item.details.length > 0 && (
                        <p className="text-xs font-semibold text-foreground/80 mt-0.5">
                          {item.details.join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="num font-bold text-sm text-foreground">{brl(item.unitPrice * item.qty)}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        className="tap text-busy hover:text-busy/80"
                        title="Remover"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Pagamento e Observações Gerais */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Forma de Pagamento
              </label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="h-11 rounded-xl bg-surface/80 border-input">
                  <SelectValue placeholder="Forma de Pagamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PIX">PIX</SelectItem>
                  <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="Cartão de Crédito">Cartão de Crédito</SelectItem>
                  <SelectItem value="Cartão de Débito">Cartão de Débito</SelectItem>
                  <SelectItem value="Pago Online">Pago Online (iFood)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Observações do Pedido (Troco, Portão, etc.)
              </label>
              <input
                type="text"
                placeholder="Ex: Troco para 50, interfone 32"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-11 w-full rounded-xl border border-input bg-surface px-3 text-sm outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
          </div>

          {/* Resumo financeiro */}
          <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 dark:bg-emerald-950/30 border border-emerald-500/25 p-3.5">
            <div className="text-xs text-muted-foreground">
              Subtotal: <span className="font-semibold text-foreground">{brl(itemsSubtotal)}</span> · Entrega: <span className="font-semibold text-foreground">{brl(deliveryFee)}</span>
            </div>
            <div className="text-right">
              <span className="text-xs font-medium text-muted-foreground mr-2">Total do Pedido:</span>
              <span className="num font-black text-xl text-emerald-600 dark:text-emerald-400">{brl(orderTotal)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-5 gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-11 rounded-xl px-5 text-sm font-semibold"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            className="h-11 rounded-xl bg-brand px-6 text-sm font-bold text-brand-foreground shadow-sm hover:brightness-110"
          >
            Emitir Pedido de Entrega
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
