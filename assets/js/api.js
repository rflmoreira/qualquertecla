/**
 * Camada de acesso a dados (Data Access Layer).
 *
 * - Hoje: MockData (sempre, enquanto Supabase não estiver configurado).
 * - Futuro: trocar apenas as funções *FromRemote* / isRemoteEnabled.
 * - Nunca mistura mock com dados remotos na mesma lista.
 */
(function (global) {
    function isRemoteEnabled() {
        return !!(global.supabaseClient && global.SUPABASE_READY);
    }

    function withAssetPaths(article) {
        if (!article || !global.MockData) return article;
        const fallback = global.MockData.DEFAULT_AVATAR;
        const authors = article.authors
            ? {
                  ...article.authors,
                  avatar: global.MockData.assetPath(
                      article.authors.avatar || article.authors.avatar_url || fallback
                  ),
                  bio: String(article.authors.bio || '').trim() || global.MockData.DEFAULT_AUTHOR_BIO,
                  socialLinks:
                      typeof global.MockData.socialLinksFromAuthorPayload === 'function'
                          ? global.MockData.socialLinksFromAuthorPayload(article.authors)
                          : Array.isArray(article.authors.socialLinks)
                            ? article.authors.socialLinks
                            : Array.isArray(article.authors.social_links)
                              ? article.authors.social_links
                              : []
              }
            : article.authors;
            
        let tags = article.tags || [];
        if (Array.isArray(tags) && tags.length > 0 && tags[0] && typeof tags[0] === 'object') {
            tags = tags.map(t => t.tags ? t.tags.name : t.name).filter(Boolean);
        }

        let categories = article.categories;
        if (categories && typeof categories === 'object') {
            categories = {
                name: categories.name,
                slug: categories.slug,
                parent: categories.parent_slug || categories.parent || null
            };
        }

        return {
            ...article,
            tags,
            categories,
            featured_image: global.MockData.assetPath(article.featured_image),
            audio_summary_url: article.audio_summary_url
                ? global.MockData.assetPath(article.audio_summary_url)
                : article.audio_summary_url,
            audio_full_url: article.audio_full_url
                ? global.MockData.assetPath(article.audio_full_url)
                : article.audio_full_url,
            authors
        };
    }

    async function fromMockLatest(limit) {
        const list = global.MockData.publishedArticles()
            .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
            .slice(0, limit)
            .map(withAssetPaths);
        return list;
    }

    async function fromMockHero() {
        const published = global.MockData.publishedArticles().sort((a, b) => {
            const byDate = new Date(b.published_at) - new Date(a.published_at);
            if (byDate !== 0) return byDate;
            // Empate de timestamp no seed: id maior = matéria mais recente
            return Number(b.id) - Number(a.id) || String(b.slug).localeCompare(String(a.slug));
        });
        return withAssetPaths(published[0] || null);
    }

    async function fromMockByCategory(slug, limit) {
        const published = global.MockData.publishedArticles();
        let filtered;

        if (slug === 'geek' || slug === 'games') {
            const children = global.MockData.categories
                .filter((c) => c.parent === slug)
                .map((c) => c.slug);
            children.push(slug);
            filtered = published.filter((a) => children.includes(a.categories.slug));
        } else {
            filtered = published.filter((a) => a.categories.slug === slug);
        }

        return filtered
            .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
            .slice(0, limit)
            .map(withAssetPaths);
    }

    async function fromMockMostRead(limit) {
        return global.MockData.publishedArticles()
            .sort((a, b) => (b.views || 0) - (a.views || 0))
            .slice(0, limit)
            .map(withAssetPaths);
    }

    function normalizeTagToken(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    function categoryParentSlug(slug) {
        if (!slug || !global.MockData || !Array.isArray(global.MockData.categories)) {
            return null;
        }
        const cat = global.MockData.categories.find((c) => c.slug === slug);
        return cat && cat.parent ? String(cat.parent) : null;
    }

    function siblingSlugs(parentSlug) {
        if (!parentSlug || !global.MockData) return [];
        return global.MockData.categories
            .filter((c) => c.parent === parentSlug)
            .map((c) => c.slug);
    }

    /**
     * Artigos relacionados por afinidade editorial (não só “mais recentes”).
     * Prioridade: mesma subeditoria → mesma editoria-pai → tags → hub → popularidade/recência.
     */
    async function fromMockRelated(article, limit) {
        const max = Math.max(1, Math.min(Number(limit) || 3, 6));
        const selfSlug = String((article && article.slug) || '').trim();
        if (!selfSlug || !global.MockData) return [];

        let prevSlug = '';
        if (typeof window !== 'undefined' && window.document && document.referrer) {
            try {
                const refUrl = new URL(document.referrer);
                if (refUrl.origin === window.location.origin) {
                    if (refUrl.pathname.includes('noticia.html')) {
                        prevSlug = refUrl.searchParams.get('slug') || '';
                    } else {
                        const match = refUrl.pathname.match(/\/noticias?\/([^\/]+)/);
                        if (match && match[1]) {
                            prevSlug = match[1].replace(/\.html$/, '');
                        }
                    }
                }
            } catch (err) {}
        }

        const published = global.MockData.publishedArticles().filter(
            (a) => a && a.slug && a.slug !== selfSlug
        );
        if (!published.length) return [];

        const catSlug = String(
            (article.categories && article.categories.slug) || article.category_slug || ''
        ).trim();
        const parentSlug =
            (article.categories && article.categories.parent) || categoryParentSlug(catSlug);
        const selfTags = new Set(
            (article.tags || []).map(normalizeTagToken).filter(Boolean)
        );
        const siblings = parentSlug ? siblingSlugs(parentSlug) : [];

        const scored = published.map((a) => {
            const aSlug = a.categories && a.categories.slug;
            const aParent = (a.categories && a.categories.parent) || categoryParentSlug(aSlug);
            let score = 0;

            if (catSlug && aSlug === catSlug) score += 100;

            if (parentSlug) {
                if (aParent === parentSlug || siblings.includes(aSlug) || aSlug === parentSlug) {
                    score += 40;
                }
            }

            const aTags = (a.tags || []).map(normalizeTagToken).filter(Boolean);
            const sameFamily =
                (catSlug && aSlug === catSlug) ||
                (parentSlug && (aParent === parentSlug || aSlug === parentSlug)) ||
                (catSlug && aParent === catSlug);

            let tagHits = 0;
            if (sameFamily) {
                aTags.forEach((t) => {
                    if (selfTags.has(t)) tagHits += 1;
                });
            }
            score += tagHits * 18;

            if (catSlug === 'games' || parentSlug === 'games') {
                if (aSlug === 'games' || siblings.includes(aSlug) || aParent === 'games') {
                    score += 12;
                }
            }
            if (catSlug === 'geek' || parentSlug === 'geek') {
                if (aSlug === 'geek' || siblings.includes(aSlug) || aParent === 'geek') {
                    score += 12;
                }
            }

            /* Popularidade / recência como desempate fraco */
            score += Math.min(8, Math.log10((a.views || 0) + 1));

            return { article: a, score, publishedAt: new Date(a.published_at || 0).getTime() };
        });

        scored.sort((a, b) => {
            if (prevSlug) {
                const aIsPrev = a.article.slug === prevSlug;
                const bIsPrev = b.article.slug === prevSlug;
                if (aIsPrev && !bIsPrev) return 1;
                if (!aIsPrev && bIsPrev) return -1;
            }
            if (b.score !== a.score) return b.score - a.score;
            return b.publishedAt - a.publishedAt;
        });

        /* Só recomenda com afinidade editorial real — melhor 1–2 bons do que completar com aleatórios. */
        const picks = scored.filter((row) => row.score >= 12).slice(0, max);
        return picks.map((row) => withAssetPaths(row.article));
    }

    async function fromMockBySlug(slug) {
        // Inclui rascunhos para preview no admin (mock). Remoto + RLS filtrará no futuro.
        const raw = global.MockData.articles.find((a) => a.slug === slug);
        return raw ? withAssetPaths(global.MockData.resolveArticle(raw)) : null;
    }

    async function fromMockSearch(term, limit) {
        const normalize = (value) =>
            String(value || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/[''`´"]/g, '')
                .replace(/[^a-z0-9]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

        const tokens = normalize(term).split(' ').filter(Boolean);
        if (!tokens.length) return [];

        return global.MockData.publishedArticles()
            .filter((a) => {
                const hay = normalize(
                    [
                        a.title,
                        a.subtitle,
                        a.excerpt,
                        a.tags && a.tags.join(' '),
                        a.categories && a.categories.name,
                        a.categories && a.categories.slug
                    ]
                        .filter(Boolean)
                        .join(' ')
                );
                const words = hay.split(' ').filter(Boolean);
                return tokens.every((tok) => {
                    // Tokens curtos (ex.: "ia") só batem palavra inteira — evita falso positivo em "bilheteria"
                    if (tok.length <= 2) return words.includes(tok);
                    return hay.includes(tok);
                });
            })
            .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
            .slice(0, limit)
            .map(withAssetPaths);
    }

    async function fromMockCategory(slug) {
        if (global.MockData && typeof global.MockData.getCategoryBySlug === 'function') {
            return global.MockData.getCategoryBySlug(slug);
        }
        if (!slug || !global.MockData || !Array.isArray(global.MockData.categories)) {
            return null;
        }
        return global.MockData.categories.find((c) => c.slug === slug) || null;
    }

    async function fromMockAllArticles() {
        if (!global.MockData || !Array.isArray(global.MockData.articles)) return [];
        return global.MockData.articles.map(a => withAssetPaths(global.MockData.resolveArticle(a)));
    }

    async function fromMockAllAuthors() {
        if (!global.MockData || !Array.isArray(global.MockData.authors)) return [];
        return global.MockData.authors.slice();
    }

    async function fromMockUpsertCategory(payload) {
        if (!global.MockData || typeof global.MockData.upsertCategory !== 'function') throw new Error('MockData indisponível');
        return global.MockData.upsertCategory(payload);
    }

    async function fromMockDeleteCategory(slug) {
        if (!global.MockData || typeof global.MockData.deleteCategory !== 'function') throw new Error('MockData indisponível');
        return global.MockData.deleteCategory(slug);
    }

    async function fromMockUpsertAuthor(payload) {
        if (!global.MockData || typeof global.MockData.upsertAuthor !== 'function') throw new Error('MockData indisponível');
        return global.MockData.upsertAuthor(payload);
    }

    // --- Hooks remotos (stub para integração futura) ---
    function normalizeRemoteArticle(data) {
        if (!data) return data;
        const res = { ...data };
        if (Array.isArray(res.tags)) {
            res.tags = res.tags.map((t) => t.name || t);
        }
        if (Array.isArray(res.categories)) {
            res.categories = res.categories[0] || null;
        }
        if (Array.isArray(res.authors)) {
            res.authors = res.authors[0] || null;
        }
        if (res.authors && res.authors.avatar_url && !res.authors.avatar) {
            res.authors.avatar = res.authors.avatar_url;
        }
        return withAssetPaths(res);
    }

    async function fromRemoteLatest(limit) {
        const { data, error } = await global.supabaseClient
            .from('articles')
            .select(`
                id, title, excerpt, slug, featured_image, published_at, reading_time, views,
                categories (name, slug, parent_slug),
                authors (name, slug, avatar_url, bio, social_links, twitter_handle),
                tags(name)
            `)
            .eq('status', 'published')
            .lte('published_at', new Date().toISOString())
            .order('published_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return (data || []).map(normalizeRemoteArticle);
    }

    async function fromRemoteHero() {
        const { data, error } = await global.supabaseClient
            .from('articles')
            .select(`
                id, title, excerpt, slug, featured_image, published_at, reading_time,
                categories (name, slug, parent_slug),
                authors (name, slug, avatar_url, bio, social_links, twitter_handle),
                tags(name)
            `)
            .eq('status', 'published')
            .lte('published_at', new Date().toISOString())
            .order('published_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;
        return normalizeRemoteArticle(data);
    }

    async function fromRemoteByCategory(slug, limit) {
        const { data, error } = await global.supabaseClient
            .from('articles')
            .select(`
                id, title, excerpt, slug, featured_image, published_at, reading_time,
                categories!inner (name, slug, parent_slug),
                authors (name, slug, avatar_url, bio, social_links, twitter_handle),
                tags(name)
            `)
            .eq('status', 'published')
            .eq('categories.slug', slug)
            .lte('published_at', new Date().toISOString())
            .order('published_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return (data || []).map(normalizeRemoteArticle);
    }

    async function fromRemoteMostRead(limit) {
        const { data, error } = await global.supabaseClient
            .from('articles')
            .select(`
                id, title, slug, views,
                categories (name, slug, parent_slug)
            `)
            .eq('status', 'published')
            .lte('published_at', new Date().toISOString())
            .order('views', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return (data || []).map(normalizeRemoteArticle);
    }

    async function fromRemoteBySlug(slug) {
        const { data, error } = await global.supabaseClient
            .from('articles')
            .select(`
                id, title, subtitle, content, excerpt, slug, featured_image, image_caption,
                published_at, updated_at, reading_time, source_name, source_url,
                seo_title, seo_description, ai_summary,
                audio_summary_url, audio_full_url, audio_summary_hash, audio_full_hash, audio_generated_at, audio_status,
                categories (name, slug, parent_slug),
                authors (name, slug, avatar_url, bio, social_links, twitter_handle),
                tags(name)
            `)
            .eq('status', 'published')
            .eq('slug', slug)
            .maybeSingle();

        if (error) throw error;
        return normalizeRemoteArticle(data);
    }

    async function fromRemoteSearch(term, limit) {
        const { data, error } = await global.supabaseClient
            .from('articles')
            .select(`
                id, title, excerpt, slug, featured_image, published_at, reading_time,
                categories (name, slug, parent_slug),
                authors (name, slug, avatar_url, bio, social_links, twitter_handle),
                tags(name)
            `)
            .eq('status', 'published')
            .or(`title.ilike.%${term}%,excerpt.ilike.%${term}%`)
            .lte('published_at', new Date().toISOString())
            .order('published_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return (data || []).map(normalizeRemoteArticle);
    }

    async function fromRemoteAllArticles() {
        const { data, error } = await global.supabaseClient
            .from('articles')
            .select(`
                id, title, excerpt, slug, featured_image, published_at, reading_time, views, status, draft_revision, ai_summary,
                audio_summary_url, audio_full_url, audio_summary_hash, audio_full_hash,
                audio_generated_at, audio_status,
                categories (name, slug, parent_slug),
                authors (name, slug, avatar_url, bio, social_links, twitter_handle),
                tags(name)
            `)
            .order('updated_at', { ascending: false });

        if (error) throw error;
        return (data || []).map(normalizeRemoteArticle);
    }

    async function fromRemoteAllCategories() {
        const { data, error } = await global.supabaseClient.from('categories').select('name, slug, description, parent_slug').order('name');
        if (error) {
            console.error('[API] Erro ao buscar categorias do Supabase:', error);
            throw error;
        }
        return (data || []).map(c => ({
            ...c,
            parent: c.parent_slug
        }));
    }

    async function fromRemoteAllAuthors() {
        const { data, error } = await global.supabaseClient.from('authors').select('*').order('name');
        if (error) {
            console.error('[API] Erro ao buscar autores do Supabase:', error);
            throw error;
        }
        return data;
    }

    async function fromRemoteUpsertCategory(payload) {
        const row = {
            name: payload.name,
            slug: payload.slug,
            description: payload.description,
            parent_slug: payload.parent || payload.parent_slug || null
        };
        const { data, error } = await global.supabaseClient
            .from('categories')
            .upsert(row, { onConflict: 'slug' })
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    async function fromRemoteDeleteCategory(slug) {
        const { error } = await global.supabaseClient.from('categories').delete().eq('slug', slug);
        if (error) throw error;
        return true;
    }

    async function fromRemoteUpsertAuthor(payload) {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.id);
        const row = {
            name: payload.name,
            slug: payload.slug,
            avatar_url: payload.avatar || payload.avatar_url || null,
            bio: payload.bio,
            social_links: payload.socialLinks || payload.social_links || []
        };
        if (isUUID) row.id = payload.id;
        
        const { data, error } = await global.supabaseClient
            .from('authors')
            .upsert(row, { onConflict: isUUID ? 'id' : 'slug' })
            .select()
            .single();
        if (error) throw error;
        return data;
    }

    /**
     * Executa remote se habilitado; caso contrário (ou em erro), usa mock puro.
     * Nunca concatena as duas fontes.
     */
    async function withProvider(remoteFn, mockFn) {
        if (isRemoteEnabled()) {
            try {
                const data = await remoteFn();
                if (data != null && !(Array.isArray(data) && data.length === 0 && arguments[2] === 'preferMockIfEmpty')) {
                    return data;
                }
                // Lista vazia remota: retorna vazia (não injeta mock)
                if (Array.isArray(data)) return data;
                if (data) return data;
            } catch (err) {
                console.error('[API] Falha remota, usando mock:', err);
            }
        }
        return mockFn();
    }

    async function fromRemoteUpsertArticle(payload) {
        let category_id = null;
        if (payload.category) {
            const catSlug = typeof payload.category === 'object' ? payload.category.slug : payload.category;
            const { data: catData } = await global.supabaseClient.from('categories').select('id').eq('slug', catSlug).maybeSingle();
            if (catData) category_id = catData.id;
        }

        let author_id = null;
        if (payload.author || payload.authors) {
            const authObj = payload.author || payload.authors;
            const authSlug = typeof authObj === 'string' ? authObj : authObj.slug;
            const { data: authData } = await global.supabaseClient.from('authors').select('id').eq('slug', authSlug).maybeSingle();
            if (authData) author_id = authData.id;
        }

        const articleRow = {
            title: payload.title,
            subtitle: payload.subtitle,
            slug: payload.slug,
            content: payload.content,
            excerpt: payload.excerpt,
            category_id,
            author_id,
            featured_image: payload.featured_image,
            image_caption: payload.image_caption,
            source_name: payload.source_name,
            source_url: payload.source_url,
            status: payload.status,
            featured: payload.featured,
            published_at: payload.published_at,
            seo_title: payload.seo_title,
            seo_description: payload.seo_description,
            ai_summary: payload.ai_summary || null,
            audio_summary_url: payload.audio_summary_url || null,
            audio_full_url: payload.audio_full_url || null,
            audio_summary_hash: payload.audio_summary_hash || null,
            audio_full_hash: payload.audio_full_hash || null,
            audio_generated_at: payload.audio_generated_at || null,
            audio_status: payload.audio_status || null
        };

        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.id);
        if (isUUID) {
            articleRow.id = payload.id;
        }

        const { data: savedArticle, error: errArticle } = await global.supabaseClient
            .from('articles')
            .upsert(articleRow)
            .select()
            .single();

        if (errArticle) throw errArticle;

        if (Array.isArray(payload.tags) && payload.tags.length > 0) {
            const tagRows = payload.tags.map(t => ({
                name: t,
                slug: String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
            }));
            const { data: tagsData, error: errTags } = await global.supabaseClient
                .from('tags')
                .upsert(tagRows, { onConflict: 'slug' })
                .select();
                
            if (errTags) throw errTags;
            
            if (tagsData && tagsData.length > 0) {
                const { error: errDel } = await global.supabaseClient.from('article_tags').delete().eq('article_id', savedArticle.id);
                if (errDel) throw errDel;
                
                const articleTagsRows = tagsData.map(t => ({
                    article_id: savedArticle.id,
                    tag_id: t.id
                }));
                const { error: errIns } = await global.supabaseClient.from('article_tags').insert(articleTagsRows);
                if (errIns) throw errIns;
            }
        } else {
            const { error: errDelEmpty } = await global.supabaseClient.from('article_tags').delete().eq('article_id', savedArticle.id);
            if (errDelEmpty) throw errDelEmpty;
        }

        return { ...payload, id: savedArticle.id };
    }

    const API = {
        isRemoteEnabled,

        async getLatestNews(limit = 6) {
            return withProvider(
                () => fromRemoteLatest(limit),
                () => fromMockLatest(limit)
            );
        },

        async getHeroNews() {
            return withProvider(
                () => fromRemoteHero(),
                () => fromMockHero()
            );
        },

        async getNewsByCategory(slug, limit = 9) {
            return withProvider(
                () => fromRemoteByCategory(slug, limit),
                () => fromMockByCategory(slug, limit)
            );
        },

        async getMostReadNews(limit = 5) {
            return withProvider(
                () => fromRemoteMostRead(limit),
                () => fromMockMostRead(limit)
            );
        },

        async getRelatedArticles(article, limit = 3) {
            /* Remoto: usa o mesmo scoring sobre listas já publicadas no mock até haver RPC. */
            return fromMockRelated(article, limit);
        },

        async getArticleBySlug(slug) {
            return withProvider(
                () => fromRemoteBySlug(slug),
                () => fromMockBySlug(slug)
            );
        },

        async upsertArticle(payload) {
            if (isRemoteEnabled()) {
                return await fromRemoteUpsertArticle(payload);
            }
            // Mock mode handled upstream by admin/article-editor.js
            return payload;
        },

        async searchArticles(term, limit = 20) {
            return withProvider(
                () => fromRemoteSearch(term, limit),
                () => fromMockSearch(term, limit)
            );
        },

        async getAllArticles() {
            return withProvider(fromRemoteAllArticles, fromMockAllArticles);
        },

        async getCategoryBySlug(slug) {
            const key = String(slug || '').trim();
            if (!key) return null;

            if (isRemoteEnabled()) {
                try {
                    const { data, error } = await global.supabaseClient
                        .from('categories')
                        .select('name, slug, description, parent_slug')
                        .eq('slug', key)
                        .maybeSingle();
                    if (error) throw error;
                    if (data) {
                        return { ...data, parent: data.parent_slug };
                    }
                } catch (err) {
                    console.error('[API] Categoria remota:', err);
                }
            }
            return fromMockCategory(key);
        },

        async getAllCategories() {
            return withProvider(fromRemoteAllCategories, () => global.MockData.categories.slice());
        },

        async getAllAuthors() {
            return withProvider(fromRemoteAllAuthors, fromMockAllAuthors);
        },

        async upsertCategory(payload) {
            return withProvider(() => fromRemoteUpsertCategory(payload), () => fromMockUpsertCategory(payload));
        },

        async deleteCategory(slug) {
            return withProvider(() => fromRemoteDeleteCategory(slug), () => fromMockDeleteCategory(slug));
        },

        async upsertAuthor(payload) {
            return withProvider(() => fromRemoteUpsertAuthor(payload), () => fromMockUpsertAuthor(payload));
        },

        async getSocialLinks() {
            if (isRemoteEnabled()) {
                try {
                    const { data, error } = await global.supabaseClient
                        .from('site_settings')
                        .select('social_links')
                        .eq('id', 1)
                        .maybeSingle();
                    if (error) throw error;
                    if (data && data.social_links != null) {
                        const normalized = global.MockData.normalizeSocialLinksList(data.social_links);
                        if (normalized.length) {
                            global.MockData.saveSocialLinks(normalized);
                            return normalized;
                        }
                    }
                } catch (err) {
                    console.error('[API] Redes sociais remotas:', err);
                }
            }
            return global.MockData.getSocialLinks();
        },

        async saveSocialLinks(list) {
            const normalized = global.MockData.normalizeSocialLinksList(list);
            const missingUrl = normalized.find(
                (s) => !s.url || !global.MockData.isValidSocialUrl(s.url)
            );
            if (missingUrl) {
                throw new Error(`URL inválida para “${missingUrl.label}”. Use http ou https.`);
            }

            if (isRemoteEnabled()) {
                const { error } = await global.supabaseClient
                    .from('site_settings')
                    .update({ social_links: normalized })
                    .eq('id', 1);
                if (error) throw error;
            }

            return global.MockData.saveSocialLinks(normalized);
        },

        async getSiteSettings() {
            if (isRemoteEnabled()) {
                try {
                    const { data, error } = await global.supabaseClient
                        .from('site_settings')
                        .select(
                            'site_name, site_description, contact_email, support_url, support_enabled, social_links'
                        )
                        .eq('id', 1)
                        .maybeSingle();
                    if (error) throw error;
                    if (data) {
                        const defaults = global.MockData.DEFAULT_SITE_SETTINGS;
                        global.MockData.saveSiteSettings({
                            siteName: data.site_name || defaults.siteName,
                            siteDescription:
                                data.site_description != null
                                    ? data.site_description
                                    : defaults.siteDescription,
                            contactEmail: data.contact_email || defaults.contactEmail,
                            supportUrl:
                                String(data.support_url || '').trim() ||
                                defaults.supportUrl,
                            supportEnabled:
                                data.support_enabled != null
                                    ? Boolean(data.support_enabled)
                                    : defaults.supportEnabled
                        });
                        if (data.social_links != null) {
                            const normalized = global.MockData.normalizeSocialLinksList(
                                data.social_links
                            );
                            if (normalized.length) {
                                global.MockData.saveSocialLinks(normalized);
                            }
                        }
                        return global.MockData.getSiteSettings();
                    }
                } catch (err) {
                    console.error('[API] Configurações remotas:', err);
                }
            }
            return global.MockData.getSiteSettings();
        },

        async saveSiteSettings(payload) {
            const saved = global.MockData.saveSiteSettings(payload);

            if (isRemoteEnabled()) {
                const { error } = await global.supabaseClient
                    .from('site_settings')
                    .update({
                        site_name: saved.siteName,
                        site_description: saved.siteDescription,
                        contact_email: saved.contactEmail,
                        support_url: saved.supportUrl,
                        support_enabled: saved.supportEnabled,
                        social_links: saved.socialLinks
                    })
                    .eq('id', 1);
                if (error) throw error;
            }

            return saved;
        },

        async subscribeNewsletter(email) {
            if (global.NewsletterStore && typeof global.NewsletterStore.subscribe === 'function') {
                return global.NewsletterStore.subscribe(email);
            }
            throw new Error('Serviço de newsletter indisponível.');
        }
    };

    global.API = API;
})(window);
