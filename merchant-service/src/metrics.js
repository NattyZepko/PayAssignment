const counters = {
    callbacks_received: 0,
    status_queries: 0,
};

export function inc(name) {
    if (name in counters) counters[name]++;
}

export function getMetrics() {
    return { ...counters };
}
