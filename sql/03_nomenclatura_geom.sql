-- =============================================================================
-- 03_nomenclatura_geom.sql
-- Ejecutar DESPUES de ogr2ogr (que crea la tabla nomenclatura_geom automaticamente)
-- Agrega indice GIST y vista de municipios
-- =============================================================================

-- Indice espacial GIST sobre la geometria del shapefile
CREATE INDEX IF NOT EXISTS idx_nom_geom_gist
  ON public.nomenclatura_geom
  USING GIST (geom);

-- Asegurar que la geometria este en EPSG:4326
-- (ogr2ogr con -t_srs EPSG:4326 ya lo hace, esto es verificacion)
SELECT
  f_table_name,
  f_geometry_column,
  srid,
  type
FROM geometry_columns
WHERE f_table_name = 'nomenclatura_geom';

SELECT 'nomenclatura_geom indexada OK' AS status;
