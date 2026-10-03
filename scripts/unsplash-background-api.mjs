/**
 * Router HTTP compartilhado: /api/unsplash/background (local + Netlify).
 * Público (login) com rate limit; chave só no servidor.
 */
import { fetchUnsplashBackground, isUnsplashConfigured } from './unsplash-background.mjs';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;

export const CORS_HEADERS = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type'
};

/** @type {Map<string, { count: number, resetAt: number }>} */
const rateBuckets = new Map();

function clientKey(ip) {
    return String(ip || 'unknown').slice(0, 128);
}

function checkRateLimit(ip) {
    const key = clientKey(ip);
    const now = Date.now();
    let bucket = rateBuckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
        bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
        rateBuckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > RATE_LIMIT_MAX) return false;
    if (rateBuckets.size > 5000) {
        for (const [k, v] of rateBuckets) {
            if (now >= v.resetAt) rateBuckets.delete(k);
        }
    }
    return true;
}

function isSameSiteBrowserRequest(url, opts = {}) {
    const reqHost = String(url.hostname || '').toLowerCase();
    if (!reqHost) return false;
    const candidates = [opts.origin, opts.referer].filter(Boolean);
    for (const raw of candidates) {
        try {
            if (new URL(String(raw)).hostname.toLowerCase() === reqHost) return true;
        } catch (_) {
            /* ignore */
        }
    }
    // Local serve sem Origin (navegação direta / file-like)
    if (!opts.origin && !opts.referer) {
        return reqHost === '127.0.0.1' || reqHost === 'localhost';
    }
    return false;
}

export function jsonBody(body, status = 200) {
    return {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            ...CORS_HEADERS
        },
        body: JSON.stringify(body)
    };
}

/**
 * @param {URL} url
 * @param {string} method
 * @param {{ clientIp?: string, origin?: string, referer?: string }} [opts]
 */
export async function handleUnsplashBackgroundApi(url, method, opts = {}) {
    if (method === 'OPTIONS') {
        return { status: 204, headers: CORS_HEADERS, body: null };
    }

    if (method !== 'GET') {
        return jsonBody({ error: 'Método não permitido' }, 405);
    }

    const path = url.pathname.replace(/\/+$/, '');
    if (!path.endsWith('/background') && !path.endsWith('/unsplash/background')) {
        return jsonBody({ error: 'Não encontrado' }, 404);
    }

    if (!isSameSiteBrowserRequest(url, opts)) {
        return jsonBody({ error: 'Disponível apenas a partir do site.' }, 403);
    }

    if (!checkRateLimit(opts.clientIp)) {
        return jsonBody({ error: 'Muitas solicitações. Tente novamente em instantes.' }, 429);
    }

    if (!isUnsplashConfigured()) {
        return jsonBody(
            {
                error: 'Unsplash não configurado no servidor.',
                code: 'UNSPLASH_NOT_CONFIGURED'
            },
            503
        );
    }

    const collection = String(url.searchParams.get('collection') || '').trim();
    try {
        const photo = await fetchUnsplashBackground(collection);
        return jsonBody({
            ok: true,
            ...photo,
            fetchedAt: Date.now()
        });
    } catch (err) {
        const code = err && err.code ? String(err.code) : 'UNSPLASH_ERROR';
        const status =
            code === 'BAD_COLLECTION' ? 400 : err && err.status === 404 ? 404 : 502;
        return jsonBody(
            {
                error: (err && err.message) || 'Falha ao obter imagem Unsplash.',
                code
            },
            status
        );
    }
}
