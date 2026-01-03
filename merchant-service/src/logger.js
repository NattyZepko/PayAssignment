import pino from 'pino';

export const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

export function genTraceId() {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
