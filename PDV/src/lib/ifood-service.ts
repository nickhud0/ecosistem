import { isTauri } from "@/database/db";
import {
  generateTestTicketEscPos,
  isValidIpv4,
  sendEscPosToPrinter,
  type KitchenPrinterConfig,
} from "./printer-service";
import type { DeliveryOrder, OrderItem, Product } from "./pos-types";
import { brl } from "./pos-format";
import { toast } from "sonner";
import { nativeFetch } from "./native-http";

/**
 * Configurações da Integração iFood Omnichannel
 */
export type IfoodConfig = {
  enabled: boolean;
  merchantId: string;
  clientId: string;
  clientSecret: string;
  autoAccept: boolean;
  autoPrintKitchen: boolean;
  soundAlert: boolean;
  defaultPrepTimeMinutes: number;
  storeStatus: "open" | "closed";
};

export const DEFAULT_IFOOD_CONFIG: IfoodConfig = {
  enabled: true,
  merchantId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  clientId: "ifood-developer-client-id",
  clientSecret: "sec_live_99887766554433221100",
  autoAccept: false,
  autoPrintKitchen: true,
  soundAlert: true,
  defaultPrepTimeMinutes: 30,
  storeStatus: "open",
};

/**
 * Toca um bipe/som agradável de novo pedido usando a Web Audio API nativa
 */
export function playNewOrderSound(): void {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Primeiro tom: 587.33 Hz (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.25);

    // Segundo tom: 880 Hz (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0.25, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.45);

    // Terceiro tom de confirmação: 1174.66 Hz (D6)
    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = "sine";
    osc3.frequency.setValueAtTime(1174.66, now + 0.25);
    gain3.gain.setValueAtTime(0.2, now + 0.25);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(now + 0.25);
    osc3.stop(now + 0.6);
  } catch (err) {
    console.warn("[playNewOrderSound]: Áudio não suportado ou bloqueado pelo navegador:", err);
  }
}

export const IFOOD_BASE_URL = "https://merchant-api.ifood.com.br";

let cachedToken: {
  accessToken: string;
  expiresAt: number;
} | null = null;

/**
 * Extrai e normaliza um UUID válido (36 caracteres) removendo aspas, prefixos e espaços acidentais.
 */
