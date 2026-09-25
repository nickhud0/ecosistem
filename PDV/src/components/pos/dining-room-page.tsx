import { useEffect, useMemo, useRef, useState } from "react";
import { Hash, Link2 } from "lucide-react";
import { AppShell } from "@/components/pos/app-shell";
import { TablePanel } from "@/components/pos/table-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { usePos } from "@/lib/pos-store";
import { isEditableElement } from "@/hooks/usePosShortcuts";
import { brl, elapsed, itemsTotal } from "@/lib/pos-format";
import type { TableT } from "@/lib/pos-types";
import { cn } from "@/lib/utils";

const STATUS = {
  livre: { label: "Livre", bg: "bg-free/10 ring-free/30", dot: "bg-free", text: "text-free" },
  ocupada: { label: "Ocupada", bg: "bg-busy/10 ring-busy/30", dot: "bg-busy", text: "text-busy" },
  conta: {
    label: "Conta",
    bg: "bg-wait/10 ring-wait/40",
    dot: "bg-wait pulse-wait",
    text: "text-wait",
  },
};

export function DiningRoomPage() {
  const pos = usePos();
  const tables = pos.tables;
  const isLoading = !pos.ready;
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [closedByUser, setClosedByUser] = useState(false);
  const [digitBuffer, setDigitBuffer] = useState("");
  const digitTimerRef = useRef<NodeJS.Timeout | null>(null);

  const filtered = useMemo(
    () => tables.filter((t) => String(t.number).includes(query.trim())),
    [tables, query],
  );

  const selected = useMemo(() => {
    if (closedByUser || !tables.length) return null;
    if (selectedId) {
      const found = tables.find((t) => t.id === selectedId);
      if (found) return found;
    }
    return tables.find((t) => t.status !== "livre") ?? tables[0] ?? null;
  }, [tables, selectedId, closedByUser]);

  const selectByTableNumber = (targetNum: number) => {
    const table = tables.find((t) => t.number === targetNum);
    if (table) {
      setSelectedId(table.id);
      setClosedByUser(false);
      return table;
    }
    return null;
  };

  const handleSearchSubmit = () => {
    if (!query.trim()) return;
    const parsed = parseInt(query.replace(/\D/g, ""), 10);
    if (parsed) {
      const table = selectByTableNumber(parsed);
      if (table) {
        setQuery("");
        return;
      }
    }
    if (filtered.length > 0 && filtered[0]) {
      setSelectedId(filtered[0].id);
      setClosedByUser(false);
      setQuery("");
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Se qualquer diálogo modal estiver aberto na tela, não captura teclas
      if (document.querySelector('[role="dialog"]')) return;

      // Se estiver digitando em campo de texto (como a busca), Enter executa submit
      if (isEditableElement(e.target)) {
        if (e.key === "Enter") {
          e.preventDefault();
          handleSearchSubmit();
          (e.target as HTMLElement).blur();
        }
        return;
      }

      // Atalhos numéricos e navegação apenas sem Alt / Ctrl / Meta
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      // Digitação de números (0..9)
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        const nextDigits = digitBuffer + e.key;
        setDigitBuffer(nextDigits);

        if (digitTimerRef.current) {
          clearTimeout(digitTimerRef.current);
        }

        const targetNum = parseInt(nextDigits, 10);
        selectByTableNumber(targetNum);

        digitTimerRef.current = setTimeout(() => {
          setDigitBuffer("");
        }, 1200);
        return;
      }

      // Enter confirma número digitado ou primeiro resultado da busca
      if (e.key === "Enter") {
        e.preventDefault();
        if (digitBuffer) {
          const targetNum = parseInt(digitBuffer, 10);
          selectByTableNumber(targetNum);
          setDigitBuffer("");
          if (digitTimerRef.current) clearTimeout(digitTimerRef.current);
          return;
        }
        if (query.trim()) {
          handleSearchSubmit();
          return;
        }
        return;
      }

      // Backspace desfaz dígito do buffer
      if (e.key === "Backspace" && digitBuffer) {
        e.preventDefault();
        const updated = digitBuffer.slice(0, -1);
        setDigitBuffer(updated);
        if (updated) {
          selectByTableNumber(parseInt(updated, 10));
        }
        return;
      }

      // Navegação por setas entre as mesas
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const curList = filtered.length ? filtered : tables;
        if (!curList.length) return;
        const curIndex = curList.findIndex((t) => t.id === selected?.id);
        const nextIndex = curIndex === -1 ? 0 : (curIndex + 1) % curList.length;
        const nextTable = curList[nextIndex];
        if (nextTable) {
          setSelectedId(nextTable.id);
          setClosedByUser(false);
        }
        return;
      }

      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const curList = filtered.length ? filtered : tables;
        if (!curList.length) return;
        const curIndex = curList.findIndex((t) => t.id === selected?.id);
        const prevIndex = curIndex <= 0 ? curList.length - 1 : curIndex - 1;
        const prevTable = curList[prevIndex];
        if (prevTable) {
          setSelectedId(prevTable.id);
          setClosedByUser(false);
        }
        return;
      }

      // Escape limpa buffer, ou limpa query, ou fecha painel
      if (e.key === "Escape") {
        if (digitBuffer) {
          e.preventDefault();
          setDigitBuffer("");
          if (digitTimerRef.current) clearTimeout(digitTimerRef.current);
          return;
        }
        if (query) {
          e.preventDefault();
          setQuery("");
          return;
        }
        if (selected) {
          e.preventDefault();
          setClosedByUser(true);
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [digitBuffer, query, tables, filtered, selected]);

  return (
    <AppShell
      title="Salão & Mesas"
      search={query}
      onSearch={setQuery}
      onSearchSubmit={handleSearchSubmit}
      searchPlaceholder="Buscar mesa (digite o nº e dê Enter)…"
    >
      <div className="grid h-full grid-cols-[1.05fr_1fr] gap-5">
        <section className="flex min-h-0 flex-col rounded-3xl glass p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display font-semibold">Mesas ({tables.length})</h2>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              {Object.entries(STATUS).map(([key, s]) => (
                <span key={key} className="flex items-center gap-1.5">
                  <i className={cn("size-2.5 rounded-full", s.dot)} />
                  {s.label}
                </span>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-3 gap-3 overflow-y-auto pr-1 content-start auto-rows-max">
              {Array.from({ length: 12 }).map((_, idx) => (
                <div
                  key={idx}
                  className="min-h-32 rounded-2xl border border-border/40 p-4 space-y-3 glass-soft"
                >
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-7 w-12 rounded-lg" />
                    <Skeleton className="size-3 rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-28" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 overflow-y-auto pr-1 content-start auto-rows-max">
              {filtered.map((table) => (
                <TableCard
                  key={table.id}
                  table={table}
                  selected={selected?.id === table.id}
                  now={pos.now}
                  onClick={() => {
                    setSelectedId(table.id);
                    setClosedByUser(false);
                  }}
                />
              ))}
              {!filtered.length && (
                <p className="col-span-3 py-10 text-center text-xs text-muted-foreground">
                  Nenhuma mesa encontrada para "{query}".
                </p>
              )}
            </div>
          )}
        </section>

        {selected ? (
          <TablePanel table={selected} onClose={() => setClosedByUser(true)} />
        ) : (
          <div className="flex flex-col items-center justify-center rounded-3xl glass p-8 text-center text-muted-foreground">
            <p className="text-base font-semibold text-foreground">Nenhuma mesa selecionada</p>
            <p className="mt-1 text-xs">Pressione o número da mesa (ex: 2) ou clique para abrir a comanda.</p>
          </div>
        )}
      </div>

      {/* Indicador visual ao digitar número da mesa no teclado */}
      {digitBuffer && (
        <div className="fixed bottom-6 left-28 z-50 flex items-center gap-2.5 rounded-2xl bg-brand text-brand-foreground px-4 py-2.5 shadow-2xl shadow-brand/40 animate-in fade-in zoom-in-95">
          <Hash className="size-4" />
          <span className="text-xs uppercase font-semibold">Mesa:</span>
          <span className="font-mono text-2xl font-black">{digitBuffer}</span>
          <span className="text-[11px] opacity-80">(Enter p/ abrir)</span>
        </div>
      )}
    </AppShell>
  );
}

function TableCard({
  table,
  selected,
  now,
  onClick,
}: {
  table: TableT;
  selected: boolean;
  now: number;
  onClick: () => void;
}) {
  const style = STATUS[table.status] ?? STATUS.livre;
  const items = table.items ?? [];
  const isMerged = Boolean(table.mergedWith && table.mergedWith.length > 0);
  const sortedGroup = isMerged
    ? [table.number, ...(table.mergedWith ?? [])].sort((a, b) => a - b)
    : [];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "tap min-h-32 rounded-2xl p-4 text-left ring-1 transition-all",
        style.bg,
        selected && "outline-2 outline-offset-2 outline-brand shadow-lg shadow-brand/10",
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="num font-display text-2xl font-bold">
            {String(table.number ?? 1).padStart(2, "0")}
          </span>
          {isMerged && (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-brand/20 px-1.5 py-0.5 text-[11px] font-bold text-brand ring-1 ring-brand/30"
              title={`Mesa conjunta com Mesa ${table.mergedWith!.map((n) => String(n).padStart(2, "0")).join(", ")}`}
            >
              <Link2 className="size-3" />+
              {table.mergedWith!.map((n) => String(n).padStart(2, "0")).join(", +")}
            </span>
          )}
        </div>
        <span className={cn("size-3 rounded-full", style.dot)} />
      </div>
      {table.status === "livre" ? (
        <p className={cn("mt-4 text-sm font-medium", style.text)}>Disponível</p>
      ) : (
        <>
          <p className="mt-3 num text-sm font-semibold">
            {elapsed(table.openedAt, now)} · {brl(itemsTotal(items))}
          </p>
          <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
            <span className="truncate">
              {isMerged
                ? `Mesa ${sortedGroup.map((n) => String(n).padStart(2, "0")).join(" + ")}`
                : `${items.length} ${items.length === 1 ? "item" : "itens"} · ${table.waiter && table.waiter !== "Equipe" ? table.waiter : "Equipe"}`}
            </span>
            {items.some((i) => !i.sentToKitchen) && (
              <span
                className="ml-1.5 size-2 shrink-0 rounded-full bg-amber-500 animate-pulse"
                title="Itens pendentes de envio à cozinha"
              />
            )}
          </div>
        </>
      )}
    </button>
  );
}
