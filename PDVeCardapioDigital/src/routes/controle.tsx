import { createFileRoute } from "@tanstack/react-router";
import { SoldOutPage } from "@/components/pos/sold-out-page";
export const Route = createFileRoute("/controle")({
  head: () => ({
    meta: [
      { title: "Controle 86 — Fluxo PDV" },
      { name: "description", content: "Controle imediato de disponibilidade dos produtos." },
      { property: "og:title", content: "Controle 86 — Fluxo PDV" },
      { property: "og:description", content: "Controle imediato de disponibilidade dos produtos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SoldOutPage,
});
