#!/usr/bin/env node
/**
 * Gera sitemap.xml a partir de MockData (artigos publicados + categorias + páginas estáticas).
 * Uso: node scripts/seo/generate-sitemap.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listPublishedSlugs, SITE_ORIGIN } from './articles-meta.mjs';
import { listCategorySlugs } from './categories-meta.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'sitemap.xml');

const STATIC_PATHS = [
    '/',
    '/sobre.html',
    '/sobre-mary-ai.html',
    '/contato.html',
    '/politica-editorial.html',
    '/politica-privacidade.html',
    '/termos-de-uso.html'
];

function loc(pathname) {
    if (pathname === '/') return `${SITE_ORIGIN}/`;
    return `${SITE_ORIGIN}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

function urlEntry(href) {
    return `  <url>\n    <loc>${href}</loc>\n  </url>`;
}

const urls = [];
for (const p of STATIC_PATHS) urls.push(loc(p));
for (const slug of listCategorySlugs().sort()) {
    urls.push(loc(`/categoria.html?slug=${encodeURIComponent(slug)}`));
}
for (const slug of listPublishedSlugs().sort()) {
    urls.push(loc(`/noticia.html?slug=${encodeURIComponent(slug)}`));
}

const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(urlEntry).join('\n') +
    `\n</urlset>\n`;

fs.writeFileSync(OUT, xml, 'utf8');
console.log(`[sitemap] ${urls.length} URLs → ${path.relative(ROOT, OUT)}`);
