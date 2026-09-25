import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { toast } from "sonner";
import { db, ensureDatabase, isTauri } from "@/database/db";
import {
  appSettings,
  cashMovements,
  cashShifts,
  couriers,
  customers,
  customerTransactions,
  deliveryOrders,
  diningTables,
  orderItems,
  orders,
  payments,
  products,
  sales,
  users,
  type DbCourier,
  type DbProduct,
} from "@/database/schema";
import { brl, itemsTotal, uid } from "./pos-format";
import { onSyncEvent, requestImmediateSync } from "@/services/syncService";
import {
  DEFAULT_IFOOD_CONFIG,
  generateSampleIfoodOrder,
  playNewOrderSound,
  printDeliveryTicket,
  getIfoodAccessToken,
  pollIfoodEvents,
  acknowledgeIfoodEvents,
  fetchIfoodOrderDetails,
  confirmIfoodOrder,
  readyToPickupIfoodOrder,
  dispatchIfoodOrder,
  requestIfoodCancellation,
  convertIfoodApiOrderToDelivery,
  type IfoodConfig,
} from "./ifood-service";
import {
  DEFAULT_KITCHEN_PRINTER_CONFIG,
  DEFAULT_COUNTER_PRINTER_CONFIG,
  printKitchenTicket,
  printPreContaTicket,
  printSaleReceipt,
  printShiftClosingReceipt,
  type KitchenPrinterConfig,
  type KitchenTicketData,
  type CounterPrinterConfig,
  type PreContaTicketData,
} from "./printer-service";
import {
  getDefaultCustomizationForProduct,
  type CashMovement,
  type Customer,
  type CustomerTransaction,
  type CustomerTransactionType,
  type DbShiftRecord,
  type DeliveryOrder,
  type DeliveryStage,
  type OrderItem,
  type Payment,
  type PaymentMethod,
  type Product,
  type ProductCustomization,
  type Sale,
  type ShiftSummaryData,
  type TableT,
} from "./pos-types";

type OpenModal = null | { kind: "checkout"; tableId: string };

type PosState = {
  ready: boolean;
  online: boolean;
  theme: "dark" | "light";
  user: string | null;
  shiftOpen: boolean;
  openingFloat: number;
  currentShiftId: string | null;
  tables: TableT[];
  products: Product[];
  customers: Customer[];
  customerTransactions: CustomerTransaction[];
  couriers: DbCourier[];
  delivery: DeliveryOrder[];
  deliveryHistory: DeliveryOrder[];
  sales: Sale[];
  movements: CashMovement[];
  ifoodPaused: boolean;
  ifoodLastPoll?: number | null;
  ifoodPollingStatus?: "idle" | "polling" | "error" | "connected";
  ifoodLastPollMessage?: string | null;
  now: number;
  alerts: string[];
  kitchenPrinterConfig: KitchenPrinterConfig;
  counterPrinterConfig: CounterPrinterConfig;
  ifoodConfig: IfoodConfig;
  closedShifts: DbShiftRecord[];
};

type PosApi = PosState & {
  cashInDrawer: number;
  getShiftSummary: (shiftId?: string) => ShiftSummaryData;
  loadClosedShifts: () => Promise<DbShiftRecord[]>;
  login: (pin: string) => Promise<boolean>;
  logout: () => void;
  openShift: (amount: number) => Promise<void>;
  toggleTheme: () => void;
  toggleOnline: () => void;
  dismissAlert: (text: string) => void;
  reloadAll: () => Promise<void>;
  addItemsToTable: (tableId: string, items: OrderItem[]) => Promise<void>;
  removeItem: (tableId: string, itemId: string) => Promise<void>;
  transferItem: (fromId: string, toId: string, itemId: string) => Promise<void>;
  mergeTables: (hostId: string, guestId: string) => Promise<void>;
  unmergeTable: (
    tableId: string,
    mode?: "restore_origins" | "keep_here" | "manual",
    customDistribution?: Record<number, string[]>,
  ) => Promise<void>;
  applyDiscount: (tableId: string, type: "percent" | "value", amount: number) => Promise<void>;
  setTableStatus: (tableId: string, status: TableT["status"]) => Promise<void>;
  sendTableToKitchen: (tableId: string) => Promise<KitchenTicketData | null>;
  reprintKitchenTicket: (tableId: string, round?: number) => Promise<KitchenTicketData | null>;
  printPreConta: (
    tableId: string,
  ) => Promise<{ success: boolean; message: string; ticketData?: PreContaTicketData }>;
  finishTable: (
    tableId: string,
    data: {
      payments: Payment[];
      serviceFee: number;
      tip: number;
      discount: number;
      cpf: string | null;
      items: OrderItem[];
      creditCustomerId?: string;
      courtesyReason?: string;
    },
  ) => Promise<void>;
  registerCounterSale: (data: {
    customer: string;
    items: OrderItem[];
    payments: Payment[];
    cpf: string | null;
    serviceFee: number;
    tip: number;
    creditCustomerId?: string;
    courtesyReason?: string;
  }) => Promise<void>;
  moveDelivery: (id: string, stage: DeliveryStage) => Promise<void>;
  acceptDelivery: (id: string) => Promise<void>;
  cancelDeliveryOrder: (id: string, reasonCode?: string, reasonText?: string) => Promise<boolean>;
  assignCourier: (id: string, courier: string) => Promise<void>;
  finishDeliveryOrder: (id: string) => Promise<void>;
  addDeliveryOrder: (
    data: Omit<DeliveryOrder, "id" | "createdAt" | "stage" | "accepted" | "courier"> & {
      courier?: string | null;
    },
  ) => Promise<DeliveryOrder>;
  simulateIfoodIncomingOrder: () => Promise<DeliveryOrder>;
  pollIfoodNow: () => Promise<{ success: boolean; eventsCount: number; message: string }>;
  toggleIfood: () => Promise<void>;
  updateIfoodConfig: (config: IfoodConfig) => Promise<void>;
  addMovement: (type: "suprimento" | "sangria", amount: number, reason: string) => Promise<void>;
  closeRegister: (counted: number) => Promise<void>;
  toggleSoldOut: (productId: string) => Promise<void>;
  updateProductCustomization: (productId: string, config: ProductCustomization) => Promise<void>;
  toggleAddonAvailability: (addonName: string) => Promise<void>;
  updateKitchenPrinterConfig: (config: KitchenPrinterConfig) => Promise<void>;
  updateCounterPrinterConfig: (config: CounterPrinterConfig) => Promise<void>;
  cancelSale: (saleId: string) => Promise<void>;
  addCustomer: (data: Omit<Customer, "id">) => Promise<Customer>;
  updateCustomer: (customerId: string, data: Partial<Customer>) => Promise<Customer>;
  deleteCustomer: (customerId: string) => Promise<boolean>;
  receiveCustomerPayment: (data: {
    customerId: string;
    amount: number;
    paymentMethod: string;
    notes?: string | undefined;
  }) => Promise<CustomerTransaction>;
  factoryReset: () => Promise<void>;
};

const PosContext = createContext<PosApi | null>(null);

