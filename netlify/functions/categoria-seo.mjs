/**
 * Prerender SEO de categoria.html?slug=…
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCategoriaHtml } from '../../scripts/seo/inject-categoria-html.mjs';

let templateCache = { path: '', mtimeMs: 0, html: '' };

function templateCandidates() {
    const names = ['categoria.html'];
    const dirs = new Set();
    try {
        dirs.add(process.cwd());
    } catch (_) {}
    if (process.env.LAMBDA_TASK_ROOT) dirs.add(process.env.LAMBDA_TASK_ROOT);
    try {
        const here = path.dirname(fileURLToPath(import.meta.url));
        dirs.add(here);
        dirs.add(path.resolve(here, '..'));
        dirs.add(path.resolve(here, '../..'));
    } catch (_) {}
    const out = [];
    for (const dir of dirs) {
        if (!dir) continue;
        for (const name of names) out.push(path.join(dir, name));
    }
    return out;
}

function loadTemplate() {
    if (templateCache.html && templateCache.path) {
        try {
            const st = fs.statSync(templateCache.path);
            if (st.mtimeMs === templateCache.mtimeMs) return templateCache.html;
        } catch (_) {
            templateCache = { path: '', mtimeMs: 0, html: '' };
        }
    }
    const tried = [];
    for (const candidate of templateCandidates()) {
        tried.push(candidate);
        try {
            const st = fs.statSync(candidate);
            if (!st.isFile()) continue;
            const html = fs.readFileSync(candidate, 'utf8');
            templateCache = { path: candidate, mtimeMs: st.mtimeMs, html };
            return html;
        } catch (_) {}
    }
    throw new Error(`Template categoria.html não encontrado. Tentados: ${tried.join(' | ')}`);
}

function htmlHeaders(cacheControl) {
    return {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': cacheControl || 'public, max-age=60',
        'X-Content-Type-Options': 'nosniff'
    };
}

export default async (req) => {
    try {
        if (req.method && req.method !== 'GET' && req.method !== 'HEAD') {
            return new Response(JSON.stringify({ error: 'Método não permitido' }), {
                status: 405,
                headers: { 'Content-Type': 'application/json; charset=utf-8' }
            });
        }

        let slug = null;
        try {
            slug = new URL(req.url).searchParams.get('slug');
        } catch (_) {
            slug = null;
        }

        const template = loadTemplate();
        const out = renderCategoriaHtml(template, slug);
        const headers = htmlHeaders(out.cacheControl);
        if (req.method === 'HEAD') {
            return new Response(null, { status: out.status, headers });
        }
        return new Response(out.html, { status: out.status, headers });
    } catch (err) {
        const message = err && err.message ? String(err.message) : String(err);
        console.error('[categoria-seo]', message);
        try {
            const template = loadTemplate();
            const headers = htmlHeaders('public, max-age=60');
            if (req.method === 'HEAD') return new Response(null, { status: 200, headers });
            return new Response(template, { status: 200, headers });
        } catch (inner) {
            const detail = inner && inner.message ? String(inner.message) : message;
            const safeDetail = String(detail)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            return new Response(
                `<!DOCTYPE html><html><head><title>Erro</title></head><body><p>${safeDetail}</p></body></html>`,
                { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            );
        }
    }
};

export const config = {
    path: '/categoria.html',
    preferStatic: false
};
