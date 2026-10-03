/**
 * Router HTTP compartilhado da API de imagens (local + Netlify).
 * Core Serper: ./google-images-fetch.mjs
 * Auth: ./admin-auth.mjs (Bearer Supabase ou allowlist local explícita)
 */
import { searchGoogleImages, getGoogleImagesProviders } from './google-images-fetch.mjs';
import { requireAdminAuth } from './admin-auth.mjs';

const MAX_QUERY_LEN = 200;
const MAX_PAGE = 20;
const MAX_PER_PAGE = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 15;

/** Same-origin; Authorization para JWT quando Supabase Auth estiver no servidor. */
export const CORS_HEADERS = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type, Authorization'
};

/** @type {Map<string, { count: number, resetAt: number }>} */
const rateBuckets = new Map();

function clientKey(ip) {
    return String(ip || 'unknown').slice(0, 128);
}

/** Rate limit in-memory por IP (por instância). */
function checkRateLimit(ip) {
    const key = clientKey(ip);
    const now = Date.now();
    let bucket = rateBuckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
        bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
        rateBuckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > RATE_LIMIT_MAX) {
        return false;
    }
    if (rateBuckets.size > 5000) {
        for (const [k, v] of rateBuckets) {
            if (now >= v.resetAt) rateBuckets.delete(k);
        }
    }
    return true;
}

function clampInt(value, fallback, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(n)));
}

/** Defesa em profundidade — não substitui requireAdminAuth. */
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
    return false;
}

export function jsonBody(body, status = 200) {
    return {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...CORS_HEADERS
        },
        body: JSON.stringify(body)
    };
}

/**
 * @param {URL} url
 * @param {string} method
 * @param {{ clientIp?: string, origin?: string, referer?: string, headers?: object }} [opts]
 */
export async function handleGoogleImagesApi(url, method, opts = {}) {
    if (method === 'OPTIONS') {
        return { status: 204, headers: CORS_HEADERS, body: null };
    }

    if (method !== 'GET') {
        return jsonBody({ error: 'Método não permitido' }, 405);
    }

    const path = url.pathname.replace(/\/+$/, '');

    if (path.endsWith('/health')) {
        const auth = await requireAdminAuth({ headers: opts.headers || {} });
        if (!auth.ok) {
            return jsonBody({ ok: true, search: 'auth_required', providers: { serper: false } });
        }
        return jsonBody({
            ok: true,
            provider: 'google-images',
            providers: getGoogleImagesProviders()
        });
    }

    if (path.endsWith('/search')) {
        const auth = await requireAdminAuth({ headers: opts.headers || {} });
        if (!auth.ok) {
            return jsonBody({ error: auth.error || 'Não autenticado.' }, auth.status || 401);
        }

        if (!isSameSiteBrowserRequest(url, opts)) {
            return jsonBody(
                { error: 'Busca de imagens disponível apenas a partir do painel do site.' },
                403
            );
        }

        if (!checkRateLimit(opts.clientIp)) {
            return jsonBody({ error: 'Muitas requisições. Tente novamente em instantes.' }, 429);
        }

        const query = String(url.searchParams.get('query') || '').trim();
        if (!query) {
            return jsonBody({ error: 'Parâmetro query obrigatório' }, 400);
        }
        if (query.length > MAX_QUERY_LEN) {
            return jsonBody(
                { error: `Parâmetro query excede ${MAX_QUERY_LEN} caracteres` },
                400
            );
        }

        try {
            const page = clampInt(url.searchParams.get('page') || 1, 1, 1, MAX_PAGE);
            const perPage = clampInt(
                url.searchParams.get('per_page') || 18,
                18,
                1,
                MAX_PER_PAGE
            );
            const data = await searchGoogleImages(query, page, perPage);
            return jsonBody(data);
        } catch (err) {
            const msg = String(err && err.message ? err.message : '');
            if (/Configure SERPER_API_KEY/.test(msg)) {
                return jsonBody(
                    {
                        error:
                            'Busca de imagens indisponível. Configure SERPER_API_KEY no servidor.'
                    },
                    502
                );
            }
            return jsonBody({ error: 'Não foi possível obter resultados da busca de imagens.' }, 502);
        }
    }

    return jsonBody({ error: 'Use /api/google-images/health ou /api/google-images/search' }, 404);
}
