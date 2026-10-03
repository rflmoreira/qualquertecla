/**
 * Fundo personalizável da página de login (URL / Unsplash).
 * Default global: site_settings.loginBackground (imagem Unsplash por URL)
 * Override local: localStorage qualquer-tecla_login_bg_override
 */
(function (global) {
    'use strict';

    const OVERRIDE_KEY = 'qualquer-tecla_login_bg_override';
    const CACHE_KEY = 'qualquer-tecla_login_bg_cache';
    const HOUR_MS = 60 * 60 * 1000;
    const DAY_MS = 24 * HOUR_MS;
    const CROSSFADE_MS = 220;

    const DEFAULT_IMAGE_URL =
        (global.MockData && global.MockData.DEFAULT_LOGIN_BG_IMAGE_URL) ||
        'https://images.unsplash.com/photo-1618519764620-7403abdbdfe9?q=80&w=2340&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D';

    const DEFAULT_CREDIT = {
        author: 'Erik Mclean',
        authorUrl: 'https://unsplash.com/@introspectivedsgn',
        photoUrl: 'https://unsplash.com'
    };

    function prefersReducedMotion() {
        try {
            return global.matchMedia('(prefers-reduced-motion: reduce)').matches;
        } catch (_) {
            return false;
        }
    }

    function clamp(n, min, max, fallback) {
        const v = Number(n);
        if (!Number.isFinite(v)) return fallback;
        return Math.min(max, Math.max(min, Math.round(v)));
    }

    function normalize(raw) {
        if (global.MockData && typeof global.MockData.normalizeLoginBackground === 'function') {
            return global.MockData.normalizeLoginBackground(raw);
        }
        const source = raw && typeof raw === 'object' ? raw : {};
        const modes = new Set(['default', 'imageUrl', 'unsplash']);
        const refreshes = new Set(['hourly', 'daily', 'every_open', 'never']);
        let imageUrl = String(source.imageUrl || '').trim().slice(0, 2000);
        if (!/^https?:\/\//i.test(imageUrl) || /^(javascript|data|vbscript):/i.test(imageUrl)) {
            imageUrl = '';
        }
        let mode = modes.has(source.mode) ? source.mode : 'imageUrl';
        if (mode === 'default') {
            mode = 'imageUrl';
            if (!imageUrl) imageUrl = DEFAULT_IMAGE_URL;
        }
        return {
            mode,
            imageUrl,
            unsplashCollection: String(source.unsplashCollection || '')
                .trim()
                .replace(/[^\w-]/g, '')
                .slice(0, 32),
            refresh: refreshes.has(source.refresh) ? source.refresh : 'hourly',
            brightnessDark: clamp(source.brightnessDark, 70, 100, 100),
            brightnessLight: clamp(source.brightnessLight, 70, 100, 80),
            blur: clamp(source.blur, 0, 16, 0)
        };
    }

    function isValidHttpUrl(value) {
        const raw = String(value || '').trim();
        if (!/^https?:\/\//i.test(raw)) return false;
        if (/^(javascript|data|vbscript):/i.test(raw)) return false;
        try {
            const u = new URL(raw);
            return u.protocol === 'http:' || u.protocol === 'https:';
        } catch (_) {
            return false;
        }
    }

    function isSafeCreditUrl(value) {
        return isValidHttpUrl(value);
    }

    function defaultConfig() {
        if (global.MockData && global.MockData.DEFAULT_LOGIN_BACKGROUND) {
            return normalize(global.MockData.DEFAULT_LOGIN_BACKGROUND);
        }
        return normalize({ mode: 'imageUrl', imageUrl: DEFAULT_IMAGE_URL });
    }

    function readJson(key) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (_) {
            return null;
        }
    }

    function writeJson(key, value) {
        try {
            if (value == null) localStorage.removeItem(key);
            else localStorage.setItem(key, JSON.stringify(value));
        } catch (_) {
            /* ignore quota */
        }
    }

    function getGlobalConfig() {
        try {
            if (global.MockData && typeof global.MockData.getSiteSettings === 'function') {
                const s = global.MockData.getSiteSettings();
                if (s && s.loginBackground) return normalize(s.loginBackground);
            }
        } catch (_) {
            /* ignore */
        }
        return defaultConfig();
    }

    function getLocalOverride() {
        const parsed = readJson(OVERRIDE_KEY);
        if (!parsed) return null;
        const cfg = normalize(parsed);
        if (cfg.mode === 'imageUrl' && cfg.imageUrl && !isValidHttpUrl(cfg.imageUrl)) {
            clearLocalOverride();
            return null;
        }
        if (cfg.mode === 'unsplash' && !cfg.unsplashCollection) {
            clearLocalOverride();
            return null;
        }
        return cfg;
    }

    function setLocalOverride(config) {
        writeJson(OVERRIDE_KEY, normalize(config));
    }

    function clearLocalOverride() {
        writeJson(OVERRIDE_KEY, null);
    }

    function getEffectiveConfig() {
        return getLocalOverride() || getGlobalConfig() || defaultConfig();
    }

    function refreshIntervalMs(refresh) {
        if (refresh === 'never') return Infinity;
        if (refresh === 'daily') return DAY_MS;
        if (refresh === 'every_open') return 0;
        return HOUR_MS;
    }

    function cacheValid(cache, config) {
        if (!cache || !cache.url || !cache.collection) return false;
        if (String(cache.collection) !== String(config.unsplashCollection || '')) return false;
        if (config.refresh === 'every_open') return false;
        if (config.refresh === 'never') return true;
        const age = Date.now() - Number(cache.fetchedAt || 0);
        return age >= 0 && age < refreshIntervalMs(config.refresh);
    }

    function averageBrightnessHeuristic(config) {
        const dark = clamp(config.brightnessDark, 70, 100, 100);
        const light = clamp(config.brightnessLight, 70, 100, 80);
        return Math.round(dark * 0.55 + light * 0.45);
    }

    function resolveAssetUrl(path) {
        const base = String(global.SITE_BASE || '../');
        if (/^https?:\/\//i.test(path)) return path;
        if (path.startsWith('../') || path.startsWith('/')) return path;
        return base.replace(/\/?$/, '/') + path.replace(/^\//, '');
    }

    function sameDefaultImageUrl(url) {
        const a = String(url || '').trim();
        const b = String(DEFAULT_IMAGE_URL || '').trim();
        if (!a || !b) return false;
        try {
            const ua = new URL(a);
            const ub = new URL(b);
            return ua.origin === ub.origin && ua.pathname === ub.pathname;
        } catch (_) {
            return a === b;
        }
    }

    function creditForConfig(config, creditInfo) {
        if (creditInfo && creditInfo.author) return creditInfo;
        if (config && config.mode === 'imageUrl' && sameDefaultImageUrl(config.imageUrl)) {
            return DEFAULT_CREDIT;
        }
        return null;
    }

    function defaultBackgroundCss() {
        return cssUrl(DEFAULT_IMAGE_URL);
    }

    function cssUrl(url) {
        return 'url("' + String(url).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '")';
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function escapeAttr(value) {
        return escapeHtml(value).replace(/'/g, '&#39;');
    }

    function setCredit(el, info) {
        if (!el) return;
        if (!info || !info.author) {
            el.hidden = true;
            el.textContent = '';
            return;
        }
        const author = String(info.author);
        const authorUrl = isSafeCreditUrl(info.authorUrl)
            ? String(info.authorUrl)
            : 'https://unsplash.com';
        el.hidden = false;
        el.innerHTML =
            '<i class="ph ph-link-simple text-gold" aria-hidden="true"></i>' +
            '<span>Foto · ' +
            '<a href="' +
            escapeAttr(authorUrl) +
            '" class="article-source-link" target="_blank" rel="noopener noreferrer">' +
            escapeHtml(author) +
            '</a>' +
            ' <span class="article-source-sep" aria-hidden="true">·</span> ' +
            '<a href="https://unsplash.com" class="article-source-link" target="_blank" rel="noopener noreferrer">Unsplash</a></span>';
    }

    function applyFilters(page, config) {
        const brightness = averageBrightnessHeuristic(config);
        const blur = clamp(config.blur, 0, 16, 0);
        page.style.setProperty('--login-bg-brightness', String(brightness) + '%');
        page.style.setProperty('--login-bg-blur', String(blur) + 'px');
    }

    function preloadImage(url) {
        return new Promise((resolve, reject) => {
            if (!url) {
                resolve(null);
                return;
            }
            const img = new Image();
            img.onload = () => resolve(url);
            img.onerror = () => reject(new Error('Não foi possível carregar a imagem.'));
            img.src = url;
        });
    }

    function getLayers(page) {
        return {
            current: page.querySelector('.login-bg__image:not(.login-bg__image--next)'),
            next: page.querySelector('.login-bg__image--next')
        };
    }

    function setLayerBackground(layer, imageUrl) {
        if (!layer) return;
        if (!imageUrl) {
            layer.style.backgroundImage = defaultBackgroundCss();
        } else {
            layer.style.backgroundImage = cssUrl(imageUrl);
        }
    }

    function crossfadeTo(page, imageUrl, config, creditInfo) {
        const { current, next } = getLayers(page);
        const credit = page.querySelector('#loginBgCredit');
        if (!current) return Promise.resolve();

        applyFilters(page, config);
        setCredit(credit, creditForConfig(config, creditInfo));
        page.classList.add('login-bg-ready');

        if (!next || prefersReducedMotion()) {
            setLayerBackground(current, imageUrl);
            return Promise.resolve();
        }

        const currentCss = current.style.backgroundImage || '';
        const targetCss = imageUrl ? cssUrl(imageUrl) : defaultBackgroundCss();
        if (currentCss === targetCss) {
            setLayerBackground(current, imageUrl);
            return Promise.resolve();
        }

        setLayerBackground(next, imageUrl);
        next.classList.add('is-visible');

        return new Promise((resolve) => {
            global.setTimeout(() => {
                setLayerBackground(current, imageUrl);
                next.classList.remove('is-visible');
                next.style.backgroundImage = '';
                resolve();
            }, CROSSFADE_MS);
        });
    }

    async function fetchUnsplash(collection) {
        const apiUrl = new URL('/api/unsplash/background', global.location.origin);
        apiUrl.searchParams.set('collection', collection);
        const res = await fetch(apiUrl.toString(), {
            headers: { Accept: 'application/json' }
        });
        let body = null;
        try {
            body = await res.json();
        } catch (_) {
            body = null;
        }
        if (!res.ok) {
            const err = new Error((body && body.error) || 'Falha Unsplash');
            err.code = body && body.code;
            throw err;
        }
        return body;
    }

    async function resolveImage(config) {
        if (config.mode === 'imageUrl') {
            if (!isValidHttpUrl(config.imageUrl)) {
                const err = new Error('Informe uma URL http(s) válida.');
                err.code = 'BAD_URL';
                throw err;
            }
            await preloadImage(config.imageUrl);
            return {
                url: config.imageUrl,
                credit: sameDefaultImageUrl(config.imageUrl) ? DEFAULT_CREDIT : null
            };
        }
        if (config.mode === 'unsplash' && config.unsplashCollection) {
            const cache = readJson(CACHE_KEY);
            if (cacheValid(cache, config)) {
                return {
                    url: cache.url,
                    credit: {
                        author: cache.author,
                        authorUrl: cache.authorUrl,
                        photoUrl: cache.photoUrl
                    }
                };
            }
            try {
                const photo = await fetchUnsplash(config.unsplashCollection);
                const nextCache = {
                    collection: config.unsplashCollection,
                    url: photo.url,
                    author: photo.author,
                    authorUrl: photo.authorUrl,
                    photoUrl: photo.photoUrl,
                    fetchedAt: photo.fetchedAt || Date.now()
                };
                writeJson(CACHE_KEY, nextCache);
                await preloadImage(nextCache.url).catch(() => null);
                return {
                    url: nextCache.url,
                    credit: {
                        author: nextCache.author,
                        authorUrl: nextCache.authorUrl,
                        photoUrl: nextCache.photoUrl
                    }
                };
            } catch (err) {
                if (cache && cache.url) {
                    return {
                        url: cache.url,
                        credit: {
                            author: cache.author,
                            authorUrl: cache.authorUrl,
                            photoUrl: cache.photoUrl
                        },
                        warning: (err && err.message) || 'Unsplash indisponível; usando cache.'
                    };
                }
                return {
                    url: null,
                    credit: null,
                    warning:
                        (err && err.code === 'UNSPLASH_NOT_CONFIGURED') ||
                        (err && /não configurad/i.test(String(err.message || '')))
                            ? 'Unsplash não configurado no servidor. Usando fundo padrão.'
                            : (err && err.message) || 'Falha Unsplash. Usando fundo padrão.'
                };
            }
        }
        return { url: null, credit: null };
    }

    async function applyToPage(page, config) {
        const cfg = normalize(config);
        const resolved = await resolveImage(cfg);
        const url = resolved.url || DEFAULT_IMAGE_URL;
        const credit = resolved.credit || (!resolved.url ? DEFAULT_CREDIT : null);
        await crossfadeTo(page, url, cfg, credit);
        return { config: cfg, warning: resolved.warning || null };
    }

    function updateSliderUi(sliderRoot, value) {
        if (!sliderRoot) return;
        const range = sliderRoot.querySelector('input[type="range"]');
        const output = sliderRoot.querySelector('.login-bg-slider__value');
        const unit = sliderRoot.getAttribute('data-unit') || '';
        const next = String(value);
        if (range) {
            range.value = next;
            range.setAttribute('aria-valuetext', next + unit);
            const min = Number(range.min);
            const max = Number(range.max);
            const num = Number(next);
            const t = max > min ? (num - min) / (max - min) : 0;
            range.style.setProperty('--login-bg-range-t', String(t));
            range.style.setProperty('--login-bg-range-pct', String(t * 100) + '%');
        }
        if (output) output.textContent = next + unit;
        sliderRoot.querySelectorAll('.login-bg-tick').forEach((tick) => {
            tick.classList.toggle('is-active', tick.getAttribute('data-preset') === next);
        });
    }

    function syncPanelFields(panel, config) {
        const mode = config.mode || 'imageUrl';
        panel.querySelectorAll('input[name="loginBgMode"]').forEach((input) => {
            input.checked = input.value === mode;
            const section = input.closest('.login-bg-source');
            if (section) section.classList.toggle('is-selected', input.checked);
        });
        const urlInput = panel.querySelector('#loginBgImageUrl');
        const collectionInput = panel.querySelector('#loginBgCollection');
        const refreshSelect = panel.querySelector('#loginBgRefresh');
        const brightDark = panel.querySelector('#loginBgBrightDark');
        const brightLight = panel.querySelector('#loginBgBrightLight');
        const blurInput = panel.querySelector('#loginBgBlur');
        if (urlInput) urlInput.value = config.imageUrl || DEFAULT_IMAGE_URL;
        if (collectionInput) collectionInput.value = config.unsplashCollection || '';
        if (refreshSelect) refreshSelect.value = config.refresh || 'hourly';
        if (brightDark) {
            updateSliderUi(brightDark.closest('[data-login-bg-slider]'), config.brightnessDark ?? 100);
        }
        if (brightLight) {
            updateSliderUi(brightLight.closest('[data-login-bg-slider]'), config.brightnessLight ?? 80);
        }
        if (blurInput) {
            updateSliderUi(blurInput.closest('[data-login-bg-slider]'), config.blur ?? 0);
        }

        panel.querySelectorAll('[data-login-bg-for]').forEach((block) => {
            block.hidden = false;
        });

        const adjust = panel.querySelector('#loginBgAdjustSection');
        const adjustMuted = mode !== 'imageUrl' && mode !== 'unsplash';
        if (adjust) {
            adjust.classList.toggle('is-muted', adjustMuted);
            adjust.setAttribute('aria-disabled', adjustMuted ? 'true' : 'false');
        }
        panel.querySelectorAll('#loginBgAdjustSection input[type="range"]').forEach((range) => {
            range.disabled = adjustMuted;
        });

        const resetBtn = panel.querySelector('#loginBgUseSiteDefault');
        if (resetBtn) resetBtn.hidden = false;
    }

    function readPanelConfig(panel) {
        const modeInput = panel.querySelector('input[name="loginBgMode"]:checked');
        return normalize({
            mode: modeInput ? modeInput.value : 'imageUrl',
            imageUrl: (panel.querySelector('#loginBgImageUrl') || {}).value,
            unsplashCollection: (panel.querySelector('#loginBgCollection') || {}).value,
            refresh: (panel.querySelector('#loginBgRefresh') || {}).value,
            brightnessDark: (panel.querySelector('#loginBgBrightDark') || {}).value,
            brightnessLight: (panel.querySelector('#loginBgBrightLight') || {}).value,
            blur: (panel.querySelector('#loginBgBlur') || {}).value
        });
    }

    function focusableIn(panel) {
        return Array.prototype.slice
            .call(
                panel.querySelectorAll(
                    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                )
            )
            .filter((el) => {
                if (el.disabled || el.getAttribute('aria-hidden') === 'true') return false;
                const style = global.getComputedStyle(el);
                if (style.visibility === 'hidden' || style.display === 'none') return false;
                let node = el;
                while (node && node !== panel) {
                    if (node.hidden) return false;
                    node = node.parentElement;
                }
                return true;
            });
    }

    function setPanelOpen(page, open, opts) {
        const overlay = page.querySelector('#loginBgOverlay');
        const panel = page.querySelector('#loginBgPanel');
        const toggle = page.querySelector('#loginBgToggle');
        if (!overlay || !panel || !toggle) return;

        if (open) {
            overlay.hidden = false;
            panel.setAttribute('aria-modal', 'true');
            page.classList.add('login-bg-panel-open');
            document.body.classList.add('login-bg-modal-open');
            toggle.setAttribute('aria-expanded', 'true');
            page._loginBgPrevFocus = document.activeElement;
            global.requestAnimationFrame(() => {
                overlay.classList.add('is-open');
                const first = focusableIn(panel)[0] || panel;
                try {
                    first.focus();
                } catch (_) {
                    panel.focus();
                }
            });
        } else {
            overlay.classList.remove('is-open');
            panel.setAttribute('aria-modal', 'false');
            toggle.setAttribute('aria-expanded', 'false');
            page.classList.remove('login-bg-panel-open');
            document.body.classList.remove('login-bg-modal-open');
            const finish = () => {
                overlay.hidden = true;
                if (opts && opts.restoreFocus !== false) {
                    try {
                        (page._loginBgPrevFocus || toggle).focus();
                    } catch (_) {
                        toggle.focus();
                    }
                }
            };
            if (prefersReducedMotion()) finish();
            else global.setTimeout(finish, 200);
        }
    }

    function setBusy(panel, busy) {
        if (!panel) return;
        panel.setAttribute('aria-busy', busy ? 'true' : 'false');
        const applyBtn = panel.querySelector('#loginBgApply');
        if (applyBtn) applyBtn.disabled = Boolean(busy);
        const resetBtn = panel.querySelector('#loginBgUseSiteDefault');
        if (resetBtn) resetBtn.disabled = Boolean(busy);
    }

    async function persistAndApply(page, panel, asOverride) {
        const config = readPanelConfig(panel);
        setBusy(panel, true);
        try {
            if (asOverride) setLocalOverride(config);
            syncPanelFields(panel, config);
            await applyToPage(page, config);
            syncPanelFields(panel, config);
        } catch (err) {
            if (asOverride && err && err.code === 'BAD_URL') {
                clearLocalOverride();
            }
        } finally {
            setBusy(panel, false);
        }
    }

    function bindLoginPage(page) {
        if (!page || page.dataset.loginBgBound === '1') return;
        page.dataset.loginBgBound = '1';

        const panel = page.querySelector('#loginBgPanel');
        const toggle = page.querySelector('#loginBgToggle');
        const closeBtn = page.querySelector('#loginBgClose');
        const applyBtn = page.querySelector('#loginBgApply');
        const resetBtn = page.querySelector('#loginBgUseSiteDefault');

        if (getLocalOverride()) {
            page.classList.add('login-bg-pending');
        }

        const effective = getEffectiveConfig();
        if (panel) syncPanelFields(panel, getLocalOverride() || effective);
        applyToPage(page, effective).finally(() => {
            page.classList.remove('login-bg-pending');
            page.classList.add('login-bg-ready');
        });

        if (toggle) {
            toggle.addEventListener('click', () => {
                const isOpen = page.classList.contains('login-bg-panel-open');
                if (!isOpen && panel) {
                    syncPanelFields(panel, getLocalOverride() || getEffectiveConfig());
                }
                setPanelOpen(page, !isOpen);
            });
        }
        if (closeBtn) {
            closeBtn.addEventListener('click', () => setPanelOpen(page, false));
        }

        const overlay = page.querySelector('#loginBgOverlay');
        if (overlay) {
            overlay.addEventListener('pointerdown', (e) => {
                if (!page.classList.contains('login-bg-panel-open') || !panel) return;
                if (e.target === overlay) setPanelOpen(page, false);
            });
        }

        page.addEventListener('keydown', (e) => {
            if (!page.classList.contains('login-bg-panel-open') || !panel) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                setPanelOpen(page, false);
                return;
            }
            if (e.key !== 'Tab') return;
            const nodes = focusableIn(panel);
            if (!nodes.length) return;
            const first = nodes[0];
            const last = nodes[nodes.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        });

        if (panel) {
            panel.querySelectorAll('input[name="loginBgMode"]').forEach((input) => {
                input.addEventListener('change', () => {
                    syncPanelFields(panel, readPanelConfig(panel));
                });
            });

            panel.querySelectorAll('[data-login-bg-slider]').forEach((sliderRoot) => {
                const range = sliderRoot.querySelector('input[type="range"]');
                if (!range) return;
                updateSliderUi(sliderRoot, range.value);
                range.addEventListener('input', () => {
                    updateSliderUi(sliderRoot, range.value);
                });
                sliderRoot.querySelectorAll('.login-bg-tick').forEach((tick) => {
                    tick.addEventListener('click', () => {
                        const preset = tick.getAttribute('data-preset');
                        if (preset == null) return;
                        updateSliderUi(sliderRoot, preset);
                        range.dispatchEvent(new Event('input', { bubbles: true }));
                    });
                });
            });
        }

        if (applyBtn) {
            applyBtn.addEventListener('click', () => persistAndApply(page, panel, true));
        }
        if (resetBtn) {
            resetBtn.addEventListener('click', async () => {
                clearLocalOverride();
                writeJson(CACHE_KEY, null);
                const globalCfg = getGlobalConfig();
                if (panel) syncPanelFields(panel, globalCfg);
                setBusy(panel, true);
                try {
                    await applyToPage(page, globalCfg);
                } finally {
                    setBusy(panel, false);
                }
            });
        }
    }

    function fillFormFields(root, config) {
        const cfg = normalize(config);
        const mode = cfg.mode || 'imageUrl';
        root.querySelectorAll('input[name="siteLoginBgMode"]').forEach((input) => {
            input.checked = input.value === mode;
        });
        const map = {
            siteLoginBgImageUrl: cfg.imageUrl || DEFAULT_IMAGE_URL,
            siteLoginBgCollection: cfg.unsplashCollection,
            siteLoginBgRefresh: cfg.refresh,
            siteLoginBgBrightDark: cfg.brightnessDark,
            siteLoginBgBrightLight: cfg.brightnessLight,
            siteLoginBgBlur: cfg.blur
        };
        Object.keys(map).forEach((id) => {
            const el = root.querySelector('#' + id);
            if (el) el.value = map[id] == null ? '' : String(map[id]);
        });
        root.querySelectorAll('[data-site-login-bg-for]').forEach((block) => {
            block.hidden = block.getAttribute('data-site-login-bg-for') !== mode;
        });
    }

    function readFormFields(root) {
        const modeInput = root.querySelector('input[name="siteLoginBgMode"]:checked');
        return normalize({
            mode: modeInput ? modeInput.value : 'imageUrl',
            imageUrl: (root.querySelector('#siteLoginBgImageUrl') || {}).value,
            unsplashCollection: (root.querySelector('#siteLoginBgCollection') || {}).value,
            refresh: (root.querySelector('#siteLoginBgRefresh') || {}).value,
            brightnessDark: (root.querySelector('#siteLoginBgBrightDark') || {}).value,
            brightnessLight: (root.querySelector('#siteLoginBgBrightLight') || {}).value,
            blur: (root.querySelector('#siteLoginBgBlur') || {}).value
        });
    }

    function bindSettingsForm(root) {
        if (!root || root.dataset.loginBgSettingsBound === '1') return;
        root.dataset.loginBgSettingsBound = '1';
        root.querySelectorAll('input[name="siteLoginBgMode"]').forEach((input) => {
            input.addEventListener('change', () => {
                fillFormFields(root, readFormFields(root));
            });
        });
    }

    global.LoginBackground = {
        normalize,
        defaultConfig,
        getGlobalConfig,
        getLocalOverride,
        getEffectiveConfig,
        setLocalOverride,
        clearLocalOverride,
        applyToPage,
        bindLoginPage,
        fillFormFields,
        readFormFields,
        bindSettingsForm
    };
})(window);
