# ⚡ Fluxo POS — Terminal Smart POS & Garçom

Aplicação móvel de alto desempenho para terminais **Smart POS Android** (Stone P2, PagSeguro Moderninha Smart/Pro, Cielo LIO, Sunmi V2s/P2, Elgin, etc.) e smartphones de garçons, operando em sincronização em tempo real com o PDV desktop e o Cardápio Digital através da mesma nuvem (**Supabase**).

---

## 🚀 Funcionalidades Principais

- **Sincronização em Tempo Real (Supabase Realtime):**
  - Conexão bidirecional via WebSockets com as tabelas `dining_tables`, `orders`, `order_items` e `products`.
  - Se o caixa do PDV desktop ou outro garçom em outra maquininha abrir uma mesa, lançar itens, solicitar conta ou fechar pagamento, a tela atualiza instantaneamente (latência < 50ms).
- **Prevenção de Conflitos Multi-Dispositivos:**
  - Cada item de comanda é inserido com identificador único global (UUID v4). Dois garçons podem adicionar itens à mesma mesa simultaneamente sem sobrescrever informações.
  - Indicador visual em tempo real de qual atendente está cuidando da mesa.
- **Controle de Produtos Esgotados (Sold Out):**
  - Se um item do cardápio acabar na cozinha e for marcado como "Esgotado" no PDV, o botão fica imediatamente indisponível na maquininha, evitando que o garçom anote itens em falta.
- **Ergonomia e Conforto Visual:**
  - Design *touch-first* de alto contraste otimizado para telas verticais de 5.0" a 5.5" (720×1280 px).
  - Alvos de toque generosos para operação com uma única mão.
  - Feedback tátil e auditivo nos lançamentos.
- **Divisão de Conta e Checkout na Mesa:**
  - Divisão de conta (split) automática para 1 a 5+ pessoas com cálculo instantâneo do valor por pessoa.
  - Formas de pagamento: Cartão de Crédito, Cartão de Débito, PIX com QR Code dinâmico na tela da maquininha, e Dinheiro com calculadora de troco.
- **Impressão Térmica 58mm Embutida:**
  - Layout formatado estritamente para bobina de maquininha (32 colunas).
  - Emissão de Pré-Conta (conferência do cliente) e Comprovante de Pagamento.

---

## 🛠️ Tecnologias Utilizadas

- **Frontend:** React 19, TypeScript, Vite
- **Estilização:** Tailwind CSS v4, Lucide React
- **Nuvem & Backend:** Supabase (PostgreSQL + Realtime WebSockets)
- **Empacotamento Android POS:** Capacitor (`@capacitor/android`, `@capacitor/cli`) e PWA (*Progressive Web App*)

---

## 📱 Como Executar

### 1. Modo Desenvolvimento Local
```bash
npm install
npm run dev
```
O servidor iniciará em `http://localhost:5175`. 
Para testar direto na maquininha conectada ao mesmo Wi-Fi, acesse pelo IP da sua máquina (ex: `http://192.168.0.10:5175`).

### 2. Compilar para Produção (PWA)
```bash
npm run build
npm run preview
```

### 3. Gerar APK Nativo para Maquininha Android (Stone / PagSeguro / Sunmi)
```bash
# Compila os arquivos estáticos otimizados
npm run build

# Adiciona a plataforma Android (executado uma única vez)
npx cap add android

# Sincroniza os arquivos compilados com o projeto Android nativo
npm run cap:sync

# Abre o projeto no Android Studio para gerar o arquivo .apk ou instalar via USB/ADB
npm run cap:android
```

---

## 🔐 Login de Demonstração
- **PIN:** `1234` (Marina R.)
