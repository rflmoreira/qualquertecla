/**
 * Armazenamento de áudios de matéria.
 * Produção Netlify: @netlify/blobs (onlyIfNew para lease cross-isolate).
 * Local: .cache/article-audio/ (open 'wx' para lease).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL_DIR = path.join(ROOT, '.cache', 'article-audio');
const STORE_NAME = 'article-audio';
/** Lease de geração: evita TTS duplicado entre isolates para o mesmo hash. */
const LEASE_TTL_MS = 10 * 60_000;
const LEASE_POLL_MS = 750;
const LEASE_POLL_MAX_MS = 90_000;

function metaKey(slug, kind) {
    return `${safeSlug(slug)}/${kind}.json`;
}

function audioKey(slug, kind, hash) {
    const h = String(hash || 'x').slice(0, 16);
    return `${safeSlug(slug)}/${kind}-${h}.wav`;
}

function leaseKey(slug, kind, hash) {
    const h = String(hash || 'x').slice(0, 16);
    return `${safeSlug(slug)}/${kind}-${h}.lease`;
}

function safeSlug(slug) {
    return (
        String(slug || 'draft')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_-]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 120) || 'draft'
    );
}

function isNetlifyRuntime() {
    return process.env.NETLIFY === 'true' || Boolean(process.env.SITE_ID);
}

async function getBlobStore() {
    if (!isNetlifyRuntime()) return null;
    try {
        const { getStore } = await import('@netlify/blobs');
        return getStore(STORE_NAME);
    } catch (_) {
        return null;
    }
}

async function ensureLocalDir(filePath) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function localPut(key, data, contentType) {
    const filePath = path.join(LOCAL_DIR, key);
    await ensureLocalDir(filePath);
    if (Buffer.isBuffer(data) || data instanceof Uint8Array) {
        await fs.writeFile(filePath, data);
    } else {
        await fs.writeFile(filePath, String(data), 'utf8');
    }
    if (contentType) {
        await fs.writeFile(`${filePath}.ctype`, contentType, 'utf8');
    }
}

async function localGet(key) {
    const filePath = path.join(LOCAL_DIR, key);
    try {
        const data = await fs.readFile(filePath);
        let contentType = 'application/octet-stream';
        try {
            contentType = (await fs.readFile(`${filePath}.ctype`, 'utf8')).trim() || contentType;
        } catch (_) {
            if (key.endsWith('.json')) contentType = 'application/json';
            if (key.endsWith('.wav')) contentType = 'audio/wav';
        }
        return { data, contentType };
    } catch (_) {
        return null;
    }
}

async function localDelete(key) {
    const filePath = path.join(LOCAL_DIR, key);
    try {
        await fs.unlink(filePath);
    } catch (_) {
        /* ignore */
    }
    try {
        await fs.unlink(`${filePath}.ctype`);
    } catch (_) {
        /* ignore */
    }
}

/**
 * @param {string} slug
 * @param {'summary'|'full'} kind
 * @param {{ hash: string, wav: Buffer, generatedAt?: string }} payload
 */
export async function putArticleAudio(slug, kind, payload) {
    const hash = String(payload.hash || '');
    const wav = payload.wav;
    const generatedAt = payload.generatedAt || new Date().toISOString();
    if (!hash || !Buffer.isBuffer(wav) || !wav.length) {
        throw new Error('INVALID_AUDIO_PAYLOAD');
    }

    const aKey = audioKey(slug, kind, hash);
    const mKey = metaKey(slug, kind);
    const meta = {
        slug: safeSlug(slug),
        kind,
        hash,
        audioKey: aKey,
        generatedAt,
        bytes: wav.length
    };

    const store = await getBlobStore();
    if (store) {
        await store.set(aKey, wav, { metadata: { contentType: 'audio/wav' } });
        await store.setJSON(mKey, meta);
    } else {
        await localPut(aKey, wav, 'audio/wav');
        await localPut(mKey, JSON.stringify(meta), 'application/json');
    }

    return meta;
}

/**
 * @param {string} slug
 * @param {'summary'|'full'} kind
 */
export async function getArticleAudioMeta(slug, kind) {
    const mKey = metaKey(slug, kind);
    const store = await getBlobStore();
    if (store) {
        try {
            return (await store.get(mKey, { type: 'json' })) || null;
        } catch (_) {
            return null;
        }
    }
    const local = await localGet(mKey);
    if (!local) return null;
    try {
        return JSON.parse(local.data.toString('utf8'));
    } catch (_) {
        return null;
    }
}

/**
 * @param {string} slug
 * @param {'summary'|'full'} kind
 * @param {string} [hash]
 */
export async function getArticleAudioWav(slug, kind, hash) {
    const meta = await getArticleAudioMeta(slug, kind);
    if (!meta) return null;
    if (hash && meta.hash && String(hash) !== String(meta.hash)) {
        return null;
    }
    const aKey = meta.audioKey || audioKey(slug, kind, meta.hash);
    const store = await getBlobStore();
    if (store) {
        try {
            const data = await store.get(aKey, { type: 'arrayBuffer' });
            if (!data) return null;
            return { wav: Buffer.from(data), meta, contentType: 'audio/wav' };
        } catch (_) {
            return null;
        }
    }
    const local = await localGet(aKey);
    if (!local) return null;
    return { wav: local.data, meta, contentType: 'audio/wav' };
}

