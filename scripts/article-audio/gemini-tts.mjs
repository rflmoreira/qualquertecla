/**
 * Cliente Gemini TTS (voz Leda) — PCM → WAV.
 * Modelo gemini-3.8-flash-tts: text = transcript verbatim; tom em speech_metadata.style;
 * PCM (L16 preferido) → WAV com crossfade entre chunks; guardrails anti-eco.
 * Chaves gerenciadas pelo key-manager (suporta 1–6 chaves com rotação automática).
 */
import { splitForTts } from './script-builder.mjs';
import { getKeyManager, FailReason } from './key-manager.mjs';

const GEMINI_MODEL = 'gemini-3.8-flash-tts';
const GEMINI_VOICE = 'Leda';
const DEFAULT_SAMPLE_RATE = 24000;
/** Teto de chunk alinhado ao fluxo TTS editorial. */
const CHUNK_CHARS = 1400;
/**
 * Tom editorial espontâneo (mesmo espírito do STYLE_DIRECTIVE Leda / df0409b).
 * Em Gemini 3.8 vai em speech_metadata.style — NÃO no text.
 */
const SPEECH_STYLE =
    'engaging, natural, lively, and articulate editorial tone';

const MAX_NETWORK_ATTEMPTS = 4;
const MAX_SOFT_429_ATTEMPTS = 3;
const MAX_UPSTREAM_ATTEMPTS = 3;
const MAX_WAIT_MS = 180_000;
/** Crossfade entre chunks (~10ms @ 24kHz) — evita clique/chiado na cola. */
const CROSSFADE_MS = 10;
/** Trim máximo de silêncio nas bordas antes do fade (não come fonemas). */
const EDGE_TRIM_MS = 40;
const EDGE_SILENCE_THRESHOLD = 180;
/** Caracteres falados por segundo (estimativa PT-BR) para detectar eco no chunk. */
const EXPECTED_CHARS_PER_SEC = 14;
/**
 * Eco real (~2× o texto) vs fala lenta: fator 2.2 reduz falso positivo
 * que gerava segunda síntese e consumo extra de créditos.
 */
const ECHO_DURATION_FACTOR = 2.2;
/** Só avalia eco em chunks com texto suficiente. */
const ECHO_MIN_CHARS = 200;
/** Overlap mínimo de sufixo/prefixo entre chunks consecutivos para cortar. */
const CHUNK_OVERLAP_MIN = 40;

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
    const even = ensureEvenPcm(pcm);
    const numChannels = 1;
    const bitsPerSample = 16;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const byteRate = sampleRate * blockAlign;
    const dataSize = even.length;
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
    even.copy(buffer, 44);
    return buffer;
}

function parseSampleRate(mimeType) {
    const m = /rate=(\d+)/i.exec(String(mimeType || ''));
    const rate = m ? Number(m[1]) : DEFAULT_SAMPLE_RATE;
    return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_SAMPLE_RATE;
}

/** Garante comprimento par (samples int16). */
export function ensureEvenPcm(buf) {
    const pcm = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
    if (pcm.length % 2 === 1) {
        return pcm.subarray(0, pcm.length - 1);
    }
    return pcm;
}

/**
 * Extrai PCM 16-bit LE + sample rate de WAV (chunk data) ou L16 cru.
 * @param {Buffer} buf
 * @param {string} [mimeType]
 * @returns {{ pcm: Buffer, sampleRate: number }}
 */
export function extractPcmFromAudio(buf, mimeType = '') {
    const mime = String(mimeType || '').toLowerCase();
    let raw = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
    if (!raw.length) {
        return { pcm: Buffer.alloc(0), sampleRate: DEFAULT_SAMPLE_RATE };
    }

    if (mime.includes('l16') || mime.includes('pcm')) {
        return {
            pcm: ensureEvenPcm(raw),
            sampleRate: parseSampleRate(mimeType) || DEFAULT_SAMPLE_RATE
        };
    }

    if (raw.length >= 12 && raw.toString('utf8', 0, 4) === 'RIFF') {
        return parseWavPcm(raw);
    }

    return {
        pcm: ensureEvenPcm(raw),
        sampleRate: parseSampleRate(mimeType) || DEFAULT_SAMPLE_RATE
    };
}