export function sanitizeIfoodUuid(val: string): string {
  if (!val) return "";
  const trimmed = val.trim().replace(/^["']|["']$/g, "").trim();
  const match = trimmed.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  if (match) {
    return match[0].toLowerCase();
  }
  return trimmed;
}

/**
 * Obtém o token de acesso Bearer OAuth2 do iFood via client_credentials
 */
export async function getIfoodAccessToken(
  config: IfoodConfig,
  forceRefresh = false,
): Promise<{ accessToken: string; expiresIn: number }> {
  const rawClientId = config.clientId.trim();
  const rawClientSecret = config.clientSecret.trim();
  const clientId = sanitizeIfoodUuid(rawClientId);
  const clientSecret = rawClientSecret.replace(/^["']|["']$/g, "").trim();

  if (!clientId || !clientSecret) {
    throw new Error("Client ID e Client Secret são obrigatórios.");
  }

  // Validação preventiva de formato para o backend Java do iFood
  if (clientId.length > 36) {
    if (clientSecret.length === 36) {
      throw new Error(
        `O Client ID informado possui ${clientId.length} caracteres e parece ser a chave secreta. Verifique se os campos estão invertidos: o Client ID é o UUID de 36 caracteres e o Client Secret é a chave longa.`
      );
    }
    throw new Error(
      `O Client ID informado possui ${clientId.length} caracteres, mas o iFood exige exatamente 36 caracteres no formato UUID (ex: 8-4-4-4-12). Verifique se copiou texto extra ou colou a chave secreta no campo de Client ID.`
    );
  }

  const now = Date.now();
  if (!forceRefresh && cachedToken && cachedToken.expiresAt > now + 60000) {
    return {
      accessToken: cachedToken.accessToken,
      expiresIn: Math.round((cachedToken.expiresAt - now) / 1000),
    };
  }

  const tokenUrl = `${IFOOD_BASE_URL}/authentication/v1.0/oauth/token`;
  const bodyParams = new URLSearchParams();
  bodyParams.append("grantType", "client_credentials");
  bodyParams.append("clientId", clientId);
  bodyParams.append("clientSecret", clientSecret);

  const res = await nativeFetch<{
    accessToken?: string;
    expiresIn?: number;
    error?: { code?: string; message?: string };
    message?: string;
  }>(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: bodyParams.toString(),
  });

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const json: any = await res.json();
      if (typeof json.error === "string") {
        errMsg = json.error_description ? `${json.error}: ${json.error_description}` : json.error;
      } else if (json.error?.message) {
        errMsg = json.error.message;
      } else if (json.error_description) {
        errMsg = json.error_description;
      } else if (json.message) {
        errMsg = json.message;
      } else if (json.error?.code) {
        errMsg = json.error.code;
      } else if (res.body) {
        errMsg = res.body;
      }
    } catch {
      errMsg = res.body || errMsg;
    }

    // Diagnósticos amigáveis para orientar o desenvolvedor no portal iFood
    const lower = errMsg.toLowerCase();
    if (lower.includes("uuid string too large")) {
      errMsg = `O iFood rejeitou a conexão porque o Client ID enviado possui mais de 36 caracteres. O Client ID do iFood deve ser estritamente no formato UUID de 36 caracteres (ex: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx). Verifique se você não colou o Client Secret no campo de Client ID ou se copiou caracteres a mais.`;
    } else if (lower.includes("unauthorized_client") || lower.includes("grant_type")) {
      errMsg += " | Dica: No Portal do Desenvolvedor iFood, verifique se a aplicação foi criada como 'Centralizada' (necessária para autenticação direta via client_credentials). Aplicações 'Distribuídas' exigem autorização via código do lojista.";
    } else if (
      lower.includes("invalid_client") ||
      lower.includes("bad client credentials") ||
      res.status === 401
    ) {
      errMsg += " | Dica: Verifique se o Client ID e Client Secret foram copiados exatamente do Portal do Desenvolvedor (developer.ifood.com.br) sem espaços extras antes ou depois.";
    }

    throw new Error(`Falha de autenticação iFood: ${errMsg}`);
  }

  const data = await res.json();
  if (!data.accessToken) {
    throw new Error("Resposta da API iFood não contém access_token válido.");
  }

  const expiresInSec = data.expiresIn || 21600;
  cachedToken = {
    accessToken: data.accessToken,
    expiresAt: now + expiresInSec * 1000,
  };

  return { accessToken: data.accessToken, expiresIn: expiresInSec };
}

/**
 * Validador e Teste Real de Conexão com o Portal do Desenvolvedor iFood
 */
export async function testIfoodConnection(config: IfoodConfig): Promise<{
  success: boolean;
  message: string;
  merchantName?: string;
  latencyMs?: number;
}> {
  const merchantId = sanitizeIfoodUuid(config.merchantId);
  const clientId = sanitizeIfoodUuid(config.clientId);
  const clientSecret = config.clientSecret.replace(/^["']|["']$/g, "").trim();

  if (!merchantId) {
    return {
      success: false,
      message: "Merchant ID é obrigatório. Obtenha no Portal do Desenvolvedor iFood.",
    };
  }

  if (!clientId || !clientSecret) {
    return {
      success: false,
      message: "Client ID e Client Secret são obrigatórios para autenticação OAuth2.",
    };
  }

  const start = Date.now();
  try {
    const { accessToken } = await getIfoodAccessToken(config, true);
    const latencyMs = Date.now() - start;

    // Testa se a loja (merchantId) é acessível para esta credencial
    let merchantInfo = "Loja autorizada e comunicando com sucesso!";
    try {
      const pollRes = await nativeFetch(`${IFOOD_BASE_URL}/order/v1.0/events:polling`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-polling-merchants": merchantId,
          Accept: "application/json",
        },
      });

      if (pollRes.status === 401 || pollRes.status === 403) {
        return {
          success: false,
          latencyMs,
          message: `Autenticado com sucesso no iFood, porém a loja ${merchantId} não está vinculada/autorizada para este Client ID no Portal do Desenvolvedor (HTTP ${pollRes.status}). Verifique o vínculo do Merchant no portal developer.ifood.com.br.`,
        };
      }
    } catch (pollErr: unknown) {
      console.warn("[testIfoodConnection poll check]:", pollErr);
    }

    return {
      success: true,
      message: `Autenticado com sucesso na API do iFood! Token real obtido (${latencyMs}ms). ${merchantInfo}`,
      merchantName: `Loja ${merchantId.slice(0, 8)}...`,
      latencyMs,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: msg,
      latencyMs,
    };
  }
}

export type IfoodPollingEvent = {
  id: string;
  code: string; // "PLC", "CFM", "CAN", "DSP", "CON", etc.
  orderId: string;
  createdAt: string;
  fullCode?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Consulta eventos pendentes na fila do iFood (Event Polling)
 */
export async function pollIfoodEvents(
  config: IfoodConfig,
  accessToken: string,
): Promise<IfoodPollingEvent[]> {
  const merchantId = config.merchantId.trim();
  const url = `${IFOOD_BASE_URL}/order/v1.0/events:polling`;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
  if (merchantId) {
    headers["x-polling-merchants"] = merchantId;
  }

  const res = await nativeFetch<IfoodPollingEvent[]>(url, {
    method: "GET",
    headers,
  });

  if (res.status === 204) {
    return [];
  }

  if (!res.ok) {
    throw new Error(`Erro no polling do iFood (${res.status}): ${res.body.slice(0, 150)}`);
  }

  try {
    const events = await res.json();
    return Array.isArray(events) ? events : [];
  } catch {
    return [];
  }
}

/**
 * Envia confirmação de recebimento (Acknowledgment) dos eventos para o iFood
 */
export async function acknowledgeIfoodEvents(
  accessToken: string,
  eventIds: string[],
): Promise<boolean> {
  if (eventIds.length === 0) return true;
  const url = `${IFOOD_BASE_URL}/order/v1.0/events/acknowledgment`;

  const body = JSON.stringify(eventIds.map((id) => ({ id })));
  const res = await nativeFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body,
  });

  return res.ok || res.status === 200 || res.status === 202;
}