/**
 * WAV íntegro mínimo: RIFF/WAVE + chunk data com tamanho coerente.
 * @param {Buffer|Uint8Array|null|undefined} buf
 */
export function isIntactWavBuffer(buf) {
    if (!buf || !Buffer.isBuffer(buf)) return false;
    if (buf.length < 44) return false;
    if (buf.toString('utf8', 0, 4) !== 'RIFF') return false;
    if (buf.toString('utf8', 8, 12) !== 'WAVE') return false;

    let offset = 12;
    while (offset + 8 <= buf.length) {
        const id = buf.toString('utf8', offset, offset + 4);
        const size = buf.readUInt32LE(offset + 4);
        const dataStart = offset + 8;
        if (!Number.isFinite(size) || size < 0) return false;
        if (id === 'data') {
            if (dataStart + size > buf.length) return false;
            return size > 0;
        }
        offset = dataStart + size + (size % 2);
    }
    return false;
}

/**
 * Reutiliza áudio já armazenado quando o hash coincide e o WAV está íntegro.
 *
 * @param {string} slug
 * @param {'summary'|'full'} kind
 * @param {string} hash
 * @returns {Promise<{ wav: Buffer, meta: object, contentType: string }|null>}
 */
export async function findReusableArticleAudio(slug, kind, hash) {
    const want = String(hash || '').trim();
    if (!want) return null;
    const found = await getArticleAudioWav(slug, kind, want);
    if (!found || !found.meta) return null;
    if (String(found.meta.hash || '') !== want) return null;
    if (!isIntactWavBuffer(found.wav)) return null;
    return found;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function parseLeasePayload(raw) {
    try {
        const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw || '');
        const data = JSON.parse(text);
        const at = Number(data && data.at);
        return Number.isFinite(at) ? { at } : null;
    } catch (_) {
        return null;
    }
}

async function readLease(slug, kind, hash) {
    const key = leaseKey(slug, kind, hash);
    const store = await getBlobStore();
    if (store) {
        try {
            const data = await store.get(key, { type: 'text' });
            return data ? parseLeasePayload(data) : null;
        } catch (_) {
            return null;
        }
    }
    const local = await localGet(key);
    return local ? parseLeasePayload(local.data) : null;
}

async function deleteLease(slug, kind, hash) {
    const key = leaseKey(slug, kind, hash);
    const store = await getBlobStore();
    if (store) {
        try {
            await store.delete(key);
        } catch (_) {
            /* ignore */
        }
        return;
    }
    await localDelete(key);
}

/**
 * Tenta adquirir lease exclusivo de geração (cross-isolate via Blobs onlyIfNew;
 * local via open wx). Lease antigo (> TTL) é removido e retentado uma vez.
 *
 * @returns {Promise<{ acquired: boolean }>}
 */
export async function tryAcquireAudioGenerationLease(slug, kind, hash) {
    const want = String(hash || '').trim();
    if (!want) return { acquired: false };

    const key = leaseKey(slug, kind, want);
    const payload = JSON.stringify({ at: Date.now() });

    const attempt = async () => {
        const store = await getBlobStore();
        if (store) {
            const result = await store.set(key, payload, {
                onlyIfNew: true,
                metadata: { contentType: 'application/json' }
            });
            return !(result && result.modified === false);
        }
        const filePath = path.join(LOCAL_DIR, key);
        await ensureLocalDir(filePath);
        try {
            const fh = await fs.open(filePath, 'wx');
            await fh.writeFile(payload, 'utf8');
            await fh.close();
            return true;
        } catch (err) {
            if (err && err.code === 'EEXIST') return false;
            throw err;
        }
    };

    if (await attempt()) return { acquired: true };

    const existing = await readLease(slug, kind, want);
    const age = existing ? Date.now() - existing.at : Infinity;
    if (age > LEASE_TTL_MS) {
        await deleteLease(slug, kind, want);
        if (await attempt()) return { acquired: true };
    }
    return { acquired: false };
}

export async function releaseAudioGenerationLease(slug, kind, hash) {
    await deleteLease(slug, kind, hash);
}

/**
 * Sem lease: espera outro isolate gravar o WAV (poll findReusable) ou timeout.
 * @returns {Promise<{ wav: Buffer, meta: object, contentType: string }|null>}
 */
export async function waitForReusableArticleAudio(slug, kind, hash, opts = {}) {
    const maxMs = Number(opts.maxMs) > 0 ? Number(opts.maxMs) : LEASE_POLL_MAX_MS;
    const step = Number(opts.stepMs) > 0 ? Number(opts.stepMs) : LEASE_POLL_MS;
    const started = Date.now();
    while (Date.now() - started < maxMs) {
        const found = await findReusableArticleAudio(slug, kind, hash);
        if (found) return found;
        await sleep(step);
    }
    return findReusableArticleAudio(slug, kind, hash);
}

export function publicAudioUrl(slug, kind, hash) {
    const s = encodeURIComponent(safeSlug(slug));
    const k = encodeURIComponent(kind);
    const v = encodeURIComponent(String(hash || '').slice(0, 64));
    return `/api/article-audio?slug=${s}&kind=${k}&v=${v}`;
}

export {
    safeSlug,
    LOCAL_DIR,
    leaseKey,
    LEASE_TTL_MS,
    LEASE_POLL_MAX_MS
};
