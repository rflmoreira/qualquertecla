/**
 * Injeta/substitui metadados SEO no HTML de noticia.html (server-side).
 * O JS do cliente continua podendo revalidar as mesmas tags via setMeta.
 */
import {
    getPublishedArticleMeta,
    normalizeArticleSlug,
    SITE_NAME,
    SITE_ORIGIN
} from './articles-meta.mjs';

function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
}

/** Remove tags SEO que serão reinseridas (evita duplicatas com o JS). */
function stripSeoTags(html) {
    let out = String(html);
    out = out.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '');
    out = out.replace(/<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*>/gi, '');
    out = out.replace(/<meta\b[^>]*\bname\s*=\s*["']robots["'][^>]*>/gi, '');
    out = out.replace(/<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/gi, '');
    out = out.replace(/<meta\b[^>]*\bproperty\s*=\s*["']og:[^"']*["'][^>]*>/gi, '');
    out = out.replace(/<meta\b[^>]*\bname\s*=\s*["']twitter:[^"']*["'][^>]*>/gi, '');
    out = out.replace(/<meta\b[^>]*\bproperty\s*=\s*["']article:[^"']*["'][^>]*>/gi, '');
    out = out.replace(
        /<script\b[^>]*\bid\s*=\s*["']article-jsonld["'][^>]*>[\s\S]*?<\/script>/gi,
        ''
    );
    out = out.replace(
        /<script\b[^>]*\btype\s*=\s*["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,
        ''
    );
    return out;
}

function metaName(name, content) {
    if (!content) return '';
    return `<meta name="${escapeAttr(name)}" content="${escapeAttr(content)}">\n`;
}

function metaProp(prop, content) {
    if (!content) return '';
    return `<meta property="${escapeAttr(prop)}" content="${escapeAttr(content)}">\n`;
}

function buildFoundHead(article) {
    const pageTitle = `${article.title} | ${SITE_NAME}`;
    const desc = article.description || '';
    const card = article.image ? 'summary_large_image' : 'summary';

    let block = '';
    block += `<title>${escapeHtml(pageTitle)}</title>\n`;
    if (desc) block += metaName('description', desc);
    block += `<link rel="canonical" href="${escapeAttr(article.canonical)}">\n`;
    block += metaProp('og:type', 'article');
    block += metaProp('og:title', article.title);
    if (desc) block += metaProp('og:description', desc);
    block += metaProp('og:url', article.canonical);
    block += metaProp('og:site_name', SITE_NAME);
    if (article.image) {
        block += metaProp('og:image', article.image);
        if (article.imageAlt) block += metaProp('og:image:alt', article.imageAlt);
    }
    if (article.publishedAt) block += metaProp('article:published_time', article.publishedAt);
    if (article.modifiedAt) block += metaProp('article:modified_time', article.modifiedAt);
    if (article.authorName) block += metaProp('article:author', article.authorName);
    if (article.section) block += metaProp('article:section', article.section);

    block += metaName('twitter:card', card);
    block += metaName('twitter:title', article.title);
    if (desc) block += metaName('twitter:description', desc);
    if (article.image) {
        block += metaName('twitter:image', article.image);
        if (article.imageAlt) block += metaName('twitter:image:alt', article.imageAlt);
    }

    const ldArticle = {
        '@type': 'NewsArticle',
        headline: article.title,
        description: desc || undefined,
        image: article.image ? [article.image] : undefined,
        datePublished: article.publishedAt || undefined,
        dateModified: article.modifiedAt || article.publishedAt || undefined,
        author: article.authorName
            ? { '@type': 'Person', name: article.authorName }
            : undefined,
        publisher: {
            '@type': 'Organization',
            name: SITE_NAME,
            url: `${SITE_ORIGIN}/`,
            logo: {
                '@type': 'ImageObject',
                url: `${SITE_ORIGIN}/assets/img/brand/qt-keycap-fallback.png`
            }
        },
        mainEntityOfPage: article.canonical,
        articleSection: article.section || undefined
    };

    const crumbItems = [{ '@type': 'ListItem', position: 1, name: 'Início', item: `${SITE_ORIGIN}/` }];
    let pos = 2;
    if (article.parentSlug && article.parentName) {
        crumbItems.push({
            '@type': 'ListItem',
            position: pos++,
            name: article.parentName,
            item: `${SITE_ORIGIN}/categoria.html?slug=${encodeURIComponent(article.parentSlug)}`
        });
    }
    if (article.categorySlug && article.section) {
        crumbItems.push({
            '@type': 'ListItem',
            position: pos++,
            name: article.section,
            item: `${SITE_ORIGIN}/categoria.html?slug=${encodeURIComponent(article.categorySlug)}`
        });
    }
    crumbItems.push({
        '@type': 'ListItem',
        position: pos,
        name: article.title,
        item: article.canonical
    });

    const ld = {
        '@context': 'https://schema.org',
        '@graph': [ldArticle, { '@type': 'BreadcrumbList', itemListElement: crumbItems }]
    };

    block +=
        `<script type="application/ld+json" id="article-jsonld">${JSON.stringify(ld)}</script>\n`;

    return block;
}

function buildMissingHead(opts) {
    const title = opts.title || `Artigo não encontrado | ${SITE_NAME}`;
    const desc = opts.description || 'O conteúdo pode ter sido removido ou o link está incorreto.';
    const canonical = opts.canonical || `${SITE_ORIGIN}/noticia.html`;
    let block = '';
    block += `<title>${escapeHtml(title)}</title>\n`;
    block += metaName('description', desc);
    block += metaName('robots', 'noindex,follow');
    block += `<link rel="canonical" href="${escapeAttr(canonical)}">\n`;
    block += metaProp('og:type', 'website');
    block += metaProp('og:title', title);
    block += metaProp('og:description', desc);
    block += metaProp('og:url', canonical);
    block += metaName('twitter:card', 'summary');
    block += metaName('twitter:title', title);
    block += metaName('twitter:description', desc);
    return block;
}

function insertBeforeHeadClose(html, headBlock) {
    if (/<\/head>/i.test(html)) {
        return html.replace(/<\/head>/i, `${headBlock}</head>`);
    }
    return headBlock + html;
}

/**
 * @param {string} htmlTemplate conteúdo de noticia.html
 * @param {string|null|undefined} rawSlug query slug
 * @returns {{ html: string, status: number, cacheControl: string, found: boolean }}
 */
export function renderNoticiaHtml(htmlTemplate, rawSlug) {
    const base = stripSeoTags(htmlTemplate);
    const hasSlugParam = rawSlug != null && String(rawSlug).trim() !== '';

    if (!hasSlugParam) {
        const head = buildMissingHead({
            title: `Matéria | ${SITE_NAME}`,
            description: 'Leia esta matéria no Qualquer Tecla.',
            canonical: `${SITE_ORIGIN}/noticia.html`
        });
        // Sem slug: página shell (JS pede slug). noindex — não é artigo indexável.
        return {
            html: insertBeforeHeadClose(base, head),
            status: 200,
            cacheControl: 'public, max-age=120',
            found: false
        };
    }

    const normalized = normalizeArticleSlug(rawSlug);
    if (!normalized) {
        const head = buildMissingHead({
            title: `Artigo não encontrado | ${SITE_NAME}`,
            canonical: `${SITE_ORIGIN}/noticia.html`
        });
        return {
            html: insertBeforeHeadClose(base, head),
            status: 404,
            cacheControl: 'public, max-age=60',
            found: false
        };
    }

    const article = getPublishedArticleMeta(normalized);
    if (!article) {
        const head = buildMissingHead({
            title: `Artigo não encontrado | ${SITE_NAME}`,
            canonical: `${SITE_ORIGIN}/noticia.html?slug=${encodeURIComponent(normalized)}`
        });
        return {
            html: insertBeforeHeadClose(base, head),
            status: 404,
            cacheControl: 'public, max-age=60',
            found: false
        };
    }

    const head = buildFoundHead(article);
    return {
        html: insertBeforeHeadClose(base, head),
        status: 200,
        cacheControl: 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400',
        found: true
    };
}
