import { createFileRoute } from "@tanstack/react-router";
import { DeliveryPage } from "@/components/pos/delivery-page";
export const Route = createFileRoute("/delivery")({
  head: () => ({
    meta: [
      { title: "Delivery Omnichannel — Fluxo PDV" },
      { name: "description", content: "Pedidos de iFood, WhatsApp e telefone em uma visão." },
      { property: "og:title", content: "Delivery Omnichannel — Fluxo PDV" },
      {
        property: "og:description",
        content: "Pedidos de iFood, WhatsApp e telefone em uma visão.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DeliveryPage,
});
