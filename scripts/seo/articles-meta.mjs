/**
 * Metadados SEO das notícias publicadas (server-side).
 *
 * Fonte de verdade: assets/js/data/mock-data.js (via load-mock-data.mjs).
 * Quando o CMS/Supabase existir, trocar loadPublishedRows() por leitura remota —
 * getPublishedArticleMeta permanece o contrato estável.
 */
import { loadMockData } from './load-mock-data.mjs';

const SITE_ORIGIN = 'https://qualquertecla.com.br';
const SITE_NAME = 'Qualquer Tecla';

const MAX_SLUG_LEN = 180;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

/**
 * Normaliza e valida slug (sem path traversal).
 * @returns {string|null} slug limpo ou null se inválido
 */
export function normalizeArticleSlug(raw) {
    if (raw == null) return null;
    let s = String(raw).trim();
    try {
        s = decodeURIComponent(s);
    } catch (_) {
        return null;
    }
    s = s.trim();
    if (!s || s.length > MAX_SLUG_LEN) return null;
    if (s.includes('\0') || s.includes('/') || s.includes('\\') || s.includes('..')) return null;
    if (!SLUG_RE.test(s)) return null;
    return s.toLowerCase();
}

export function absoluteAssetUrl(rel) {
    if (!rel) return '';
    const t = String(rel).trim();
    if (/^https?:\/\//i.test(t)) return t;
    return `${SITE_ORIGIN}/${t.replace(/^\//, '')}`;
}

function loadPublishedRows() {
    const MD = loadMockData();
    return MD.publishedArticles().map((a) => {
        const cat = a.categories || {};
        const author = a.authors || {};
        return {
            slug: a.slug,
            title: a.title,
            excerpt: a.excerpt || a.subtitle || '',
            featured_image: a.featured_image || '',
            image_caption: a.image_caption || '',
            published_at: a.published_at || '',
            updated_at: a.updated_at || a.published_at || '',
            category_slug: cat.slug || a.category_slug || '',
            category_name: cat.name || '',
            category_parent: cat.parent || null,
            author_name: author.name || '',
            status: a.status
        };
    });
}

/**
 * @returns {null | {
 *   slug: string,
 *   title: string,
 *   description: string,
 *   canonical: string,
 *   image: string,
 *   imageAlt: string,
 *   publishedAt: string,
 *   modifiedAt: string,
 *   authorName: string,
 *   section: string,
 *   categorySlug: string,
 *   parentSlug: string|null,
 *   parentName: string|null
 * }}
 */
export function getPublishedArticleMeta(rawSlug) {
    const slug = normalizeArticleSlug(rawSlug);
    if (!slug) return null;

    const row = loadPublishedRows().find((a) => a.slug === slug && a.status === 'published');
    if (!row) return null;

    let parentName = null;
    if (row.category_parent) {
        try {
            const MD = loadMockData();
            const parent = (MD.categories || []).find((c) => c.slug === row.category_parent);
            parentName = parent ? parent.name : row.category_parent;
        } catch (_) {
            parentName = row.category_parent;
        }
    }

    const description = String(row.excerpt || '').trim();
    const image = row.featured_image ? absoluteAssetUrl(row.featured_image) : '';
    const imageAlt = String(row.image_caption || row.title || '').trim();
    const canonical = `${SITE_ORIGIN}/noticia.html?slug=${encodeURIComponent(row.slug)}`;

    return {
        slug: row.slug,
        title: row.title,
        description,
        canonical,
        image,
        imageAlt,
        publishedAt: row.published_at || '',
        modifiedAt: row.updated_at || row.published_at || '',
        authorName: row.author_name || '',
        section: row.category_name || '',
        categorySlug: row.category_slug,
        parentSlug: row.category_parent || null,
        parentName
    };
}

/** Lista de slugs published — útil para testes/sitemap checks. */
export function listPublishedSlugs() {
    return loadPublishedRows()
        .filter((a) => a.status === 'published')
        .map((a) => a.slug);
}

export { SITE_ORIGIN, SITE_NAME };
