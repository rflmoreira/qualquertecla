-- Newsletter / assinantes
-- Execute no SQL Editor do Supabase se o schema base já estiver aplicado.

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'unsubscribed')),
    source TEXT NOT NULL DEFAULT 'site'
        CHECK (char_length(source) BETWEEN 1 AND 40),
    subscribed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    unsubscribed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT newsletter_subscribers_email_format
        CHECK (email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'),
    CONSTRAINT newsletter_subscribers_email_len
        CHECK (char_length(email) BETWEEN 5 AND 120),
    CONSTRAINT newsletter_subscribers_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_status
    ON newsletter_subscribers (status);
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_subscribed_at
    ON newsletter_subscribers (subscribed_at DESC);

ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Sem SELECT/INSERT direto para anon: a inscrição passa pela RPC abaixo.
DROP POLICY IF EXISTS "Public can subscribe to newsletter" ON newsletter_subscribers;
DROP POLICY IF EXISTS "Public can reactivate newsletter subscription" ON newsletter_subscribers;
DROP POLICY IF EXISTS "Anon can lookup newsletter email" ON newsletter_subscribers;

DROP POLICY IF EXISTS "Authenticated can read newsletter subscribers" ON newsletter_subscribers;
CREATE POLICY "Authenticated can read newsletter subscribers"
    ON newsletter_subscribers
    FOR SELECT
    TO authenticated
    USING (true);

CREATE OR REPLACE FUNCTION public.subscribe_newsletter(p_email TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    normalized TEXT;
    existing newsletter_subscribers%ROWTYPE;
BEGIN
    normalized := lower(trim(p_email));

    IF normalized IS NULL
       OR char_length(normalized) < 5
       OR char_length(normalized) > 120
       OR normalized !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
    THEN
        RETURN json_build_object(
            'ok', false,
            'status', 'invalid_email',
            'message', 'Informe um e-mail válido.'
        );
    END IF;

    SELECT * INTO existing
    FROM newsletter_subscribers
    WHERE email = normalized
    LIMIT 1;

    IF FOUND THEN
        IF existing.status = 'active' THEN
            RETURN json_build_object(
                'ok', true,
                'status', 'already',
                'email', normalized,
                'subscribed_at', existing.subscribed_at
            );
        END IF;

        UPDATE newsletter_subscribers
        SET status = 'active',
            subscribed_at = NOW(),
            unsubscribed_at = NULL,
            source = 'site'
        WHERE email = normalized
        RETURNING * INTO existing;

        RETURN json_build_object(
            'ok', true,
            'status', 'subscribed',
            'email', normalized,
            'subscribed_at', existing.subscribed_at
        );
    END IF;

    INSERT INTO newsletter_subscribers (email, status, source)
    VALUES (normalized, 'active', 'site')
    RETURNING * INTO existing;

    RETURN json_build_object(
        'ok', true,
        'status', 'subscribed',
        'email', normalized,
        'subscribed_at', existing.subscribed_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.subscribe_newsletter(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscribe_newsletter(TEXT) TO anon, authenticated;
