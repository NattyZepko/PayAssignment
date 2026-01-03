export const MERCHANT_ROUTES = Object.freeze({
    payments: '/merchant/payments',
    refunds: '/merchant/refunds',
    void: '/merchant/void',
    callback: '/merchant/callback',
    status: '/merchant/status/:merchantReference',
    metrics: '/merchant/metrics',
});

export const ORCH_ROUTES = Object.freeze({
    sale: '/orchestrator/sale',
    refund: '/orchestrator/refund',
    void: '/orchestrator/void',
});
