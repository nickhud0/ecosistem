import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  AlertTriangle,
  Armchair,
  Bell,
  Bike,
  Cloud,
  CloudOff,
  HandCoins,
  History,
  Keyboard,
  LogOut,
  Moon,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  Sun,
  Wallet,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePos } from "@/lib/pos-store";
import { cn } from "@/lib/utils";
import { isSupabaseConfigured } from "@/services/supabaseClient";
import { getSyncStatus } from "@/services/syncService";
import { isEditableElement, useGlobalShortcuts } from "@/hooks/usePosShortcuts";
import { ShortcutsHelpDialog } from "@/components/pos/shortcuts-help-dialog";

const NAV = [
  { to: "/salao", label: "Salão", icon: Armchair },
  { to: "/balcao", label: "Balcão", icon: ShoppingBag },
  { to: "/delivery", label: "Delivery", icon: Bike },
  { to: "/fiado", label: "Fiado", icon: HandCoins },
  { to: "/gaveta", label: "Gaveta", icon: Wallet },
  { to: "/historico", label: "Histórico", icon: History },
  { to: "/controle", label: "Controle 86", icon: Zap },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

export function AppShell({
  title,
  subtitle,
  children,
  search,
  onSearch,
  onSearchSubmit,
  searchPlaceholder,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  search?: string;
  onSearch?: (v: string) => void;
  onSearchSubmit?: () => void;
  searchPlaceholder?: string;
}) {
  const pos = usePos();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [syncState, setSyncState] = useState(getSyncStatus());
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useGlobalShortcuts({
    onOpenHelp: () => setShowShortcutsHelp((prev) => !prev),
    onNavigateTab: (index) => {
      const target = NAV[index];
      if (target) navigate({ to: target.to });
    },
    onEscape: () => {
      if (showShortcutsHelp) setShowShortcutsHelp(false);
    },
  });

  // Atalho '/' ou Ctrl+K para focar a barra de busca do cabeçalho
  useEffect(() => {
    if (!onSearch) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditableElement(e.target)) return;

      if (e.key === "/" || (e.ctrlKey && (e.key === "k" || e.key === "K"))) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSearch]);

  useEffect(() => {
    const timer = setInterval(() => {
      const next = getSyncStatus();
      setSyncState((prev) => {
        if (
          prev.isSyncing === next.isSyncing &&
          prev.lastSyncAt === next.lastSyncAt &&
          prev.lastError === next.lastError &&
          prev.totalSyncedInLastRun === next.totalSyncedInLastRun
        ) {
          return prev;
        }
        return next;
      });
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Pré-carrega módulos mais pesados em segundo plano durante tempo ocioso
  // para que a primeira abertura em computadores de baixo desempenho (ex: Positivo Celeron) seja instantânea
  useEffect(() => {
    const timer = setTimeout(() => {
      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        window.requestIdleCallback(() => {
          import("@/components/pos/settings-page");
          import("@/components/pos/history-page");
        });
      } else {
        import("@/components/pos/settings-page");
        import("@/components/pos/history-page");
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (pos.ready && (!pos.user || !pos.shiftOpen)) navigate({ to: "/" });
  }, [pos.ready, pos.user, pos.shiftOpen, navigate]);

  if (!pos.ready || !pos.user || !pos.shiftOpen) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute -top-40 -left-32 size-[520px] rounded-full bg-brand/25 blur-[60px] will-change-transform transform-gpu hidden dark:block" />
      <div className="pointer-events-none absolute top-1/3 -right-40 size-[560px] rounded-full bg-cyan/20 blur-[60px] will-change-transform transform-gpu hidden dark:block" />
      <div className="pointer-events-none absolute bottom-0 left-1/3 size-[420px] rounded-full bg-wait/10 blur-[60px] will-change-transform transform-gpu hidden dark:block" />

      <div className="relative flex h-screen">
        <aside className="flex w-20 shrink-0 flex-col items-center gap-3 border-r border-border glass py-5">
          <div className="mb-1 grid size-11 place-items-center rounded-2xl bg-linear-to-br from-brand to-cyan font-display text-lg font-bold text-brand-foreground shadow-lg shadow-brand/30">
            F
          </div>
          <div className="flex flex-col items-center gap-2 mb-1">
            <button
              type="button"
              onClick={pos.toggleOnline}
              className="tap flex flex-col items-center gap-0.5"
              title="Status de conexão local (offline-first)"
            >
              {pos.online ? (
                <Wifi className="size-4 text-free" />
              ) : (
                <WifiOff className="size-4 text-busy" />
              )}
              <span className="text-[9px] tracking-wider text-muted-foreground uppercase">
                {pos.online ? "Online" : "Offline"}
              </span>
            </button>

            {isSupabaseConfigured() && (
              <div
                className="flex flex-col items-center gap-0.5"
                title={
                  syncState.isSyncing
                    ? "Sincronizando com a nuvem..."
                    : syncState.lastSyncAt
                      ? `Nuvem sincronizada (${new Date(syncState.lastSyncAt).toLocaleTimeString()})`
                      : "Aguardando sincronização com a nuvem"
                }
              >
                {syncState.isSyncing ? (
                  <RefreshCw className="size-3.5 text-brand animate-spin" />
                ) : pos.online ? (
                  <Cloud className="size-3.5 text-free" />
                ) : (
                  <CloudOff className="size-3.5 text-muted-foreground" />
                )}
                <span className="text-[8px] tracking-wider text-muted-foreground uppercase font-mono">
                  {syncState.isSyncing ? "Sync" : "Nuvem"}
                </span>
              </div>
            )}
          </div>
          <div className="h-px w-8 bg-border" />
          {NAV.map(({ to, label, icon: Icon }, idx) => {
            const active = pathname === to;
            return (
              <Link
                key={to}
                to={to}
                title={`${label} (Alt+${idx + 1})`}
                onMouseEnter={() => {
                  if (to === "/configuracoes") import("@/components/pos/settings-page");
                  if (to === "/historico") import("@/components/pos/history-page");
                  if (to === "/fiado") import("@/components/pos/fiado-page");
                }}
                onFocus={() => {
                  if (to === "/configuracoes") import("@/components/pos/settings-page");
                  if (to === "/historico") import("@/components/pos/history-page");
                  if (to === "/fiado") import("@/components/pos/fiado-page");
                }}
                className={cn(
                  "tap relative group grid size-12 place-items-center rounded-2xl",
                  active
                    ? "bg-brand/25 text-brand ring-1 ring-brand/40"
                    : "glass-soft text-muted-foreground hover:bg-surface-strong",
                )}
              >
                <Icon className="size-6" />
                <span className="absolute -bottom-0.5 right-1 select-none font-mono text-[9px] font-semibold text-muted-foreground/50 group-hover:text-foreground/80">
                  {idx + 1}
                </span>
              </Link>
            );
          })}
          <div className="mt-auto flex flex-col gap-2">
            <button
              type="button"
              onClick={pos.toggleTheme}
              title="Alternar tema"
              className="tap grid size-11 place-items-center rounded-2xl glass-soft text-muted-foreground"
            >
              {pos.theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </button>
            <button
              type="button"
              onClick={() => {
                pos.logout();
                navigate({ to: "/" });
              }}
              title="Sair"
              className="tap grid size-11 place-items-center rounded-2xl glass-soft text-muted-foreground"
            >
              <LogOut className="size-5" />
            </button>
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-4 border-b border-border glass px-6 py-4">
            <div className="flex items-baseline gap-3">
              <h1 className="font-display text-xl font-semibold tracking-tight">{title}</h1>
              <span className="text-xs text-muted-foreground">
                {subtitle ?? "Turno 1 · Caixa 01"}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-3">
              {onSearch ? (
                <div className="relative flex w-64 items-center gap-2 rounded-xl glass-soft px-3 py-2">
                  <Search className="size-4 text-muted-foreground" />
                  <input
                    ref={searchInputRef}
                    value={search ?? ""}
                    onChange={(e) => onSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onSearchSubmit?.();
                      } else if (e.key === "Escape") {
                        searchInputRef.current?.blur();
                      }
                    }}
                    className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground pr-5"
                    placeholder={searchPlaceholder ?? "Buscar mesa ou comanda…"}
                  />
                  <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded bg-surface px-1 py-0.5 font-mono text-[9px] text-muted-foreground border border-border select-none pointer-events-none">
                    /
                  </kbd>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setShowShortcutsHelp(true)}
                className="tap flex items-center gap-1.5 rounded-xl glass-soft px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                title="Atalhos do teclado (F1 ou ?)"
              >
                <Keyboard className="size-4" />
                <span className="hidden sm:inline">Atalhos</span>
                <kbd className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground border border-border">F1</kbd>
              </button>
              <button
                type="button"
                className="tap relative grid size-10 place-items-center rounded-xl glass-soft"
                title="Central de alertas"
              >
                <Bell className="size-5 text-muted-foreground" />
                {pos.alerts.length ? (
                  <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-wait text-[10px] font-bold text-background">
                    {pos.alerts.length}
                  </span>
                ) : null}
              </button>
              <div className="flex items-center gap-2 rounded-xl glass-soft px-3 py-2">
                <div className="grid size-8 place-items-center rounded-lg bg-linear-to-br from-cyan to-brand text-xs font-bold text-brand-foreground">
                  MR
                </div>
                <span className="text-sm">{pos.user}</span>
              </div>
            </div>
          </header>

          {pos.alerts.length ? (
            <div className="space-y-2 px-6 pt-4">
              {pos.alerts.map((a) => (
                <div
                  key={a}
                  className="flex items-center gap-3 rounded-xl bg-wait/10 px-4 py-2.5 text-sm ring-1 ring-wait/30"
                >
                  <AlertTriangle className="size-4 text-wait" />
                  <span>{a}</span>
                  <button
                    type="button"
                    onClick={() => pos.dismissAlert(a)}
                    className="ml-auto text-xs text-wait underline underline-offset-2"
                  >
                    Resolver
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-hidden p-6">{children}</div>
          <ShortcutsHelpDialog open={showShortcutsHelp} onOpenChange={setShowShortcutsHelp} />
        </main>
      </div>
    </div>
  );
}
