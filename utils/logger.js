import { isMainThread } from 'node:worker_threads';

const LOG_LEVELS = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

const currentLevel = (process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')).toLowerCase();
const threshold = LOG_LEVELS[currentLevel] || LOG_LEVELS.info;

const SENSITIVE_KEYS = new Set([
    'authorization',
    'password',
    'token',
    'idtoken',
    'bearer',
    'secret',
    'privatekey',
    'private_key',
    'swiftbic',
    'taxid',
    'cookie',
]);

function redact(obj, depth = 0) {
    if (!obj || typeof obj !== 'object' || depth > 4) return obj;
    if (Array.isArray(obj)) return obj.map(item => redact(item, depth + 1));
    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
        const lower = k.toLowerCase().replace(/[^a-z]/g, '');
        if (SENSITIVE_KEYS.has(lower)) {
            clean[k] = '[REDACTED]';
        } else if (typeof v === 'object' && v !== null) {
            clean[k] = redact(v, depth + 1);
        } else {
            clean[k] = v;
        }
    }
    return clean;
}

function formatLog(level, message, meta = {}) {
    const payload = {
        level,
        timestamp: new Date().toISOString(),
        message,
        ...redact(meta),
    };
    return JSON.stringify(payload);
}

export const logger = {
    debug(message, meta) {
        if (threshold <= LOG_LEVELS.debug) console.debug(formatLog('debug', message, meta));
    },
    info(message, meta) {
        if (threshold <= LOG_LEVELS.info) console.info(formatLog('info', message, meta));
    },
    warn(message, meta) {
        if (threshold <= LOG_LEVELS.warn) console.warn(formatLog('warn', message, meta));
    },
    error(message, meta) {
        if (threshold <= LOG_LEVELS.error) console.error(formatLog('error', message, meta));
    },
};

export default logger;
