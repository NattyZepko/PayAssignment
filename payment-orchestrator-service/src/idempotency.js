const store = new Map();

export function get(key) {
    return store.get(key);
}

export function set(key, value) {
    store.set(key, value);
}
