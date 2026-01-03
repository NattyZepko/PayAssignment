export const PROVIDER = 'braintree';
export const STATUSES = Object.freeze({ SUCCESS: 'SUCCESS', FAILED: 'FAILED', PENDING: 'PENDING' });
export const PENDING_STATUSES = ['authorized', 'submitted_for_settlement', 'settling'];
export const ROUTES = Object.freeze({
    sale: '/orchestrator/sale',
    refund: '/orchestrator/refund',
    void: '/orchestrator/void',
    metrics: '/orchestrator/metrics',
});
