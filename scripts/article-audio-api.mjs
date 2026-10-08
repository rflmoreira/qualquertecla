/**
 * Router HTTP: geração (admin) + entrega pública de áudio pré-gerado.
 * Chaves Gemini gerenciadas pelo key-manager (suporta 1–6 chaves com rotação).
 */
import { requireAdminAuth } from './admin-auth.mjs';
import {
    buildFullScript,
    buildSummaryScript,
    hashAudioIdentity,
    hashLegacyAudioIdentity,
    isLegacyHashCompatible,
    stripToPlainText
} from './article-audio/script-builder.mjs';
import {
    getAudioGenerationConfig,
    isGeminiTtsConfigured,
    synthesizeToWav
} from './article-audio/gemini-tts.mjs';
import {
    findReusableArticleAudio,
    getArticleAudioWav,
    publicAudioUrl,
    putArticleAudio,
    releaseAudioGenerationLease,
    safeSlug,
    tryAcquireAudioGenerationLease,
    waitForReusableArticleAudio
} from './article-audio/storage.mjs';

const MAX_BODY_BYTES = 200_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 12;
const MAX_SLUG_LEN = 200;

/** @type {Map<string, Promise<unknown>>} lock chain por slug (mesmo processo). */
const slugGenerateLocks = new Map();

/**
 * Serializa gerações do mesmo slug neste isolate (publish + gerar, cliques duplos).
 * Sem infraestrutura externa — adequado a Node local e um isolate Netlify.
 *
 * @template T
 * @param {string} slug
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withArticleAudioSlugLock(slug, fn) {
    const key = safeSlug(slug);
    const previous = slugGenerateLocks.get(key) || Promise.resolve();
    let release;
    const gate = new Promise((resolve) => {
        release = resolve;
    });
    const chained = previous.catch(() => {}).then(() => gate);
    slugGenerateLocks.set(key, chained);
    await previous.catch(() => {});
    try {
        return await fn();
    } finally {
        release();
        if (slugGenerateLocks.get(key) === chained) {
            slugGenerateLocks.delete(key);
        }
    }
}

/** Limpa locks (apenas testes). */
export function resetArticleAudioSlugLocksForTesting() {
    slugGenerateLocks.clear();
}

export const CORS_HEADERS = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type, Authorization'
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
    rateBuckets.set(key, bucket);
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

function binaryBody(buf, contentType, status = 200, extraHeaders = {}) {
    return {
        status,
        headers: {
            'Content-Type': contentType,
            ...CORS_HEADERS,
            ...extraHeaders
        },
        body: buf,
        isBinary: true
    };
}

async function readJsonBody(opts) {
    let text = '';
    if (typeof opts.body === 'string') {
        text = opts.body;
    } else if (opts.body && typeof opts.body === 'object') {
        return { data: opts.body };
    } else if (opts.rawRequest && typeof opts.rawRequest.text === 'function') {
        text = await opts.rawRequest.text();
    }
    if (text.length > MAX_BODY_BYTES) {
        return { error: jsonBody({ error: 'Payload muito grande.' }, 413) };
    }
    try {
        return { data: JSON.parse(text || '{}') };
    } catch (_) {
        return { error: jsonBody({ error: 'JSON inválido.' }, 400) };
    }
}

function normalizePath(pathname) {
    return String(pathname || '').replace(/\/+$/, '') || '/';
}

function parseKind(raw) {
    const k = String(raw || '').trim().toLowerCase();
    if (k === 'summary' || k === 'full') return k;
    return '';
}

