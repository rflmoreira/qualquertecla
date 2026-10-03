/**
 * Busca no Google Imagens via Serper.dev (única fonte).
 *
 * Local: SERPER_API_KEY no .env (preferencial) ou config/serper.key
 * Netlify: variável de ambiente SERPER_API_KEY
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BLOCKED_HOSTS =
    /(?:^|\.)(?:bing\.net|mm\.bing\.net|lookaside\.instagram\.com|lookaside\.fbsbx\.com)$/i;

function decodeEscapes(str) {
    return String(str || '')
        .replace(/&amp;/g, '&')
        .replace(/\\u003d/gi, '=')
        .replace(/\\u0026/gi, '&')
        .replace(/\\u003c/gi, '<')
        .replace(/\\u003e/gi, '>')
        .replace(/\\u0027/gi, "'")
        .replace(/\\u002f/gi, '/')
        .replace(/\\\//g, '/')
        .replace(/\\"/g, '"');
}

function hostFromUrl(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, '');
    } catch (_) {
        return '';
    }
}

function normalizeImageUrl(url) {
    let u = decodeEscapes(String(url || '').trim());
    if (!u) return '';
    if (/^\/\//.test(u)) u = 'https:' + u;
    if (/^http:\/\//i.test(u)) {
        u = 'https://' + u.slice(7);
    }
    return u;
}

function isGstaticThumb(url) {
    try {
        const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
        return (
            /^encrypted-tbn\d*\.gstatic\.com$/i.test(host) ||
            host === 'gstatic.com' ||
            host.endsWith('.gstatic.com') ||
            host.endsWith('.googleusercontent.com')
        );
    } catch (_) {
        return false;
    }
}

/** URL direta de imagem (não página/widget de rede social). */
function isUsableImageUrl(url) {
    if (!url || !/^https:\/\//i.test(url)) return false;
    if (/\.(?:svg)(?:[?#]|$)/i.test(url)) return false;
    try {
        const u = new URL(url);
        const host = u.hostname.replace(/^www\./, '').toLowerCase();
        const path = u.pathname || '';

        if (isGstaticThumb(url)) return true;

        if (BLOCKED_HOSTS.test(host)) return false;
        if (/lookaside\./i.test(host)) return false;
        if (/\/seo\/google_widget\/crawler/i.test(path)) return false;
        if (/\/google_widget\//i.test(path)) return false;

        if (host === 'instagram.com' || host === 'www.instagram.com') return false;
        if (host === 'facebook.com' || host === 'www.facebook.com' || host === 'fb.com') return false;
        if (host === 'x.com' || host === 'twitter.com' || host === 'mobile.twitter.com') return false;
    } catch (_) {
        return false;
    }
    return true;
}

function mapSerperImage(img, page, index) {
    const regular = normalizeImageUrl(img.imageUrl || '');
    const thumb = normalizeImageUrl(img.thumbnailUrl || '');

    let main = null;
    if (isUsableImageUrl(regular)) main = regular;
    else if (isUsableImageUrl(thumb)) main = thumb;
    else if (thumb && /^https:\/\//i.test(thumb)) main = thumb;
    else if (regular && /^https:\/\//i.test(regular) && !/lookaside\./i.test(regular)) main = regular;

    if (!main) return null;

    const preview = isUsableImageUrl(thumb) ? thumb : main;
    return {
        id: 'gi-p' + (page || 1) + '-' + index,
        urls: {
            thumb: preview,
            small: preview,
            regular: main
        },
        alt_description: img.title || '',
        source_page: img.link || '',
        source_name: img.source || img.domain || hostFromUrl(img.link || main),
        width: img.imageWidth || 0,
        height: img.imageHeight || 0
    };
}

function normalizeResults(raw, provider, page = 1, perPage = 18) {
    const results = (raw || []).filter((r) => r?.urls?.regular);
    const limit = Math.min(30, Math.max(1, Number(perPage) || 18));
    const likelyMore = results.length >= Math.max(6, Math.floor(limit * 0.6));
    return {
        results,
        total: results.length,
        total_pages: results.length === 0 ? Math.max(0, page - 1) : likelyMore ? page + 1 : page,
        provider
    };
}

function getSerperKey() {
    const fromEnv = (
        process.env.SERPER_API_KEY ||
        process.env.GOOGLE_IMAGES_SERPER_KEY ||
        ''
    ).trim();
    if (fromEnv) return fromEnv;

    try {
        const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
        const keyFile = path.join(root, 'config', 'serper.key');
        const raw = fs.readFileSync(keyFile, 'utf8').trim();
        return raw.split(/\r?\n/)[0].trim();
    } catch (_) {
        return '';
    }
}

async function searchViaSerper(query, page, perPage) {
    const key = getSerperKey();
    if (!key) return null;

    const res = await fetch('https://google.serper.dev/images', {
        method: 'POST',
        headers: {
            'X-API-KEY': key,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            q: query,
            gl: 'br',
            // ISO 639-1 — "pt-br" não é válido e pode esvaziar resultados
            hl: 'pt',
            num: Math.min(100, Math.max(10, Number(perPage) || 18)),
            page: Math.max(1, Number(page) || 1)
        }),
        signal: AbortSignal.timeout(25000)
    });

    if (!res.ok) {
        // Não vazar body/status detalhado ao cliente — só log interno sem a chave.
        console.warn('[google-images] Serper HTTP', res.status);
        throw new Error('upstream_unavailable');
    }

    const data = await res.json();
    const images = Array.isArray(data.images) ? data.images : [];
    const results = images.map((img, i) => mapSerperImage(img, page, i)).filter(Boolean);

    return normalizeResults(results, 'google-serper', page || 1, perPage);
}

export function getGoogleImagesProviders() {
    const hasSerper = !!getSerperKey();
    return {
        serper: hasSerper
    };
}

/**
 * @param {string} query
 * @param {number} page
 * @param {number} perPage
 */
export async function searchGoogleImages(query, page = 1, perPage = 18) {
    const q = String(query || '').trim();
    if (!q) {
        return { results: [], total: 0, total_pages: 0, provider: 'none' };
    }

    if (!getSerperKey()) {
        throw new Error(
            'Configure SERPER_API_KEY para habilitar a busca de imagens. ' +
                'Crie uma chave gratuita em https://serper.dev e reinicie o servidor ' +
                '(ex.: SERPER_API_KEY=sua_chave node scripts/serve.mjs) ' +
                'ou salve a chave em config/serper.key'
        );
    }

    try {
        const serper = await searchViaSerper(q, page, perPage);
        if (serper) return serper;
        return { results: [], total: 0, total_pages: 0, provider: 'google-serper' };
    } catch (err) {
        if (/Configure SERPER_API_KEY/.test(err.message)) throw err;
        throw new Error('upstream_unavailable');
    }
}
