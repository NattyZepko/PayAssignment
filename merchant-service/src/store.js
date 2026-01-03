const statuses = new Map();

export function saveStatus(merchantReference, status) {
    statuses.set(merchantReference, {
        ...status,
        savedAt: new Date().toISOString(),
    });
}

export function getStatus(merchantReference) {
    return statuses.get(merchantReference) || null;
}
