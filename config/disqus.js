/**
 * Configuração do Disqus (protótipo).
 *
 * Substitua DISQUS_SHORTNAME pelo shortname real do fórum no Disqus Admin
 * (ex.: o valor em seuforum.disqus.com/admin). Enquanto for vazio ou
 * contiver "SUA_", o embed não carrega e o painel mostra o fallback.
 */
(function (global) {
    const DISQUS_SHORTNAME = '';

    global.DISQUS_SHORTNAME = DISQUS_SHORTNAME;
    global.DISQUS_ENABLED = Boolean(
        DISQUS_SHORTNAME && !String(DISQUS_SHORTNAME).includes('SUA_')
    );
})(window);
