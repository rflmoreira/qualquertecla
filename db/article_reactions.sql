-- Reações de artigos (Qualquer Tecla)
-- Execute no SQL Editor do Supabase após o schema base.

CREATE TABLE IF NOT EXISTS article_reactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_slug TEXT NOT NULL,
    article_id UUID REFERENCES articles(id) ON DELETE SET NULL,
    reaction TEXT NOT NULL CHECK (reaction IN ('ace', 'love', 'urgh', 'omg', 'lol')),
    device_id TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT article_reactions_slug_len CHECK (char_length(article_slug) BETWEEN 1 AND 200),
    CONSTRAINT article_reactions_device_len CHECK (char_length(device_id) BETWEEN 8 AND 128),
    CONSTRAINT article_reactions_unique_device UNIQUE (article_slug, device_id)
);

CREATE INDEX IF NOT EXISTS idx_article_reactions_slug ON article_reactions (article_slug);
CREATE INDEX IF NOT EXISTS idx_article_reactions_reaction ON article_reactions (reaction);
CREATE INDEX IF NOT EXISTS idx_article_reactions_created_at ON article_reactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_article_reactions_slug_reaction ON article_reactions (article_slug, reaction);

ALTER TABLE article_reactions ENABLE ROW LEVEL SECURITY;

-- Contagens públicas via função (não expõe device_id)
CREATE OR REPLACE FUNCTION public.get_article_reaction_counts(p_slug TEXT)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (
            SELECT json_object_agg(reaction, cnt)
            FROM (
                SELECT reaction, COUNT(*)::int AS cnt
                FROM article_reactions
                WHERE article_slug = p_slug
                GROUP BY reaction
            ) s
        ),
        '{}'::json
    );
$$;

CREATE OR REPLACE FUNCTION public.get_my_article_reaction(p_slug TEXT, p_device_id TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT reaction
    FROM article_reactions
    WHERE article_slug = p_slug
      AND device_id = p_device_id
    LIMIT 1;
$$;

-- Métricas agregadas para o admin (também utilizável com anon key se necessário;
-- a UI admin autentica quando disponível e filtra no cliente por período)
CREATE OR REPLACE FUNCTION public.get_reaction_metrics(
    p_from TIMESTAMPTZ DEFAULT NULL,
    p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSON;
BEGIN
    WITH filtered AS (
        SELECT *
        FROM article_reactions
        WHERE (p_from IS NULL OR created_at >= p_from)
          AND (p_to IS NULL OR created_at <= p_to)
    ),
    by_reaction AS (
        SELECT reaction, COUNT(*)::int AS cnt
        FROM filtered
        GROUP BY reaction
    ),
    by_article AS (
        SELECT
            article_slug,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE reaction = 'ace')::int AS ace,
            COUNT(*) FILTER (WHERE reaction = 'love')::int AS love,
            COUNT(*) FILTER (WHERE reaction = 'urgh')::int AS urgh,
            COUNT(*) FILTER (WHERE reaction = 'omg')::int AS omg,
            COUNT(*) FILTER (WHERE reaction = 'lol')::int AS lol
        FROM filtered
        GROUP BY article_slug
    ),
    totals AS (
        SELECT
            COALESCE(SUM(cnt), 0)::int AS total,
            COALESCE(SUM(cnt) FILTER (WHERE reaction = 'ace'), 0)::int AS ace,
            COALESCE(SUM(cnt) FILTER (WHERE reaction = 'love'), 0)::int AS love,
            COALESCE(SUM(cnt) FILTER (WHERE reaction = 'urgh'), 0)::int AS urgh,
            COALESCE(SUM(cnt) FILTER (WHERE reaction = 'omg'), 0)::int AS omg,
            COALESCE(SUM(cnt) FILTER (WHERE reaction = 'lol'), 0)::int AS lol
        FROM by_reaction
    ),
    top_reaction AS (
        SELECT reaction
        FROM by_reaction
        ORDER BY cnt DESC, reaction ASC
        LIMIT 1
    )
    SELECT json_build_object(
        'total', (SELECT total FROM totals),
        'counts', json_build_object(
            'ace', (SELECT ace FROM totals),
            'love', (SELECT love FROM totals),
            'urgh', (SELECT urgh FROM totals),
            'omg', (SELECT omg FROM totals),
            'lol', (SELECT lol FROM totals)
        ),
        'top_reaction', (SELECT reaction FROM top_reaction),
        'articles', COALESCE(
            (
                SELECT json_agg(row_to_json(a) ORDER BY a.total DESC, a.article_slug ASC)
                FROM by_article a
            ),
            '[]'::json
        )
    )
    INTO result;

    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_article_reaction_counts(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_article_reaction(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_reaction_metrics(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_article_reaction_counts(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_article_reaction(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_reaction_metrics(TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated;

DROP POLICY IF EXISTS "Public can insert article reactions" ON article_reactions;
CREATE POLICY "Public can insert article reactions"
    ON article_reactions
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (
        reaction IN ('ace', 'love', 'urgh', 'omg', 'lol')
        AND char_length(device_id) BETWEEN 8 AND 128
        AND char_length(article_slug) BETWEEN 1 AND 200
    );

DROP POLICY IF EXISTS "Authenticated can read article reactions" ON article_reactions;
CREATE POLICY "Authenticated can read article reactions"
    ON article_reactions
    FOR SELECT
    TO authenticated
    USING (true);

-- Sem UPDATE/DELETE públicos: 1 voto por dispositivo/artigo (constraint UNIQUE).
