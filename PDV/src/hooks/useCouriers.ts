import { useCallback, useEffect, useState } from "react";
import { eq, isNull } from "drizzle-orm";
import { db, ensureDatabase, isTauri } from "@/database/db";
import { couriers, type DbCourier } from "@/database/schema";

// Cache compartilhado em memória para motoboys
let cachedCouriers: DbCourier[] | null = null;
let isFetchingCouriersGlobal = false;
const courierListeners = new Set<() => void>();

function notifyCourierListeners() {
  courierListeners.forEach((l) => {
    try {
      l();
    } catch {
      // Ignora erro em listener desmontado
    }
  });
}

export function useCouriers() {
  const [data, setData] = useState<DbCourier[]>(() => cachedCouriers ?? []);
  const [isLoading, setIsLoading] = useState(() => cachedCouriers === null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const updateFromCache = () => {
      if (cachedCouriers) {
        setData(cachedCouriers);
        setIsLoading(false);
      }
    };
    courierListeners.add(updateFromCache);
    return () => {
      courierListeners.delete(updateFromCache);
    };
  }, []);

  const fetchCouriers = useCallback(async (force = false) => {
    if (isFetchingCouriersGlobal && !force) return;
    if (cachedCouriers === null) {
      setIsLoading(true);
    }
    setError(null);
    isFetchingCouriersGlobal = true;
    try {
      if (!isTauri()) {
        setData([]);
        setIsLoading(false);
        isFetchingCouriersGlobal = false;
        return;
      }

      await ensureDatabase();

      const dbCouriers = await db
        .select()
        .from(couriers)
        .where(isNull(couriers.deleted_at))
        .orderBy(couriers.name);

      cachedCouriers = dbCouriers;
      setData(dbCouriers);
      notifyCourierListeners();
    } catch (err) {
      console.error("[useCouriers Error]:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
      if (cachedCouriers === null) {
        setData([]);
      }
    } finally {
      setIsLoading(false);
      isFetchingCouriersGlobal = false;
    }
  }, []);

  useEffect(() => {
    if (cachedCouriers === null) {
      fetchCouriers();
    }
  }, [fetchCouriers]);

  const addCourier = useCallback(async (name: string, phone: string) => {
    const now = new Date().toISOString();
    const newId = crypto.randomUUID();
    const newCourier: DbCourier = {
      id: newId,
      name: name.trim(),
      phone: phone.trim(),
      is_active: true,
      is_synced: false,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };

    if (cachedCouriers) {
      cachedCouriers = [...cachedCouriers, newCourier];
    }
    setData((current) => [...current, newCourier]);
    notifyCourierListeners();

    if (isTauri()) {
      await db.insert(couriers).values(newCourier);
    }

    return newCourier;
  }, []);

  const updateCourier = useCallback(async (id: string, name: string, phone: string) => {
    const now = new Date().toISOString();
    const mapper = (c: DbCourier) =>
      c.id === id
        ? { ...c, name: name.trim(), phone: phone.trim(), is_synced: false, updated_at: now }
        : c;

    if (cachedCouriers) {
      cachedCouriers = cachedCouriers.map(mapper);
    }
    setData((current) => current.map(mapper));
    notifyCourierListeners();

    if (isTauri()) {
      await db
        .update(couriers)
        .set({
          name: name.trim(),
          phone: phone.trim(),
          updated_at: now,
          is_synced: false,
        })
        .where(eq(couriers.id, id));
    }
  }, []);

  const toggleActive = useCallback(
    async (id: string) => {
      const target = data.find((c) => c.id === id);
      if (!target) return;

      const newActive = !target.is_active;
      const now = new Date().toISOString();
      const mapper = (c: DbCourier) =>
        c.id === id ? { ...c, is_active: newActive, is_synced: false, updated_at: now } : c;

      if (cachedCouriers) {
        cachedCouriers = cachedCouriers.map(mapper);
      }
      setData((current) => current.map(mapper));
      notifyCourierListeners();

      if (isTauri()) {
        await db
          .update(couriers)
          .set({
            is_active: newActive,
            updated_at: now,
            is_synced: false,
          })
          .where(eq(couriers.id, id));
      }
    },
    [data],
  );

  const deleteCourier = useCallback(async (id: string) => {
    const now = new Date().toISOString();
    if (cachedCouriers) {
      cachedCouriers = cachedCouriers.filter((c) => c.id !== id);
    }
    setData((current) => current.filter((c) => c.id !== id));
    notifyCourierListeners();

    if (isTauri()) {
      await db
        .update(couriers)
        .set({
          deleted_at: now,
          updated_at: now,
          is_synced: false,
        })
        .where(eq(couriers.id, id));
    }
  }, []);

  return {
    couriers: data,
    activeCouriers: data.filter((c) => c.is_active),
    isLoading,
    error,
    refetch: fetchCouriers,
    addCourier,
    updateCourier,
    toggleActive,
    deleteCourier,
  };
}
