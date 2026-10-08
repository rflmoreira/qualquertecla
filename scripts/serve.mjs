#!/usr/bin/env node
/**
 * Servidor local: site estático + API de imagens (Serper) + resumo por IA (Groq).
 *
 * Uso: node scripts/serve.mjs
 * Abra: http://127.0.0.1:8765/admin/nova-noticia.html
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getGoogleImagesProviders } from './google-images-fetch.mjs';
import { handleGoogleImagesApi } from './google-images-api.mjs';
import { handleAiSummaryApi } from './ai-summary-api.mjs';
import { handleArticleAudioApi } from './article-audio-api.mjs';
import { isGeminiTtsConfigured } from './article-audio/gemini-tts.mjs';
import { handleUnsplashBackgroundApi } from './unsplash-background-api.mjs';
import { isUnsplashConfigured } from './unsplash-background.mjs';
import { renderNoticiaHtml } from './seo/inject-noticia-html.mjs';
import { renderCategoriaHtml } from './seo/inject-categoria-html.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8765);

/** Carrega variáveis de ambiente locais do .env (sem sobrescrever o ambiente). */
function loadLocalSecrets() {
    const envFile = path.join(ROOT, '.env');
    try {
        const text = fs.readFileSync(envFile, 'utf8');
        for (const line of text.split(/\r?\n/)) {
            const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
            if (!m) continue;
            const k = m[1];
            let v = m[2].replace(/^['"]|['"]$/g, '');
            if (process.env[k] == null || process.env[k] === '') process.env[k] = v;
        }
    } catch (_) {}
}

loadLocalSecrets();

/** Protótipo local: permite API de imagens sem JWT (nunca em Netlify production). */
if (process.env.QT_ALLOW_LOCAL_ADMIN_API == null || process.env.QT_ALLOW_LOCAL_ADMIN_API === '') {
    process.env.QT_ALLOW_LOCAL_ADMIN_API = '1';
}

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.woff2': 'font/woff2',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.mp4': 'video/mp4',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg'
};

/** Adapta o router compartilhado (scripts/google-images-api.mjs) ao http.Server do Node. */
async function handleGoogleImagesHttp(req, res, reqUrl) {
    if (!reqUrl.pathname.startsWith('/api/google-images')) return false;

    const clientIp =
        (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
        req.socket?.remoteAddress ||
        '';
    const out = await handleGoogleImagesApi(reqUrl, req.method || 'GET', {
        clientIp,
        origin: (req.headers.origin || '').toString(),
        referer: (req.headers.referer || '').toString(),
        headers: req.headers
    });
    Object.entries(out.headers || {}).forEach(([key, value]) => res.setHeader(key, value));
    res.writeHead(out.status);
    res.end(out.body || '');
    return true;
}

/** Adapta o router compartilhado (scripts/unsplash-background-api.mjs) ao http.Server do Node. */
async function handleUnsplashBackgroundHttp(req, res, reqUrl) {
    if (!reqUrl.pathname.startsWith('/api/unsplash')) return false;

    const clientIp =
        (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
        req.socket?.remoteAddress ||
        '';
    const out = await handleUnsplashBackgroundApi(reqUrl, req.method || 'GET', {
        clientIp,
        origin: (req.headers.origin || '').toString(),
        referer: (req.headers.referer || '').toString()
    });
    Object.entries(out.headers || {}).forEach(([key, value]) => res.setHeader(key, value));
    res.writeHead(out.status);
    res.end(out.body || '');
    return true;
}

/** Adapta o router compartilhado (scripts/ai-summary-api.mjs) ao http.Server do Node. */
async function handleAiSummaryHttp(req, res, reqUrl) {
    if (reqUrl.pathname.replace(/\/+$/, '') !== '/api/ai-summary') return false;

    const clientIp =
        (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
        req.socket?.remoteAddress ||
        '';

    let bodyText = '';
    if ((req.method || 'GET') === 'POST') {
        bodyText = await new Promise((resolve, reject) => {
            const chunks = [];
            let size = 0;
            req.on('data', (chunk) => {
                size += chunk.length;
                if (size > 64_000) {
                    reject(new Error('BODY_TOO_LARGE'));
                    req.destroy();
                    return;
                }
                chunks.push(chunk);
            });
            req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
            req.on('error', reject);
        }).catch((err) => {
            if (err && err.message === 'BODY_TOO_LARGE') return '__TOO_LARGE__';
            return '';
        });
    }

    if (bodyText === '__TOO_LARGE__') {
        res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Payload muito grande.' }));
        return true;
    }

    const out = await handleAiSummaryApi(reqUrl, req.method || 'GET', {
        clientIp,
        origin: (req.headers.origin || '').toString(),
        referer: (req.headers.referer || '').toString(),
        headers: req.headers,
        body: bodyText
    });
    Object.entries(out.headers || {}).forEach(([key, value]) => res.setHeader(key, value));
    res.writeHead(out.status);
    res.end(out.body || '');
    return true;
}

/** Áudio de matéria: geração (admin) + entrega pública de WAV pré-gerado. */
async function handleArticleAudioHttp(req, res, reqUrl) {
    const path = reqUrl.pathname.replace(/\/+$/, '');
    if (path !== '/api/article-audio' && path !== '/api/article-audio/generate') {
        return false;
    }

    const clientIp =
        (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
        req.socket?.remoteAddress ||
        '';

    let bodyText = '';
    if ((req.method || 'GET') === 'POST') {
        bodyText = await readRequestBody(req, 200_000);
    }

    if (bodyText === '__TOO_LARGE__') {
        res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Payload muito grande.' }));
        return true;
    }

    const out = await handleArticleAudioApi(reqUrl, req.method || 'GET', {
        clientIp,
        origin: (req.headers.origin || '').toString(),
        referer: (req.headers.referer || '').toString(),
        headers: req.headers,
        body: bodyText
    });
    Object.entries(out.headers || {}).forEach(([key, value]) => res.setHeader(key, value));
    res.writeHead(out.status);
    if (out.isBinary && Buffer.isBuffer(out.body)) {
        res.end(out.body);
    } else {
        res.end(out.body || '');
    }
    return true;
}

/** Lê o corpo da requisição respeitando um teto de bytes. */
function readRequestBody(req, maxBytes) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > maxBytes) {
                reject(new Error('BODY_TOO_LARGE'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    }).catch((err) => (err && err.message === 'BODY_TOO_LARGE' ? '__TOO_LARGE__' : ''));
}

let noticiaTemplateCache = { mtimeMs: 0, html: '' };
let categoriaTemplateCache = { mtimeMs: 0, html: '' };

function loadNoticiaTemplate() {
    const filePath = path.join(ROOT, 'noticia.html');
    const st = fs.statSync(filePath);
    if (noticiaTemplateCache.html && noticiaTemplateCache.mtimeMs === st.mtimeMs) {
        return noticiaTemplateCache.html;
    }
    const html = fs.readFileSync(filePath, 'utf8');
    noticiaTemplateCache = { mtimeMs: st.mtimeMs, html };
    return html;
}

function loadCategoriaTemplate() {
    const filePath = path.join(ROOT, 'categoria.html');
    const st = fs.statSync(filePath);
    if (categoriaTemplateCache.html && categoriaTemplateCache.mtimeMs === st.mtimeMs) {
        return categoriaTemplateCache.html;
    }
    const html = fs.readFileSync(filePath, 'utf8');
    categoriaTemplateCache = { mtimeMs: st.mtimeMs, html };
    return html;
}

/** Prerender SEO: injeta meta no HTML inicial de /noticia.html?slug= */
function handleNoticiaSeo(req, res, reqUrl) {
    const p = reqUrl.pathname.replace(/\/+$/, '') || '/';
    if (p !== '/noticia.html') return false;

    const method = req.method || 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Método não permitido' }));
        return true;
    }

    let template;
    try {
        template = loadNoticiaTemplate();
    } catch (_) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Template indisponível');
        return true;
    }

    const out = renderNoticiaHtml(template, reqUrl.searchParams.get('slug'));
    const headers = {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': out.cacheControl,
        'X-Content-Type-Options': 'nosniff'
    };
    res.writeHead(out.status, headers);
    if (method === 'HEAD') {
        res.end();
        return true;
    }
    res.end(out.html);
    return true;
}

/** Prerender SEO: injeta meta no HTML inicial de /categoria.html?slug= */
function handleCategoriaSeo(req, res, reqUrl) {
    const p = reqUrl.pathname.replace(/\/+$/, '') || '/';
    if (p !== '/categoria.html') return false;

    const method = req.method || 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Método não permitido' }));
        return true;
    }

    let template;
    try {
        template = loadCategoriaTemplate();
    } catch (_) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Template indisponível');
        return true;
    }

    const out = renderCategoriaHtml(template, reqUrl.searchParams.get('slug'));
    const headers = {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': out.cacheControl,
        'X-Content-Type-Options': 'nosniff'
    };
    res.writeHead(out.status, headers);
    if (method === 'HEAD') {
        res.end();
        return true;
    }
    res.end(out.html);
    return true;
}

