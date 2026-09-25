import { createFileRoute } from "@tanstack/react-router";
import { CashDrawerPage } from "@/components/pos/cash-drawer-page";
export const Route = createFileRoute("/gaveta")({
  head: () => ({
    meta: [
      { title: "Gestão da Gaveta — Fluxo PDV" },
      { name: "description", content: "Suprimentos, sangrias e fechamento de caixa." },
      { property: "og:title", content: "Gestão da Gaveta — Fluxo PDV" },
      { property: "og:description", content: "Suprimentos, sangrias e fechamento de caixa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CashDrawerPage,
});
