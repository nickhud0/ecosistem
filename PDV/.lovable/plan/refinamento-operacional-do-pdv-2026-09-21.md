# Refinamento operacional do PDV

## Objetivo

Adicionar os fluxos rápidos de personalização, clientes e exceções de fechamento, preservando o visual Frosted Glass e sem qualquer função de peso ou self-service.

## O que será construído

### 1. Personalização antes de incluir itens

- Abrir um modal ao tocar em qualquer produto no Balcão.
- Na Mesa, adicionar uma ação rápida “Adicionar item” com seleção de produto e o mesmo modal de personalização.
- Oferecer observação livre, exclusões e adicionais com seleção e quantidade.
- Mostrar o resumo do item e recalcular o preço conforme os adicionais.
- Para pizzas, oferecer modo inteiro ou meio a meio, seleção do segundo sabor e aviso claro de que vale o preço da metade mais cara.
- Exibir modificadores e sabores abaixo do item no pedido e no extrato da mesa.

### 2. Cadastro rápido de clientes

- Criar um modal reutilizável com Nome, Telefone/WhatsApp, Endereço e E-mail.
- Identificar Nome e Telefone como dados principais; marcar Endereço e E-mail como opcionais.
- Salvar os clientes no estado demonstrativo do PDV e disponibilizá-los imediatamente no atendimento e no Fiado.
- Incluir acesso ao cadastro pelo campo de cliente do Balcão e pelo fluxo de Fiado.

### 3. Checkout e gorjeta

- Destacar visualmente o controle dos 10% no resumo.
- Adicionar entrada monetária rápida para “Gorjeta adicional/manual”.
- Somar a gorjeta ao total, saldo pendente, divisão, comprovante e fechamento.

### 4. Fiado e Cortesia

- Incluir “A Prazo/Fiado” entre as formas de pagamento.
- Exigir a seleção de um cliente cadastrado antes de adicionar o pagamento, com atalho para novo cadastro.
- Incluir “Cortesia” como fechamento sem pagamento.
- Ao ativar cortesia, zerar o total e exigir justificativa antes de finalizar.
- Registrar no histórico os valores e os dados da exceção para manter coerência entre as telas.

### 5. Validação

- Conferir os fluxos completos no Balcão e na Mesa em tela desktop touch.
- Validar personalização, pizza meio a meio, novo cliente, gorjeta, Fiado e Cortesia.
- Confirmar legibilidade, áreas de toque, ausência de sobreposição e funcionamento em tema escuro.

## Detalhes técnicos

- Ampliar os tipos de produto, item, pagamento, cliente e venda apenas com os campos necessários aos novos fluxos.
- Criar modais reutilizáveis para personalização e cadastro de cliente.
- Manter os dados em memória, seguindo o comportamento demonstrativo atual do frontend.
- Reutilizar os componentes visuais, tokens semânticos e notificações já existentes.