/**
 * @param {Buffer} wav
 * @returns {{ pcm: Buffer, sampleRate: number }}
 */
function parseWavPcm(wav) {
    let sampleRate = DEFAULT_SAMPLE_RATE;
    let dataPcm = null;
    let offset = 12;
    while (offset + 8 <= wav.length) {
        const id = wav.toString('utf8', offset, offset + 4);
        const size = wav.readUInt32LE(offset + 4);
        const dataStart = offset + 8;
        const dataEnd = Math.min(wav.length, dataStart + size);
        if (id === 'fmt ' && size >= 16 && dataEnd - dataStart >= 16) {
            const rate = wav.readUInt32LE(dataStart + 4);
            if (rate > 0) sampleRate = rate;
        } else if (id === 'data') {
            dataPcm = wav.subarray(dataStart, dataEnd);
            break;
        }
        offset = dataStart + size + (size % 2);
    }
    if (!dataPcm || !dataPcm.length) {
        // Fallback legado (header PCM simples de 44 bytes).
        dataPcm = wav.length > 44 ? wav.subarray(44) : Buffer.alloc(0);
    }
    return { pcm: ensureEvenPcm(dataPcm), sampleRate };
}

/**
 * Remove silêncio extremo só nas bordas (até maxMs), sem comer fala.
 * @param {Buffer} pcm
 * @param {number} sampleRate
 * @param {'leading'|'trailing'|'both'} [edge]
 */
export function trimEdgeSilence(pcm, sampleRate, edge = 'both') {
    const even = ensureEvenPcm(pcm);
    const maxSamples = Math.max(
        0,
        Math.floor((sampleRate * EDGE_TRIM_MS) / 1000)
    );
    if (!even.length || maxSamples === 0) return even;

    const total = even.length / 2;
    let start = 0;
    let end = total;

    if (edge === 'leading' || edge === 'both') {
        const limit = Math.min(maxSamples, total);
        while (start < limit) {
            if (Math.abs(even.readInt16LE(start * 2)) > EDGE_SILENCE_THRESHOLD) break;
            start += 1;
        }
    }
    if (edge === 'trailing' || edge === 'both') {
        const limit = Math.max(start, total - maxSamples);
        while (end > limit) {
            if (Math.abs(even.readInt16LE((end - 1) * 2)) > EDGE_SILENCE_THRESHOLD) break;
            end -= 1;
        }
    }
    if (start >= end) return even;
    return even.subarray(start * 2, end * 2);
}

/**
 * Crossfade linear int16 LE entre dois buffers PCM.
 * @param {Buffer} left
 * @param {Buffer} right
 * @param {number} fadeSamples
 */
function crossfadePair(left, right, fadeSamples) {
    const a = ensureEvenPcm(left);
    const b = ensureEvenPcm(right);
    const aSamples = a.length / 2;
    const bSamples = b.length / 2;
    const fade = Math.min(fadeSamples, aSamples, bSamples);
    if (fade <= 0) return Buffer.concat([a, b]);

    const out = Buffer.alloc(a.length + b.length - fade * 2);
    a.copy(out, 0, 0, a.length - fade * 2);
    const mixAt = a.length - fade * 2;
    for (let i = 0; i < fade; i += 1) {
        const t = (i + 1) / (fade + 1);
        const sa = a.readInt16LE(a.length - fade * 2 + i * 2);
        const sb = b.readInt16LE(i * 2);
        const mixed = Math.round(sa * (1 - t) + sb * t);
        out.writeInt16LE(Math.max(-32768, Math.min(32767, mixed)), mixAt + i * 2);
    }
    b.copy(out, mixAt + fade * 2, fade * 2);
    return out;
}