export function PosProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PosState>({
    ready: false,
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    theme: "dark",
    user: null,
    shiftOpen: false,
    openingFloat: 0,
    currentShiftId: null,
    tables: [],
    products: [],
    customers: [],
    customerTransactions: [],
    couriers: [],
    delivery: [],
    deliveryHistory: [],
    sales: [],
    movements: [],
    ifoodPaused: false,
    ifoodLastPoll: null,
    ifoodPollingStatus: "idle",
    ifoodLastPollMessage: null,
    now: Date.now(),
    alerts: [],
    kitchenPrinterConfig: DEFAULT_KITCHEN_PRINTER_CONFIG,
    counterPrinterConfig: DEFAULT_COUNTER_PRINTER_CONFIG,
    ifoodConfig: DEFAULT_IFOOD_CONFIG,
    closedShifts: [],
  });

  const loadDatabaseData = useCallback(async () => {
    try {
      if (!isTauri()) {
        setState((s) => ({ ...s, ready: true }));
        return;
      }

      await ensureDatabase();

      // 1. Turno de caixa aberto
      const openShifts = await db
        .select()
        .from(cashShifts)
        .where(and(eq(cashShifts.status, "open"), isNull(cashShifts.deleted_at)))
        .limit(1);

      const activeShift = openShifts[0] ?? null;

      // 2. Mesas do salão e Comandas ativas
      const dbTables = await db
        .select()
        .from(diningTables)
        .where(isNull(diningTables.deleted_at))
        .orderBy(diningTables.number);

      // Consulta pedidos abertos vinculados a mesas
      const openTableOrders = await db
        .select()
        .from(orders)
        .where(and(eq(orders.type, "table"), eq(orders.status, "open"), isNull(orders.deleted_at)));

      const openOrderIds = openTableOrders.map((o) => o.id);
      const dbOrderItems =
        openOrderIds.length > 0
          ? await db
              .select()
              .from(orderItems)
              .where(and(inArray(orderItems.order_id, openOrderIds), isNull(orderItems.deleted_at)))
          : [];

      const tableItemsMap = new Map<string, OrderItem[]>();
      for (const order of openTableOrders) {
        if (!order.table_id) continue;
        const tableForOrder = dbTables.find((t) => t.id === order.table_id);
        const defaultTableNum = tableForOrder?.number;
        const itemsForOrder = dbOrderItems.filter((i) => i.order_id === order.id);
        const mappedItems: OrderItem[] = itemsForOrder.map((i) => {
          let details: string[] = [];
          if (i.details) {
            try {
              const parsed = JSON.parse(i.details);
              details = Array.isArray(parsed) ? parsed : [];
            } catch {
              details = [];
            }
          }
          let sentToKitchen = false;
          let kitchenRound = 1;
          let sentAt: number | undefined;
          let originTableNumber: number | undefined;
          if (i.notes) {
            try {
              const meta = JSON.parse(i.notes);
              if (meta && typeof meta === "object") {
                sentToKitchen = Boolean(meta.sentToKitchen);
                kitchenRound = typeof meta.kitchenRound === "number" ? meta.kitchenRound : 1;
                sentAt = meta.sentAt ? new Date(meta.sentAt).getTime() : undefined;
                originTableNumber =
                  typeof meta.originTableNumber === "number" ? meta.originTableNumber : undefined;
              }
            } catch {
              sentToKitchen = i.notes.includes("sent_to_kitchen");
            }
          }
          if (originTableNumber === undefined && defaultTableNum !== undefined) {
            originTableNumber = defaultTableNum;
          }
          return {
            id: i.id,
            name: i.name,
            qty: i.qty,
            unitPrice: i.unit_price,
            details,
            sentToKitchen,
            kitchenRound,
            sentAt,
            originTableNumber,
          };
        });
        tableItemsMap.set(order.table_id, mappedItems);
      }

      const tableMergedMap = new Map<string, number[]>();
      for (const t of dbTables) {
        let mergedWith: number[] = [];
        if (t.merged_with) {
          try {
            const parsed = JSON.parse(t.merged_with);
            mergedWith = Array.isArray(parsed) ? parsed : [];
          } catch {
            mergedWith = [];
          }
        }
        tableMergedMap.set(t.id, mergedWith);
      }

      const phantomTableIdsToReset: string[] = [];

      const mappedTables: TableT[] = dbTables.map((t) => {
        const mergedWith = tableMergedMap.get(t.id) ?? [];
        const isMerged = mergedWith.length > 0;

        // Se a mesa estiver em grupo conjunto, recolhe todos os itens de todas as mesas do grupo
        let items: OrderItem[] = [];
        if (isMerged) {
          const groupTableIds = dbTables
            .filter((other) => other.number === t.number || mergedWith.includes(other.number))
            .map((other) => other.id);
          items = groupTableIds.flatMap((id) => tableItemsMap.get(id) ?? []);
        } else {
          items = tableItemsMap.get(t.id) ?? [];
        }

        const hasActiveItems = items.length > 0;

        let status: TableT["status"] = (t.status as TableT["status"]) || "livre";
        let waiter = t.waiter ?? "Equipe";
        let openedAt = t.opened_at ? new Date(t.opened_at).getTime() : null;

        const hasOpenOrder = openTableOrders.some((o) => o.table_id === t.id);

        // Limpeza de mesas fantasmas: apenas se não tem itens E não está junta E não tem comanda aberta
        if (!hasActiveItems && !isMerged && !hasOpenOrder) {
          status = "livre";
          waiter = "Equipe";
          openedAt = null;
          if (t.status !== "livre" || t.waiter !== "Equipe" || t.opened_at) {
            phantomTableIdsToReset.push(t.id);
          }
        } else if (isMerged && hasActiveItems) {
          status = t.status === "conta" ? "conta" : "ocupada";
          if (!openedAt) {
            const groupOpenedAt = dbTables
              .filter((other) => mergedWith.includes(other.number))
              .find((other) => other.opened_at)?.opened_at;
            openedAt = groupOpenedAt ? new Date(groupOpenedAt).getTime() : Date.now();
          }
        }

        return {
          id: t.id,
          number: t.number,
          seats: t.seats,
          waiter,
          status,
          openedAt,
          items,
          discount:
            t.discount_type && t.discount_amount
              ? { type: t.discount_type as "percent" | "value", amount: t.discount_amount }
              : null,
          mergedWith,
        };
      });

      // Atualiza no SQLite local para corrigir mesas fantasmas
      if (phantomTableIdsToReset.length > 0) {
        for (const resetId of phantomTableIdsToReset) {
          await db
            .update(diningTables)
            .set({
              status: "livre",
              opened_at: null,
              waiter: "Equipe",
              discount_type: null,
              discount_amount: null,
              updated_at: new Date().toISOString(),
              is_synced: false,
            })
            .where(eq(diningTables.id, resetId));
        }
      }

      // 3. Produtos e Customizações
      const dbProducts = await db.select().from(products).where(isNull(products.deleted_at));

      let customMap: Record<string, ProductCustomization> = {};
      let loadedPrinterConfig = DEFAULT_KITCHEN_PRINTER_CONFIG;
      try {
        const settingsRows = await db
          .select()
          .from(appSettings)
          .where(and(eq(appSettings.key, "catalog_customizations"), isNull(appSettings.deleted_at)))
          .limit(1);
        if (settingsRows[0]?.value) {
          customMap = JSON.parse(settingsRows[0].value);
        }
      } catch (err) {
        console.warn("[loadDatabaseData]: Erro ao ler catalog_customizations:", err);
      }

      try {
        const printerSettingsRows = await db
          .select()
          .from(appSettings)
          .where(and(eq(appSettings.key, "kitchen_printer_config"), isNull(appSettings.deleted_at)))
          .limit(1);
        if (printerSettingsRows[0]?.value) {
          const parsed = JSON.parse(printerSettingsRows[0].value);
          loadedPrinterConfig = {
            ...DEFAULT_KITCHEN_PRINTER_CONFIG,
            ...parsed,
          };
        }
      } catch (err) {
        console.warn("[loadDatabaseData]: Erro ao ler kitchen_printer_config:", err);
      }

      let loadedCounterPrinterConfig = DEFAULT_COUNTER_PRINTER_CONFIG;
      try {
        const counterSettingsRows = await db
          .select()
          .from(appSettings)
          .where(and(eq(appSettings.key, "counter_printer_config"), isNull(appSettings.deleted_at)))
          .limit(1);
        if (counterSettingsRows[0]?.value) {
          const parsed = JSON.parse(counterSettingsRows[0].value);
          loadedCounterPrinterConfig = {
            ...DEFAULT_COUNTER_PRINTER_CONFIG,
            ...parsed,
          };
        }
      } catch (err) {
        console.warn("[loadDatabaseData]: Erro ao ler counter_printer_config:", err);
      }

      const mappedProducts: Product[] = dbProducts.map((p: DbProduct) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        category: p.category_name,
        emoji: p.emoji,
        soldOut: Boolean(p.sold_out),
        customization:
          customMap[p.id] ?? getDefaultCustomizationForProduct(p.name, p.category_name),
      }));

      // 4. Clientes
      const dbCustomers = await db.select().from(customers).where(isNull(customers.deleted_at));
      const mappedCustomers: Customer[] = dbCustomers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        address: c.address ?? "",
        email: c.email ?? "",
        balanceDue: c.balance_due ?? 0,
        cpf: c.cpf ?? undefined,
        creditLimit: c.credit_limit ?? 0,
        notes: c.notes ?? undefined,
        isBlocked: Boolean(c.is_blocked),
        createdAt: c.created_at,
      }));

      // 4.1 Transações de Fiado
      let mappedCustomerTransactions: CustomerTransaction[] = [];
      try {
        const dbTx = await db
          .select()
          .from(customerTransactions)
          .where(isNull(customerTransactions.deleted_at))
          .orderBy(desc(customerTransactions.created_at));

        mappedCustomerTransactions = dbTx.map((t) => ({
          id: t.id,
          customerId: t.customer_id,
          type: t.type as CustomerTransactionType,
          amount: t.amount,
          balanceAfter: t.balance_after,
          paymentMethod: t.payment_method ?? undefined,
          saleId: t.sale_id ?? undefined,
          orderId: t.order_id ?? undefined,
          shiftId: t.shift_id ?? undefined,
          notes: t.notes ?? undefined,
          createdAt: t.created_at,
        }));
      } catch (txErr) {
        console.warn("[PosStore]: Falha ao carregar transações de clientes:", txErr);
      }

      // 5. Entregadores / Motoboys
      const dbCouriers = await db
        .select()
        .from(couriers)
        .where(isNull(couriers.deleted_at))
        .orderBy(couriers.name);

      // 6. Movimentações financeiras do turno ativo
      let mappedMovements: CashMovement[] = [];
      if (activeShift) {
        const dbMovements = await db
          .select()
          .from(cashMovements)
          .where(and(eq(cashMovements.shift_id, activeShift.id), isNull(cashMovements.deleted_at)))
          .orderBy(cashMovements.at);

        mappedMovements = dbMovements.map((m) => ({
          id: m.id,
          type: m.type as CashMovement["type"],
          amount: m.amount,
          reason: m.reason,
          at: new Date(m.at).getTime(),
        }));
      }

      // 7. Turnos cadastrados e histórico de turnos fechados
      const allShifts = await db
        .select()
        .from(cashShifts)
        .where(isNull(cashShifts.deleted_at))
        .orderBy(desc(cashShifts.opened_at));

      const shiftsMap = new Map(allShifts.map((s) => [s.id, s]));
      const closedShifts: DbShiftRecord[] = allShifts
        .filter((s) => s.status === "closed")
        .map((s) => ({
          id: s.id,
          operatorName: s.operator_name,
          name: s.name,
          status: "closed",
          openedAt: s.opened_at,
          closedAt: s.closed_at ?? null,
          openingFloat: s.opening_float,
          closingCounted: s.closing_counted ?? null,
          closingExpected: s.closing_expected ?? null,
          closingDifference: s.closing_difference ?? null,
          closingNotes: s.closing_notes ?? undefined,
        }));

      // 8. Pagamentos das vendas
      const allPayments = await db.select().from(payments).where(isNull(payments.deleted_at));

      const paymentsBySaleId = new Map<string, Payment[]>();
      for (const p of allPayments) {
        const list = paymentsBySaleId.get(p.sale_id) || [];
        list.push({
          method: p.method as PaymentMethod,
          amount: p.amount,
          customerId: p.customer_id ?? undefined,
        });
        paymentsBySaleId.set(p.sale_id, list);
      }

      // 9. Pedidos e Itens de pedidos
      const dbOrders = await db.select().from(orders).where(isNull(orders.deleted_at));
      const ordersMap = new Map(dbOrders.map((o) => [o.id, o]));

      const allOrderItems = await db.select().from(orderItems).where(isNull(orderItems.deleted_at));
      const itemsByOrderId = new Map<string, OrderItem[]>();
      for (const it of allOrderItems) {
        let details: string[] = [];
        if (it.details) {
          try {
            details = JSON.parse(it.details);
          } catch {
            details = [];
          }
        }
        const itemObj: OrderItem = {
          id: it.id,
          name: it.name,
          unitPrice: it.unit_price,
          price: it.unit_price,
          qty: it.qty,
          details,
        };
        const arr = itemsByOrderId.get(it.order_id) || [];
        arr.push(itemObj);
        itemsByOrderId.set(it.order_id, arr);
      }

      // 10. Cupons de venda recentes
      const dbSales = await db
        .select()
        .from(sales)
        .where(isNull(sales.deleted_at))
        .orderBy(desc(sales.created_at));

      const mappedSales: Sale[] = dbSales.map((s) => {
        const saleItems = s.order_id ? itemsByOrderId.get(s.order_id) || [] : [];
        const salePayments = paymentsBySaleId.get(s.id) || [];
        const shiftRec = s.shift_id ? shiftsMap.get(s.shift_id) : null;
        const shiftName = shiftRec?.name || "Turno 1";

        return {
          id: s.id,
          code: s.code,
          createdAt: new Date(s.created_at).getTime(),
          origin: s.origin,
          items: saleItems,
          serviceFee: s.service_fee,
          tip: s.tip,
          discount: s.discount,
          total: s.total,
          payments: salePayments,
          cpf: s.cpf ?? null,
          creditCustomerId: s.credit_customer_id ?? undefined,
          courtesyReason: s.courtesy_reason ?? undefined,
          shift: shiftName,
          shiftId: s.shift_id ?? undefined,
          cancelled: Boolean(s.cancelled),
        };
      });

      let loadedIfoodConfig = DEFAULT_IFOOD_CONFIG;
      try {
        const ifoodRows = await db
          .select()
          .from(appSettings)
          .where(and(eq(appSettings.key, "ifood_config"), isNull(appSettings.deleted_at)))
          .limit(1);
        if (ifoodRows[0]?.value) {
          const parsed = JSON.parse(ifoodRows[0].value);
          loadedIfoodConfig = {
            ...DEFAULT_IFOOD_CONFIG,
            ...parsed,
          };
        }
      } catch (err) {
        console.warn("[loadDatabaseData]: Erro ao ler ifood_config:", err);
      }

      let loadedIfoodPaused = false;
      try {
        const pausedRows = await db
          .select()
          .from(appSettings)
          .where(and(eq(appSettings.key, "ifood_paused"), isNull(appSettings.deleted_at)))
          .limit(1);
        if (pausedRows[0]?.value) {
          loadedIfoodPaused = JSON.parse(pausedRows[0].value);
        }
      } catch (err) {
        console.warn("[loadDatabaseData]: Erro ao ler ifood_paused:", err);
      }

      // 11. Pedidos de Delivery
      const dbDelivery = await db
        .select()
        .from(deliveryOrders)
        .where(isNull(deliveryOrders.deleted_at));

      let mappedDelivery: DeliveryOrder[] = [];
      const mappedDeliveryHistory: DeliveryOrder[] = [];

      for (const d of dbDelivery) {
        const ord = ordersMap.get(d.order_id);
        const itms = itemsByOrderId.get(d.order_id) || [];
        const isCancelled =
          ord?.status === "cancelled" ||
          (Boolean(ord?.notes) && (ord?.notes?.toLowerCase().includes("cancelad") ?? false));
        const orderObj: DeliveryOrder = {
          id: d.id,
          code: ord?.code || `#${d.id.slice(0, 4)}`,
          source: d.source as DeliveryOrder["source"],
          customer: ord?.customer_name || "Cliente Delivery",
          address: d.delivery_address || undefined,
          bairro: d.bairro,
          total:
            ord?.total || itms.reduce((s, it) => s + (it.unitPrice ?? (it as any).price ?? 0) * it.qty, 0),
          createdAt: new Date(d.created_at).getTime(),
          stage: d.stage as DeliveryStage,
          courier: d.courier ?? null,
          accepted: Boolean(d.accepted),
          items: itms,
          notes: ord?.notes || undefined,
          cancelled: Boolean(isCancelled),
          cancelReason: isCancelled ? ord?.notes || "Cancelado" : undefined,
        };

        if (d.stage === "concluido" || isCancelled) {
          mappedDeliveryHistory.push(orderObj);
        } else {
          mappedDelivery.push(orderObj);
        }
      }

      mappedDeliveryHistory.sort((a, b) => b.createdAt - a.createdAt);

      if (mappedDelivery.length === 0) {
        const nowMs = Date.now();
        const sample1: DeliveryOrder = {
          id: crypto.randomUUID(),
          code: "#8491",
          source: "ifood",
          customer: "Camila Souza",
          phone: "(11) 98888-1204",
          address: "Rua das Flores, 120 - Ap 42",
          bairro: "Centro",
          total: 58.9,
          createdAt: nowMs - 6 * 60 * 1000,
          stage: "novos",
          courier: null,
          accepted: false,
          items: [
            {
              id: crypto.randomUUID(),
              name: "Smash Burger Duplo",
              unitPrice: 34.9,
              price: 34.9,
              qty: 1,
              details: ["Sem cebola", "Ponto: Ao ponto"],
            },
            {
              id: crypto.randomUUID(),
              name: "Batata Frita Especial",
              unitPrice: 16.0,
              price: 16.0,
              qty: 1,
              details: ["Com cheddar"],
            },
            {
              id: crypto.randomUUID(),
              name: "Coca-Cola Lata",
              unitPrice: 8.0,
              price: 8.0,
              qty: 1,
            },
          ],
          paymentMethod: "iFood (Pago Online)",
        };

        const sample2: DeliveryOrder = {
          id: crypto.randomUUID(),
          code: "#8489",
          source: "whatsapp",
          customer: "Rodrigo Lima",
          phone: "(11) 97721-4430",
          address: "Av. Paulista, 1500 - Bela Vista",
          bairro: "Bela Vista",
          total: 64.0,
          createdAt: nowMs - 18 * 60 * 1000,
          stage: "preparo",
          courier: null,
          accepted: true,
          items: [
            {
              id: crypto.randomUUID(),
              name: "Pizza Calabresa Especial",
              unitPrice: 54.0,
              price: 54.0,
              qty: 1,
              details: ["Borda recheada de Catupiry"],
            },
            {
              id: crypto.randomUUID(),
              name: "Guaraná Antarctica 2L",
              unitPrice: 10.0,
              price: 10.0,
              qty: 1,
            },
          ],
          paymentMethod: "PIX",
        };

        mappedDelivery = [sample1, sample2];
      }

      setState((curr) => ({
        ...curr,
        ready: true,
        user: activeShift ? activeShift.operator_name : null,
        shiftOpen: Boolean(activeShift),
        openingFloat: activeShift ? activeShift.opening_float : 0,
        currentShiftId: activeShift ? activeShift.id : null,
        tables: mappedTables,
        products: mappedProducts,
        customers: mappedCustomers,
        customerTransactions: mappedCustomerTransactions,
        couriers: dbCouriers,
        movements: mappedMovements,
        sales: mappedSales,
        delivery: mappedDelivery,
        deliveryHistory: mappedDeliveryHistory,
        ifoodPaused: loadedIfoodPaused,
        ifoodConfig: loadedIfoodConfig,
        kitchenPrinterConfig: loadedPrinterConfig,
        counterPrinterConfig: loadedCounterPrinterConfig,
        closedShifts,
      }));
    } catch (err) {
      console.error("[PosStore loadDatabaseData Error]:", err);
      setState((s) => ({ ...s, ready: true }));
    }
  }, []);

  useEffect(() => {
    loadDatabaseData();
  }, [loadDatabaseData]);

  // Sincronização viva com a nuvem: recarrega o estado local sempre que a maquininha ou nuvem enviar novos dados
  useEffect(() => {
    const unsubscribe = onSyncEvent((evt) => {
      if (evt.pulled > 0) {
        loadDatabaseData();
      }
    });
    return unsubscribe;
  }, [loadDatabaseData]);

  useEffect(() => {
    // Atualização de minuto para tempo decorrido, reduzindo re-renders em 3x
    const t = setInterval(() => setState((s) => ({ ...s, now: Date.now() })), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", state.theme === "dark");
  }, [state.theme]);

  const persistDeliveryOrderToDb = useCallback(
    async (newOrder: DeliveryOrder) => {
      if (!isTauri()) return;
      try {
        const nowIso = new Date().toISOString();
        const internalOrderId = crypto.randomUUID();
        await db.insert(orders).values({
          id: internalOrderId,
          code: newOrder.code,
          type: "delivery",
          table_id: null,
          customer_id: null,
          customer_name: newOrder.customer,
          operator_id: null,
          shift_id: state.currentShiftId,
          status: "open",
          subtotal: newOrder.total,
          service_fee: 0,
          tip: 0,
          discount: 0,
          total: newOrder.total,
          notes: newOrder.notes ?? null,
          is_synced: false,
          created_at: nowIso,
          updated_at: nowIso,
          deleted_at: null,
        });

        await db.insert(deliveryOrders).values({
          id: newOrder.id,
          order_id: internalOrderId,
          source: newOrder.source,
          stage: newOrder.stage,
          bairro: newOrder.bairro,
          delivery_address: newOrder.address ?? null,
          courier: newOrder.courier ?? null,
          accepted: newOrder.accepted,
          estimated_delivery_time: null,
          is_synced: false,
          created_at: nowIso,
          updated_at: nowIso,
          deleted_at: null,
        });

        for (const it of newOrder.items) {
          const itemPrice = it.unitPrice ?? (it as any).price ?? 0;
          const matchedProduct = state.products.find(
            (p) => p.name.toLowerCase() === it.name.toLowerCase() || p.id === it.id,
          );
          await db.insert(orderItems).values({
            id: it.id || crypto.randomUUID(),
            order_id: internalOrderId,
            product_id: matchedProduct?.id ?? null,
            name: it.name,
            qty: it.qty,
            unit_price: itemPrice,
            total_price: itemPrice * it.qty,
            details: it.details ? JSON.stringify(it.details) : null,
            notes: null,
            is_synced: false,
            created_at: nowIso,
            updated_at: nowIso,
            deleted_at: null,
          });
        }
      } catch (err) {
        console.error("[persistDeliveryOrderToDb Error]:", err);
      }
    },
    [state.currentShiftId, state.products],
  );

  const isIfoodPollingRef = useRef(false);
  useEffect(() => {
    const runIfoodPoll = async () => {
      const config = state.ifoodConfig;
      if (
        !config?.enabled ||
        state.ifoodPaused ||
        !config.clientId?.trim() ||
        !config.clientSecret?.trim() ||
        !config.merchantId?.trim() ||
        isIfoodPollingRef.current
      ) {
        return;
      }

      isIfoodPollingRef.current = true;
      try {
        const { accessToken } = await getIfoodAccessToken(config);
        const events = await pollIfoodEvents(config, accessToken);
        const now = Date.now();

        if (events.length > 0) {
          const acknowledgedIds: string[] = [];

          for (const evt of events) {
            if (evt.code === "PLC" || evt.fullCode === "PLACED") {
              try {
                const alreadyExists = state.delivery.some(
                  (d) => d.id === evt.orderId || d.code.includes(evt.orderId.slice(0, 4)),
                );

                if (!alreadyExists) {
                  const rawOrder = await fetchIfoodOrderDetails(accessToken, evt.orderId);
                  const deliveryOrder = convertIfoodApiOrderToDelivery(rawOrder, state.products);

                  const isAutoAccept = config.autoAccept;
                  if (isAutoAccept) {
                    try {
                      await confirmIfoodOrder(accessToken, evt.orderId);
                      deliveryOrder.stage = "preparo";
                      deliveryOrder.accepted = true;
                    } catch (confErr) {
                      console.warn("[iFood Auto-Accept]:", confErr);
                    }
                  }

                  setState((s) => ({
                    ...s,
                    delivery: [deliveryOrder, ...s.delivery],
                    ifoodLastPoll: now,
                    ifoodPollingStatus: "connected",
                  }));

                  await persistDeliveryOrderToDb(deliveryOrder);

                  if (config.soundAlert) {
                    playNewOrderSound();
                  }

                  if (isAutoAccept && config.autoPrintKitchen) {
                    try {
                      await printDeliveryTicket(deliveryOrder, state.kitchenPrinterConfig);
                    } catch (printErr) {
                      console.warn("[iFood Auto-Print]:", printErr);
                    }
                  }

                  toast.info(`Novo Pedido iFood recebido! ${deliveryOrder.code}`, {
                    description: `${deliveryOrder.customer} · ${brl(deliveryOrder.total)} (${deliveryOrder.items.length} itens)`,
                  });
                }
                acknowledgedIds.push(evt.id);
              } catch (err) {
                console.error("[iFood Background Polling] Erro pedido:", evt.orderId, err);
                acknowledgedIds.push(evt.id);
              }
            } else if (evt.code === "CAN" || evt.fullCode === "CANCELLED") {
              const cancelNotes = "Cancelado pelo cliente/iFood";
              const nowIso = new Date().toISOString();

              setState((s) => {
                const existing = s.delivery.find((d) => d.id === evt.orderId);
                const updatedObj: DeliveryOrder = existing
                  ? {
                      ...existing,
                      stage: "concluido",
                      cancelled: true,
                      cancelReason: cancelNotes,
                      notes: existing.notes ? `${existing.notes} | ${cancelNotes}` : cancelNotes,
                    }
                  : {
                      id: evt.orderId,
                      code: `#${evt.orderId.slice(0, 4)}`,
                      source: "ifood",
                      customer: "Cliente iFood",
                      bairro: "Delivery",
                      total: 0,
                      createdAt: Date.now(),
                      stage: "concluido",
                      courier: null,
                      accepted: false,
                      items: [],
                      cancelled: true,
                      cancelReason: cancelNotes,
                    };

                return {
                  ...s,
                  delivery: s.delivery.filter((d) => d.id !== evt.orderId),
                  deliveryHistory: [updatedObj, ...s.deliveryHistory.filter((d) => d.id !== evt.orderId)],
                };
              });

              if (isTauri()) {
                try {
                  await db
                    .update(deliveryOrders)
                    .set({ stage: "concluido", updated_at: nowIso, is_synced: false })
                    .where(eq(deliveryOrders.id, evt.orderId));

                  const delivRows = await db
                    .select({ order_id: deliveryOrders.order_id })
                    .from(deliveryOrders)
                    .where(eq(deliveryOrders.id, evt.orderId))
                    .limit(1);

                  if (delivRows[0]?.order_id) {
                    await db
                      .update(orders)
                      .set({ status: "cancelled", notes: cancelNotes, updated_at: nowIso, is_synced: false })
                      .where(eq(orders.id, delivRows[0].order_id));
                  }
                } catch (dbErr) {
                  console.error("[iFood CAN persist error]:", dbErr);
                }
              }

              acknowledgedIds.push(evt.id);
              toast.warning("Pedido iFood cancelado pelo cliente/loja", {
                description: `ID: #${evt.orderId.slice(0, 4)}`,
              });
            } else {
              acknowledgedIds.push(evt.id);
            }
          }

          if (acknowledgedIds.length > 0) {
            await acknowledgeIfoodEvents(accessToken, acknowledgedIds);
          }
        }

        setState((s) => {
          if (
            s.ifoodPollingStatus === "connected" &&
            s.ifoodLastPollMessage === "Conectado e monitorando" &&
            events.length === 0
          ) {
            return s;
          }
          return {
            ...s,
            ifoodLastPoll: now,
            ifoodPollingStatus: "connected",
            ifoodLastPollMessage: "Conectado e monitorando",
          };
        });
      } catch (err: unknown) {
        console.debug("[iFood Background Poller]:", err);
        setState((s) => ({
          ...s,
          ifoodPollingStatus: "error",
          ifoodLastPollMessage: err instanceof Error ? err.message : String(err),
        }));
      } finally {
        isIfoodPollingRef.current = false;
      }
    };

    runIfoodPoll();
    const pollInterval = setInterval(runIfoodPoll, 20_000);
    return () => clearInterval(pollInterval);
  }, [
    state.ifoodConfig,
    state.ifoodPaused,
    state.delivery,
    state.products,
    state.currentShiftId,
    state.kitchenPrinterConfig,
    persistDeliveryOrderToDb,
  ]);

  const api = useMemo<PosApi>(() => {
    const patchTable = (tableId: string, fn: (t: TableT) => TableT) =>
      setState((s) => ({ ...s, tables: s.tables.map((t) => (t.id === tableId ? fn(t) : t)) }));

    const getShiftSummary = (targetShiftId?: string): ShiftSummaryData => {
      const shiftId = targetShiftId ?? state.currentShiftId;
      const shiftSales = state.sales.filter(
        (s) => !s.cancelled && (shiftId ? s.shiftId === shiftId : true),
      );
      const shiftMovements = state.movements;

      let cashSales = 0;
      const salesByMethod: Partial<Record<PaymentMethod, number>> = {
        dinheiro: 0,
        pix: 0,
        credito: 0,
        debito: 0,
        fiado: 0,
        cortesia: 0,
      };

      for (const sale of shiftSales) {
        for (const p of sale.payments) {
          salesByMethod[p.method] = (salesByMethod[p.method] ?? 0) + p.amount;
          if (p.method === "dinheiro") {
            cashSales += p.amount;
          }
        }
      }

      const supplies = shiftMovements
        .filter((m) => m.type === "suprimento")
        .reduce((sum, m) => sum + m.amount, 0);

      const bleeds = shiftMovements
        .filter((m) => m.type === "sangria")
        .reduce((sum, m) => sum + m.amount, 0);

      const cancelledSales = state.sales.filter(
        (s) => s.cancelled && (shiftId ? s.shiftId === shiftId : true),
      );
      const cashRefunds = cancelledSales.reduce(
        (sum, s) =>
          sum + s.payments.filter((p) => p.method === "dinheiro").reduce((a, p) => a + p.amount, 0),
        0,
      );

      const openingFloat = state.openingFloat;
      const expectedCash = openingFloat + supplies - bleeds + cashSales - cashRefunds;
      const totalSalesAmount = shiftSales.reduce((sum, s) => sum + s.total, 0);

      return {
        shiftName: "Turno 1",
        operatorName: state.user ?? "Operador",
        openedAt: state.now,
        openingFloat,
        cashSales,
        supplies,
        bleeds,
        cashRefunds,
        expectedCash,
        salesByMethod,
        totalSalesAmount,
        totalSalesCount: shiftSales.length,
      };
    };

    const currentShiftSummary = getShiftSummary();
    const cashInDrawer = currentShiftSummary.expectedCash;

    const loadClosedShifts = async (): Promise<DbShiftRecord[]> => {
      if (!isTauri()) return state.closedShifts;
      try {
        const closed = await db
          .select()
          .from(cashShifts)
          .where(and(eq(cashShifts.status, "closed"), isNull(cashShifts.deleted_at)))
          .orderBy(desc(cashShifts.opened_at));

        const records: DbShiftRecord[] = closed.map((s) => ({
          id: s.id,
          operatorName: s.operator_name,
          name: s.name,
          status: "closed",
          openedAt: s.opened_at,
          closedAt: s.closed_at ?? null,
          openingFloat: s.opening_float,
          closingCounted: s.closing_counted ?? null,
          closingExpected: s.closing_expected ?? null,
          closingDifference: s.closing_difference ?? null,
          closingNotes: s.closing_notes ?? undefined,
        }));
        setState((s) => ({ ...s, closedShifts: records }));
        return records;
      } catch (err) {
        console.error("[loadClosedShifts Error]:", err);
        return [];
      }
    };

    return {
      ...state,
      cashInDrawer,
      getShiftSummary,
      loadClosedShifts,
      reloadAll: loadDatabaseData,
      login: async (pin: string) => {
        if (pin.length < 4) return false;
        try {
          if (isTauri()) {
            await ensureDatabase();
            const matched = await db
              .select()
              .from(users)
              .where(and(eq(users.pin, pin), eq(users.active, true), isNull(users.deleted_at)))
              .limit(1);

            if (matched.length > 0) {
              const u = matched[0];
              if (u) {
                setState((s) => ({ ...s, user: u.name }));
                return true;
              }
            }
          }
          // Fallback para PIN padrão '1234'
          if (pin === "1234") {
            setState((s) => ({ ...s, user: "Marina R." }));
            return true;
          }
          return false;
        } catch {
          if (pin === "1234") {
            setState((s) => ({ ...s, user: "Marina R." }));
            return true;
          }
          return false;
        }
      },
      logout: () =>
        setState((s) => ({
          ...s,
          user: null,
          shiftOpen: false,
          openingFloat: 0,
          currentShiftId: null,
          movements: [],
        })),
      openShift: async (amount: number) => {
        const now = new Date().toISOString();
        const shiftId = crypto.randomUUID();
        const movementId = crypto.randomUUID();
        const operatorName = state.user ?? "Marina R.";

        setState((s) => ({
          ...s,
          shiftOpen: true,
          openingFloat: amount,
          currentShiftId: shiftId,
          movements: [
            { id: movementId, type: "abertura", amount, reason: "Fundo de troco", at: Date.now() },
            ...s.movements,
          ],
        }));

        if (isTauri()) {
          await db.insert(cashShifts).values({
            id: shiftId,
            operator_name: operatorName,
            name: "Turno 1",
            status: "open",
            opened_at: now,
            opening_float: amount,
            is_synced: false,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          });

          await db.insert(cashMovements).values({
            id: movementId,
            shift_id: shiftId,
            type: "abertura",
            amount,
            reason: "Fundo de troco inicial",
            at: now,
            is_synced: false,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          });
        }
      },
      toggleTheme: () => setState((s) => ({ ...s, theme: s.theme === "dark" ? "light" : "dark" })),
      toggleOnline: () => setState((s) => ({ ...s, online: !s.online })),
      dismissAlert: (text) =>
        setState((s) => ({ ...s, alerts: s.alerts.filter((a) => a !== text) })),
      addItemsToTable: async (tableId, items) => {
        const now = new Date().toISOString();
        const operatorName = state.user ?? "Marina R.";

        const targetTable = state.tables.find((t) => t.id === tableId);
        const originNum = targetTable?.number ?? 1;

        const itemsWithMeta: OrderItem[] = items.map((it) => ({
          ...it,
          id: it.id || crypto.randomUUID(),
          sentToKitchen: false,
          kitchenRound: 1,
          originTableNumber: it.originTableNumber ?? originNum,
        }));

        const groupNumbers = targetTable?.mergedWith?.length
          ? [targetTable.number, ...targetTable.mergedWith]
          : [targetTable?.number ?? 1];

        // Atualização reativa imediata na UI para todas as mesas do grupo
        setState((s) => ({
          ...s,
          tables: s.tables.map((t) => {
            if (groupNumbers.includes(t.number)) {
              const isFree = t.status === "livre";
              const waiter =
                isFree || t.waiter === "Equipe" || t.waiter === "Diego" || !t.waiter
                  ? operatorName
                  : t.waiter;

              return {
                ...t,
                items: [...t.items, ...itemsWithMeta],
                status: isFree ? "ocupada" : t.status,
                openedAt: t.openedAt ?? Date.now(),
                waiter,
              };
            }
            return t;
          }),
        }));

        if (isTauri()) {
          try {
            const groupDbTables = await db
              .select({ id: diningTables.id, number: diningTables.number })
              .from(diningTables)
              .where(
                and(inArray(diningTables.number, groupNumbers), isNull(diningTables.deleted_at)),
              );
            const groupIds = groupDbTables.map((g) => g.id);

            // Busca se já existe uma comanda aberta para qualquer mesa do grupo
            const existingOrders = await db
              .select()
              .from(orders)
              .where(
                and(
                  inArray(orders.table_id, groupIds),
                  eq(orders.type, "table"),
                  eq(orders.status, "open"),
                  isNull(orders.deleted_at),
                ),
              )
              .limit(1);

            let orderId = existingOrders[0]?.id;

            if (!orderId) {
              orderId = crypto.randomUUID();
              const codePrefix =
                groupNumbers.length > 1
                  ? `MESA-${groupNumbers
                      .sort((a, b) => a - b)
                      .map((n) => String(n).padStart(2, "0"))
                      .join("+")}`
                  : `MESA-${String(targetTable?.number ?? 1).padStart(2, "0")}`;

              await db.insert(orders).values({
                id: orderId,
                code: codePrefix,
                type: "table",
                table_id: tableId,
                customer_id: null,
                customer_name: null,
                operator_id: null,
                shift_id: state.currentShiftId ?? null,
                status: "open",
                subtotal: 0,
                service_fee: 0,
                tip: 0,
                discount: 0,
                total: 0,
                is_synced: false,
                created_at: now,
                updated_at: now,
                deleted_at: null,
              });
            }

            // Grava cada item da comanda no SQLite com metadados de cozinha em notes
            for (const item of itemsWithMeta) {
              const matchedProduct = state.products.find((p) => p.name === item.name);
              await db.insert(orderItems).values({
                id: item.id,
                order_id: orderId,
                product_id: matchedProduct?.id ?? null,
                name: item.name,
                qty: item.qty,
                unit_price: item.unitPrice,
                total_price: item.qty * item.unitPrice,
                details: item.details ? JSON.stringify(item.details) : null,
                notes: JSON.stringify({
                  sentToKitchen: false,
                  kitchenRound: 1,
                  originTableNumber: item.originTableNumber ?? originNum,
                }),
                is_synced: false,
                created_at: now,
                updated_at: now,
                deleted_at: null,
              });
            }

            // Atualiza status e garçom de TODAS as mesas do grupo no SQLite
            for (const gId of groupIds) {
              await db
                .update(diningTables)
                .set({
                  status: "ocupada",
                  opened_at: now,
                  waiter: operatorName,
                  updated_at: now,
                  is_synced: false,
                })
                .where(eq(diningTables.id, gId));
            }
          } catch (err) {
            console.error("[addItemsToTable Error]:", err);
          }
          requestImmediateSync(300);
        }
      },
      removeItem: async (tableId, itemId) => {
        const now = new Date().toISOString();
        const targetTable = state.tables.find((t) => t.id === tableId);
        const groupNumbers = targetTable?.mergedWith?.length
          ? [targetTable.number, ...targetTable.mergedWith]
          : [targetTable?.number ?? 1];

        const remaining = (targetTable?.items ?? []).filter((i) => i.id !== itemId);
        const newStatus = remaining.length === 0 ? "livre" : (targetTable?.status ?? "livre");

        setState((s) => ({
          ...s,
          tables: s.tables.map((t) => {
            if (groupNumbers.includes(t.number)) {
              return {
                ...t,
                items: remaining,
                status: newStatus,
                openedAt: remaining.length === 0 ? null : t.openedAt,
                mergedWith: remaining.length === 0 ? [] : t.mergedWith,
                waiter: remaining.length === 0 ? "Equipe" : t.waiter,
              };
            }
            return t;
          }),
        }));

        if (isTauri()) {
          try {
            await db
              .update(orderItems)
              .set({
                deleted_at: now,
                updated_at: now,
                is_synced: false,
              })
              .where(eq(orderItems.id, itemId));

            if (remaining.length === 0) {
              const groupDbTables = await db
                .select({ id: diningTables.id })
                .from(diningTables)
                .where(
                  and(inArray(diningTables.number, groupNumbers), isNull(diningTables.deleted_at)),
                );
              const groupIds = groupDbTables.map((g) => g.id);

              for (const gId of groupIds) {
                await db
                  .update(diningTables)
                  .set({
                    status: "livre",
                    opened_at: null,
                    waiter: "Equipe",
                    discount_type: null,
                    discount_amount: null,
                    merged_with: null,
                    updated_at: now,
                    is_synced: false,
                  })
                  .where(eq(diningTables.id, gId));
              }

              await db
                .update(orders)
                .set({
                  status: "cancelled",
                  deleted_at: now,
                  updated_at: now,
                  is_synced: false,
                })
                .where(
                  and(
                    inArray(orders.table_id, groupIds),
                    eq(orders.type, "table"),
                    eq(orders.status, "open"),
                  ),
                );
            }
          } catch (err) {
            console.error("[removeItem Error]:", err);
          }
        }
      },
      transferItem: async (fromId, toId, itemId) => {
        const now = new Date().toISOString();
        const from = state.tables.find((t) => t.id === fromId);
        const to = state.tables.find((t) => t.id === toId);
        const moved = from?.items.find((i) => i.id === itemId);
        if (!from || !to || !moved) return;

        const updatedMoved: OrderItem = { ...moved, originTableNumber: to.number };

        const groupFrom = from.mergedWith?.length
          ? [from.number, ...from.mergedWith]
          : [from.number];
        const groupTo = to.mergedWith?.length ? [to.number, ...to.mergedWith] : [to.number];

        setState((s) => ({
          ...s,
          tables: s.tables.map((t) => {
            if (groupFrom.includes(t.number)) {
              const remaining = t.items.filter((i) => i.id !== itemId);
              return {
                ...t,
                items: remaining,
                status: remaining.length === 0 ? "livre" : t.status,
                openedAt: remaining.length === 0 ? null : t.openedAt,
                mergedWith: remaining.length === 0 ? [] : t.mergedWith,
                waiter: remaining.length === 0 ? "Equipe" : t.waiter,
              };
            }
            if (groupTo.includes(t.number)) {
              return {
                ...t,
                items: [...t.items, updatedMoved],
                status: t.status === "livre" ? "ocupada" : t.status,
                openedAt: t.openedAt ?? Date.now(),
              };
            }
            return t;
          }),
        }));

        if (isTauri()) {
          try {
            // Busca ou cria o pedido da mesa de destino
            const destOrders = await db
              .select()
              .from(orders)
              .where(
                and(
                  eq(orders.table_id, toId),
                  eq(orders.type, "table"),
                  eq(orders.status, "open"),
                  isNull(orders.deleted_at),
                ),
              )
              .limit(1);

            let destOrderId = destOrders[0]?.id;
            if (!destOrderId) {
              destOrderId = crypto.randomUUID();
              await db.insert(orders).values({
                id: destOrderId,
                code: `MESA-${String(to.number ?? 1).padStart(2, "0")}`,
                type: "table",
                table_id: toId,
                status: "open",
                is_synced: false,
                created_at: now,
                updated_at: now,
                deleted_at: null,
              });
            }

            const currentItem = await db
              .select({ notes: orderItems.notes })
              .from(orderItems)
              .where(eq(orderItems.id, itemId))
              .limit(1);

            let meta: Record<string, unknown> = {};
            if (currentItem[0]?.notes) {
              try {
                meta = JSON.parse(currentItem[0].notes);
              } catch {
                meta = {};
              }
            }
            meta["originTableNumber"] = to.number;

            await db
              .update(orderItems)
              .set({
                order_id: destOrderId,
                notes: JSON.stringify(meta),
                updated_at: now,
                is_synced: false,
              })
              .where(eq(orderItems.id, itemId));

            for (const tblNum of groupTo) {
              const targetTbl = state.tables.find((t) => t.number === tblNum);
              if (targetTbl) {
                await db
                  .update(diningTables)
                  .set({
                    status: "ocupada",
                    opened_at: targetTbl.openedAt
                      ? new Date(targetTbl.openedAt).toISOString()
                      : now,
                    updated_at: now,
                    is_synced: false,
                  })
                  .where(eq(diningTables.id, targetTbl.id));
              }
            }

            const remainingFrom = from.items.length - 1;
            if (remainingFrom <= 0) {
              for (const tblNum of groupFrom) {
                const targetTbl = state.tables.find((t) => t.number === tblNum);
                if (targetTbl) {
                  await db
                    .update(diningTables)
                    .set({
                      status: "livre",
                      opened_at: null,
                      merged_with: "[]",
                      waiter: "Equipe",
                      updated_at: now,
                      is_synced: false,
                    })
                    .where(eq(diningTables.id, targetTbl.id));
                }
              }
            }
          } catch (err) {
            console.error("[transferItem Error]:", err);
          }
        }
      },
      mergeTables: async (hostId, guestId) => {
        const host = state.tables.find((t) => t.id === hostId);
        const guest = state.tables.find((t) => t.id === guestId);
        if (!host || !guest) return;
        const now = new Date().toISOString();

        // Une todos os números de mesas dos dois lados (sem duplicatas)
        const groupNumbers = Array.from(
          new Set([
            host.number,
            guest.number,
            ...(host.mergedWith || []),
            ...(guest.mergedWith || []),
          ]),
        ).sort((a, b) => a - b);

        // Itens combinados de ambas as mesas preservando a mesa de origem
        const hostItems = host.items.map((it) => ({
          ...it,
          originTableNumber: it.originTableNumber ?? host.number,
        }));
        const guestItems = guest.items.map((it) => ({
          ...it,
          originTableNumber: it.originTableNumber ?? guest.number,
        }));
        const combinedItems = Array.from(
          new Map([...hostItems, ...guestItems].map((item) => [item.id, item])).values(),
        );

        const openedAt = host.openedAt ?? guest.openedAt ?? Date.now();
        const waiter =
          host.waiter && host.waiter !== "Equipe"
            ? host.waiter
            : guest.waiter && guest.waiter !== "Equipe"
              ? guest.waiter
              : (state.user ?? "Marina R.");

        const status = host.status === "conta" || guest.status === "conta" ? "conta" : "ocupada";

        // Atualiza estado de todas as mesas participantes do grupo
        setState((s) => ({
          ...s,
          tables: s.tables.map((t) => {
            if (groupNumbers.includes(t.number)) {
              return {
                ...t,
                items: combinedItems,
                mergedWith: groupNumbers.filter((n) => n !== t.number),
                status,
                openedAt,
                waiter,
              };
            }
            return t;
          }),
        }));

        if (isTauri()) {
          try {
            const groupDbTables = await db
              .select()
              .from(diningTables)
              .where(
                and(inArray(diningTables.number, groupNumbers), isNull(diningTables.deleted_at)),
              );

            const groupIds = groupDbTables.map((g) => g.id);

            // Busca pedidos abertos de qualquer mesa do grupo
            const openOrders = await db
              .select()
              .from(orders)
              .where(
                and(
                  inArray(orders.table_id, groupIds),
                  eq(orders.type, "table"),
                  eq(orders.status, "open"),
                  isNull(orders.deleted_at),
                ),
              );

            const primaryOrder = openOrders.find((o) => o.table_id === hostId) ?? openOrders[0];

            if (!primaryOrder) {
              const newOrderId = crypto.randomUUID();
              const codePrefix = `MESA-${groupNumbers.map((n) => String(n).padStart(2, "0")).join("+")}`;
              await db.insert(orders).values({
                id: newOrderId,
                code: codePrefix,
                type: "table",
                table_id: hostId,
                status: "open",
                subtotal: 0,
                service_fee: 0,
                tip: 0,
                discount: 0,
                total: 0,
                is_synced: false,
                created_at: now,
                updated_at: now,
                deleted_at: null,
              });
            } else {
              // Garante que os itens já existentes no pedido principal tenham originTableNumber em notes
              const primaryTable = groupDbTables.find((g) => g.id === primaryOrder.table_id);
              const primaryNum = primaryTable?.number;
              if (primaryNum !== undefined) {
                const primaryDbItems = await db
                  .select()
                  .from(orderItems)
                  .where(eq(orderItems.order_id, primaryOrder.id));
                for (const pit of primaryDbItems) {
                  let meta: Record<string, unknown> = {};
                  if (pit.notes) {
                    try {
                      meta = JSON.parse(pit.notes);
                    } catch {
                      meta = {};
                    }
                  }
                  if (typeof meta["originTableNumber"] !== "number") {
                    meta["originTableNumber"] = primaryNum;
                    await db
                      .update(orderItems)
                      .set({
                        notes: JSON.stringify(meta),
                        updated_at: now,
                        is_synced: false,
                      })
                      .where(eq(orderItems.id, pit.id));
                  }
                }
              }

              // Se houver pedidos adicionais de outras mesas do grupo, transfere os itens gravando originTableNumber
              const otherOrders = openOrders.filter((o) => o.id !== primaryOrder.id);
              for (const other of otherOrders) {
                const otherTable = groupDbTables.find((g) => g.id === other.table_id);
                const otherNum = otherTable?.number;

                const otherDbItems = await db
                  .select()
                  .from(orderItems)
                  .where(eq(orderItems.order_id, other.id));

                for (const oit of otherDbItems) {
                  let meta: Record<string, unknown> = {};
                  if (oit.notes) {
                    try {
                      meta = JSON.parse(oit.notes);
                    } catch {
                      meta = {};
                    }
                  }
                  if (typeof meta["originTableNumber"] !== "number" && otherNum !== undefined) {
                    meta["originTableNumber"] = otherNum;
                  }

                  await db
                    .update(orderItems)
                    .set({
                      order_id: primaryOrder.id,
                      notes: JSON.stringify(meta),
                      updated_at: now,
                      is_synced: false,
                    })
                    .where(eq(orderItems.id, oit.id));
                }

                await db
                  .update(orders)
                  .set({ status: "completed", updated_at: now, is_synced: false })
                  .where(eq(orders.id, other.id));
              }
            }

            // Atualiza cada mesa no SQLite com a lista de suas parceiras
            for (const gt of groupDbTables) {
              const partnerNumbers = groupNumbers.filter((n) => n !== gt.number);
              await db
                .update(diningTables)
                .set({
                  status: "ocupada",
                  opened_at: new Date(openedAt).toISOString(),
                  waiter,
                  merged_with: JSON.stringify(partnerNumbers),
                  updated_at: now,
                  is_synced: false,
                })
                .where(eq(diningTables.id, gt.id));
            }
          } catch (err) {
            console.error("[mergeTables Error]:", err);
          }
        }
      },
      unmergeTable: async (tableId, mode = "restore_origins", customDistribution) => {
        const targetTable = state.tables.find((t) => t.id === tableId);
        if (!targetTable || !targetTable.mergedWith?.length) return;
        const now = new Date().toISOString();

        const groupNumbers = Array.from(
          new Set([targetTable.number, ...targetTable.mergedWith]),
        ).sort((a, b) => a - b);

        const allItems = [...targetTable.items];

        // Determina os itens para cada mesa do grupo de acordo com o modo
        const getItemsForTableNumber = (tblNum: number): OrderItem[] => {
          if (mode === "keep_here") {
            return tblNum === targetTable.number ? allItems : [];
          }
          if (mode === "manual" && customDistribution) {
            const assignedIds = customDistribution[tblNum] ?? [];
            return allItems.filter((it) => assignedIds.includes(it.id));
          }
          // modo padrão "restore_origins"
          return allItems.filter((it) => {
            const origin = it.originTableNumber ?? targetTable.number;
            return origin === tblNum;
          });
        };

        // Atualização reativa imediata no estado React
        setState((s) => ({
          ...s,
          tables: s.tables.map((t) => {
            if (groupNumbers.includes(t.number)) {
              const assigned = getItemsForTableNumber(t.number);
              if (assigned.length > 0) {
                return {
                  ...t,
                  items: assigned,
                  status: "ocupada",
                  mergedWith: [],
                  openedAt: t.openedAt ?? Date.now(),
                  waiter:
                    t.waiter && t.waiter !== "Equipe" ? t.waiter : (state.user ?? "Marina R."),
                };
              } else {
                return {
                  ...t,
                  items: [],
                  status: "livre",
                  openedAt: null,
                  discount: null,
                  mergedWith: [],
                  waiter: "Equipe",
                };
              }
            }
            return t;
          }),
        }));

        if (isTauri()) {
          try {
            const groupDbTables = await db
              .select()
              .from(diningTables)
              .where(
                and(inArray(diningTables.number, groupNumbers), isNull(diningTables.deleted_at)),
              );
            const groupIds = groupDbTables.map((g) => g.id);

            // Busca pedidos abertos atualmente dessas mesas
            const openOrders = await db
              .select()
              .from(orders)
              .where(
                and(
                  inArray(orders.table_id, groupIds),
                  eq(orders.type, "table"),
                  eq(orders.status, "open"),
                  isNull(orders.deleted_at),
                ),
              );

            for (const gt of groupDbTables) {
              const assigned = getItemsForTableNumber(gt.number);
              const existingOrder = openOrders.find((o) => o.table_id === gt.id);

              if (assigned.length > 0) {
                const subtotal = assigned.reduce((sum, it) => sum + it.qty * it.unitPrice, 0);
                let orderId = existingOrder?.id;

                if (!orderId) {
                  orderId = crypto.randomUUID();
                  await db.insert(orders).values({
                    id: orderId,
                    code: `MESA-${String(gt.number).padStart(2, "0")}`,
                    type: "table",
                    table_id: gt.id,
                    operator_id: null,
                    shift_id: state.currentShiftId ?? null,
                    status: "open",
                    subtotal,
                    service_fee: 0,
                    tip: 0,
                    discount: 0,
                    total: subtotal,
                    is_synced: false,
                    created_at: now,
                    updated_at: now,
                    deleted_at: null,
                  });
                } else {
                  await db
                    .update(orders)
                    .set({
                      code: `MESA-${String(gt.number).padStart(2, "0")}`,
                      subtotal,
                      total: subtotal,
                      updated_at: now,
                      is_synced: false,
                    })
                    .where(eq(orders.id, orderId));
                }

                // Vincula os itens atribuídos a este orderId
                for (const it of assigned) {
                  await db
                    .update(orderItems)
                    .set({
                      order_id: orderId,
                      updated_at: now,
                      is_synced: false,
                    })
                    .where(eq(orderItems.id, it.id));
                }

                // Atualiza a mesa para ocupada e sem vínculo
                await db
                  .update(diningTables)
                  .set({
                    status: "ocupada",
                    merged_with: null,
                    opened_at: gt.opened_at || now,
                    waiter:
                      gt.waiter && gt.waiter !== "Equipe" ? gt.waiter : (state.user ?? "Marina R."),
                    updated_at: now,
                    is_synced: false,
                  })
                  .where(eq(diningTables.id, gt.id));
              } else {
                // Mesa ficou vazia após a separação
                if (existingOrder) {
                  await db
                    .update(orders)
                    .set({
                      status: "completed",
                      updated_at: now,
                      is_synced: false,
                    })
                    .where(eq(orders.id, existingOrder.id));
                }

                await db
                  .update(diningTables)
                  .set({
                    status: "livre",
                    opened_at: null,
                    waiter: "Equipe",
                    discount_type: null,
                    discount_amount: null,
                    merged_with: null,
                    updated_at: now,
                    is_synced: false,
                  })
                  .where(eq(diningTables.id, gt.id));
              }
            }
          } catch (err) {
            console.error("[unmergeTable Error]:", err);
          }
        }
      },
      applyDiscount: async (tableId, type, amount) => {
        const now = new Date().toISOString();
        const targetTable = state.tables.find((t) => t.id === tableId);
        const groupNumbers = targetTable?.mergedWith?.length
          ? [targetTable.number, ...targetTable.mergedWith]
          : [targetTable?.number ?? 1];

        setState((s) => ({
          ...s,
          tables: s.tables.map((t) =>
            groupNumbers.includes(t.number) ? { ...t, discount: { type, amount } } : t,
          ),
        }));

        if (isTauri()) {
          const groupDbTables = await db
            .select({ id: diningTables.id })
            .from(diningTables)
            .where(
              and(inArray(diningTables.number, groupNumbers), isNull(diningTables.deleted_at)),
            );
          for (const gt of groupDbTables) {
            await db
              .update(diningTables)
              .set({
                discount_type: type,
                discount_amount: amount,
                updated_at: now,
                is_synced: false,
              })
              .where(eq(diningTables.id, gt.id));
          }
          requestImmediateSync(300);
        }
      },
      setTableStatus: async (tableId, status) => {
        const now = new Date().toISOString();
        const targetTable = state.tables.find((t) => t.id === tableId);
        const groupNumbers = targetTable?.mergedWith?.length
          ? [targetTable.number, ...targetTable.mergedWith]
          : [targetTable?.number ?? 1];

        setState((s) => ({
          ...s,
          tables: s.tables.map((t) => {
            if (groupNumbers.includes(t.number)) {
              return {
                ...t,
                status,
                openedAt: status === "livre" ? null : (t.openedAt ?? Date.now()),
                items: status === "livre" ? [] : t.items,
                mergedWith: status === "livre" ? [] : t.mergedWith,
              };
            }
            return t;
          }),
        }));

        if (isTauri()) {
          const groupDbTables = await db
            .select({ id: diningTables.id })
            .from(diningTables)
            .where(
              and(inArray(diningTables.number, groupNumbers), isNull(diningTables.deleted_at)),
            );
          for (const gt of groupDbTables) {
            await db
              .update(diningTables)
              .set({
                status,
                opened_at: status === "livre" ? null : now,
                merged_with: status === "livre" ? null : undefined,
                updated_at: now,
                is_synced: false,
              })
              .where(eq(diningTables.id, gt.id));
          }

          // Se a mesa foi liberada, cancela pedidos em aberto para não ressuscitarem itens no reload
          if (status === "livre" && groupDbTables.length > 0) {
            const groupIds = groupDbTables.map((g) => g.id);
            await db
              .update(orders)
              .set({
                status: "cancelled",
                deleted_at: now,
                updated_at: now,
                is_synced: false,
              })
              .where(
                and(
                  inArray(orders.table_id, groupIds),
                  eq(orders.type, "table"),
                  eq(orders.status, "open"),
                  isNull(orders.deleted_at),
                ),
              );
          }
        }
      },
      sendTableToKitchen: async (tableId: string) => {
        const table = state.tables.find((t) => t.id === tableId);
        if (!table) return null;

        const pendingItems = table.items.filter((i) => !i.sentToKitchen);
        if (pendingItems.length === 0) return null;

        const now = new Date().toISOString();
        // Identifica a próxima rodada com base nas rodadas já despachadas
        const currentMaxRound = table.items.reduce(
          (max, it) => Math.max(max, it.kitchenRound || 0),
          0,
        );
        const nextRound = currentMaxRound + 1;

        const groupNumbers = table.mergedWith?.length
          ? [table.number, ...table.mergedWith].sort((a, b) => a - b)
          : [table.number];

        // Atualização reativa imediata na UI para todas as mesas do grupo
        const pendingIds = new Set(pendingItems.map((i) => i.id));
        setState((s) => ({
          ...s,
          tables: s.tables.map((t) => {
            if (groupNumbers.includes(t.number)) {
              return {
                ...t,
                items: t.items.map((i) =>
                  pendingIds.has(i.id)
                    ? { ...i, sentToKitchen: true, kitchenRound: nextRound, sentAt: Date.now() }
                    : i,
                ),
              };
            }
            return t;
          }),
        }));

        // Atualiza status dos itens no SQLite
        if (isTauri()) {
          try {
            for (const item of pendingItems) {
              await db
                .update(orderItems)
                .set({
                  notes: JSON.stringify({
                    sentToKitchen: true,
                    kitchenRound: nextRound,
                    sentAt: now,
                  }),
                  updated_at: now,
                  is_synced: false,
                })
                .where(eq(orderItems.id, item.id));
            }
          } catch (err) {
            console.error("[sendTableToKitchen Error]:", err);
          }
        }

        // Monta o ticket de produção e dispara impressão térmica
        const ticketData: KitchenTicketData = {
          tableNumber: table.number,
          orderCode:
            groupNumbers.length > 1
              ? `MESA-${groupNumbers.map((n) => String(n).padStart(2, "0")).join("+")}`
              : `MESA-${String(table.number).padStart(2, "0")}`,
          waiter: table.waiter || state.user || "Operador",
          round: nextRound,
          items: pendingItems.map((i) => ({
            id: i.id,
            name: i.name,
            qty: i.qty,
            details: i.details,
          })),
          timestamp: now,
        };

        if (state.kitchenPrinterConfig.autoPrintOnKitchenSend) {
          await printKitchenTicket(ticketData, state.kitchenPrinterConfig);
        }

        return ticketData;
      },
      reprintKitchenTicket: async (tableId: string, round?: number) => {
        const table = state.tables.find((t) => t.id === tableId);
        if (!table || table.items.length === 0) return null;

        const itemsToPrint = round
          ? table.items.filter((i) => i.kitchenRound === round)
          : table.items;

        if (itemsToPrint.length === 0) return null;

        const groupNumbers = table.mergedWith?.length
          ? [table.number, ...table.mergedWith].sort((a, b) => a - b)
          : [table.number];

        const maxRound = table.items.reduce((max, i) => Math.max(max, i.kitchenRound || 1), 1);

        const ticketData: KitchenTicketData = {
          tableNumber: table.number,
          orderCode:
            groupNumbers.length > 1
              ? `MESA-${groupNumbers.map((n) => String(n).padStart(2, "0")).join("+")}`
              : `MESA-${String(table.number).padStart(2, "0")}`,
          waiter: table.waiter || state.user || "Operador",
          round: round ?? maxRound,
          items: itemsToPrint.map((i) => ({
            id: i.id,
            name: i.name,
            qty: i.qty,
            details: i.details,
          })),
          timestamp: Date.now(),
        };

        await printKitchenTicket(ticketData, state.kitchenPrinterConfig);
        return ticketData;
      },
      printPreConta: async (tableId: string) => {
        const table = state.tables.find((t) => t.id === tableId);
        if (!table || table.items.length === 0) {
          return { success: false, message: "Mesa não encontrada ou sem itens consumidos." };
        }

        // 1. Atualiza status da mesa para "conta"
        const now = new Date().toISOString();
        setState((s) => ({
          ...s,
          tables: s.tables.map((t) => (t.id === tableId ? { ...t, status: "conta" } : t)),
        }));

        if (isTauri()) {
          try {
            await db
              .update(diningTables)
              .set({ status: "conta", updated_at: now, is_synced: false })
              .where(eq(diningTables.id, tableId));
          } catch (err) {
            console.error("[printPreConta status update error]:", err);
          }
        }

        // 2. Calcula totais e divisão da pré-conta
        const subtotal = itemsTotal(table.items);
        const discountAmount = table.discount
          ? table.discount.type === "percent"
            ? (subtotal * table.discount.amount) / 100
            : table.discount.amount
          : 0;

        const baseTotal = Math.max(0, subtotal - discountAmount);
        const feePercent = state.counterPrinterConfig?.serviceFeePercent ?? 10;
        const includeFee = state.counterPrinterConfig?.includeServiceFee ?? true;
        const serviceFee = includeFee ? Math.round(((baseTotal * feePercent) / 100) * 100) / 100 : 0;
        const totalWithService = baseTotal + serviceFee;
        const totalWithoutService = baseTotal;
        const seats = Math.max(1, table.seats || 1);

        const groupNumbers = table.mergedWith?.length
          ? [table.number, ...table.mergedWith].sort((a, b) => a - b)
          : [table.number];

        const ticketData: PreContaTicketData = {
          tableNumber: table.number,
          mergedWith:
            groupNumbers.length > 1 ? groupNumbers.filter((n) => n !== table.number) : undefined,
          seats,
          waiter: table.waiter && table.waiter !== "Equipe" ? table.waiter : state.user || "Equipe",
          openedAt: table.openedAt,
          items: table.items.map((i) => ({
            id: i.id,
            name: i.name,
            qty: i.qty,
            unitPrice: i.unitPrice ?? i.price ?? 0,
            details: i.details,
          })),
          subtotal,
          discount: discountAmount,
          serviceFee,
          serviceFeePercent: feePercent,
          totalWithService,
          totalWithoutService,
          perPersonWithService: Math.round((totalWithService / seats) * 100) / 100,
          perPersonWithoutService: Math.round((totalWithoutService / seats) * 100) / 100,
          timestamp: Date.now(),
        };

        const res = await printPreContaTicket(
          ticketData,
          state.counterPrinterConfig,
          state.kitchenPrinterConfig,
        );

        return {
          success: res.success,
          message: res.message,
          ticketData,
        };
      },
      finishTable: async (tableId, data) => {
        const table = state.tables.find((t) => t.id === tableId);
        if (!table) return;
        const now = new Date().toISOString();
        const total = data.courtesyReason
          ? 0
          : itemsTotal(data.items) + data.serviceFee + data.tip - data.discount;

        const groupNumbers = table.mergedWith?.length
          ? [table.number, ...table.mergedWith].sort((a, b) => a - b)
          : [table.number];

        const saleId = crypto.randomUUID();
        const orderId = crypto.randomUUID();
        const saleCode = `CUP-${1042 + state.sales.length}`;

        const originLabel =
          groupNumbers.length > 1
            ? groupNumbers.map((n) => `Mesa ${String(n).padStart(2, "0")}`).join(" + ")
            : `Mesa ${String(table.number).padStart(2, "0")}`;

        const sale: Sale = {
          id: saleId,
          code: saleCode,
          createdAt: Date.now(),
          origin: originLabel,
          items: data.items,
          serviceFee: data.serviceFee,
          tip: data.tip,
          discount: data.discount,
          total,
          payments: data.payments,
          cpf: data.cpf,
          creditCustomerId: data.creditCustomerId,
          courtesyReason: data.courtesyReason,
          shift: "Turno 1",
          shiftId: state.currentShiftId ?? undefined,
          cancelled: false,
        };

        const paidIds = new Set(data.items.map((i) => i.id));
        const remaining = table.items.filter((i) => !paidIds.has(i.id));

        setState((s) => ({
          ...s,
          sales: [sale, ...s.sales],
          tables: s.tables.map((t) => {
            if (groupNumbers.includes(t.number)) {
              return remaining.length
                ? { ...t, items: remaining, status: "ocupada", discount: null }
                : {
                    ...t,
                    items: [],
                    status: "livre",
                    openedAt: null,
                    discount: null,
                    mergedWith: [],
                    waiter: "Equipe",
                  };
            }
            return t;
          }),
        }));

        if (isTauri()) {
          // 1. Grava o pedido
          await db.insert(orders).values({
            id: orderId,
            code: `PED-${table.number}`,
            type: "table",
            table_id: tableId,
            status: "completed",
            subtotal: itemsTotal(data.items),
            service_fee: data.serviceFee,
            tip: data.tip,
            discount: data.discount,
            total,
            is_synced: false,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          });

          // Grava os itens vinculados ao pedido concluído
          for (const it of data.items) {
            const itemPrice = it.unitPrice ?? it.price ?? 0;
            const matchedProduct = state.products.find(
              (p) => p.name.toLowerCase() === it.name.toLowerCase() || p.id === it.id,
            );
            await db.insert(orderItems).values({
              id: crypto.randomUUID(),
              order_id: orderId,
              product_id: matchedProduct?.id ?? null,
              name: it.name,
              qty: it.qty,
              unit_price: itemPrice,
              total_price: itemPrice * it.qty,
              details: it.details ? JSON.stringify(it.details) : null,
              notes: null,
              is_synced: false,
              created_at: now,
              updated_at: now,
              deleted_at: null,
            });
          }

          // 2. Grava a venda
          await db.insert(sales).values({
            id: saleId,
            code: saleCode,
            order_id: orderId,
            shift_id: state.currentShiftId,
            origin: originLabel,
            customer_id: data.creditCustomerId ?? null,
            cpf: data.cpf,
            subtotal: itemsTotal(data.items),
            service_fee: data.serviceFee,
            tip: data.tip,
            discount: data.discount,
            total,
            cancelled: false,
            credit_customer_id: data.creditCustomerId ?? null,
            courtesy_reason: data.courtesyReason,
            is_synced: false,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          });

          // 3. Grava os pagamentos
          for (const pay of data.payments) {
            await db.insert(payments).values({
              id: crypto.randomUUID(),
              sale_id: saleId,
              method: pay.method,
              amount: pay.amount,
              customer_id: pay.customerId ?? data.creditCustomerId ?? null,
              card_brand: null,
              authorization_code: null,
              is_synced: false,
              created_at: now,
              updated_at: now,
              deleted_at: null,
            });
          }

          // Atualiza saldo devedor do cliente se houver pagamento a prazo (Fiado)
          if (data.creditCustomerId) {
            const fiadoAmount =
              data.payments.filter((p) => p.method === "fiado").reduce((s, p) => s + p.amount, 0) ||
              total;

            const currentDbCust = await db
              .select({ balance_due: customers.balance_due })
              .from(customers)
              .where(eq(customers.id, data.creditCustomerId))
              .limit(1);

            const currentBal = currentDbCust[0]?.balance_due ?? 0;
            const newBal = currentBal + fiadoAmount;

            await db
              .update(customers)
              .set({
                balance_due: newBal,
                updated_at: now,
                is_synced: false,
              })
              .where(eq(customers.id, data.creditCustomerId));

            const txId = uid();
            try {
              await db.insert(customerTransactions).values({
                id: txId,
                customer_id: data.creditCustomerId,
                type: "debito",
                amount: fiadoAmount,
                balance_after: newBal,
                payment_method: "fiado",
                sale_id: saleId,
                order_id: orderId,
                shift_id: state.currentShiftId ?? undefined,
                notes: `Consumo ${originLabel}`,
                created_at: now,
                updated_at: now,
                is_synced: false,
              });
            } catch (txErr) {
              console.warn("[PosStore]: Erro ao gravar transação de fiado:", txErr);
            }

            const newTx: CustomerTransaction = {
              id: txId,
              customerId: data.creditCustomerId,
              type: "debito",
              amount: fiadoAmount,
              balanceAfter: newBal,
              paymentMethod: "fiado",
              saleId,
              orderId,
              shiftId: state.currentShiftId ?? undefined,
              notes: `Consumo ${originLabel}`,
              createdAt: now,
            };

            setState((s) => ({
              ...s,
              customers: s.customers.map((c) =>
                c.id === data.creditCustomerId ? { ...c, balanceDue: newBal } : c,
              ),
              customerTransactions: [newTx, ...s.customerTransactions],
            }));
          }

          const groupDbTables = await db
            .select({ id: diningTables.id })
            .from(diningTables)
            .where(
              and(inArray(diningTables.number, groupNumbers), isNull(diningTables.deleted_at)),
            );
          const groupIds = groupDbTables.map((g) => g.id);

          // Fecha pedidos abertos de todas as mesas do grupo
          await db
            .update(orders)
            .set({
              status: "completed",
              updated_at: now,
              is_synced: false,
            })
            .where(
              and(
                inArray(orders.table_id, groupIds),
                eq(orders.type, "table"),
                eq(orders.status, "open"),
              ),
            );

          // 4. Atualiza todas as mesas do grupo
          if (remaining.length === 0) {
            for (const gId of groupIds) {
              await db
                .update(diningTables)
                .set({
                  status: "livre",
                  opened_at: null,
                  waiter: "Equipe",
                  discount_type: null,
                  discount_amount: null,
                  merged_with: null,
                  updated_at: now,
                  is_synced: false,
                })
                .where(eq(diningTables.id, gId));
            }
          }
          requestImmediateSync(300);
        }
      },
      registerCounterSale: async (data) => {
        const now = new Date().toISOString();
        const saleId = crypto.randomUUID();
        const orderId = crypto.randomUUID();
        const saleCode = `CUP-${1042 + state.sales.length}`;
        const total = data.courtesyReason ? 0 : itemsTotal(data.items) + data.serviceFee + data.tip;

        const sale: Sale = {
          id: saleId,
          code: saleCode,
          createdAt: Date.now(),
          origin: data.customer ? `Balcão · ${data.customer}` : "Balcão",
          items: data.items,
          serviceFee: data.serviceFee,
          tip: data.tip,
          discount: 0,
          total,
          payments: data.payments,
          cpf: data.cpf,
          creditCustomerId: data.creditCustomerId,
          courtesyReason: data.courtesyReason,
          shift: "Turno 1",
          shiftId: state.currentShiftId ?? undefined,
          cancelled: false,
        };

        setState((s) => ({ ...s, sales: [sale, ...s.sales] }));

        if (isTauri()) {
          await db.insert(orders).values({
            id: orderId,
            code: "BALCAO",
            type: "counter",
            customer_name: data.customer || "Cliente Balcão",
            status: "completed",
            subtotal: itemsTotal(data.items),
            service_fee: data.serviceFee,
            tip: data.tip,
            discount: 0,
            total,
            is_synced: false,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          });

          for (const it of data.items) {
            const itemPrice = it.unitPrice ?? it.price ?? 0;
            const matchedProduct = state.products.find(
              (p) => p.name.toLowerCase() === it.name.toLowerCase() || p.id === it.id,
            );
            await db.insert(orderItems).values({
              id: crypto.randomUUID(),
              order_id: orderId,
              product_id: matchedProduct?.id ?? null,
              name: it.name,
              qty: it.qty,
              unit_price: itemPrice,
              total_price: itemPrice * it.qty,
              details: it.details ? JSON.stringify(it.details) : null,
              notes: null,
              is_synced: false,
              created_at: now,
              updated_at: now,
              deleted_at: null,
            });
          }

          await db.insert(sales).values({
            id: saleId,
            code: saleCode,
            order_id: orderId,
            shift_id: state.currentShiftId,
            origin: data.customer ? `Balcão · ${data.customer}` : "Balcão",
            customer_id: data.creditCustomerId ?? null,
            cpf: data.cpf,
            subtotal: itemsTotal(data.items),
            service_fee: data.serviceFee,
            tip: data.tip,
            discount: 0,
            total,
            cancelled: false,
            credit_customer_id: data.creditCustomerId ?? null,
            courtesy_reason: data.courtesyReason,
            is_synced: false,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          });

          for (const pay of data.payments) {
            await db.insert(payments).values({
              id: crypto.randomUUID(),
              sale_id: saleId,
              method: pay.method,
              amount: pay.amount,
              customer_id: pay.customerId ?? data.creditCustomerId ?? null,
              card_brand: null,
              authorization_code: null,
              is_synced: false,
              created_at: now,
              updated_at: now,
              deleted_at: null,
            });
          }

          // Atualiza saldo devedor do cliente se houver venda fiada
          if (data.creditCustomerId) {
            const fiadoAmount =
              data.payments.filter((p) => p.method === "fiado").reduce((s, p) => s + p.amount, 0) ||
              total;

            const currentDbCust = await db
              .select({ balance_due: customers.balance_due })
              .from(customers)
              .where(eq(customers.id, data.creditCustomerId))
              .limit(1);

            const currentBal = currentDbCust[0]?.balance_due ?? 0;
            const newBal = currentBal + fiadoAmount;

            await db
              .update(customers)
              .set({
                balance_due: newBal,
                updated_at: now,
                is_synced: false,
              })
              .where(eq(customers.id, data.creditCustomerId));

            const txId = uid();
            try {
              await db.insert(customerTransactions).values({
                id: txId,
                customer_id: data.creditCustomerId,
                type: "debito",
                amount: fiadoAmount,
                balance_after: newBal,
                payment_method: "fiado",
                sale_id: saleId,
                order_id: orderId,
                shift_id: state.currentShiftId ?? undefined,
                notes: `Venda ${saleCode} (${data.customer || "Balcão"})`,
                created_at: now,
                updated_at: now,
                is_synced: false,
              });
            } catch (txErr) {
              console.warn("[PosStore]: Erro ao gravar transação de fiado (balcão):", txErr);
            }

            const newTx: CustomerTransaction = {
              id: txId,
              customerId: data.creditCustomerId,
              type: "debito",
              amount: fiadoAmount,
              balanceAfter: newBal,
              paymentMethod: "fiado",
              saleId,
              orderId,
              shiftId: state.currentShiftId ?? undefined,
              notes: `Venda ${saleCode} (${data.customer || "Balcão"})`,
              createdAt: now,
            };

            setState((s) => ({
              ...s,
              customers: s.customers.map((c) =>
                c.id === data.creditCustomerId ? { ...c, balanceDue: newBal } : c,
              ),
              customerTransactions: [newTx, ...s.customerTransactions],
            }));
          }
        }
      },
      moveDelivery: async (id, stage) => {
        const targetOrder = state.delivery.find((o) => o.id === id);
        const now = new Date().toISOString();
        setState((s) => ({
          ...s,
          delivery: s.delivery.map((o) => (o.id === id ? { ...o, stage } : o)),
        }));

        if (isTauri()) {
          await db
            .update(deliveryOrders)
            .set({ stage, updated_at: now, is_synced: false })
            .where(eq(deliveryOrders.id, id));
        }

        // Notifica transições de status à Merchant API do iFood
        if (targetOrder && targetOrder.source === "ifood" && state.ifoodConfig.enabled) {
          try {
            const { accessToken } = await getIfoodAccessToken(state.ifoodConfig);
            if (stage === "prontos") {
              await readyToPickupIfoodOrder(accessToken, id);
            } else if (stage === "entrega") {
              await dispatchIfoodOrder(accessToken, id);
            }
          } catch (apiErr: any) {
            console.warn("[iFood stage sync error]:", apiErr);
          }
        }
      },
      acceptDelivery: async (id) => {
        const targetOrder = state.delivery.find((o) => o.id === id);
        const now = new Date().toISOString();
        setState((s) => ({
          ...s,
          delivery: s.delivery.map((o) =>
            o.id === id ? { ...o, accepted: true, stage: "preparo" } : o,
          ),
        }));

        if (isTauri()) {
          try {
            await db
              .update(deliveryOrders)
              .set({ accepted: true, stage: "preparo", updated_at: now, is_synced: false })
              .where(eq(deliveryOrders.id, id));
          } catch (err) {
            console.error("[acceptDelivery Error]:", err);
          }
        }

        // Se for pedido do iFood, confirma imediatamente na API oficial do iFood (SLA de resposta)
        if (targetOrder && targetOrder.source === "ifood" && state.ifoodConfig.enabled) {
          try {
            const { accessToken } = await getIfoodAccessToken(state.ifoodConfig);
            await confirmIfoodOrder(accessToken, id);
          } catch (confErr: any) {
            console.error("[acceptDelivery iFood Error]:", confErr);
            toast.warning("Pedido aceito localmente, mas a API do iFood retornou aviso:", {
              description: confErr?.message || String(confErr),
            });
          }
        }

        if (targetOrder && state.ifoodConfig.autoPrintKitchen) {
          try {
            await printDeliveryTicket(targetOrder, state.kitchenPrinterConfig);
          } catch (printErr) {
            console.warn("[acceptDelivery]: Falha ao imprimir ticket de delivery:", printErr);
          }
        }
      },
      cancelDeliveryOrder: async (id: string, reasonCode = "502", reasonText = "Item indisponível") => {
        const targetOrder = state.delivery.find((o) => o.id === id);
        if (!targetOrder) return false;

        const now = new Date().toISOString();
        const reason = reasonText || "Cancelado pelo estabelecimento";

        // Se for pedido do iFood, solicita o cancelamento na Merchant API oficial
        if (targetOrder.source === "ifood" && state.ifoodConfig.enabled) {
          try {
            const { accessToken } = await getIfoodAccessToken(state.ifoodConfig);
            await requestIfoodCancellation(accessToken, id, reasonCode, reason);
          } catch (apiErr: any) {
            console.error("[cancelDeliveryOrder iFood Error]:", apiErr);
            toast.error("Erro ao cancelar no iFood: " + (apiErr?.message || apiErr));
            return false;
          }
        }

        const cancelledOrder: DeliveryOrder = {
          ...targetOrder,
          stage: "concluido",
          cancelled: true,
          cancelReason: reason,
          notes: targetOrder.notes ? `${targetOrder.notes} | Cancelado: ${reason}` : `Cancelado: ${reason}`,
        };

        // Remove do Kanban ativo e adiciona ao histórico de entregas do turno
        setState((s) => ({
          ...s,
          delivery: s.delivery.filter((o) => o.id !== id),
          deliveryHistory: [cancelledOrder, ...s.deliveryHistory.filter((o) => o.id !== id)],
        }));

        if (isTauri()) {
          try {
            await db
              .update(deliveryOrders)
              .set({ stage: "concluido", updated_at: now, is_synced: false })
              .where(eq(deliveryOrders.id, id));

            const delivRows = await db
              .select({ order_id: deliveryOrders.order_id })
              .from(deliveryOrders)
              .where(eq(deliveryOrders.id, id))
              .limit(1);

            const internalOrderId = delivRows[0]?.order_id;
            if (internalOrderId) {
              await db
                .update(orders)
                .set({
                  status: "cancelled",
                  notes: cancelledOrder.notes,
                  updated_at: now,
                  is_synced: false,
                })
                .where(eq(orders.id, internalOrderId));
            }
          } catch (err) {
            console.error("[cancelDeliveryOrder DB Error]:", err);
          }
        }

        return true;
      },
      assignCourier: async (id, courier) => {
        const now = new Date().toISOString();
        setState((s) => ({
          ...s,
          delivery: s.delivery.map((o) => (o.id === id ? { ...o, courier } : o)),
        }));

        if (isTauri()) {
          try {
            await db
              .update(deliveryOrders)
              .set({ courier, updated_at: now, is_synced: false })
              .where(eq(deliveryOrders.id, id));
          } catch (err) {
            console.error("[assignCourier Error]:", err);
          }
        }
      },
      finishDeliveryOrder: async (orderId: string) => {
        const order = state.delivery.find((o) => o.id === orderId);
        if (!order) return;

        const now = new Date().toISOString();
        const saleId = crypto.randomUUID();
        const saleCode = `CUP-${1042 + state.sales.length}`;
        const shiftName = state.currentShiftId ? "Turno Atual" : "Turno 1";

        const paymentMethod = order.paymentMethod?.toLowerCase().includes("pix")
          ? "pix"
          : order.paymentMethod?.toLowerCase().includes("credito")
            ? "credito"
            : order.paymentMethod?.toLowerCase().includes("debito")
              ? "debito"
              : "dinheiro";

        const completedSale: Sale = {
          id: saleId,
          code: saleCode,
          createdAt: Date.now(),
          origin: `Delivery (${order.source.toUpperCase()})`,
          items: order.items,
          serviceFee: 0,
          tip: 0,
          discount: 0,
          total: order.total,
          payments: [
            {
              method: paymentMethod,
              amount: order.total,
            },
          ],
          cpf: null,
          shift: shiftName,
          shiftId: state.currentShiftId ?? undefined,
          cancelled: false,
        };

        const finishedOrder: DeliveryOrder = {
          ...order,
          stage: "concluido",
        };

        setState((s) => ({
          ...s,
          delivery: s.delivery.filter((o) => o.id !== orderId),
          deliveryHistory: [finishedOrder, ...s.deliveryHistory.filter((o) => o.id !== orderId)],
          sales: [completedSale, ...s.sales],
        }));

        if (isTauri()) {
          try {
            await db
              .update(deliveryOrders)
              .set({ stage: "concluido", updated_at: now, is_synced: false })
              .where(eq(deliveryOrders.id, orderId));

            // Find internal order id if exists
            const delivRows = await db
              .select({ order_id: deliveryOrders.order_id })
              .from(deliveryOrders)
              .where(eq(deliveryOrders.id, orderId))
              .limit(1);

            const internalOrderId = delivRows[0]?.order_id ?? null;

            await db.insert(sales).values({
              id: saleId,
              order_id: internalOrderId,
              shift_id: state.currentShiftId,
              code: saleCode,
              origin: `Delivery (${order.source.toUpperCase()})`,
              total: order.total,
              subtotal: order.total,
              service_fee: 0,
              tip: 0,
              discount: 0,
              cpf: null,
              credit_customer_id: null,
              courtesy_reason: null,
              cancelled: false,
              is_synced: false,
              created_at: now,
              updated_at: now,
              deleted_at: null,
            });

            await db.insert(payments).values({
              id: crypto.randomUUID(),
              sale_id: saleId,
              method: paymentMethod,
              amount: order.total,
              customer_id: null,
              card_brand: null,
              authorization_code: null,
              is_synced: false,
              created_at: now,
              updated_at: now,
              deleted_at: null,
            });
          } catch (err) {
            console.error("[finishDeliveryOrder Error]:", err);
          }
        }

        toast.success(`Pedido ${order.code} concluído!`, {
          description: `Venda registrada no Histórico (${brl(order.total)})`,
        });
      },
      addDeliveryOrder: async (data) => {
        const id = crypto.randomUUID();
        const nowMs = Date.now();
        const nowIso = new Date().toISOString();

        const isAutoAccept = data.source === "ifood" && state.ifoodConfig.autoAccept;

        const newOrder: DeliveryOrder = {
          ...data,
          id,
          createdAt: nowMs,
          stage: isAutoAccept ? "preparo" : "novos",
          accepted: isAutoAccept,
          courier: data.courier ?? null,
        };

        setState((s) => ({
          ...s,
          delivery: [newOrder, ...s.delivery],
        }));

        if (state.ifoodConfig.soundAlert) {
          playNewOrderSound();
        }

        if (isAutoAccept && state.ifoodConfig.autoPrintKitchen) {
          try {
            await printDeliveryTicket(newOrder, state.kitchenPrinterConfig);
          } catch (err) {
            console.warn("[addDeliveryOrder]: Falha ao auto-imprimir:", err);
          }
        }

        if (isTauri()) {
          try {
            const internalOrderId = crypto.randomUUID();
            const matchedCustomer = state.customers.find(
              (c) =>
                (c.phone &&
                  newOrder.phone &&
                  c.phone.replace(/\D/g, "") === newOrder.phone.replace(/\D/g, "")) ||
                c.name.toLowerCase() === newOrder.customer.toLowerCase(),
            );

            await db.insert(orders).values({
              id: internalOrderId,
              code: newOrder.code,
              type: "delivery",
              table_id: null,
              customer_id: matchedCustomer?.id ?? null,
              customer_name: newOrder.customer,
              operator_id: null,
              shift_id: state.currentShiftId,
              status: "open",
              subtotal: newOrder.total,
              service_fee: 0,
              tip: 0,
              discount: 0,
              total: newOrder.total,
              notes: newOrder.notes ?? null,
              is_synced: false,
              created_at: nowIso,
              updated_at: nowIso,
              deleted_at: null,
            });

            await db.insert(deliveryOrders).values({
              id,
              order_id: internalOrderId,
              source: newOrder.source,
              stage: newOrder.stage,
              bairro: newOrder.bairro,
              delivery_address: newOrder.address ?? null,
              courier: newOrder.courier ?? null,
              accepted: newOrder.accepted,
              estimated_delivery_time: null,
              is_synced: false,
              created_at: nowIso,
              updated_at: nowIso,
              deleted_at: null,
            });

            for (const it of newOrder.items) {
              const itemPrice = it.unitPrice ?? it.price ?? 0;
              const matchedProduct = state.products.find(
                (p) => p.name.toLowerCase() === it.name.toLowerCase() || p.id === it.id,
              );
              await db.insert(orderItems).values({
                id: it.id || crypto.randomUUID(),
                order_id: internalOrderId,
                product_id: matchedProduct?.id ?? null,
                name: it.name,
                qty: it.qty,
                unit_price: itemPrice,
                total_price: itemPrice * it.qty,
                details: it.details ? JSON.stringify(it.details) : null,
                notes: null,
                is_synced: false,
                created_at: nowIso,
                updated_at: nowIso,
                deleted_at: null,
              });
            }
          } catch (err) {
            console.error("[addDeliveryOrder Error]:", err);
          }
        }

        return newOrder;
      },
      simulateIfoodIncomingOrder: async () => {
        const sample = generateSampleIfoodOrder(state.products);
        const id = crypto.randomUUID();
        const nowMs = Date.now();

        const isAutoAccept = state.ifoodConfig.autoAccept;

        const newOrder: DeliveryOrder = {
          ...sample,
          id,
          createdAt: nowMs,
          stage: isAutoAccept ? "preparo" : "novos",
          accepted: isAutoAccept,
          courier: null,
        };

        setState((s) => ({
          ...s,
          delivery: [newOrder, ...s.delivery],
        }));

        await persistDeliveryOrderToDb(newOrder);

        if (state.ifoodConfig.soundAlert) {
          playNewOrderSound();
        }

        if (isAutoAccept && state.ifoodConfig.autoPrintKitchen) {
          try {
            await printDeliveryTicket(newOrder, state.kitchenPrinterConfig);
          } catch (err) {
            console.warn("[simulateIfoodIncomingOrder]: Falha ao auto-imprimir:", err);
          }
        }

        toast.info(`Novo pedido iFood recebido! ${newOrder.code}`, {
          description: `${newOrder.customer} · ${brl(newOrder.total)} (${newOrder.items.length} itens)`,
        });

        return newOrder;
      },
      pollIfoodNow: async () => {
        const config = state.ifoodConfig;
        if (!config?.enabled) {
          return { success: false, eventsCount: 0, message: "iFood desativado nas configurações." };
        }
        if (!config.clientId?.trim() || !config.clientSecret?.trim() || !config.merchantId?.trim()) {
          return {
            success: false,
            eventsCount: 0,
            message: "Preencha Client ID, Client Secret e Merchant ID nas configurações.",
          };
        }

        setState((s) => ({ ...s, ifoodPollingStatus: "polling" }));

        try {
          const { accessToken } = await getIfoodAccessToken(config, true);
          const events = await pollIfoodEvents(config, accessToken);
          const now = Date.now();

          if (events.length === 0) {
            setState((s) => ({
              ...s,
              ifoodLastPoll: now,
              ifoodPollingStatus: "connected",
              ifoodLastPollMessage: "Nenhum novo evento na fila do iFood.",
            }));
            return { success: true, eventsCount: 0, message: "Nenhum novo pedido na fila do iFood." };
          }

          const acknowledgedIds: string[] = [];
          let newOrdersCount = 0;

          for (const evt of events) {
            if (evt.code === "PLC" || evt.fullCode === "PLACED") {
              try {
                const alreadyExists = state.delivery.some(
                  (d) => d.id === evt.orderId || d.code.includes(evt.orderId.slice(0, 4)),
                );

                if (!alreadyExists) {
                  const rawOrder = await fetchIfoodOrderDetails(accessToken, evt.orderId);
                  const deliveryOrder = convertIfoodApiOrderToDelivery(rawOrder, state.products);

                  const isAutoAccept = config.autoAccept;
                  if (isAutoAccept) {
                    try {
                      await confirmIfoodOrder(accessToken, evt.orderId);
                      deliveryOrder.stage = "preparo";
                      deliveryOrder.accepted = true;
                    } catch (confErr) {
                      console.warn("[iFood Poll Now] Erro auto-confirmar:", confErr);
                    }
                  }

                  setState((s) => ({
                    ...s,
                    delivery: [deliveryOrder, ...s.delivery],
                  }));

                  await persistDeliveryOrderToDb(deliveryOrder);

                  if (config.soundAlert) {
                    playNewOrderSound();
                  }

                  if (isAutoAccept && config.autoPrintKitchen) {
                    try {
                      await printDeliveryTicket(deliveryOrder, state.kitchenPrinterConfig);
                    } catch (printErr) {
                      console.warn("[iFood Poll Now] Falha ao auto-imprimir:", printErr);
                    }
                  }

                  toast.info(`Novo Pedido iFood recebido! ${deliveryOrder.code}`, {
                    description: `${deliveryOrder.customer} · ${brl(deliveryOrder.total)} (${deliveryOrder.items.length} itens)`,
                  });
                  newOrdersCount++;
                }

                acknowledgedIds.push(evt.id);
              } catch (orderErr) {
                console.error("[iFood Poll Now] Erro ao processar pedido:", evt.orderId, orderErr);
                acknowledgedIds.push(evt.id);
              }
            } else if (evt.code === "CAN" || evt.fullCode === "CANCELLED") {
              const cancelNotes = "Cancelado pelo cliente/iFood";
              const nowIso = new Date().toISOString();

              setState((s) => {
                const existing = s.delivery.find((d) => d.id === evt.orderId);
                const updatedObj: DeliveryOrder = existing
                  ? {
                      ...existing,
                      stage: "concluido",
                      cancelled: true,
                      cancelReason: cancelNotes,
                      notes: existing.notes ? `${existing.notes} | ${cancelNotes}` : cancelNotes,
                    }
                  : {
                      id: evt.orderId,
                      code: `#${evt.orderId.slice(0, 4)}`,
                      source: "ifood",
                      customer: "Cliente iFood",
                      bairro: "Delivery",
                      total: 0,
                      createdAt: Date.now(),
                      stage: "concluido",
                      courier: null,
                      accepted: false,
                      items: [],
                      cancelled: true,
                      cancelReason: cancelNotes,
                    };

                return {
                  ...s,
                  delivery: s.delivery.filter((d) => d.id !== evt.orderId),
                  deliveryHistory: [updatedObj, ...s.deliveryHistory.filter((d) => d.id !== evt.orderId)],
                };
              });

              if (isTauri()) {
                try {
                  await db
                    .update(deliveryOrders)
                    .set({ stage: "concluido", updated_at: nowIso, is_synced: false })
                    .where(eq(deliveryOrders.id, evt.orderId));

                  const delivRows = await db
                    .select({ order_id: deliveryOrders.order_id })
                    .from(deliveryOrders)
                    .where(eq(deliveryOrders.id, evt.orderId))
                    .limit(1);

                  if (delivRows[0]?.order_id) {
                    await db
                      .update(orders)
                      .set({ status: "cancelled", notes: cancelNotes, updated_at: nowIso, is_synced: false })
                      .where(eq(orders.id, delivRows[0].order_id));
                  }
                } catch (dbErr) {
                  console.error("[iFood CAN persist error]:", dbErr);
                }
              }

              acknowledgedIds.push(evt.id);
              toast.warning("Pedido iFood cancelado pelo cliente/loja", {
                description: `ID: #${evt.orderId.slice(0, 4)}`,
              });
            } else {
              acknowledgedIds.push(evt.id);
            }
          }

          if (acknowledgedIds.length > 0) {
            await acknowledgeIfoodEvents(accessToken, acknowledgedIds);
          }

          setState((s) => ({
            ...s,
            ifoodLastPoll: now,
            ifoodPollingStatus: "connected",
            ifoodLastPollMessage: `${events.length} evento(s) verificado(s).`,
          }));

          return {
            success: true,
            eventsCount: newOrdersCount,
            message: `${newOrdersCount} novo(s) pedido(s) baixado(s) com sucesso.`,
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          setState((s) => ({
            ...s,
            ifoodPollingStatus: "error",
            ifoodLastPollMessage: msg,
          }));
          return { success: false, eventsCount: 0, message: msg };
        }
      },
      toggleIfood: async () => {
        const nextState = !state.ifoodPaused;
        setState((s) => ({ ...s, ifoodPaused: nextState }));

        if (isTauri()) {
          try {
            const now = new Date().toISOString();
            const rows = await db
              .select()
              .from(appSettings)
              .where(and(eq(appSettings.key, "ifood_paused"), isNull(appSettings.deleted_at)))
              .limit(1);

            if (rows[0]) {
              await db
                .update(appSettings)
                .set({
                  value: JSON.stringify(nextState),
                  updated_at: now,
                  is_synced: false,
                })
                .where(eq(appSettings.id, rows[0].id));
            } else {
              await db.insert(appSettings).values({
                id: crypto.randomUUID(),
                key: "ifood_paused",
                value: JSON.stringify(nextState),
                is_synced: false,
                created_at: now,
                updated_at: now,
                deleted_at: null,
              });
            }
          } catch (err) {
            console.error("[toggleIfood Error]:", err);
          }
        }
      },
      updateIfoodConfig: async (config: IfoodConfig) => {
        setState((s) => ({ ...s, ifoodConfig: config }));

        if (isTauri()) {
          try {
            const now = new Date().toISOString();
            const rows = await db
              .select()
              .from(appSettings)
              .where(and(eq(appSettings.key, "ifood_config"), isNull(appSettings.deleted_at)))
              .limit(1);

            if (rows[0]) {
              await db
                .update(appSettings)
                .set({
                  value: JSON.stringify(config),
                  updated_at: now,
                  is_synced: false,
                })
                .where(eq(appSettings.id, rows[0].id));
            } else {
              await db.insert(appSettings).values({
                id: crypto.randomUUID(),
                key: "ifood_config",
                value: JSON.stringify(config),
                is_synced: false,
                created_at: now,
                updated_at: now,
                deleted_at: null,
              });
            }
          } catch (err) {
            console.error("[updateIfoodConfig Error]:", err);
          }
        }
      },
      addMovement: async (type, amount, reason) => {
        const now = new Date().toISOString();
        const movementId = crypto.randomUUID();
        const newMov: CashMovement = {
          id: movementId,
          type,
          amount,
          reason,
          at: Date.now(),
        };

        setState((s) => ({ ...s, movements: [newMov, ...s.movements] }));

        if (isTauri()) {
          await db.insert(cashMovements).values({
            id: movementId,
            shift_id: state.currentShiftId,
            type,
            amount,
            reason,
            at: now,
            is_synced: false,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          });
        }
      },
      closeRegister: async (counted) => {
        const now = new Date().toISOString();
        const shiftId = state.currentShiftId;
        const diff = counted - cashInDrawer;

        if (isTauri() && shiftId) {
          try {
            await db
              .update(cashShifts)
              .set({
                status: "closed",
                closed_at: now,
                closing_counted: counted,
                closing_expected: cashInDrawer,
                closing_difference: diff,
                updated_at: now,
                is_synced: false,
              })
              .where(eq(cashShifts.id, shiftId));
          } catch (err) {
            console.error("[closeRegister Error]:", err);
          }
        }

        const freshClosedShifts = isTauri()
          ? await loadClosedShifts()
          : [
              {
                id: shiftId || crypto.randomUUID(),
                operatorName: state.user || "Operador",
                name: "Turno 1",
                status: "closed" as const,
                openedAt: new Date(Date.now() - 8 * 3600000).toISOString(),
                closedAt: now,
                openingFloat: state.openingFloat,
                closingCounted: counted,
                closingExpected: cashInDrawer,
                closingDifference: diff,
              },
              ...state.closedShifts,
            ];

        setState((s) => ({
          ...s,
          shiftOpen: false,
          user: null,
          currentShiftId: null,
          openingFloat: 0,
          movements: [],
          closedShifts: freshClosedShifts,
        }));
      },
      toggleSoldOut: async (productId) => {
        const prod = state.products.find((p) => p.id === productId);
        if (!prod) return;
        const newStatus = !prod.soldOut;
        const now = new Date().toISOString();

        setState((s) => ({
          ...s,
          products: s.products.map((p) => (p.id === productId ? { ...p, soldOut: newStatus } : p)),
        }));

        if (isTauri()) {
          await db
            .update(products)
            .set({
              sold_out: newStatus,
              updated_at: now,
              is_synced: false,
            })
            .where(eq(products.id, productId));
        }
      },
      updateProductCustomization: async (productId, config) => {
        const now = new Date().toISOString();
        setState((s) => ({
          ...s,
          products: s.products.map((p) =>
            p.id === productId ? { ...p, customization: config } : p,
          ),
        }));

        if (isTauri()) {
          try {
            const settingsRows = await db
              .select()
              .from(appSettings)
              .where(
                and(eq(appSettings.key, "catalog_customizations"), isNull(appSettings.deleted_at)),
              )
              .limit(1);

            let customMap: Record<string, ProductCustomization> = {};
            if (settingsRows[0]?.value) {
              try {
                customMap = JSON.parse(settingsRows[0].value);
              } catch (err) {
                console.error("Failed to parse catalog_customizations:", err);
              }
            }
            customMap[productId] = config;

            if (settingsRows[0]) {
              await db
                .update(appSettings)
                .set({
                  value: JSON.stringify(customMap),
                  updated_at: now,
                  is_synced: false,
                })
                .where(eq(appSettings.id, settingsRows[0].id));
            } else {
              await db.insert(appSettings).values({
                id: crypto.randomUUID(),
                key: "catalog_customizations",
                value: JSON.stringify(customMap),
                is_synced: false,
                created_at: now,
                updated_at: now,
                deleted_at: null,
              });
            }
          } catch (err) {
            console.error("[updateProductCustomization Error]:", err);
          }
        }
      },
      toggleAddonAvailability: async (addonName) => {
        const now = new Date().toISOString();
        let targetNewStatus: boolean | undefined;

        setState((s) => {
          const updated = s.products.map((p) => {
            if (!p.customization?.addons?.length) return p;
            const hasAddon = p.customization.addons.some(
              (a) => a.name.toLowerCase() === addonName.toLowerCase(),
            );
            if (!hasAddon) return p;

            const updatedAddons = p.customization.addons.map((a) => {
              if (a.name.toLowerCase() === addonName.toLowerCase()) {
                const newAvailable = a.available === false;
                if (targetNewStatus === undefined) targetNewStatus = newAvailable;
                return { ...a, available: targetNewStatus };
              }
              return a;
            });

            return {
              ...p,
              customization: {
                ...p.customization,
                addons: updatedAddons,
              },
            };
          });

          return { ...s, products: updated };
        });

        if (isTauri()) {
          try {
            const settingsRows = await db
              .select()
              .from(appSettings)
              .where(
                and(eq(appSettings.key, "catalog_customizations"), isNull(appSettings.deleted_at)),
              )
              .limit(1);

            let customMap: Record<string, ProductCustomization> = {};
            if (settingsRows[0]?.value) {
              try {
                customMap = JSON.parse(settingsRows[0].value);
              } catch (err) {
                console.error("Failed to parse catalog_customizations:", err);
              }
            }

            for (const [, conf] of Object.entries(customMap)) {
              if (conf.addons?.length) {
                conf.addons = conf.addons.map((a) => {
                  if (a.name.toLowerCase() === addonName.toLowerCase()) {
                    return { ...a, available: targetNewStatus ?? false };
                  }
                  return a;
                });
              }
            }

            if (settingsRows[0]) {
              await db
                .update(appSettings)
                .set({
                  value: JSON.stringify(customMap),
                  updated_at: now,
                  is_synced: false,
                })
                .where(eq(appSettings.id, settingsRows[0].id));
            } else {
              await db.insert(appSettings).values({
                id: crypto.randomUUID(),
                key: "catalog_customizations",
                value: JSON.stringify(customMap),
                is_synced: false,
                created_at: now,
                updated_at: now,
                deleted_at: null,
              });
            }
          } catch (err) {
            console.error("[toggleAddonAvailability Error]:", err);
          }
        }
      },
      updateKitchenPrinterConfig: async (config: KitchenPrinterConfig) => {
        setState((s) => ({ ...s, kitchenPrinterConfig: config }));

        if (isTauri()) {
          try {
            const now = new Date().toISOString();
            const settingsRows = await db
              .select()
              .from(appSettings)
              .where(
                and(eq(appSettings.key, "kitchen_printer_config"), isNull(appSettings.deleted_at)),
              )
              .limit(1);

            if (settingsRows[0]) {
              await db
                .update(appSettings)
                .set({
                  value: JSON.stringify(config),
                  updated_at: now,
                  is_synced: false,
                })
                .where(eq(appSettings.id, settingsRows[0].id));
            } else {
              await db.insert(appSettings).values({
                id: crypto.randomUUID(),
                key: "kitchen_printer_config",
                value: JSON.stringify(config),
                is_synced: false,
                created_at: now,
                updated_at: now,
                deleted_at: null,
              });
            }
          } catch (err) {
            console.error("[updateKitchenPrinterConfig Error]:", err);
          }
        }
      },
      updateCounterPrinterConfig: async (config: CounterPrinterConfig) => {
        setState((s) => ({ ...s, counterPrinterConfig: config }));

        if (isTauri()) {
          try {
            const now = new Date().toISOString();
            const settingsRows = await db
              .select()
              .from(appSettings)
              .where(
                and(eq(appSettings.key, "counter_printer_config"), isNull(appSettings.deleted_at)),
              )
              .limit(1);

            if (settingsRows[0]) {
              await db
                .update(appSettings)
                .set({
                  value: JSON.stringify(config),
                  updated_at: now,
                  is_synced: false,
                })
                .where(eq(appSettings.id, settingsRows[0].id));
            } else {
              await db.insert(appSettings).values({
                id: crypto.randomUUID(),
                key: "counter_printer_config",
                value: JSON.stringify(config),
                is_synced: false,
                created_at: now,
                updated_at: now,
                deleted_at: null,
              });
            }
          } catch (err) {
            console.error("[updateCounterPrinterConfig Error]:", err);
          }
        }
      },
      cancelSale: async (saleId) => {
        const now = new Date().toISOString();
        const sale = state.sales.find((s) => s.id === saleId);

        setState((s) => ({
          ...s,
          sales: s.sales.map((item) => (item.id === saleId ? { ...item, cancelled: true } : item)),
        }));

        if (isTauri()) {
          await db
            .update(sales)
            .set({
              cancelled: true,
              cancelled_at: now,
              updated_at: now,
              is_synced: false,
            })
            .where(eq(sales.id, saleId));

          // Se a venda cancelada foi a prazo (fiado) para um cliente, subtrai do saldo devedor
          if (sale?.creditCustomerId) {
            const fiadoAmount =
              sale.payments
                .filter((p) => p.method === "fiado")
                .reduce((sum, p) => sum + p.amount, 0) || sale.total;

            const currentDbCust = await db
              .select({ balance_due: customers.balance_due })
              .from(customers)
              .where(eq(customers.id, sale.creditCustomerId))
              .limit(1);

            const currentBal = currentDbCust[0]?.balance_due ?? 0;
            const newBal = Math.max(0, currentBal - fiadoAmount);

            await db
              .update(customers)
              .set({
                balance_due: newBal,
                updated_at: now,
                is_synced: false,
              })
              .where(eq(customers.id, sale.creditCustomerId));

            const txId = uid();
            try {
              await db.insert(customerTransactions).values({
                id: txId,
                customer_id: sale.creditCustomerId,
                type: "estorno",
                amount: fiadoAmount,
                balance_after: newBal,
                payment_method: "estorno",
                sale_id: saleId,
                shift_id: state.currentShiftId ?? undefined,
                notes: `Cancelamento de Venda #${sale.code}`,
                created_at: now,
                updated_at: now,
                is_synced: false,
              });
            } catch (txErr) {
              console.warn("[PosStore]: Erro ao gravar estorno de fiado:", txErr);
            }

            const estornoTx: CustomerTransaction = {
              id: txId,
              customerId: sale.creditCustomerId,
              type: "estorno",
              amount: fiadoAmount,
              balanceAfter: newBal,
              paymentMethod: "estorno",
              saleId,
              shiftId: state.currentShiftId ?? undefined,
              notes: `Cancelamento de Venda #${sale.code}`,
              createdAt: now,
            };

            setState((s) => ({
              ...s,
              customers: s.customers.map((c) =>
                c.id === sale.creditCustomerId ? { ...c, balanceDue: newBal } : c,
              ),
              customerTransactions: [estornoTx, ...s.customerTransactions],
            }));
          }
        }
      },
      addCustomer: async (data) => {
        const now = new Date().toISOString();
        const id = crypto.randomUUID();
        const customer: Customer = {
          id,
          name: data.name,
          phone: data.phone,
          address: data.address || "",
          email: data.email || "",
          balanceDue: 0,
          cpf: data.cpf || undefined,
          creditLimit: data.creditLimit || 0,
          notes: data.notes || undefined,
          isBlocked: Boolean(data.isBlocked),
          createdAt: now,
        };

        setState((s) => ({ ...s, customers: [customer, ...s.customers] }));

        if (isTauri()) {
          await db.insert(customers).values({
            id,
            name: customer.name,
            phone: customer.phone,
            address: customer.address,
            email: customer.email,
            cpf: customer.cpf || null,
            credit_limit: customer.creditLimit || 0,
            balance_due: 0,
            notes: customer.notes || null,
            is_blocked: customer.isBlocked ? true : false,
            is_synced: false,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          });
        }

        return customer;
      },
      updateCustomer: async (customerId, data) => {
        const now = new Date().toISOString();
        if (isTauri()) {
          await db
            .update(customers)
            .set({
              ...(data.name !== undefined && { name: data.name }),
              ...(data.phone !== undefined && { phone: data.phone }),
              ...(data.address !== undefined && { address: data.address }),
              ...(data.email !== undefined && { email: data.email }),
              ...(data.cpf !== undefined && { cpf: data.cpf }),
              ...(data.creditLimit !== undefined && { credit_limit: data.creditLimit }),
              ...(data.notes !== undefined && { notes: data.notes }),
              ...(data.isBlocked !== undefined && { is_blocked: data.isBlocked ? true : false }),
              updated_at: now,
              is_synced: false,
            })
            .where(eq(customers.id, customerId));
        }

        let updatedCustomer: Customer | null = null;
        setState((s) => {
          const list = s.customers.map((c) => {
            if (c.id === customerId) {
              updatedCustomer = { ...c, ...data };
              return updatedCustomer;
            }
            return c;
          });
          return { ...s, customers: list };
        });

        return updatedCustomer || (data as Customer);
      },
      deleteCustomer: async (customerId) => {
        const customer = state.customers.find((c) => c.id === customerId);
        if (customer && (customer.balanceDue ?? 0) > 0) {
          throw new Error(
            `Não é possível excluir ${customer.name} pois há saldo devedor em aberto de ${brl(customer.balanceDue ?? 0)}. Realize a baixa antes de remover.`,
          );
        }

        const now = new Date().toISOString();
        if (isTauri()) {
          await db
            .update(customers)
            .set({
              deleted_at: now,
              updated_at: now,
              is_synced: false,
            })
            .where(eq(customers.id, customerId));
        }

        setState((s) => ({
          ...s,
          customers: s.customers.filter((c) => c.id !== customerId),
        }));

        return true;
      },
      receiveCustomerPayment: async (data: {
        customerId: string;
        amount: number;
        paymentMethod: string;
        notes?: string | undefined;
      }) => {
        const now = new Date().toISOString();
        const txId = uid();
        const customer = state.customers.find((c) => c.id === data.customerId);
        const currentBal = customer?.balanceDue ?? 0;
        const newBal = Math.max(0, currentBal - data.amount);

        if (isTauri()) {
          await db
            .update(customers)
            .set({
              balance_due: newBal,
              updated_at: now,
              is_synced: false,
            })
            .where(eq(customers.id, data.customerId));

          await db.insert(customerTransactions).values({
            id: txId,
            customer_id: data.customerId,
            type: "credito",
            amount: data.amount,
            balance_after: newBal,
            payment_method: data.paymentMethod,
            shift_id: state.currentShiftId ?? undefined,
            notes: data.notes?.trim() || `Pagamento/Quitação via ${data.paymentMethod.toUpperCase()}`,
            created_at: now,
            updated_at: now,
            is_synced: false,
          });

          // Se pago em dinheiro, registra movimento de entrada no caixa
          if (data.paymentMethod.toLowerCase() === "dinheiro" && state.currentShiftId) {
            const movId = uid();
            await db.insert(cashMovements).values({
              id: movId,
              shift_id: state.currentShiftId,
              type: "suprimento",
              amount: data.amount,
              reason: `Recebimento Fiado - ${customer?.name || "Cliente"}`,
              at: now,
              created_at: now,
              updated_at: now,
              is_synced: false,
            });

            setState((s) => ({
              ...s,
              movements: [
                ...s.movements,
                {
                  id: movId,
                  type: "suprimento",
                  amount: data.amount,
                  reason: `Recebimento Fiado - ${customer?.name || "Cliente"}`,
                  at: Date.now(),
                },
              ],
            }));
          }
        }

        const newTx: CustomerTransaction = {
          id: txId,
          customerId: data.customerId,
          type: "credito",
          amount: data.amount,
          balanceAfter: newBal,
          paymentMethod: data.paymentMethod,
          shiftId: state.currentShiftId ?? undefined,
          notes: data.notes?.trim() || `Pagamento/Quitação via ${data.paymentMethod.toUpperCase()}`,
          createdAt: now,
        };

        setState((s) => ({
          ...s,
          customers: s.customers.map((c) =>
            c.id === data.customerId ? { ...c, balanceDue: newBal } : c,
          ),
          customerTransactions: [newTx, ...s.customerTransactions],
        }));

        return newTx;
      },
      factoryReset: async () => {
        if (!isTauri()) {
          setState((s) => ({
            ...s,
            tables: [],
            products: [],
            customers: [],
            couriers: [],
            delivery: [],
            sales: [],
            movements: [],
            shiftOpen: false,
            user: null,
          }));
          return;
        }

        const client = await (await import("@/database/db")).getDbClient();
        if (!client) return;

        // Limpeza ordenada em lote para respeitar chaves estrangeiras
        const tablesToClear = [
          "payments",
          "sales",
          "order_items",
          "delivery_orders",
          "orders",
          "cash_movements",
          "cash_shifts",
          "product_modifiers",
          "modifier_groups",
          "products",
          "product_categories",
          "customers",
          "dining_tables",
          "couriers",
          "users",
          "app_settings",
        ];

        for (const t of tablesToClear) {
          try {
            await client.execute(`DELETE FROM ${t}`);
          } catch (e) {
            console.error(`Erro ao limpar tabela ${t}:`, e);
          }
        }

        // Recria o usuário operador padrão para permitir novo login
        const now = new Date().toISOString();
        await client.execute(
          `INSERT INTO users (id, name, pin, role, active, is_synced, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
          [crypto.randomUUID(), "Marina R.", "1234", "operator", 1, now, now],
        );

        toast.success("Banco de dados SQLite zerado com sucesso!");

        // Recarrega os dados locais
        await loadDatabaseData();
      },
    };
  }, [state, loadDatabaseData]);

  return <PosContext.Provider value={api}>{children}</PosContext.Provider>;
}

export function usePos() {
  const ctx = useContext(PosContext);
  if (!ctx) throw new Error("usePos deve ser usado dentro de PosProvider");
  return ctx;
}

export type { OpenModal };