async function handleGenerate(url, opts) {
    const auth = await requireAdminAuth({ headers: opts.headers || {} });
    if (!auth.ok) {
        return jsonBody({ error: auth.error || 'Não autenticado.' }, auth.status || 401);
    }
    if (!isSameSiteBrowserRequest(url, opts)) {
        return jsonBody({ error: 'Geração disponível apenas a partir do painel do site.' }, 403);
    }
    if (!checkRateLimit(opts.clientIp)) {
        return jsonBody({ error: 'Muitas requisições. Tente novamente em instantes.' }, 429);
    }
    if (!isGeminiTtsConfigured()) {
        return jsonBody({ error: 'Áudio da Mary AI temporariamente indisponível.' }, 503);
    }

    const parsed = await readJsonBody(opts);
    if (parsed.error) return parsed.error;

    const data = parsed.data || {};
    const slug = String(data.slug || '')
        .trim()
        .slice(0, MAX_SLUG_LEN);
    const kind = parseKind(data.kind);
    if (!slug || !kind) {
        return jsonBody({ error: 'slug e kind (summary|full) são obrigatórios.' }, 400);
    }

    const audioConfig = getAudioGenerationConfig();

    let script;
    if (kind === 'summary') {
        script = buildSummaryScript(data.text || data.summary || '', audioConfig);
    } else if (data.text) {
        const text = stripToPlainText(data.text);
        script = {
            text,
            hash: hashAudioIdentity('full', text, audioConfig),
            legacyHash: hashLegacyAudioIdentity('full', text)
        };
    } else {
        script = buildFullScript(
            {
                title: data.title,
                subtitle: data.subtitle,
                content: data.content
            },
            audioConfig
        );
    }

    if (!script.text || script.text.length < 8) {
        return jsonBody({ error: 'Texto insuficiente para gerar o áudio.' }, 400);
    }

    return withArticleAudioSlugLock(slug, async () => {
        const respondReuse = (reusable, reason) => {
            const audioUrl = publicAudioUrl(slug, kind, reusable.meta.hash);
            console.info(
                `[article-audio] reuse (${reason}) slug=${safeSlug(slug)} kind=${kind} hash=${String(reusable.meta.hash).slice(0, 12)}`
            );
            return jsonBody({
                ok: true,
                reused: true,
                kind,
                slug: reusable.meta.slug || safeSlug(slug),
                hash: reusable.meta.hash,
                url: audioUrl,
                generated_at: reusable.meta.generatedAt || null,
                bytes: reusable.meta.bytes || reusable.wav.length
            });
        };

        try {
            // 1) Identidade v2 (texto + voz + modelo + …)
            let reusable = await findReusableArticleAudio(slug, kind, script.hash);
            if (reusable) return respondReuse(reusable, 'identity');

            // 2) Legado só-texto — apenas se config atual = default que gerou o acervo
            if (
                script.legacyHash &&
                script.legacyHash !== script.hash &&
                isLegacyHashCompatible(audioConfig)
            ) {
                reusable = await findReusableArticleAudio(slug, kind, script.legacyHash);
                if (reusable) return respondReuse(reusable, 'legacy');
            }

            // 3) Lease cross-isolate (Blobs onlyIfNew / local wx)
            const lease = await tryAcquireAudioGenerationLease(slug, kind, script.hash);
            if (!lease.acquired) {
                const waited = await waitForReusableArticleAudio(slug, kind, script.hash);
                if (waited) return respondReuse(waited, 'lease-wait');
                if (
                    script.legacyHash &&
                    isLegacyHashCompatible(audioConfig)
                ) {
                    const legacyWait = await findReusableArticleAudio(
                        slug,
                        kind,
                        script.legacyHash
                    );
                    if (legacyWait) return respondReuse(legacyWait, 'lease-wait-legacy');
                }
                return jsonBody(
                    {
                        error:
                            'Geração de áudio já em andamento para esta matéria. Tente novamente em instantes.'
                    },
                    409
                );
            }

            try {
                // Outro isolate pode ter gravado entre o miss e o lease.
                reusable = await findReusableArticleAudio(slug, kind, script.hash);
                if (reusable) return respondReuse(reusable, 'identity-after-lease');

                const wav = await synthesizeToWav(script.text);
                const meta = await putArticleAudio(slug, kind, {
                    hash: script.hash,
                    wav,
                    generatedAt: new Date().toISOString()
                });
                const audioUrl = publicAudioUrl(slug, kind, meta.hash);
                return jsonBody({
                    ok: true,
                    reused: false,
                    kind,
                    slug: meta.slug,
                    hash: meta.hash,
                    url: audioUrl,
                    generated_at: meta.generatedAt,
                    bytes: meta.bytes
                });
            } finally {
                await releaseAudioGenerationLease(slug, kind, script.hash);
            }
        } catch (err) {
            const code = String(err && err.message ? err.message : '');
            if (code === 'MISSING_KEY') {
                return jsonBody({ error: 'Áudio da Mary AI temporariamente indisponível.' }, 503);
            }
            if (code === 'QUOTA') {
                return jsonBody({ error: 'Cota de áudio esgotada. Tente mais tarde.' }, 429);
            }
            if (code === 'ALL_COOLING') {
                return jsonBody(
                    {
                        error:
                            'Áudio temporariamente sobrecarregado (rate limit). Tente novamente em instantes.'
                    },
                    429
                );
            }
            if (code === 'EMPTY_TEXT' || code === 'EMPTY_AUDIO') {
                return jsonBody({ error: 'Não foi possível sintetizar este texto.' }, 502);
            }
            return jsonBody({ error: 'Mary AI não conseguiu gerar o áudio agora.' }, 502);
        }
    });
}

async function handleGetAudio(url) {
    const slug = String(url.searchParams.get('slug') || '')
        .trim()
        .slice(0, MAX_SLUG_LEN);
    const kind = parseKind(url.searchParams.get('kind'));
    const hash = String(url.searchParams.get('v') || url.searchParams.get('hash') || '').trim();

    if (!slug || !kind) {
        return jsonBody({ error: 'Parâmetros inválidos.' }, 400);
    }

    const found = await getArticleAudioWav(slug, kind, hash || undefined);
    if (!found) {
        return jsonBody({ error: 'Áudio não encontrado.' }, 404);
    }

    return binaryBody(found.wav, 'audio/wav', 200, {
        'Cache-Control': hash
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=300',
        'Content-Length': String(found.wav.length)
    });
}

/**
 * @param {URL} url
 * @param {string} method
 * @param {{ clientIp?: string, origin?: string, referer?: string, headers?: object, body?: string|object, rawRequest?: Request }} [opts]
 */
export async function handleArticleAudioApi(url, method, opts = {}) {
    if (method === 'OPTIONS') {
        return { status: 204, headers: CORS_HEADERS, body: null };
    }

    const path = normalizePath(url.pathname);

    if (method === 'POST' && (path.endsWith('/article-audio/generate') || path === '/api/article-audio/generate')) {
        return handleGenerate(url, opts);
    }

    if (method === 'GET' && (path.endsWith('/article-audio') || path === '/api/article-audio')) {
        return handleGetAudio(url);
    }

    if (method === 'POST' && (path.endsWith('/article-audio') || path === '/api/article-audio')) {
        return jsonBody({ error: 'Use POST /api/article-audio/generate' }, 404);
    }

    return jsonBody({ error: 'Rota não encontrada' }, 404);
}
