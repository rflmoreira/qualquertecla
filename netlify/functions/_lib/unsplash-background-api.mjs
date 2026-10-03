/**
 * Adapter Netlify (Web Response) sobre scripts/unsplash-background-api.mjs.
 */
import { handleUnsplashBackgroundApi } from '../../../scripts/unsplash-background-api.mjs';

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
    return new Response(out.body, {
        status: out.status,
        headers: out.headers || {}
    });
}

export async function handleUnsplashBackground(req) {
    return toResponse(
        await handleUnsplashBackgroundApi(new URL(req.url), req.method || 'GET', {
            clientIp: clientIpFromRequest(req),
            origin: headerFromRequest(req, 'origin'),
            referer: headerFromRequest(req, 'referer')
        })
    );
}
