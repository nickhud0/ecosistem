import { createFileRoute } from "@tanstack/react-router";
import { LoginScreen } from "@/components/pos/login-screen";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Acesso ao Caixa — Fluxo PDV" },
      { name: "description", content: "Acesso por PIN e abertura do turno do Fluxo PDV." },
      { property: "og:title", content: "Acesso ao Caixa — Fluxo PDV" },
      { property: "og:description", content: "Acesso por PIN e abertura do turno do Fluxo PDV." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginScreen,
});