/**
 * Baixa os detalhes completos de um pedido a partir do orderId
 */
export async function fetchIfoodOrderDetails(
  accessToken: string,
  orderId: string,
): Promise<Record<string, any>> {
  const url = `${IFOOD_BASE_URL}/order/v1.0/orders/${orderId}`;
  const res = await nativeFetch<Record<string, any>>(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(
      `Falha ao buscar detalhes do pedido iFood ${orderId} (${res.status}): ${res.body.slice(0, 150)}`,
    );
  }

  return await res.json();
}

/**
 * Confirma o pedido no iFood (Aceite do pedido)
 */
export async function confirmIfoodOrder(
  accessToken: string,
  orderId: string,
): Promise<boolean> {
  const url = `${IFOOD_BASE_URL}/order/v1.0/orders/${orderId}/confirm`;
  const res = await nativeFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  return res.ok || res.status === 200 || res.status === 202;
}

/**
 * Notifica o iFood que o pedido está pronto para retirada / motoboy (RTR)
 */
export async function readyToPickupIfoodOrder(
  accessToken: string,
  orderId: string,
): Promise<boolean> {
  const url = `${IFOOD_BASE_URL}/order/v1.0/orders/${orderId}/readyToPickup`;
  const res = await nativeFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  return res.ok || res.status === 200 || res.status === 202;
}

/**
 * Notifica o iFood que o pedido saiu para entrega / em rota (DSP)
 */
