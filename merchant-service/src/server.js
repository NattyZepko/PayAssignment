import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import axios from 'axios';
import { saveStatus, getStatus } from './store.js';
import { config } from './config.js';
import { logger, genTraceId } from './logger.js';
import { inc, getMetrics } from './metrics.js';
import { initWebSocket, broadcastStatus } from './ws.js';
import { MERCHANT_ROUTES, ORCH_ROUTES } from './constants.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use((req, _res, next) => {
    req.traceId = req.headers['x-request-id'] || req.body?.idempotencyKey || genTraceId();
    next();
});

const PORT = config.PORT;
const ORCHESTRATOR_BASE_URL = config.ORCHESTRATOR_BASE_URL;

function required(body, fields) {
    for (const f of fields) {
        if (!body || body[f] === undefined || body[f] === null || body[f] === '') {
            return `Missing field: ${f}`;
        }
    }
    return null;
}

app.post(MERCHANT_ROUTES.payments, async (req, res) => {
    const error = required(req.body, ['amount', 'currency', 'paymentMethodNonce', 'merchantReference']);
    if (error) return res.status(400).json({ error });

    const payload = {
        amount: String(req.body.amount),
        currency: req.body.currency,
        paymentMethodNonce: req.body.paymentMethodNonce,
        deviceData: req.body.deviceData,
        merchantReference: req.body.merchantReference,
        callbackUrl: req.body.callbackUrl || `http://localhost:${PORT}/merchant/callback`,
        idempotencyKey: req.body.idempotencyKey || req.headers['x-idempotency-key'] || cryptoRandom(),
    };

    try {
        const resp = await axios.post(`${ORCHESTRATOR_BASE_URL}${ORCH_ROUTES.sale}`, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000,
        });
        logger.info({ traceId: req.traceId, merchantReference: payload.merchantReference }, 'forwarded sale');
        res.status(200).json(resp.data);
    } catch (err) {
        const status = err.response?.status || 500;
        logger.error({ traceId: req.traceId, err: err.message }, 'forwarding sale failed');
        res.status(status).json({ error: err.response?.data?.error || 'Forwarding failed' });
    }
});

app.post(MERCHANT_ROUTES.refunds, async (req, res) => {
    const error = required(req.body, ['transactionId', 'amount', 'merchantReference']);
    if (error) return res.status(400).json({ error });

    const payload = {
        transactionId: req.body.transactionId,
        amount: String(req.body.amount),
        merchantReference: req.body.merchantReference,
        callbackUrl: req.body.callbackUrl || `http://localhost:${PORT}/merchant/callback`,
        idempotencyKey: req.body.idempotencyKey || req.headers['x-idempotency-key'] || cryptoRandom(),
    };

    try {
        const resp = await axios.post(`${ORCHESTRATOR_BASE_URL}${ORCH_ROUTES.refund}`, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000,
        });
        logger.info({ traceId: req.traceId, merchantReference: payload.merchantReference }, 'forwarded refund');
        res.status(200).json(resp.data);
    } catch (err) {
        const status = err.response?.status || 500;
        logger.error({ traceId: req.traceId, err: err.message }, 'forwarding refund failed');
        res.status(status).json({ error: err.response?.data?.error || 'Forwarding failed' });
    }
});

app.post(MERCHANT_ROUTES.void, async (req, res) => {
    const error = required(req.body, ['transactionId', 'merchantReference']);
    if (error) return res.status(400).json({ error });

    const payload = {
        transactionId: req.body.transactionId,
        merchantReference: req.body.merchantReference,
        callbackUrl: req.body.callbackUrl || `http://localhost:${PORT}/merchant/callback`,
        idempotencyKey: req.body.idempotencyKey || req.headers['x-idempotency-key'] || cryptoRandom(),
    };

    try {
        const resp = await axios.post(`${ORCHESTRATOR_BASE_URL}${ORCH_ROUTES.void}`, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000,
        });
        res.status(200).json(resp.data);
    } catch (err) {
        const status = err.response?.status || 500;
        res.status(status).json({ error: err.response?.data?.error || 'Forwarding failed' });
    }
});

app.post(MERCHANT_ROUTES.callback, (req, res) => {
    const body = req.body || {};
    if (!body.merchantReference) return res.status(400).json({ error: 'Missing merchantReference' });
    saveStatus(body.merchantReference, body);
    inc('callbacks_received');
    logger.info({ traceId: req.traceId, merchantReference: body.merchantReference, status: body.status }, 'callback received');
    // Broadcast over WebSocket for real-time client updates
    try { broadcastStatus(body); } catch { }
    res.status(200).json({ received: true });
});

app.get(MERCHANT_ROUTES.status, (req, res) => {
    const status = getStatus(req.params.merchantReference);
    if (!status) return res.status(404).json({ error: 'Not found' });
    inc('status_queries');
    res.status(200).json(status);
});
app.get(MERCHANT_ROUTES.metrics, (_req, res) => {
    res.status(200).json(getMetrics());
});

function cryptoRandom() {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

if (process.env.NODE_ENV !== 'test') {
    const server = app.listen(PORT, () => {
        logger.info(`Merchant Service listening on http://localhost:${PORT}`);
    });
    initWebSocket(server);
}

export default app;
