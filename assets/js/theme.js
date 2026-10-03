/**
 * Tema claro/escuro — aplica cedo (antes do paint) e persiste a preferência.
 * Padrão: escuro. Só muda após escolha explícita do usuário.
 * Páginas também incluem um guard inline no <head> para evitar FOUC.
 */
(function (global) {
    const STORAGE_KEY = 'qualquer-tecla-theme';
    const root = document.documentElement;

    function readStored() {
        try {
            const value = localStorage.getItem(STORAGE_KEY);
            if (value === 'dark' || value === 'light') return value;
        } catch (_) {
            /* private mode / storage bloqueado */
        }
        return null;
    }

    function getTheme() {
        const attr = root.getAttribute('data-theme');
        if (attr === 'dark' || attr === 'light') return attr;
        return readStored() || 'dark';
    }

    function syncControls(theme) {
        const isDark = theme === 'dark';
        const label = isDark ? 'Ativar modo claro' : 'Ativar modo escuro';
        document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
            btn.setAttribute('aria-label', label);
            btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
            btn.setAttribute('title', label);
            const icon = btn.querySelector('i');
            if (icon) {
                const size = /\bfs-5\b/.test(icon.className) ? 'fs-5' : 'fs-4';
                icon.className = isDark ? `ph ph-sun ${size}` : `ph ph-moon ${size}`;
                icon.setAttribute('aria-hidden', 'true');
            }
            const text = btn.querySelector('[data-theme-label]');
            if (text) text.textContent = isDark ? 'Modo claro' : 'Modo escuro';
        });
    }

    function apply(theme) {
        const next = theme === 'dark' ? 'dark' : 'light';
        root.setAttribute('data-theme', next);
        try {
            root.style.colorScheme = next;
        } catch (_) {
            /* ignore */
        }
        syncControls(next);
        try {
            global.dispatchEvent(new CustomEvent('qualquer-tecla:themechange', { detail: { theme: next } }));
        } catch (_) {
            /* ignore */
        }
        return next;
    }

    function setTheme(theme) {
        const next = theme === 'dark' ? 'dark' : 'light';
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch (_) {
            /* private mode / storage bloqueado — tema ainda aplica na sessão */
        }
        return apply(next);
    }

    function toggle() {
        return setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    }

    function bindToggles(rootEl) {
        const scope = rootEl || document;
        scope.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
            if (btn.dataset.themeBound === '1') return;
            btn.dataset.themeBound = '1';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                toggle();
                btn.blur();
            });
        });
        syncControls(getTheme());
    }

    // Reaplica (honra storage; se inline já setou, confirma consistência)
    apply(readStored() || getTheme() || 'dark');

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => bindToggles(document));
    } else {
        bindToggles(document);
    }

    /**
     * Reveal Phosphor glyphs only after the icon fonts load.
     * Avoids PUA "tofu" squares; do not wait on document.fonts.ready (Google Fonts).
     * Self-hosted fonts + short timeout + window load keep icons from staying hidden.
     */
    (function markPhosphorReady() {
        const READY_CLASS = 'ph-icons-ready';
        const TIMEOUT_MS = 900;

        function reveal() {
            root.classList.add(READY_CLASS);
        }

        if (!document.fonts || typeof document.fonts.load !== 'function') {
            reveal();
            return;
        }

        let settled = false;
        function done() {
            if (settled) return;
            settled = true;
            reveal();
        }

        const timer = global.setTimeout(done, TIMEOUT_MS);
        Promise.all([
            document.fonts.load('1em Phosphor'),
            document.fonts.load('1em Phosphor-Fill')
        ])
            .then(done, done)
            .finally(() => global.clearTimeout(timer));

        global.addEventListener('load', done, { once: true });
    })();

    global.SiteTheme = {
        get: getTheme,
        set: setTheme,
        toggle,
        apply,
        bindToggles,
        STORAGE_KEY
    };
})(window);
