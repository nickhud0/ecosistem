import { relations, type InferInsertModel, type InferSelectModel } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// ============================================================================
// REGRAS OFFLINE-FIRST:
// 1. Chaves Primárias: UUID em texto gerados no cliente (crypto.randomUUID())
// 2. Sincronização: created_at, updated_at, deleted_at e is_synced em TODAS as tabelas
// ============================================================================

/**
 * 1. Operadores de Caixa, Gerentes e Garçons
 */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(), // UUID gerado no cliente
  name: text("name").notNull(),
  pin: text("pin").notNull(), // PIN para teclado numérico do PDV
  role: text("role").notNull().default("operator"), // "operator" | "manager" | "waiter"
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  is_synced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  deleted_at: text("deleted_at"),
});

/**
 * 2. Turnos de Caixa (Abertura com Fundo de Troco e Fechamento Cego)
 */
export const cashShifts = sqliteTable("cash_shifts", {
  id: text("id").primaryKey(),
  operator_id: text("operator_id").references(() => users.id),
  operator_name: text("operator_name").notNull(),
  name: text("name").notNull(), // ex: "Turno 1", "Turno Noite"
  status: text("status").notNull().default("open"), // "open" | "closed"
  opened_at: text("opened_at").notNull(),
  closed_at: text("closed_at"),
  opening_float: real("opening_float").notNull().default(0), // Fundo de troco inicial em R$
  closing_counted: real("closing_counted"), // Total contado pelo operador na contagem cega
  closing_expected: real("closing_expected"), // Saldo calculado pelo sistema
  closing_difference: real("closing_difference"), // Sobra (+) ou Falta (-) de caixa
  closing_notes: text("closing_notes"),
  is_synced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  deleted_at: text("deleted_at"),
});

/**
 * 3. Movimentações Financeiras da Gaveta (Suprimentos, Sangrias, Aberturas)
 */
export const cashMovements = sqliteTable("cash_movements", {
  id: text("id").primaryKey(),
  shift_id: text("shift_id").references(() => cashShifts.id),
  operator_id: text("operator_id").references(() => users.id),
  type: text("type").notNull(), // "abertura" | "suprimento" | "sangria" | "venda"
  amount: real("amount").notNull(),
  reason: text("reason").notNull(),
  at: text("at").notNull(),
  is_synced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  deleted_at: text("deleted_at"),
});

/**
 * 4. Categorias de Produtos
 */
export const productCategories = sqliteTable("product_categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  sort_order: integer("sort_order").notNull().default(0),
  is_synced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  deleted_at: text("deleted_at"),
});

/**
 * 5. Produtos do Cardápio / PDV
 */
export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  category_id: text("category_id").references(() => productCategories.id),
  category_name: text("category_name").notNull(),
  name: text("name").notNull(),
  price: real("price").notNull(),
  emoji: text("emoji").notNull(),
  sold_out: integer("sold_out", { mode: "boolean" }).notNull().default(false), // Controle 86
  is_synced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  deleted_at: text("deleted_at"),
});

/**
 * 6. Grupos de Modificadores (Adicionais, Exclusões, Sabores Fracionados)
 */
export const modifierGroups = sqliteTable("modifier_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(), // "Exclusões", "Adicionais", "Sabores de Pizza"
  type: text("type").notNull(), // "addon" | "exclusion" | "flavor" | "note"
  min_selectable: integer("min_selectable").notNull().default(0),
  max_selectable: integer("max_selectable").notNull().default(0), // 0 = sem limite
  is_synced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  deleted_at: text("deleted_at"),
});

/**
 * 7. Opções de Modificadores / Adicionais
 */
export const productModifiers = sqliteTable("product_modifiers", {
  id: text("id").primaryKey(),
  group_id: text("group_id").references(() => modifierGroups.id),
  name: text("name").notNull(), // "Bacon", "Sem molho", "Calabresa"
  price: real("price").notNull().default(0),
  available: integer("available", { mode: "boolean" }).notNull().default(true),
  is_synced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  deleted_at: text("deleted_at"),
});

/**
 * 8. Clientes (Delivery, Balcão e Fiado / A Prazo)
 */
