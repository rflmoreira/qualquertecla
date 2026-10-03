/**
 * Adapter Netlify (Web Response) sobre o router em scripts/google-images-api.mjs.
 * Core Serper: scripts/google-images-fetch.mjs
 */
import { handleGoogleImagesApi } from '../../../scripts/google-images-api.mjs';

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

function toResponse(out) {
    return new Response(out.body, {
        status: out.status,
        headers: out.headers || {}
    });
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

export async function handleSearch(req) {
    return toResponse(
        await handleGoogleImagesApi(new URL(req.url), req.method || 'GET', {
            clientIp: clientIpFromRequest(req),
            origin: headerFromRequest(req, 'origin'),
            referer: headerFromRequest(req, 'referer'),
            headers: req.headers
        })
    );
}

export async function handleHealth(req) {
    return toResponse(
        await handleGoogleImagesApi(new URL(req.url), req.method || 'GET', {
            clientIp: clientIpFromRequest(req),
            origin: headerFromRequest(req, 'origin'),
            referer: headerFromRequest(req, 'referer'),
            headers: req.headers
        })
    );
}
