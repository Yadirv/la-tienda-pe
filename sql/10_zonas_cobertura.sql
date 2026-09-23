-- Nueva Tabla para Zonas de Cobertura (Domicilio Gratis, Ads, etc.)
CREATE TABLE IF NOT EXISTS public.petpro_zonas_cobertura (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    municipio TEXT NOT NULL,
    barrio TEXT NOT NULL,
    estrato INTEGER,
    tipo_promocion TEXT NOT NULL,
    activa BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.petpro_zonas_cobertura ENABLE ROW LEVEL SECURITY;

-- Políticas de Seguridad RLS
-- 1. Público puede leer (necesario para que el checkout del B2C valide si hay domicilio gratis)
CREATE POLICY "Permitir lectura pública para zonas de cobertura"
ON public.petpro_zonas_cobertura
FOR SELECT
TO public, anon
USING (activa = true);

-- 2. Administradores pueden insertar/modificar (requiere autenticación)
CREATE POLICY "Permitir gestión total a administradores"
ON public.petpro_zonas_cobertura
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Agregar algunos comentarios para escalabilidad de la columna tipo_promocion
COMMENT ON COLUMN public.petpro_zonas_cobertura.tipo_promocion IS 'Valores soportados (Sección 5): DOMICILIO_GRATIS, RECARGO_EXTENDIDO, NO_COBERTURA, RUTA_LUNES_JUEVES, RUTA_MARTES_VIERNES, ADS_PREMIUM_BRANDS, PROMO_KITS_INICIO';
