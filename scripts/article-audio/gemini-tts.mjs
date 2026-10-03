/**
 * Cliente Gemini TTS (voz Leda) — PCM → WAV.
 * Alinhado ao projeto ~/Leda: modelo gemini-3.1-flash-tts-preview + tom editorial.
 * Chaves gerenciadas pelo key-manager (suporta 1–6 chaves com rotação automática).
 */
import { splitForTts } from './script-builder.mjs';
import { getKeyManager, FailReason } from './key-manager.mjs';

const GEMINI_MODEL = 'gemini-3.1-flash-tts-preview';
const GEMINI_VOICE = 'Leda';
const DEFAULT_SAMPLE_RATE = 24000;
/** Mesmo teto de chunk do projeto Leda (~/Leda/server.ts). */
const CHUNK_CHARS = 1400;
const STYLE_DIRECTIVE =
    'Say in an engaging, natural, lively, and articulate editorial tone:';

const MAX_NETWORK_ATTEMPTS = 4;
const MAX_SOFT_429_ATTEMPTS = 3;
const MAX_UPSTREAM_ATTEMPTS = 3;
const MAX_WAIT_MS = 180_000;

export function isGeminiTtsConfigured() {
    return getKeyManager().isConfigured();
}

/**
 * Empacota PCM 16-bit LE mono em WAV.
 * @param {Buffer} pcm
 * @param {number} [sampleRate]
 */
export function pcmToWav(pcm, sampleRate = DEFAULT_SAMPLE_RATE) {
    if (pcm.length >= 12 && pcm.toString('utf8', 0, 4) === 'RIFF') {
        return pcm;
    }
    const numChannels = 1;
    const bitsPerSample = 16;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcm.length;
    const buffer = Buffer.alloc(44 + dataSize);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(bitsPerSample, 34);
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
    pcm.copy(buffer, 44);
    return buffer;
}

function parseSampleRate(mimeType) {
    const m = /rate=(\d+)/i.exec(String(mimeType || ''));
    const rate = m ? Number(m[1]) : DEFAULT_SAMPLE_RATE;
    return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_SAMPLE_RATE;
}

function scaledWaitMs(ms) {
    const n = Math.max(0, Number(ms) || 0);
    // Apenas testes determinísticos (QT_TTS_TEST_FAST=1) — nunca em produção.
    if (process.env.QT_TTS_TEST_FAST === '1') {
        return Math.min(n, 15);
    }
    return n;
}

async function sleep(ms) {
    await new Promise((r) => setTimeout(r, scaledWaitMs(ms)));
}

/**
 * Sanitiza trechos de resposta de erro para remover dados sensíveis.
 * Remove URLs que possam conter chaves, tokens ou parâmetros internos.
 * @param {string} raw
 * @returns {string}
 */
