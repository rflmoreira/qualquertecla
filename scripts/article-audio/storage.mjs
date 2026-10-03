/**
 * Armazenamento de áudios de matéria.
 * Produção Netlify: @netlify/blobs. Local: .cache/article-audio/
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL_DIR = path.join(ROOT, '.cache', 'article-audio');
const STORE_NAME = 'article-audio';

function metaKey(slug, kind) {
    return `${safeSlug(slug)}/${kind}.json`;
}

function audioKey(slug, kind, hash) {
    const h = String(hash || 'x').slice(0, 16);
    return `${safeSlug(slug)}/${kind}-${h}.wav`;
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
 * WAV mínimo íntegro (header RIFF + tamanho > 44 bytes).
 * @param {Buffer|Uint8Array|null|undefined} buf
 */
export function isIntactWavBuffer(buf) {
    if (!buf || !Buffer.isBuffer(buf)) return false;
    if (buf.length <= 44) return false;
    return buf.toString('utf8', 0, 4) === 'RIFF';
}

/**
 * Reutiliza áudio já armazenado quando o hash do texto atual coincide.
 * Evita nova chamada Gemini/TTS.
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

export function publicAudioUrl(slug, kind, hash) {
    const s = encodeURIComponent(safeSlug(slug));
    const k = encodeURIComponent(kind);
    const v = encodeURIComponent(String(hash || '').slice(0, 64));
    return `/api/article-audio?slug=${s}&kind=${k}&v=${v}`;
}

export { safeSlug, LOCAL_DIR };
