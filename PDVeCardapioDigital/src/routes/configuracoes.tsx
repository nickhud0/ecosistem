import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";

const SettingsPage = lazy(() =>
  import("@/components/pos/settings-page").then((m) => ({ default: m.SettingsPage })),
);

function SettingsPageFallback() {
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

function SettingsPageWrapper() {
  return (
    <Suspense fallback={<SettingsPageFallback />}>
      <SettingsPage />
    </Suspense>
  );
}

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Fluxo PDV" },
      { name: "description", content: "Gestão do cardápio, mesas e equipe." },
      { property: "og:title", content: "Configurações — Fluxo PDV" },
      { property: "og:description", content: "Gestão do cardápio, mesas e equipe." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPageWrapper,
});
