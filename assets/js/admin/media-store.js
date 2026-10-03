/**
 * Resolução de referências media:// no markdown do editor.
 * Persistência de biblioteca de mídia (CRUD) foi removida — não havia UI consumidora.
 */
(function (global) {
    const STORAGE_KEY = 'qualquer-tecla_media_library';

    function readStore() {
        try {
            const raw = sessionStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    }

    function get(id) {
        return readStore().find((f) => f.id === id) || null;
    }

    /** Resolve media://id → URL real (data:/http/path). */
    function resolveUrl(ref) {
        if (!ref) return '';
        const m = String(ref).match(/^media:\/\/([A-Za-z0-9._:-]+)$/);
        if (!m) return ref;
        const record = get(m[1]);
        return record && record.url ? record.url : ref;
    }

    const MediaStore = {
        /** Expande media://… em links/imagens Markdown antes de renderizar. */
        resolveMarkdown(md) {
            return String(md || '').replace(
                /(!?\[[^\]]*\]\()(media:\/\/[^)\s]+)(\))/g,
                (_, open, ref, close) => open + resolveUrl(ref) + close
            );
        },

        /** Troca data: URLs conhecidas por media://id (encurta texto no editor). */
        compactMarkdown(md) {
            let out = String(md || '');
            if (!out.includes('data:')) return out;
            readStore().forEach((record) => {
                if (!record || !record.id || !record.url || !record.url.startsWith('data:')) return;
                if (!out.includes(record.url)) return;
                out = out.split(record.url).join('media://' + record.id);
            });
            return out;
        }
    };

    global.MediaStore = MediaStore;
})(window);
