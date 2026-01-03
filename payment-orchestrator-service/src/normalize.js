import { PROVIDER, STATUSES, PENDING_STATUSES } from './constants.js';

export function normalize({ merchantReference, operation, amount, currency, btResult }) {
    if (btResult?.success) {
        const txn = btResult.transaction || {};
        const normalizedStatus = PENDING_STATUSES.includes(txn.status) ? STATUSES.PENDING : STATUSES.SUCCESS;
        return {
            merchantReference,
            provider: PROVIDER,
            operation,
            status: normalizedStatus,
            transactionId: txn.id || null,
            amount: amount ? String(amount) : txn.amount,
            currency: currency || txn.currencyIsoCode || null,
        };
    }
    const code = btResult?.transaction?.processorResponseCode || btResult?.errors?.deepErrors()?.[0]?.code || 'BT_ERROR';
    const message = btResult?.transaction?.processorResponseText || btResult?.message || 'Unknown error';
    return {
        merchantReference,
        provider: PROVIDER,
        operation,
        status: STATUSES.FAILED,
        transactionId: btResult?.transaction?.id || null,
        amount: amount ? String(amount) : null,
        currency: currency || null,
        error: { code: String(code), message: String(message) },
    };
}
