/**
 * Configuração do Cliente Supabase
 *
 * NÃO conecte credenciais reais neste arquivo durante o protótipo.
 * Quando for integrar:
 * 1. Substitua URL e anon key (via env/build, nunca service_role no front).
 * 2. O SDK só é baixado se as credenciais NÃO forem placeholder.
 * 3. A API em assets/js/api.js passa a usar o remoto sem misturar com mock.
 */
(function (global) {
    const SUPABASE_URL = 'https://SUA_URL_DO_SUPABASE.supabase.co';
    const SUPABASE_ANON_KEY = 'SUA_CHAVE_ANON_DO_SUPABASE';
    const SUPABASE_CDN =
        'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

    global.SUPABASE_READY = false;
    global.supabaseClient = null;

    function isPlaceholder() {
        return (
            !SUPABASE_URL ||
            SUPABASE_URL.includes('SUA_URL') ||
            !SUPABASE_ANON_KEY ||
            SUPABASE_ANON_KEY.includes('SUA_CHAVE')
        );
    }

    function activateClient() {
        if (!global.supabase || typeof global.supabase.createClient !== 'function') {
            return false;
        }
        global.supabaseClient = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        global.SUPABASE_READY = true;
        console.info('[Qualquer Tecla] Supabase client ativo.');
        return true;
    }

    function loadSdkThenActivate() {
        return new Promise((resolve) => {
            if (global.supabase && typeof global.supabase.createClient === 'function') {
                resolve(activateClient());
                return;
            }
            const existing = document.querySelector('script[data-qt-supabase-sdk]');
            if (existing) {
                existing.addEventListener('load', () => resolve(activateClient()));
                existing.addEventListener('error', () => resolve(false));
                return;
            }
            const s = document.createElement('script');
            s.src = SUPABASE_CDN;
            s.async = true;
            s.dataset.qtSupabaseSdk = '1';
            s.onload = () => resolve(activateClient());
            s.onerror = () => {
                console.error('[Qualquer Tecla] Falha ao carregar Supabase SDK.');
                resolve(false);
            };
            document.head.appendChild(s);
        });
    }

    try {
        if (isPlaceholder()) {
            console.info('[Qualquer Tecla] Modo mock — Supabase não configurado.');
        } else {
            loadSdkThenActivate().catch((error) => {
                console.error('[Qualquer Tecla] Erro ao inicializar Supabase:', error);
                global.supabaseClient = null;
                global.SUPABASE_READY = false;
            });
        }
    } catch (error) {
        console.error('[Qualquer Tecla] Erro ao inicializar Supabase:', error);
        global.supabaseClient = null;
        global.SUPABASE_READY = false;
    }
})(window);
