-- =============================================================================
-- 01_setup_extensions.sql
-- Ejecutar en Supabase SQL Editor (una sola vez)
-- Activa las extensiones necesarias para validacion espacial y ruteo
-- =============================================================================

-- Extension espacial (ya viene en Supabase, pero la aseguramos)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Ruteo sobre grafos viales
CREATE EXTENSION IF NOT EXISTS pgrouting;

-- Busqueda fuzzy por trigramas (pg_trgm)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Verificar versiones instaladas
SELECT
  name,
  default_version,
  installed_version
FROM pg_available_extensions
WHERE name IN ('postgis', 'pgrouting', 'pg_trgm')
ORDER BY name;
