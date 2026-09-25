import { brl } from "./format";
import type { OrderItem, Payment, TableT } from "./types";

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
  lines.push(padLine(`MESA: ${String(data.tableNumber).padStart(2, "0")}`, `GARCOM: ${data.waiter}`));
  lines.push(padLine(`EMISSAO:`, new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })));
  if (data.saleCode) {
    lines.push(padLine(`CUPOM:`, data.saleCode));
  }
  lines.push(divider("-"));

  // Cabeçalho de Itens
  lines.push(padLine("ITEM / QTD", "TOTAL"));
  lines.push(divider("."));

  // Itens
  data.items.forEach((it) => {
    const itemTotal = it.totalPrice ?? it.qty * it.unitPrice;
    const nameStr = `${it.qty}x ${it.name}`;
    lines.push(padLine(nameStr.substring(0, 21), brl(itemTotal)));

    if (it.details && it.details.length > 0) {
      it.details.forEach((d) => {
        lines.push(`  + ${d}`.substring(0, LINE_WIDTH));
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

  // Pagamentos (se houver)
  if (data.payments && data.payments.length > 0) {
    lines.push(centerLine("PAGAMENTOS EFETUADOS"));
    data.payments.forEach((p) => {
      lines.push(padLine(p.method.toUpperCase(), brl(p.amount)));
    });
    lines.push(divider("-"));
  }

  // Rodapé
  lines.push(centerLine("OBRIGADO PELA PREFERENCIA!"));
  lines.push(centerLine("VOLTE SEMPRE"));
  lines.push("\n\n\n"); // Espaço para corte do papel da bobina térmica

  return lines.join("\n");
}

/**
 * Dispara a impressão na impressora térmica da maquininha ou do navegador.
 */
export function printReceipt(data: ReceiptData) {
  const receiptText = generate58mmText(data);

  // Cria um elemento invisível para impressão limpa
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

  window.print();
}
