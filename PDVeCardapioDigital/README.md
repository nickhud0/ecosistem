# Quick Serve POS

Contexto do Projeto e Regras de UI/UX

​Você é um desenvolvedor frontend especialista. Sua tarefa é criar a interface de um PDV (Frente de Caixa) para restaurantes, desenhado para rodar em telas de toque (touchscreen) de desktop. O foco é máxima velocidade operacional, minimização de cliques e alta legibilidade.

Stack Visual: Use React, Tailwind CSS, ícones lucide-react e componentes inspirados no shadcn/ui.

Layout Base: Barra de navegação lateral (Sidebar) retrátil com ícones grandes para alternar entre as abas principais, e uma área de conteúdo principal. Suporte a Dark Mode obrigatório.

​1. Tela de Autenticação e Controle de Turno (Acesso Inicial)

​Login: Teclado numérico na tela (Numpad) para entrada de PIN (4 a 6 dígitos). Sem uso de e-mail/senha.

​Abertura de Turno: Modal simples solicitando o "Fundo de Troco" (saldo inicial do caixa em R$) ao logar pela primeira vez no dia.

​2. Aba Principal: Salão e Mesas (Dashboard Operacional)

​Grid de Mesas: Exibição em blocos/cards.

​Sistema de Cores (Status): Verde (Livre), Amarelo (Ocupada), Vermelho/Piscante (Aguardando Conta).

​Card da Mesa: Deve exibir o número da mesa, tempo de permanência, valor total atual e nome do garçom.

​Top Bar: Campo de busca rápida de mesa/comanda e central de alertas (ex: "Falta papel na impressora").

​3. Painel de Gestão da Mesa (Aberto ao clicar em uma mesa ocupada)

​Layout Dividido:

​Esquerda (Extrato): Lista de itens consumidos (Produto, Qtd, Valor Unitário, Valor Total).

​Direita (Ações): Grid de botões grandes.

​Botões de Ação: Cancelar Item, Transferir Item (entre mesas), Juntar Mesas, Aplicar Desconto (% ou R$), Imprimir Pré-Conta.

​4. Tela de Checkout e Pagamento (Fluxo Final da Mesa)

​Resumo: Subtotal, Toggle/Switch para Taxa de Serviço (10%), Total Final.

​Divisão de Conta (Split):

​Opção 1: Input para dividir em partes iguais.

​Opção 2: Checklist dos itens para pagar apenas o consumido.

​Multi-Pagamentos: Grid de métodos (PIX, Crédito, Débito, Dinheiro). Permitir inserir valores parciais em múltiplos métodos.

​Calculadora de Troco: Exibição em destaque do troco gerado se o valor em dinheiro for maior que a dívida.

​Ação Final: Botão grande "Finalizar e Emitir NFC-e" (com input opcional para CPF).

​5. Aba: Venda Balcão (Fast-food / Takeaway)

​Layout POS Clássico: Categorias de produtos à esquerda (lista), grid de produtos ao centro (com fotos/cores), carrinho/resumo fixo à direita.

​Ação Rápida: Input para "Nome do Cliente", botão de pagamento direto e envio automático para a cozinha apenas após o pagamento.

​6. Aba: Delivery Omnichannel (iFood, WhatsApp, Telefone)

​Visão Kanban: 4 colunas horizontais (Novos, Em Preparo, Prontos, Saiu para Entrega).

​Cards de Pedido: Devem conter uma Tag de Origem visual (🔴 iFood, 🟢 WhatsApp, 📞 Telefone), nome do cliente, bairro e timer.

​Ações do Delivery: Botão de aceite rápido para novos pedidos, botão "Pausar iFood" e atribuição de motoboy na coluna de entrega.

​7. Aba: Gestão da Gaveta (Financeiro do Operador)

​Grid de 3 botões principais:

​Suprimento: Modal para registrar entrada de troco.

​Sangria: Modal para registrar retirada de dinheiro.

​Fechar Caixa (Fim de Turno): Formulário cego para o operador digitar a contagem física de notas e moedas.

​8. Aba: Histórico de Vendas (Retaguarda)

​Lista/Tabela de Cupons: Filtros por data e turno.

​Ações por Linha: Visualizar extrato completo, botão "Reimprimir Via" e botão "Estornar/Cancelar Venda" (com estado visual de cancelado).

​9. Aba: Controle Rápido (Painel 86 / Sold Out)

​Lista de Produtos (Busca e Toggle): Interface super simples para buscar um produto e desligar um "Switch" para pausar sua venda em todo o sistema instantaneamente quando o ingrediente acabar na cozinha.

​10. Modais Globais e Componentes Invisíveis

​Notificações (Toasts): Alertas pop-up para "Novo pedido no Delivery" (com som) e confirmações de ações.

​Indicador de Conexão: Ícone no topo da Sidebar mostrando status (Online/Offline) simulando a arquitetura offline-first.

​Teclado Virtual Numérico: Reutilizável em todas as áreas que exigem input de valor (pagamento, troco, sangria) para facilitar o uso sem mouse/teclado físico.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9c2ec2ad-bfa7-44dd-9ee3-1f6e914d9726).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
