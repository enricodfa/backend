# Nortfy — Backend

![Nortfy API Header](https://via.placeholder.com/1200x400/121212/ffffff?text=NORTFY+-+Backend+API)

Este é o repositório **Backend** da plataforma Nortfy. Ele atua como uma API RESTful focada em orquestrar cálculos de rebalanceamento, regras de negócios da assinatura SaaS (Mercado Pago), operações de banco de dados, e a interface analítica pesada servida para nosso frontend Next.js.

## 🧰 Tech Stack
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database / Auth:** Supabase Admin (`@supabase/supabase-js`)
- **Gateways:** SDK do Mercado Pago (PIX e Cartão de Crédito)
- **Routing:** Componentização usando `express.Router`
- **Security:** Cors, Webhook HMAC SHA-256 Signatures, CORS constraints.

## 🏗️ Estrutura de Diretórios
- `/controllers/` — É o coração da lógica de negócio:
  - `checkoutController.js` (Gerencia Intent de pagamento, validação de transação e Webhooks de aprovação)
  - `plansController.js` (Gerência de estados Premium x Gratuito)
  - `portfolioController.js` & `allocationController.js` (Lógica de cálculos matemáticos para as bandas e drifts inseridos manualmente)
  - `analysisController.js` (Cálculos de PnL e métricas globais da carteira)
- `/routes/` — Definição dos endpoints aglutinando os Controllers. São enxertados todos no arquivo central.
- `/utils/` — Camadas utilitárias externas:
  - `supabaseAdmin.js` (Service Role Key para bypass do RLS nos webhooks isolados)
  - `mercadopago.js` (Setup do AccessToken do banco)
- `server.js` — Ponto de entrada (Entrypoint), middlewares base, configuração do Express e bind das portas.

## 🚀 Como Executar Localmente

**1. Instale as dependências**
```bash
npm install
# ou
yarn install
```

**2. Variáveis de Ambiente**
Crie um arquivo `.env` na raiz contento suas secrets do Supabase (Atenção: A chave Role Server _nunca_ deve ir para o client-side) e suas credentials de Seller do MercadoPago:
```env
PORT=5000
SUPABASE_URL=sua_url_supabase
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key_secreta
MERCADOPAGO_ACCESS_TOKEN=seu_token_de_producao_ou_teste
MERCADOPAGO_WEBHOOK_SECRET=sua_chave_hmac_sha256_do_webhook
```

**3. Inicie a API**
```bash
npm start
# Para desenvolvimento com auto-reload
npm run dev
```
O servidor começará a observar as conexões na porta estipulada (padrão `5000`).

## 🛡️ Webhook Flow (Mercado Pago)
1. O Front pede a rota `/checkout/pix` ou `/checkout/card`.
2. Criamos o pagamento e devolvemos os metadados.
3. Quando a operadora aprova a quantia, o webhook é engilhado via método `POST /checkout/webhook`.
4. Validamos sua assinatura HMAC SHA256 contra ataques externos no `checkoutController`.
5. Se verificado, a função `activateSubscription` aplica os rótulos de tempo `current_period_end` no Supabase daquele usuário.
