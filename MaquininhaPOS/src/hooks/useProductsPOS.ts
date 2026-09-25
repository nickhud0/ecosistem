import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { ModifierGroup, Product, ProductCategory } from "../lib/types";

export function useProductsPOS() {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("TODOS");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const fetchCatalog = useCallback(async () => {
    if (!isSupabaseConfigured() || !supabase) {
      setIsLoading(false);
      return;
    }

    try {
      const [catRes, prodRes, modRes] = await Promise.all([
        supabase
          .from("product_categories")
          .select("id, name, sort_order")
          .is("deleted_at", null)
          .order("sort_order", { ascending: true }),
        supabase
          .from("products")
          .select("id, name, price, emoji, category_name, category_id, sold_out")
          .is("deleted_at", null)
          .order("name", { ascending: true }),
        supabase
          .from("modifier_groups")
          .select("id, name, type, min_selectable, max_selectable")
          .is("deleted_at", null),
      ]);

      if (catRes.data) {
        setCategories(
          catRes.data.map((c) => ({
            id: c.id,
            name: c.name,
            sortOrder: c.sort_order ?? 0,
          }))
        );
      }

      if (prodRes.data) {
        setProducts(
          prodRes.data.map((p) => ({
            id: p.id,
            name: p.name,
            price: p.price,
            emoji: p.emoji || "🍽️",
            category: p.category_name,
            categoryId: p.category_id,
            soldOut: Boolean(p.sold_out),
            exclusions: ["Sem cebola", "Sem tomate", "Sem molho"],
            addons: [
              { id: "addon-bacon", name: "Bacon crocante", price: 4 },
              { id: "addon-queijo", name: "Queijo extra", price: 5 },
              { id: "addon-ovo", name: "Ovo", price: 3 },
            ],
          }))
        );
      }

      if (modRes.data) {
        setModifierGroups(
          modRes.data.map((m) => ({
            id: m.id,
            name: m.name,
            type: m.type,
            minSelectable: m.min_selectable ?? 0,
            maxSelectable: m.max_selectable ?? 0,
          }))
        );
      }
    } catch (err) {
      console.error("[useProductsPOS Error]:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  // Supabase Realtime: atualiza instantaneamente quando houver produto esgotado
  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) return;

    const channel = supabase
      .channel("maquininha-products-realtime")
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
            setProducts((prev) =>
              prev.map((p) =>
                p.id === updated.id
                  ? {
                      ...p,
                      name: updated.name,
                      price: updated.price,
                      soldOut: Boolean(updated.sold_out),
                      category: updated.category_name,
                      emoji: updated.emoji,
                    }
                  : p
              )
            );
          } else if (payload.eventType === "INSERT") {
            fetchCatalog();
          } else if (payload.eventType === "DELETE") {
            const deleted = payload.old as any;
            setProducts((prev) => prev.filter((p) => p.id !== deleted.id));
          }
        }
      )
      .subscribe();

    return () => {
      if (supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, [fetchCatalog]);

  // Produtos filtrados por categoria selecionada e texto de busca
  const filteredProducts = products.filter((p) => {
    const matchesCategory =
      selectedCategory === "TODOS" ||
      p.category?.toLowerCase() === selectedCategory.toLowerCase();

    const matchesSearch =
      searchQuery.trim() === "" ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesCategory && matchesSearch;
  });

  return {
    categories,
    products,
    filteredProducts,
    modifierGroups,
    isLoading,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    setSearchQuery,
    refetchCatalog: fetchCatalog,
  };
}
