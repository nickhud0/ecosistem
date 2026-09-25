import { createFileRoute } from "@tanstack/react-router";
import { CounterPage } from "@/components/pos/counter-page";
export const Route = createFileRoute("/balcao")({
  head: () => ({
    meta: [
      { title: "Venda Balcão — Fluxo PDV" },
      { name: "description", content: "Venda rápida de balcão e retirada." },
      { property: "og:title", content: "Venda Balcão — Fluxo PDV" },
      { property: "og:description", content: "Venda rápida de balcão e retirada." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CounterPage,
});