export async function dispatchIfoodOrder(
  accessToken: string,
  orderId: string,
): Promise<boolean> {
  const url = `${IFOOD_BASE_URL}/order/v1.0/orders/${orderId}/dispatch`;
  const res = await nativeFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  return res.ok || res.status === 200 || res.status === 202;
}

/**
 * Motivos oficiais de cancelamento da API de Pedidos iFood Merchant v1.0
 */
export interface IfoodCancellationReason {
  code: string;
  description: string;
}

export const IFOOD_CANCELLATION_REASONS: IfoodCancellationReason[] = [
  { code: "502", description: "Cardápio desatualizado / Item indisponível" },
  { code: "505", description: "Dificuldades internas / Cozinha sobrecarregada" },
  { code: "503", description: "Restaurante sem entregador / motoboy" },
  { code: "504", description: "Fora do horário de atendimento" },
  { code: "506", description: "Área de entrega não atendida" },
  { code: "501", description: "Problemas técnicos / sistema" },
  { code: "801", description: "Solicitação de cancelamento pelo cliente" },
];

/**
 * Solicita cancelamento do pedido no iFood Merchant API v1.0
 */
export async function requestIfoodCancellation(
  accessToken: string,
  orderId: string,
  cancellationCode: string,
  reason: string,
): Promise<boolean> {
  const url = `${IFOOD_BASE_URL}/order/v1.0/orders/${orderId}/requestCancellation`;
  const res = await nativeFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      cancellationCode,
      reason: reason || "Cancelado pelo estabelecimento",
    }),
  });

  if (!res.ok && res.status !== 200 && res.status !== 202) {
    let msg = `HTTP ${res.status}`;
    try {
      const data: any = await res.json();
      msg = data.error?.message || data.message || res.body || msg;
    } catch {
      msg = res.body || msg;
    }
    throw new Error(`iFood rejeitou cancelamento (${res.status}): ${msg}`);
  }

  return true;
}

/**
 * Converte o JSON oficial do iFood (v1.0) para a estrutura DeliveryOrder do PDV
 */
export function convertIfoodApiOrderToDelivery(
  raw: any,
  existingProducts: Product[] = [],
): DeliveryOrder {
  const id = raw.id || crypto.randomUUID();
  const displayId = raw.displayId || String(id).slice(0, 4);
  const code = `#${displayId}`;

  const customerName = raw.customer?.name || "Cliente iFood";
  const customerPhone =
    raw.customer?.phone?.number ||
    (typeof raw.customer?.phone === "string" ? raw.customer.phone : "");

  const deliveryAddr = raw.delivery?.deliveryAddress;
  const formattedAddress =
    deliveryAddr?.formattedAddress ||
    [
      deliveryAddr?.streetName,
      deliveryAddr?.streetNumber ? `nº ${deliveryAddr.streetNumber}` : null,
      deliveryAddr?.complement,
      deliveryAddr?.neighborhood,
      deliveryAddr?.city,
    ]
      .filter(Boolean)
      .join(", ") ||
    "Endereço para entrega";

  const bairro = deliveryAddr?.neighborhood || "Centro";

  const items: OrderItem[] = (raw.items || []).map((it: any) => {
    const qty = it.quantity || 1;
    const unitPrice =
      it.unitPrice ??
      (it.totalPrice && qty ? it.totalPrice / qty : 0);

    const details: string[] = [];
    if (Array.isArray(it.options)) {
      for (const opt of it.options) {
        const optPrice = opt.unitPrice || 0;
        details.push(
          `${opt.name || "Adicional"}${optPrice > 0 ? ` (+${brl(optPrice)})` : ""}`,
        );
      }
    }
    if (it.observations) {
      details.push(`Obs: ${it.observations}`);
    }

    return {
      id: it.id || crypto.randomUUID(),
      name: it.name || "Item iFood",
      unitPrice,
      qty,
      details: details.length > 0 ? details : undefined,
    };
  });

  const total = Number(
    raw.total?.orderAmount ??
      raw.total?.subTotal ??
      items.reduce((s, i) => s + (i.unitPrice ?? 0) * i.qty, 0),
  );

  let paymentMethod = "iFood (Pago Online)";
  if (raw.payments?.methods && Array.isArray(raw.payments.methods) && raw.payments.methods[0]) {
    const p = raw.payments.methods[0];
    const isPrepaid = p.type === "PREPAID" || (raw.payments.prepaid && raw.payments.prepaid > 0);
    paymentMethod = isPrepaid
      ? `iFood Online (${p.method || "Cartão"})`
      : `Pagar na Entrega (${p.method || "Dinheiro"})`;
  }

  const createdAt = raw.createdAt ? new Date(raw.createdAt).getTime() : Date.now();

  return {
    id,
    code,
    source: "ifood",
    customer: customerName,
    phone: customerPhone,
    address: formattedAddress,
    bairro,
    total,
    createdAt,
    stage: "novos",
    courier: null,
    accepted: false,
    items,
    paymentMethod,
  };
}

