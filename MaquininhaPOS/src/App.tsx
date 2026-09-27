import { useState } from "react";
import { Toaster } from "sonner";
import { PinLogin } from "./components/auth/PinLogin";
import { CheckoutModal } from "./components/checkout/CheckoutModal";
import { HeaderBar } from "./components/layout/HeaderBar";
import { ProductCatalogSheet } from "./components/order/ProductCatalogSheet";
import { TableDetailModal } from "./components/order/TableDetailModal";
import { SaloonGrid } from "./components/saloon/SaloonGrid";
import { TableTransferModal } from "./components/saloon/TableTransferModal";
import { PosSettingsModal } from "./components/settings/PosSettingsModal";
import { useAuthWaiter } from "./hooks/useAuthWaiter";
import { useProductsPOS } from "./hooks/useProductsPOS";
import { useTableOrderActions } from "./hooks/useTableOrderActions";
import { useTablesRealtime } from "./hooks/useTablesRealtime";
import type { OrderItem, TableT } from "./lib/types";

export function App() {
  const { waiter, waitersList, isLoading: isAuthLoading, loginWithPin, logout } = useAuthWaiter();
  const {
    tables,
    isLoading: isTablesLoading,
    isRealtimeActive,
    refreshTables,
    optimisticAddItems,
    optimisticRemoveItem,
    optimisticSendToKitchen,
    optimisticSetStatus,
    optimisticClearTable,
  } = useTablesRealtime();
  const { categories, products } = useProductsPOS();
  const {
    isSubmitting,
    openTable,
    addItemsToTable,
    removeItemFromTable,
    sendTableToKitchen,
    requestBill,
    finishCheckout,
    transferTable,
  } = useTableOrderActions(waiter);

  // Estados de navegação e modais
  const [selectedTable, setSelectedTable] = useState<TableT | null>(null);
  const [isOrdering, setIsOrdering] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Mantém a versão atualizada da mesa selecionada se o Realtime disparar
  const liveSelectedTable = selectedTable
    ? tables.find((t) => t.id === selectedTable.id) ?? selectedTable
    : null;

  // 1. Tela de Autenticação Rápida por PIN (se não logado)
  if (!waiter) {
    return (
      <>
        <Toaster
          position="bottom-center"
          richColors
          theme="dark"
          duration={2200}
          toastOptions={{
            className: "pointer-events-none text-xs font-semibold py-2 px-3 rounded-xl shadow-2xl",
          }}
        />
        <PinLogin
          waitersList={waitersList}
          onLogin={loginWithPin}
          isLoading={isAuthLoading}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
        <PosSettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      </>
    );
  }

  // Contadores para o Header
  const occupiedCount = tables.filter((t) => t.status !== "livre").length;
  const totalTables = tables.length;

  // Ações de Mesa com Resposta Instantânea (0ms de latência percebida)
  const handleOpenTable = () => {
    if (!liveSelectedTable) return;
    const targetTable = liveSelectedTable;
    optimisticSetStatus(targetTable.id, "ocupada", waiter.name);
    setIsOrdering(true);

    openTable(targetTable).then((ok) => {
      if (!ok) refreshTables();
    });
  };

  const handleConfirmOrderItems = (newItems: OrderItem[]) => {
    if (!liveSelectedTable) return;
    const targetTable = liveSelectedTable;

    optimisticAddItems(targetTable.id, newItems);
    setIsOrdering(false);

    addItemsToTable(targetTable, newItems).then((ok) => {
      if (!ok) refreshTables();
    });
  };

  const handleRemoveItem = (itemToRemove: OrderItem) => {
    if (!liveSelectedTable) return;
    const targetTable = liveSelectedTable;

    optimisticRemoveItem(targetTable.id, itemToRemove.id);

    const remainingCount = targetTable.items.filter((it) => it.id !== itemToRemove.id).length;
    if (remainingCount === 0) {
      setSelectedTable(null);
    }

    removeItemFromTable(targetTable, itemToRemove).then((ok) => {
      if (!ok) refreshTables();
    });
  };

  const handleSendToKitchen = () => {
    if (!liveSelectedTable) return;
    const targetTable = liveSelectedTable;

    optimisticSendToKitchen(targetTable.id);

    sendTableToKitchen(targetTable).then((ok) => {
      if (!ok) refreshTables();
    });
  };

  const handleRequestBill = () => {
    if (!liveSelectedTable) return;
    const targetTable = liveSelectedTable;

    optimisticSetStatus(targetTable.id, "conta");

    requestBill(targetTable).then((ok) => {
      if (!ok) refreshTables();
    });
  };

  const handleFinishCheckout = async (summary: any) => {
    if (!liveSelectedTable) return false;
    const targetTable = liveSelectedTable;
    const ok = await finishCheckout(targetTable, summary);
    if (ok) {
      optimisticClearTable(targetTable.id);
      setSelectedTable(null);
      setIsCheckingOut(false);
      refreshTables();
    }
    return ok;
  };

  const handleTransferTable = async (source: TableT, target: TableT) => {
    const ok = await transferTable(source, target);
    if (ok) {
      setSelectedTable(null);
      setIsTransferring(false);
      refreshTables();
    }
    return ok;
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col max-w-md mx-auto relative shadow-2xl overflow-x-hidden">
      <Toaster
        position="bottom-center"
        richColors
        theme="dark"
        duration={2200}
        toastOptions={{
          className: "pointer-events-none text-xs font-semibold py-2 px-3 rounded-xl shadow-2xl",
        }}
      />

      {/* Header com Status do Supabase Realtime, Fila Offline e Garçom */}
      <HeaderBar
        waiter={waiter}
        isRealtimeActive={isRealtimeActive}
        isLoading={isTablesLoading}
        onRefresh={refreshTables}
        onLogout={logout}
        onOpenSettings={() => setIsSettingsOpen(true)}
        occupiedCount={occupiedCount}
        totalTables={totalTables}
      />

      {/* Salão de Mesas em Tempo Real */}
      <main className="flex-1 flex flex-col">
        <SaloonGrid
          tables={tables}
          activeWaiter={waiter}
          onSelectTable={(table) => {
            setSelectedTable(table);
          }}
        />
      </main>

      {/* Modal 1: Extrato e Ações da Mesa Selecionada */}
      {liveSelectedTable && !isOrdering && !isCheckingOut && !isTransferring && (
        <TableDetailModal
          table={liveSelectedTable}
          activeWaiter={waiter}
          onClose={() => setSelectedTable(null)}
          onOpenTable={handleOpenTable}
          onAddItems={() => setIsOrdering(true)}
          onRemoveItem={handleRemoveItem}
          onSendToKitchen={handleSendToKitchen}
          onRequestBill={handleRequestBill}
          onStartCheckout={() => setIsCheckingOut(true)}
          onTransferTable={() => setIsTransferring(true)}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Modal 2: Catálogo de Produtos e Anotação Ágil de Pedidos */}
      {liveSelectedTable && isOrdering && (
        <ProductCatalogSheet
          tableNumber={liveSelectedTable.number}
          categories={categories}
          products={products}
          onConfirmOrder={handleConfirmOrderItems}
          onClose={() => setIsOrdering(false)}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Modal 3: Checkout, Split e Pagamento na Mesa */}
      {liveSelectedTable && isCheckingOut && (
        <CheckoutModal
          table={liveSelectedTable}
          onFinishCheckout={handleFinishCheckout}
          onClose={() => setIsCheckingOut(false)}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Modal 4: Transferência e Junção de Mesas */}
      {liveSelectedTable && isTransferring && (
        <TableTransferModal
          sourceTable={liveSelectedTable}
          allTables={tables}
          onTransfer={handleTransferTable}
          onClose={() => setIsTransferring(false)}
          isSubmitting={isSubmitting}
        />
      )}

      {/* Modal 5: Configurações do Terminal POS (IP do Hub, Outbox e Impressora) */}
      <PosSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
