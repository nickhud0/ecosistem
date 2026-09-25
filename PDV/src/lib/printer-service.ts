import { toast } from "sonner";
import { isTauri } from "@/database/db";
import { PAYMENT_LABELS, type Customer, type CustomerTransaction, type Sale, type ShiftSummaryData } from "./pos-types";
import { brl } from "./pos-format";

/**
 * Serviço de Impressão Térmica de Produção (Cozinha e Bar)
 *
 * Gera layouts padronizados para bobinas de 80mm / 58mm e dispara
 * a impressão via ESC/POS em rede local (TCP 9100) com fallback para spooler nativo.
 */

export type KitchenPrinterConfig = {
  enabled: boolean;
  ip: string;
  port: number;
  paperWidth: "80mm" | "58mm";
  autoPrintOnKitchenSend: boolean;
};

export const DEFAULT_KITCHEN_PRINTER_CONFIG: KitchenPrinterConfig = {
  enabled: true,
  ip: "192.168.1.200",
  port: 9100,
  paperWidth: "80mm",
  autoPrintOnKitchenSend: true,
};

export type CounterPrinterConfig = {
  enabled: boolean;
  useKitchenPrinter: boolean;
  ip: string;
  port: number;
  paperWidth: "80mm" | "58mm";
  includeServiceFee: boolean;
  serviceFeePercent: number;
};

export const DEFAULT_COUNTER_PRINTER_CONFIG: CounterPrinterConfig = {
  enabled: true,
  useKitchenPrinter: false,
  ip: "192.168.1.201",
  port: 9100,
  paperWidth: "80mm",
  includeServiceFee: true,
  serviceFeePercent: 10,
};

export function getEffectiveCounterPrinterConfig(
  counterConfig?: CounterPrinterConfig,
  kitchenConfig?: KitchenPrinterConfig,
): { enabled: boolean; ip: string; port: number; paperWidth: "80mm" | "58mm" } {
  if (counterConfig?.useKitchenPrinter && kitchenConfig) {
    return {
      enabled: counterConfig.enabled && kitchenConfig.enabled,
      ip: kitchenConfig.ip,
      port: kitchenConfig.port,
      paperWidth: counterConfig.paperWidth || kitchenConfig.paperWidth,
    };
  }
  return {
    enabled: counterConfig?.enabled ?? true,
    ip: counterConfig?.ip ?? (kitchenConfig?.ip || "192.168.1.201"),
    port: counterConfig?.port ?? (kitchenConfig?.port || 9100),
    paperWidth: counterConfig?.paperWidth ?? "80mm",
  };
}

export function isValidIpv4(ip: string): boolean {
  const trimmed = ip.trim();
  const ipv4Regex =
    /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipv4Regex.test(trimmed);
}

export type KitchenTicketData = {
  tableNumber: number;
  orderCode?: string | undefined;
  waiter: string;
  round: number;
  items: {
    id: string;
    name: string;
    qty: number;
    details?: string[] | undefined;
  }[];
  timestamp?: number | string | undefined;
};

/**
 * Formata data e hora para exibição em cupom térmico
 */
function formatTicketDateTime(timestamp?: number | string): string {
  const d = timestamp ? new Date(timestamp) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${dateStr}  ${timeStr}`;
}

/**
 * Gera o código HTML completo com regras CSS `@media print` para cupom térmico
 */
export function generateKitchenTicketHtml(data: KitchenTicketData): string {
  const totalItemsCount = data.items.reduce((sum, item) => sum + item.qty, 0);
  const roundLabel =
    data.round === 1 ? "1ª RODADA (PEDIDO INICIAL)" : `${data.round}ª RODADA (PEDIDO ADICIONAL)`;
  const dateTimeStr = formatTicketDateTime(data.timestamp);

  const itemsHtml = data.items
    .map((item) => {
      const detailsHtml =
        item.details && item.details.length > 0
          ? `<div class="item-details">${item.details.map((d) => `<span>• ${escapeHtml(d)}</span>`).join("<br/>")}</div>`
          : "";

      return `
        <div class="item-row">
          <div class="item-header">
            <span class="item-qty">[ ${item.qty}x ]</span>
            <span class="item-name">${escapeHtml(item.name)}</span>
          </div>
          ${detailsHtml}
        </div>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Comanda de Produção - Mesa ${String(data.tableNumber).padStart(2, "0")}</title>
  <style>
    @page {
      size: 80mm auto;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      width: 72mm;
      max-width: 80mm;
      margin: 0 auto;
      padding: 6mm 4mm;
      font-family: 'Courier New', Courier, monospace, monospace;
      font-size: 13px;
      line-height: 1.35;
      color: #000;
      background: #fff;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: bold; }
    .divider {
      border-top: 1px dashed #000;
      margin: 6px 0;
    }
    .double-divider {
      border-top: 2px solid #000;
      margin: 6px 0;
    }
    .header-title {
      font-size: 15px;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 3px;
    }
    .table-banner {
      border: 2px solid #000;
      padding: 4px;
      margin: 6px 0;
      text-align: center;
    }
    .table-number {
      font-size: 22px;
      font-weight: 900;
      letter-spacing: 1px;
    }
    .meta-line {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      margin-bottom: 2px;
    }
    .round-tag {
      display: inline-block;
      font-weight: bold;
      font-size: 12px;
      margin: 4px 0 2px 0;
      padding: 2px 4px;
      background-color: #eee;
      border: 1px solid #000;
      text-align: center;
      width: 100%;
    }
    .item-row {
      margin: 7px 0;
      padding-bottom: 5px;
      border-bottom: 1px dotted #ccc;
    }
    .item-header {
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }
    .item-qty {
      font-size: 15px;
      font-weight: 900;
      white-space: nowrap;
    }
    .item-name {
      font-size: 14px;
      font-weight: bold;
      text-transform: uppercase;
    }
    .item-details {
      margin-top: 3px;
      padding-left: 20px;
      font-size: 11px;
      font-weight: bold;
      color: #222;
      font-style: italic;
    }
    .footer {
      margin-top: 8px;
      font-size: 11px;
    }
    @media print {
      body {
        width: 100%;
        padding: 4mm 2mm;
      }
    }
  </style>
</head>
<body>
  <div class="text-center header-title">*** PRODUÇÃO / COZINHA ***</div>
  
  <div class="table-banner">
    <div class="table-number">MESA ${String(data.tableNumber).padStart(2, "0")}</div>
    ${data.orderCode ? `<div style="font-size: 11px; font-weight: bold;">${escapeHtml(data.orderCode)}</div>` : ""}
  </div>

  <div class="meta-line">
    <span>Data/Hora:</span>
    <span class="bold">${dateTimeStr}</span>
  </div>
  <div class="meta-line">
    <span>Atendente:</span>
    <span class="bold">${escapeHtml(data.waiter)}</span>
  </div>

  <div class="round-tag">${roundLabel}</div>
  <div class="double-divider"></div>

  <div style="font-size: 11px; font-weight: bold; margin-bottom: 4px;">ITENS A PREPARAR:</div>
  ${itemsHtml}

  <div class="divider"></div>
  <div class="meta-line" style="font-size: 13px;">
    <span class="bold">TOTAL DE ITENS:</span>
    <span class="bold" style="font-size: 15px;">${totalItemsCount}</span>
  </div>
  <div class="double-divider"></div>

  <div class="text-center footer">
    <span>--- CONTROLE DE COZINHA / BAR ---</span>
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeEscPosText(text: string): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\n\r]/g, " ");
}