/**
 * Normaliza texto para ESC/POS ASCII
 */
function sanitizeEscPos(text: string): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n\r]/g, " ");
}

/**
 * Gera os bytes ESC/POS de um pedido de Delivery para a impressora térmica
 */
export function generateDeliveryTicketEscPos(
  order: DeliveryOrder,
  width: "80mm" | "58mm" = "80mm",
): Uint8Array {
  const cols = width === "58mm" ? 32 : 48;
  const buffer: number[] = [];
  const encoder = new TextEncoder();

  const addBytes = (...bytes: number[]) => buffer.push(...bytes);
  const addLine = (str = "") => {
    if (str) {
      const clean = sanitizeEscPos(str);
      const encoded = encoder.encode(clean);
      for (let i = 0; i < encoded.length; i++) {
        const b = encoded[i];
        if (b !== undefined) buffer.push(b);
      }
    }
    buffer.push(0x0a);
  };
  const addDivider = (char = "-") => addLine(char.repeat(cols));

  const sourceUpper = order.source.toUpperCase();

  // Reset e Cabeçalho
  addBytes(0x1b, 0x40); // ESC @
  addBytes(0x1b, 0x61, 0x01); // Center
  addBytes(0x1b, 0x45, 0x01); // Bold
  addLine(`*** DELIVERY - ${sourceUpper} ***`);
  addLine();
  addDivider("=");
  addBytes(0x1d, 0x21, 0x11); // Large font
  addLine(`PEDIDO ${order.code}`);
  addBytes(0x1d, 0x21, 0x00); // Normal font
  addDivider("=");

  // Dados do Cliente e Entrega
  addBytes(0x1b, 0x61, 0x00); // Align left
  addLine(`Cliente:   ${order.customer}`);
  if (order.phone) {
    addLine(`Telefone:  ${order.phone}`);
  }
  if (order.address) {
    addLine(`Endereco:  ${order.address}`);
  }
  addLine(`Bairro:    ${order.bairro}`);
  if (order.courier) {
    addLine(`Entregador:${order.courier}`);
  }
  const dateStr = new Date(order.createdAt).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  addLine(`Recebido:  ${dateStr}`);

  addDivider("-");
  addBytes(0x1b, 0x45, 0x01);
  addLine("ITENS DO PEDIDO:");
  addBytes(0x1b, 0x45, 0x00);
  addLine();

  // Itens
  for (const item of order.items) {
    const itemPrice = item.unitPrice ?? (item as unknown as { price?: number }).price ?? 0;
    addBytes(0x1b, 0x45, 0x01);
    addLine(`[ ${item.qty}x ] ${item.name} - ${brl(itemPrice * item.qty)}`);
    addBytes(0x1b, 0x45, 0x00);

    if (item.details && item.details.length > 0) {
      for (const d of item.details) {
        addLine(`   > ${d}`);
      }
    }
    addDivider(".");
  }

  addLine();
  addDivider("-");
  addBytes(0x1b, 0x45, 0x01);
  addLine(`TOTAL DO PEDIDO: ${brl(order.total)}`);
  if (order.paymentMethod) {
    addLine(`PAGAMENTO: ${order.paymentMethod}`);
  }
  addBytes(0x1b, 0x45, 0x00);
  addDivider("=");

  // Rodapé e corte (5 line feeds antes do corte)
  addBytes(0x1b, 0x61, 0x01); // Center
  addLine(`FLUXO PDV - ${sourceUpper}`);
  addBytes(0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00);

  return new Uint8Array(buffer);
}

