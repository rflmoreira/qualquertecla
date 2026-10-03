/**
 * ReactionsStore — reações por artigo.
 *
 * Fonte oficial das contagens: Supabase (quando configurado).
 * localStorage: apenas device_id + voto local (anti-duplicata no dispositivo).
 * Fallback mock: contagens locais só se SUPABASE_READY === false (protótipo).
 */
(function (global) {
    const STORAGE_VOTES = 'qualquer-tecla-reactions-votes-v1';
    const STORAGE_DEVICE = 'qualquer-tecla-device-id-v1';
    const STORAGE_COUNTS_MOCK = 'qualquer-tecla-reactions-counts-mock-v1';

    const REACTION_IDS = ['ace', 'love', 'urgh', 'omg', 'lol'];

    const REACTIONS = [
        { id: 'ace', emoji: '👍', label: 'GOSTEI!' },
        { id: 'love', emoji: '😍', label: 'AMEI!' },
        { id: 'urgh', emoji: '😡', label: 'ODIEI!' },
        { id: 'omg', emoji: '😮', label: 'UAU!' },
        { id: 'lol', emoji: '🤣', label: 'RI MUITO!' }
    ];

    function emptyCounts() {
        return REACTION_IDS.reduce((acc, id) => {
            acc[id] = 0;
            return acc;
        }, {});
    }

    function isRemoteEnabled() {
        return !!(global.supabaseClient && global.SUPABASE_READY);
    }

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

    function normalizeCounts(raw) {
        const base = emptyCounts();
        if (!raw || typeof raw !== 'object') return base;
        REACTION_IDS.forEach((id) => {
            const n = Number(raw[id]);
            base[id] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
        });
        return base;
    }

    function totalOf(counts) {
        return REACTION_IDS.reduce((sum, id) => sum + (counts[id] || 0), 0);
    }

    function getDeviceId() {
        try {
            let id = localStorage.getItem(STORAGE_DEVICE);
            if (id && id.length >= 8 && id.length <= 128) return id;
            id =
                (global.crypto && typeof global.crypto.randomUUID === 'function' && global.crypto.randomUUID()) ||
                `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
            localStorage.setItem(STORAGE_DEVICE, id);
            return id;
        } catch (_) {
            return `dev-session-${Date.now().toString(36)}`;
        }
    }

    function getLocalVote(slug) {
        const votes = readJson(STORAGE_VOTES, {});
        const vote = votes[slug];
        return REACTION_IDS.includes(vote) ? vote : null;
    }

    function setLocalVote(slug, reactionId) {
        const votes = readJson(STORAGE_VOTES, {});
        votes[slug] = reactionId;
        writeJson(STORAGE_VOTES, votes);
    }

    function isUuid(value) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            String(value || '')
        );
    }

    async function fetchRemoteCounts(slug) {
        const { data, error } = await global.supabaseClient.rpc('get_article_reaction_counts', {
            p_slug: slug
        });
        if (error) throw error;
        return normalizeCounts(data || {});
    }

    async function fetchRemoteMyVote(slug, deviceId) {
        const { data, error } = await global.supabaseClient.rpc('get_my_article_reaction', {
            p_slug: slug,
            p_device_id: deviceId
        });
        if (error) throw error;
        return REACTION_IDS.includes(data) ? data : null;
    }

    async function insertRemoteVote(slug, reactionId, deviceId, articleUuid) {
        const row = {
            article_slug: slug,
            reaction: reactionId,
            device_id: deviceId
        };
        if (articleUuid && isUuid(articleUuid)) {
            row.article_id = articleUuid;
        }
        const { error } = await global.supabaseClient.from('article_reactions').insert(row);
        return error;
    }

    function mockGetCounts(slug) {
        const map = readJson(STORAGE_COUNTS_MOCK, {});
        return normalizeCounts(map[slug]);
    }

    function mockSetCounts(slug, counts) {
        const map = readJson(STORAGE_COUNTS_MOCK, {});
        map[slug] = normalizeCounts(counts);
        writeJson(STORAGE_COUNTS_MOCK, map);
    }

    /**
     * @param {string} articleSlug
     * @param {{ articleUuid?: string }} [options]
     */
    async function getState(articleSlug, options) {
        const slug = String(articleSlug || '').trim();
        if (!slug) {
            return {
                articleId: '',
                counts: emptyCounts(),
                total: 0,
                userVote: null,
                source: 'none'
            };
        }

        const deviceId = getDeviceId();
        let localVote = getLocalVote(slug);

        if (isRemoteEnabled()) {
            try {
                const [counts, remoteVote] = await Promise.all([
                    fetchRemoteCounts(slug),
                    fetchRemoteMyVote(slug, deviceId)
                ]);

                if (remoteVote) {
                    setLocalVote(slug, remoteVote);
                    localVote = remoteVote;
                }

                return {
                    articleId: slug,
                    articleUuid: options && options.articleUuid,
                    counts,
                    total: totalOf(counts),
                    userVote: localVote || remoteVote || null,
                    source: 'supabase'
                };
            } catch (err) {
                console.error('[Reactions] Falha ao carregar contagens:', err);
                return {
                    articleId: slug,
                    counts: emptyCounts(),
                    total: 0,
                    userVote: localVote,
                    source: 'error',
                    error: true
                };
            }
        }

        // Protótipo sem Supabase: contagens locais (não oficiais)
        const counts = mockGetCounts(slug);
        return {
            articleId: slug,
            counts,
            total: totalOf(counts),
            userVote: localVote,
            source: 'mock'
        };
    }

    /**
     * Um voto por dispositivo/artigo. Não permite troca.
     * @param {string} articleSlug
     * @param {string} reactionId
     * @param {{ articleUuid?: string }} [options]
     */
    async function castVote(articleSlug, reactionId, options) {
        const slug = String(articleSlug || '').trim();
        const next = String(reactionId || '').trim();
        const articleUuid = options && options.articleUuid;

        if (!slug || !REACTION_IDS.includes(next)) {
            const state = await getState(slug, options);
            return { ...state, changed: false };
        }

        const existing = getLocalVote(slug);
        if (existing) {
            const state = await getState(slug, options);
            return { ...state, userVote: existing, changed: false };
        }

        const deviceId = getDeviceId();

        if (isRemoteEnabled()) {
            try {
                const remoteExisting = await fetchRemoteMyVote(slug, deviceId);
                if (remoteExisting) {
                    setLocalVote(slug, remoteExisting);
                    const counts = await fetchRemoteCounts(slug);
                    return {
                        articleId: slug,
                        counts,
                        total: totalOf(counts),
                        userVote: remoteExisting,
                        changed: false,
                        source: 'supabase'
                    };
                }

                const error = await insertRemoteVote(slug, next, deviceId, articleUuid);
                if (error) {
                    // Duplicata: outro voto já existe para o device
                    if (error.code === '23505') {
                        const vote = (await fetchRemoteMyVote(slug, deviceId)) || next;
                        setLocalVote(slug, vote);
                        const counts = await fetchRemoteCounts(slug);
                        return {
                            articleId: slug,
                            counts,
                            total: totalOf(counts),
                            userVote: vote,
                            changed: false,
                            source: 'supabase'
                        };
                    }
                    console.error('[Reactions] Falha ao registrar voto:', error);
                    const counts = await fetchRemoteCounts(slug).catch(() => emptyCounts());
                    return {
                        articleId: slug,
                        counts,
                        total: totalOf(counts),
                        userVote: null,
                        changed: false,
                        source: 'supabase',
                        error: true
                    };
                }

                setLocalVote(slug, next);
                const counts = await fetchRemoteCounts(slug);
                return {
                    articleId: slug,
                    counts,
                    total: totalOf(counts),
                    userVote: next,
                    changed: true,
                    source: 'supabase'
                };
            } catch (err) {
                console.error('[Reactions] Erro de conexão ao votar:', err);
                return {
                    articleId: slug,
                    counts: emptyCounts(),
                    total: 0,
                    userVote: null,
                    changed: false,
                    source: 'error',
                    error: true
                };
            }
        }

        // Fallback mock (dev)
        const counts = mockGetCounts(slug);
        counts[next] = (counts[next] || 0) + 1;
        mockSetCounts(slug, counts);
        setLocalVote(slug, next);
        return {
            articleId: slug,
            counts,
            total: totalOf(counts),
            userVote: next,
            changed: true,
            source: 'mock'
        };
    }

    /**
     * Métricas para o painel admin (fonte: Supabase).
     * @param {{ from?: string|null, to?: string|null }} [range]
     */
    async function getMetrics(range) {
        const empty = {
            total: 0,
            counts: emptyCounts(),
            top_reaction: null,
            articles: [],
            source: 'none'
        };

        if (!isRemoteEnabled()) {
            return { ...empty, source: 'unavailable' };
        }

        try {
            const { data, error } = await global.supabaseClient.rpc('get_reaction_metrics', {
                p_from: (range && range.from) || null,
                p_to: (range && range.to) || null
            });
            if (error) throw error;

            const payload = data && typeof data === 'object' ? data : {};
            return {
                total: Number(payload.total) || 0,
                counts: normalizeCounts(payload.counts),
                top_reaction: REACTION_IDS.includes(payload.top_reaction)
                    ? payload.top_reaction
                    : null,
                articles: Array.isArray(payload.articles) ? payload.articles : [],
                source: 'supabase'
            };
        } catch (err) {
            console.error('[Reactions] Falha ao carregar métricas:', err);
            return { ...empty, source: 'error', error: true };
        }
    }

    function labelFor(id) {
        const found = REACTIONS.find((r) => r.id === id);
        return found ? `${found.emoji} ${found.label}` : id;
    }

    global.ReactionsStore = {
        REACTIONS,
        REACTION_IDS,
        getDeviceId,
        getState,
        castVote,
        getMetrics,
        totalOf,
        labelFor,
        isRemoteEnabled
    };
})(typeof window !== 'undefined' ? window : globalThis);
