-- ============================================================
-- NORMALIZAR petpro_zonas_cobertura.municipio
-- ============================================================
-- Objetivo: dejar todos los valores en el mismo formato que
-- petpro_barrios (MAYUSCULAS, SIN TILDES, SIN GUIONES)
-- Ejecutar en Supabase SQL Editor
-- ============================================================

UPDATE petpro_zonas_cobertura SET municipio = 'LA ESTRELLA'  WHERE municipio = 'la-estrella';
UPDATE petpro_zonas_cobertura SET municipio = 'ITAGUI'       WHERE municipio = 'itagui';
UPDATE petpro_zonas_cobertura SET municipio = 'ENVIGADO'     WHERE municipio = 'envigado';
UPDATE petpro_zonas_cobertura SET municipio = 'SABANETA'     WHERE municipio = 'sabaneta';
UPDATE petpro_zonas_cobertura SET municipio = 'BELLO'        WHERE municipio = 'bello';
UPDATE petpro_zonas_cobertura SET municipio = 'MEDELLIN'     WHERE municipio = 'medellin';
UPDATE petpro_zonas_cobertura SET municipio = 'MEDELLIN'     WHERE municipio = 'medell\u00edn';
UPDATE petpro_zonas_cobertura SET municipio = 'CALDAS'       WHERE municipio = 'caldas';

-- Verificar resultado
SELECT DISTINCT municipio FROM petpro_zonas_cobertura ORDER BY municipio;