export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  address: text("address"),
  email: text("email"),
  cpf: text("cpf"),
  credit_limit: real("credit_limit").default(0),
  balance_due: real("balance_due").default(0), // Saldo devedor fiado
  notes: text("notes"),
  is_blocked: integer("is_blocked", { mode: "boolean" }).default(false),
  is_synced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  deleted_at: text("deleted_at"),
});

/**
 * 9. Mesas do Salão
 */
export const diningTables = sqliteTable("dining_tables", {
  id: text("id").primaryKey(),
  number: integer("number").notNull().unique(),
  seats: integer("seats").notNull().default(4),
  status: text("status").notNull().default("livre"), // "livre" | "ocupada" | "conta"
  waiter: text("waiter").notNull().default("Equipe"),
  opened_at: text("opened_at"),
  discount_type: text("discount_type"), // "percent" | "value"
  discount_amount: real("discount_amount"),
  merged_with: text("merged_with"), // Array JSON com números das mesas agrupadas
  is_synced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  deleted_at: text("deleted_at"),
});

/**
 * 10. Comandas e Pedidos Unificados (Mesa, Balcão, Delivery)
 */
export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  code: text("code").notNull(), // "#8241", "MESA-02", "BALCAO-01"
  type: text("type").notNull(), // "table" | "counter" | "delivery"
  table_id: text("table_id").references(() => diningTables.id),
  customer_id: text("customer_id").references(() => customers.id),
  customer_name: text("customer_name"),
  operator_id: text("operator_id").references(() => users.id),
  shift_id: text("shift_id").references(() => cashShifts.id),
  status: text("status").notNull().default("open"), // "open" | "pending_payment" | "completed" | "cancelled"
  subtotal: real("subtotal").notNull().default(0),
  service_fee: real("service_fee").notNull().default(0),
  tip: real("tip").notNull().default(0),
  discount: real("discount").notNull().default(0),
  total: real("total").notNull().default(0),
  notes: text("notes"),
  is_synced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  deleted_at: text("deleted_at"),
});

/**
 * 11. Pedidos de Delivery Omnichannel (iFood, WhatsApp, Telefone)
 */
export const deliveryOrders = sqliteTable("delivery_orders", {
  id: text("id").primaryKey(),
  order_id: text("order_id")
    .references(() => orders.id)
    .notNull()
    .unique(),
  source: text("source").notNull(), // "ifood" | "whatsapp" | "telefone"
  stage: text("stage").notNull().default("novos"), // "novos" | "preparo" | "prontos" | "entrega"
  bairro: text("bairro").notNull(),
  delivery_address: text("delivery_address"),
  courier: text("courier"), // Motoboy atribuído
  accepted: integer("accepted", { mode: "boolean" }).notNull().default(false),
  estimated_delivery_time: text("estimated_delivery_time"),
  is_synced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  deleted_at: text("deleted_at"),
});

/**
 * 12. Itens dos Pedidos e Comandas
 */
export const orderItems = sqliteTable("order_items", {
  id: text("id").primaryKey(),
  order_id: text("order_id")
    .references(() => orders.id)
    .notNull(),
  product_id: text("product_id").references(() => products.id),
  name: text("name").notNull(),
  qty: real("qty").notNull().default(1),
  unit_price: real("unit_price").notNull(),
  total_price: real("total_price").notNull(),
  details: text("details"), // JSON array de strings: ["Sem cebola", "Adicional de Bacon...", "Meia Calabresa..."]
  notes: text("notes"),
  is_synced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  deleted_at: text("deleted_at"),
});

/**
 * 13. Cupons de Venda / Transações Fiscais Fechadas
 */
export const sales = sqliteTable("sales", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(), // "CUP-1041"
  order_id: text("order_id").references(() => orders.id),
  shift_id: text("shift_id").references(() => cashShifts.id),
  origin: text("origin").notNull(), // "Mesa 05", "Balcão", "Delivery #8229"
  customer_id: text("customer_id").references(() => customers.id),
  cpf: text("cpf"), // CPF na nota (NFC-e)
  subtotal: real("subtotal").notNull().default(0),
  service_fee: real("service_fee").notNull().default(0),
  tip: real("tip").notNull().default(0),
  discount: real("discount").notNull().default(0),
  total: real("total").notNull().default(0),
  cancelled: integer("cancelled", { mode: "boolean" }).notNull().default(false),
  cancelled_at: text("cancelled_at"),
  cancel_reason: text("cancel_reason"),
  credit_customer_id: text("credit_customer_id").references(() => customers.id),
  courtesy_reason: text("courtesy_reason"),
  is_synced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  deleted_at: text("deleted_at"),
});

