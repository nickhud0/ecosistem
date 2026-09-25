import type Database from "@tauri-apps/plugin-sql";

/**
 * Seed inicial para ambiente Offline-First no SQLite local.
 * Garante que IDs sejam UUIDs gerados no cliente e que todas as tabelas
 * possuam timestamps nos campos de sincronização e soft-delete.
 */
export async function runSeed(client: Database): Promise<void> {
  const now = new Date().toISOString();

  // 1. Operador padrão para autenticação por PIN
  const existingUsers = await client.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL",
  );
  if ((existingUsers[0]?.count ?? 0) === 0) {
    await client.execute(
      `INSERT INTO users (id, name, pin, role, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [crypto.randomUUID(), "Marina R.", "1234", "operator", 1, now, now],
    );
  }

  // 2. Categorias e Produtos do cardápio
  const existingProducts = await client.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM products WHERE deleted_at IS NULL",
  );

  if ((existingProducts[0]?.count ?? 0) === 0) {
    const categoriesData = [
      { name: "Lanches", sort_order: 0 },
      { name: "Bebidas", sort_order: 1 },
      { name: "Pratos", sort_order: 2 },
      { name: "Entradas", sort_order: 3 },
      { name: "Sobremesas", sort_order: 4 },
      { name: "Balcão", sort_order: 5 },
    ];

    const categoryMap = new Map<string, string>();

    for (const cat of categoriesData) {
      const catId = crypto.randomUUID();
      categoryMap.set(cat.name, catId);
      await client.execute(
        `INSERT INTO product_categories (id, name, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET updated_at = excluded.updated_at`,
        [catId, cat.name, cat.sort_order, now, now],
      );
    }

    // 3. Produtos (com categoria, preço, emoji e flag sold_out)
    const productsData = [
      { name: "X-Bacon", price: 38.0, category: "Lanches", emoji: "🍔", soldOut: 0 },
      { name: "X-Burger Especial", price: 32.0, category: "Lanches", emoji: "🍔", soldOut: 0 },
      { name: "Combo Burger + Fritas", price: 58.0, category: "Lanches", emoji: "🍟", soldOut: 0 },
      { name: "Coca-Cola Lata", price: 8.0, category: "Bebidas", emoji: "🥤", soldOut: 0 },
      { name: "Suco de Laranja 400ml", price: 12.0, category: "Bebidas", emoji: "🍊", soldOut: 0 },
      { name: "Chopp Artesanal 500ml", price: 18.0, category: "Bebidas", emoji: "🍺", soldOut: 0 },
      { name: "Água Mineral com Gás", price: 6.0, category: "Bebidas", emoji: "💧", soldOut: 0 },
      { name: "Vinho Tinto (Taça)", price: 24.0, category: "Bebidas", emoji: "🍷", soldOut: 0 },
      { name: "Picanha na Chapa 300g", price: 89.0, category: "Pratos", emoji: "🥩", soldOut: 0 },
      { name: "Risoto de Camarão", price: 68.0, category: "Pratos", emoji: "🍤", soldOut: 0 },
      { name: "Feijoada Completa", price: 52.0, category: "Pratos", emoji: "🍲", soldOut: 0 },
      { name: "Pizza Margherita", price: 52.0, category: "Pratos", emoji: "🍕", soldOut: 0 },
      { name: "Batata Frita Rústica", price: 26.0, category: "Entradas", emoji: "🍟", soldOut: 0 },
      {
        name: "Bolinho de Bacalhau (6 un)",
        price: 38.0,
        category: "Entradas",
        emoji: "🐟",
        soldOut: 1,
      },
      { name: "Pão de Alho Especial", price: 22.0, category: "Entradas", emoji: "🥖", soldOut: 0 },
      {
        name: "Pudim de Leite Condensado",
        price: 15.0,
        category: "Sobremesas",
        emoji: "🍮",
        soldOut: 0,
      },
      {
        name: "Petit Gâteau com Sorvete",
        price: 28.0,
        category: "Sobremesas",
        emoji: "🍫",
        soldOut: 0,
      },
      {
        name: "Cheesecake de Frutas Vermelhas",
        price: 26.0,
        category: "Sobremesas",
        emoji: "🍰",
        soldOut: 0,
      },
    ];

    for (const prod of productsData) {
      const categoryId = categoryMap.get(prod.category) ?? null;
      await client.execute(
        `INSERT INTO products (id, category_id, category_name, name, price, emoji, sold_out, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          categoryId,
          prod.category,
          prod.name,
          prod.price,
          prod.emoji,
          prod.soldOut,
          now,
          now,
        ],
      );
    }
  }

  // 4. Mesas do salão (12 mesas estruturadas)
  const existingTables = await client.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM dining_tables",
  );

  if ((existingTables[0]?.count ?? 0) === 0) {
    const tablesData = [
      { number: 1, seats: 4, status: "livre", waiter: "Equipe", openedAt: null },
      { number: 2, seats: 4, status: "livre", waiter: "Equipe", openedAt: null },
      { number: 3, seats: 6, status: "livre", waiter: "Equipe", openedAt: null },
      { number: 4, seats: 4, status: "livre", waiter: "Equipe", openedAt: null },
      { number: 5, seats: 2, status: "livre", waiter: "Equipe", openedAt: null },
      { number: 6, seats: 4, status: "livre", waiter: "Equipe", openedAt: null },
      { number: 7, seats: 4, status: "livre", waiter: "Equipe", openedAt: null },
      { number: 8, seats: 6, status: "livre", waiter: "Equipe", openedAt: null },
      { number: 9, seats: 4, status: "livre", waiter: "Equipe", openedAt: null },
      { number: 10, seats: 8, status: "livre", waiter: "Equipe", openedAt: null },
      { number: 11, seats: 2, status: "livre", waiter: "Equipe", openedAt: null },
      { number: 12, seats: 4, status: "livre", waiter: "Equipe", openedAt: null },
    ];

    for (const tbl of tablesData) {
      await client.execute(
        `INSERT INTO dining_tables (id, number, seats, status, waiter, opened_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(number) DO NOTHING`,
        [
          crypto.randomUUID(),
          tbl.number,
          tbl.seats,
          tbl.status,
          tbl.waiter,
          tbl.openedAt,
          now,
          now,
        ],
      );
    }
  }

  // 5. Clientes iniciais para teste de delivery e fiado
  const existingCustomers = await client.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM customers WHERE deleted_at IS NULL",
  );

  if ((existingCustomers[0]?.count ?? 0) === 0) {
    const sampleCustomers = [
      {
        name: "Camila Souza",
        phone: "(11) 98888-1204",
        address: "Rua das Flores, 120 - Centro",
        email: "camila@email.com",
        balance_due: 0,
      },
      {
        name: "Rodrigo Lima",
        phone: "(11) 97721-4430",
        address: "Av. Paulista, 1500 - Bela Vista",
        email: "rodrigo@email.com",
        balance_due: 64.0,
      },
    ];

    for (const c of sampleCustomers) {
      await client.execute(
        `INSERT INTO customers (id, name, phone, address, email, balance_due, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), c.name, c.phone, c.address, c.email, c.balance_due, now, now],
      );
    }
  }

  // 6. Entregadores / Motoboys iniciais para delivery
  const existingCouriers = await client.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM couriers WHERE deleted_at IS NULL",
  );

  if ((existingCouriers[0]?.count ?? 0) === 0) {
    const sampleCouriers = [
      { name: "Marcos Silva", phone: "(11) 97123-4567" },
      { name: "Júlia Mendes", phone: "(11) 98234-5678" },
      { name: "Tiago Rocha", phone: "(11) 99345-6789" },
    ];

    for (const courier of sampleCouriers) {
      await client.execute(
        `INSERT INTO couriers (id, name, phone, is_active, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)`,
        [crypto.randomUUID(), courier.name, courier.phone, now, now],
      );
    }
  }

  console.info("[Database Seed]: Seed inicial concluído com sucesso!");
}