/** Diretórios/arquivos que nunca devem ser servidos via HTTP. */
const PRIVATE_DIR_NAMES = new Set([
    '.git',
    '.netlify',
    '.kombai',
    'node_modules',
    '.cursor',
    '.vscode',
    'scripts',
    'netlify',
    'db',
    '.cache'
]);

function isPrivateRelative(rel) {
    const parts = rel.split(/[/\\]/).filter(Boolean);
    if (parts.some((p) => PRIVATE_DIR_NAMES.has(p))) return true;

    const base = parts[parts.length - 1] || '';
    if (base === '.env' || base === '.env.example') return true;
    if (base === '.DS_Store' || base.endsWith('.log')) return true;
    if (base.endsWith('.key') || base === 'serper.key') return true;
    return false;
}

/**
 * Resolve path dentro de ROOT, bloqueando traversal e arquivos sensíveis.
 * Retorna null se o caminho for inválido ou privado.
 */
function safePath(urlPath) {
    let decoded;
    try {
        decoded = decodeURIComponent(String(urlPath || '').split('?')[0]);
    } catch (_) {
        return null;
    }
    if (decoded.includes('\0')) return null;

    const rel = decoded.replace(/^\/+/, '') || 'index.html';
    if (isPrivateRelative(rel)) return null;

    const abs = path.resolve(ROOT, rel);
    const rootPrefix = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
    if (abs !== ROOT && !abs.startsWith(rootPrefix)) return null;
    if (isPrivateRelative(path.relative(ROOT, abs))) return null;
    return abs;
}

