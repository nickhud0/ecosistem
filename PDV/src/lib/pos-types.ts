export type TableStatus = "livre" | "ocupada" | "conta";

export type OrderItem = {
  id: string;
  name: string;
  qty: number;
  unitPrice: number;
  price?: number | undefined;
  details?: string[] | undefined;
  sentToKitchen?: boolean | undefined;
  kitchenRound?: number | undefined;
  sentAt?: number | undefined;
  originTableNumber?: number | undefined;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  address: string;
  email: string;
  balanceDue?: number | undefined;
  cpf?: string | undefined;
  creditLimit?: number | undefined;
  notes?: string | undefined;
  isBlocked?: boolean | undefined;
  createdAt?: string | undefined;
};

export type CustomerTransactionType = "debito" | "credito" | "estorno";

export type CustomerTransaction = {
  id: string;
  customerId: string;
  type: CustomerTransactionType;
  amount: number;
  balanceAfter: number;
  paymentMethod?: string | undefined;
  saleId?: string | undefined;
  orderId?: string | undefined;
  shiftId?: string | undefined;
  notes?: string | undefined;
  createdAt: string;
  itemsSummary?: { name: string; qty: number; unitPrice: number }[] | undefined;
};

export type TableT = {
  id: string;
  number: number;
  seats: number;
  waiter: string;
  status: TableStatus;
  openedAt: number | null;
  items: OrderItem[];
  discount: { type: "percent" | "value"; amount: number } | null;
  mergedWith: number[];
};

export type ProductAddon = {
  id: string;
  name: string;
  price: number;
  available?: boolean | undefined;
};

export type PizzaFlavor = {
  name: string;
  price: number;
};

export type ProductCustomization = {
  allowCustomization: boolean;
  exclusions: string[];
  addons: ProductAddon[];
  isPizza?: boolean | undefined;
  pizzaFlavors?: PizzaFlavor[] | undefined;
};

export type Product = {
  id: string;
  name: string;
  price: number;
  category: string;
  emoji: string;
  soldOut: boolean;
  customization?: ProductCustomization | undefined;
};

export type DeliverySource = "ifood" | "whatsapp" | "telefone";
export type DeliveryStage = "novos" | "preparo" | "prontos" | "entrega" | "concluido";

export type DeliveryOrder = {
  id: string;
  code: string;
  source: DeliverySource;
  customer: string;
  phone?: string | undefined;
  address?: string | undefined;
  bairro: string;
  total: number;
  createdAt: number;
  stage: DeliveryStage;
  courier: string | null;
  accepted: boolean;
  items: OrderItem[];
  notes?: string | undefined;
  paymentMethod?: string | undefined;
  cancelled?: boolean | undefined;
  cancelReason?: string | undefined;
};

export type PaymentMethod = "pix" | "credito" | "debito" | "dinheiro" | "fiado" | "cortesia";

export type Payment = {
  method: PaymentMethod;
  amount: number;
  customerId?: string | undefined;
};

export type Sale = {
  id: string;
  code: string;
  createdAt: number;
  origin: string;
  items: OrderItem[];
  serviceFee: number;
  tip: number;
  discount: number;
  total: number;
  payments: Payment[];
  cpf: string | null;
  creditCustomerId?: string | undefined;
  courtesyReason?: string | undefined;
  shift: string;
  shiftId?: string | undefined;
  cancelled: boolean;
};

export type DbShiftRecord = {
  id: string;
  operatorName: string;
  name: string;
  status: "open" | "closed";
  openedAt: string;
  closedAt: string | null;
  openingFloat: number;
  closingCounted: number | null;
  closingExpected: number | null;
  closingDifference: number | null;
  closingNotes?: string | null | undefined;
};

export type ShiftSummaryData = {
  shiftName: string;
  operatorName: string;
  openedAt: number | string;
  closedAt?: number | string | undefined;
  openingFloat: number;
  cashSales: number;
  supplies: number;
  bleeds: number;
  cashRefunds: number;
  expectedCash: number;
  countedCash?: number | undefined;
  difference?: number | undefined;
  salesByMethod: Partial<Record<PaymentMethod, number>>;
  totalSalesAmount: number;
  totalSalesCount: number;
};

export type CashMovement = {
  id: string;
  type: "abertura" | "suprimento" | "sangria" | "venda";
  amount: number;
  reason: string;
  at: number;
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  pix: "PIX",
  credito: "Crédito",
  debito: "Débito",
  dinheiro: "Dinheiro",
  fiado: "A Prazo/Fiado",
  cortesia: "Cortesia",
};

