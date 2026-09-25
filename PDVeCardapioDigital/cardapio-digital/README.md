# 🍽️ Cardápio Digital Web (QR Code) — Fluxo PDV

Projeto web estático, leve e responsivo para visualização do cardápio oficial do restaurante através de QR Code em mesas ou delivery.

---

## ⚡ Características Principais

- **Carregamento Instantâneo (0ms):** Cache local inteligente (*Stale-While-Revalidate*) que exibe o cardápio no primeiro milissegundo, revalidando dados em segundo plano.
- **Harmonia Total com o PDV:** Conectado diretamente ao **Supabase** do restaurante, exibindo as mesmas categorias, produtos, fotos/emojis e preços gerenciados pelo caixa.
- **Atualização em Tempo Real (Realtime):** Se o operador do caixa marcar um item como "Esgotado", a alteração reflete na tela do cliente sem necessidade de recarregar a página.
- **Foco em Experiência Presencial:** Visual moderno, busca instantânea, navegação fixa por categorias e modal com descrição completa e ingredientes.
- **Ultra-Leve:** Bundle de produção otimizado com menos de **50 KB gzipped**, ideal para redes 3G/4G e celulares mais simples.

---

## 🚀 Como Executar Localmente

Entre na pasta do projeto:
```bash
cd cardapio-digital
npm install
npm run dev
```

O cardápio estará acessível em: `http://localhost:3000`

---

## 📦 Como Compilar e Publicar para Produção

Para gerar os arquivos estáticos de produção:
```bash
npm run build
```
Os arquivos gerados na pasta `cardapio-digital/dist/` podem ser hospedados com 1 clique de forma gratuita em:
- [Vercel](https://vercel.com)
- [Netlify](https://netlify.com)
- [Cloudflare Pages](https://pages.cloudflare.com)
- [GitHub Pages](https://pages.github.com)

Após publicar, copie a URL gerada e gere um QR Code gratuito para colocar nas mesas do restaurante!
