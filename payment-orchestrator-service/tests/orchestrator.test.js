import { normalize } from '../src/normalize.js';

// Explanation: Unit tests for normalize() mapping success/failure and pending statuses.
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