function sanitizeDetail(raw) {
    return String(raw || '')
        .replace(/key=[^&\s"'}\]]+/gi, 'key=***')
        .replace(/https?:\/\/[^\s"'}\]]+/gi, '[url-removida]')
        .replace(/[A-Za-z0-9_-]{30,}/g, '***')
        .slice(0, 200)
        .replace(/\s+/g, ' ')
        .trim();
}

async function classify429(res) {
    let body = '';
    try {
        body = await res.text();
    } catch (_) {
        body = '';
    }
    const retryAfter = Number(res.headers.get('retry-after') || 0);
    const exceeded = /exceeded your current quota|quota metric|RESOURCE_EXHAUSTED/i.test(body);
    return {
        hard: exceeded,
        retryAfterSec: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 0,
        snippet: sanitizeDetail(body)
    };
}

/**
 * Obtém chave: sticky (retry mesma) ou próxima do pool (rotação).
 * @param {{ stickyIndex?: number|null, excludeIndex?: number|null }} opts
 */
async function acquireKey(opts = {}) {
    const km = getKeyManager();
    const stickyIndex = opts.stickyIndex != null ? Number(opts.stickyIndex) : null;

    if (stickyIndex != null) {
        const info = km.inspectKey(stickyIndex);
        if (!info) {
            throw new Error('MISSING_KEY');
        }
        if (info.reason === FailReason.INVALID || info.cooldownRemainingMs === Infinity) {
            // Chave inválida: força rotação
            return km.getNextKey({ excludeIndex: stickyIndex });
        }
        if (!info.active && info.cooldownRemainingMs > 0) {
            const wait = Math.min(info.cooldownRemainingMs, MAX_WAIT_MS);
            console.info(
                `[tts] aguardando ${Math.ceil(wait / 1000)}s para reutilizar key-${stickyIndex}`
            );
            await sleep(wait);
            const after = km.inspectKey(stickyIndex);
            if (after && after.active) {
                return { key: after.key, index: after.index };
            }
            // Ainda indisponível — tenta outra ou falha
            if (km.hasOtherAvailableKey(stickyIndex)) {
                return km.getNextKey({ excludeIndex: stickyIndex });
            }
            const err = new Error('ALL_COOLING');
            err.retryAfterMs = km.soonestCooldownMs();
            throw err;
        }
        return { key: info.key, index: info.index };
    }

    try {
        return km.getNextKey({
            excludeIndex: opts.excludeIndex != null ? Number(opts.excludeIndex) : undefined
        });
    } catch (err) {
        if (err && err.message === 'ALL_COOLING') {
            const wait = Math.min(Number(err.retryAfterMs) || 0, MAX_WAIT_MS);
            if (wait > 0 && wait <= 60_000) {
                console.info(
                    `[tts] pool em cooldown — aguardando ${Math.ceil(wait / 1000)}s`
                );
                await sleep(wait);
                return km.getNextKey({
                    excludeIndex:
                        opts.excludeIndex != null ? Number(opts.excludeIndex) : undefined
                });
            }
        }
        throw err;
    }
}

/**
 * Sintetiza um chunk de texto com rotação automática de chaves.
 *
 * Fluxo:
 *   - Rede/timeout: retry na MESMA chave (sem cooldown prematuro)
 *   - HTTP 500+: retry na MESMA chave (sem cooldown prematuro)
 *   - HTTP 429 hard (QUOTA): cooldown longo + próxima chave
 *   - HTTP 429 soft: se há outra chave → cooldown curto + rotaciona;
 *     se só uma chave → espera e reutiliza a mesma (não declara QUOTA cedo)
 *   - HTTP 401/403: invalida chave + próxima
 *
 * @param {string} text
 * @param {{ attempt?: number, keyRotations?: number, stickyIndex?: number|null, soft429Attempt?: number, networkAttempt?: number, upstreamAttempt?: number }} [state]
 */
async function synthesizeChunk(text, state = {}) {
    const attempt = state.attempt || 1;
    const keyRotations = state.keyRotations || 0;
    const soft429Attempt = state.soft429Attempt || 0;
    const networkAttempt = state.networkAttempt || 0;
    const upstreamAttempt = state.upstreamAttempt || 0;
    const stickyIndex = state.stickyIndex != null ? state.stickyIndex : null;

    const km = getKeyManager();
    if (keyRotations > km.size) {
        throw new Error('QUOTA');
    }

    let key;
    let keyIndex;
    try {
        ({ key, index: keyIndex } = await acquireKey({ stickyIndex }));
    } catch (err) {
        const code = String(err && err.message ? err.message : '');
        if (code === 'ALL_COOLING' || code === 'QUOTA') {
            throw new Error('QUOTA');
        }
        throw err;
    }

    const prompt = `${STYLE_DIRECTIVE} ${String(text || '').trim()}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
    let res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Mesmo User-Agent do projeto Leda (AI Studio build).
                'User-Agent': 'aistudio-build'
            },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    responseModalities: ['AUDIO'],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: {
                                voiceName: GEMINI_VOICE
                            }
                        }
                    }
                }
            }),
            signal: AbortSignal.timeout(180_000)
        });
    } catch (err) {
        const msg = String(err && err.message ? err.message : err);
        const isTransient = /aborted|timeout|fetch failed|ECONNRESET|ETIMEDOUT/i.test(msg);
        if (isTransient && networkAttempt + 1 < MAX_NETWORK_ATTEMPTS) {
            const wait = Math.min(60_000, 5_000 * 2 ** networkAttempt);
            console.info(
                `[tts] key-${keyIndex} timeout/rede — retry mesma chave ${networkAttempt + 2}/${MAX_NETWORK_ATTEMPTS} em ${wait / 1000}s`
            );
            await sleep(wait);
            return synthesizeChunk(text, {
                attempt: attempt + 1,
                keyRotations,
                stickyIndex: keyIndex,
                soft429Attempt,
                networkAttempt: networkAttempt + 1,
                upstreamAttempt
            });
        }
        // Esgotou retries de rede: cooldown curto e tenta outra chave se houver
        km.markFailed(keyIndex, FailReason.NETWORK);
        if (km.hasOtherAvailableKey(keyIndex) && keyRotations < km.size) {
            console.info(`[tts] tentando próxima chave após rede em key-${keyIndex}`);
            return synthesizeChunk(text, {
                attempt: 1,
                keyRotations: keyRotations + 1,
                stickyIndex: null,
                soft429Attempt: 0,
                networkAttempt: 0,
                upstreamAttempt: 0
            });
        }
        throw err;
    }

    // ── HTTP 429 — quota ou rate limit ──────────────────────────────────

    if (res.status === 429) {
        const info = await classify429(res);

        if (info.hard) {
            km.markFailed(keyIndex, FailReason.QUOTA);
            console.warn(`[tts] key-${keyIndex} cota esgotada (QUOTA)`);

            if (km.hasOtherAvailableKey(keyIndex) && keyRotations < km.size) {
                console.info(`[tts] tentando próxima chave após QUOTA de key-${keyIndex}`);
                return synthesizeChunk(text, {
                    attempt: 1,
                    keyRotations: keyRotations + 1,
                    stickyIndex: null,
                    soft429Attempt: 0,
                    networkAttempt: 0,
                    upstreamAttempt: 0
                });
            }

            const err = new Error('QUOTA');
            err.detail = info.snippet;
            throw err;
        }

        // Rate limit temporário
        console.warn(`[tts] key-${keyIndex} rate-limit temporário`);

        if (km.hasOtherAvailableKey(keyIndex) && keyRotations < km.size) {
            km.markFailed(keyIndex, FailReason.RATE_LIMIT);
            console.info(`[tts] tentando próxima chave após rate-limit de key-${keyIndex}`);
            return synthesizeChunk(text, {
                attempt: 1,
                keyRotations: keyRotations + 1,
                stickyIndex: null,
                soft429Attempt: 0,
                networkAttempt: 0,
                upstreamAttempt: 0
            });
        }

        // Uma única chave (ou todas as outras indisponíveis): espera e reutiliza
        if (soft429Attempt + 1 >= MAX_SOFT_429_ATTEMPTS) {
            km.markFailed(keyIndex, FailReason.RATE_LIMIT);
            const err = new Error('QUOTA');
            err.detail = info.snippet || 'rate limit persistente';
            throw err;
        }

        const wait = Math.max(
            (info.retryAfterSec || 0) * 1000,
            Math.min(MAX_WAIT_MS, 30_000 * (soft429Attempt + 1))
        );
        const effectiveWait = scaledWaitMs(wait);
        // Cooldown alinhado ao wait efetivo (inclui modo de teste rápido).
        km.markFailed(keyIndex, FailReason.RATE_LIMIT, { cooldownMs: effectiveWait });
        console.info(
            `[tts] sem chaves alternativas — aguardando ${Math.round(effectiveWait / 1000)}s e reutilizando key-${keyIndex}`
        );
        await sleep(wait);
        return synthesizeChunk(text, {
            attempt: attempt + 1,
            keyRotations,
            stickyIndex: keyIndex,
            soft429Attempt: soft429Attempt + 1,
            networkAttempt,
            upstreamAttempt
        });
    }

    // ── HTTP 401/403 — chave inválida ou revogada ───────────────────────

    if (res.status === 401 || res.status === 403) {
        km.markFailed(keyIndex, FailReason.INVALID);
        console.warn(
            `[tts] key-${keyIndex} inválida (HTTP ${res.status}) — desativada permanentemente`
        );

        if (km.hasOtherAvailableKey(keyIndex) && keyRotations < km.size) {
            console.info(`[tts] tentando próxima chave após invalidação de key-${keyIndex}`);
            return synthesizeChunk(text, {
                attempt: 1,
                keyRotations: keyRotations + 1,
                stickyIndex: null,
                soft429Attempt: 0,
                networkAttempt: 0,
                upstreamAttempt: 0
            });
        }

        const err = new Error('MISSING_KEY');
        err.detail = `Todas as chaves falharam (última: HTTP ${res.status})`;
        throw err;
    }

    // ── HTTP 500+ — erro do servidor (retry na mesma chave) ─────────────

    if (!res.ok) {
        if (res.status >= 500 && upstreamAttempt + 1 < MAX_UPSTREAM_ATTEMPTS) {
            const wait = 8_000 * (upstreamAttempt + 1);
            console.info(
                `[tts] key-${keyIndex} upstream HTTP ${res.status} — retry mesma chave ${upstreamAttempt + 2}/${MAX_UPSTREAM_ATTEMPTS}`
            );
            await sleep(wait);
            return synthesizeChunk(text, {
                attempt: attempt + 1,
                keyRotations,
                stickyIndex: keyIndex,
                soft429Attempt,
                networkAttempt,
                upstreamAttempt: upstreamAttempt + 1
            });
        }

        let detail = '';
        try {
            detail = sanitizeDetail(await res.text());
        } catch (_) {
            /* ignore */
        }
        km.markFailed(keyIndex, FailReason.UPSTREAM);
        if (km.hasOtherAvailableKey(keyIndex) && keyRotations < km.size) {
            console.info(`[tts] tentando próxima chave após upstream em key-${keyIndex}`);
            return synthesizeChunk(text, {
                attempt: 1,
                keyRotations: keyRotations + 1,
                stickyIndex: null,
                soft429Attempt: 0,
                networkAttempt: 0,
                upstreamAttempt: 0
            });
        }
        const err = new Error('UPSTREAM');
        err.detail = detail || `HTTP ${res.status}`;
        throw err;
    }

    // ── Sucesso ─────────────────────────────────────────────────────────

    let data;
    try {
        data = await res.json();
    } catch (_) {
        throw new Error('UPSTREAM');
    }

    const part =
        data?.candidates?.[0]?.content?.parts?.find((p) => p?.inlineData?.data) ||
        data?.candidates?.[0]?.content?.parts?.[0];
    const inline = part?.inlineData;
    if (!inline?.data) {
        throw new Error('EMPTY_AUDIO');
    }

    let pcm = Buffer.from(String(inline.data), 'base64');
    if (!pcm.length) {
        throw new Error('EMPTY_AUDIO');
    }
    // Se vier WAV, remove header RIFF (igual ao Leda).
    if (pcm.length >= 44 && pcm.toString('utf8', 0, 4) === 'RIFF') {
        pcm = pcm.subarray(44);
    }

    km.markSuccess(keyIndex);

    return {
        pcm,
        sampleRate: parseSampleRate(inline.mimeType)
    };
}

/**
 * Sintetiza texto completo (com chunking) e devolve Buffer WAV.
 * @param {string} text
 * @returns {Promise<Buffer>}
 */
export async function synthesizeToWav(text) {
    const cleaned = String(text || '').trim();
    if (!cleaned) {
        throw new Error('EMPTY_TEXT');
    }

    const chunks = splitForTts(cleaned, CHUNK_CHARS);
    if (!chunks.length) {
        throw new Error('EMPTY_TEXT');
    }

    const pcmParts = [];
    let sampleRate = DEFAULT_SAMPLE_RATE;

    for (let i = 0; i < chunks.length; i += 1) {
        const result = await synthesizeChunk(chunks[i]);
        pcmParts.push(result.pcm);
        sampleRate = result.sampleRate || sampleRate;
        if (i < chunks.length - 1) {
            await sleep(500);
        }
    }

    const pcm = Buffer.concat(pcmParts);
    return pcmToWav(pcm, sampleRate);
}

export { GEMINI_MODEL, GEMINI_VOICE, sanitizeDetail, synthesizeChunk };
