/**
 * Smoke + gates de produção (sem browser).
 * Uso: node scripts/test/smoke.mjs
 * Requer: node scripts/serve.mjs (ou SMOKE_BASE=http://127.0.0.1:8765)
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listPublishedSlugs, getPublishedArticleMeta } from '../seo/articles-meta.mjs';
import { loadMockData } from '../seo/load-mock-data.mjs';
import { requireAdminAuth } from '../admin-auth.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = (process.env.SMOKE_BASE || 'http://127.0.0.1:8765').replace(/\/+$/, '');

async function fetchStatus(pathname, headers = {}) {
    const res = await fetch(`${BASE}${pathname}`, { headers, redirect: 'manual' });
    const body = await res.text();
    return { status: res.status, body, headers: res.headers };
}

/*
 * O gate de /admin bloqueado saiu daqui junto com os redirects 404: o painel
 * está servido em produção até Supabase Auth ser configurado. Reintroduzir a
 * asserção de rota quando os 404 force voltarem ao netlify.toml.
 */
function assertNetlifySecurityHeaders() {
    const toml = fs.readFileSync(path.join(ROOT, 'netlify.toml'), 'utf8');
    assert.match(toml, /Content-Security-Policy\s*=/);
    assert.match(
        toml,
        /font-src[^;"]*https:\/\/cdn\.jsdelivr\.net/,
        'CSP font-src deve liberar o CDN da fonte de icones'
    );
    assert.match(toml, /Strict-Transport-Security/);
    assert.match(toml, /Cache-Control\s*=\s*"public, max-age=31536000, immutable"/);
    assert.match(toml, /\[functions\."categoria-seo"\]/);
    assert.match(
        toml,
        /media-src[^;"]*'self'/,
        'CSP media-src deve permitir o vídeo da orbe do resumo por IA'
    );
}

function assertSitemapCoversPublished() {
    const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
    for (const slug of listPublishedSlugs()) {
        assert.match(
            sitemap,
            new RegExp(`noticia\\.html\\?slug=${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
            `sitemap deve incluir artigo ${slug}`
        );
    }
    assert.match(sitemap, /categoria\.html\?slug=tech/);
    assert.ok(fs.existsSync(path.join(ROOT, 'manifest.webmanifest')), 'manifest.webmanifest deve existir');
}

async function assertSeoSourceOfTruth() {
    const MD = loadMockData();
    const mockSlugs = MD.publishedArticles()
        .map((a) => a.slug)
        .sort();
    const seoSlugs = listPublishedSlugs().sort();
    assert.deepEqual(seoSlugs, mockSlugs, 'SEO slugs devem espelhar MockData published');

    for (const slug of mockSlugs) {
        const meta = getPublishedArticleMeta(slug);
        const article = MD.publishedArticles().find((a) => a.slug === slug);
        assert.ok(meta, `meta SEO ausente para ${slug}`);
        assert.equal(meta.title, article.title);
        assert.ok(meta.canonical.includes(slug));
    }
}

async function assertAuthGates() {
    const prevAllow = process.env.QT_ALLOW_LOCAL_ADMIN_API;
    const prevCtx = process.env.CONTEXT;
    const prevNetlify = process.env.NETLIFY;

    try {
        process.env.QT_ALLOW_LOCAL_ADMIN_API = '0';
        process.env.CONTEXT = 'production';
        process.env.NETLIFY = 'true';
        const denied = await requireAdminAuth({ headers: {} });
        assert.equal(denied.ok, false);
        assert.equal(denied.status, 401);

        const badToken = await requireAdminAuth({
            headers: { authorization: 'Bearer invalid-token' }
        });
        assert.equal(badToken.ok, false);
        assert.equal(badToken.status, 401);

        delete process.env.CONTEXT;
        delete process.env.NETLIFY;
        process.env.QT_ALLOW_LOCAL_ADMIN_API = '1';
        const local = await requireAdminAuth({ headers: {} });
        assert.equal(local.ok, true);
    } finally {
        if (prevAllow == null) delete process.env.QT_ALLOW_LOCAL_ADMIN_API;
        else process.env.QT_ALLOW_LOCAL_ADMIN_API = prevAllow;
        if (prevCtx == null) delete process.env.CONTEXT;
        else process.env.CONTEXT = prevCtx;
        if (prevNetlify == null) delete process.env.NETLIFY;
        else process.env.NETLIFY = prevNetlify;
    }
}

async function assertHttpSmoke() {
    const publicRoutes = [
        '/',
        '/index.html',
        '/busca.html',
        '/categoria.html?slug=tech',
        '/contato.html',
        '/sobre.html',
        '/robots.txt',
        '/sitemap.xml',
        '/favicon.ico'
    ];

    for (const route of publicRoutes) {
        const { status } = await fetchStatus(route);
        assert.equal(status, 200, `${route} deveria ser 200`);
    }

    const article = await fetchStatus(
        '/noticia.html?slug=rock-in-rio-2026-guia-completo'
    );
    assert.equal(article.status, 200);
    assert.match(article.body, /Rock in Rio/);
    assert.match(article.body, /application\/ld\+json/);

    const category = await fetchStatus('/categoria.html?slug=tech');
    assert.equal(category.status, 200);
    assert.match(category.body, /Tech/);
    assert.match(category.body, /application\/ld\+json/);
    assert.match(category.body, /categoria\.html\?slug=tech/);

    const missingCat = await fetchStatus('/categoria.html?slug=slug-inexistente-xyz');
    assert.equal(missingCat.status, 404);

    const missing = await fetchStatus('/noticia.html?slug=slug-inexistente-xyz');
    assert.equal(missing.status, 404);

    const manifest = await fetchStatus('/manifest.webmanifest');
    assert.equal(manifest.status, 200);
    assert.match(manifest.body, /Qualquer Tecla/);

    const adminLocal = await fetchStatus('/admin/index.html');
    assert.equal(adminLocal.status, 200, 'serve local deve manter admin para protótipo');

    // API sem auth headers: em local com QT_ALLOW_LOCAL_ADMIN_API=1 do serve, search
    // ainda exige same-site Origin/Referer.
    const noRef = await fetchStatus('/api/google-images/search?query=test');
    assert.ok([401, 403].includes(noRef.status), `search sem referer: ${noRef.status}`);

    const forged = await fetchStatus('/api/google-images/search?query=test', {
        Referer: 'https://evil.example/',
        Origin: 'https://evil.example'
    });
    assert.ok([401, 403].includes(forged.status), `search referer forjado: ${forged.status}`);

    const okSearch = await fetchStatus('/api/google-images/search?query=tecnologia', {
        Referer: `${BASE}/admin/nova-noticia.html`
    });
    assert.notEqual(okSearch.status, 401);
    assert.notEqual(okSearch.status, 403);

    const secret = await fetchStatus('/.env');
    assert.ok([403, 404].includes(secret.status));
}

async function main() {
    console.log('[test] netlify security headers + CSP…');
    assertNetlifySecurityHeaders();

    console.log('[test] sitemap covers published…');
    assertSitemapCoversPublished();

    console.log('[test] SEO source of truth…');
    await assertSeoSourceOfTruth();

    console.log('[test] admin-auth gates…');
    await assertAuthGates();

    console.log(`[test] HTTP smoke @ ${BASE}…`);
    await assertHttpSmoke();

    console.log('Todos os testes passaram.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
