/**
 * Metadados SEO de editorias (categoria.html?slug=…).
 * Fonte: MockData.categories via load-mock-data.mjs.
 */
import { loadMockData } from './load-mock-data.mjs';
import { SITE_NAME, SITE_ORIGIN, absoluteAssetUrl, normalizeArticleSlug } from './articles-meta.mjs';

/** Reusa regras de slug de artigo (mesmo alfabeto). */
export function normalizeCategorySlug(raw) {
    return normalizeArticleSlug(raw);
}

/**
 * @returns {null | {
 *   slug: string,
 *   name: string,
 *   description: string,
 *   canonical: string,
 *   parentSlug: string|null,
 *   parentName: string|null,
 *   image: string
 * }}
 */
export function getCategoryMeta(rawSlug) {
    const slug = normalizeCategorySlug(rawSlug);
    if (!slug) return null;

    const MD = loadMockData();
    const cat = (MD.categories || []).find((c) => c.slug === slug);
    if (!cat) return null;

    let parentName = null;
    if (cat.parent) {
        const parent = (MD.categories || []).find((c) => c.slug === cat.parent);
        parentName = parent ? parent.name : cat.parent;
    }

    const description = String(cat.description || `Editoria ${cat.name} no ${SITE_NAME}.`).trim();
    const published = typeof MD.publishedArticles === 'function' ? MD.publishedArticles() : [];
    const childSlugs = new Set([slug]);
    if (slug === 'games' || slug === 'geek') {
        (MD.categories || []).forEach((c) => {
            if (c.parent === slug) childSlugs.add(c.slug);
        });
    }
    const cover = published.find((a) => a.categories && childSlugs.has(a.categories.slug) && a.featured_image);
    const image = cover?.featured_image ? absoluteAssetUrl(cover.featured_image) : '';

    return {
        slug: cat.slug,
        name: cat.name,
        description,
        canonical: `${SITE_ORIGIN}/categoria.html?slug=${encodeURIComponent(cat.slug)}`,
        parentSlug: cat.parent || null,
        parentName,
        image
    };
}

export function listCategorySlugs() {
    const MD = loadMockData();
    return (MD.categories || []).map((c) => c.slug).filter(Boolean);
}

export { SITE_NAME, SITE_ORIGIN };
