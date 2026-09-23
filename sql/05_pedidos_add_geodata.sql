-- =============================================================================
-- 05_pedidos_add_geodata.sql
-- Agrega columnas de geolocalización a petpro_pedidos
-- sin romper la estructura actual ni los datos existentes
-- =============================================================================

-- Columna con el JSON completo de la direccion validada (resultado de la Edge Function)
ALTER TABLE public.petpro_pedidos
  ADD COLUMN IF NOT EXISTS direccion_validada  jsonb;

-- Columna con las coordenadas del punto de entrega
ALTER TABLE public.petpro_pedidos
  ADD COLUMN IF NOT EXISTS coordenadas  geography(Point, 4326);

-- Columna con metodo de validacion usado ('exact', 'fuzzy', 'spatial', 'manual')
ALTER TABLE public.petpro_pedidos
  ADD COLUMN IF NOT EXISTS metodo_validacion  text DEFAULT 'manual';

-- Indice espacial para consultas de zonas de entrega
CREATE INDEX IF NOT EXISTS idx_pedidos_coordenadas
  ON public.petpro_pedidos
  USING GIST (coordenadas);

-- Verificar columnas agregadas
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'petpro_pedidos'
  AND column_name IN ('direccion_validada', 'coordenadas', 'metodo_validacion');