class EscPosBuilder {
  private buffer: number[] = [];
  private encoder = new TextEncoder();

  init() {
    this.buffer.push(0x1b, 0x40); // ESC @
    return this;
  }

  alignCenter() {
    this.buffer.push(0x1b, 0x61, 0x01); // ESC a 1
    return this;
  }

  alignLeft() {
    this.buffer.push(0x1b, 0x61, 0x00); // ESC a 0
    return this;
  }

  alignRight() {
    this.buffer.push(0x1b, 0x61, 0x02); // ESC a 2
    return this;
  }

  bold(enable: boolean) {
    this.buffer.push(0x1b, 0x45, enable ? 0x01 : 0x00); // ESC E
    return this;
  }

  sizeLarge() {
    this.buffer.push(0x1d, 0x21, 0x11); // GS ! 0x11
    return this;
  }

  sizeNormal() {
    this.buffer.push(0x1d, 0x21, 0x00); // GS ! 0x00
    return this;
  }

  text(str: string) {
    const clean = sanitizeEscPosText(str);
    const bytes = this.encoder.encode(clean);
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b !== undefined) {
        this.buffer.push(b);
      }
    }
    return this;
  }

  line(str = "") {
    if (str) this.text(str);
    this.buffer.push(0x0a);
    return this;
  }

  divider(cols = 48, char = "-") {
    return this.line(char.repeat(cols));
  }

  feedAndCut() {
    // 5 line feeds para o papel ultrapassar a guilhotina e corte parcial ESC/POS (GS V 66 0)
    this.buffer.push(0x0a, 0x0a, 0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00);
    return this;
  }

  toBytes(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  build(): Uint8Array {
    return this.toBytes();
  }
}

export type PrinterTestResponse = {
  success: boolean;
  message: string;
  latency_ms?: number | undefined;
};

export function generateTestTicketEscPos(config: KitchenPrinterConfig): Uint8Array {
  const cols = config.paperWidth === "58mm" ? 32 : 48;
  const builder = new EscPosBuilder();
  const dateStr = formatTicketDateTime();

  builder
    .init()
    .alignCenter()
    .bold(true)
    .divider(cols, "=")
    .line("TESTE DE CONEXAO - COZINHA")
    .divider(cols, "=")
    .bold(false)
    .line()
    .alignLeft()
    .bold(true)
    .line(`IP DA IMPRESSORA:  ${config.ip}`)
    .line(`PORTA TCP:         ${config.port}`)
    .line(`LARGURA DA BOBINA: ${config.paperWidth}`)
    .line(`DATA E HORA:       ${dateStr}`)
    .bold(false)
    .divider(cols, "-")
    .line("[ OK ] Socket TCP conectado")
    .line("[ OK ] Protocolo ESC/POS ativo")
    .line("[ OK ] Comunicacao em rede operacional")
    .divider(cols, "=")
    .alignCenter()
    .line("FLUXO PDV DESKTOP - COZINHA")
    .feedAndCut();

  return builder.toBytes();
}

export function generateCounterTestTicketEscPos(
  config: CounterPrinterConfig,
  kitchenConfig?: KitchenPrinterConfig,
): Uint8Array {
  const effective = getEffectiveCounterPrinterConfig(config, kitchenConfig);
  const cols = effective.paperWidth === "58mm" ? 32 : 48;
  const builder = new EscPosBuilder();
  const dateStr = formatTicketDateTime();

  builder
    .init()
    .alignCenter()
    .bold(true)
    .divider(cols, "=")
    .line("TESTE DE IMPRESSORA - BALCAO/CAIXA")
    .divider(cols, "=")
    .bold(false)
    .line()
    .alignLeft()
    .bold(true)
    .line(`IP DA IMPRESSORA:  ${effective.ip}`)
    .line(`PORTA TCP:         ${effective.port}`)
    .line(`LARGURA DA BOBINA: ${effective.paperWidth}`)
    .line(`COMPARTILHA IP:    ${config.useKitchenPrinter ? "SIM (IP Cozinha)" : "NAO (IP Proprio)"}`)
    .line(
      `TAXA DE SERVICO:   ${
        config.includeServiceFee ? `${config.serviceFeePercent}% (Sugerida)` : "Desativada"
      }`,
    )
    .line(`DATA E HORA:       ${dateStr}`)
    .bold(false)
    .divider(cols, "-")
    .line("[ OK ] Socket TCP conectado")
    .line("[ OK ] Protocolo ESC/POS ativo")
    .line("[ OK ] Emissao de Pre-Conta habilitada")
    .line("[ OK ] Comprovantes de Venda prontos")
    .divider(cols, "=")
    .alignCenter()
    .line("FLUXO PDV - BALCAO E SALAO")
    .feedAndCut();

  return builder.toBytes();
}

