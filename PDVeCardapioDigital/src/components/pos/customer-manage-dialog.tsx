import { useEffect, useState } from "react";
import { Ban, DollarSign, FileText, Mail, MapPin, Phone, User, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePos } from "@/lib/pos-store";
import type { Customer } from "@/lib/pos-types";

export function CustomerManageDialog({
  open,
  onOpenChange,
  customer,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer | null;
  onSaved?: (customer: Customer) => void;
}) {
  const pos = usePos();
  const isEditing = Boolean(customer);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [cpf, setCpf] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [creditLimit, setCreditLimit] = useState<string>("0");
  const [notes, setNotes] = useState("");
  const [isBlocked, setIsBlocked] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      if (customer) {
        setName(customer.name || "");
        setPhone(customer.phone || "");
        setCpf(customer.cpf || "");
        setAddress(customer.address || "");
        setEmail(customer.email || "");
        setCreditLimit(customer.creditLimit ? String(customer.creditLimit) : "0");
        setNotes(customer.notes || "");
        setIsBlocked(Boolean(customer.isBlocked));
      } else {
        setName("");
        setPhone("");
        setCpf("");
        setAddress("");
        setEmail("");
        setCreditLimit("0");
        setNotes("");
        setIsBlocked(false);
      }
    }
  }, [open, customer]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Informe o nome do cliente");
      return;
    }
    if (!phone.trim()) {
      toast.error("Informe o telefone/WhatsApp do cliente");
      return;
    }

    const limitVal = parseFloat(creditLimit.replace(",", ".")) || 0;

    try {
      setLoading(true);
      if (isEditing && customer) {
        const updated = await pos.updateCustomer(customer.id, {
          name: name.trim(),
          phone: phone.trim(),
          cpf: cpf.trim() || undefined,
          address: address.trim(),
          email: email.trim(),
          creditLimit: limitVal,
          notes: notes.trim() || undefined,
          isBlocked,
        });
        toast.success(`Cliente "${name}" atualizado com sucesso!`);
        onSaved?.(updated);
      } else {
        const created = await pos.addCustomer({
          name: name.trim(),
          phone: phone.trim(),
          cpf: cpf.trim() || undefined,
          address: address.trim(),
          email: email.trim(),
          creditLimit: limitVal,
          notes: notes.trim() || undefined,
          isBlocked,
        });
        toast.success(`Cliente "${name}" cadastrado com sucesso!`);
        onSaved?.(created);
      }
      onOpenChange(false);
    } catch (err: any) {
      console.error("[CustomerManageDialog Error]:", err);
      toast.error("Erro ao salvar cliente: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border-border bg-popover/98 p-6 shadow-2xl">
        <DialogHeader className="border-b border-border/60 pb-3">
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            {isEditing ? (
              <>
                <User className="size-5 text-brand" />
                Editar Cadastro do Cliente
              </>
            ) : (
              <>
                <UserPlus className="size-5 text-brand" />
                Cadastrar Novo Cliente
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Nome e Telefone */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                Nome Completo <b className="text-busy">*</b>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Ex: Carlos Eduardo de Oliveira"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11 w-full rounded-xl border border-input bg-surface pl-9 pr-3 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                Telefone / WhatsApp <b className="text-busy">*</b>
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="(11) 98765-4321"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-11 w-full rounded-xl border border-input bg-surface pl-9 pr-3 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                CPF / CNPJ (Opcional)
              </label>
              <div className="relative">
                <FileText className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="000.000.000-00"
                  value={cpf}
                  onChange={(e) => setCpf(e.target.value)}
                  className="h-11 w-full rounded-xl border border-input bg-surface pl-9 pr-3 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>
          </div>

          {/* Endereço e E-mail */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                Endereço / Bairro (Opcional)
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Rua das Flores, 120 - Centro"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="h-11 w-full rounded-xl border border-input bg-surface pl-9 pr-3 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                E-mail (Opcional)
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
                <input
                  type="email"
                  placeholder="cliente@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 w-full rounded-xl border border-input bg-surface pl-9 pr-3 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>
          </div>

          {/* Limite de Crédito e Bloqueio */}
          <div className="rounded-2xl bg-secondary/60 border border-border/60 p-3.5 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                Limite de Crédito / Fiado (R$)
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
                <input
                  type="number"
                  step="10"
                  min="0"
                  placeholder="0,00 (0 = ilimitado)"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  className="h-11 w-full rounded-xl border border-input bg-surface pl-9 pr-3 font-mono text-sm font-bold outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Informe 0 para não limitar ou defina um teto (ex: R$ 300,00). O sistema alertará caso ultrapasse.
              </p>
            </div>

            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={isBlocked}
                onChange={(e) => setIsBlocked(e.target.checked)}
                className="size-4 rounded accent-busy"
              />
              <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Ban className="size-3.5 text-busy" />
                Bloquear este cliente para novas compras no fiado
              </span>
            </label>
          </div>

          {/* Observações */}
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground">
              Observações Internas (Opcional)
            </label>
            <textarea
              rows={2}
              placeholder="Ex: Paga sempre dia 10; irmão do gerente..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-input bg-surface p-3 text-xs outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />
          </div>
        </div>

        <DialogFooter className="mt-4 gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => onOpenChange(false)}
            className="h-11 rounded-xl"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={loading}
            onClick={handleSubmit}
            className="tap h-11 rounded-xl bg-brand px-6 font-bold text-brand-foreground shadow-sm hover:brightness-110"
          >
            {loading ? "Salvando…" : isEditing ? "Salvar Alterações" : "Cadastrar Cliente"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
