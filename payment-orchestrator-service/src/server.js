import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { sale, refund, voidTxn } from './braintree.js';
import { get as idemGet, set as idemSet } from './idempotency.js';
import { notify } from './notify.js';
import { normalize } from './normalize.js';
import { config } from './config.js';
import { logger, genTraceId } from './logger.js';
import { inc, getMetrics } from './metrics.js';
import { ROUTES } from './constants.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// simple trace id middleware
app.use((req, _res, next) => {
    req.traceId = req.headers['x-request-id'] || req.body?.idempotencyKey || genTraceId();
    next();
});

const PORT = config.PORT;

function required(body, fields) {
    for (const f of fields) {
        if (!body || body[f] === undefined || body[f] === null || body[f] === '') {
            return `Missing field: ${f}`;
        }
    }
    return null;
}

// normalization moved to src/normalize.js

app.post(ROUTES.sale, async (req, res) => {
    const error = required(req.body, ['amount', 'currency', 'paymentMethodNonce', 'merchantReference', 'idempotencyKey']);
    if (error) return res.status(400).json({ error });

    const { amount, currency, paymentMethodNonce, merchantReference, idempotencyKey, deviceData, callbackUrl } = req.body;

    const cached = idemGet(idempotencyKey);
    if (cached) return res.status(200).json(cached);

    try {
        inc('sale_attempts');
        logger.info({ traceId: req.traceId, merchantReference, idempotencyKey }, 'sale: calling braintree');
        let btResult;
        try {
            btResult = await sale({ amount, paymentMethodNonce, deviceData, submitForSettlement: true });
        } catch (firstErr) {
            // Simple safe retry once for transient issues
            btResult = await sale({ amount, paymentMethodNonce, deviceData, submitForSettlement: true });
        }
        const normalized = normalize({ merchantReference, operation: 'sale', amount, currency, btResult });
        logger.info({ traceId: req.traceId, merchantReference, result: { success: btResult?.success, id: btResult?.transaction?.id } }, 'sale: normalized');
        idemSet(idempotencyKey, normalized);
        if (callbackUrl) await notify(callbackUrl, normalized);
        inc(btResult?.success ? 'sale_success' : 'sale_failed');
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
        inc('sale_failed');
        logger.error({ traceId: req.traceId, merchantReference, err: e.message }, 'sale: network error');
        res.status(502).json(normalized);
    }
});

app.post(ROUTES.refund, async (req, res) => {
    const error = required(req.body, ['transactionId', 'merchantReference', 'idempotencyKey']);
    if (error) return res.status(400).json({ error });

    const { transactionId, amount, merchantReference, idempotencyKey, callbackUrl } = req.body;

    const cached = idemGet(idempotencyKey);
    if (cached) return res.status(200).json(cached);

    try {
        inc('refund_attempts');
        logger.info({ traceId: req.traceId, merchantReference, idempotencyKey, transactionId }, 'refund: calling braintree');
        let btResult;
        try {
            btResult = await refund(transactionId, amount);
        } catch (firstErr) {
            // Simple safe retry once for transient issues
            btResult = await refund(transactionId, amount);
        }
        const normalized = normalize({ merchantReference, operation: 'refund', amount, currency: null, btResult });
        logger.info({ traceId: req.traceId, merchantReference, result: { success: btResult?.success, id: btResult?.transaction?.id } }, 'refund: normalized');
        idemSet(idempotencyKey, normalized);
        if (callbackUrl) await notify(callbackUrl, normalized);
        inc(btResult?.success ? 'refund_success' : 'refund_failed');
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
        inc('refund_failed');
        logger.error({ traceId: req.traceId, merchantReference, err: e.message }, 'refund: network error');
        res.status(502).json(normalized);
    }
});

app.post(ROUTES.void, async (req, res) => {
    const error = required(req.body, ['transactionId', 'merchantReference', 'idempotencyKey']);
    if (error) return res.status(400).json({ error });

    const { transactionId, merchantReference, idempotencyKey, callbackUrl } = req.body;

    const cached = idemGet(idempotencyKey);
    if (cached) return res.status(200).json(cached);

    try {
        inc('void_attempts');
        logger.info({ traceId: req.traceId, merchantReference, idempotencyKey, transactionId }, 'void: calling braintree');
        let btResult;
        try {
            btResult = await voidTxn(transactionId);
        } catch (firstErr) {
            btResult = await voidTxn(transactionId);
        }
        const normalized = normalize({ merchantReference, operation: 'void', amount: null, currency: null, btResult });
        logger.info({ traceId: req.traceId, merchantReference, result: { success: btResult?.success, id: btResult?.transaction?.id } }, 'void: normalized');
        idemSet(idempotencyKey, normalized);
        if (callbackUrl) await notify(callbackUrl, normalized);
        inc(btResult?.success ? 'void_success' : 'void_failed');
        res.status(200).json(normalized);
    } catch (e) {
        const normalized = {
            merchantReference,
            provider: 'braintree',
            operation: 'void',
            status: 'FAILED',
            transactionId: transactionId || null,
            amount: null,
            currency: null,
            error: { code: 'BT_NETWORK', message: e.message || 'Network/timeout' },
        };
        idemSet(idempotencyKey, normalized);
        if (callbackUrl) await notify(callbackUrl, normalized);
        inc('void_failed');
        logger.error({ traceId: req.traceId, merchantReference, err: e.message }, 'void: network error');
        res.status(502).json(normalized);
    }
});

app.get(ROUTES.metrics, (_req, res) => {
    res.status(200).json(getMetrics());
});

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        logger.info(`Payment Orchestrator listening on http://localhost:${PORT}`);
    });
}

export default app;
