import { useMemo, useState } from "react";
import { Search, Sparkles, X } from "lucide-react";
import type { TableT, UserWaiter } from "../../lib/types";
import { TableCard } from "./TableCard";

interface SaloonGridProps {
  tables: TableT[];
  activeWaiter: UserWaiter | null;
  onSelectTable: (table: TableT) => void;
}

type FilterTab = "todas" | "minhas" | "livres" | "ocupadas" | "conta";

export function SaloonGrid({ tables, activeWaiter, onSelectTable }: SaloonGridProps) {
  const [filter, setFilter] = useState<FilterTab>("todas");
  const [search, setSearch] = useState<string>("");

  // Contadores para as abas
  const counts = useMemo(() => {
    return {
      todas: tables.length,
      minhas: tables.filter(
        (t) =>
          t.status !== "livre" &&
          activeWaiter &&
          t.waiter.toLowerCase() === activeWaiter.name.toLowerCase()
      ).length,
      livres: tables.filter((t) => t.status === "livre").length,
      ocupadas: tables.filter((t) => t.status === "ocupada").length,
      conta: tables.filter((t) => t.status === "conta").length,
    };
  }, [tables, activeWaiter]);

  // Lista filtrada
  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      // 1. Filtro por aba
      if (filter === "livres" && t.status !== "livre") return false;
      if (filter === "ocupadas" && t.status !== "ocupada") return false;
      if (filter === "conta" && t.status !== "conta") return false;
      if (
        filter === "minhas" &&
        (t.status === "livre" ||
          !activeWaiter ||
          t.waiter.toLowerCase() !== activeWaiter.name.toLowerCase())
      ) {
        return false;
      }

      // 2. Busca por número de mesa
      if (search.trim() !== "") {
        const query = search.toLowerCase().trim();
        const matchesNum = String(t.number).includes(query);
        const matchesWaiter = t.waiter.toLowerCase().includes(query);
        return matchesNum || matchesWaiter;
      }

      return true;
    });
  }, [tables, filter, search, activeWaiter]);

  return (
    <div className="flex-1 flex flex-col p-3 space-y-3 pb-24">
      {/* Barra de Busca Rápida de Mesa */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar mesa pelo número (ex: 2)..."
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-9 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500/70"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="p-1 text-slate-400 hover:text-slate-200 absolute right-2.5 top-1/2 -translate-y-1/2"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Abas de Filtros Horizontais com Scroll */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => setFilter("todas")}
          className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            filter === "todas"
              ? "bg-slate-100 text-slate-950 font-bold shadow-sm"
              : "bg-slate-900/90 text-slate-400 border border-slate-800 hover:border-slate-700"
          }`}
        >
          Todas ({counts.todas})
        </button>

        <button
          onClick={() => setFilter("minhas")}
          className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            filter === "minhas"
              ? "bg-indigo-500 text-white font-bold shadow-md shadow-indigo-500/30"
              : "bg-slate-900/90 text-slate-400 border border-slate-800 hover:border-slate-700"
          }`}
        >
          Minhas ({counts.minhas})
        </button>

        <button
          onClick={() => setFilter("ocupadas")}
          className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            filter === "ocupadas"
              ? "bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/30"
              : "bg-slate-900/90 text-amber-400/80 border border-slate-800 hover:border-slate-700"
          }`}
        >
          Ocupadas ({counts.ocupadas})
        </button>

        <button
          onClick={() => setFilter("conta")}
          className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            filter === "conta"
              ? "bg-rose-500 text-white font-bold shadow-md shadow-rose-500/30"
              : "bg-slate-900/90 text-rose-400/80 border border-slate-800 hover:border-slate-700"
          }`}
        >
          Pediu Conta ({counts.conta})
        </button>

        <button
          onClick={() => setFilter("livres")}
          className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            filter === "livres"
              ? "bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/30"
              : "bg-slate-900/90 text-emerald-400/80 border border-slate-800 hover:border-slate-700"
          }`}
        >
          Livres ({counts.livres})
        </button>
      </div>

      {/* Grid de Mesas (2 colunas perfeitas para tela vertical de maquininha) */}
      {filteredTables.length > 0 ? (
        <div className="grid grid-cols-2 gap-2.5">
          {filteredTables.map((table) => {
            const isMyTable =
              Boolean(activeWaiter) &&
              table.waiter.toLowerCase() === activeWaiter?.name.toLowerCase();

            return (
              <TableCard
                key={table.id}
                table={table}
                isMyTable={isMyTable}
                onSelect={onSelectTable}
              />
            );
          })}
        </div>
      ) : (
        <div className="py-12 text-center text-slate-500">
          <Sparkles className="w-8 h-8 mx-auto mb-2 text-slate-600" />
          <p className="text-sm font-medium">Nenhuma mesa encontrada</p>
          <p className="text-xs text-slate-600 mt-0.5">Tente alterar os filtros ou a busca</p>
        </div>
      )}
    </div>
  );
}
