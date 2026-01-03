import { WebSocketServer } from 'ws';
import { logger } from './logger.js';

const clients = new Set();
let wss;

export function initWebSocket(server) {
    if (wss) return wss; // already initialized
    wss = new WebSocketServer({ server });
    wss.on('connection', (ws, req) => {
        clients.add(ws);
        logger.info({ ip: req.socket.remoteAddress }, 'websocket client connected');

        ws.on('close', () => {
            clients.delete(ws);
            logger.info('websocket client disconnected');
        });

        ws.on('error', (err) => {
            logger.error({ err: err.message }, 'websocket error');
        });

        // Optional: simple ping/pong to keep connections alive
        ws.on('message', (msg) => {
            if (String(msg).toLowerCase() === 'ping') {
                try { ws.send('pong'); } catch { }
            }
        });
    });

    logger.info('WebSocket server initialized');
    return wss;
}

export function broadcastStatus(payload) {
    const data = JSON.stringify({ type: 'status', payload });
    for (const ws of clients) {
        try {
            ws.send(data);
        } catch (err) {
            logger.error({ err: err.message }, 'websocket send failed');
        }
    }
}
