import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePos } from "@/lib/pos-store";
import type { Customer } from "@/lib/pos-types";

export function CustomerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (customer: Customer) => void;
}) {
  const pos = usePos();
  const [form, setForm] = useState({ name: "", phone: "", address: "", email: "" });

  useEffect(() => {
    if (!open) setForm({ name: "", phone: "", address: "", email: "" });
  }, [open]);

  const save = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      toast.error("Informe nome e telefone");
      return;
    }
    const customer = await pos.addCustomer({
      ...form,
      name: form.name.trim(),
      phone: form.phone.trim(),
    });
    onCreated?.(customer);
    toast.success("Cliente cadastrado", { description: customer.name });
    onOpenChange(false);
  };

  const field = (key: keyof typeof form, label: string, placeholder: string, required = false) => (
    <label className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        {label} {required ? <b className="text-busy">essencial</b> : <span>· opcional</span>}
      </span>
      <input
        value={form[key]}
        onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
        placeholder={placeholder}
        className="h-12 w-full rounded-xl border border-input bg-surface px-3 text-sm outline-none focus:ring-1 focus:ring-brand"
      />
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-border bg-popover/98 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <UserPlus className="size-5 text-cyan" />
            Cadastro rápido
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          {field("name", "Nome", "Nome do cliente", true)}
          {field("phone", "Telefone / WhatsApp", "(00) 00000-0000", true)}
          {field("address", "Endereço", "Rua, número e complemento")}
          {field("email", "E-mail", "cliente@email.com")}
        </div>
        <Button
          type="button"
          onClick={save}
          className="h-14 rounded-xl bg-brand text-brand-foreground"
        >
          Salvar cliente
        </Button>
      </DialogContent>
    </Dialog>
  );
}
