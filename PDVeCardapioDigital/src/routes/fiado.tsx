import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";

const FiadoPage = lazy(() =>
  import("@/components/pos/fiado-page").then((m) => ({ default: m.FiadoPage })),
);

function FiadoPageFallback() {
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

function FiadoPageWrapper() {
  return (
    <Suspense fallback={<FiadoPageFallback />}>
      <FiadoPage />
    </Suspense>
  );
}

export const Route = createFileRoute("/fiado")({
  head: () => ({
    meta: [
      { title: "Fiado & Caderneta — Fluxo PDV" },
      { name: "description", content: "Controle de fiado, limites de crédito, histórico e cobrança de clientes." },
      { property: "og:title", content: "Fiado & Caderneta — Fluxo PDV" },
      { property: "og:description", content: "Controle de fiado, limites de crédito, histórico e cobrança de clientes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FiadoPageWrapper,
});
