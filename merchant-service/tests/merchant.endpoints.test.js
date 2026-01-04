import request from 'supertest';
import { ORCH_ROUTES, MERCHANT_ROUTES } from '../src/constants.js';
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Explanation: We mock axios to control orchestrator responses and validate forwarding.
jest.unstable_mockModule('axios', () => ({
    default: {
        post: jest.fn((url, payload) => {
            // simulate orchestrator normalized response
            if (url.endsWith(ORCH_ROUTES.sale)) {
                return Promise.resolve({ data: { ...payload, provider: 'braintree', operation: 'sale', status: 'SUCCESS', transactionId: 'tx123' } });
            }
            if (url.endsWith(ORCH_ROUTES.refund)) {
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

    // Explanation: /merchant/payments forwards payload, includes deviceData and idempotencyKey, and returns orchestrator response.
    test('payments forwards to orchestrator and returns normalized', async () => {
        const res = await request(app).post(MERCHANT_ROUTES.payments).send({
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

    // Explanation: /merchant/refunds forwards payload and returns orchestrator response.
    test('refunds forwards to orchestrator and returns normalized', async () => {
        const res = await request(app).post(MERCHANT_ROUTES.refunds).send({
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

    // Explanation: /merchant/void forwards payload and returns orchestrator response.
    test('void forwards to orchestrator and returns normalized', async () => {
        const axiosModule = (await import('axios')).default;
        axiosModule.post = jest.fn((url, payload) => {
            if (url.endsWith(ORCH_ROUTES.void)) {
                return Promise.resolve({ data: { ...payload, provider: 'braintree', operation: 'void', status: 'SUCCESS', transactionId: payload.transactionId } });
            }
            return Promise.reject(new Error('unknown'));
        });

        const res = await request(app).post(MERCHANT_ROUTES.void).send({
            transactionId: 'tx123',
            merchantReference: 'void_1',
            idempotencyKey: 'uuid-void-1',
            callbackUrl: 'http://localhost:3001/merchant/callback',
        });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('SUCCESS');
        expect(res.body.operation).toBe('void');
        expect(res.body.transactionId).toBe('tx123');
    });
    test('callback missing merchantReference returns 400', async () => {
        const res = await request(app).post(MERCHANT_ROUTES.callback).send({ status: 'SUCCESS' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Missing merchantReference');
    });
});
