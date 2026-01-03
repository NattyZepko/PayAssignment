import request from 'supertest';
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Explain: We mock axios to control orchestrator responses and validate forwarding.
jest.unstable_mockModule('axios', () => ({
    default: {
        post: jest.fn((url, payload) => {
            // simulate orchestrator normalized response
            if (url.endsWith('/orchestrator/sale')) {
                return Promise.resolve({ data: { ...payload, provider: 'braintree', operation: 'sale', status: 'SUCCESS', transactionId: 'tx123' } });
            }
            if (url.endsWith('/orchestrator/refund')) {
                return Promise.resolve({ data: { ...payload, provider: 'braintree', operation: 'refund', status: 'SUCCESS', transactionId: 'cr123' } });
            }
            return Promise.reject(new Error('unknown'));
        }),
    },
}));

const { default: app } = await import('../src/server.js');

describe('Merchant endpoints', () => {
    beforeEach(() => {
        process.env.NODE_ENV = 'test';
    });

    // Explain: /merchant/payments forwards payload, includes deviceData and idempotencyKey, and returns orchestrator response.
    test('payments forwards to orchestrator and returns normalized', async () => {
        const res = await request(app).post('/merchant/payments').send({
            amount: '12.34',
            currency: 'EUR',
            paymentMethodNonce: 'nonce',
            deviceData: 'device-data',
            merchantReference: 'order_1',
            idempotencyKey: 'uuid-1',
            callbackUrl: 'http://localhost:3001/merchant/callback',
        });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('SUCCESS');
        expect(res.body.operation).toBe('sale');
        expect(res.body.deviceData).toBe('device-data');
    });

    // Explain: /merchant/refunds forwards payload and returns orchestrator response.
    test('refunds forwards to orchestrator and returns normalized', async () => {
        const res = await request(app).post('/merchant/refunds').send({
            transactionId: 'bt_txn',
            amount: '10.00',
            merchantReference: 'refund_1',
            idempotencyKey: 'uuid-2',
            callbackUrl: 'http://localhost:3001/merchant/callback',
        });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('SUCCESS');
        expect(res.body.operation).toBe('refund');
    });

    // Explain: /merchant/callback requires merchantReference; missing returns 400.
    test('callback missing merchantReference returns 400', async () => {
        const res = await request(app).post('/merchant/callback').send({ status: 'SUCCESS' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Missing merchantReference');
    });
});
