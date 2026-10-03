/**
 * Unsplash background fetch (server-only).
 * Chave: process.env.UNSPLASH_ACCESS_KEY — nunca no frontend.
 */

function getAccessKey() {
    return String(process.env.UNSPLASH_ACCESS_KEY || '').trim();
}

export function isUnsplashConfigured() {
    return Boolean(getAccessKey());
}

/**
 * @param {string} collectionId
 * @returns {Promise<{
 *   url: string,
 *   thumb?: string,
 *   color?: string,
 *   author: string,
 *   authorUrl: string,
 *   photoUrl: string,
 *   site: string
 * }>}
 */
export async function fetchUnsplashBackground(collectionId) {
    const key = getAccessKey();
    if (!key) {
        const err = new Error('UNSPLASH_ACCESS_KEY não configurada.');
        err.code = 'UNSPLASH_NOT_CONFIGURED';
        throw err;
    }

    const collection = String(collectionId || '')
        .trim()
        .replace(/[^\w-]/g, '')
        .slice(0, 32);
    if (!collection) {
        const err = new Error('Informe o ID da coleção Unsplash.');
        err.code = 'BAD_COLLECTION';
        throw err;
    }

    const endpoint = new URL('https://api.unsplash.com/photos/random');
    endpoint.searchParams.set('collections', collection);
    endpoint.searchParams.set('orientation', 'landscape');

    const res = await fetch(endpoint.toString(), {
        headers: {
            Accept: 'application/json',
            'Accept-Version': 'v1',
            Authorization: `Client-ID ${key}`
        }
    });

    if (!res.ok) {
        let detail = '';
        try {
            const body = await res.json();
            detail = body && (body.errors || body.error) ? JSON.stringify(body.errors || body.error) : '';
        } catch (_) {
            /* ignore */
        }
        const err = new Error(
            res.status === 404
                ? 'Coleção Unsplash não encontrada.'
                : `Unsplash respondeu ${res.status}${detail ? `: ${detail}` : ''}`
        );
        err.code = 'UNSPLASH_HTTP';
        err.status = res.status;
        throw err;
    }

    const image = await res.json();
    const raw = image && image.urls && image.urls.raw ? String(image.urls.raw) : '';
    if (!raw) {
        const err = new Error('Resposta Unsplash sem URL de imagem.');
        err.code = 'UNSPLASH_EMPTY';
        throw err;
    }

    const url = `${raw}&w=2048&h=1117&crop=entropy&fit=crop&q=80`;
    const thumb =
        image.urls && image.urls.small
            ? String(image.urls.small)
            : `${raw}&w=400&h=220&fit=crop&q=60`;

    return {
        url,
        thumb,
        color: image.color ? String(image.color) : undefined,
        author: image.user && image.user.name ? String(image.user.name) : 'Unsplash',
        authorUrl:
            image.user && image.user.links && image.user.links.html
                ? String(image.user.links.html)
                : 'https://unsplash.com',
        photoUrl:
            image.links && image.links.html
                ? String(image.links.html)
                : 'https://unsplash.com',
        site: 'Unsplash'
    };
}
