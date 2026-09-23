-- =============================================================================
-- 04_roads_pgrouting.sql
-- Red vial para calculo de rutas de domicilio con pgRouting
-- Ejecutar DESPUES de cargar el shapefile de red vial
-- =============================================================================

-- Tabla de aristas de la red vial
CREATE TABLE IF NOT EXISTS public.roads (
  id           bigserial    PRIMARY KEY,
  source       integer,
  target       integer,
  cost         float8,      -- costo en sentido normal (tiempo estimado en minutos)
  reverse_cost float8,      -- costo inverso (si la via es de doble sentido)
  name         text,        -- nombre de la via si esta disponible
  road_type    text,        -- tipo: via_principal, secundaria, barrial
  geom         geometry(LineString, 4326)
);

-- Indice espacial
CREATE INDEX IF NOT EXISTS idx_roads_gist
  ON public.roads
  USING GIST (geom);

-- Indices de nodo para pgRouting
CREATE INDEX IF NOT EXISTS idx_roads_source ON public.roads (source);
CREATE INDEX IF NOT EXISTS idx_roads_target ON public.roads (target);

-- -----------------------------------------------------------------------
-- INSTRUCCION: Despues de cargar datos de vias, ejecutar pgr_createTopology
-- para construir la topologia source/target automaticamente:
--
--   SELECT pgr_createTopology('roads', 0.0001, 'geom', 'id');
--
-- Esto puede tardar varios minutos segun el volumen de datos.
-- -----------------------------------------------------------------------

-- Funcion auxiliar: nodo mas cercano a un punto dado
CREATE OR REPLACE FUNCTION public.fn_nearest_road_node(
  p_lon float8,
  p_lat float8
)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT source
  FROM public.roads
  ORDER BY geom <-> ST_SetSRID(ST_Point(p_lon, p_lat), 4326)
  LIMIT 1;
$$;

SELECT 'roads + fn_nearest_road_node creados OK' AS status;
