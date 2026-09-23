-- =============================================================================
-- 09_rls_nomenclatura.sql
-- Habilita Row Level Security (RLS) en la tabla nomenclatura_igac
-- y establece las políticas de acceso para proteger los datos.
-- =============================================================================

-- 1. Habilitar RLS en la tabla principal
ALTER TABLE public.nomenclatura_igac ENABLE ROW LEVEL SECURITY;

-- 2. Política de Lectura (SELECT):
-- Permitimos que los usuarios anónimos (visitantes de la tienda) y usuarios
-- autenticados puedan consultar la nomenclatura para el autocompletado.
DROP POLICY IF EXISTS "Permitir lectura publica de nomenclatura" ON public.nomenclatura_igac;
CREATE POLICY "Permitir lectura publica de nomenclatura" 
ON public.nomenclatura_igac
FOR SELECT
TO anon, authenticated
USING (true);

-- Nota de Seguridad:
-- Al no crear políticas para INSERT, UPDATE o DELETE, Postgres por defecto
-- DENEGARÁ cualquier intento de modificación desde la API pública (REST) o 
-- desde usuarios anónimos.
-- Nuestro script de Python utiliza el `SUPABASE_SERVICE_KEY`, el cual es un 
-- rol "Service Role" que omite (hace bypass) las políticas RLS y permite
-- la escritura de los datos de forma segura.

-- 3. Revocar acceso no intencional por si acaso (Opcional pero recomendado)
REVOKE INSERT, UPDATE, DELETE ON public.nomenclatura_igac FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.nomenclatura_igac FROM authenticated;
