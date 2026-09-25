import { Sparkles } from "lucide-react";
import type { RestaurantInfo } from "@/lib/types";

export function Footer({ info }: { info: RestaurantInfo }) {
  return (
    <footer className="mt-8 border-t border-zinc-900/80 bg-zinc-950/70 py-6 px-3 text-center text-xs text-zinc-500">
      <div className="max-w-md mx-auto space-y-1.5">
        <p className="text-xs text-zinc-300 font-semibold tracking-wide">
          {info.name}
        </p>
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-500">
          <Sparkles className="size-3 text-emerald-400" />
          <span>Cardápio Digital Oficial · Atualizado em tempo real</span>
        </div>
      </div>
    </footer>
  );
}
