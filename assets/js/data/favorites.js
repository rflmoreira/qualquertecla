/**
 * FavoritesStore — favoritos do player de áudio por matéria.
 *
 * Simula a persistência local (Mock) e prevê a estrutura remota se necessária.
 */
(function (global) {
    const STORAGE_FAVORITES_GLOBAL = 'qualquer-tecla-favorites-global-v2';
    const STORAGE_FAVORITES_USER = 'qualquer-tecla-favorites-user-v1';

    function readJson(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return fallback;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : fallback;
        } catch (_) {
            return fallback;
        }
    }

    function writeJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (_) {
            return false;
        }
    }

    /** Total inicial estável por slug (100–200 inclusive). */
    function seedTotalForSlug(slug) {
        const key = String(slug || '');
        let hash = 2166136261;
        for (let i = 0; i < key.length; i += 1) {
            hash ^= key.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return 100 + (Math.abs(hash) % 101);
    }

    // Mock functions
    function mockGetTotal(slug) {
        const map = readJson(STORAGE_FAVORITES_GLOBAL, {});
        if (typeof map[slug] !== 'number') {
            map[slug] = seedTotalForSlug(slug);
            writeJson(STORAGE_FAVORITES_GLOBAL, map);
        }
        return map[slug];
    }

    function mockIsFavorited(slug) {
        const map = readJson(STORAGE_FAVORITES_USER, {});
        return !!map[slug];
    }

    function ensureAllArticleTotals() {
        const articles =
            (global.MockData &&
                (typeof global.MockData.publishedArticles === 'function'
                    ? global.MockData.publishedArticles()
                    : global.MockData.articles)) ||
            [];
        if (!Array.isArray(articles) || !articles.length) return;

        const map = readJson(STORAGE_FAVORITES_GLOBAL, {});
        let changed = false;
        articles.forEach((art) => {
            const slug = art && art.slug ? String(art.slug).trim() : '';
            if (!slug) return;
            if (typeof map[slug] !== 'number') {
                map[slug] = seedTotalForSlug(slug);
                changed = true;
            }
        });
        if (changed) writeJson(STORAGE_FAVORITES_GLOBAL, map);
    }

    async function getState(articleSlug) {
        const slug = String(articleSlug || '').trim();
        if (!slug) {
            return {
                articleId: '',
                total: 0,
                isFavorited: false,
                source: 'none'
            };
        }

        // Mock mode (simula delay de rede)
        await new Promise((r) => setTimeout(r, 100));

        ensureAllArticleTotals();
        const total = mockGetTotal(slug);
        const isFavorited = mockIsFavorited(slug);

        return {
            articleId: slug,
            total,
            isFavorited,
            source: 'mock'
        };
    }

    async function toggleFavorite(articleSlug) {
        const slug = String(articleSlug || '').trim();
        if (!slug) throw new Error('Slug inválido');

        // Mock mode
        await new Promise((r) => setTimeout(r, 100));

        let total = mockGetTotal(slug);
        let isFavorited = mockIsFavorited(slug);

        const globals = readJson(STORAGE_FAVORITES_GLOBAL, {});
        const users = readJson(STORAGE_FAVORITES_USER, {});

        if (isFavorited) {
            total = Math.max(0, total - 1);
            isFavorited = false;
        } else {
            total += 1;
            isFavorited = true;
        }

        globals[slug] = total;
        users[slug] = isFavorited;

        writeJson(STORAGE_FAVORITES_GLOBAL, globals);
        writeJson(STORAGE_FAVORITES_USER, users);

        return {
            articleId: slug,
            total,
            isFavorited,
            source: 'mock'
        };
    }

    async function getMetrics() {
        ensureAllArticleTotals();
        const globals = readJson(STORAGE_FAVORITES_GLOBAL, {});

        let total = 0;
        let topArticle = null;
        let topCount = -1;
        const articles = [];

        const allArticles = (global.MockData && global.MockData.articles) || [];

        if (allArticles.length > 0) {
            for (const art of allArticles) {
                const slug = art.slug;
                const count =
                    typeof globals[slug] === 'number' ? globals[slug] : seedTotalForSlug(slug);
                total += count;
                articles.push({ article_slug: slug, total: count });
                if (count > topCount) {
                    topCount = count;
                    topArticle = slug;
                }
            }
        } else {
            for (const [slug, count] of Object.entries(globals)) {
                total += count;
                articles.push({ article_slug: slug, total: count });
                if (count > topCount) {
                    topCount = count;
                    topArticle = slug;
                }
            }
        }

        articles.sort((a, b) => b.total - a.total);
        if (topCount <= 0) topArticle = null;

        return {
            total,
            topArticle,
            articles,
            source: 'mock'
        };
    }

    global.FavoritesStore = {
        getState,
        toggleFavorite,
        getMetrics
    };
})(window);
