import { brl } from "./format";
import { PAYMENT_LABELS, type OrderItem, type Payment } from "./types";

export interface ReceiptData {
  title: string;
  tableNumber: number;
  waiter: string;
  items: OrderItem[];
  subtotal: number;
  serviceFee: number;
  discount: number;
  total: number;
  payments?: Payment[];
  openedAt?: number | string | null;
  closedAt?: string;
  saleCode?: string;
  cpf?: string | null;
}

const LINE_WIDTH = 32;

function padLine(left: string, right: string, width = LINE_WIDTH): string {
  const spaceCount = Math.max(1, width - left.length - right.length);
  return left + " ".repeat(spaceCount) + right;
}

function centerLine(text: string, width = LINE_WIDTH): string {
  if (text.length >= width) return text.substring(0, width);
  const leftPad = Math.floor((width - text.length) / 2);
  return " ".repeat(leftPad) + text;
}

function divider(char = "-", width = LINE_WIDTH): string {
  return char.repeat(width);
}

export function generate58mmText(data: ReceiptData): string {
  const lines: string[] = [];

  // Cabeçalho
  lines.push(centerLine("FLUXO RESTAURANTE"));
  lines.push(centerLine("SISTEMA DE GESTAO INTEGRADO"));
  lines.push(divider("="));
  lines.push(centerLine(`*** ${data.title.toUpperCase()} ***`));
  lines.push(divider("-"));

  // Dados da Mesa e Atendente
  lines.push(
    padLine(`MESA: #${String(data.tableNumber).padStart(2, "0")}`, `GARCOM: ${data.waiter}`)
  );
  lines.push(
    padLine(
      `EMISSAO:`,
      new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    )
  );
  if (data.saleCode) {
    lines.push(padLine(`CUPOM:`, data.saleCode));
  }
  if (data.cpf) {
    lines.push(padLine(`CPF CLIENTE:`, data.cpf));
  }
  lines.push(divider("-"));

  // Cabeçalho de Itens
  lines.push(padLine("ITEM / QTD", "TOTAL"));
  lines.push(divider("."));

  // Itens e Modificadores
  data.items.forEach((it) => {
    const itemTotal = it.totalPrice ?? it.qty * it.unitPrice;
    const nameStr = `${it.qty}x ${it.name}`;
    lines.push(padLine(nameStr.substring(0, 20), brl(itemTotal)));

    if (it.details && it.details.length > 0) {
      it.details.forEach((d) => {
        lines.push(`  * ${d}`.substring(0, LINE_WIDTH));
      });
    }
  });

  lines.push(divider("-"));

  // Totais
  lines.push(padLine("SUBTOTAL:", brl(data.subtotal)));
  if (data.discount > 0) {
    lines.push(padLine("DESCONTO:", `-${brl(data.discount)}`));
  }
  if (data.serviceFee > 0) {
    lines.push(padLine("TAXA SERV (10%):", brl(data.serviceFee)));
  }
  lines.push(divider("="));
  lines.push(padLine("TOTAL:", brl(data.total)));
  lines.push(divider("="));

  // Pagamentos (Múltiplos / Parciais)
  if (data.payments && data.payments.length > 0) {
    lines.push(centerLine("PAGAMENTOS EFETUADOS"));
    data.payments.forEach((p, idx) => {
      const label = PAYMENT_LABELS[p.method] || p.method.toUpperCase();
      lines.push(padLine(`${idx + 1}. ${label}`, brl(p.amount)));
      if (p.changeAmount && p.changeAmount > 0) {
        lines.push(padLine("   (TROCO):", brl(p.changeAmount)));
      }
    });
    lines.push(divider("-"));
  }

  // Rodapé
  lines.push(centerLine("OBRIGADO PELA PREFERENCIA!"));
  lines.push(centerLine("VOLTE SEMPRE"));
  lines.push("\n\n\n"); // Espaço para guilhotina da bobina térmica

  return lines.join("\n");
}

/**
 * Dispara a impressão na impressora térmica da maquininha ou do navegador.
 */
export function printReceipt(data: ReceiptData) {
  const receiptText = generate58mmText(data);

  try {
    // Cria elemento invisível para impressão CSS
    const existingPrintDiv = document.getElementById("thermal-print-container");
    if (existingPrintDiv) {
      existingPrintDiv.remove();
    }

    const printDiv = document.createElement("div");
    printDiv.id = "thermal-print-container";
    printDiv.className = "print-only";
    printDiv.style.display = "none";
    printDiv.innerHTML = `<pre style="font-family: 'Courier New', Courier, monospace; font-size: 11px; margin: 0; white-space: pre-wrap;">${receiptText}</pre>`;

    document.body.appendChild(printDiv);

    if (typeof window !== "undefined" && typeof window.print === "function") {
      window.print();
    }
  } catch (err) {
    console.warn("[printReceipt Error]:", err);
  }
}

/**
 * Dispara um cupom de teste na impressora térmica integrada 58mm da maquininha
 */
export function printTestReceipt(deviceId?: string): void {
  printReceipt({
    title: "Teste de Impressão POS",
    tableNumber: 99,
    waiter: deviceId || "Operador",
    items: [
      {
        id: "test-item-1",
        name: "1x Bobina Térmica 58mm",
        qty: 1,
        unitPrice: 0,
        totalPrice: 0,
        details: ["Status: Hardware OK", "Densidade: Normal"],
      },
    ],
    subtotal: 0,
    serviceFee: 0,
    discount: 0,
    total: 0,
    saleCode: `TST-${Date.now().toString().slice(-4)}`,
  });
}

