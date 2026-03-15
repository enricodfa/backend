# Checkout — Guia de Integração Frontend

## Visão Geral do Fluxo

```
Usuário clica em "Assinar Premium"
        │
        ▼
POST /plans/checkout/pix   ← frontend chama com JWT
        │
        ▼
Backend cria pedido no Mercado Pago
        │
        ▼
Retorna QR Code + Pix Copia e Cola
        │
        ▼
Frontend exibe tela de pagamento
        │
        ▼
Usuário paga no banco
        │
        ▼
Mercado Pago notifica o backend (webhook automático)
        │
        ▼
Backend ativa is_premium = true no banco
        │
        ▼
Frontend faz polling em GET /plans/status
e redireciona quando status = "active"
```

---

## Autenticação

Todas as rotas (exceto `/plans/webhook`) exigem o header:

```
Authorization: Bearer <JWT do usuário>
```

---

## Endpoints

### 1. Verificar status atual do plano

```
GET /plans/status
```

**Resposta:**
```json
{
  "is_premium": false,
  "status": "inactive",
  "current_period_start": null,
  "current_period_end": null
}
```

| Campo | Tipo | Descrição |
|---|---|---|
| `is_premium` | boolean | Se o usuário tem acesso Premium |
| `status` | string | `"active"` \| `"canceled"` \| `"inactive"` |
| `current_period_start` | ISO string \| null | Início do período pago |
| `current_period_end` | ISO string \| null | Expiração do período pago |

---

### 2. Ativar plano gratuito

```
POST /plans/activate
```

Sem body. Ativa o premium diretamente (plano free/trial).

**Resposta:**
```json
{
  "ok": true,
  "subscription": {
    "is_premium": true,
    "status": "active",
    "current_period_end": "2026-04-15T..."
  }
}
```

---

### 3. Criar checkout Pix (plano pago)

```
POST /plans/checkout/pix
```

Sem body. O backend usa o e-mail do perfil do usuário autenticado.

**Resposta de sucesso (`200`):**
```json
{
  "order_id":       "ORD01...",
  "status":         "action_required",
  "amount":         "29.90",
  "ticket_url":     "https://www.mercadopago.com.br/...",
  "qr_code":        "00020126580014br.gov.bcb...",
  "qr_code_base64": "iVBORw0KGgoAAAANS..."
}
```

| Campo | Como usar no frontend |
|---|---|
| `qr_code_base64` | `<img src={`data:image/jpeg;base64,${qr_code_base64}`} />` |
| `qr_code` | Input de texto para "Pix Copia e Cola" |
| `ticket_url` | Link/botão alternativo que abre a página do MP |
| `order_id` | Guardar em state para referência |

**Resposta de erro (`502`):**
```json
{
  "error": "Mercado Pago 400: ...",
  "detail": { }
}
```

---

### 4. Cancelar plano

```
POST /plans/cancel
```

Sem body. Marca o plano como `canceled` (acesso continua até `current_period_end`).

**Resposta:**
```json
{
  "ok": true,
  "subscription": { "status": "canceled", ... }
}
```

---

## Tela de Checkout — O que renderizar

Após chamar `POST /plans/checkout/pix` com sucesso, exibir:

```jsx
// QR Code
<img src={`data:image/jpeg;base64,${data.qr_code_base64}`} alt="QR Code Pix" />

// Pix Copia e Cola
<input type="text" value={data.qr_code} readOnly />
<button onClick={() => navigator.clipboard.writeText(data.qr_code)}>
  Copiar código
</button>

// Alternativa: link direto
<a href={data.ticket_url} target="_blank">Abrir no Mercado Pago</a>
```

---

## Confirmação de Pagamento — Polling

O backend ativa o premium automaticamente via webhook do Mercado Pago.
**O frontend não recebe push** — deve fazer polling em `GET /plans/status`.

```js
// Exemplo de polling a cada 5 segundos
useEffect(() => {
  if (!checkoutAtivo) return;

  const interval = setInterval(async () => {
    const res  = await fetch('/plans/status', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();

    if (data.status === 'active') {
      clearInterval(interval);
      router.push('/dashboard'); // ou onde quiser redirecionar
    }
  }, 5000);

  // Timeout de segurança: para de checar após 30 min (QR expira em 30 min)
  const timeout = setTimeout(() => clearInterval(interval), 30 * 60 * 1000);

  return () => { clearInterval(interval); clearTimeout(timeout); };
}, [checkoutAtivo]);
```

---

## Estados da página de checkout

| Estado | O que mostrar |
|---|---|
| Inicial | Botão "Assinar por R$ 29,90/mês" |
| Loading (aguardando API) | Spinner |
| QR gerado | QR Code + Pix Copia e Cola + polling ativo |
| Timeout (30 min) | Mensagem de expiração + botão para gerar novo QR |
| Pago (polling confirmou) | Feedback de sucesso + redirect |
| Erro da API | Mensagem de erro + botão tentar novamente |

---

## Observações Importantes

- **Idempotência:** chamar `POST /plans/checkout/pix` múltiplas vezes para o mesmo usuário retorna o mesmo pedido (não cria duplicatas). Seguro fazer retry.
- **QR expira em 30 minutos.** Se o usuário demorar, gerar novo QR chamando o endpoint novamente.
- **O webhook é transparente ao frontend.** O frontend não precisa — e não deve — confirmar o pagamento diretamente. Só confiar no `GET /plans/status`.
- **Rota `/plans/webhook` não tem JWT.** Não chamar diretamente; é exclusiva do Mercado Pago.
