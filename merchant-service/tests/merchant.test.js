import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import { saveStatus, getStatus } from '../src/store.js';

const app = express();
app.use(bodyParser.json());
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

describe('Merchant callback + status', () => {
    test('stores and returns status', async () => {
        const payload = {
            merchantReference: 'order_123',
            provider: 'braintree',
            operation: 'sale',
            status: 'SUCCESS',
            transactionId: 'tx_abc',
            amount: '12.34',
            currency: 'EUR',
        };
        await request(app).post('/merchant/callback').send(payload).expect(200);
        const res = await request(app).get('/merchant/status/order_123').expect(200);
        expect(res.body.status).toBe('SUCCESS');
        expect(res.body.transactionId).toBe('tx_abc');
    });
});
