import axios from 'axios';

export async function notify(callbackUrl, payload) {
    if (!callbackUrl) return { sent: false, error: 'no_callback' };
    try {
        const res = await axios.post(callbackUrl, payload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000,
        });
        return { sent: true, status: res.status };
    } catch (err) {
        return { sent: false, error: err.message };
    }
}
