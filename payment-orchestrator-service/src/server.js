import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { sale, refund } from './braintree.js';
import { get as idemGet, set as idemSet } from './idempotency.js';
import { notify } from './notify.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3002;

function required(body, fields) {
    for (const f of fields) {
        if (!body || body[f] === undefined || body[f] === null || body[f] === '') {
            return `Missing field: ${f}`;
        }
    }
    return null;
}

function normalize({ merchantReference, operation, amount, currency, btResult }) {
    if (btResult?.success) {
        const pendingStatuses = ['authorized', 'submitted_for_settlement', 'settling'];
        const txnStatus = btResult.transaction?.status;
        const normalizedStatus = pendingStatuses.includes(txnStatus) ? 'PENDING' : 'SUCCESS';
        return {
            merchantReference,
            provider: 'braintree',
            operation,
            status: normalizedStatus,
            transactionId: btResult.transaction?.id || null,
            amount: amount ? String(amount) : btResult.transaction?.amount,
            currency: currency || btResult.transaction?.currencyIsoCode || null,
        };
    }
    const code = btResult?.transaction?.processorResponseCode || btResult?.errors?.deepErrors()?.[0]?.code || 'BT_ERROR';
    const message = btResult?.transaction?.processorResponseText || btResult?.message || 'Unknown error';
    return {
        merchantReference,
        provider: 'braintree',
        operation,
        status: 'FAILED',
        transactionId: btResult?.transaction?.id || null,
        amount: amount ? String(amount) : null,
        currency: currency || null,
        error: { code: String(code), message: String(message) },
    };
}

app.post('/orchestrator/sale', async (req, res) => {
    const error = required(req.body, ['amount', 'currency', 'paymentMethodNonce', 'merchantReference', 'idempotencyKey']);
    if (error) return res.status(400).json({ error });

    const { amount, currency, paymentMethodNonce, merchantReference, idempotencyKey, deviceData, callbackUrl } = req.body;

    const cached = idemGet(idempotencyKey);
    if (cached) return res.status(200).json(cached);

    try {
        let btResult;
        try {
            btResult = await sale({ amount, paymentMethodNonce, deviceData, submitForSettlement: true });
        } catch (firstErr) {
            // Simple safe retry once for transient issues
            btResult = await sale({ amount, paymentMethodNonce, deviceData, submitForSettlement: true });
        }
        const normalized = normalize({ merchantReference, operation: 'sale', amount, currency, btResult });
        idemSet(idempotencyKey, normalized);
        if (callbackUrl) await notify(callbackUrl, normalized);
        res.status(200).json(normalized);
    } catch (e) {
        const normalized = {
            merchantReference,
            provider: 'braintree',
            operation: 'sale',
            status: 'FAILED',
            transactionId: null,
            amount: String(amount),
            currency,
            error: { code: 'BT_NETWORK', message: e.message || 'Network/timeout' },
        };
        idemSet(idempotencyKey, normalized);
        if (callbackUrl) await notify(callbackUrl, normalized);
        res.status(502).json(normalized);
    }
});

app.post('/orchestrator/refund', async (req, res) => {
    const error = required(req.body, ['transactionId', 'merchantReference', 'idempotencyKey']);
    if (error) return res.status(400).json({ error });

    const { transactionId, amount, merchantReference, idempotencyKey, callbackUrl } = req.body;

    const cached = idemGet(idempotencyKey);
    if (cached) return res.status(200).json(cached);

    try {
        let btResult;
        try {
            btResult = await refund(transactionId, amount);
        } catch (firstErr) {
            // Simple safe retry once for transient issues
            btResult = await refund(transactionId, amount);
        }
        const normalized = normalize({ merchantReference, operation: 'refund', amount, currency: null, btResult });
        idemSet(idempotencyKey, normalized);
        if (callbackUrl) await notify(callbackUrl, normalized);
        res.status(200).json(normalized);
    } catch (e) {
        const normalized = {
            merchantReference,
            provider: 'braintree',
            operation: 'refund',
            status: 'FAILED',
            transactionId: transactionId || null,
            amount: amount ? String(amount) : null,
            currency: null,
            error: { code: 'BT_NETWORK', message: e.message || 'Network/timeout' },
        };
        idemSet(idempotencyKey, normalized);
        if (callbackUrl) await notify(callbackUrl, normalized);
        res.status(502).json(normalized);
    }
});

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Payment Orchestrator listening on http://localhost:${PORT}`);
    });
}

export default app;
