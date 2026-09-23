-- =============================================================================
-- sql/06_functions_helpers.sql
-- Funciones SQL auxiliares para las Supabase Edge Functions
-- Ejecutar en Supabase SQL Editor ANTES de desplegar las Edge Functions
-- =============================================================================

-- ---------------------------------------------------------------------------
-- fn_validate_spatial
-- Dado un punto lat/lon, retorna la direccion mas cercana en nomenclatura_geom
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_validate_spatial(
  p_lon float8,
  p_lat float8
)
RETURNS TABLE (
  id       bigint,
  municipio text,
  barrio    text,
  geom_wkt  text,
  distancia_m float8
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    g.id::bigint,
    g.municipio::text,
    g.barrio::text,
    ST_AsText(g.geom)::text AS geom_wkt,
    ST_Distance(
      g.geom::geography,
      ST_SetSRID(ST_Point(p_lon, p_lat), 4326)::geography
    ) AS distancia_m
  FROM public.nomenclatura_geom g
  WHERE ST_DWithin(
    g.geom::geography,
    ST_SetSRID(ST_Point(p_lon, p_lat), 4326)::geography,
    500   -- radio de busqueda en metros
  )
  ORDER BY distancia_m ASC
  LIMIT 3;
$$;

-- ---------------------------------------------------------------------------
-- fn_calculate_route
-- Calcula la ruta minima entre dos nodos de la red vial con pgr_dijkstra
-- Retorna GeoJSON de la linea y la distancia total en metros
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_calculate_route(
  p_start integer,
  p_end   integer
)
RETURNS TABLE (
  geojson    text,
  distance_m float8
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_geojson  text;
  v_distance float8;
BEGIN
  SELECT
    ST_AsGeoJSON(ST_MakeLine(ARRAY_AGG(r.geom ORDER BY dij.path_seq)))::text,
    SUM(r.cost * ST_Length(r.geom::geography))
  INTO v_geojson, v_distance
  FROM pgr_dijkstra(
    'SELECT id, source, target, cost, reverse_cost FROM public.roads',
    p_start,
    p_end,
    directed := false
  ) AS dij
  JOIN public.roads r ON r.id = dij.edge
  WHERE dij.edge != -1;

  RETURN QUERY SELECT v_geojson, COALESCE(v_distance, 0);
END;
$$;

DROP FUNCTION IF EXISTS public.fn_address_fuzzy_search(text, text, double precision, integer);

CREATE OR REPLACE FUNCTION public.fn_address_fuzzy_search(
  p_municipio text,
  p_via_query text,
  p_threshold float8 DEFAULT 0.30,
  p_limit     int    DEFAULT 5
)
RETURNS TABLE (
  id           bigint,
  municipio    text,
  barrio       text,
  via          text,
  placa        text,
  numero_placa text,
  latitud      float8,
  longitud     float8,
  similitud    float4
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Establecemos el umbral para que el operador % lo respete y use el indice GIN
  EXECUTE format('SET LOCAL pg_trgm.similarity_threshold = %L', p_threshold);

  RETURN QUERY
  SELECT
    n.id::bigint,
    n.municipio,
    n.barrio,
    n.via,
    n.placa,
    n.numero_placa,
    n.latitud,
    n.longitud,
    similarity(lower(n.placa), lower(p_via_query))::float4 AS similitud
  FROM public.nomenclatura_igac n
  WHERE lower(n.municipio) = lower(p_municipio)
    AND lower(n.placa) % lower(p_via_query)
  ORDER BY similitud DESC
  LIMIT p_limit;
END;
$$;

-- Permisos de ejecucion para la busqueda difusa desde el front-end
GRANT EXECUTE ON FUNCTION public.fn_address_fuzzy_search(text,text,float8,int) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_address_fuzzy_search(text,text,float8,int) TO authenticated;

-- Politica RLS (Row Level Security) para habilitar lectura anonima de direcciones
ALTER TABLE public.nomenclatura_igac ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir lectura publica de nomenclatura" ON public.nomenclatura_igac;
CREATE POLICY "Permitir lectura publica de nomenclatura" 
ON public.nomenclatura_igac 
FOR SELECT 
TO anon, authenticated 
USING (true);

SELECT 'Funciones auxiliares creadas y RLS aplicado OK' AS status;