/**
 * 14. Pagamentos e Múltiplas Formas de Pagamento
 */
export const payments = sqliteTable("payments", {
  id: text("id").primaryKey(),
  sale_id: text("sale_id")
    .references(() => sales.id)
    .notNull(),
  method: text("method").notNull(), // "pix" | "credito" | "debito" | "dinheiro" | "fiado" | "cortesia"
  amount: real("amount").notNull(),
  change_amount: real("change_amount").default(0), // Troco devolvido
  customer_id: text("customer_id").references(() => customers.id),
  card_brand: text("card_brand"),
  authorization_code: text("authorization_code"),
  is_synced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  deleted_at: text("deleted_at"),
});

/**
 * 15. Configurações Locais e Estado do Aplicativo
 */
export const appSettings = sqliteTable("app_settings", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(), // "ifood_paused" | "theme" | "printer_settings"
  value: text("value").notNull(),
  is_synced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  deleted_at: text("deleted_at"),
});

/**
 * 16. Entregadores / Motoboys
 */
export const couriers = sqliteTable("couriers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  is_active: integer("is_active", { mode: "boolean" }).notNull().default(true),
  is_synced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at").notNull(),
  deleted_at: text("deleted_at"),
});

/**
 * 17. Transações e Movimentações da Conta Fiado do Cliente
 */
export const customerTransactions = sqliteTable("customer_transactions", {
  id: text("id").primaryKey(),
  customer_id: text("customer_id")
    .references(() => customers.id)
    .notNull(),
  type: text("type").notNull(), // "debito" (compra a prazo) | "credito" (pagamento/baixa) | "estorno"
  amount: real("amount").notNull(),
  balance_after: real("balance_after").notNull(),
  payment_method: text("payment_method"), // "dinheiro" | "pix" | "debito" | "credito" (quando for quitação)
  sale_id: text("sale_id").references(() => sales.id),
  order_id: text("order_id").references(() => orders.id),
  shift_id: text("shift_id").references(() => cashShifts.id),
  notes: text("notes"),
  created_at: text("created_at").notNull(),
  updated_at: text("updated_at"),
  is_synced: integer("is_synced", { mode: "boolean" }).notNull().default(false),
  deleted_at: text("deleted_at"),
});

// ============================================================================
// RELACIONAMENTOS (Drizzle Relations)
// ============================================================================

export const usersRelations = relations(users, ({ many }) => ({
  shifts: many(cashShifts),
  movements: many(cashMovements),
  orders: many(orders),
}));

export const cashShiftsRelations = relations(cashShifts, ({ one, many }) => ({
  operator: one(users, {
    fields: [cashShifts.operator_id],
    references: [users.id],
  }),
  movements: many(cashMovements),
  orders: many(orders),
  sales: many(sales),
}));

export const cashMovementsRelations = relations(cashMovements, ({ one }) => ({
  shift: one(cashShifts, {
    fields: [cashMovements.shift_id],
    references: [cashShifts.id],
  }),
  operator: one(users, {
    fields: [cashMovements.operator_id],
    references: [users.id],
  }),
}));

export const productCategoriesRelations = relations(productCategories, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(productCategories, {
    fields: [products.category_id],
    references: [productCategories.id],
  }),
  orderItems: many(orderItems),
}));

export const modifierGroupsRelations = relations(modifierGroups, ({ many }) => ({
  modifiers: many(productModifiers),
}));

