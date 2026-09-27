export type TableStatus = "livre" | "ocupada" | "conta";

export type OrderItem = {
  id: string;
  orderId?: string;
  productId?: string | null;
  name: string;
  qty: number;
  unitPrice: number;
  totalPrice?: number;
  details?: string[];
  notes?: string;
  sentToKitchen?: boolean;
  kitchenRound?: number;
  originTableNumber?: number;
  createdAt?: string;
};

export type TableT = {
  id: string;
  orderId?: string | null;
  number: number;
  seats: number;
  waiter: string;
  status: TableStatus;
  openedAt: number | null;
  items: OrderItem[];
  discount: { type: "percent" | "value"; amount: number } | null;
  mergedWith: number[];
  updatedAt?: string;
};

export type ProductCategory = {
  id: string;
  name: string;
  sortOrder: number;
};

export type ProductModifier = {
  id: string;
  groupId: string;
  name: string;
  price: number;
  available: boolean;
};

export type ModifierGroup = {
  id: string;
  name: string;
  type: string;
  minSelectable: number;
  maxSelectable: number;
  modifiers?: ProductModifier[];
};

export type ProductCustomization = {
  allowCustomization: boolean;
  exclusions: string[];
  addons: { id: string; name: string; price: number; available?: boolean }[];
  isPizza?: boolean;
  pizzaFlavors?: { name: string; price: number }[];
  meatDoneness?: string[];
  quickNotes?: string[];
};

export type Product = {
  id: string;
  name: string;
  price: number;
  category: string;
  categoryId?: string | null;
  emoji: string;
  soldOut: boolean;
  exclusions?: string[];
  addons?: { id: string; name: string; price: number }[];
  customization?: ProductCustomization;
};

export type UserWaiter = {
  id: string;
  name: string;
  pin: string;
  role: "waiter" | "operator" | "admin";
  active: boolean;
};

export type PaymentMethod = "pix" | "credito" | "debito" | "dinheiro" | "fiado";

export type Payment = {
  id?: string;
  method: PaymentMethod;
  amount: number;
  changeAmount?: number;
  customerId?: string;
  cardBrand?: string;
  authorizationCode?: string;
  timestamp?: number;
};

export type Customer = {
  id: string;
  name: string;
  phone: string;
  cpf?: string;
  balanceDue?: number;
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  pix: "PIX",
  credito: "Cartão Crédito",
  debito: "Cartão Débito",
  dinheiro: "Dinheiro",
  fiado: "Conta / Fiado",
};

export const STATUS_LABELS: Record<TableStatus, string> = {
  livre: "Livre",
  ocupada: "Ocupada",
  conta: "Pediu a Conta",
};
