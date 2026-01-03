import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import axios from 'axios';
import { saveStatus, getStatus } from './store.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;
const ORCHESTRATOR_BASE_URL = process.env.ORCHESTRATOR_BASE_URL || 'http://localhost:3002';

function required(body, fields) {
    for (const f of fields) {
        if (!body || body[f] === undefined || body[f] === null || body[f] === '') {
            return `Missing field: ${f}`;
        }
    }
    return null;
}

app.post('/merchant/payments', async (req, res) => {
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
        const resp = await axios.post(`${ORCHESTRATOR_BASE_URL}/orchestrator/sale`, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000,
        });
        res.status(200).json(resp.data);
    } catch (err) {
        const status = err.response?.status || 500;
        res.status(status).json({ error: err.response?.data?.error || 'Forwarding failed' });
    }
});

app.post('/merchant/refunds', async (req, res) => {
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
        const resp = await axios.post(`${ORCHESTRATOR_BASE_URL}/orchestrator/refund`, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 15000,
        });
        res.status(200).json(resp.data);
    } catch (err) {
        const status = err.response?.status || 500;
        res.status(status).json({ error: err.response?.data?.error || 'Forwarding failed' });
    }
});

app.post('/merchant/callback', (req, res) => {
    const body = req.body || {};
    if (!body.merchantReference) return res.status(400).json({ error: 'Missing merchantReference' });
    saveStatus(body.merchantReference, body);
    res.status(200).json({ received: true });
});

app.get('/merchant/status/:merchantReference', (req, res) => {
    const status = getStatus(req.params.merchantReference);
    if (!status) return res.status(404).json({ error: 'Not found' });
    res.status(200).json(status);
});

function cryptoRandom() {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Merchant Service listening on http://localhost:${PORT}`);
    });
}

export default app;
