import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";

const HistoryPage = lazy(() =>
  import("@/components/pos/history-page").then((m) => ({ default: m.HistoryPage })),
);

function HistoryPageFallback() {
  return (
    <div className="flex h-screen bg-background text-foreground">
      <div className="w-20 border-r border-border py-5 bg-card/40" />
      <div className="flex-1 p-6 space-y-4">
        <div className="h-8 w-48 rounded-xl bg-muted/60 animate-pulse" />
        <div className="h-12 w-80 rounded-2xl bg-muted/40 animate-pulse" />
        <div className="h-96 rounded-3xl bg-muted/20 animate-pulse" />
      </div>
    </div>
  );
}

function HistoryPageWrapper() {
  return (
    <Suspense fallback={<HistoryPageFallback />}>
      <HistoryPage />
    </Suspense>
  );
}

export const Route = createFileRoute("/historico")({
  head: () => ({
    meta: [
      { title: "Histórico de Vendas — Fluxo PDV" },
      { name: "description", content: "Cupons, reimpressões e cancelamentos de vendas." },
      { property: "og:title", content: "Histórico de Vendas — Fluxo PDV" },
      { property: "og:description", content: "Cupons, reimpressões e cancelamentos de vendas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoryPageWrapper,
});
