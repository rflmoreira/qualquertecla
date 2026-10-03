/**
 * Stub de autenticação do admin (PROTOTIPO / DESENVOLVIMENTO LOCAL).
 *
 * NÃO é autenticação de produção. Qualquer e-mail/senha válidos liberam o painel
 * via sessionStorage no browser — facilmente contornável.
 *
 * Produção (Netlify): `/admin/*` e `/admin.html` retornam 404 (force) — o painel
 * não é publicado. A API `/api/google-images/search` exige auth server-side
 * (`scripts/admin-auth.mjs`: JWT Supabase ou QT_ALLOW_LOCAL_ADMIN_API só no serve local).
 *
 * PENDÊNCIA para CMS real: Supabase Auth + RLS + autorização nas functions —
 * sem ativar SUPABASE_READY no frontend até autorização explícita.
 */
(function (global) {
    const KEY = 'qualquer-tecla_admin_session';

    function adminLoginUrl() {
        try {
            const path = String((global.location && global.location.pathname) || '');
            const marker = '/admin/';
            const idx = path.lastIndexOf(marker);
            if (idx !== -1) {
                return path.slice(0, idx + marker.length) + 'index.html';
            }
            if (path.endsWith('/admin') || path.endsWith('/admin.html')) {
                return 'admin/index.html';
            }
        } catch (_) {
            /* ignore */
        }
        return '/admin/index.html';
    }

    /**
     * URL absoluta do dashboard — evita resolver `dashboard.html` como `/dashboard.html`
     * quando a página de login é servida em `/admin` (sem barra final).
     */
    function adminDashboardUrl() {
        try {
            const path = String((global.location && global.location.pathname) || '');
            const marker = '/admin/';
            const idx = path.lastIndexOf(marker);
            if (idx !== -1) {
                return path.slice(0, idx + marker.length) + 'dashboard.html';
            }
            if (path.endsWith('/admin') || path.endsWith('/admin.html')) {
                return path.endsWith('/admin.html') ? 'admin/dashboard.html' : '/admin/dashboard.html';
            }
        } catch (_) {
            /* ignore */
        }
        return '/admin/dashboard.html';
    }

    const AdminAuth = {
        isLoggedIn() {
            try {
                const raw = sessionStorage.getItem(KEY);
                if (!raw) return false;
                const data = JSON.parse(raw);
                return !!(data && data.email);
            } catch (_) {
                return false;
            }
        },

        getSession() {
            try {
                return JSON.parse(sessionStorage.getItem(KEY) || 'null');
            } catch (_) {
                return null;
            }
        },

        /**
         * Login mock (protótipo). Se SUPABASE_READY no futuro, usa auth real.
         * Não trate sessionStorage / redirects client-side como segurança.
         */
        async login(email, password) {
            if (window.SUPABASE_READY && window.supabaseClient) {
                const { data, error } = await window.supabaseClient.auth.signInWithPassword({
                    email,
                    password
                });
                if (error) throw error;
                sessionStorage.setItem(
                    KEY,
                    JSON.stringify({ email: data.user.email, mode: 'supabase' })
                );
                return data;
            }

            // Mock: aceita qualquer e-mail/senha não vazios — só para UX de protótipo
            if (!email || !password) {
                throw new Error('Informe e-mail e senha.');
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                throw new Error('E-mail inválido.');
            }
            sessionStorage.setItem(
                KEY,
                JSON.stringify({ email, mode: 'mock', at: Date.now() })
            );
            return { user: { email } };
        },

        async logout() {
            if (window.SUPABASE_READY && window.supabaseClient) {
                await window.supabaseClient.auth.signOut();
            }
            sessionStorage.removeItem(KEY);
        },

        /**
         * Gate de UI apenas (redirect client-side). Contornável — não é auth real.
         */
        requireAuth() {
            if (this.isLoggedIn()) {
                document.body.classList.add('admin-ready');
                return true;
            }
            window.location.href = adminLoginUrl();
            return false;
        },

        adminLoginUrl,
        adminDashboardUrl
    };

    global.AdminAuth = AdminAuth;
})(window);