export const SOURCE_META: Record<DeliverySource, { label: string; dot: string; badge: string }> = {
  ifood: { label: "iFood", dot: "bg-ifood", badge: "text-ifood bg-ifood/15" },
  whatsapp: { label: "WhatsApp", dot: "bg-whats", badge: "text-whats bg-whats/15" },
  telefone: { label: "Telefone", dot: "bg-fone", badge: "text-fone bg-fone/15" },
};

export const STAGE_LABELS: Record<DeliveryStage, string> = {
  novos: "Novos",
  preparo: "Em Preparo",
  prontos: "Prontos",
  entrega: "Saiu para Entrega",
  concluido: "Concluído",
};

export const DEFAULT_CATEGORY_CUSTOMIZATIONS: Record<string, ProductCustomization> = {
  Lanches: {
    allowCustomization: true,
    exclusions: ["Sem cebola", "Sem tomate", "Sem molho", "Sem queijo", "Sem picles"],
    addons: [
      { id: "addon-bacon", name: "Bacon", price: 4, available: true },
      { id: "addon-queijo", name: "Queijo extra", price: 5, available: true },
      { id: "addon-ovo", name: "Ovo", price: 3, available: true },
      { id: "addon-molho", name: "Molho especial", price: 2.5, available: true },
      { id: "addon-hamb", name: "Hambúrguer extra 150g", price: 10, available: true },
    ],
    isPizza: false,
  },
  Pratos: {
    allowCustomization: true,
    exclusions: ["Sem azeitona", "Sem orégano", "Sem cebola"],
    addons: [
      { id: "addon-borda", name: "Borda Recheada Catupiry", price: 10, available: true },
      { id: "addon-queijo-pizza", name: "Queijo extra", price: 6, available: true },
      { id: "addon-bacon-pizza", name: "Bacon crocante", price: 5, available: true },
    ],
    isPizza: true,
    pizzaFlavors: [
      { name: "Margherita", price: 52 },
      { name: "Calabresa", price: 58 },
      { name: "Quatro Queijos", price: 64 },
      { name: "Portuguesa", price: 62 },
    ],
  },
  Entradas: {
    allowCustomization: true,
    exclusions: ["Sem sal"],
    addons: [
      { id: "addon-cheddar", name: "Cheddar cremoso", price: 6, available: true },
      { id: "addon-bacon-cubos", name: "Bacon em cubos", price: 5, available: true },
    ],
    isPizza: false,
  },
  Sobremesas: {
    allowCustomization: true,
    exclusions: [],
    addons: [
      { id: "addon-sorvete", name: "Bola de sorvete extra", price: 6, available: true },
      { id: "addon-calda", name: "Calda de chocolate extra", price: 4, available: true },
    ],
    isPizza: false,
  },
  Bebidas: {
    allowCustomization: false,
    exclusions: [],
    addons: [],
    isPizza: false,
  },
  Balcão: {
    allowCustomization: false,
    exclusions: [],
    addons: [],
    isPizza: false,
  },
};

export function getDefaultCustomizationForProduct(
  productName: string,
  categoryName: string,
): ProductCustomization {
  const isPizza = productName.toLowerCase().includes("pizza");
  if (isPizza) {
    return {
      allowCustomization: true,
      exclusions: ["Sem azeitona", "Sem orégano", "Sem cebola"],
      addons: [
        { id: "addon-borda", name: "Borda Recheada Catupiry", price: 10, available: true },
        { id: "addon-queijo-pizza", name: "Queijo extra", price: 6, available: true },
        { id: "addon-bacon-pizza", name: "Bacon crocante", price: 5, available: true },
      ],
      isPizza: true,
      pizzaFlavors: [
        { name: "Margherita", price: 52 },
        { name: "Calabresa", price: 58 },
        { name: "Quatro Queijos", price: 64 },
        { name: "Portuguesa", price: 62 },
      ],
    };
  }

  const catDefault = DEFAULT_CATEGORY_CUSTOMIZATIONS[categoryName];
  if (catDefault) {
    return {
      allowCustomization: catDefault.allowCustomization,
      exclusions: [...catDefault.exclusions],
      addons: catDefault.addons.map((a) => ({ ...a })),
      isPizza: Boolean(catDefault.isPizza),
      pizzaFlavors: catDefault.pizzaFlavors?.map((f) => ({ ...f })),
    };
  }

  return {
    allowCustomization: false,
    exclusions: [],
    addons: [],
    isPizza: false,
  };
}
