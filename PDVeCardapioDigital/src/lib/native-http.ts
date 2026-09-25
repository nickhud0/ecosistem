import { isTauri } from "@/database/db";

/**
 * Utilitário de requisição HTTP nativa Desktop
 *
 * Utiliza o comando nativo `http_request` em Rust no Tauri para contornar
 * limitações de CORS impostas pelo WebKit/Browser para APIs de terceiros
 * como iFood Merchant API. Em ambiente web puro, recorre ao `window.fetch`.
 */

export type NativeHttpRequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

export type NativeHttpResponse<T = unknown> = {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
  json: () => Promise<T>;
  text: () => Promise<string>;
};

type RustHttpResponsePayload = {
  status: number;
  ok: boolean;
  body: string;
  headers: Record<string, string>;
};

export async function nativeFetch<T = unknown>(
  url: string,
  options?: NativeHttpRequestOptions,
): Promise<NativeHttpResponse<T>> {
  const method = (options?.method ?? "GET").toUpperCase();
  const headers = options?.headers ?? {};
  const body = options?.body;

  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const res = await invoke<RustHttpResponsePayload>("http_request", {
        url,
        method,
        headers,
        body: body ?? null,
      });

      return {
        status: res.status,
        ok: res.ok,
        headers: res.headers,
        body: res.body,
        json: async () => {
          try {
            return JSON.parse(res.body) as T;
          } catch {
            throw new Error(`Falha ao decodificar JSON: ${res.body.slice(0, 200)}`);
          }
        },
        text: async () => res.body,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Erro na chamada nativa para ${url}: ${msg}`);
    }
  }

  // Fallback padrão para ambiente web/dev
  const fetchOptions: RequestInit = {
    method,
    headers,
  };
  if (body) {
    fetchOptions.body = body;
  }
  const resp = await window.fetch(url, fetchOptions);

  const textBody = await resp.text();
  const respHeaders: Record<string, string> = {};
  resp.headers.forEach((v, k) => {
    respHeaders[k] = v;
  });

  return {
    status: resp.status,
    ok: resp.ok,
    headers: respHeaders,
    body: textBody,
    json: async () => {
      try {
        return JSON.parse(textBody) as T;
      } catch {
        throw new Error(`Falha ao decodificar JSON: ${textBody.slice(0, 200)}`);
      }
    },
    text: async () => textBody,
  };
}