export const productModifiersRelations = relations(productModifiers, ({ one }) => ({
  group: one(modifierGroups, {
    fields: [productModifiers.group_id],
    references: [modifierGroups.id],
  }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  orders: many(orders),
  sales: many(sales),
  payments: many(payments),
  transactions: many(customerTransactions),
}));

export const customerTransactionsRelations = relations(customerTransactions, ({ one }) => ({
  customer: one(customers, {
    fields: [customerTransactions.customer_id],
    references: [customers.id],
  }),
  sale: one(sales, {
    fields: [customerTransactions.sale_id],
    references: [sales.id],
  }),
  order: one(orders, {
    fields: [customerTransactions.order_id],
    references: [orders.id],
  }),
  shift: one(cashShifts, {
    fields: [customerTransactions.shift_id],
    references: [cashShifts.id],
  }),
}));

export const diningTablesRelations = relations(diningTables, ({ many }) => ({
  orders: many(orders),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  table: one(diningTables, {
    fields: [orders.table_id],
    references: [diningTables.id],
  }),
  customer: one(customers, {
    fields: [orders.customer_id],
    references: [customers.id],
  }),
  shift: one(cashShifts, {
    fields: [orders.shift_id],
    references: [cashShifts.id],
  }),
  delivery: one(deliveryOrders, {
    fields: [orders.id],
    references: [deliveryOrders.order_id],
  }),
  items: many(orderItems),
  sale: one(sales, {
    fields: [orders.id],
    references: [sales.order_id],
  }),
}));

export const deliveryOrdersRelations = relations(deliveryOrders, ({ one }) => ({
  order: one(orders, {
    fields: [deliveryOrders.order_id],
    references: [orders.id],
  }),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.order_id],
    references: [orders.id],
  }),
  product: one(products, {
    fields: [orderItems.product_id],
    references: [products.id],
  }),
}));

export const salesRelations = relations(sales, ({ one, many }) => ({
  order: one(orders, {
    fields: [sales.order_id],
    references: [orders.id],
  }),
  shift: one(cashShifts, {
    fields: [sales.shift_id],
    references: [cashShifts.id],
  }),
  customer: one(customers, {
    fields: [sales.customer_id],
    references: [customers.id],
  }),
  creditCustomer: one(customers, {
    fields: [sales.credit_customer_id],
    references: [customers.id],
  }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  sale: one(sales, {
    fields: [payments.sale_id],
    references: [sales.id],
  }),
  customer: one(customers, {
    fields: [payments.customer_id],
    references: [customers.id],
  }),
}));

// ============================================================================
// TIPAGEM INFERIDA (TypeScript Models)
// ============================================================================

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type CashShift = InferSelectModel<typeof cashShifts>;
export type NewCashShift = InferInsertModel<typeof cashShifts>;

export type CashMovementRecord = InferSelectModel<typeof cashMovements>;
export type NewCashMovementRecord = InferInsertModel<typeof cashMovements>;

export type ProductCategory = InferSelectModel<typeof productCategories>;
export type NewProductCategory = InferInsertModel<typeof productCategories>;

export type DbProduct = InferSelectModel<typeof products>;
export type NewDbProduct = InferInsertModel<typeof products>;

export type ModifierGroup = InferSelectModel<typeof modifierGroups>;
export type NewModifierGroup = InferInsertModel<typeof modifierGroups>;

export type DbProductModifier = InferSelectModel<typeof productModifiers>;
export type NewDbProductModifier = InferInsertModel<typeof productModifiers>;

export type DbCustomer = InferSelectModel<typeof customers>;
export type NewDbCustomer = InferInsertModel<typeof customers>;

export type DbDiningTable = InferSelectModel<typeof diningTables>;
export type NewDbDiningTable = InferInsertModel<typeof diningTables>;

export type DbOrder = InferSelectModel<typeof orders>;
export type NewDbOrder = InferInsertModel<typeof orders>;

export type DbDeliveryOrder = InferSelectModel<typeof deliveryOrders>;
export type NewDbDeliveryOrder = InferInsertModel<typeof deliveryOrders>;

export type DbOrderItem = InferSelectModel<typeof orderItems>;
export type NewDbOrderItem = InferInsertModel<typeof orderItems>;

export type DbSale = InferSelectModel<typeof sales>;
export type NewDbSale = InferInsertModel<typeof sales>;

export type DbPayment = InferSelectModel<typeof payments>;
export type NewDbPayment = InferInsertModel<typeof payments>;

export type AppSetting = InferSelectModel<typeof appSettings>;
export type NewAppSetting = InferInsertModel<typeof appSettings>;

export type DbCourier = InferSelectModel<typeof couriers>;
export type NewDbCourier = InferInsertModel<typeof couriers>;

export type DbCustomerTransaction = InferSelectModel<typeof customerTransactions>;
export type NewDbCustomerTransaction = InferInsertModel<typeof customerTransactions>;
