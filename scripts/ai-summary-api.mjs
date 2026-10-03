/**
 * Router HTTP compartilhado do resumo por IA (local + Netlify).
 * Chave Groq apenas via process.env.GROQ_API_KEY (nunca no frontend).
 * Acesso restrito ao painel admin (requireAdminAuth + same-site).
 */
import { createHash } from 'node:crypto';
import { requireAdminAuth } from './admin-auth.mjs';

const MAX_TITLE_LEN = 300;
const MAX_CONTENT_LEN = 12_000;
const MAX_SLUG_LEN = 200;
const MAX_BODY_BYTES = 64_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const CACHE_MAX_ENTRIES = 200;
const GROQ_MODEL = 'openai/gpt-oss-20b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export const CORS_HEADERS = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type, Authorization'
};

/** @type {Map<string, { count: number, resetAt: number }>} */
const rateBuckets = new Map();

/** @type {Map<string, { summary: string, at: number }>} */
const summaryCache = new Map();

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

function stripToPlainText(raw) {
    return String(raw || '')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim();
}

function cacheKey(slug, content) {
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 24);
    return `${slug}::${hash}`;
}

function cacheGet(key) {
    const hit = summaryCache.get(key);
    if (!hit) return null;
    summaryCache.delete(key);
    summaryCache.set(key, hit);
    return hit.summary;
}

function cacheSet(key, summary) {
    if (summaryCache.has(key)) summaryCache.delete(key);
    summaryCache.set(key, { summary, at: Date.now() });
    while (summaryCache.size > CACHE_MAX_ENTRIES) {
        const oldest = summaryCache.keys().next().value;
        summaryCache.delete(oldest);
    }
}

async function readJsonBody(opts = {}) {
    if (opts.body != null) {
        if (typeof opts.body === 'string') {
            if (Buffer.byteLength(opts.body, 'utf8') > MAX_BODY_BYTES) {
                return { error: jsonBody({ error: 'Payload muito grande.' }, 413) };
            }
            try {
                return { data: JSON.parse(opts.body || '{}') };
            } catch (_) {
                return { error: jsonBody({ error: 'JSON inválido.' }, 400) };
            }
        }
        if (typeof opts.body === 'object') {
            return { data: opts.body };
        }
    }

    const req = opts.rawRequest;
    if (!req || typeof req.text !== 'function') {
        return { error: jsonBody({ error: 'Corpo da requisição ausente.' }, 400) };
    }

    let text;
    try {
        text = await req.text();
    } catch (_) {
        return { error: jsonBody({ error: 'Não foi possível ler o corpo da requisição.' }, 400) };
    }

    if (Buffer.byteLength(text || '', 'utf8') > MAX_BODY_BYTES) {
        return { error: jsonBody({ error: 'Payload muito grande.' }, 413) };
    }

    try {
        return { data: JSON.parse(text || '{}') };
    } catch (_) {
        return { error: jsonBody({ error: 'JSON inválido.' }, 400) };
    }
}

async function callGroq({ title, content }) {
    const apiKey = String(process.env.GROQ_API_KEY || '').trim();
    if (!apiKey) {
        throw new Error('MISSING_KEY');
    }

    const systemPrompt =
        'Você é um editor de um site de notícias. Resuma matérias em português do Brasil. ' +
        'Escreva 2 a 4 frases curtas, objetivas e jornalísticas. ' +
        'Baseie-se exclusivamente no conteúdo fornecido. Não invente fatos, nomes, números ou datas. ' +
        'Não acrescente opinião, adjetivos promocionais nem introduções do tipo "Este artigo fala sobre". ' +
        'Responda apenas com o texto do resumo.';

    const userPrompt = `Título: ${title}\n\nConteúdo:\n${content}`;

    const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            temperature: 0.3,
            max_tokens: 250,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ]
        })
    });

    if (!res.ok) {
        throw new Error('GROQ_UPSTREAM');
    }

    let data;
    try {
        data = await res.json();
    } catch (_) {
        throw new Error('GROQ_UPSTREAM');
    }

    const summary = String(data?.choices?.[0]?.message?.content || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!summary) {
        throw new Error('GROQ_EMPTY');
    }
    return summary;
}

/**
 * @param {URL} url
 * @param {string} method
 * @param {{ clientIp?: string, origin?: string, referer?: string, headers?: object, body?: string|object, rawRequest?: Request }} [opts]
 */
export async function handleAiSummaryApi(url, method, opts = {}) {
    if (method === 'OPTIONS') {
        return { status: 204, headers: CORS_HEADERS, body: null };
    }

    if (method !== 'POST') {
        return jsonBody({ error: 'Método não permitido' }, 405);
    }

    const path = url.pathname.replace(/\/+$/, '');
    if (!path.endsWith('/ai-summary') && path !== '/api/ai-summary') {
        return jsonBody({ error: 'Rota não encontrada' }, 404);
    }

    const auth = await requireAdminAuth({ headers: opts.headers || {} });
    if (!auth.ok) {
        return jsonBody({ error: auth.error || 'Não autenticado.' }, auth.status || 401);
    }

    if (!isSameSiteBrowserRequest(url, opts)) {
        return jsonBody({ error: 'Resumo disponível apenas a partir do painel do site.' }, 403);
    }

    if (!checkRateLimit(opts.clientIp)) {
        return jsonBody({ error: 'Muitas requisições. Tente novamente em instantes.' }, 429);
    }

    const parsed = await readJsonBody(opts);
    if (parsed.error) return parsed.error;

    const data = parsed.data || {};
    const slug = String(data.slug || '')
        .trim()
        .slice(0, MAX_SLUG_LEN);
    const title = String(data.title || '')
        .trim()
        .slice(0, MAX_TITLE_LEN);
    let content = stripToPlainText(data.content);
    if (content.length > MAX_CONTENT_LEN) {
        content = content.slice(0, MAX_CONTENT_LEN);
    }

    if (!title || !content) {
        return jsonBody({ error: 'Dados insuficientes para gerar o resumo.' }, 400);
    }

    const cacheSlug = slug || 'draft';
    const key = cacheKey(cacheSlug, content);
    const cached = cacheGet(key);
    if (cached) {
        return jsonBody({ summary: cached, cached: true });
    }

    try {
        const summary = await callGroq({ title, content });
        cacheSet(key, summary);
        return jsonBody({ summary, cached: false });
    } catch (err) {
        const code = String(err && err.message ? err.message : '');
        if (code === 'MISSING_KEY') {
            return jsonBody({ error: 'Mary AI temporariamente indisponível para o resumo.' }, 503);
        }
        return jsonBody({ error: 'Mary AI não conseguiu gerar o resumo agora.' }, 502);
    }
}