export function generateKitchenTicketEscPos(
  data: KitchenTicketData,
  width: "80mm" | "58mm" = "80mm",
): Uint8Array {
  const cols = width === "58mm" ? 32 : 48;
  const builder = new EscPosBuilder();
  const totalItemsCount = data.items.reduce((sum, item) => sum + item.qty, 0);
  const roundLabel =
    data.round === 1 ? "1a RODADA (PEDIDO INICIAL)" : `${data.round}a RODADA (PEDIDO ADICIONAL)`;
  const dateTimeStr = formatTicketDateTime(data.timestamp);

  const tableTitle =
    data.orderCode && data.orderCode.includes("+")
      ? data.orderCode.replace("-", " ")
      : `MESA ${String(data.tableNumber).padStart(2, "0")}`;

  builder
    .init()
    .alignCenter()
    .bold(true)
    .line("*** PRODUCAO / COZINHA ***")
    .line()
    .divider(cols, "=")
    .sizeLarge()
    .line(tableTitle)
    .sizeNormal();

  if (data.orderCode && !data.orderCode.includes("+")) {
    builder.line(`Comanda: ${data.orderCode}`);
  }

  builder
    .divider(cols, "=")
    .alignLeft()
    .line(`Data/Hora: ${dateTimeStr}`)
    .line(`Atendente: ${data.waiter}`)
    .line(`Rodada:    ${roundLabel}`)
    .divider(cols, "-")
    .bold(true)
    .line("ITENS A PREPARAR:")
    .bold(false)
    .line();

  for (const item of data.items) {
    builder.bold(true).line(`[ ${item.qty}x ] ${item.name}`).bold(false);

    if (item.details && item.details.length > 0) {
      for (const d of item.details) {
        builder.line(`   > ${d}`);
      }
    }
    builder.divider(cols, ".");
  }

  builder
    .line()
    .divider(cols, "-")
    .bold(true)
    .line(`TOTAL DE ITENS: ${totalItemsCount}`)
    .bold(false)
    .divider(cols, "=")
    .alignCenter()
    .line("--- CONTROLE DE COZINHA / BAR ---")
    .feedAndCut();

  return builder.toBytes();
}

export async function testPrinterConnection(
  host: string,
  port = 9100,
): Promise<PrinterTestResponse> {
  const isT = isTauri();
  if (!isT) {
    await new Promise((r) => setTimeout(r, 600));
    return {
      success: true,
      message: "Modo Web: Conexao simulada com sucesso (Tauri ativo apenas no app Desktop).",
      latency_ms: 18,
    };
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const res = await invoke<PrinterTestResponse>("test_printer_connection", {
      host: host.trim(),
      port: Number(port),
    });
    return res;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Erro na comunicacao nativa: ${errorMsg}`,
    };
  }
}

export async function sendEscPosToPrinter(
  host: string,
  port = 9100,
  data: Uint8Array,
): Promise<PrinterTestResponse> {
  const isT = isTauri();
  if (!isT) {
    return {
      success: true,
      message: "Modo Web: Impressao simulada com sucesso.",
    };
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const res = await invoke<PrinterTestResponse>("print_raw_escpos", {
      host: host.trim(),
      port: Number(port),
      data: Array.from(data),
    });
    return res;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Falha ao transmitir para impressora: ${errorMsg}`,
    };
  }
}

/**
 * Dispara a impressão via spooler HTML em iframe isolado
 */
export function printKitchenTicketHtml(data: KitchenTicketData): void {
  if (typeof window === "undefined") return;

  const ticketHtml = generateKitchenTicketHtml(data);

  try {
    let iframe = document.getElementById("__pos_printer_frame__") as HTMLIFrameElement | null;
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = "__pos_printer_frame__";
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
      doc.write(ticketHtml);
      doc.close();

      setTimeout(() => {
        try {
          iframe?.contentWindow?.focus();
          iframe?.contentWindow?.print();
        } catch (printErr) {
          console.warn("[Printer Warning]: Falha na chamada print() do iframe:", printErr);
        }
      }, 250);
    }
  } catch (err) {
    console.error("[Printer Error]: Falha ao renderizar cupom de cozinha:", err);
  }
}

/**
 * Dispara a impressão da comanda de cozinha:
 * Se a impressora de rede estiver habilitada e configurada com IP válido, envia via ESC/POS TCP (9100).
 * Se falhar ou estiver desabilitada, recorre de forma transparente ao spooler HTML nativo.
 */
