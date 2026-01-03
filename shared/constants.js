export const ROUTES = Object.freeze({
    sale: '/orchestrator/sale',
    refund: '/orchestrator/refund',
    void: '/orchestrator/void',
    metrics: '/orchestrator/metrics',
});

export const MERCHANT_ROUTES = Object.freeze({
    payments: '/merchant/payments',
    refunds: '/merchant/refunds',
    void: '/merchant/void',
    callback: '/merchant/callback',
    status: '/merchant/status/:merchantReference',
    metrics: '/merchant/metrics',
});
