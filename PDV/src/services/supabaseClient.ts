import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl: string = (import.meta.env["VITE_SUPABASE_URL"] as string) || "";
const supabaseAnonKey: string = (import.meta.env["VITE_SUPABASE_ANON_KEY"] as string) || "";

/**
 * Valida se as variáveis de ambiente do Supabase estão devidamente preenchidas
 * e se a URL informada possui formato válido.
 */
export const isSupabaseConfigured = (): boolean => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return false;
  }
  if (
    supabaseUrl.includes("your-project") ||
    supabaseAnonKey.includes("your-anon-key") ||
    supabaseAnonKey.trim() === ""
  ) {
    return false;
  }

  try {
    const parsed = new URL(supabaseUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Instância única do cliente Supabase para o Background Sync Worker.
 * Caso as variáveis não estejam preenchidas, retorna null de forma segura.
 */
let clientInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!clientInstance) {
    clientInstance = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return clientInstance;
}

export const supabase: SupabaseClient | null = isSupabaseConfigured() ? getSupabaseClient() : null;