export async function printKitchenTicket(
  data: KitchenTicketData,
  config?: KitchenPrinterConfig,
): Promise<void> {
  if (config?.enabled && config.ip.trim() && isValidIpv4(config.ip)) {
    try {
      const escposData = generateKitchenTicketEscPos(data, config.paperWidth);
      const res = await sendEscPosToPrinter(config.ip, config.port || 9100, escposData);
      if (res.success) {
        return;
      }
      console.warn("[Printer Warning]: Falha na rede, recorrendo ao spooler HTML:", res.message);
      toast.warning("Impressora de rede inacessível. Abrindo diálogo do sistema...", {
        description: res.message,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn("[Printer Warning]: Erro no socket ESC/POS:", errorMsg);
      toast.warning("Falha de conexão com a impressora. Recorrendo ao diálogo do sistema...", {
        description: errorMsg,
      });
    }
  }

  printKitchenTicketHtml(data);
}

// ============================================================================
// CONFERÊNCIA DE MESA / PRÉ-CONTA (NÃO FISCAL)
// ============================================================================

export type PreContaTicketData = {
  tableNumber: number;
  mergedWith?: number[] | undefined;
  seats: number;
  waiter: string;
  openedAt: number | null;
  items: {
    id: string;
    name: string;
    qty: number;
    unitPrice: number;
    details?: string[] | undefined;
  }[];
  subtotal: number;
  discount: number;
  serviceFee: number;
  serviceFeePercent: number;
  totalWithService: number;
  totalWithoutService: number;
  perPersonWithService: number;
  perPersonWithoutService: number;
  timestamp?: number | string | undefined;
};

export function generatePreContaReceiptEscPos(
  data: PreContaTicketData,
  paperWidth: "80mm" | "58mm" = "80mm",
): Uint8Array {
  const cols = paperWidth === "58mm" ? 32 : 48;
  const builder = new EscPosBuilder();
  const dateStr = formatTicketDateTime(data.timestamp);

  const groupTablesStr =
    data.mergedWith && data.mergedWith.length > 0
      ? `Mesa ${String(data.tableNumber).padStart(2, "0")} (+${data.mergedWith.map((n) => String(n).padStart(2, "0")).join(", ")})`
      : `Mesa ${String(data.tableNumber).padStart(2, "0")}`;

  builder.init();
  builder.alignCenter().bold(true).line("*** FLUXO PDV ***");
  builder.line("CONFERENCIA DE MESA");
  builder.line("(PRE-CONTA)");
  builder.bold(false).divider(cols, "=");

  builder.alignLeft();
  builder.bold(true).line(`LOCAL:     ${groupTablesStr}`).bold(false);
  builder.line(`Atendente: ${data.waiter}`);
  builder.line(`Lugares:   ${data.seats} pessoas`);
  builder.line(`Emissao:   ${dateStr}`);
  if (data.openedAt) {
    const elapsedMinutes = Math.max(1, Math.round((Date.now() - data.openedAt) / 60000));
    const hours = Math.floor(elapsedMinutes / 60);
    const mins = elapsedMinutes % 60;
    const durStr = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;
    builder.line(`Permanencia: ${durStr}`);
  }
  builder.divider(cols, "-");

  builder.bold(true).line("ITENS CONSUMIDOS:").bold(false);
  builder.line();

  for (const item of data.items) {
    const lineTotal = item.unitPrice * item.qty;
    builder.bold(true);
    builder.line(`[ ${item.qty}x ] ${item.name}`);
    builder.bold(false);
    builder.line(`       ${item.qty} x ${brl(item.unitPrice)} = ${brl(lineTotal)}`);
    if (item.details && item.details.length > 0) {
      for (const d of item.details) {
        builder.line(`       > ${d}`);
      }
    }
  }

  builder.divider(cols, "-");
  builder.alignLeft();
  builder.line(`Subtotal:                  ${brl(data.subtotal)}`);
  if (data.discount > 0) {
    builder.line(`Desconto:                 -${brl(data.discount)}`);
  }
  if (data.serviceFee > 0) {
    builder.line(`Taxa de Servico (${data.serviceFeePercent}%):      ${brl(data.serviceFee)}`);
    builder.line(`(Taxa facultativa/opcional)`);
  }

  builder.divider(cols, "=");
  builder.bold(true).sizeLarge().alignRight();
  if (data.serviceFee > 0) {
    builder.line(`TOTAL C/ TAXA: ${brl(data.totalWithService)}`);
    builder.sizeNormal().bold(false).alignRight();
    builder.line(`TOTAL S/ TAXA: ${brl(data.totalWithoutService)}`);
  } else {
    builder.line(`TOTAL A PAGAR: ${brl(data.totalWithoutService)}`);
    builder.sizeNormal().bold(false);
  }

  builder.sizeNormal().bold(false).alignLeft();
  builder.divider(cols, "-");

  if (data.seats > 1) {
    builder.bold(true).line(`DIVISAO SUGERIDA (${data.seats} PESSOAS):`).bold(false);
    if (data.serviceFee > 0) {
      builder.line(`  - Com taxa (${data.serviceFeePercent}%):   ${brl(data.perPersonWithService)} / pessoa`);
      builder.line(`  - Sem taxa:         ${brl(data.perPersonWithoutService)} / pessoa`);
    } else {
      builder.line(`  - Valor por pessoa: ${brl(data.perPersonWithoutService)}`);
    }
    builder.divider(cols, "-");
  }

  builder.alignCenter();
  builder.line("ESTE COMPROVANTE NAO TEM VALOR FISCAL");
  builder.line("SIMPLES CONFERENCIA DE CONSUMO");
  builder.divider(cols, "=");
  builder.feedAndCut();

  return builder.toBytes();
}

export function generatePreContaReceiptHtml(data: PreContaTicketData): string {
  const dateStr = formatTicketDateTime(data.timestamp);
  const groupTablesStr =
    data.mergedWith && data.mergedWith.length > 0
      ? `Mesa ${String(data.tableNumber).padStart(2, "0")} (+${data.mergedWith.map((n) => String(n).padStart(2, "0")).join(", ")})`
      : `Mesa ${String(data.tableNumber).padStart(2, "0")}`;

  const itemsHtml = data.items
    .map((item) => {
      const lineTotal = item.unitPrice * item.qty;
      const detailsHtml =
        item.details && item.details.length > 0
          ? `<div style="font-size: 10px; margin-left: 12px; color: #555;">${item.details.map((d) => `• ${escapeHtml(d)}`).join("<br/>")}</div>`
          : "";
      return `
        <div style="margin: 4px 0;">
          <div style="display: flex; justify-content: space-between; font-weight: bold;">
            <span>[${item.qty}x] ${escapeHtml(item.name)}</span>
            <span>${brl(lineTotal)}</span>
          </div>
          <div style="font-size: 10px; color: #666; margin-left: 8px;">
            ${item.qty} x ${brl(item.unitPrice)}
          </div>
          ${detailsHtml}
        </div>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Pré-Conta - Mesa ${String(data.tableNumber).padStart(2, "0")}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      width: 78mm;
      margin: 0 auto;
      padding: 8px;
      font-size: 12px;
      line-height: 1.25;
      color: #000;
    }
    .text-center { text-align: center; }
    .bold { font-weight: bold; }
    .divider { border-bottom: 1px dashed #000; margin: 6px 0; }
    .double-divider { border-bottom: 2px solid #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; margin: 2px 0; }
  </style>
</head>
<body>
  <div class="text-center bold" style="font-size: 14px;">*** FLUXO PDV ***</div>
  <div class="text-center bold">CONFERÊNCIA DE MESA</div>
  <div class="text-center" style="font-size: 11px;">(PRÉ-CONTA NÃO FISCAL)</div>
  <div class="double-divider"></div>
  <div class="row"><strong>LOCAL:</strong><span>${escapeHtml(groupTablesStr)}</span></div>
  <div class="row"><span>Atendente:</span><span>${escapeHtml(data.waiter)}</span></div>
  <div class="row"><span>Lugares:</span><span>${data.seats} pessoas</span></div>
  <div class="row"><span>Data/Hora:</span><span>${dateStr}</span></div>
  <div class="divider"></div>
  <div class="bold" style="margin-bottom: 4px;">CONSUMO:</div>
  ${itemsHtml}
  <div class="divider"></div>
  <div class="row"><span>Subtotal:</span><span>${brl(data.subtotal)}</span></div>
  ${data.discount > 0 ? `<div class="row"><span>Desconto:</span><span>-${brl(data.discount)}</span></div>` : ""}
  ${data.serviceFee > 0 ? `<div class="row"><span>Taxa de Serviço (${data.serviceFeePercent}%):</span><span>${brl(data.serviceFee)}</span></div><div style="font-size: 10px; color: #555; text-align: right;">(Opcional)</div>` : ""}
  <div class="double-divider"></div>
  ${
    data.serviceFee > 0
      ? `
    <div class="row" style="font-size: 14px; font-weight: bold;">
      <span>TOTAL C/ TAXA:</span>
      <span>${brl(data.totalWithService)}</span>
    </div>
    <div class="row" style="font-size: 12px; font-weight: bold; color: #444;">
      <span>TOTAL S/ TAXA:</span>
      <span>${brl(data.totalWithoutService)}</span>
    </div>
  `
      : `
    <div class="row" style="font-size: 15px; font-weight: bold;">
      <span>TOTAL:</span>
      <span>${brl(data.totalWithoutService)}</span>
    </div>
  `
  }
  ${
    data.seats > 1
      ? `
    <div class="divider"></div>
    <div class="bold">DIVISÃO POR PESSOA (${data.seats} Lugares):</div>
    ${
      data.serviceFee > 0
        ? `
      <div class="row" style="font-size: 11px;"><span>Com taxa (${data.serviceFeePercent}%):</span><span>${brl(data.perPersonWithService)}</span></div>
      <div class="row" style="font-size: 11px;"><span>Sem taxa:</span><span>${brl(data.perPersonWithoutService)}</span></div>
    `
        : `
      <div class="row" style="font-size: 11px;"><span>Valor por pessoa:</span><span>${brl(data.perPersonWithoutService)}</span></div>
    `
    }
  `
      : ""
  }
  <div class="double-divider"></div>
  <div class="text-center" style="font-size: 10px;">
    DOCUMENTO NÃO FISCAL<br/>
    CONFERÊNCIA DE MESA
  </div>
</body>
</html>`;
}

export function printPreContaTicketHtml(data: PreContaTicketData): void {
  const html = generatePreContaReceiptHtml(data);
  renderIframePrint(html, "__pos_preconta_receipt_frame__");
}

export async function printPreContaTicket(
  data: PreContaTicketData,
  counterConfig?: CounterPrinterConfig,
  kitchenConfig?: KitchenPrinterConfig,
): Promise<{ success: boolean; message: string }> {
  const effective = getEffectiveCounterPrinterConfig(counterConfig, kitchenConfig);

  if (effective.enabled && effective.ip.trim() && isValidIpv4(effective.ip)) {
    try {
      const escposData = generatePreContaReceiptEscPos(data, effective.paperWidth);
      const res = await sendEscPosToPrinter(effective.ip, effective.port || 9100, escposData);
      if (res.success) {
        return { success: true, message: `Pré-conta impressa via ESC/POS (${effective.ip})` };
      }
      console.warn("[printPreContaTicket]: Falha no socket ESC/POS:", res.message);
    } catch (err) {
      console.warn("[printPreContaTicket]: Falha ao enviar para impressora:", err);
    }
  }

  printPreContaTicketHtml(data);
  return { success: true, message: "Pré-conta enviada para o spooler de impressão" };
}

// ============================================================================
// COMPROVANTE DE VENDA / CUPOM NÃO FISCAL
// ============================================================================

export function generateSaleReceiptEscPos(
  sale: Sale,
  paperWidth: "80mm" | "58mm" = "80mm",
): Uint8Array {
  const cols = paperWidth === "58mm" ? 32 : 48;
  const builder = new EscPosBuilder();

  builder.init();
  builder.alignCenter().bold(true).line("*** FLUXO PDV ***");
  builder.line("COMPROVANTE NAO FISCAL");
  builder.bold(false).divider(cols, "=");

  builder.alignLeft();
  builder.bold(true).line(`CUPOM: ${sale.code}`).bold(false);
  builder.line(`Origem:    ${sale.origin}`);
  builder.line(`Data/Hora: ${formatTicketDateTime(sale.createdAt)}`);
  builder.line(`Turno:     ${sale.shift}`);
  if (sale.cpf) {
    builder.line(`CPF:       ${sale.cpf}`);
  }
  builder.divider(cols, "-");

  builder.bold(true).line("ITENS DO PEDIDO:").bold(false);
  builder.line();

  for (const item of sale.items) {
    const itemPrice = item.unitPrice ?? item.price ?? 0;
    const lineTotal = itemPrice * item.qty;
    builder.bold(true);
    builder.line(`[ ${item.qty}x ] ${item.name}`);
    builder.bold(false);
    builder.line(`       ${item.qty} x ${brl(itemPrice)} = ${brl(lineTotal)}`);
    if (item.details && item.details.length > 0) {
      for (const d of item.details) {
        builder.line(`       > ${d}`);
      }
    }
  }

  builder.divider(cols, "-");
  builder.alignLeft();
  if (sale.serviceFee > 0) {
    builder.line(`Taxa de Servico:    ${brl(sale.serviceFee)}`);
  }
  if (sale.tip > 0) {
    builder.line(`Gorjeta:            ${brl(sale.tip)}`);
  }
  if (sale.discount > 0) {
    builder.line(`Desconto:          -${brl(sale.discount)}`);
  }
  builder.bold(true).sizeLarge().alignRight();
  builder.line(`TOTAL: ${brl(sale.total)}`);
  builder.sizeNormal().bold(false).alignLeft();
  builder.divider(cols, "-");

  builder.bold(true).line("PAGAMENTO:").bold(false);
  for (const p of sale.payments) {
    const label = PAYMENT_LABELS[p.method] ?? p.method;
    builder.line(`  ${label.padEnd(20, " ")}: ${brl(p.amount)}`);
  }

  if (sale.courtesyReason) {
    builder.line(`Cortesia: ${sale.courtesyReason}`);
  }

  if (sale.cancelled) {
    builder.divider(cols, "=");
    builder.alignCenter().bold(true).sizeLarge();
    builder.line("*** VENDA CANCELADA / ESTORNADA ***");
    builder.sizeNormal().bold(false);
  }

  builder.divider(cols, "=");
  builder.alignCenter();
  builder.line("Obrigado pela preferencia!");
  builder.line("Volte sempre!");
  builder.feedAndCut();

  return builder.build();
}

export function generateSaleReceiptHtml(sale: Sale): string {
  const dateTimeStr = formatTicketDateTime(sale.createdAt);
  const itemsHtml = sale.items
    .map((item) => {
      const itemPrice = item.unitPrice ?? item.price ?? 0;
      const detailsHtml =
        item.details && item.details.length > 0
          ? `<div style="font-size: 10px; margin-left: 12px; color: #555;">${item.details.map((d) => `• ${escapeHtml(d)}`).join("<br/>")}</div>`
          : "";
      return `
        <div style="margin: 4px 0;">
          <div style="display: flex; justify-content: space-between; font-weight: bold;">
            <span>[${item.qty}x] ${escapeHtml(item.name)}</span>
            <span>${brl(itemPrice * item.qty)}</span>
          </div>
          <div style="font-size: 10px; color: #666;">${item.qty} × ${brl(itemPrice)}</div>
          ${detailsHtml}
        </div>
      `;
    })
    .join("");

  const paymentsHtml = sale.payments
    .map((p) => {
      const label = PAYMENT_LABELS[p.method] ?? p.method;
      return `<div style="display: flex; justify-content: space-between;"><span>${escapeHtml(label)}:</span><span style="font-weight: bold;">${brl(p.amount)}</span></div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Cupom ${escapeHtml(sale.code)}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      width: 76mm;
      padding: 4mm;
      margin: 0 auto;
      font-size: 12px;
      line-height: 1.25;
      color: #000;
    }
    .text-center { text-align: center; }
    .bold { font-weight: bold; }
    .divider { border-bottom: 1px dashed #000; margin: 6px 0; }
    .double-divider { border-bottom: 2px solid #000; margin: 6px 0; }
  </style>
</head>
<body>
  <div class="text-center bold" style="font-size: 14px;">*** FLUXO PDV ***</div>
  <div class="text-center" style="font-size: 11px;">COMPROVANTE NÃO FISCAL</div>
  <div class="double-divider"></div>
  <div><strong>CUPOM:</strong> ${escapeHtml(sale.code)}</div>
  <div><strong>Origem:</strong> ${escapeHtml(sale.origin)}</div>
  <div><strong>Data/Hora:</strong> ${dateTimeStr}</div>
  <div><strong>Turno:</strong> ${escapeHtml(sale.shift)}</div>
  ${sale.cpf ? `<div><strong>CPF:</strong> ${escapeHtml(sale.cpf)}</div>` : ""}
  <div class="divider"></div>
  <div class="bold" style="margin-bottom: 4px;">ITENS:</div>
  ${itemsHtml}
  <div class="divider"></div>
  ${sale.serviceFee > 0 ? `<div style="display: flex; justify-content: space-between;"><span>Taxa de Serviço:</span><span>${brl(sale.serviceFee)}</span></div>` : ""}
  ${sale.tip > 0 ? `<div style="display: flex; justify-content: space-between;"><span>Gorjeta:</span><span>${brl(sale.tip)}</span></div>` : ""}
  ${sale.discount > 0 ? `<div style="display: flex; justify-content: space-between;"><span>Desconto:</span><span>-${brl(sale.discount)}</span></div>` : ""}
  <div class="double-divider"></div>
  <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: bold;">
    <span>TOTAL:</span>
    <span>${brl(sale.total)}</span>
  </div>
  <div class="divider"></div>
  <div class="bold">FORMA DE PAGAMENTO:</div>
  ${paymentsHtml}
  ${sale.courtesyReason ? `<div style="margin-top: 4px; font-style: italic;">Cortesia: ${escapeHtml(sale.courtesyReason)}</div>` : ""}
  ${sale.cancelled ? `<div class="double-divider"></div><div class="text-center bold" style="font-size: 13px; color: red;">*** VENDA ESTORNADA / CANCELADA ***</div>` : ""}
  <div class="double-divider"></div>
  <div class="text-center" style="font-size: 11px;">
    Obrigado pela preferência!<br/>Volte sempre!
  </div>
</body>
</html>`;
}

function renderIframePrint(html: string, iframeId: string): void {
  if (typeof window === "undefined") return;
  try {
    let iframe = document.getElementById(iframeId) as HTMLIFrameElement | null;
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = iframeId;
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
        try {
          iframe?.contentWindow?.focus();
          iframe?.contentWindow?.print();
        } catch (printErr) {
          console.warn("[Printer Warning]: Falha na chamada print() do iframe:", printErr);
        }
      }, 250);
    }
  } catch (err) {
    console.error("[Printer Error]: Falha ao renderizar iframe de impressão:", err);
  }
}

export function printSaleReceiptHtml(sale: Sale): void {
  const html = generateSaleReceiptHtml(sale);
  renderIframePrint(html, "__pos_sale_receipt_frame__");
}

export async function printSaleReceipt(
  sale: Sale,
  config?: CounterPrinterConfig | KitchenPrinterConfig,
  kitchenConfig?: KitchenPrinterConfig,
): Promise<{ success: boolean; message: string }> {
  let targetIp = "";
  let targetPort = 9100;
  let targetWidth: "80mm" | "58mm" = "80mm";
  let targetEnabled = true;

  if (config && "useKitchenPrinter" in config) {
    const eff = getEffectiveCounterPrinterConfig(config, kitchenConfig);
    targetIp = eff.ip;
    targetPort = eff.port;
    targetWidth = eff.paperWidth;
    targetEnabled = eff.enabled;
  } else if (config) {
    targetIp = config.ip;
    targetPort = config.port;
    targetWidth = config.paperWidth;
    targetEnabled = config.enabled;
  }

  if (targetEnabled && targetIp.trim() && isValidIpv4(targetIp)) {
    try {
      const escposData = generateSaleReceiptEscPos(sale, targetWidth);
      const res = await sendEscPosToPrinter(targetIp, targetPort, escposData);
      if (res.success) {
        return { success: true, message: `Impresso via ESC/POS (${targetIp})` };
      }
    } catch (err) {
      console.warn("[printSaleReceipt]: Falha no socket ESC/POS, usando spooler:", err);
    }
  }
  printSaleReceiptHtml(sale);
  return { success: true, message: "Enviado ao spooler de impressão" };
}

// ============================================================================
// COMPROVANTE DE FECHAMENTO DE TURNO / CAIXA (RELATÓRIO Z/X)
// ============================================================================

export function generateShiftClosingReceiptEscPos(
  summary: ShiftSummaryData,
  paperWidth: "80mm" | "58mm" = "80mm",
): Uint8Array {
  const cols = paperWidth === "58mm" ? 32 : 48;
  const builder = new EscPosBuilder();

  builder.init();
  builder.alignCenter().bold(true).line("*** FLUXO PDV ***");
  builder.line("FECHAMENTO DE CAIXA / TURNO");
  builder.bold(false).divider(cols, "=");

  builder.alignLeft();
  builder.bold(true).line(`TURNO:     ${summary.shiftName}`).bold(false);
  builder.line(`Operador:  ${summary.operatorName}`);
  builder.line(`Abertura:  ${formatTicketDateTime(summary.openedAt)}`);
  if (summary.closedAt) {
    builder.line(`Fechamento:${formatTicketDateTime(summary.closedAt)}`);
  }
  builder.divider(cols, "-");

  builder.bold(true).line("MOVIMENTO DE CAIXA (DINHEIRO):").bold(false);
  builder.line(`Fundo Inicial:          ${brl(summary.openingFloat)}`);
  builder.line(`Vendas em Dinheiro (+): ${brl(summary.cashSales)}`);
  builder.line(`Suprimentos (+):        ${brl(summary.supplies)}`);
  builder.line(`Sangrias (-):          -${brl(summary.bleeds)}`);
  if (summary.cashRefunds > 0) {
    builder.line(`Estornos Dinheiro (-): -${brl(summary.cashRefunds)}`);
  }
  builder.divider(cols, "-");
  builder.bold(true);
  builder.line(`SALDO ESPERADO (DINHEIRO): ${brl(summary.expectedCash)}`);
  if (summary.countedCash !== undefined) {
    builder.line(`SALDO INFORMADO (CONTAGEM): ${brl(summary.countedCash)}`);
    const diff = summary.difference ?? 0;
    const diffLabel =
      diff > 0
        ? `SOBRA: +${brl(diff)}`
        : diff < 0
          ? `FALTA: -${brl(Math.abs(diff))}`
          : "EXATO: R$ 0,00";
    builder.line(`DIFERENCA DE CAIXA:        ${diffLabel}`);
  }
  builder.bold(false);
  builder.divider(cols, "=");

  builder.bold(true).line("FATURAMENTO POR FORMA DE PGTO:").bold(false);
  for (const [method, amount] of Object.entries(summary.salesByMethod)) {
    if (amount && amount > 0) {
      const label = PAYMENT_LABELS[method as keyof typeof PAYMENT_LABELS] ?? method;
      builder.line(`  ${label.padEnd(20, " ")}: ${brl(amount)}`);
    }
  }
  builder.divider(cols, "-");
  builder.bold(true).sizeLarge().alignRight();
  builder.line(`TOTAL VENDAS: ${brl(summary.totalSalesAmount)}`);
  builder.sizeNormal().line(`QTD DE VENDAS: ${summary.totalSalesCount}`);
  builder.bold(false).alignCenter();
  builder.divider(cols, "=");
  builder.line("--- FIM DO RELATORIO DE TURNO ---");
  builder.feedAndCut();

  return builder.build();
}

export function generateShiftClosingReceiptHtml(summary: ShiftSummaryData): string {
  const openedStr = formatTicketDateTime(summary.openedAt);
  const closedStr = summary.closedAt ? formatTicketDateTime(summary.closedAt) : "Em andamento";
  const diff = summary.difference ?? 0;
  const diffLabel =
    diff > 0
      ? `SOBRA: +${brl(diff)}`
      : diff < 0
        ? `FALTA: -${brl(Math.abs(diff))}`
        : "EXATO (Sem diferença)";

  const methodsHtml = Object.entries(summary.salesByMethod)
    .filter(([_, amt]) => amt && amt > 0)
    .map(([method, amt]) => {
      const label = PAYMENT_LABELS[method as keyof typeof PAYMENT_LABELS] ?? method;
      return `<div style="display: flex; justify-content: space-between;"><span>${escapeHtml(label)}:</span><span style="font-weight: bold;">${brl(amt ?? 0)}</span></div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Fechamento de Caixa - ${escapeHtml(summary.shiftName)}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      width: 76mm;
      padding: 4mm;
      margin: 0 auto;
      font-size: 12px;
      line-height: 1.25;
      color: #000;
    }
    .text-center { text-align: center; }
    .bold { font-weight: bold; }
    .divider { border-bottom: 1px dashed #000; margin: 6px 0; }
    .double-divider { border-bottom: 2px solid #000; margin: 6px 0; }
  </style>
</head>
<body>
  <div class="text-center bold" style="font-size: 14px;">*** FLUXO PDV ***</div>
  <div class="text-center bold" style="font-size: 12px;">FECHAMENTO DE CAIXA / TURNO</div>
  <div class="double-divider"></div>
  <div><strong>Turno:</strong> ${escapeHtml(summary.shiftName)}</div>
  <div><strong>Operador:</strong> ${escapeHtml(summary.operatorName)}</div>
  <div><strong>Abertura:</strong> ${openedStr}</div>
  <div><strong>Fechamento:</strong> ${closedStr}</div>
  <div class="divider"></div>
  <div class="bold" style="margin-bottom: 4px;">CONCILIAÇÃO EM DINHEIRO:</div>
  <div style="display: flex; justify-content: space-between;"><span>Fundo Inicial:</span><span>${brl(summary.openingFloat)}</span></div>
  <div style="display: flex; justify-content: space-between;"><span>Vendas Dinheiro (+):</span><span>${brl(summary.cashSales)}</span></div>
  <div style="display: flex; justify-content: space-between;"><span>Suprimentos (+):</span><span>${brl(summary.supplies)}</span></div>
  <div style="display: flex; justify-content: space-between;"><span>Sangrias (-):</span><span>-${brl(summary.bleeds)}</span></div>
  ${summary.cashRefunds > 0 ? `<div style="display: flex; justify-content: space-between;"><span>Estornos Dinheiro (-):</span><span>-${brl(summary.cashRefunds)}</span></div>` : ""}
  <div class="divider"></div>
  <div style="display: flex; justify-content: space-between; font-weight: bold;">
    <span>SALDO ESPERADO:</span>
    <span>${brl(summary.expectedCash)}</span>
  </div>
  ${
    summary.countedCash !== undefined
      ? `
  <div style="display: flex; justify-content: space-between; font-weight: bold;">
    <span>SALDO CONTADO:</span>
    <span>${brl(summary.countedCash)}</span>
  </div>
  <div style="display: flex; justify-content: space-between; font-weight: bold; margin-top: 4px; padding: 2px 4px; background: #eee;">
    <span>DIFERENÇA:</span>
    <span>${diffLabel}</span>
  </div>`
      : ""
  }
  <div class="double-divider"></div>
  <div class="bold" style="margin-bottom: 4px;">FATURAMENTO POR MÉTODO:</div>
  ${methodsHtml}
  <div class="divider"></div>
  <div style="display: flex; justify-content: space-between; font-size: 14px; font-weight: bold;">
    <span>TOTAL VENDAS:</span>
    <span>${brl(summary.totalSalesAmount)}</span>
  </div>
  <div style="display: flex; justify-content: space-between; font-size: 11px;">
    <span>QUANTIDADE DE VENDAS:</span>
    <span>${summary.totalSalesCount} cupons</span>
  </div>
  <div class="double-divider"></div>
  <div class="text-center" style="font-size: 10px;">
    --- RELATÓRIO DE ENCERRAMENTO DE TURNO ---
  </div>
</body>
</html>`;
}

export function printShiftClosingReceiptHtml(summary: ShiftSummaryData): void {
  const html = generateShiftClosingReceiptHtml(summary);
  renderIframePrint(html, "__pos_shift_closing_frame__");
}

export async function printShiftClosingReceipt(
  summary: ShiftSummaryData,
  config?: CounterPrinterConfig | KitchenPrinterConfig,
  kitchenConfig?: KitchenPrinterConfig,
): Promise<{ success: boolean; message: string }> {
  let targetIp = "";
  let targetPort = 9100;
  let targetWidth: "80mm" | "58mm" = "80mm";
  let targetEnabled = true;

  if (config && "useKitchenPrinter" in config) {
    const eff = getEffectiveCounterPrinterConfig(config, kitchenConfig);
    targetIp = eff.ip;
    targetPort = eff.port;
    targetWidth = eff.paperWidth;
    targetEnabled = eff.enabled;
  } else if (config) {
    targetIp = config.ip;
    targetPort = config.port;
    targetWidth = config.paperWidth;
    targetEnabled = config.enabled;
  }

  if (targetEnabled && targetIp.trim() && isValidIpv4(targetIp)) {
    try {
      const escposData = generateShiftClosingReceiptEscPos(summary, targetWidth);
      const res = await sendEscPosToPrinter(targetIp, targetPort, escposData);
      if (res.success) {
        return { success: true, message: `Fechamento impresso via ESC/POS (${targetIp})` };
      }
    } catch (err) {
      console.warn("[printShiftClosingReceipt]: Falha no socket ESC/POS, usando spooler:", err);
    }
  }
  printShiftClosingReceiptHtml(summary);
  return { success: true, message: "Fechamento enviado ao spooler de impressão" };
}

export function generateFiadoPaymentHtml(customer: Customer, transaction: CustomerTransaction): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Recibo de Pagamento - Fiado</title>
  <style>
    @page { margin: 0; size: auto; }
    body {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      line-height: 1.35;
      width: 72mm;
      margin: 0 auto;
      padding: 10px 4px;
      color: #000;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: bold; }
    .title { font-size: 14px; font-weight: bold; margin-bottom: 4px; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .double-divider { border-top: 2px solid #000; margin: 8px 0; }
    .flex-row { display: flex; justify-content: space-between; }
    .signature { margin-top: 28px; text-align: center; border-top: 1px solid #000; padding-top: 4px; font-size: 11px; }
  </style>
</head>
<body>
  <div class="text-center">
    <div class="title">COMPROVANTE DE PAGAMENTO</div>
    <div style="font-size: 11px; font-weight: bold;">CONTA CLIENTE / FIADO</div>
  </div>
  <div class="divider"></div>
  <div class="flex-row">
    <span>Data:</span>
    <span>${new Date(transaction.createdAt).toLocaleString("pt-BR")}</span>
  </div>
  <div class="flex-row">
    <span>Cliente:</span>
    <span class="bold">${customer.name}</span>
  </div>
  ${customer.phone ? `<div class="flex-row"><span>Telefone:</span><span>${customer.phone}</span></div>` : ""}
  ${customer.cpf ? `<div class="flex-row"><span>CPF:</span><span>${customer.cpf}</span></div>` : ""}
  <div class="double-divider"></div>
  <div class="flex-row" style="font-size: 13px;">
    <span class="bold">VALOR PAGO:</span>
    <span class="bold">${brl(transaction.amount)}</span>
  </div>
  <div class="flex-row">
    <span>Forma:</span>
    <span>${(transaction.paymentMethod || "Dinheiro").toUpperCase()}</span>
  </div>
  <div class="flex-row" style="margin-top: 4px;">
    <span>Saldo Restante:</span>
    <span class="bold">${brl(transaction.balanceAfter)}</span>
  </div>
  ${transaction.notes ? `<div style="margin-top: 4px; font-size: 11px;">Obs: ${transaction.notes}</div>` : ""}
  <div class="signature">
    Assinatura / Visto do Caixa
  </div>
  <div class="text-center" style="margin-top: 8px; font-size: 10px;">
    Obrigado pela preferência!
  </div>
</body>
</html>`;
}

export function printFiadoPaymentReceipt(
  customer: Customer,
  transaction: CustomerTransaction,
): void {
  const html = generateFiadoPaymentHtml(customer, transaction);
  renderIframePrint(html, "__pos_fiado_payment_frame__");
}

