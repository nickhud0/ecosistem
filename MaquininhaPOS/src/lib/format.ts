export function brl(amount: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount ?? 0);
}

export function elapsed(openedAt: number | string | null | undefined): string {
  if (!openedAt) return "—";
  const start = typeof openedAt === "string" ? new Date(openedAt).getTime() : openedAt;
  if (isNaN(start)) return "—";
  const diffSec = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const mins = Math.floor(diffSec / 60);
  const hours = Math.floor(mins / 60);

  if (hours > 0) {
    const remMins = mins % 60;
    return `${hours}h ${remMins}m`;
  }
  return `${mins} min`;
}

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(val: unknown): boolean {
  return typeof val === "string" && UUID_V4_REGEX.test(val);
}

/**
 * Gera identificador UUID v4 estritamente compatível com o PostgreSQL/Supabase.
 * Funciona mesmo em contextos HTTP / Android WebView sem suporte nativo a crypto.randomUUID.
 */
export function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback para gerador manual abaixo
    }
  }

  // Gerador RFC 4122 UUID v4 matematicamente compatível
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function truncate(str: string, maxLen: number): string {
  if (!str) return "";
  return str.length > maxLen ? str.substring(0, maxLen - 1) + "…" : str;
}
