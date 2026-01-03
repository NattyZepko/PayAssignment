<div align="center">

# 🚀 My Braintree Payment Orchestrator

<br/>

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/en)
[![Express](https://img.shields.io/badge/Express-API-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Braintree](https://img.shields.io/badge/Braintree-Sandbox-0B1F36?logo=paypal&logoColor=white)](https://developer.paypal.com/braintree/docs/start/overview)
[![Jest](https://img.shields.io/badge/Tests-Jest-99425B?logo=jest&logoColor=white)](https://jestjs.io/)
[![Pino](https://img.shields.io/badge/Logs-pino-4C1?logo=logstash&logoColor=white)](https://github.com/pinojs/pino)

<br/>

I built a two‑service system that integrates with Braintree Sandbox for Sale, Refund, and Void. I focused on clarity, robust error handling, idempotency, normalized responses, and friendly developer experience.

</div>

---

## ✍️ Why I Designed It This Way

- I decided to split responsibilities into two small services so the merchant API stays simple and the orchestration layer handles provider quirks, retries, and normalization.
- I chose webhooks for transport so the orchestrator can respond asynchronously and the merchant can persist final status.
- I implemented idempotency (LRU + TTL) because payments must be safe to retry.
- I mapped provider outcomes to a normalized schema (`SUCCESS` / `FAILED` / `PENDING`) so the client logic stays consistent.
- I added structured logs with trace IDs and minimal metrics to make debugging easy.

## 🧭 Architecture (At a Glance)

```
Merchant Service (3001) ──► Payment Orchestrator (3002) ──► Braintree
           ▲                         │
           └───── Webhook (callback) └───── Normalized result
```

| Component | Purpose | Key Endpoints |
|---|---|---|
| Merchant Service | Starts flows, stores status, exposes metrics | POST /merchant/payments · POST /merchant/refunds · POST /merchant/void · POST /merchant/callback · GET /merchant/status/:ref · GET /merchant/metrics |
| Payment Orchestrator | Talks to Braintree, normalization, idempotency, retries, webhook notify, metrics | POST /orchestrator/sale · POST /orchestrator/refund · POST /orchestrator/void · GET /orchestrator/metrics |

---

## 🔗 Useful Source Links

- Merchant Service
  - Server: https://github.com/NattyZepko/PayAssignment/blob/main/merchant-service/src/server.js
  - Config: https://github.com/NattyZepko/PayAssignment/blob/main/merchant-service/src/config.js
  - Store: https://github.com/NattyZepko/PayAssignment/blob/main/merchant-service/src/store.js
  - Tests (callbacks & endpoints): https://github.com/NattyZepko/PayAssignment/blob/main/merchant-service/tests/merchant.test.js

- Payment Orchestrator
  - Server: https://github.com/NattyZepko/PayAssignment/blob/main/payment-orchestrator-service/src/server.js
  - Normalize: https://github.com/NattyZepko/PayAssignment/blob/main/payment-orchestrator-service/src/normalize.js
  - Idempotency (LRU): https://github.com/NattyZepko/PayAssignment/blob/main/payment-orchestrator-service/src/idempotency.js
  - Braintree client: https://github.com/NattyZepko/PayAssignment/blob/main/payment-orchestrator-service/src/braintree.js
  - E2E tests: https://github.com/NattyZepko/PayAssignment/blob/main/payment-orchestrator-service/tests/orchestrator.e2e.test.js

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
cd merchant-service && npm run dev

# Terminal 2
cd payment-orchestrator-service && npm run dev
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

I return a consistent shape so the client can handle outcomes uniformly.

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

## 📈 Metrics I Expose

I added simple counters on both services to make validation and demos easier.

```bash
curl http://localhost:3002/orchestrator/metrics
curl http://localhost:3001/merchant/metrics
```

---

## 🧠 Design Decisions (First‑Person)

- I chose to export the Express apps (without `listen()` in tests) so Jest can mount routes cleanly.
- I extracted config, constants, normalization, idempotency, notify, logging, and metrics into small modules so the server stays readable.
- I wired a per‑request trace ID (from `x-request-id` or the idempotency key) to correlate logs across services.
- I stored merchant status in memory to keep the demo simple; I kept the structure easy to swap for a DB or Redis later.
- I added `void` because refunds only work once a transaction is settling/settled; `void` is the right tool beforehand.

---

## 🧩 Project Structure & Extensibility

| Area | What I Did | How to Extend |
|---|---|---|
| Transport | Webhook POST to merchant callback | Add WebSocket or polling |
| Idempotency | LRU cache with TTL keyed by `idempotencyKey` | Move to Redis for cross‑instance caching |
| Persistence | In‑memory status store on merchant | Swap to DB/Redis |
| Validation | Basic runtime checks | Add schema validation (e.g., Zod) |
| Observability | Pino logs + trace IDs; HTTP metrics endpoints | Hook to OpenTelemetry + Prometheus |

---

## 🧰 Tests

I wrote unit and endpoint/e2e tests and ran them with Node’s ESM‑friendly Jest setup.

```bash
cd merchant-service && npm test
cd ../payment-orchestrator-service && npm test
```

Key test files:

- Merchant: https://github.com/NattyZepko/PayAssignment/blob/main/merchant-service/tests/merchant.test.js
- Orchestrator unit normalize: https://github.com/NattyZepko/PayAssignment/blob/main/payment-orchestrator-service/tests/orchestrator.test.js
- Orchestrator e2e: https://github.com/NattyZepko/PayAssignment/blob/main/payment-orchestrator-service/tests/orchestrator.e2e.test.js

---

## 📝 Notes I Kept While Building

- Device data is optional; `paymentMethodNonce` is required for Sale.
- Refunds require transactions to be settling/settled; I use `void` earlier in the lifecycle.
- Secrets live in `.env`; `.env.example` shows what to set.
- Idempotency TTL is ~15 minutes; reusing the same key returns the same normalized result.

---

## ✅ Sample Callback Payloads

Right after Sale, pending is normal:

```json
{
  "merchantReference": "order_12345",
  "provider": "braintree",
  "operation": "sale",
  "status": "PENDING",
  "transactionId": "bt_txn_abc",
  "amount": "12.34",
  "currency": "EUR"
}
```

On decline, I surface provider codes/messages:

```json
{
  "merchantReference": "order_12345",
  "provider": "braintree",
  "operation": "sale",
  "status": "FAILED",
  "transactionId": "bt_txn_abc",
  "amount": "12.34",
  "currency": "EUR",
  "error": { "code": "2005", "message": "Invalid Credit Card Number" }
}
```

---

## 🙌 Wrap‑Up

I built this to be straightforward to read, easy to test, and friendly to run locally. If you want, I can add schema validation, Docker Compose, or CI next.

# Payment Orchestrator (Braintree) – Sale, Refund & Void

This project shows a friendly, end‑to‑end Braintree Sandbox integration using two small services:
- Merchant Service (your app) starts payment/refund/void flows and stores the final status.
- Payment Orchestrator Service talks to Braintree, handles errors, idempotency, normalization, and notifies the merchant via webhook.

It’s designed for clarity: small modules, readable code, consistent normalized responses, helpful logs, and minimal metrics.

## Architecture

```
+--------------------+        POST /orchestrator/*        +----------------------------+
|  Merchant Service  |  ------------------------------->  | Payment Orchestrator       |
|  (port 3001)       |                                    | (port 3002)                |
|                    |  <--- webhook (POST /merchant/...) |                            |
| - /merchant/payments|                                    | - /orchestrator/sale       |
| - /merchant/refunds |                                    | - /orchestrator/refund     |
| - /merchant/void    |                                    | - /orchestrator/void       |
| - /merchant/callback|                                    |                            |
| - /merchant/status/*|                                    |  Braintree Sandbox         |
+--------------------+                                    +-------------+--------------+
                                                                      ^
                                                                      |
                                                             Transaction.sale/refund/void
```

- Transport: Webhook. Orchestrator posts normalized results to the merchant’s `callbackUrl`. This keeps services decoupled and allows async completion.
- Idempotency: Orchestrator caches normalized results keyed by `idempotencyKey` (LRU with TTL) to safely deduplicate retries.
- Status persistence: Merchant stores final statuses in memory by `merchantReference` (easy to swap for a DB later).
- Observability: Structured logs (pino) with trace IDs and minimal metrics endpoints on both services.

## Prerequisites

- Node.js 18+
- Braintree Sandbox credentials (Merchant ID, Public Key, Private Key)

## Setup & Run

1. Install dependencies:

```
cd merchant-service
npm install
cd ../payment-orchestrator-service
npm install
```

2. Configure environment:

- Copy `.env.example` to `.env` in both services and fill values.

3. Start services:

```
# Terminal 1
cd merchant-service
npm run dev

# Terminal 2
cd payment-orchestrator-service
npm run dev
```

## Example Requests

Below are simple examples. You can run them in a terminal or use Postman. The orchestrator calls Braintree, normalizes the result, and (if `callbackUrl` is provided) notifies the merchant to persist final status.

Metrics:

```
curl http://localhost:3002/orchestrator/metrics
curl http://localhost:3001/merchant/metrics
```

Sale (bash):

```
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

Sale (PowerShell):

```
$headers = @{ 'Content-Type' = 'application/json'; 'x-idempotency-key' = 'uuid-123' }
$body = @{ amount='12.34'; currency='EUR'; paymentMethodNonce='fake-valid-nonce'; merchantReference='order_12345'; callbackUrl='http://localhost:3001/merchant/callback' } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:3001/merchant/payments' -Method Post -Headers $headers -Body $body | ConvertTo-Json -Depth 6
```

Check status (bash):

```
curl http://localhost:3001/merchant/status/order_12345
```

Check status (PowerShell):

```
Invoke-RestMethod -Uri 'http://localhost:3001/merchant/status/order_12345' -Method Get | ConvertTo-Json -Depth 6
```

Refund (bash) – after the transaction is settling/settled:

```
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

Refund (PowerShell):

```
$headers = @{ 'Content-Type' = 'application/json'; 'x-idempotency-key' = 'uuid-456' }
$refundBody = @{ transactionId = '<bt_txn_id_from_sale>'; amount = '10.00'; merchantReference = 'refund_987'; callbackUrl = 'http://localhost:3001/merchant/callback' } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:3001/merchant/refunds' -Method Post -Headers $headers -Body $refundBody | ConvertTo-Json -Depth 6
Invoke-RestMethod -Uri 'http://localhost:3001/merchant/status/refund_987' -Method Get | ConvertTo-Json -Depth 6
```

Void (bash) – for non‑settled transactions:

```
curl -X POST http://localhost:3001/merchant/void \
 -H "Content-Type: application/json" \
 -H "x-idempotency-key: uuid-void-1" \
 -d '{
   "transactionId": "<bt_txn_id_from_sale>",
   "merchantReference": "void_987",
   "callbackUrl": "http://localhost:3001/merchant/callback"
 }'
```

Void (PowerShell):

```
$headers = @{ 'Content-Type' = 'application/json'; 'x-idempotency-key' = 'uuid-void-1' }
$voidBody = @{ transactionId = '<bt_txn_id_from_sale>'; merchantReference = 'void_987'; callbackUrl = 'http://localhost:3001/merchant/callback' } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:3001/merchant/void' -Method Post -Headers $headers -Body $voidBody | ConvertTo-Json -Depth 6
Invoke-RestMethod -Uri 'http://localhost:3001/merchant/status/void_987' -Method Get | ConvertTo-Json -Depth 6
```

## Normalized Response Schema

```
{
  "merchantReference": "order_12345",
  "provider": "braintree",
  "operation": "sale" | "refund",
  "status": "SUCCESS" | "FAILED" | "PENDING",
  "transactionId": "bt_txn_abc",
  "amount": "12.34",
  "currency": "EUR",
  "error": { "code": "BT_XXXX", "message": "Human-readable message" }
}
```

## Notes

- Error mapping & retries:
  - Provider decline → `FAILED` with `processorResponseCode` and `processorResponseText`.
  - Validation errors → `FAILED` with the first deep error code/message.
  - Network/timeout → `FAILED` with `BT_NETWORK`; we apply a simple one-time retry.
  - Pending statuses (`authorized`, `submitted_for_settlement`, `settling`) → `PENDING`.
- Idempotency: Orchestrator uses an LRU cache (TTL ~15m) keyed by `idempotencyKey` to deduplicate safely.
- Logging: Structured logs (pino) with a per-request trace ID.
- Metrics: Minimal counters available via HTTP on both services.
- Secrets: Use `.env`; do not commit actual credentials.
- Lifecycle: Refund requires the transaction to be settled/settling. Use Void if it hasn't begun settlement.

## Tests

Run tests for each service:

```
cd merchant-service
npm test
cd ../payment-orchestrator-service
npm test
```

## Braintree Configuration

Set the following in `payment-orchestrator-service/.env`:

```
BRAINTREE_MERCHANT_ID=your_merchant_id
BRAINTREE_PUBLIC_KEY=your_public_key
BRAINTREE_PRIVATE_KEY=your_private_key
```

Device data is optional; nonce must be provided for Sale. Refunds require settled/settling transactions.

## Sample Outputs

After a Sale request, a typical callback payload might look like:

```
{
  "merchantReference": "order_12345",
  "provider": "braintree",
  "operation": "sale",
  "status": "PENDING",
  "transactionId": "bt_txn_abc",
  "amount": "12.34",
  "currency": "EUR"
}
```

On processor decline:

```
{
  "merchantReference": "order_12345",
  "provider": "braintree",
  "operation": "sale",
  "status": "FAILED",
  "transactionId": "bt_txn_abc",
  "amount": "12.34",
  "currency": "EUR",
  "error": { "code": "2005", "message": "Invalid Credit Card Number" }
}
```

## Design Rationale (Friendly Summary)

- Webhook keeps the merchant API simple and decoupled; the orchestrator posts when the provider responds.
- Idempotency is critical in payments; reusing the same `idempotencyKey` returns the same normalized response safely.
- Normalized responses let you handle provider outcomes uniformly (`SUCCESS` / `FAILED` / `PENDING`).
- Pending is normal right after authorization; settlement is asynchronous.
- Void support exists because refunds only work once transactions are settling/settled.
- Observability (trace IDs + metrics) helps debugging and monitoring.

## Flow Diagrams

Sale:

```
Merchant -> Orchestrator : POST /orchestrator/sale (idempotencyKey)
Orchestrator -> Braintree : transaction.sale(...)
Braintree -> Orchestrator : result (success/failed/pending)
Orchestrator -> Merchant  : POST /merchant/callback (normalized)
Merchant -> Client        : GET /merchant/status/:merchantReference
```

Refund:

```
Merchant -> Orchestrator : POST /orchestrator/refund (idempotencyKey)
Orchestrator -> Braintree : transaction.refund(...)
Braintree -> Orchestrator : result (requires settled/settling)
Orchestrator -> Merchant  : POST /merchant/callback (normalized)
Merchant -> Client        : GET /merchant/status/:merchantReference
```

Void:

```
Merchant -> Orchestrator : POST /orchestrator/void (idempotencyKey)
Orchestrator -> Braintree : transaction.void(...)
Braintree -> Orchestrator : result (for non-settled transactions)
Orchestrator -> Merchant  : POST /merchant/callback (normalized)
Merchant -> Client        : GET /merchant/status/:merchantReference
```

## Project Structure & Extensibility

- Small modules: config, constants, normalize, idempotency, notify, braintree client, server.
- Easy to swap storage: merchant in-memory store and orchestrator LRU can become DB/Redis later.
- Transport extensibility: add WebSocket or polling with minimal changes.