/**
 * Renderiza e dispara impressão HTML de contingência para pedido de Delivery
 */
export function printDeliveryTicketHtml(order: DeliveryOrder): void {
  if (typeof window === "undefined") return;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Pedido Delivery ${order.code}</title>
        <style>
          @page { size: auto; margin: 0; }
          body {
            font-family: monospace;
            width: 76mm;
            padding: 4mm;
            font-size: 12px;
            color: #000;
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .title { font-size: 18px; font-weight: bold; margin: 4px 0; }
          .divider { border-bottom: 1px dashed #000; margin: 6px 0; }
          .double-divider { border-bottom: 2px solid #000; margin: 6px 0; }
          .item-row { display: flex; justify-content: space-between; font-weight: bold; }
          .detail { font-size: 10px; margin-left: 12px; color: #333; }
        </style>
      </head>
      <body>
        <div class="center bold">*** DELIVERY - ${order.source.toUpperCase()} ***</div>
        <div class="double-divider"></div>
        <div class="center title">PEDIDO ${order.code}</div>
        <div class="double-divider"></div>
        <div><strong>Cliente:</strong> ${order.customer}</div>
        ${order.phone ? `<div><strong>Telefone:</strong> ${order.phone}</div>` : ""}
        ${order.address ? `<div><strong>Endereço:</strong> ${order.address}</div>` : ""}
        <div><strong>Bairro:</strong> ${order.bairro}</div>
        ${order.courier ? `<div><strong>Motoboy:</strong> ${order.courier}</div>` : ""}
        <div><strong>Horário:</strong> ${new Date(order.createdAt).toLocaleTimeString()}</div>
        <div class="divider"></div>
        <div class="bold">ITENS DO PEDIDO:</div>
        ${order.items
          .map((i) => {
            const itemPrice = i.unitPrice ?? (i as unknown as { price?: number }).price ?? 0;
            return `
          <div style="margin: 4px 0;">
            <div class="item-row">
              <span>[${i.qty}x] ${i.name}</span>
              <span>${brl(itemPrice * i.qty)}</span>
            </div>
            ${i.details?.map((d) => `<div class="detail">• ${d}</div>`).join("") ?? ""}
          </div>
        `;
          })
          .join("")}
        <div class="divider"></div>
        <div class="item-row" style="font-size: 14px;">
          <span>TOTAL:</span>
          <span>${brl(order.total)}</span>
        </div>
        ${order.paymentMethod ? `<div><strong>Forma de Pgto:</strong> ${order.paymentMethod}</div>` : ""}
        <div class="double-divider"></div>
        <div class="center bold">FLUXO PDV - VIA DA COZINHA</div>
      </body>
    </html>
  `;

  try {
    let iframe = document.getElementById("__pos_delivery_frame__") as HTMLIFrameElement | null;
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = "__pos_delivery_frame__";
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";
      iframe.style.opacity = "0";
      iframe.style.pointerEvents = "none";
      document.body.appendChild(iframe);
    }

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();

      setTimeout(() => {
        iframe?.contentWindow?.focus();
        iframe?.contentWindow?.print();
      }, 250);
    }
  } catch (err) {
    console.error("[printDeliveryTicketHtml Error]:", err);
  }
}

/**
 * Dispara a impressão do pedido de Delivery
 */
export async function printDeliveryTicket(
  order: DeliveryOrder,
  printerConfig?: KitchenPrinterConfig,
): Promise<void> {
  if (printerConfig?.enabled && printerConfig.ip.trim() && isValidIpv4(printerConfig.ip)) {
    try {
      const escposData = generateDeliveryTicketEscPos(order, printerConfig.paperWidth);
      const res = await sendEscPosToPrinter(
        printerConfig.ip,
        printerConfig.port || 9100,
        escposData,
      );
      if (res.success) {
        return;
      }
      toast.warning("Impressora de rede inacessível. Abrindo diálogo do sistema...", {
        description: res.message,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.warning("Falha de rede com impressora. Recorrendo ao diálogo do sistema...", {
        description: msg,
      });
    }
  }

  printDeliveryTicketHtml(order);
}

/**
 * Gera um pedido simulado do iFood com produtos reais ou mockados
 */
export function generateSampleIfoodOrder(existingProducts: Product[] = []): DeliveryOrder {
  const sampleCustomers = [
    {
      name: "Mariana Alcântara",
      phone: "(11) 98765-4321",
      address: "Rua Augusta, 450 - Ap 32",
      bairro: "Consolação",
    },
    {
      name: "Lucas Peixoto",
      phone: "(11) 99123-8877",
      address: "Av. Rebouças, 1200 - Bloco B",
      bairro: "Pinheiros",
    },
    {
      name: "Beatriz Nogueira",
      phone: "(11) 97456-1122",
      address: "Rua Vergueiro, 890 - Casa 3",
      bairro: "Vila Mariana",
    },
    {
      name: "Gabriel Sampaio",
      phone: "(11) 98112-9900",
      address: "Alameda Santos, 1450",
      bairro: "Cerqueira César",
    },
  ];

  const randCustomer = sampleCustomers[Math.floor(Math.random() * sampleCustomers.length)] ?? {
    name: "Cliente iFood",
    phone: "(11) 99999-9999",
    address: "Rua das Laranjeiras, 100",
    bairro: "Centro",
  };

  const id = crypto.randomUUID();
  const codeNum = Math.floor(1000 + Math.random() * 9000);
  const code = `#${codeNum}`;

  let items: OrderItem[] = [];

  if (existingProducts.length > 0) {
    const activeProds = existingProducts.filter((p) => !p.soldOut);
    const pool = activeProds.length > 0 ? activeProds : existingProducts;
    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    const count = Math.min(Math.floor(1 + Math.random() * 3), shuffled.length);

    items = shuffled.slice(0, count).map((p) => ({
      id: crypto.randomUUID(),
      name: p.name,
      unitPrice: p.price,
      qty: Math.floor(1 + Math.random() * 2),
      details: ["Sem cebola", "Adicional de Bacon"],
    }));
  }

  if (items.length === 0) {
    items = [
      {
        id: crypto.randomUUID(),
        name: "Smash Burger Especial",
        unitPrice: 32.9,
        qty: 2,
        details: ["Ponto da carne: Ao ponto", "Sem picles", "Maionese à parte"],
      },
      {
        id: crypto.randomUUID(),
        name: "Batata Frita Rústica",
        unitPrice: 18.0,
        qty: 1,
        details: ["Com alecrim e sal grosso"],
      },
      {
        id: crypto.randomUUID(),
        name: "Coca-Cola Zero Lata",
        unitPrice: 7.5,
        qty: 2,
      },
    ];
  }

  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
  const deliveryFee = 7.0;
  const total = Number((subtotal + deliveryFee).toFixed(2));

  return {
    id,
    code,
    source: "ifood",
    customer: randCustomer.name,
    phone: randCustomer.phone,
    address: randCustomer.address,
    bairro: randCustomer.bairro,
    total,
    createdAt: Date.now(),
    stage: "novos",
    courier: null,
    accepted: false,
    items,
    paymentMethod: "iFood (Pago Online)",
  };
}
