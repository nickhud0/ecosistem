import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  Edit2,
  ExternalLink,
  FileText,
  HandCoins,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  User,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pos/app-shell";
import { usePos } from "@/lib/pos-store";
import { brl } from "@/lib/pos-format";
import { printFiadoPaymentReceipt } from "@/lib/printer-service";
import type { Customer, CustomerTransaction } from "@/lib/pos-types";
import { cn } from "@/lib/utils";
import { FiadoPaymentDialog } from "./fiado-payment-dialog";
import { CustomerManageDialog } from "./customer-manage-dialog";

export function FiadoPage() {
  const pos = usePos();

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "debt" | "clean" | "overlimit">("all");
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [expandedSaleIds, setExpandedSaleIds] = useState<Record<string, boolean>>({});

  // Cliente atualmente selecionado atualizado em tempo real com a store
  const selectedCustomer = useMemo(() => {
    if (!selectedCustomerId) return null;
    return pos.customers.find((c) => c.id === selectedCustomerId) || null;
  }, [pos.customers, selectedCustomerId]);

  // Transações do cliente selecionado ordenadas da mais recente para a mais antiga
  const customerTransactions = useMemo(() => {
    if (!selectedCustomerId) return [];
    return pos.customerTransactions
      .filter((t) => t.customerId === selectedCustomerId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [pos.customerTransactions, selectedCustomerId]);

  // Métricas do Dashboard Superior
  const metrics = useMemo(() => {
    let totalDebt = 0;
    let debtorsCount = 0;
    let overLimitCount = 0;

    for (const c of pos.customers) {
      const due = c.balanceDue ?? 0;
      if (due > 0) {
        totalDebt += due;
        debtorsCount++;
        if (c.creditLimit && c.creditLimit > 0 && due > c.creditLimit) {
          overLimitCount++;
        }
      }
    }

    // Total baixado / recebido hoje
    const today = new Date().toISOString().slice(0, 10);
    const receivedToday = pos.customerTransactions
      .filter((t) => t.type === "credito" && t.createdAt.startsWith(today))
      .reduce((sum, t) => sum + t.amount, 0);

    return { totalDebt, debtorsCount, overLimitCount, receivedToday };
  }, [pos.customers, pos.customerTransactions]);

  // Filtro de clientes
  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pos.customers.filter((c) => {
      // 1. Filtro de texto
      if (q) {
        const matchesName = c.name.toLowerCase().includes(q);
        const matchesPhone = c.phone.toLowerCase().includes(q);
        const matchesCpf = c.cpf ? c.cpf.toLowerCase().includes(q) : false;
        if (!matchesName && !matchesPhone && !matchesCpf) return false;
      }

      // 2. Filtro de abas
      const due = c.balanceDue ?? 0;
      if (filterMode === "debt") return due > 0;
      if (filterMode === "clean") return due <= 0;
      if (filterMode === "overlimit") {
        return Boolean(c.creditLimit && c.creditLimit > 0 && due > c.creditLimit);
      }

      return true;
    });
  }, [pos.customers, search, filterMode]);

  // Toggle de itens expandidos na lista de movimentações
  const toggleSaleExpand = (saleId: string) => {
    setExpandedSaleIds((prev) => ({ ...prev, [saleId]: !prev[saleId] }));
  };

  // Geração de mensagem formatada para cobrança amigável via WhatsApp
  const handleSendWhatsApp = (customer: Customer) => {
    const digits = customer.phone.replace(/\D/g, "");
    if (!digits) {
      toast.error("Cliente não possui telefone válido para WhatsApp");
      return;
    }

    const dueStr = brl(customer.balanceDue ?? 0);
    const message = encodeURIComponent(
      `Olá, ${customer.name}! Tudo bem?\n\nPassando para enviar o extrato atualizado da sua conta no restaurante. Saldo pendente: *${dueStr}*.\n\nQualquer dúvida ou para acertar via PIX, estamos à disposição! Muito obrigado!`,
    );

    window.open(`https://wa.me/55${digits}?text=${message}`, "_blank");
  };

  // Exclusão de cliente com proteção contra saldo devedor
  const handleDeleteCustomer = async (customer: Customer) => {
    if ((customer.balanceDue ?? 0) > 0) {
      toast.error(
        `Não é possível excluir ${customer.name} pois ele possui saldo devedor de ${brl(customer.balanceDue ?? 0)}! Realize a quitação antes.`,
      );
      return;
    }

    if (!confirm(`Tem certeza que deseja excluir o cadastro de ${customer.name}?`)) {
      return;
    }

    try {
      await pos.deleteCustomer(customer.id);
      toast.success(`Cliente ${customer.name} excluído com sucesso`);
      if (selectedCustomerId === customer.id) {
        setSelectedCustomerId(null);
      }
    } catch (err: any) {
      toast.error(err?.message || "Erro ao excluir cliente");
    }
  };

  return (
    <AppShell title="Controle de Fiado" subtitle="Clientes · Contas a Receber · Caderneta Digital">
      <div className="flex h-full flex-col gap-4">
        {/* 1. Dashboard de Métricas do Fiado */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {/* Total a Receber */}
          <div className="rounded-2xl border border-border/80 bg-surface/90 p-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Total a Receber
              </span>
              <span className="grid size-7 place-items-center rounded-lg bg-busy/15 text-busy">
                <TrendingUp className="size-4" />
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="num font-black text-xl sm:text-2xl text-busy">
                {brl(metrics.totalDebt)}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Saldo acumulado de todas as contas
            </p>
          </div>

          {/* Clientes com Débito */}
          <div className="rounded-2xl border border-border/80 bg-surface/90 p-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Clientes Pendentes
              </span>
              <span className="grid size-7 place-items-center rounded-lg bg-amber-500/15 text-amber-500">
                <Users className="size-4" />
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="num font-black text-xl sm:text-2xl text-foreground">
                {metrics.debtorsCount}
              </span>
              <span className="text-xs text-muted-foreground">clientes</span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {pos.customers.length} cadastrados no total
            </p>
          </div>

          {/* Recebido Hoje */}
          <div className="rounded-2xl border border-border/80 bg-surface/90 p-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Baixado Hoje
              </span>
              <span className="grid size-7 place-items-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <TrendingDown className="size-4" />
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="num font-black text-xl sm:text-2xl text-emerald-600 dark:text-emerald-400">
                {brl(metrics.receivedToday)}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Entradas de quitação neste dia
            </p>
          </div>

          {/* Clientes Acima do Limite */}
          <div className="rounded-2xl border border-border/80 bg-surface/90 p-3.5 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Acima do Limite
              </span>
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-lg",
                  metrics.overLimitCount > 0
                    ? "bg-busy/15 text-busy animate-pulse"
                    : "bg-secondary text-muted-foreground",
                )}
              >
                <AlertTriangle className="size-4" />
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span
                className={cn(
                  "num font-black text-xl sm:text-2xl",
                  metrics.overLimitCount > 0 ? "text-busy" : "text-foreground",
                )}
              >
                {metrics.overLimitCount}
              </span>
              <span className="text-xs text-muted-foreground">em alerta</span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {metrics.overLimitCount > 0 ? "Requer atenção do caixa" : "Nenhum cliente estourado"}
            </p>
          </div>
        </div>

        {/* 2. Barra de Ferramentas: Busca, Filtros e Botão Novo Cliente */}
        <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-surface/90 p-3 shadow-xs sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            {/* Campo de Busca Rápida */}
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por nome, telefone ou CPF…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 w-full rounded-xl border border-input bg-surface pl-9 pr-8 text-xs outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="tap absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            {/* Abas de Filtros Rápidos */}
            <div className="flex items-center rounded-xl border border-border/60 bg-secondary/80 p-1">
              <button
                type="button"
                onClick={() => setFilterMode("all")}
                className={cn(
                  "tap rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
                  filterMode === "all"
                    ? "bg-brand text-brand-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Todos ({pos.customers.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("debt")}
                className={cn(
                  "tap rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
                  filterMode === "debt"
                    ? "bg-brand text-brand-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Com Débito ({metrics.debtorsCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("clean")}
                className={cn(
                  "tap rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
                  filterMode === "clean"
                    ? "bg-brand text-brand-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Em Dia ({pos.customers.length - metrics.debtorsCount})
              </button>
              {metrics.overLimitCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterMode("overlimit")}
                  className={cn(
                    "tap rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
                    filterMode === "overlimit"
                      ? "bg-busy text-white shadow-sm"
                      : "text-busy hover:bg-busy/10",
                  )}
                >
                  Acima do Limite ({metrics.overLimitCount})
                </button>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setEditingCustomer(null);
              setManageDialogOpen(true);
            }}
            className="tap flex h-10 items-center justify-center gap-1.5 rounded-xl bg-brand px-4 text-xs font-bold text-brand-foreground shadow-sm hover:brightness-110"
          >
            <Plus className="size-4 stroke-[3]" />
            Novo Cliente
          </button>
        </div>

        {/* 3. Layout de 2 Painéis: Lista de Clientes (Esquerda) e Extrato / Caderneta (Direita) */}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-12 overflow-hidden">
          {/* Painel Esquerdo: Lista de Clientes (4 colunas) */}
          <div className="flex min-h-0 flex-col rounded-2xl border border-border/80 bg-surface/90 p-3 shadow-xs lg:col-span-5 xl:col-span-4 overflow-hidden">
            <div className="mb-2 flex items-center justify-between border-b border-border/50 pb-2">
              <span className="text-xs font-bold text-foreground">
                Clientes ({filteredCustomers.length})
              </span>
              <span className="text-[11px] text-muted-foreground">Clique para ver o extrato</span>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto pr-1">
              {filteredCustomers.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  <User className="mx-auto size-8 opacity-40 mb-2" />
                  <p className="text-xs font-semibold">Nenhum cliente encontrado</p>
                  <p className="text-[11px] mt-0.5">Tente outro filtro ou cadastre um novo.</p>
                </div>
              ) : (
                filteredCustomers.map((c) => {
                  const isSelected = selectedCustomerId === c.id;
                  const due = c.balanceDue ?? 0;
                  const hasDebt = due > 0;
                  const isOver = Boolean(c.creditLimit && c.creditLimit > 0 && due > c.creditLimit);

                  return (
                    <article
                      key={c.id}
                      onClick={() => setSelectedCustomerId(c.id)}
                      className={cn(
                        "tap cursor-pointer rounded-xl border p-3 transition-all",
                        isSelected
                          ? "border-brand bg-brand/10 shadow-xs ring-1 ring-brand/40"
                          : "border-border/70 bg-background/80 hover:border-brand/40 hover:bg-secondary/40",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <h4 className="truncate text-sm font-bold text-foreground">{c.name}</h4>
                            {c.isBlocked && (
                              <span
                                className="grid size-4 place-items-center text-busy shrink-0"
                                title="Bloqueado para novas compras"
                              >
                                <Ban className="size-3.5" />
                              </span>
                            )}
                          </div>
                          <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5 truncate">
                            <Phone className="size-3 shrink-0" />
                            <span>{c.phone}</span>
                            {c.cpf && <span className="opacity-80">· {c.cpf}</span>}
                          </p>
                        </div>

                        {/* Badge de Saldo Devedor */}
                        <div className="text-right shrink-0">
                          {hasDebt ? (
                            <span className="block num font-black text-sm text-busy">
                              {brl(due)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="size-3" />
                              Em dia
                            </span>
                          )}

                          {c.creditLimit && c.creditLimit > 0 ? (
                            <span
                              className={cn(
                                "block text-[10px] font-semibold mt-0.5",
                                isOver ? "text-busy font-bold" : "text-muted-foreground",
                              )}
                            >
                              Lim: {brl(c.creditLimit)}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      {/* Barra de Progresso do Limite se configurado */}
                      {c.creditLimit && c.creditLimit > 0 && (
                        <div className="mt-2.5">
                          <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                isOver
                                  ? "bg-busy"
                                  : due / c.creditLimit > 0.75
                                  ? "bg-amber-500"
                                  : "bg-brand",
                              )}
                              style={{
                                width: `${Math.min(100, Math.round((due / c.creditLimit) * 100))}%`,
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </div>
          </div>

          {/* Painel Direito: Caderneta / Extrato do Cliente Selecionado (8 colunas) */}
          <div className="flex min-h-0 flex-col rounded-2xl border border-border/80 bg-surface/90 p-4 shadow-xs lg:col-span-7 xl:col-span-8 overflow-hidden">
            {selectedCustomer ? (
              <div className="flex h-full min-h-0 flex-col space-y-4">
                {/* Cabeçalho do Cliente Selecionado */}
                <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-secondary/50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-xl font-bold text-foreground">
                        {selectedCustomer.name}
                      </h2>
                      {selectedCustomer.isBlocked && (
                        <span className="rounded-full bg-busy/15 px-2.5 py-0.5 text-[10px] font-bold text-busy border border-busy/30">
                          Bloqueado p/ Fiado
                        </span>
                      )}
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Phone className="size-3.5 text-cyan" />
                        <b className="text-foreground">{selectedCustomer.phone}</b>
                      </span>
                      {selectedCustomer.cpf && (
                        <span>
                          CPF: <b className="text-foreground">{selectedCustomer.cpf}</b>
                        </span>
                      )}
                      {selectedCustomer.address && (
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3.5 text-brand" />
                          <span>{selectedCustomer.address}</span>
                        </span>
                      )}
                    </div>

                    {selectedCustomer.notes && (
                      <p className="mt-1.5 text-xs text-amber-500 font-medium">
                        Obs: {selectedCustomer.notes}
                      </p>
                    )}
                  </div>

                  {/* Resumo do Saldo e Botão de Ação Primária */}
                  <div className="flex flex-wrap items-center gap-3 sm:flex-col sm:items-end">
                    <div className="text-left sm:text-right">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                        Saldo Devedor Atual
                      </span>
                      <span
                        className={cn(
                          "num font-black text-2xl sm:text-3xl",
                          (selectedCustomer.balanceDue ?? 0) > 0
                            ? "text-busy"
                            : "text-emerald-600 dark:text-emerald-400",
                        )}
                      >
                        {brl(selectedCustomer.balanceDue ?? 0)}
                      </span>
                    </div>

                    {/* Botões Rápidos de Ação */}
                    <div className="flex items-center gap-2">
                      {(selectedCustomer.balanceDue ?? 0) > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSendWhatsApp(selectedCustomer)}
                            className="tap flex h-9 items-center gap-1.5 rounded-xl bg-whats/15 px-3 text-xs font-bold text-whats hover:bg-whats/25 border border-whats/30 transition-colors"
                            title="Enviar extrato e cobrar via WhatsApp"
                          >
                            <MessageSquare className="size-3.5" />
                            Cobrar WhatsApp
                          </button>

                          <button
                            type="button"
                            onClick={() => setPaymentDialogOpen(true)}
                            className="tap flex h-9 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition-colors"
                          >
                            <CheckCircle2 className="size-4" />
                            Receber / Baixar
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setEditingCustomer(selectedCustomer);
                          setManageDialogOpen(true);
                        }}
                        className="tap grid size-9 place-items-center rounded-xl bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground border border-border transition-colors"
                        title="Editar cadastro do cliente"
                      >
                        <Edit2 className="size-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteCustomer(selectedCustomer)}
                        className="tap grid size-9 place-items-center rounded-xl bg-secondary text-muted-foreground hover:bg-destructive/15 hover:text-destructive border border-border transition-colors"
                        title="Excluir cliente"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Linha do Tempo / Extrato de Movimentações */}
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div className="mb-2 flex items-center justify-between border-b border-border/50 pb-2">
                    <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <FileText className="size-3.5 text-brand" />
                      Extrato da Conta ({customerTransactions.length} movimentações)
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Compras a prazo e amortizações
                    </span>
                  </div>

                  <div className="flex-1 space-y-2.5 overflow-y-auto pr-1">
                    {customerTransactions.length === 0 ? (
                      <div className="py-20 text-center text-muted-foreground">
                        <Receipt className="mx-auto size-10 opacity-35 mb-2" />
                        <p className="text-sm font-semibold">Nenhuma movimentação registrada</p>
                        <p className="text-xs mt-0.5">
                          As vendas feitas a prazo e os pagamentos baixados para este cliente
                          aparecerão discriminados aqui.
                        </p>
                      </div>
                    ) : (
                      customerTransactions.map((tx) => {
                        const isDebit = tx.type === "debito";
                        const isCredit = tx.type === "credito";
                        const isEstorno = tx.type === "estorno";

                        // Procura a venda associada na store para poder exibir os itens consumidos
                        const linkedSale = tx.saleId
                          ? pos.sales.find((s) => s.id === tx.saleId)
                          : null;
                        const isExpanded = tx.saleId ? Boolean(expandedSaleIds[tx.saleId]) : false;

                        return (
                          <div
                            key={tx.id}
                            className={cn(
                              "rounded-xl border p-3.5 transition-all",
                              isDebit && "border-amber-500/30 bg-amber-500/5",
                              isCredit &&
                                "border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20",
                              isEstorno && "border-border bg-secondary/40",
                            )}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              {/* Ícone e Detalhes da Operação */}
                              <div className="flex items-center gap-3">
                                <span
                                  className={cn(
                                    "grid size-9 place-items-center rounded-xl",
                                    isDebit && "bg-amber-500/20 text-amber-500",
                                    isCredit &&
                                      "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
                                    isEstorno && "bg-secondary text-muted-foreground",
                                  )}
                                >
                                  {isDebit && <ArrowUpRight className="size-5" />}
                                  {isCredit && <ArrowDownLeft className="size-5" />}
                                  {isEstorno && <RotateCcw className="size-4" />}
                                </span>

                                <div>
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={cn(
                                        "rounded-full px-2 py-0.5 text-[10px] font-black uppercase",
                                        isDebit && "bg-amber-500/15 text-amber-500",
                                        isCredit &&
                                          "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                                        isEstorno && "bg-muted text-muted-foreground",
                                      )}
                                    >
                                      {isDebit
                                        ? "Compra a Prazo"
                                        : isCredit
                                        ? "Pagamento / Baixa"
                                        : "Estorno de Venda"}
                                    </span>

                                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                      <Clock className="size-3" />
                                      {new Date(tx.createdAt).toLocaleDateString("pt-BR")}{" "}
                                      {new Date(tx.createdAt).toLocaleTimeString("pt-BR", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                      })}
                                    </span>
                                  </div>

                                  <p className="text-xs font-semibold text-foreground mt-0.5">
                                    {tx.notes || (isDebit ? "Consumo no PDV" : "Pagamento recebido")}
                                    {tx.paymentMethod && tx.paymentMethod !== "fiado" && (
                                      <span className="font-normal text-muted-foreground">
                                        {" "}
                                        · Forma: {tx.paymentMethod.toUpperCase()}
                                      </span>
                                    )}
                                  </p>
                                </div>
                              </div>

                              {/* Valores e Botões Auxiliares */}
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <span
                                    className={cn(
                                      "block num font-black text-base",
                                      isDebit && "text-busy",
                                      isCredit && "text-emerald-600 dark:text-emerald-400",
                                      isEstorno && "text-muted-foreground line-through",
                                    )}
                                  >
                                    {isDebit ? `+ ${brl(tx.amount)}` : `- ${brl(tx.amount)}`}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    Saldo restante: <b>{brl(tx.balanceAfter)}</b>
                                  </span>
                                </div>

                                {/* Botão de Ver Itens se houver venda associada */}
                                {linkedSale && linkedSale.items && linkedSale.items.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => toggleSaleExpand(linkedSale.id)}
                                    className="tap flex h-8 items-center gap-1 rounded-lg bg-surface border border-border px-2 text-[11px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground"
                                  >
                                    <span>Itens ({linkedSale.items.length})</span>
                                    <ChevronDown
                                      className={cn(
                                        "size-3.5 transition-transform",
                                        isExpanded && "rotate-180",
                                      )}
                                    />
                                  </button>
                                )}

                                {/* Botão de Reimprimir Recibo Térmico se for pagamento */}
                                {isCredit && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      printFiadoPaymentReceipt(selectedCustomer, tx)
                                    }
                                    className="tap grid size-8 place-items-center rounded-lg bg-surface border border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                                    title="Reimprimir comprovante de quitação"
                                  >
                                    <Printer className="size-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Dropdown com Itens Consumidos na Venda */}
                            {linkedSale && isExpanded && (
                              <div className="mt-3 rounded-lg border border-border/60 bg-surface/80 p-2.5 text-xs space-y-1.5 animate-fadeIn">
                                <div className="flex items-center justify-between pb-1 border-b border-border/40 font-bold text-[10px] text-muted-foreground uppercase">
                                  <span>Produtos Consumidos</span>
                                  <span>Subtotal</span>
                                </div>
                                {linkedSale.items.map((it, idx) => (
                                  <div
                                    key={it.id || idx}
                                    className="flex justify-between items-center text-foreground/90 font-medium"
                                  >
                                    <span>
                                      <b className="font-bold">{it.qty}x</b> {it.name}
                                    </span>
                                    <span className="num font-bold">
                                      {brl(it.unitPrice * it.qty)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Estado inicial quando nenhum cliente está selecionado */
              <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
                <div className="grid size-16 place-items-center rounded-2xl bg-secondary/60 mb-3 border border-border/60">
                  <HandCoins className="size-8 text-brand opacity-80" />
                </div>
                <h3 className="font-display text-lg font-bold text-foreground">
                  Caderneta Digital de Clientes
                </h3>
                <p className="mt-1 max-w-sm text-xs leading-relaxed">
                  Selecione um cliente na lista ao lado para consultar o extrato completo de
                  compras, histórico de pagamentos, baixar dívidas ou enviar cobrança pelo WhatsApp.
                </p>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCustomer(null);
                      setManageDialogOpen(true);
                    }}
                    className="tap flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-xs font-bold text-brand-foreground shadow-sm hover:brightness-110"
                  >
                    <Plus className="size-4" />
                    Cadastrar Primeiro Cliente
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Baixa de Pagamento / Quitação */}
      <FiadoPaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        customer={selectedCustomer}
      />

      {/* Modal de Cadastro e Edição de Cliente */}
      <CustomerManageDialog
        open={manageDialogOpen}
        onOpenChange={setManageDialogOpen}
        customer={editingCustomer}
        onSaved={(c) => setSelectedCustomerId(c.id)}
      />
    </AppShell>
  );
}
