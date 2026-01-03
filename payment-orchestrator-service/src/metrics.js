const counters = {
    sale_attempts: 0,
    sale_success: 0,
    sale_failed: 0,
    refund_attempts: 0,
    refund_success: 0,
    refund_failed: 0,
    void_attempts: 0,
    void_success: 0,
    void_failed: 0,
};

export function inc(name) {
    if (name in counters) counters[name]++;
}

export function getMetrics() {
    return { ...counters };
}
