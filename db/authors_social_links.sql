-- Redes sociais por autor (bloco "Sobre o autor" nas matérias)
-- Formato: array ordenado [{ id, label, url, icon }, ...]

ALTER TABLE authors
    ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '[]'::jsonb;

UPDATE authors
SET social_links = '[]'::jsonb
WHERE social_links IS NULL;
