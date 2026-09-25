import { useCallback, useEffect, useState } from "react";
import { isSupabaseReady, supabase } from "@/lib/supabase";
import type { MenuCategory, MenuItem, RestaurantInfo } from "@/lib/types";
import {
  INITIAL_CATEGORIES,
  INITIAL_PRODUCTS,
  INITIAL_RESTAURANT_INFO,
} from "@/lib/initial-data";

const CACHE_KEY = "fluxo_cardapio_cache_v3";

interface CachedData {
  products: MenuItem[];
  categories: MenuCategory[];
  restaurantInfo: RestaurantInfo;
  timestamp: number;
}

function getStoredCache(): CachedData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveCache(data: {
  products: MenuItem[];
  categories: MenuCategory[];
  restaurantInfo: RestaurantInfo;
}) {
  if (typeof window === "undefined") return;
  try {
    const payload: CachedData = {
      ...data,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Modo anônimo restritivo
  }
}

export function useMenu() {
  const initialCache = getStoredCache();

  const [products, setProducts] = useState<MenuItem[]>(
    () => initialCache?.products ?? INITIAL_PRODUCTS
  );
  const [categories, setCategories] = useState<MenuCategory[]>(
    () => initialCache?.categories ?? INITIAL_CATEGORIES
  );
  const [restaurantInfo, setRestaurantInfo] = useState<RestaurantInfo>(
    () => initialCache?.restaurantInfo ?? INITIAL_RESTAURANT_INFO
  );
  const [isReady, setIsReady] = useState(true);

  // Busca silenciosa e segura em segundo plano (com timeout de 5 segundos para nunca travar a tela)
  const syncWithSupabase = useCallback(async () => {
    if (!isSupabaseReady || !supabase) return;

    try {
      const timeoutPromise = new Promise<{ error: Error }>((_, reject) =>
        setTimeout(() => reject(new Error("Supabase fetch timeout")), 5000)
      );

      const fetchPromise = Promise.all([
        supabase
          .from("product_categories")
          .select("id, name, sort_order")
          .is("deleted_at", null)
          .order("sort_order", { ascending: true }),
        supabase
          .from("products")
          .select("id, name, price, category_name, category_id, emoji, sold_out, created_at")
          .is("deleted_at", null)
          .order("name", { ascending: true }),
        supabase
          .from("app_settings")
          .select("key, value")
          .in("key", ["restaurant_name", "restaurant_info", "ifood_config"])
          .is("deleted_at", null),
      ]);

      const [categoriesRes, productsRes, settingsRes] = (await Promise.race([
        fetchPromise,
        timeoutPromise,
      ])) as [any, any, any];

      setCategories((prevCategories) => {
        let nextCategories = prevCategories;

        if (!categoriesRes.error && categoriesRes.data && categoriesRes.data.length > 0) {
          nextCategories = categoriesRes.data.map((c: any) => ({
            id: c.id,
            name: c.name,
            sort_order: c.sort_order ?? 0,
          }));
        }

        setProducts((prevProducts) => {
          let nextProducts = prevProducts;

          if (!productsRes.error && productsRes.data && productsRes.data.length > 0) {
            const initialMap = new Map(INITIAL_PRODUCTS.map((p) => [p.name.toLowerCase(), p]));

            nextProducts = productsRes.data.map((p: any) => {
              const matchInitial = initialMap.get(p.name?.toLowerCase() || "");
              return {
                id: p.id,
                name: p.name,
                price: Number(p.price) || 0,
                category_name: p.category_name || "Outros",
                category_id: p.category_id,
                emoji: p.emoji || matchInitial?.emoji || "🍽️",
                sold_out: Boolean(p.sold_out),
                // Dados do banco sobrepõem o mock; fallback enriquece os itens conhecidos
                description: p.description || matchInitial?.description || undefined,
                details: p.details || matchInitial?.details || undefined,
                created_at: p.created_at,
              };
            });

            // Harmonização Dinâmica: Garante que qualquer nova categoria criada junto ao produto apareça no menu
            const knownCategoryNames = new Set(nextCategories.map((c) => c.name));
            for (const p of nextProducts) {
              if (p.category_name && !knownCategoryNames.has(p.category_name)) {
                knownCategoryNames.add(p.category_name);
                nextCategories = [
                  ...nextCategories,
                  {
                    id: p.category_id || `cat-dyn-${p.category_name}`,
                    name: p.category_name,
                    sort_order: 99,
                  },
                ];
              }
            }
          }

          setRestaurantInfo((prevInfo) => {
            let nextInfo = prevInfo;
            if (!settingsRes.error && settingsRes.data && settingsRes.data.length > 0) {
              for (const row of settingsRes.data as any[]) {
                if (row.key === "restaurant_name" && row.value) {
                  nextInfo = { ...nextInfo, name: row.value };
                } else if (row.key === "ifood_config" && row.value) {
                  try {
                    const parsed = JSON.parse(row.value);
                    if (parsed.merchantName) {
                      nextInfo = { ...nextInfo, name: parsed.merchantName };
                    }
                  } catch {
                    // Ignora
                  }
                }
              }
            }

            // Persiste no cache local do smartphone para abertura em 0ms
            saveCache({
              products: nextProducts,
              categories: nextCategories,
              restaurantInfo: nextInfo,
            });

            return nextInfo;
          });

          return nextProducts;
        });

        return nextCategories;
      });
    } catch {
      // Falha silenciosa em caso de offline (o cache em tela já funciona 100%)
    }
  }, []);

  // Sincronização inicial e ao recuperar foco/rede no smartphone
  useEffect(() => {
    syncWithSupabase();

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        syncWithSupabase();
      }
    };

    window.addEventListener("visibilitychange", handleVisibilityOrFocus);
    window.addEventListener("focus", handleVisibilityOrFocus);
    window.addEventListener("online", handleVisibilityOrFocus);

    return () => {
      window.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      window.removeEventListener("online", handleVisibilityOrFocus);
    };
  }, [syncWithSupabase]);

  // Supabase Realtime: Atualiza instantaneamente quando houver alterações no PDV ou no futuro App do Dono
  useEffect(() => {
    if (!isSupabaseReady || !supabase) return;

    try {
      const channel = supabase
        .channel("menu-realtime-harmony")
        // Escuta tabela 'products' (alterações de nome, preço, esgotado, categoria, soft-delete)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "products",
          },
          (payload) => {
            if (payload.eventType === "UPDATE") {
              const updated = payload.new as any;

              // Se o item foi desativado/deletado (soft delete pelo PDV)
              if (updated.deleted_at) {
                setProducts((prev) => prev.filter((p) => p.id !== updated.id));
                return;
              }

              setProducts((prev) =>
                prev.map((item) =>
                  item.id === updated.id
                    ? {
                        ...item,
                        name: updated.name ?? item.name,
                        price: updated.price !== undefined ? Number(updated.price) : item.price,
                        category_name: updated.category_name ?? item.category_name,
                        category_id: updated.category_id ?? item.category_id,
                        emoji: updated.emoji ?? item.emoji,
                        sold_out:
                          updated.sold_out !== undefined
                            ? Boolean(updated.sold_out)
                            : item.sold_out,
                        description:
                          updated.description !== undefined ? updated.description : item.description,
                        details: updated.details !== undefined ? updated.details : item.details,
                      }
                    : item
                )
              );
            } else if (payload.eventType === "INSERT") {
              syncWithSupabase();
            } else if (payload.eventType === "DELETE") {
              const oldId = (payload.old as any)?.id;
              if (oldId) {
                setProducts((prev) => prev.filter((p) => p.id !== oldId));
              }
            }
          }
        )
        // Escuta tabela 'product_categories' (criação, renomeação ou reordenação de categorias)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "product_categories",
          },
          () => {
            syncWithSupabase();
          }
        )
        .subscribe();

      return () => {
        if (supabase) {
          supabase.removeChannel(channel);
        }
      };
    } catch {
      // Ignora erro de realtime
    }
  }, [syncWithSupabase]);

  return {
    products,
    categories,
    restaurantInfo,
    isReady,
  };
}
