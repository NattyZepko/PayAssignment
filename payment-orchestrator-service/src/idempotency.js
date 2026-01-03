import { LRUCache } from 'lru-cache';

const store = new LRUCache({ max: 500, ttl: 1000 * 60 * 15 }); // max 500 items, 15 minutes TTL

export function get(key) {
    return store.get(key);
}

export function set(key, value) {
    store.set(key, value);
}
