/**
 * Formatação compartilhada (datas, etc.)
 */
(function (global) {
    function formatDate(dateString, withTime) {
        if (!dateString) return '';
        const options = withTime
            ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
            : { day: 'numeric', month: 'short', year: 'numeric' };
        return new Date(dateString).toLocaleDateString('pt-BR', options);
    }

    /** Formato editorial: 14.07.2026, às 12H46. */
    function formatArticleDateTime(dateString) {
        if (!dateString) return '';
        const d = new Date(dateString);
        if (Number.isNaN(d.getTime())) return '';
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, às ${pad(d.getHours())}H${pad(d.getMinutes())}.`;
    }

    global.Format = { formatDate, formatArticleDateTime };
})(window);
