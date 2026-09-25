import { createFileRoute } from "@tanstack/react-router";
import { DiningRoomPage } from "@/components/pos/dining-room-page";
export const Route = createFileRoute("/salao")({
  head: () => ({
    meta: [
      { title: "Salão e Mesas — Fluxo PDV" },
      { name: "description", content: "Acompanhamento operacional de mesas e comandas." },
      { property: "og:title", content: "Salão e Mesas — Fluxo PDV" },
      { property: "og:description", content: "Acompanhamento operacional de mesas e comandas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DiningRoomPage,
});