function sendForbidden(res) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
}

function sendNotFound(res) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
}

function serveStatic(req, res, filePath) {
    if (!filePath || isPrivateRelative(path.relative(ROOT, filePath))) {
        sendForbidden(res);
        return;
    }
    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            sendNotFound(res);
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        fs.createReadStream(filePath).pipe(res);
    });
}

const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);

    if (await handleGoogleImagesHttp(req, res, reqUrl)) return;
    if (await handleAiSummaryHttp(req, res, reqUrl)) return;
    if (await handleArticleAudioHttp(req, res, reqUrl)) return;
    if (await handleUnsplashBackgroundHttp(req, res, reqUrl)) return;
    if (handleNoticiaSeo(req, res, reqUrl)) return;
    if (handleCategoriaSeo(req, res, reqUrl)) return;

    // Evita resolução relativa quebrada (ex.: dashboard.html → /dashboard.html)
    if (reqUrl.pathname === '/admin') {
        const dest = '/admin/' + (reqUrl.search || '') + (reqUrl.hash || '');
        res.writeHead(302, { Location: dest });
        res.end();
        return;
    }

    let filePath = safePath(reqUrl.pathname);
    if (!filePath) {
        sendForbidden(res);
        return;
    }

    fs.stat(filePath, (err, stat) => {
        if (!err && stat.isDirectory()) {
            const indexPath = path.join(filePath, 'index.html');
            if (isPrivateRelative(path.relative(ROOT, indexPath))) {
                sendForbidden(res);
                return;
            }
            filePath = indexPath;
        } else if (err && reqUrl.pathname.endsWith('/')) {
            const dirPath = safePath(reqUrl.pathname);
            if (!dirPath) {
                sendForbidden(res);
                return;
            }
            filePath = path.join(dirPath, 'index.html');
        }
        serveStatic(req, res, filePath);
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.info('[serve] http://127.0.0.1:' + PORT + '/');
    console.info('[serve] admin: http://127.0.0.1:' + PORT + '/admin/nova-noticia.html');
    console.info('[serve] imagens (Serper): /api/google-images/search?query=tecnologia');
    console.info('[serve] resumo IA (Groq): POST /api/ai-summary');
    console.info('[serve] áudio matéria (Gemini Leda): POST /api/article-audio/generate · GET /api/article-audio');
    console.info('[serve] fundo Unsplash: /api/unsplash/background?collection=…');
    const providers = getGoogleImagesProviders();
    if (providers.serper) {
        console.info('[serve] Serper ativo — busca de imagens disponível');
    } else {
        console.info(
            '[serve] Serper: defina a variável SERPER_API_KEY no arquivo .env (https://serper.dev)'
        );
    }
    if (String(process.env.GROQ_API_KEY || '').trim()) {
        console.info('[serve] Groq ativo — resumo por IA disponível');
    } else {
        console.info(
            '[serve] Groq: defina a variável GROQ_API_KEY no arquivo .env (https://console.groq.com)'
        );
    }
    if (isGeminiTtsConfigured()) {
        console.info('[serve] Gemini ativo — áudio Leda / gemini-3.8-flash-tts (PT-BR) na publicação disponível');
    } else {
        console.info(
            '[serve] Gemini: defina GEMINI_API_KEY (ou GEMINI_API_KEY_1…6) no .env (https://aistudio.google.com/apikey)'
        );
    }
    if (isUnsplashConfigured()) {
        console.info('[serve] Unsplash ativo — fundo do login disponível');
    } else {
        console.info(
            '[serve] Unsplash: defina UNSPLASH_ACCESS_KEY no .env (https://unsplash.com/oauth/applications)'
        );
    }
});
