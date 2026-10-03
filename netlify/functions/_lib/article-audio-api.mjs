/**
 * Adapter Netlify (Web Response) sobre scripts/article-audio-api.mjs.
 */
import { handleArticleAudioApi } from '../../../scripts/article-audio-api.mjs';

function clientIpFromRequest(req) {
    try {
        const h = req && req.headers;
        if (!h || typeof h.get !== 'function') return '';
        return (
            h.get('x-nf-client-connection-ip') ||
            (h.get('x-forwarded-for') || '').split(',')[0].trim() ||
            ''
        );
    } catch (_) {
        return '';
    }
}

function headerFromRequest(req, name) {
    try {
        const h = req && req.headers;
        if (!h || typeof h.get !== 'function') return '';
        return (h.get(name) || '').toString();
    } catch (_) {
        return '';
    }
}

function toResponse(out) {
    const headers = out.headers || {};
    if (out.isBinary && Buffer.isBuffer(out.body)) {
        return new Response(out.body, { status: out.status, headers });
    }
    return new Response(out.body, { status: out.status, headers });
}

export async function handleArticleAudio(req) {
    return toResponse(
        await handleArticleAudioApi(new URL(req.url), req.method || 'GET', {
            clientIp: clientIpFromRequest(req),
            origin: headerFromRequest(req, 'origin'),
            referer: headerFromRequest(req, 'referer'),
            headers: req.headers,
            rawRequest: req
        })
    );
}
