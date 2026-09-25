# 🍽️ Ecossistema Restaurante Pro

Ecossistema completo, moderno e de alta performance para operação de restaurantes, bares, lanchonetes e pizzarias.

Integração nativa em tempo real entre o **PDV do Caixa (Offline-First)**, **Cardápio Digital** e o **App Maquininha POS móvel do Garçom**, compartilhando a mesma nuvem com garantia anti-conflito multi-dispositivo.

---

## 📂 Estrutura do Monorepo

```
ecosistem/
├── PDVeCardapioDigital/        # Sistema PDV Desktop + Cardápio Digital do Cliente
│   ├── src/                    # Código-fonte React, TanStack, SQLite e Tailwind
│   ├── src-tauri/              # Motor desktop Tauri (Rust) de alta performance
│   ├── cardapio-digital/       # Web App do Cardápio Digital para clientes
│   └── supabase_schema.sql     # Estrutura unificada do banco de dados na nuvem
│
└── MaquininhaPOS/              # App do Garçom para Terminais Smart POS Móveis
    ├── src/                    # Código-fonte Vite, React 19, Tailwind v4 e Supabase
    ├── src/lib/printer-58mm.ts # Motor de impressão térmica 58mm
    ├── capacitor.config.json   # Configuração para compilação Android APK nativo
    └── index.html              # PWA com suporte a instalação rápida
```

---

## ⚡ Módulos do Sistema

### 1. `PDVeCardapioDigital` (Frente de Caixa & Salão)
- **Offline-First:** Funciona 100% mesmo se a internet cair, armazenando vendas e comandas em SQLite local ultra-rápido.
- **Sincronização em Tempo Real:** Motor em background sincroniza bidirecionalmente com o Supabase assim que há conexão.
- **Gestão Abrangente:** Controle de mesas, comandas agrupadas, delivery (iFood/WhatsApp), contas fiado com limites, fechamento de turno/caixa cego e impressão de produção.
- **Cardápio Digital Integrado:** Módulo web para autoatendimento e pedidos de clientes via QR Code.

### 2. `MaquininhaPOS` (Terminal Móvel de Garçom)
- **Projetado para Smart POS Android:** Otimizado para telas de 5" a 5.5" (Sunmi, PagSeguro, Stone, Clover, Cielo).
- **Sensação Instantânea (0ms):** Mutações otimistas em memória. Ao anotar pedidos ou abrir mesas, a tela responde no mesmo milissegundo, sem esperas de rede.
- **Despacho para Cozinha sob Demanda:** Itens são lançados na mesa como pendentes e despachados em rodadas controladas pelo garçom (`R1, R2...`).
- **Exclusão Segura com Alerta de Produção:** Cancelamento de itens com confirmação inteligente e aviso caso o item já tenha sido enviado para preparo.
- **Fechamento e Cobrança na Mesa:** Divisão de conta por pessoa (Split), taxa de serviço 10%, PIX com QR Code, cartão, dinheiro com cálculo de troco e impressão térmica 58mm.
- **Alta Performance e Ergonomia:** Sem toasts intrusivos cobrindo o topo da tela; confirmações táteis via micro-vibração háptica (`triggerHaptic`).

---

## ☁️ Arquitetura de Nuvem (Harmonia Multi-Dispositivo)

Tanto o **PDV Desktop** quanto as **Maquininhas POS** comunicam-se de forma sincronizada através do **Supabase**:
- **Postgres Changes (Realtime):** Qualquer item adicionado por uma maquininha no salão aparece em fração de segundo no PDV e nas outras maquininhas.
- **Soft-Delete e Anti-Conflito:** Itens cancelados e comandas concluídas utilizam controle de timestamps (`updated_at`, `deleted_at`) para garantir consistência perfeita.

---

## 🚀 Como Executar Localmente

### Pré-requisitos
- **Node.js** (v18+)
- **npm** ou **pnpm**
- **Rust** (apenas se for compilar o binário desktop do PDV com Tauri)

### 1. Executando o PDV e Cardápio Digital
```bash
cd PDVeCardapioDigital
npm install
npm run dev
```

### 2. Executando o App da Maquininha POS
```bash
cd MaquininhaPOS
npm install
npm run dev
```

### 3. Build de Produção
```bash
# Na pasta da Maquininha:
cd MaquininhaPOS
npm run build

# Na pasta do PDV:
cd PDVeCardapioDigital
npm run build
```

---

## 📄 Licença
Propriedade privada. Todos os direitos reservados.
