import express from 'express';
import bodyParser from 'body-parser';
import request from 'supertest';

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

describe('Normalization', () => {
    test('success maps correctly', () => {
        const btResult = { success: true, transaction: { id: 'tx123', amount: '10.00', currencyIsoCode: 'EUR', status: 'settled' } };
        const normalized = normalize({ merchantReference: 'order_1', operation: 'sale', amount: '10.00', currency: 'EUR', btResult });
        expect(normalized.status).toBe('SUCCESS');
        expect(normalized.transactionId).toBe('tx123');
    });
    test('pending maps to PENDING for settlement statuses', () => {
        const btResult = { success: true, transaction: { id: 'tx124', amount: '10.00', currencyIsoCode: 'EUR', status: 'submitted_for_settlement' } };
        const normalized = normalize({ merchantReference: 'order_2', operation: 'sale', amount: '10.00', currency: 'EUR', btResult });
        expect(normalized.status).toBe('PENDING');
    });
    test('failure maps with error', () => {
        const btResult = { success: false, transaction: { processorResponseCode: '2005', processorResponseText: 'Invalid Credit Card Number' } };
        const normalized = normalize({ merchantReference: 'order_1', operation: 'sale', amount: '10.00', currency: 'EUR', btResult });
        expect(normalized.status).toBe('FAILED');
        expect(normalized.error.code).toBe('2005');
        expect(normalized.transactionId).toBeNull();
    });
});
