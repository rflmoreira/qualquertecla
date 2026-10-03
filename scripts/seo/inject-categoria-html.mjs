/**
 * Injeta metadados SEO no HTML de categoria.html (server-side).
 */
import { getCategoryMeta, normalizeCategorySlug, SITE_NAME, SITE_ORIGIN } from './categories-meta.mjs';

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

function stripSeoTags(html) {
    let out = String(html);
    out = out.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '');
    out = out.replace(/<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*>/gi, '');
    out = out.replace(/<meta\b[^>]*\bname\s*=\s*["']robots["'][^>]*>/gi, '');
    out = out.replace(/<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*>/gi, '');
    out = out.replace(/<meta\b[^>]*\bproperty\s*=\s*["']og:[^"']*["'][^>]*>/gi, '');
    out = out.replace(/<meta\b[^>]*\bname\s*=\s*["']twitter:[^"']*["'][^>]*>/gi, '');
    out = out.replace(
        /<script\b[^>]*\bid\s*=\s*["']category-jsonld["'][^>]*>[\s\S]*?<\/script>/gi,
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

function buildFoundHead(cat) {
    const pageTitle = `${cat.name} | ${SITE_NAME}`;
    const desc = cat.description || '';
    const card = cat.image ? 'summary_large_image' : 'summary';

    let block = '';
    block += `<title>${escapeHtml(pageTitle)}</title>\n`;
    if (desc) block += metaName('description', desc);
    block += `<link rel="canonical" href="${escapeAttr(cat.canonical)}">\n`;
    block += metaProp('og:type', 'website');
    block += metaProp('og:title', pageTitle);
    if (desc) block += metaProp('og:description', desc);
    block += metaProp('og:url', cat.canonical);
    block += metaProp('og:site_name', SITE_NAME);
    if (cat.image) block += metaProp('og:image', cat.image);

    block += metaName('twitter:card', card);
    block += metaName('twitter:title', pageTitle);
    if (desc) block += metaName('twitter:description', desc);
    if (cat.image) block += metaName('twitter:image', cat.image);

    const crumbItems = [{ '@type': 'ListItem', position: 1, name: 'Início', item: `${SITE_ORIGIN}/` }];
    let pos = 2;
    if (cat.parentSlug && cat.parentName) {
        crumbItems.push({
            '@type': 'ListItem',
            position: pos++,
            name: cat.parentName,
            item: `${SITE_ORIGIN}/categoria.html?slug=${encodeURIComponent(cat.parentSlug)}`
        });
    }
    crumbItems.push({
        '@type': 'ListItem',
        position: pos,
        name: cat.name,
        item: cat.canonical
    });

    const ld = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'CollectionPage',
                name: cat.name,
                description: desc || undefined,
                url: cat.canonical,
                isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: `${SITE_ORIGIN}/` }
            },
            { '@type': 'BreadcrumbList', itemListElement: crumbItems }
        ]
    };
    block += `<script type="application/ld+json" id="category-jsonld">${JSON.stringify(ld)}</script>\n`;
    return block;
}

function buildMissingHead(opts) {
    const title = opts.title || `Editoria | ${SITE_NAME}`;
    const desc =
        opts.description ||
        'Editorias do Qualquer Tecla: tecnologia, IA, games, ciência, cultura geek, cultura digital e música.';
    const canonical = opts.canonical || `${SITE_ORIGIN}/categoria.html`;
    let block = '';
    block += `<title>${escapeHtml(title)}</title>\n`;
    block += metaName('description', desc);
    if (opts.noindex) block += metaName('robots', 'noindex,follow');
    block += `<link rel="canonical" href="${escapeAttr(canonical)}">\n`;
    block += metaProp('og:type', 'website');
    block += metaProp('og:title', title);
    block += metaProp('og:description', desc);
    block += metaProp('og:url', canonical);
    block += metaProp('og:site_name', SITE_NAME);
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
 * @returns {{ html: string, status: number, cacheControl: string, found: boolean }}
 */
export function renderCategoriaHtml(htmlTemplate, rawSlug) {
    const base = stripSeoTags(htmlTemplate);
    const hasSlugParam = rawSlug != null && String(rawSlug).trim() !== '';

    if (!hasSlugParam) {
        const head = buildMissingHead({
            title: `Editoria | ${SITE_NAME}`,
            canonical: `${SITE_ORIGIN}/categoria.html`
        });
        return {
            html: insertBeforeHeadClose(base, head),
            status: 200,
            cacheControl: 'public, max-age=120',
            found: false
        };
    }

    const normalized = normalizeCategorySlug(rawSlug);
    if (!normalized) {
        const head = buildMissingHead({
            title: `Editoria não encontrada | ${SITE_NAME}`,
            canonical: `${SITE_ORIGIN}/categoria.html`,
            noindex: true
        });
        return {
            html: insertBeforeHeadClose(base, head),
            status: 404,
            cacheControl: 'public, max-age=60',
            found: false
        };
    }

    const cat = getCategoryMeta(normalized);
    if (!cat) {
        const head = buildMissingHead({
            title: `Editoria não encontrada | ${SITE_NAME}`,
            canonical: `${SITE_ORIGIN}/categoria.html?slug=${encodeURIComponent(normalized)}`,
            noindex: true
        });
        return {
            html: insertBeforeHeadClose(base, head),
            status: 404,
            cacheControl: 'public, max-age=60',
            found: false
        };
    }

    return {
        html: insertBeforeHeadClose(base, buildFoundHead(cat)),
        status: 200,
        cacheControl: 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400',
        found: true
    };
}
