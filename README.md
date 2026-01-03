# Payment Orchestrator (Braintree) – Sale & Refund

A minimal two-service Node.js system demonstrating Braintree Sale and Refund, error handling, idempotency, and merchant notification via webhook.

## Architecture

```
+--------------------+        POST /orchestrator/*        +----------------------------+
|  Merchant Service  |  ------------------------------->  | Payment Orchestrator       |
|  (port 3001)       |                                    | (port 3002)                |
|                    |  <--- webhook (POST /merchant/...) |                            |
| - /merchant/payments|                                    | - /orchestrator/sale       |
| - /merchant/refunds |                                    | - /orchestrator/refund     |
| - /merchant/callback|                                    |                            |
| - /merchant/status/*|                                    |  Braintree Sandbox         |
+--------------------+                                    +-------------+--------------+
                                                                      ^
                                                                      |
                                                             Transaction.sale/refund
```

 - Transport choice: Webhook (POS posts normalized result to MS `callbackUrl`). Chosen for simplicity and decoupling; MS can be offline and still receive updates later.
- Idempotency: In-memory store in POS keyed by `idempotencyKey`.
- Status persistence: In-memory store in MS keyed by `merchantReference`.

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

Start a Sale (Merchant Service):

```
curl -X POST http://localhost:3001/merchant/payments \
 -H "Content-Type: application/json" \
 -d '{
   "amount": "12.34",
   "currency": "EUR",
   "paymentMethodNonce": "fake-valid-nonce",
   "merchantReference": "order_12345",
   "callbackUrl": "http://localhost:3001/merchant/callback"
 }'
```

Check Status:

```
curl http://localhost:3001/merchant/status/order_12345
```

Start a Refund (Merchant Service):

```
curl -X POST http://localhost:3001/merchant/refunds \
 -H "Content-Type: application/json" \
 -d '{
   "transactionId": "bt_txn_id_here",
   "amount": "12.34",
   "merchantReference": "refund_987",
   "callbackUrl": "http://localhost:3001/merchant/callback"
 }'
```

Idempotency header example (optional, overrides generated key):

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

- Error handling: Maps provider declines to `FAILED` with processor codes; network/timeouts return `BT_NETWORK`. A simple one-time retry is applied for transient failures.
- Idempotency: Reuses prior normalized response for the same `idempotencyKey`.
- Logging: Minimal `console.log`, avoids sensitive data.
- Secrets: Use `.env`; do not commit actual credentials.

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
