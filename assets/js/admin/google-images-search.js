/**
 * Busca de imagens do admin via proxy /api/google-images
 * (backend Serper.dev — resultados tipo Google Imagens).
 */
(function (global) {
    const PER_PAGE = 18;

    const STOP_WORDS = new Set([
        'o', 'a', 'os', 'as', 'um', 'uma', 'uns', 'umas', 'de', 'da', 'do', 'das', 'dos',
        'e', 'em', 'no', 'na', 'nos', 'nas', 'que', 'com', 'por', 'para', 'como', 'ao',
        'à', 'aos', 'às', 'se', 'ou', 'mais', 'menos', 'sobre', 'apos', 'após', 'entre',
        'seu', 'sua', 'seus', 'suas', 'este', 'esta', 'isso', 'essa', 'esse', 'aos', 'pelo', 'pela'
    ]);

    function apiBase() {
        if (global.GOOGLE_IMAGES_API_BASE) return global.GOOGLE_IMAGES_API_BASE.replace(/\/+$/, '');
        return '';
    }

    let readyCache = null; // null | true | false
    let readyReason = null; // null | 'ok' | 'offline' | 'no_key'

    async function checkReady() {
        if (global.GOOGLE_IMAGES_READY === false) {
            readyReason = 'no_key';
            return false;
        }
        if (readyCache != null) return readyCache;
        try {
            const url = new URL(apiBase() + '/api/google-images/health', window.location.origin);
            const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
            const ct = (res.headers.get('content-type') || '').toLowerCase();
            if (!res.ok || !ct.includes('application/json')) {
                readyCache = false;
                readyReason = 'offline';
                return false;
            }
            const data = await res.json();
            const configured = !!(data?.ok && data.providers?.serper);
            readyCache = configured;
            readyReason = configured ? 'ok' : 'no_key';
            return readyCache;
        } catch (_) {
            readyCache = false;
            readyReason = 'offline';
            return false;
        }
    }

    function unavailableMessage() {
        if (readyReason === 'offline') {
            return (
                'A busca de imagens precisa do servidor Node (<code>node scripts/serve.mjs</code>), ' +
                'não do Live Server. Abra <code>http://127.0.0.1:8765/admin/nova-noticia.html</code>. ' +
                'Sem o servidor, use a opção avançada para colar uma URL.'
            );
        }
        return (
            'Para buscar imagens, configure <code>SERPER_API_KEY</code> ' +
            '(grátis em <a href="https://serper.dev" target="_blank" rel="noopener noreferrer">serper.dev</a>). ' +
            'Sem a chave, use a opção avançada para colar uma URL.'
        );
    }

    /**
     * Monta consulta priorizando termos do conteúdo da matéria.
     * @param {object} ctx
     */
    function buildSearchQuery(ctx) {
        const title = String(ctx?.title || '').trim();
        const subtitle = String(ctx?.subtitle || '').trim();
        const category = String(ctx?.categoryName || '').trim();
        const excerpt = String(ctx?.excerpt || ctx?.seoDescription || '').trim();
        const keywords = Array.isArray(ctx?.keywords) ? ctx.keywords : [];
        const tags = Array.isArray(ctx?.tags) ? ctx.tags : [];

        let headline = title || subtitle || category;
        headline = headline.split(/[:|–—-]/)[0].trim();

        function tokenize(text) {
            return String(text || '')
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/[^\w\s]/g, ' ')
                .split(/\s+/)
                .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
        }

        const titleWords = tokenize(headline);
        const contextWords = tokenize(excerpt).slice(0, 4);
        const tagWords = tags
            .slice(0, 3)
            .map((t) => tokenize(t)[0])
            .filter(Boolean);
        const kwWords = keywords
            .slice(0, 3)
            .map((k) => tokenize(k)[0])
            .filter(Boolean);

        const catToken = tokenize(category.replace(/[·|/]/g, ' ')).slice(0, 2);

        const seen = new Set();
        const parts = [];

        function add(word) {
            if (!word || seen.has(word)) return;
            seen.add(word);
            parts.push(word);
        }

        titleWords.slice(0, 5).forEach(add);
        catToken.forEach(add);
        tagWords.forEach(add);
        kwWords.forEach(add);
        contextWords.forEach(add);

        let query = parts.slice(0, 8).join(' ');
        if (query.length < 3 && category) {
            query = category + (query ? ' ' + query : '');
        }
        return query || 'notícia editorial';
    }

    function formatAttribution(photo) {
        const name = photo?.source_name || photo?.alt_description || 'Web';
        return 'Imagem: ' + String(name).trim();
    }

    async function apiFetch(path, params) {
        const url = new URL(apiBase() + path, window.location.origin);
        Object.entries(params || {}).forEach(([k, v]) => {
            if (v != null && v !== '') url.searchParams.set(k, v);
        });

        const res = await fetch(url.toString(), {
            headers: { Accept: 'application/json' }
        });

        if (!res.ok) {
            let msg = 'Não foi possível buscar imagens.';
            try {
                const err = await res.json();
                if (err?.error) msg = err.error;
            } catch (_) {}
            throw new Error(msg);
        }

        return res.json();
    }

    async function searchPhotos(query, page, perPage) {
        const data = await apiFetch('/api/google-images/search', {
            query: query.trim(),
            page: String(page || 1),
            per_page: String(perPage || PER_PAGE)
        });
        return {
            results: data.results || [],
            total: data.total || 0,
            totalPages: data.total_pages || 0,
            provider: data.provider || 'unknown'
        };
    }

    function renderPhotoButton(photo, onSelect, selectedId) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'image-pick-grid-item' + (selectedId === photo.id ? ' selected' : '');
        btn.setAttribute(
            'aria-label',
            'Selecionar imagem' + (photo.source_name ? ' de ' + photo.source_name : '')
        );
        btn.dataset.photoId = photo.id;

        const img = document.createElement('img');
        img.src = photo.urls?.small || photo.urls?.thumb || '';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.alt = photo.alt_description || 'Imagem sugerida';

        const credit = document.createElement('span');
        credit.className = 'image-pick-grid-credit';
        credit.textContent = photo.source_name || photo.alt_description || '';

        btn.append(img, credit);
        btn.addEventListener('click', () => onSelect(photo, btn));
        return btn;
    }

    async function loadSuggestions(opts) {
        const {
            gridEl,
            loadingEl,
            emptyEl,
            wrapEl,
            query,
            onSelect,
            limit = 8
        } = opts || {};

        if (!gridEl) return;

        const configured = await checkReady();
        if (!configured) {
            if (wrapEl) wrapEl.hidden = true;
            return;
        }

        if (wrapEl) wrapEl.hidden = false;
        if (loadingEl) loadingEl.hidden = false;
        if (emptyEl) emptyEl.hidden = true;
        gridEl.innerHTML = '';

        try {
            const { results } = await searchPhotos(query, 1, limit);
            gridEl.innerHTML = '';
            let selectedId = null;

            results.forEach((photo) => {
                const btn = renderPhotoButton(photo, (p, btnEl) => {
                    selectedId = p.id;
                    gridEl.querySelectorAll('.image-pick-grid-item').forEach((el) => {
                        el.classList.toggle('selected', el === btnEl);
                    });
                    if (typeof onSelect === 'function') onSelect(p);
                }, selectedId);
                gridEl.appendChild(btn);
            });

            if (emptyEl) emptyEl.hidden = results.length > 0;
        } catch (_) {
            gridEl.innerHTML = '';
            if (emptyEl) {
                emptyEl.hidden = false;
                emptyEl.textContent = 'Não foi possível carregar sugestões agora.';
            }
        } finally {
            if (loadingEl) loadingEl.hidden = true;
        }
    }

    function attachPanel(opts) {
        const els = {
            input: opts.input,
            searchBtn: opts.searchBtn,
            clearBtn: opts.clearBtn || document.getElementById('imageUrlSearchClear'),
            grid: opts.grid,
            empty: opts.empty,
            loading: opts.loading,
            error: opts.error,
            unavailable: opts.unavailable,
            meta: opts.meta,
            more: opts.more || document.getElementById('imageUrlSearchMore'),
            sentinel: opts.sentinel || document.getElementById('imageUrlSearchSentinel')
        };

        let searchToken = 0;
        let currentPage = 0;
        let currentQuery = '';
        let hasMore = false;
        let loadingMore = false;
        let initialLoading = false;
        let seenUrls = new Set();
        let loadedCount = 0;
        let lastProvider = '';
        let scrollRoot = null;
        let io = null;
        const MAX_PAGES = 20;

        function setInitialLoading(on) {
            initialLoading = !!on;
            if (els.loading) els.loading.hidden = !on;
            if (els.searchBtn) els.searchBtn.disabled = on;
        }

        function setMoreLoading(on) {
            loadingMore = !!on;
            if (els.more) els.more.hidden = !on;
        }

        function clearError() {
            if (els.error) {
                els.error.hidden = true;
                els.error.textContent = '';
            }
        }

        function showError(msg) {
            if (els.error) {
                els.error.hidden = false;
                els.error.textContent = msg;
            }
        }

        function updateMeta() {
            if (!els.meta) return;
            els.meta.hidden = false;
            let meta =
                loadedCount > 0
                    ? (loadedCount === 1 ? '1 imagem carregada' : loadedCount + ' imagens carregadas')
                    : 'Nenhum resultado para “' + currentQuery + '”.';
            if (lastProvider === 'google-serper') {
                meta += ' · Busca de imagens';
            }
            if (hasMore && loadedCount > 0) meta += ' · role para ver mais';
            els.meta.textContent = meta;
        }

        function syncSentinel() {
            if (!els.sentinel || !els.grid) return;
            els.sentinel.hidden = !hasMore;
            if (!els.sentinel.hidden) {
                els.grid.appendChild(els.sentinel);
            }
        }

        function appendPhotos(photos) {
            if (!els.grid) return 0;
            let added = 0;
            photos.forEach((photo) => {
                const url = photo.urls?.regular || photo.urls?.small || '';
                if (!url || seenUrls.has(url)) return;
                seenUrls.add(url);
                const btn = renderPhotoButton(photo, (p) => {
                    if (typeof opts.onPick === 'function') opts.onPick(p);
                });
                els.grid.appendChild(btn);
                added++;
            });
            loadedCount += added;
            if (els.empty) els.empty.hidden = loadedCount > 0;
            return added;
        }

        function clearGrid() {
            if (els.grid) {
                Array.from(els.grid.children).forEach((child) => {
                    if (child !== els.sentinel) child.remove();
                });
            }
            seenUrls = new Set();
            loadedCount = 0;
            if (els.empty) els.empty.hidden = true;
        }

        function resolveHasMore(page, results, added) {
            if (page >= MAX_PAGES) return false;
            if (!results.length) return false;
            if (added <= 0) return false;
            return true;
        }

        async function fetchPage(page, { append }) {
            const { results, provider } = await searchPhotos(currentQuery, page, PER_PAGE);
            lastProvider = provider || lastProvider;

            if (!append) clearGrid();
            const added = appendPhotos(results);
            hasMore = resolveHasMore(page, results, added);
            currentPage = page;
            syncSentinel();
            updateMeta();
            return { results, added };
        }

        async function runSearch() {
            const configured = await checkReady();
            if (!configured) {
                showError(
                    readyReason === 'offline'
                        ? 'Servidor de imagens offline. Use node scripts/serve.mjs (porta 8765), não o Live Server.'
                        : 'Configure SERPER_API_KEY (serper.dev) para buscar imagens.'
                );
                return;
            }

            const query = (els.input?.value || '').trim();
            if (!query) {
                showError('Digite um termo de busca.');
                return;
            }

            clearError();
            setMoreLoading(false);
            setInitialLoading(true);
            const token = ++searchToken;
            currentQuery = query;
            currentPage = 0;
            hasMore = false;
            syncSentinel();

            try {
                await fetchPage(1, { append: false });
                if (token !== searchToken) return;
                await fillUntilScrollable(token);
            } catch (err) {
                if (token !== searchToken) return;
                clearGrid();
                hasMore = false;
                syncSentinel();
                showError(err.message || 'Erro na busca.');
                if (els.meta) els.meta.hidden = true;
            } finally {
                if (token === searchToken) setInitialLoading(false);
            }
        }

        async function loadMore() {
            if (!hasMore || loadingMore || initialLoading || !currentQuery) return;
            if (currentPage >= MAX_PAGES) {
                hasMore = false;
                syncSentinel();
                updateMeta();
                return;
            }

            const nextPage = currentPage + 1;
            const token = searchToken;
            setMoreLoading(true);
            clearError();

            try {
                const { results, added } = await fetchPage(nextPage, { append: true });
                if (token !== searchToken) return;
                if (!results.length || added === 0) {
                    hasMore = false;
                    syncSentinel();
                    updateMeta();
                }
            } catch (err) {
                if (token !== searchToken) return;
                // Fim da lista / falha transitória: para o scroll sem apagar o que já carregou
                hasMore = false;
                syncSentinel();
                if (loadedCount === 0) {
                    showError(err.message || 'Não foi possível carregar mais imagens.');
                }
            } finally {
                if (token === searchToken) {
                    setMoreLoading(false);
                    requestAnimationFrame(() => {
                        if (token === searchToken && hasMore) onAnyScroll();
                    });
                }
            }
        }

        function resultsScrollEl() {
            return (
                els.grid?.closest('.image-pick-results') ||
                document.querySelector('#imageUrlModal .image-pick-results') ||
                null
            );
        }

        async function fillUntilScrollable(token) {
            let guard = 0;
            while (hasMore && token === searchToken && guard++ < 2) {
                const el = resultsScrollEl();
                if (!el) break;
                if (el.scrollHeight > el.clientHeight + 48) break;
                await loadMore();
                if (token !== searchToken) break;
            }
        }

        function onAnyScroll() {
            if (!hasMore || loadingMore || initialLoading) return;
            const scroller = resultsScrollEl();
            if (scroller && scroller.scrollHeight > scroller.clientHeight + 4) {
                if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 140) {
                    loadMore();
                    return;
                }
            }
            if (scroller && els.sentinel && !els.sentinel.hidden) {
                const br = scroller.getBoundingClientRect();
                const sr = els.sentinel.getBoundingClientRect();
                if (sr.top < br.bottom + 160 && sr.bottom > br.top - 40) {
                    loadMore();
                }
            }
        }

        function bindObservers() {
            if (io) {
                io.disconnect();
                io = null;
            }
            const scroller = resultsScrollEl();
            if (els.sentinel && typeof IntersectionObserver === 'function') {
                io = new IntersectionObserver(
                    (entries) => {
                        if (entries.some((e) => e.isIntersecting)) {
                            loadMore();
                        }
                    },
                    {
                        root: scroller || null,
                        rootMargin: '200px 0px',
                        threshold: 0
                    }
                );
                io.observe(els.sentinel);
            }

            if (scrollRoot && scrollRoot !== scroller) {
                scrollRoot.removeEventListener('scroll', onAnyScroll);
            }
            scroller?.removeEventListener('scroll', onAnyScroll);
            scroller?.addEventListener('scroll', onAnyScroll, { passive: true });
            scrollRoot = scroller;
        }

        async function prepare() {
            clearError();
            clearGrid();
            setMoreLoading(false);
            hasMore = false;
            currentPage = 0;
            currentQuery = '';
            syncSentinel();
            if (els.meta) els.meta.hidden = true;
            bindObservers();

            const configured = await checkReady();
            if (els.unavailable) {
                els.unavailable.hidden = configured;
                if (!configured) els.unavailable.innerHTML = unavailableMessage();
            }
            if (els.input) els.input.disabled = !configured;
            if (els.searchBtn) els.searchBtn.disabled = !configured;
            if (els.grid) els.grid.hidden = !configured;

            if (configured && els.input) {
                const ctx = typeof opts.getContext === 'function' ? opts.getContext() : {};
                els.input.value = buildSearchQuery(ctx);
                syncClearBtn();
                requestAnimationFrame(() => runSearch());
            }
        }

        function reset() {
            searchToken++;
            setInitialLoading(false);
            setMoreLoading(false);
            clearError();
            clearGrid();
            hasMore = false;
            currentPage = 0;
            currentQuery = '';
            syncSentinel();
            if (els.meta) els.meta.hidden = true;
            if (io) {
                io.disconnect();
                io = null;
            }
        }

        function syncClearBtn() {
            if (!els.clearBtn) return;
            const hasValue = !!(els.input?.value || '').trim();
            els.clearBtn.hidden = !hasValue;
        }

        function clearSearchInput() {
            if (!els.input) return;
            els.input.value = '';
            syncClearBtn();
            els.input.focus();
        }

        els.searchBtn?.addEventListener('click', () => runSearch());
        els.clearBtn?.addEventListener('click', () => clearSearchInput());
        els.input?.addEventListener('input', () => syncClearBtn());
        els.input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                runSearch();
            }
        });
        syncClearBtn();

        return { prepare, reset, runSearch, loadMore };
    }

    global.GoogleImagesSearch = {
        buildSearchQuery,
        formatAttribution,
        loadSuggestions,
        attachPanel
    };
})(window);
