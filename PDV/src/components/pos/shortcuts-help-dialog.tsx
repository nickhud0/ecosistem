import { Keyboard, Sparkles, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-6 px-1.5 py-0.5 rounded-md bg-muted text-foreground border border-border/80 text-[11px] font-mono font-bold shadow-xs">
      {children}
    </kbd>
  );
}

const SHORTCUT_SECTIONS = [
  {
    title: "Navegação Global",
    items: [
      { keys: ["F1"], label: "Abrir / Fechar este Guia de Atalhos" },
      { keys: ["Alt", "1"], label: "Ir para Salão & Mesas" },
      { keys: ["Alt", "2"], label: "Ir para Venda Balcão (Caixa Rápido)" },
      { keys: ["Alt", "3"], label: "Ir para Delivery & iFood" },
      { keys: ["Alt", "4"], label: "Ir para Gaveta de Caixa" },
      { keys: ["Alt", "5"], label: "Ir para Histórico de Vendas" },
      { keys: ["Alt", "6"], label: "Ir para Controle de Esgotados" },
      { keys: ["F11"], label: "Alternar Modo Tela Cheia (Kiosk)" },
      { keys: ["Esc"], label: "Fechar janela aberta / Cancelar" },
    ],
  },
  {
    title: "Venda no Balcão (Caixa Rápido)",
    items: [
      { keys: ["/"], label: "Focar na busca de produtos" },
      { keys: ["Enter"], label: "Lançar produto filtrado no carrinho" },
      { keys: ["+"], label: "Aumentar quantidade do item" },
      { keys: ["-"], label: "Diminuir quantidade do item" },
      { keys: ["Del"], label: "Remover item do carrinho" },
      { keys: ["Ctrl", "Del"], label: "Limpar todo o carrinho" },
      { keys: ["Alt", "C"], label: "Identificar cliente (Nome/CPF)" },
      { keys: ["F12"], label: "Pagar e Enviar à Cozinha (Abrir Checkout)" },
    ],
  },
  {
    title: "Salão & Mesas",
    items: [
      { keys: ["0..9"], label: "Digitar número da mesa para abrir imediatamente (ex: 2 ou 12)" },
      { keys: ["Enter"], label: "Confirmar abertura da mesa digitada ou buscada" },
      { keys: ["←", "→", "↑", "↓"], label: "Navegar entre as mesas no salão" },
      { keys: ["F2"], label: "Adicionar itens na comanda da mesa" },
      { keys: ["F4"], label: "Enviar pedidos pendentes para a Cozinha" },
      { keys: ["F8"], label: "Imprimir Pré-Conta (Conferência de Mesa)" },
      { keys: ["F12"], label: "Fechar e Pagar comanda (Checkout)" },
      { keys: ["Esc"], label: "Fechar painel lateral da comanda" },
    ],
  },
  {
    title: "Tela de Pagamento (Checkout)",
    items: [
      { keys: ["1"], label: "Pix (ou F1)" },
      { keys: ["2"], label: "Cartão de Crédito (ou F2)" },
      { keys: ["3"], label: "Cartão de Débito (ou F3)" },
      { keys: ["4"], label: "Dinheiro (ou F4)" },
      { keys: ["5"], label: "Fiado / Conta do Cliente (ou F5)" },
      { keys: ["6"], label: "Cortesia 100% (ou F6)" },
      { keys: ["Espaço"], label: "Preencher valor restante exato da conta" },
      { keys: ["+"], label: "Adicionar pagamento parcial" },
      { keys: ["Enter"], label: "Confirmar pagamento e finalizar venda" },
      { keys: ["Esc"], label: "Cancelar checkout e voltar" },
    ],
  },
  {
    title: "Gaveta de Dinheiro & Turno",
    items: [
      { keys: ["Alt", "S"], label: "Registrar Sangria (Retirada de dinheiro)" },
      { keys: ["Alt", "U"], label: "Registrar Suprimento (Entrada de troco)" },
      { keys: ["F10"], label: "Encerrar Turno / Fechar Caixa" },
    ],
  },
];

export function ShortcutsHelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-6 bg-card rounded-3xl max-h-[85vh] flex flex-col">
        <DialogHeader className="mb-2 shrink-0">
          <DialogTitle className="text-lg font-display font-bold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Keyboard className="size-5 text-brand" />
              Atalhos de Teclado do PDV
            </span>
            <span className="text-xs font-normal text-muted-foreground flex items-center gap-1.5 mr-6">
              <Sparkles className="size-3 text-brand" />
              Operação de Alta Velocidade
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-5 text-xs">
          <p className="text-muted-foreground">
            Utilize os atalhos de teclado para operar o caixa com máxima agilidade sem precisar tirar as mãos das teclas.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SHORTCUT_SECTIONS.map((section) => (
              <div
                key={section.title}
                className="rounded-2xl glass-soft p-4 space-y-2.5 border border-border/50"
              >
                <h4 className="font-display font-semibold text-xs text-foreground tracking-wide flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-brand" />
                  {section.title}
                </h4>

                <div className="space-y-1.5 pt-1">
                  {section.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between py-1 border-b border-border/20 last:border-b-0 gap-2"
                    >
                      <span className="text-muted-foreground text-[11px] leading-tight">
                        {item.label}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        {item.keys.map((k, kIdx) => (
                          <span key={kIdx} className="flex items-center gap-1">
                            <Kbd>{k}</Kbd>
                            {kIdx < item.keys.length - 1 && (
                              <span className="text-[10px] text-muted-foreground">+</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground shrink-0">
          <span>
            Pressione <Kbd>Esc</Kbd> a qualquer momento para fechar este guia.
          </span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded-xl bg-brand text-brand-foreground font-semibold text-xs hover:bg-brand/90 transition-colors"
          >
            Entendido
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