/**
 * Concatena chunks PCM com crossfade curto (elimina clique/chiado na junção).
 * @param {Buffer[]} parts
 * @param {number} sampleRate
 */
export function crossfadeConcatPcm(parts, sampleRate = DEFAULT_SAMPLE_RATE) {
    const list = (parts || []).filter((p) => p && p.length);
    if (!list.length) return Buffer.alloc(0);

    const fadeSamples = Math.max(
        1,
        Math.floor((sampleRate * CROSSFADE_MS) / 1000)
    );

    let out = trimEdgeSilence(list[0], sampleRate, 'both');
    for (let i = 1; i < list.length; i += 1) {
        const left = trimEdgeSilence(out, sampleRate, 'trailing');
        const right = trimEdgeSilence(list[i], sampleRate, 'leading');
        out = crossfadePair(left, right, fadeSamples);
    }
    return ensureEvenPcm(out);
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
            // Espera o cooldown real (ex.: RATE_LIMIT ~90s), limitado a MAX_WAIT_MS.
            // Não usar teto de 60s — isso transformava soft-429 em falha prematura.
            const wait = Math.min(Number(err.retryAfterMs) || 0, MAX_WAIT_MS);
            if (wait > 0) {
                console.info(
                    `[tts] pool em cooldown transitório — aguardando ${Math.ceil(wait / 1000)}s`
                );
                await sleep(wait);
                try {
                    return km.getNextKey({
                        excludeIndex:
                            opts.excludeIndex != null
                                ? Number(opts.excludeIndex)
                                : undefined
                    });
                } catch (err2) {
                    // Mantém ALL_COOLING (não promove a QUOTA).
                    throw err2;
                }
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

    // acquireKey preserva ALL_COOLING ≠ QUOTA (rate-limit transitório vs cota).
    const { key, index: keyIndex } = await acquireKey({ stickyIndex });

    const transcript = String(text || '').trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
    let res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'aistudio-build'
            },
            body: JSON.stringify({
                contents: [
                    {
                        role: 'user',
                        parts: [
                            {
                                text: transcript,
                                speech_metadata: {
                                    style: SPEECH_STYLE
                                }
                            }
                        ]
                    }
                ],
                generationConfig: {
                    responseModalities: ['AUDIO'],
                    responseFormat: {
                        audio: {
                            mimeType: 'AUDIO_L16',
                            sampleRate: DEFAULT_SAMPLE_RATE
                        }
                    },
                    speechConfig: {
                        voiceConfig: {
                            voice: GEMINI_VOICE
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

    const raw = Buffer.from(String(inline.data), 'base64');
    if (!raw.length) {
        throw new Error('EMPTY_AUDIO');
    }

    const extracted = extractPcmFromAudio(raw, inline.mimeType);
    if (!extracted.pcm.length) {
        throw new Error('EMPTY_AUDIO');
    }

    km.markSuccess(keyIndex);

    return {
        pcm: extracted.pcm,
        sampleRate: extracted.sampleRate || parseSampleRate(inline.mimeType)
    };
}

/**
 * Remove chunks idênticos consecutivos e corta prefixo sobreposto com o anterior.
 * @param {string[]} rawChunks
 * @returns {string[]}
 */
export function dedupeTtsChunks(rawChunks) {
    const out = [];
    for (const raw of rawChunks || []) {
        let chunk = String(raw || '').trim();
        if (!chunk) continue;
        if (out.length) {
            const prev = out[out.length - 1];
            if (chunk === prev) continue;
            const max = Math.min(prev.length, chunk.length);
            let overlap = 0;
            for (let n = max; n >= CHUNK_OVERLAP_MIN; n -= 1) {
                if (prev.slice(-n) === chunk.slice(0, n)) {
                    overlap = n;
                    break;
                }
            }
            if (overlap > 0) {
                chunk = chunk.slice(overlap).trim();
                if (!chunk) continue;
            }
        }
        out.push(chunk);
    }
    return out;
}

function pcmDurationSec(pcm, sampleRate) {
    const even = ensureEvenPcm(pcm);
    const rate = sampleRate > 0 ? sampleRate : DEFAULT_SAMPLE_RATE;
    return even.length / 2 / rate;
}

function expectedDurationSec(text) {
    const chars = String(text || '').trim().length;
    return chars / EXPECTED_CHARS_PER_SEC;
}

/**
 * Sintetiza um chunk; se o PCM parecer eco (duração >> texto), re-sintetiza 1×
 * e fica com o mais curto.
 * @param {string} chunkText
 * @param {number} index1Based
 */
async function synthesizeChunkWithoutEcho(chunkText, index1Based) {
    let result = await synthesizeChunk(chunkText);
    const expected = expectedDurationSec(chunkText);
    const actual = pcmDurationSec(result.pcm, result.sampleRate);
    if (
        String(chunkText).trim().length >= ECHO_MIN_CHARS &&
        expected > 0 &&
        actual > expected * ECHO_DURATION_FACTOR
    ) {
        console.info(
            `[tts] chunk ${index1Based} suspeito de eco — regenerando ` +
                `(${actual.toFixed(1)}s vs ~${expected.toFixed(1)}s esperado)`
        );
        const retry = await synthesizeChunk(chunkText);
        const retryDur = pcmDurationSec(retry.pcm, retry.sampleRate);
        if (retryDur <= actual) {
            result = retry;
        }
    }
    return result;
}

/**
 * Sintetiza texto completo (com chunking) e devolve Buffer WAV.
 * Junções usam crossfade curto; chunks deduplicados; eco anomalamente longo é refeito.
 * @param {string} text
 * @returns {Promise<Buffer>}
 */
export async function synthesizeToWav(text) {
    const cleaned = String(text || '').trim();
    if (!cleaned) {
        throw new Error('EMPTY_TEXT');
    }

    const chunks = dedupeTtsChunks(splitForTts(cleaned, CHUNK_CHARS));
    if (!chunks.length) {
        throw new Error('EMPTY_TEXT');
    }

    for (let i = 0; i < chunks.length; i += 1) {
        const preview = chunks[i].slice(0, 80).replace(/\s+/g, ' ');
        console.info(`[tts] chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars): ${preview}`);
    }

    const pcmParts = [];
    let sampleRate = DEFAULT_SAMPLE_RATE;

    for (let i = 0; i < chunks.length; i += 1) {
        const result = await synthesizeChunkWithoutEcho(chunks[i], i + 1);
        const rate = result.sampleRate || DEFAULT_SAMPLE_RATE;
        if (i === 0) {
            sampleRate = rate;
        } else if (rate !== sampleRate) {
            throw new Error(
                `SAMPLE_RATE_MISMATCH: chunk ${i + 1} tem ${rate} Hz, esperado ${sampleRate} Hz`
            );
        }
        pcmParts.push(result.pcm);
        if (i < chunks.length - 1) {
            await sleep(500);
        }
    }

    const pcm = crossfadeConcatPcm(pcmParts, sampleRate);
    return pcmToWav(pcm, sampleRate);
}

/**
 * Configuração que determina materialmente o áudio gerado (entra no hash de identidade).
 * @returns {{ voice: string, model: string, style: string, sampleRate: number }}
 */
export function getAudioGenerationConfig() {
    return {
        voice: GEMINI_VOICE,
        model: GEMINI_MODEL,
        style: SPEECH_STYLE,
        sampleRate: DEFAULT_SAMPLE_RATE
    };
}

export { GEMINI_MODEL, GEMINI_VOICE, SPEECH_STYLE, sanitizeDetail, synthesizeChunk };
