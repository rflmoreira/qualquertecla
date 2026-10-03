-- Migração isolada: redes sociais em site_settings
-- Execute no SQL Editor do Supabase se o schema base já estiver aplicado.

-- Formato de social_links: array ordenado
-- [{ "id", "label", "url", "icon", "enabled" }, ...]

ALTER TABLE site_settings
    ALTER COLUMN social_links SET DEFAULT '[]'::jsonb;

UPDATE site_settings
SET social_links = '[
  {"id":"twitch","label":"Twitch","url":"https://www.twitch.tv","icon":"ph-twitch-logo","enabled":true},
  {"id":"youtube","label":"YouTube","url":"https://www.youtube.com","icon":"ph-youtube-logo","enabled":true},
  {"id":"facebook","label":"Facebook","url":"https://www.facebook.com","icon":"ph-facebook-logo","enabled":true},
  {"id":"instagram","label":"Instagram","url":"https://www.instagram.com","icon":"ph-instagram-logo","enabled":true},
  {"id":"x","label":"X","url":"https://x.com","icon":"ph-x-logo","enabled":true},
  {"id":"spotify","label":"Spotify","url":"https://open.spotify.com","icon":"ph-spotify-logo","enabled":true}
]'::jsonb
WHERE id = 1
  AND (
    social_links IS NULL
    OR social_links = '{}'::jsonb
    OR social_links = '[]'::jsonb
    OR jsonb_typeof(social_links) <> 'array'
  );

DROP POLICY IF EXISTS "Admins can update site settings" ON site_settings;
CREATE POLICY "Admins can update site settings"
    ON site_settings
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

DROP TRIGGER IF EXISTS update_site_settings_modtime ON site_settings;
CREATE TRIGGER update_site_settings_modtime
    BEFORE UPDATE ON site_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();
