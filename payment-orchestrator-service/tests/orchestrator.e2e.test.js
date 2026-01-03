import request from 'supertest';
import { jest, describe, test, expect, beforeEach } from '@jest/globals';

// Explanation: We mock Braintree and notify modules to isolate orchestrator behavior.
const mockSale = jest.fn();
const mockRefund = jest.fn();
const mockNotify = jest.fn().mockResolvedValue({ sent: true, status: 200 });
const mockVoidTxn = jest.fn();

jest.unstable_mockModule('../src/braintree.js', () => ({
    sale: mockSale,
    refund: mockRefund,
    voidTxn: mockVoidTxn,
}));

jest.unstable_mockModule('../src/notify.js', () => ({
    notify: mockNotify,
}));

// Dynamic import after mocks are set up.
const { default: app } = await import('../src/server.js');

describe('Orchestrator endpoints', () => {
    beforeEach(() => {
        mockSale.mockReset();
        mockRefund.mockReset();
        mockNotify.mockReset().mockResolvedValue({ sent: true, status: 200 });
        process.env.NODE_ENV = 'test';
    });

    // Explanation: Valid sale request returns normalized response and invokes notify.
    test('sale success (PENDING when submitted_for_settlement)', async () => {
        mockSale.mockResolvedValue({ success: true, transaction: { id: 'tx123', amount: '12.34', currencyIsoCode: 'EUR', status: 'submitted_for_settlement' } });
        const res = await request(app).post('/orchestrator/sale').send({
            amount: '12.34',
            currency: 'EUR',
            paymentMethodNonce: 'fake-valid-nonce',
            merchantReference: 'order_1',
            idempotencyKey: 'uuid-1',
            callbackUrl: 'http://localhost:3001/merchant/callback',
            deviceData: 'device-data',
        });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('PENDING');
        expect(res.body.transactionId).toBe('tx123');
        expect(mockNotify).toHaveBeenCalled();
    });

    // Explanation: Missing required fields cause 400 with clear error message.
    test('sale validation error (missing idempotencyKey)', async () => {
        const res = await request(app).post('/orchestrator/sale').send({
            amount: '12.34',
            currency: 'EUR',
            paymentMethodNonce: 'nonce',
            merchantReference: 'order_1',
        });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Missing field: idempotencyKey');
    });

    // Explanation: Idempotency returns cached response without re-calling sale.
    test('sale idempotency returns cached response', async () => {
        mockSale.mockResolvedValue({ success: true, transaction: { id: 'tx123', amount: '12.34', currencyIsoCode: 'EUR', status: 'settled' } });
        const payload = {
            amount: '12.34',
            currency: 'EUR',
            paymentMethodNonce: 'nonce',
            merchantReference: 'order_2',
            idempotencyKey: 'uuid-2',
        };
        const res1 = await request(app).post('/orchestrator/sale').send(payload);
        const res2 = await request(app).post('/orchestrator/sale').send(payload);
        expect(res1.body.transactionId).toBe('tx123');
        expect(res2.body.transactionId).toBe('tx123');
        expect(mockSale).toHaveBeenCalledTimes(1);
    });

    // Explanation: Refund success maps to SUCCESS and calls notify when provided.
    test('refund success', async () => {
        mockRefund.mockResolvedValue({ success: true, transaction: { id: 'cr123', type: 'credit', amount: '10.00' } });
        const res = await request(app).post('/orchestrator/refund').send({
            transactionId: 'bt_txn_id_here',
            amount: '10.00',
            merchantReference: 'refund_1',
            idempotencyKey: 'uuid-3',
            callbackUrl: 'http://localhost:3001/merchant/callback',
        });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('SUCCESS');
        expect(res.body.transactionId).toBe('cr123');
        expect(mockNotify).toHaveBeenCalled();
    });

    // Explanation: Refund missing fields returns 400.
    test('refund validation error (missing idempotencyKey)', async () => {
        const res = await request(app).post('/orchestrator/refund').send({
            transactionId: 'bt_txn',
            merchantReference: 'refund_1',
        });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Missing field: idempotencyKey');
    });

    // Explanation: Network/timeout errors return FAILED with BT_NETWORK and 502.

    // Explanation: Void non-settled transaction returns SUCCESS and calls notify.
    test('void success', async () => {
        mockSale.mockResolvedValue({ success: true, transaction: { id: 'tx123', status: 'authorized' } });
        mockRefund.mockResolvedValue({ success: false, transaction: { status: 'processor_declined', processorResponseCode: '2005' } });
        const mockVoidResult = { success: true, transaction: { id: 'tx123', status: 'voided' } };
        mockVoidTxn.mockResolvedValue(mockVoidResult);

        const res = await request(app).post('/orchestrator/void').send({
            transactionId: 'tx123',
            merchantReference: 'void_1',
            idempotencyKey: 'uuid-void-1',
            callbackUrl: 'http://localhost:3001/merchant/callback',
        });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('SUCCESS');
        expect(res.body.operation).toBe('void');
    });
    test('refund network error path', async () => {
        mockRefund.mockRejectedValueOnce(new Error('timeout'));
        mockRefund.mockRejectedValueOnce(new Error('timeout')); // ensure retry also fails
        const res = await request(app).post('/orchestrator/refund').send({
            transactionId: 'bt_txn_id_here',
            amount: '10.00',
            merchantReference: 'refund_2',
            idempotencyKey: 'uuid-4',
            callbackUrl: 'http://localhost:3001/merchant/callback',
        });
        expect(res.status).toBe(502);
        expect(res.body.status).toBe('FAILED');
        expect(res.body.error.code).toBe('BT_NETWORK');
    });
});
