/**
 * Testes determinísticos do pool Gemini / TTS / idempotência.
 * Usa apenas chaves fictícias — nunca segredos reais.
 *
 * Uso: node scripts/test/article-audio-keys.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
    GeminiKeyManager,
    FailReason,
    setKeyManagerForTesting,
    getKeyManager
} from '../article-audio/key-manager.mjs';
import {
    pcmToWav,
    sanitizeDetail,
    synthesizeChunk,
    synthesizeToWav,
    getAudioGenerationConfig
} from '../article-audio/gemini-tts.mjs';
import {
    hashAudioIdentity,
    hashLegacyAudioIdentity,
    isLegacyHashCompatible,
    buildSummaryScript
} from '../article-audio/script-builder.mjs';
import {
    findReusableArticleAudio,
    putArticleAudio,
    isIntactWavBuffer,
    tryAcquireAudioGenerationLease,
    releaseAudioGenerationLease,
    LOCAL_DIR
} from '../article-audio/storage.mjs';
import {
    withArticleAudioSlugLock,
    resetArticleAudioSlugLocksForTesting
} from '../article-audio-api.mjs';

process.env.QT_TTS_TEST_FAST = '1';

const FAKE_KEYS = [
    'fake-gemini-key-0001-aaaaaaaaaaaaaaaa',
    'fake-gemini-key-0002-bbbbbbbbbbbbbbbb',
    'fake-gemini-key-0003-cccccccccccccccc',
    'fake-gemini-key-0004-dddddddddddddddd',
    'fake-gemini-key-0005-eeeeeeeeeeeeeeee',
    'fake-gemini-key-0006-ffffffffffffffff'
];

let passed = 0;
let failed = 0;

async function test(name, fn) {
    try {
        await fn();
        passed += 1;
        console.log(`✓  ${name}`);
    } catch (err) {
        failed += 1;
        console.error(`✗  ${name}`);
        console.error(`   ${err && err.stack ? err.stack : err}`);
    } finally {
        setKeyManagerForTesting(null);
        resetArticleAudioSlugLocksForTesting();
    }
}

function makePcm(bytes = 100) {
    return Buffer.alloc(bytes, 1);
}

function successResponse() {
    const pcm = makePcm(80);
    return {
        ok: true,
        status: 200,
        json: async () => ({
            candidates: [
                {
                    content: {
                        parts: [
                            {
                                inlineData: {
                                    mimeType: 'audio/L16;rate=24000',
                                    data: pcm.toString('base64')
                                }
                            }
                        ]
                    }
                }
            ]
        }),
        text: async () => '',
        headers: new Headers()
    };
}

function httpResponse(status, body = '', headers = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => ({}),
        text: async () => body,
        headers: new Headers(headers)
    };
}

async function withMockFetch(handler, fn) {
    const prev = globalThis.fetch;
    globalThis.fetch = handler;
    try {
        return await fn();
    } finally {
        globalThis.fetch = prev;
    }
}

async function main() {
    await test('1 chave configurada e funcional', () => {
        const km = new GeminiKeyManager([FAKE_KEYS[0]]);
        assert.equal(km.size, 1);
        assert.equal(km.isConfigured(), true);
        const a = km.getNextKey();
        assert.equal(a.index, 1);
        assert.equal(a.key, FAKE_KEYS[0]);
        km.markSuccess(1);
        assert.equal(km.getStats().active, 1);
        assert.ok(!JSON.stringify(km.getStats()).includes(FAKE_KEYS[0]));
    });

    await test('6 chaves configuradas', () => {
        const km = new GeminiKeyManager(FAKE_KEYS);
        assert.equal(km.size, 6);
        assert.equal(km.getStats().active, 6);
    });

    await test('rotação round-robin key-1 → key-2 → key-3', () => {
        const km = new GeminiKeyManager(FAKE_KEYS.slice(0, 3));
        assert.equal(km.getNextKey().index, 1);
        assert.equal(km.getNextKey().index, 2);
        assert.equal(km.getNextKey().index, 3);
        assert.equal(km.getNextKey().index, 1);
    });

    await test('cooldown e recuperação após cooldown', async () => {
        const km = new GeminiKeyManager([FAKE_KEYS[0], FAKE_KEYS[1]]);
        km.markFailed(1, FailReason.RATE_LIMIT, { cooldownMs: 40 });
        assert.equal(km.getStats().active, 1);
        assert.equal(km.getNextKey().index, 2);
        await new Promise((r) => setTimeout(r, 50));
        assert.equal(km.hasAvailableKey(), true);
        assert.equal(km.getStats().active, 2);
    });

    await test('chave inválida não derruba o pool', () => {
        const km = new GeminiKeyManager(FAKE_KEYS.slice(0, 3));
        km.markFailed(1, FailReason.INVALID);
        assert.equal(km.getStats().invalid, 1);
        assert.equal(km.getStats().active, 2);
        assert.notEqual(km.getNextKey().index, 1);
    });

    await test('todas as chaves em QUOTA → erro QUOTA', () => {
        const km = new GeminiKeyManager([FAKE_KEYS[0]]);
        km.markFailed(1, FailReason.QUOTA);
        assert.throws(() => km.getNextKey(), (err) => err && err.message === 'QUOTA');
    });

    await test('cooldown temporário → ALL_COOLING com retryAfterMs', () => {
        const km = new GeminiKeyManager([FAKE_KEYS[0]]);
        km.markFailed(1, FailReason.RATE_LIMIT, { cooldownMs: 60_000 });
        try {
            km.getNextKey();
            assert.fail('deveria lançar');
        } catch (err) {
            assert.equal(err.message, 'ALL_COOLING');
            assert.ok(err.retryAfterMs > 0);
        }
    });

    await test('sanitizeDetail nunca vaza key= da URL', () => {
        const withUrl =
            'error at https://generativelanguage.googleapis.com/v1?key=REALSECRETVALUE123456789012345&x=1';
        const outUrl = sanitizeDetail(withUrl);
        assert.ok(!outUrl.includes('REALSECRET'));
        assert.ok(!outUrl.includes('generativelanguage'));
        const outParam = sanitizeDetail('upstream key=REALSECRETVALUE123456789012345 failed');
        assert.ok(!outParam.includes('REALSECRET'));
        assert.match(outParam, /key=\*\*\*/);
    });

    await test('readKeysFromEnv: _1…_6 prioriza; CSV; legado só se vazio', () => {
        const snapshot = {
            GEMINI_API_KEY: process.env.GEMINI_API_KEY,
            GEMINI_API_KEYS: process.env.GEMINI_API_KEYS
        };
        for (let i = 1; i <= 6; i++) {
            snapshot[`GEMINI_API_KEY_${i}`] = process.env[`GEMINI_API_KEY_${i}`];
        }
        try {
            delete process.env.GEMINI_API_KEY;
            delete process.env.GEMINI_API_KEYS;
            for (let i = 1; i <= 6; i++) delete process.env[`GEMINI_API_KEY_${i}`];

            process.env.GEMINI_API_KEY_1 = FAKE_KEYS[0];
            process.env.GEMINI_API_KEY_2 = FAKE_KEYS[1];
            process.env.GEMINI_API_KEY = 'legacy-should-be-ignored';
            assert.deepEqual(GeminiKeyManager.readKeysFromEnv(), [
                FAKE_KEYS[0],
                FAKE_KEYS[1]
            ]);

            delete process.env.GEMINI_API_KEY_1;
            delete process.env.GEMINI_API_KEY_2;
            process.env.GEMINI_API_KEYS = `${FAKE_KEYS[2]},${FAKE_KEYS[3]}`;
            process.env.GEMINI_API_KEY = 'legacy-ignored-when-csv';
            assert.deepEqual(GeminiKeyManager.readKeysFromEnv(), [
                FAKE_KEYS[2],
                FAKE_KEYS[3]
            ]);

            delete process.env.GEMINI_API_KEYS;
            process.env.GEMINI_API_KEY = FAKE_KEYS[5];
            assert.deepEqual(GeminiKeyManager.readKeysFromEnv(), [FAKE_KEYS[5]]);
        } finally {
            for (const [k, v] of Object.entries(snapshot)) {
                if (v === undefined) delete process.env[k];
                else process.env[k] = v;
            }
        }
    });

    await test('TTS 1 chave funcionando', async () => {
        setKeyManagerForTesting(new GeminiKeyManager([FAKE_KEYS[0]]));
        await withMockFetch(async () => successResponse(), async () => {
            const wav = await synthesizeToWav('Olá, este é um teste curto de áudio.');
            assert.ok(Buffer.isBuffer(wav));
            assert.equal(wav.toString('utf8', 0, 4), 'RIFF');
        });
    });

    await test('TTS 6 chaves: pool operacional', async () => {
        const km = new GeminiKeyManager(FAKE_KEYS);
        setKeyManagerForTesting(km);
        await withMockFetch(async () => successResponse(), async () => {
            await synthesizeChunk('Trecho.');
        });
        assert.equal(km.getStats().total, 6);
        assert.ok(km.getStats().keys.some((k) => k.successes >= 1));
    });

    await test('TTS 429 hard rotaciona key-1 → key-2', async () => {
        const km = new GeminiKeyManager(FAKE_KEYS.slice(0, 2));
        setKeyManagerForTesting(km);
        let calls = 0;
        await withMockFetch(async (url) => {
            calls += 1;
            const u = String(url);
            if (calls === 1) {
                assert.ok(u.includes(encodeURIComponent(FAKE_KEYS[0])));
                return httpResponse(
                    429,
                    'RESOURCE_EXHAUSTED exceeded your current quota'
                );
            }
            assert.ok(u.includes(encodeURIComponent(FAKE_KEYS[1])));
            return successResponse();
        }, async () => {
            const result = await synthesizeChunk('Trecho curto.');
            assert.ok(result.pcm.length > 0);
        });
        assert.equal(
            km.getStats().keys.find((k) => k.id === 'key-1').reason,
            FailReason.QUOTA
        );
    });

    await test('TTS 429 soft com 2 chaves rotaciona sem espera longa', async () => {
        const km = new GeminiKeyManager(FAKE_KEYS.slice(0, 2));
        setKeyManagerForTesting(km);
        let calls = 0;
        const t0 = Date.now();
        await withMockFetch(async () => {
            calls += 1;
            if (calls === 1) return httpResponse(429, 'rate limit please slow down');
            return successResponse();
        }, async () => {
            await synthesizeChunk('Trecho.');
        });
        assert.ok(Date.now() - t0 < 2_000);
        assert.equal(calls, 2);
    });

    await test('TTS 429 soft com 1 chave: retry sticky depois sucesso', async () => {
        const km = new GeminiKeyManager([FAKE_KEYS[0]]);
        setKeyManagerForTesting(km);
        let calls = 0;
        await withMockFetch(async () => {
            calls += 1;
            if (calls === 1) {
                return httpResponse(429, 'rate limit', { 'retry-after': '0' });
            }
            return successResponse();
        }, async () => {
            const result = await synthesizeChunk('Trecho.');
            assert.ok(result.pcm.length > 0);
        });
        assert.equal(calls, 2);
        // Não deve ter marcado QUOTA permanente
        assert.notEqual(
            km.getStats().keys.find((k) => k.id === 'key-1').cooldownRemaining,
            'permanente'
        );
    });

    await test('TTS 401/403 invalida e rotaciona', async () => {
        const km = new GeminiKeyManager(FAKE_KEYS.slice(0, 2));
        setKeyManagerForTesting(km);
        let calls = 0;
        await withMockFetch(async () => {
            calls += 1;
            if (calls === 1) return httpResponse(403, 'permission denied');
            return successResponse();
        }, async () => {
            await synthesizeChunk('Trecho.');
        });
        assert.equal(km.getStats().invalid, 1);
        assert.equal(calls, 2);
    });

    await test('TTS erro de rede: retry mesma chave', async () => {
        const km = new GeminiKeyManager([FAKE_KEYS[0]]);
        setKeyManagerForTesting(km);
        let calls = 0;
        await withMockFetch(async () => {
            calls += 1;
            if (calls < 3) throw new Error('fetch failed');
            return successResponse();
        }, async () => {
            await synthesizeChunk('Trecho.');
        });
        assert.equal(calls, 3);
        assert.equal(km.getStats().active, 1);
    });

    await test('TTS HTTP 503: retries depois rotaciona para key-2', async () => {
        const km = new GeminiKeyManager(FAKE_KEYS.slice(0, 2));
        setKeyManagerForTesting(km);
        let calls = 0;
        let sawKey2 = false;
        await withMockFetch(async (url) => {
            calls += 1;
            if (String(url).includes(encodeURIComponent(FAKE_KEYS[1]))) {
                sawKey2 = true;
                return successResponse();
            }
            return httpResponse(503, 'unavailable');
        }, async () => {
            await synthesizeChunk('Trecho.');
        });
        assert.ok(calls >= 4);
        assert.equal(sawKey2, true);
    });

    await test('stats nunca incluem valor da chave', () => {
        const km = new GeminiKeyManager([FAKE_KEYS[0]]);
        const stats = JSON.stringify(km.getStats());
        for (const k of FAKE_KEYS) {
            assert.ok(!stats.includes(k));
        }
        assert.match(stats, /key-1/);
    });

    await test('hash já existente evita nova síntese (findReusable)', async () => {
        const slug = `qa-reuse-${Date.now()}`;
        const kind = 'summary';
        const hash = 'abc123def4567890';
        const wav = pcmToWav(makePcm(120));
        await putArticleAudio(slug, kind, {
            hash,
            wav,
            generatedAt: new Date().toISOString()
        });
        const found = await findReusableArticleAudio(slug, kind, hash);
        assert.ok(found);
        assert.equal(found.meta.hash, hash);
        assert.equal(await findReusableArticleAudio(slug, kind, 'otherhash000000'), null);
        try {
            await fs.rm(path.join(LOCAL_DIR, slug), { recursive: true, force: true });
        } catch (_) {
            /* ignore */
        }
    });

    await test('duas solicitações simultâneas do mesmo slug são serializadas', async () => {
        const order = [];
        const p1 = withArticleAudioSlugLock('same-article', async () => {
            order.push('a-start');
            await new Promise((r) => setTimeout(r, 40));
            order.push('a-end');
            return 1;
        });
        const p2 = withArticleAudioSlugLock('same-article', async () => {
            order.push('b-start');
            order.push('b-end');
            return 2;
        });
        const results = await Promise.all([p1, p2]);
        assert.deepEqual(results, [1, 2]);
        assert.deepEqual(order, ['a-start', 'a-end', 'b-start', 'b-end']);
    });

    await test('setKeyManagerForTesting isola testes', () => {
        setKeyManagerForTesting(new GeminiKeyManager([FAKE_KEYS[0]]));
        assert.equal(getKeyManager().size, 1);
        setKeyManagerForTesting(new GeminiKeyManager(FAKE_KEYS));
        assert.equal(getKeyManager().size, 6);
    });

    // ── P1: ALL_COOLING ≠ QUOTA + recuperação após soft cooldown ─────────

    await test('P1: 6 chaves soft cooldown → espera → recuperação → TTS', async () => {
        const km = new GeminiKeyManager(FAKE_KEYS);
        setKeyManagerForTesting(km);
        for (let i = 1; i <= 6; i += 1) {
            km.markFailed(i, FailReason.RATE_LIMIT, { cooldownMs: 5 });
        }
        assert.equal(km.getStats().active, 0);
        let calls = 0;
        await withMockFetch(async () => {
            calls += 1;
            return successResponse();
        }, async () => {
            const result = await synthesizeChunk('Trecho curto.');
            assert.ok(result.pcm.length > 0);
        });
        assert.equal(calls, 1);
        assert.ok(km.getStats().active >= 1);
    });

    await test('P1: ALL_COOLING não é promovido a QUOTA', async () => {
        const km = new GeminiKeyManager([FAKE_KEYS[0]]);
        setKeyManagerForTesting(km);
        // Cooldown >> sleep escalado (QT_TTS_TEST_FAST) → pool segue frio após wait.
        km.markFailed(1, FailReason.RATE_LIMIT, { cooldownMs: 120_000 });
        await withMockFetch(async () => successResponse(), async () => {
            await assert.rejects(
                () => synthesizeChunk('Trecho.'),
                (err) => err && err.message === 'ALL_COOLING'
            );
        });
    });

    // ── P1: identidade de áudio (texto + voz + modelo) ───────────────────

    await test('P1: mesmo texto+voz+modelo → mesmo hash (reutilizável)', () => {
        const cfg = getAudioGenerationConfig();
        const a = hashAudioIdentity('summary', 'Olá mundo', cfg);
        const b = hashAudioIdentity('summary', 'Olá mundo', { ...cfg });
        assert.equal(a, b);
        const script = buildSummaryScript('Olá mundo', cfg);
        assert.equal(script.hash, a);
    });

    await test('P1: mesmo texto + voz diferente → hash distinto', () => {
        const cfg = getAudioGenerationConfig();
        const a = hashAudioIdentity('summary', 'Olá mundo', cfg);
        const b = hashAudioIdentity('summary', 'Olá mundo', {
            ...cfg,
            voice: 'Laomedeia'
        });
        assert.notEqual(a, b);
    });

    await test('P1: mesmo texto + modelo diferente → hash distinto', () => {
        const cfg = getAudioGenerationConfig();
        const a = hashAudioIdentity('full', 'Olá mundo', cfg);
        const b = hashAudioIdentity('full', 'Olá mundo', {
            ...cfg,
            model: 'gemini-3.1-flash-tts-preview'
        });
        assert.notEqual(a, b);
    });

    await test('P1: texto diferente → hash distinto', () => {
        const cfg = getAudioGenerationConfig();
        const a = hashAudioIdentity('summary', 'Texto A', cfg);
        const b = hashAudioIdentity('summary', 'Texto B', cfg);
        assert.notEqual(a, b);
    });

    await test('P1: findReusable por identidade; voz diferente não reutiliza', async () => {
        const slug = `qa-id-${Date.now()}`;
        const cfg = getAudioGenerationConfig();
        const text = 'Parágrafo de teste para identidade.';
        const hash = hashAudioIdentity('summary', text, cfg);
        const otherVoice = hashAudioIdentity('summary', text, {
            ...cfg,
            voice: 'Laomedeia'
        });
        const wav = pcmToWav(makePcm(200));
        await putArticleAudio(slug, 'summary', { hash, wav });
        assert.ok(await findReusableArticleAudio(slug, 'summary', hash));
        assert.equal(await findReusableArticleAudio(slug, 'summary', otherVoice), null);
        assert.ok(isLegacyHashCompatible(cfg));
        assert.equal(
            isLegacyHashCompatible({ ...cfg, voice: 'Laomedeia' }),
            false
        );
        assert.notEqual(hash, hashLegacyAudioIdentity('summary', text));
        try {
            await fs.rm(path.join(LOCAL_DIR, slug), { recursive: true, force: true });
        } catch (_) {
            /* ignore */
        }
    });

    // ── P1: lease de geração (dedupe storage) ────────────────────────────

    await test('P1: lease exclusivo impede segunda aquisição (dedupe storage)', async () => {
        const slug = `qa-lease-${Date.now()}`;
        const hash = 'leasehash00000001';
        const first = await tryAcquireAudioGenerationLease(slug, 'summary', hash);
        assert.equal(first.acquired, true);
        const second = await tryAcquireAudioGenerationLease(slug, 'summary', hash);
        assert.equal(second.acquired, false);
        await releaseAudioGenerationLease(slug, 'summary', hash);
        const third = await tryAcquireAudioGenerationLease(slug, 'summary', hash);
        assert.equal(third.acquired, true);
        await releaseAudioGenerationLease(slug, 'summary', hash);
        try {
            await fs.rm(path.join(LOCAL_DIR, slug), { recursive: true, force: true });
        } catch (_) {
            /* ignore */
        }
    });

    await test('isIntactWavBuffer exige RIFF/WAVE/data coerente', () => {
        const good = pcmToWav(makePcm(100));
        assert.equal(isIntactWavBuffer(good), true);
        assert.equal(isIntactWavBuffer(Buffer.from('not-a-wav')), false);
        assert.equal(isIntactWavBuffer(Buffer.from('RIFF....WAVEfmt ')), false);
        const truncated = good.subarray(0, 20);
        assert.equal(isIntactWavBuffer(truncated), false);
    });

    console.log(`\n${passed} passou(aram), ${failed} falhou(aram).`);
    if (failed > 0) process.exit(1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
