<div align="center">

# Natty's Braintree Payment Orchestrator

<br/>

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/en)
[![Express](https://img.shields.io/badge/Express-API-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Braintree](https://img.shields.io/badge/Braintree-Sandbox-0B1F36?logo=paypal&logoColor=white)](https://developer.paypal.com/braintree/docs/start/overview)
[![Jest](https://img.shields.io/badge/Tests-Jest-99425B?logo=jest&logoColor=white)](https://jestjs.io/)
[![Pino](https://img.shields.io/badge/Logs-pino-4C1?logo=logstash&logoColor=white)](https://github.com/pinojs/pino)

<br/>

I built a two‑service system that integrates with Braintree Sandbox for Sale, Refund, and Void for Pay.com exam.
I focused on clear code, error handling, idempotency, normalized responses, and clearly logged metrics.

</div>

---

<div align="left">

<b>🔗 Quick Links</b>

- Merchant Service
  - Server: https://github.com/NattyZepko/PayAssignment/blob/main/merchant-service/src/server.js
  - Config: https://github.com/NattyZepko/PayAssignment/blob/main/merchant-service/src/config.js
  - Store: https://github.com/NattyZepko/PayAssignment/blob/main/merchant-service/src/store.js
  - Tests: https://github.com/NattyZepko/PayAssignment/blob/main/merchant-service/tests/merchant.test.js

- Payment Orchestrator
  - Server: https://github.com/NattyZepko/PayAssignment/blob/main/payment-orchestrator-service/src/server.js
  - Normalize: https://github.com/NattyZepko/PayAssignment/blob/main/payment-orchestrator-service/src/normalize.js
  - Idempotency: https://github.com/NattyZepko/PayAssignment/blob/main/payment-orchestrator-service/src/idempotency.js
  - Braintree client: https://github.com/NattyZepko/PayAssignment/blob/main/payment-orchestrator-service/src/braintree.js
  - E2E tests: https://github.com/NattyZepko/PayAssignment/blob/main/payment-orchestrator-service/tests/orchestrator.e2e.test.js

</div>

---

## 🔄 Webhooks vs WebSockets — My Choice

- I prefer webhooks for orchestrator → merchant because they are reliable, retriable, and naturally idempotent with simple HTTP semantics.
- I can decouple services: the orchestrator posts when ready; the merchant can be briefly offline and still process the callback later.
- I get clear delivery semantics: at‑least‑once with idempotency keys is straightforward; exactly‑once over WebSockets needs more infrastructure.
- I keep operations simple: HTTP status codes, backoff/retry, and structured logs give me clean observability.
- I secure easily: HMAC‑signed requests and IP allowlists are standard for webhooks; fewer moving parts than securing socket fleets.
- Fit for purpose: server‑to‑server notifications use webhooks; real‑time UI uses WebSockets. I implemented a WebSocket on the merchant to broadcast normalized status to frontends.

## 🧭 Architecture (At a Glance)

```
    +----------------------------------+        +-------------------------------------+
    |      Merchant Service (3001)     |        |   Payment Orchestrator (3002)       |
    |                                  |        |                                     |
    |  POST /merchant/payments         |        |  /orchestrator/sale                 |
    |  POST /merchant/refunds          |        |  /orchestrator/refund               |
    |  POST /merchant/void             |        |  /orchestrator/void                 |
    |  GET  /merchant/status/:ref      |        |  GET  /orchestrator/metrics         |
    |  GET  /merchant/metrics          |        |                                     |
    |                                  |        |                                     |
    +----------------------------------+        +-------------------------------------+

Clients (UI) ================= WebSocket =====================> Merchant Service (3001)

Clients (API) ------------------- REST -----------------------> Merchant Service (3001)
                                                           
Merchant Service (3001) ------------- REST ------------------> Payment Orchestrator (3002)

Payment Orchestrator (3002) --- Webhook (HTTP POST, normalized) ---> Merchant Service (3001)
           POST /merchant/callback

         Payment Orchestrator  ── Braintree SDK (HTTPS) ──►  Braintree Sandbox
```

| Component | Purpose | Key Endpoints / Interfaces |
|---|---|---|
| Clients | Receive real‑time status | WebSocket to Merchant (`ws://localhost:3001`) |
| Merchant Service (3001) | Starts flows, stores status, broadcasts to clients | HTTP: `POST /merchant/payments`, `POST /merchant/refunds`, `POST /merchant/void`, `POST /merchant/callback`, `GET /merchant/status/:ref`, `GET /merchant/metrics`; WebSocket broadcast |
| Payment Orchestrator (3002) | Talks to Braintree; normalization; idempotency; retry; notify | HTTP: `POST /orchestrator/sale`, `POST /orchestrator/refund`, `POST /orchestrator/void`, `GET /orchestrator/metrics`; Webhook to Merchant |
| Braintree Sandbox | Payment provider | SDK over HTTPS |

---

## 📡 WebSockets

 I implemented the WebSocket server in [merchant-service/src/ws.js](merchant-service/src/ws.js).
 I initialize it on startup and broadcast on webhook callback in [merchant-service/src/server.js](merchant-service/src/server.js).
 Clients can connect to `ws://localhost:3001` and will receive messages shaped as `{ type: "status", payload: <normalized> }` whenever the merchant receives a callback.

Example client snippet:

```js
const ws = new WebSocket('ws://localhost:3001');
ws.onmessage = (evt) => {
  const msg = JSON.parse(evt.data);
  if (msg.type === 'status') {
    console.log('Status update:', msg.payload);
  }
};
```

---




## ⚙️ Setup & Run

1) Install dependencies

```bash
cd merchant-service && npm install
cd ../payment-orchestrator-service && npm install
```

2) Configure environment (I used Sandbox credentials)

```bash
# payment-orchestrator-service/.env
BRAINTREE_MERCHANT_ID=your_merchant_id
BRAINTREE_PUBLIC_KEY=your_public_key
BRAINTREE_PRIVATE_KEY=your_private_key
PORT=3002

# merchant-service/.env
ORCHESTRATOR_BASE_URL=http://localhost:3002
PORT=3001
```

3) Start services

```bash
# Terminal 1
cd merchant-service
npm run dev

# Terminal 2
cd payment-orchestrator-service 
npm run dev
```

---

## 🧪 Queries I Tested (with real responses)

I verified these flows locally. I used both curl (bash) and PowerShell.

### Sale

```bash
curl -X POST http://localhost:3001/merchant/payments \
 -H "Content-Type: application/json" \
 -H "x-idempotency-key: uuid-123" \
 -d '{
   "amount": "12.34",
   "currency": "EUR",
   "paymentMethodNonce": "fake-valid-nonce",
   "merchantReference": "order_12345",
   "callbackUrl": "http://localhost:3001/merchant/callback"
 }'
```

PowerShell I ran:

```powershell
$headers = @{ 'Content-Type' = 'application/json'; 'x-idempotency-key' = 'uuid-123' }
$body = @{ amount='12.34'; currency='EUR'; paymentMethodNonce='fake-valid-nonce'; merchantReference='order_12345'; callbackUrl='http://localhost:3001/merchant/callback' } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:3001/merchant/payments' -Method Post -Headers $headers -Body $body | ConvertTo-Json -Depth 6
```

### Check Status

```bash
curl http://localhost:3001/merchant/status/order_12345
```

---

## 🖨️ Sample Runs (Actual Output)

The following outputs were captured from real runs on 2026‑01‑03 while both services were running locally on 3001/3002:

Sale (POST /merchant/payments)

```json
{
  "merchantReference": "order_demo_1001",
  "provider": "braintree",
  "operation": "sale",
  "status": "PENDING",
  "transactionId": "mxcs93ja",
  "amount": "12.34",
  "currency": "EUR"
}
```

Status (GET /merchant/status/order_demo_1001)

```json
{
  "merchantReference": "order_demo_1001",
  "provider": "braintree",
  "operation": "sale",
  "status": "PENDING",
  "transactionId": "mxcs93ja",
  "amount": "12.34",
  "currency": "EUR",
  "savedAt": "2026-01-03T18:38:20.576Z"
}
```

Void (POST /merchant/void)

```json
{
  "merchantReference": "void_demo_1001",
  "provider": "braintree",
  "operation": "void",
  "status": "SUCCESS",
  "transactionId": "mxcs93ja",
  "amount": "12.34",
  "currency": "USD"
}
```

Status after Void (GET /merchant/status/void_demo_1001)

```json
{
  "merchantReference": "void_demo_1001",
  "provider": "braintree",
  "operation": "void",
  "status": "SUCCESS",
  "transactionId": "mxcs93ja",
  "amount": "12.34",
  "currency": "USD",
  "savedAt": "2026-01-03T18:38:30.608Z"
}
```


---

## 📜 Logs (Selected)

The tables below summarize key lines from logs captured during a real run on 2026‑01‑03.

Merchant Service

| Time | Trace ID | Merchant Ref | Status | Message |
|---|---|---|---|---|
| 1767465318201 | — | — | — | WebSocket server initialized |
| 1767465318201 | — | — | — | Merchant Service listening on http://localhost:3001 |
| 1767465500577 | aa43o6g9ysfjioi06vxua | order_demo_1001 | PENDING | callback received |
| 1767465500587 | 29lxbopqv4q1jikau9h7o1 | order_demo_1001 | — | forwarded sale |
| 1767465510608 | i5y1q08sf0oqor0bgxddf9 | void_demo_1001 | SUCCESS | callback received |

Payment Orchestrator

| Time | Trace ID | Merchant Ref | Idempotency | Txn Id | Message |
|---|---|---|---|---|---|
| 1767465342817 | — | — | — | — | Payment Orchestrator listening on http://localhost:3002 |
| 1767465499111 | uuid-run-001 | order_demo_1001 | uuid-run-001 | — | sale: calling braintree |
| 1767465500564 | uuid-run-001 | order_demo_1001 | — | mxcs93ja | sale: normalized |
| 1767465509882 | uuid-run-void-001 | void_demo_1001 | uuid-run-void-001 | mxcs93ja | void: calling braintree |
| 1767465510605 | uuid-run-void-001 | void_demo_1001 | — | mxcs93ja | void: normalized |

Raw Logs (for reference)

```text
Merchant:
{"level":30,"time":1767465318201,"pid":25796,"hostname":"Nati-pc","msg":"WebSocket server initialized"}
{"level":30,"time":1767465318201,"pid":25796,"hostname":"Nati-pc","msg":"Merchant Service listening on http://localhost:3001"}
{"level":30,"time":1767465500577,"pid":25796,"hostname":"Nati-pc","traceId":"aa43o6g9ysfjioi06vxua","merchantReference":"order_demo_1001","status":"PENDING","msg":"callback received"}
{"level":30,"time":1767465500587,"pid":25796,"hostname":"Nati-pc","traceId":"29lxbopqv4q1jikau9h7o1","merchantReference":"order_demo_1001","msg":"forwarded sale"}
{"level":30,"time":1767465510608,"pid":25796,"hostname":"Nati-pc","traceId":"i5y1q08sf0oqor0bgxddf9","merchantReference":"void_demo_1001","status":"SUCCESS","msg":"callback received"}

Orchestrator:
{"level":30,"time":1767465342817,"pid":3208,"hostname":"Nati-pc","msg":"Payment Orchestrator listening on http://localhost:3002"}
{"level":30,"time":1767465499111,"pid":3208,"hostname":"Nati-pc","traceId":"uuid-run-001","merchantReference":"order_demo_1001","idempotencyKey":"uuid-run-001","msg":"sale: calling braintree"}
{"level":30,"time":1767465500564,"pid":3208,"hostname":"Nati-pc","traceId":"uuid-run-001","merchantReference":"order_demo_1001","result":{"success":true,"id":"mxcs93ja"},"msg":"sale: normalized"}
{"level":30,"time":1767465509882,"pid":3208,"hostname":"Nati-pc","traceId":"uuid-run-void-001","merchantReference":"void_demo_1001","idempotencyKey":"uuid-run-void-001","transactionId":"mxcs93ja","msg":"void: calling braintree"}
{"level":30,"time":1767465510605,"pid":3208,"hostname":"Nati-pc","traceId":"uuid-run-void-001","merchantReference":"void_demo_1001","result":{"success":true,"id":"mxcs93ja"},"msg":"void: normalized"}
```

---
```powershell
Invoke-RestMethod -Uri 'http://localhost:3001/merchant/status/order_12345' -Method Get | ConvertTo-Json -Depth 6
```

### Refund (after the transaction is settling/settled)

```bash
curl -X POST http://localhost:3001/merchant/refunds \
 -H "Content-Type: application/json" \
 -H "x-idempotency-key: uuid-456" \
 -d '{
   "transactionId": "<bt_txn_id_from_sale>",
   "amount": "10.00",
   "merchantReference": "refund_987",
   "callbackUrl": "http://localhost:3001/merchant/callback"
 }'
```

PowerShell I ran:

```powershell
$headers = @{ 'Content-Type' = 'application/json'; 'x-idempotency-key' = 'uuid-456' }
$refundBody = @{ transactionId = '<bt_txn_id_from_sale>'; amount = '10.00'; merchantReference = 'refund_987'; callbackUrl = 'http://localhost:3001/merchant/callback' } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:3001/merchant/refunds' -Method Post -Headers $headers -Body $refundBody | ConvertTo-Json -Depth 6
Invoke-RestMethod -Uri 'http://localhost:3001/merchant/status/refund_987' -Method Get | ConvertTo-Json -Depth 6
```

### Void (for non‑settled transactions)

```bash
curl -X POST http://localhost:3001/merchant/void \
 -H "Content-Type: application/json" \
 -H "x-idempotency-key: uuid-void-1" \
 -d '{
   "transactionId": "<bt_txn_id_from_sale>",
   "merchantReference": "void_987",
   "callbackUrl": "http://localhost:3001/merchant/callback"
 }'
```

PowerShell I ran:

```powershell
$headers = @{ 'Content-Type' = 'application/json'; 'x-idempotency-key' = 'uuid-void-1' }
$voidBody = @{ transactionId = '<bt_txn_id_from_sale>'; merchantReference = 'void_987'; callbackUrl = 'http://localhost:3001/merchant/callback' } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:3001/merchant/void' -Method Post -Headers $headers -Body $voidBody | ConvertTo-Json -Depth 6
Invoke-RestMethod -Uri 'http://localhost:3001/merchant/status/void_987' -Method Get | ConvertTo-Json -Depth 6
```

---

## 📦 Normalized Response Schema

We return a consistent shape so the client can handle outcomes uniformly.

```json
{
  "merchantReference": "order_12345",
  "provider": "braintree",
  "operation": "sale | refund | void",
  "status": "SUCCESS | FAILED | PENDING",
  "transactionId": "bt_txn_abc",
  "amount": "12.34",
  "currency": "EUR",
  "error": { "code": "BT_XXXX", "message": "Human-readable message" }
}
```

| Field | Notes |
|---|---|
| provider | Always `braintree` in this project |
| operation | `sale`, `refund`, or `void` |
| status | `SUCCESS`, `FAILED`, or `PENDING` |
| error | Present only on failures; includes `code` and `message` |

---

## 🛡️ Error Mapping & Retries

I implemented clear error mapping and a safe, single retry for transient issues.

| Scenario | Status | Code/Message |
|---|---|---|
| Processor decline | FAILED | Uses `processorResponseCode` + `processorResponseText` |
| Validation error | FAILED | First deep error code/message from provider |
| Network/timeout | FAILED | `BT_NETWORK` + human message; retried once |
| Authorization/settlement pending | PENDING | `authorized`, `submitted_for_settlement`, `settling` |

---

## 🧩 Design & Extensibility (Compact Table)

| Area | Decision I Made | Why | How to Extend |
|---|---|---|---|
| Transport | Webhook POST to merchant callback | Keeps services decoupled; async completion | Add WebSocket or polling |
| Idempotency | LRU cache with TTL keyed by idempotencyKey | Payments must be safe to retry | Redis for cross‑instance caching |
| Persistence | In‑memory merchant status store | Simple demo; easy to swap later | DB/Redis store |
| Validation | Basic runtime checks | Focused on flow clarity | Zod schemas + typed errors |
| Observability | Pino logs + per‑request trace IDs; HTTP metrics | Easy debugging and monitoring | OpenTelemetry + Prometheus |
| App Export | Export Express apps (skip `listen()` in tests) | Testable servers in Jest | Supertest & CI integration |
| Refund/Void | Added `void` pre‑settlement; `refund` post‑settlement | Aligns with provider lifecycle | More operations (dispute, partial capture) |

---

## ⚠️ Known Limitations

- In‑memory stores: Merchant status and idempotency cache are in memory; they won’t persist across restarts. These would be ideally kept in a DB.
- Single instance: Idempotency LRU is process‑local; horizontally scaled instances need Redis.
- Sandbox assumptions: Flows assume Sandbox behaviors; production nuances (timeouts, backoff) may obviously differ.

---

## 🧰 Tests

I wrote unit and endpoint/e2e tests and ran them with Node’s ESM‑friendly Jest setup.

```bash
cd merchant-service && npm test
cd ../payment-orchestrator-service && npm test
```




