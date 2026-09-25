import { useCallback, useEffect, useState } from "react";
import { and, eq, isNull } from "drizzle-orm";
import { db, ensureDatabase, isTauri } from "@/database/db";
import {
  appSettings,
  productCategories,
  products,
  type DbProduct,
  type ProductCategory,
} from "@/database/schema";
import {
  getDefaultCustomizationForProduct,
  type Product,
  type ProductCustomization,
} from "@/lib/pos-types";

// Cache compartilhado em memória para carregamento instantâneo (0ms) entre telas e diálogos
let cachedProducts: Product[] | null = null;
let cachedCategories: string[] = ["Todos"];
let cachedCategoryEntities: ProductCategory[] = [];
let isFetchingGlobal = false;
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignora erro em listener desmontado
    }
  });
}

export function useProducts() {
  const [data, setData] = useState<Product[]>(() => cachedProducts ?? []);
  const [categories, setCategories] = useState<string[]>(() => cachedCategories);
  const [categoryEntities, setCategoryEntities] = useState<ProductCategory[]>(() => cachedCategoryEntities);
  const [isLoading, setIsLoading] = useState(() => cachedProducts === null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const updateFromCache = () => {
      if (cachedProducts) {
        setData(cachedProducts);
        setCategories(cachedCategories);
        setCategoryEntities(cachedCategoryEntities);
        setIsLoading(false);
      }
    };
    listeners.add(updateFromCache);
    return () => {
      listeners.delete(updateFromCache);
    };
  }, []);

  const fetchProducts = useCallback(async (force = false) => {
    if (isFetchingGlobal && !force) return;
    if (cachedProducts === null) {
      setIsLoading(true);
    }
    setError(null);
    isFetchingGlobal = true;
    try {
      if (!isTauri()) {
        setData([]);
        setCategories(["Todos"]);
        setIsLoading(false);
        isFetchingGlobal = false;
        return;
      }

      // Garante que o schema DDL e o seed inicial foram aplicados
      await ensureDatabase();

      // 1. Busca categorias ativas
      const dbCategories = await db
        .select()
        .from(productCategories)
        .where(isNull(productCategories.deleted_at))
        .orderBy(productCategories.sort_order);

      // 2. Busca produtos ativos e customizações
      const dbProducts = await db.select().from(products).where(isNull(products.deleted_at));

      let customMap: Record<string, ProductCustomization> = {};
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
        console.warn("[useProducts]: Erro ao ler catalog_customizations:", err);
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

      const catList = dbCategories.length
        ? dbCategories.map((c) => c.name)
        : Array.from(new Set(mappedProducts.map((p) => p.category)));

      const nextCategories = ["Todos", ...catList];

      cachedProducts = mappedProducts;
      cachedCategories = nextCategories;
      cachedCategoryEntities = dbCategories;

      setData(mappedProducts);
      setCategoryEntities(dbCategories);
      setCategories(nextCategories);
      notifyListeners();
    } catch (err) {
      console.error("[useProducts Error]:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
      if (cachedProducts === null) {
        setData([]);
      }
    } finally {
      setIsLoading(false);
      isFetchingGlobal = false;
    }
  }, []);

  useEffect(() => {
    // Se ainda não temos cache, busca imediatamente. Se já temos, busca em segundo plano sem travar a interface
    if (cachedProducts === null) {
      fetchProducts();
    }
  }, [fetchProducts]);

  const toggleSoldOut = useCallback(
    async (productId: string) => {
      try {
        const prod = data.find((p) => p.id === productId);
        if (!prod) return;

        const newStatus = !prod.soldOut;
        const now = new Date().toISOString();

        // Atualização otimista no cache e na interface
        if (cachedProducts) {
          cachedProducts = cachedProducts.map((p) =>
            p.id === productId ? { ...p, soldOut: newStatus } : p,
          );
        }

        setData((current) =>
          current.map((p) => (p.id === productId ? { ...p, soldOut: newStatus } : p)),
        );
        notifyListeners();

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
      } catch (err) {
        console.error("[useProducts toggleSoldOut Error]:", err);
        fetchProducts(true);
      }
    },
    [data, fetchProducts],
  );

  const addCategory = useCallback(
    async (name: string) => {
      const now = new Date().toISOString();
      const catName = name.trim();
      if (!catName) return;

      if (isTauri()) {
        await ensureDatabase();

        const existingList = await db
          .select()
          .from(productCategories)
          .where(eq(productCategories.name, catName));

        const existing = existingList[0];

        if (existing) {
          if (existing.deleted_at !== null) {
            await db
              .update(productCategories)
              .set({
                deleted_at: null,
                updated_at: now,
                is_synced: false,
              })
              .where(eq(productCategories.id, existing.id));

            setCategoryEntities((curr) =>
              curr.some((c) => c.id === existing.id)
                ? curr.map((c) => (c.id === existing.id ? { ...c, deleted_at: null } : c))
                : [...curr, { ...existing, deleted_at: null }],
            );
            setCategories((curr) => (curr.includes(catName) ? curr : [...curr, catName]));
          }
          return;
        }

        const newId = crypto.randomUUID();
        const newCat: ProductCategory = {
          id: newId,
          name: catName,
          sort_order: categoryEntities.length,
          is_synced: false,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        };

        await db.insert(productCategories).values(newCat);
        setCategoryEntities((curr) => [...curr, newCat]);
        setCategories((curr) => (curr.includes(catName) ? curr : [...curr, catName]));
      } else {
        const newId = crypto.randomUUID();
        const newCat: ProductCategory = {
          id: newId,
          name: catName,
          sort_order: categoryEntities.length,
          is_synced: false,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        };

        setCategoryEntities((curr) => [...curr, newCat]);
        setCategories((curr) => (curr.includes(catName) ? curr : [...curr, catName]));
      }
    },
    [categoryEntities.length],
  );

  const updateProductCustomization = useCallback(
    async (productId: string, config: ProductCustomization) => {
      const now = new Date().toISOString();
      setData((curr) =>
        curr.map((p) => (p.id === productId ? { ...p, customization: config } : p)),
      );

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
          console.error("[useProducts updateProductCustomization Error]:", err);
        }
      }
    },
    [],
  );

  const addProduct = useCallback(
    async (params: {
      name: string;
      price: number;
      categoryName: string;
      emoji?: string;
      customization?: ProductCustomization;
    }) => {
      const now = new Date().toISOString();
      const newId = crypto.randomUUID();
      const categoryMatch = categoryEntities.find((c) => c.name === params.categoryName);
      const customConfig =
        params.customization ?? getDefaultCustomizationForProduct(params.name, params.categoryName);

      const newDbProduct: DbProduct = {
        id: newId,
        category_id: categoryMatch?.id ?? null,
        category_name: params.categoryName,
        name: params.name.trim(),
        price: params.price,
        emoji: params.emoji || "🍽️",
        sold_out: false,
        is_synced: false,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      };

      const newProductObj: Product = {
        id: newId,
        name: newDbProduct.name,
        price: newDbProduct.price,
        category: newDbProduct.category_name,
        emoji: newDbProduct.emoji,
        soldOut: false,
        customization: customConfig,
      };

      if (cachedProducts) {
        cachedProducts = [...cachedProducts, newProductObj];
      }

      setData((curr) => [...curr, newProductObj]);
      notifyListeners();

      if (isTauri()) {
        await db.insert(products).values(newDbProduct);
        if (params.customization) {
          await updateProductCustomization(newId, params.customization);
        }
      }

      return newDbProduct;
    },
    [categoryEntities, updateProductCustomization],
  );

  const updateProduct = useCallback(
    async (
      productId: string,
      updates: {
        name?: string;
        price?: number;
        categoryName?: string;
        emoji?: string;
        customization?: ProductCustomization;
      },
    ) => {
      const now = new Date().toISOString();
      const categoryMatch = updates.categoryName
        ? categoryEntities.find((c) => c.name === updates.categoryName)
        : undefined;

      const mapper = (p: Product) =>
        p.id === productId
          ? {
              ...p,
              name: updates.name !== undefined ? updates.name : p.name,
              price: updates.price !== undefined ? updates.price : p.price,
              category: updates.categoryName !== undefined ? updates.categoryName : p.category,
              emoji: updates.emoji !== undefined ? updates.emoji : p.emoji,
              customization:
                updates.customization !== undefined ? updates.customization : p.customization,
            }
          : p;

      if (cachedProducts) {
        cachedProducts = cachedProducts.map(mapper);
      }
      setData((curr) => curr.map(mapper));
      notifyListeners();

      if (isTauri()) {
        await db
          .update(products)
          .set({
            ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
            ...(updates.price !== undefined ? { price: updates.price } : {}),
            ...(updates.categoryName !== undefined
              ? { category_name: updates.categoryName, category_id: categoryMatch?.id ?? null }
              : {}),
            ...(updates.emoji !== undefined ? { emoji: updates.emoji } : {}),
            updated_at: now,
            is_synced: false,
          })
          .where(eq(products.id, productId));

        if (updates.customization) {
          await updateProductCustomization(productId, updates.customization);
        }
      }
    },
    [categoryEntities, updateProductCustomization],
  );

  const deleteProduct = useCallback(async (productId: string) => {
    const now = new Date().toISOString();
    if (cachedProducts) {
      cachedProducts = cachedProducts.filter((p) => p.id !== productId);
    }
    setData((curr) => curr.filter((p) => p.id !== productId));
    notifyListeners();

    if (isTauri()) {
      await db
        .update(products)
        .set({
          deleted_at: now,
          updated_at: now,
          is_synced: false,
        })
        .where(eq(products.id, productId));
    }
  }, []);

  return {
    products: data,
    categories,
    categoryEntities,
    isLoading,
    error,
    refetch: fetchProducts,
    toggleSoldOut,
    addCategory,
    addProduct,
    updateProduct,
    updateProductCustomization,
    deleteProduct,
  };
}
