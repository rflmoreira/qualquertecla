/**
 * Consentimento de cookies — banner/preferências alinhado ao layout público.
 * Persiste a escolha, expõe API e só libera analytics/marketing após opt-in.
 */
(function (global) {
    const STORAGE_KEY = 'qualquer-tecla-consent';
    const VERSION = 1;

    const DEFAULT = Object.freeze({
        version: VERSION,
        necessary: true,
        analytics: false,
        marketing: false,
        updatedAt: null
    });

    let state = null;
    let rootEl = null;
    let prefsOpen = false;
    let focusReturn = null;
    const listeners = new Set();

    function pageUrl(file) {
        const base = global.SITE_BASE || '';
        return `${base}${file}`;
    }

    function readStored() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            if (Number(parsed.version) !== VERSION) return null;
            return {
                version: VERSION,
                necessary: true,
                analytics: Boolean(parsed.analytics),
                marketing: Boolean(parsed.marketing),
                updatedAt: parsed.updatedAt || null
            };
        } catch (_) {
            return null;
        }
    }

    function writeStored(prefs) {
        const next = {
            version: VERSION,
            necessary: true,
            analytics: Boolean(prefs.analytics),
            marketing: Boolean(prefs.marketing),
            updatedAt: new Date().toISOString()
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch (_) {
            /* private mode — aplica só na sessão */
        }
        state = next;
        return next;
    }

    function getConsent() {
        if (state) return { ...state };
        state = readStored();
        return state ? { ...state } : { ...DEFAULT };
    }

    function hasChoice() {
        return Boolean(readStored() || (state && state.updatedAt));
    }

    function allows(category) {
        const c = getConsent();
        if (category === 'necessary') return true;
        if (category === 'analytics') return Boolean(c.analytics);
        if (category === 'marketing') return Boolean(c.marketing);
        return false;
    }

    function emit(next) {
        try {
            global.dispatchEvent(
                new CustomEvent('qualquer-tecla:consentchange', { detail: { consent: { ...next } } })
            );
        } catch (_) {
            /* ignore */
        }
        listeners.forEach((fn) => {
            try {
                fn({ ...next });
            } catch (_) {
                /* ignore */
            }
        });
        applyScriptGates(next);
    }

    function onChange(fn) {
        if (typeof fn === 'function') listeners.add(fn);
        return () => listeners.delete(fn);
    }

    function applyScriptGates(prefs) {
        document.documentElement.setAttribute(
            'data-consent-analytics',
            prefs.analytics ? '1' : '0'
        );
        document.documentElement.setAttribute(
            'data-consent-marketing',
            prefs.marketing ? '1' : '0'
        );

        if (!prefs.analytics) {
            document
                .querySelectorAll('script[data-consent-category="analytics"]')
                .forEach((el) => el.remove());
        }
        if (!prefs.marketing) {
            document
                .querySelectorAll('script[data-consent-category="marketing"]')
                .forEach((el) => el.remove());
            const disqusEmbed = document.getElementById('disqus-embed-js');
            const disqusCount = document.getElementById('dsq-count-scr');
            if (disqusEmbed) disqusEmbed.remove();
            if (disqusCount) disqusCount.remove();
            if (global.DISQUS) {
                try {
                    delete global.DISQUS;
                } catch (_) {
                    global.DISQUS = undefined;
                }
            }
        }

        runPendingScripts(prefs);
    }

    function runPendingScripts(prefs) {
        document.querySelectorAll('script[type="text/plain"][data-consent-category]').forEach((node) => {
            const cat = node.getAttribute('data-consent-category');
            const allowed =
                cat === 'necessary' ||
                (cat === 'analytics' && prefs.analytics) ||
                (cat === 'marketing' && prefs.marketing);
            if (!allowed || node.dataset.consentActivated === '1') return;
            node.dataset.consentActivated = '1';
            const s = document.createElement('script');
            Array.from(node.attributes).forEach((attr) => {
                if (attr.name === 'type') return;
                if (attr.name === 'data-consent-activated') return;
                s.setAttribute(attr.name, attr.value);
            });
            s.type = node.getAttribute('data-consent-type') || 'text/javascript';
            if (node.src) s.src = node.src;
            else s.textContent = node.textContent;
            node.parentNode.insertBefore(s, node.nextSibling);
        });
    }

    function acceptAll() {
        const next = writeStored({ analytics: true, marketing: true });
        emit(next);
        hideBanner();
        return next;
    }

    function rejectOptional() {
        const next = writeStored({ analytics: false, marketing: false });
        emit(next);
        hideBanner();
        return next;
    }

    function saveCustom(partial) {
        const next = writeStored({
            analytics: Boolean(partial && partial.analytics),
            marketing: Boolean(partial && partial.marketing)
        });
        emit(next);
        hideBanner();
        return next;
    }

    function markup() {
        const privacy = pageUrl('politica-privacidade.html');
        return `
<div class="consent-root" id="consentRoot" hidden>
  <div
    class="consent-panel"
    id="consentPanel"
    role="dialog"
    aria-modal="true"
    aria-labelledby="consentTitle"
    aria-describedby="consentDesc"
    tabindex="-1"
  >
    <div class="consent-deco" aria-hidden="true">
      <i class="ph-fill ph-cookie"></i>
    </div>
    <div class="consent-main">
      <div class="consent-copy">
        <h2 class="consent-title font-editorial" id="consentTitle">Cookies e privacidade</h2>
        <p class="consent-desc" id="consentDesc">
          Usamos cookies necessários para o site funcionar e, com o seu consentimento,
          cookies de analytics e marketing para melhorar a experiência.
          Consulte a
          <a class="consent-link" href="${privacy}">Política de Privacidade</a>.
        </p>
      </div>
      <div class="consent-actions" role="group" aria-label="Opções de cookies">
        <button type="button" class="consent-btn-text" data-consent-action="preferences">Preferências</button>
        <button type="button" class="btn btn-outline-ink" data-consent-action="necessary">Só necessários</button>
        <button type="button" class="btn btn-gold" data-consent-action="accept">Aceitar todos</button>
      </div>
    </div>

    <div class="consent-prefs" id="consentPrefs" hidden>
      <div class="consent-prefs-divider" aria-hidden="true"></div>
      <ul class="consent-cats" role="list">
        <li class="consent-cat">
          <div class="consent-cat-copy">
            <p class="consent-cat-title">Cookies necessários</p>
            <p class="consent-cat-desc">Essenciais para navegação, segurança e preferências básicas (tema e consentimento).</p>
          </div>
          <span class="consent-badge">Sempre ativos</span>
        </li>
        <li class="consent-cat">
          <div class="consent-cat-copy">
            <p class="consent-cat-title">Analytics</p>
            <p class="consent-cat-desc">Ajudam a entender o uso do site de forma agregada, sem venda de dados pessoais.</p>
          </div>
          <div class="form-check form-switch consent-switch m-0">
            <input class="form-check-input" type="checkbox" role="switch" id="consentAnalytics" data-consent-toggle="analytics" aria-label="Ativar cookies de analytics">
          </div>
        </li>
        <li class="consent-cat">
          <div class="consent-cat-copy">
            <p class="consent-cat-title">Marketing</p>
            <p class="consent-cat-desc">Permitem recursos de terceiros, como comentários e mídia incorporada quando disponíveis.</p>
          </div>
          <div class="form-check form-switch consent-switch m-0">
            <input class="form-check-input" type="checkbox" role="switch" id="consentMarketing" data-consent-toggle="marketing" aria-label="Ativar cookies de marketing">
          </div>
        </li>
      </ul>
      <div class="consent-prefs-footer">
        <button type="button" class="btn btn-gold" data-consent-action="save">Salvar</button>
      </div>
    </div>
  </div>
</div>`;
    }

    function syncTogglesFromState() {
        const c = getConsent();
        const analytics = document.getElementById('consentAnalytics');
        const marketing = document.getElementById('consentMarketing');
        if (analytics) analytics.checked = Boolean(c.analytics);
        if (marketing) marketing.checked = Boolean(c.marketing);
    }

    function setPrefsVisible(open) {
        prefsOpen = Boolean(open);
        const prefs = document.getElementById('consentPrefs');
        const panel = document.getElementById('consentPanel');
        if (prefs) prefs.hidden = !prefsOpen;
        if (panel) panel.classList.toggle('is-expanded', prefsOpen);
        const prefsBtn = rootEl && rootEl.querySelector('[data-consent-action="preferences"]');
        if (prefsBtn) {
            prefsBtn.setAttribute('aria-expanded', prefsOpen ? 'true' : 'false');
        }
        if (prefsOpen) syncTogglesFromState();
        if (global.SiteScrollbar && typeof global.SiteScrollbar.refresh === 'function') {
            global.SiteScrollbar.refresh();
        }
    }

    function showBanner(opts) {
        const options = opts || {};
        if (!rootEl) return;
        focusReturn = document.activeElement;
        rootEl.hidden = false;
        rootEl.classList.toggle('consent-root--manage', Boolean(options.manage));
        setPrefsVisible(Boolean(options.preferences));
        syncTogglesFromState();
        try {
            global.dispatchEvent(
                new CustomEvent('qualquer-tecla:consentbanner', { detail: { open: true } })
            );
        } catch (_) {
            /* ignore */
        }
        const panel = document.getElementById('consentPanel');
        requestAnimationFrame(() => {
            if (panel) panel.focus({ preventScroll: true });
        });
    }

    function hideBanner() {
        if (!rootEl) return;
        rootEl.hidden = true;
        rootEl.classList.remove('consent-root--manage');
        setPrefsVisible(false);
        try {
            global.dispatchEvent(
                new CustomEvent('qualquer-tecla:consentbanner', { detail: { open: false } })
            );
        } catch (_) {
            /* ignore */
        }
        if (focusReturn && typeof focusReturn.focus === 'function') {
            try {
                focusReturn.focus({ preventScroll: true });
            } catch (_) {
                /* ignore */
            }
        }
        focusReturn = null;
    }

    function openPreferences() {
        showBanner({ manage: hasChoice(), preferences: true });
    }

    function bind() {
        if (!rootEl || rootEl.dataset.bound === '1') return;
        rootEl.dataset.bound = '1';

        rootEl.addEventListener('click', (e) => {
            const actionEl = e.target.closest('[data-consent-action]');
            if (actionEl) {
                const action = actionEl.getAttribute('data-consent-action');
                if (action === 'preferences') {
                    setPrefsVisible(!prefsOpen);
                    actionEl.blur();
                    return;
                }
                if (action === 'necessary') {
                    rejectOptional();
                    actionEl.blur();
                    return;
                }
                if (action === 'accept') {
                    acceptAll();
                    actionEl.blur();
                    return;
                }
                if (action === 'save') {
                    const analytics = document.getElementById('consentAnalytics');
                    const marketing = document.getElementById('consentMarketing');
                    saveCustom({
                        analytics: analytics ? analytics.checked : false,
                        marketing: marketing ? marketing.checked : false
                    });
                    actionEl.blur();
                }
            }
        });

        document.addEventListener('keydown', (e) => {
            if (!rootEl || rootEl.hidden) return;
            if (e.key === 'Escape') {
                if (rootEl.classList.contains('consent-root--manage')) {
                    hideBanner();
                } else if (prefsOpen) {
                    setPrefsVisible(false);
                }
                return;
            }
            if (e.key !== 'Tab') return;
            const panel = document.getElementById('consentPanel') || rootEl;
            const focusables = [...panel.querySelectorAll(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )].filter((el) => el.offsetParent !== null || el === document.activeElement);
            if (!focusables.length) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey) {
                if (document.activeElement === first || !panel.contains(document.activeElement)) {
                    e.preventDefault();
                    last.focus();
                }
            } else if (document.activeElement === last || !panel.contains(document.activeElement)) {
                e.preventDefault();
                first.focus();
            }
        });
    }

    function mount() {
        if (document.body && document.body.classList.contains('admin-page')) return;
        if (document.getElementById('consentRoot')) {
            rootEl = document.getElementById('consentRoot');
            bind();
        } else {
            const wrap = document.createElement('div');
            wrap.innerHTML = markup().trim();
            rootEl = wrap.firstElementChild;
            document.body.appendChild(rootEl);
            bind();
        }

        const prefsBtn = rootEl.querySelector('[data-consent-action="preferences"]');
        if (prefsBtn) prefsBtn.setAttribute('aria-controls', 'consentPrefs');

        const stored = readStored();
        if (stored) {
            state = stored;
            applyScriptGates(stored);
        } else {
            state = { ...DEFAULT };
            applyScriptGates(state);
            showBanner({ preferences: false });
        }
    }

    // Aplica cedo se já houver escolha (antes do mount visual)
    const early = readStored();
    if (early) {
        state = early;
        applyScriptGates(early);
    } else {
        document.documentElement.setAttribute('data-consent-analytics', '0');
        document.documentElement.setAttribute('data-consent-marketing', '0');
    }

    global.SiteConsent = {
        STORAGE_KEY,
        get: getConsent,
        hasChoice,
        allows,
        acceptAll,
        rejectOptional,
        save: saveCustom,
        open: openPreferences,
        close: hideBanner,
        mount,
        onChange
    };
})(window);
