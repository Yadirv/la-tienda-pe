-- =============================================================================
-- 02_nomenclatura_igac.sql  (ACTUALIZADO)
-- Tabla para los registros del AMV: Medellín + municipios aledaños
-- Fuente: MapServer Catastro / Capa Nomenclatura Domiciliaria (Layer 8 Medellín)
--         + Envigado, Sabaneta, Itagüí, Caldas (portal Metropol / Antioquia)
-- =============================================================================

DROP VIEW IF EXISTS public.v_municipios CASCADE;
DROP TABLE IF EXISTS public.nomenclatura_igac CASCADE;

CREATE TABLE public.nomenclatura_igac (
  id             bigserial    PRIMARY KEY,
  codigo_igac    text,
  departamento   text,
  municipio      text,         -- Medellin, Envigado, Itagui, Sabaneta, Caldas...
  barrio         text,
  via            text,         -- Tipo de via abreviado (CL, CR, DG, TV, AV…)
  placa          text,         -- Direccion completa: "CL 10A # 43 - 2"
  numero_placa   text,         -- Numero de placa extendido (uso Medellin)
  observaciones  text,
  latitud        float8,       -- Coordenada Y WGS84
  longitud       float8        -- Coordenada X WGS84
);

-- -----------------------------------------------------------------------
-- Indices de rendimiento
-- -----------------------------------------------------------------------

-- Fuzzy search sobre placa completa (dirección)
CREATE INDEX IF NOT EXISTS idx_nom_placa_trgm
  ON public.nomenclatura_igac
  USING gin (lower(placa) gin_trgm_ops);

-- Búsqueda exacta por municipio
CREATE INDEX IF NOT EXISTS idx_nom_municipio
  ON public.nomenclatura_igac (lower(municipio));

-- -----------------------------------------------------------------------
-- Vista de municipios únicos del AMV para el <select> del checkout
-- -----------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_municipios AS
SELECT 'Medellín' AS municipio_original, 'medellin' AS municipio_key
UNION ALL SELECT 'Envigado', 'envigado'
UNION ALL SELECT 'Itagüí', 'itagui'
UNION ALL SELECT 'Sabaneta', 'sabaneta'
UNION ALL SELECT 'La Estrella', 'la estrella'
UNION ALL SELECT 'Caldas', 'caldas'
UNION ALL SELECT 'Bello', 'bello'
ORDER BY municipio_original;

-- Verificar
SELECT 'nomenclatura_igac creada OK' AS status;
