-- ====================================================================================
-- Script: 13_asignar_promo_domicilio_gratis_con_stock.sql
-- Propósito: Etiquetar con "promo_b2c = 'DOMICILIO_GRATIS'" los productos con stock real
--            (inventario_b2c > 0 y activo_b2c = true) en la tabla public.petpro_productos.
-- ====================================================================================

-- ------------------------------------------------------------------------------------
-- 1. CONSULTA DE VERIFICACIÓN PREVIA (Inspeccionar los 38 productos con stock)
-- ------------------------------------------------------------------------------------
SELECT 
    ref,
    producto,
    categoria,
    marca,
    inventario_b2c,
    promo_b2c,
    activo_b2c
FROM public.petpro_productos
WHERE activo_b2c = true
  AND inventario_b2c > 0
ORDER BY inventario_b2c DESC;


-- ------------------------------------------------------------------------------------
-- 2. (OPCIONAL PERO RECOMENDADO) LIMPIEZA DE PRODUCTOS AGOTADOS
--    Remover la etiqueta DOMICILIO_GRATIS de productos que tienen stock 0 o nulo
-- ------------------------------------------------------------------------------------
UPDATE public.petpro_productos
SET promo_b2c = NULL
WHERE promo_b2c = 'DOMICILIO_GRATIS'
  AND (inventario_b2c IS NULL OR inventario_b2c <= 0);


-- ------------------------------------------------------------------------------------
-- 3. ASIGNAR "DOMICILIO_GRATIS" A TODOS LOS PRODUCTOS CON INVENTARIO ACTIVO (> 0)
-- ------------------------------------------------------------------------------------
UPDATE public.petpro_productos
SET promo_b2c = 'DOMICILIO_GRATIS'
WHERE activo_b2c = true
  AND inventario_b2c > 0;


-- ------------------------------------------------------------------------------------
-- 4. ALTERNATIVA: ASIGNACIÓN QUIRÚRGICA POR LISTA DE REFERENCIAS (38 referencias)
-- ------------------------------------------------------------------------------------
/*
UPDATE public.petpro_productos
SET promo_b2c = 'DOMICILIO_GRATIS'
WHERE ref IN (
    '1777',           -- GALLETAS RELLENAS PARA PERROS LOPETS X 70GR (Stock: 50)
    '2851',           -- FARO POUCHE PERRO ADULTO SABOR FÍGADO AO MOLHO X 85G (Stock: 36)
    '2849',           -- FARO POUCHE PERRO ADULTO SABOR CARNE AO MOLHO X85G (Stock: 35)
    '2844',           -- DR ZOO GRILL DE ASADO PARA PERROS X 50 GR (Stock: 23)
    '2845',           -- DR ZOO GRILL DE CHURRASQUITO PARA PERROS X 50 GR (Stock: 23)
    '2846',           -- DR ZOO GRILL DE LOMITOS PARA PERROS X 50 GR (Stock: 23)
    '516',            -- ADORE SNACKS GATOS ADULT P/LARGOS X 80 GRS (Stock: 20)
    '517',            -- ADORE SNACKS GATOS X 80 GRS (Stock: 20)
    '2304',           -- POUCHE MIKCAT ADULTO SALMÓN X 85G (Stock: 14)
    '2305',           -- POUCHE MIKCAT ADULTO ATÚN X 85G (Stock: 12)
    '2303',           -- POUCHE MIKCAT ADULTO CARNE X 85G (Stock: 12)
    '5231 LP',        -- FLAVORFULLZ DOG SNACK - TOCINO 6 OZ (Stock: 3)
    'Cord-50Gr-50G',  -- Mini Cabano cordero 50g Gato (Stock: 2)
    '1017',           -- Chorizo (Carne, soya y vegetal) - 80 unidades (Stock: 2)
    '146005 TP',      -- THREE PETS DOG SNACK CODILLOS DE RES X 2 UNDS 190 GR (Stock: 2)
    '956681 DI',      -- DISUGUAL DOG RENAL DIET - CARNE LATA POR 400 GR (Stock: 2)
    '1015',           -- Cábano Duro - 1000 g (Stock: 2)
    '141055 TP',      -- THREE PETS DOG SNACK LONJITAS DE RES X 2 UNDS 100 GR (Stock: 2)
    '5230 LP',        -- FLAVORFULLZ DOG SNACK - POLLO 6 OZ (Stock: 2)
    '5236 LP',        -- FLAVORFULLZ CAT SNACK - ATUN 3 OZ (Stock: 2)
    '5235 LP',        -- FLAVORFULLZ CAT SNACK - SALMON 3 OZ (Stock: 2)
    'CCA-50G-50G',    -- Mini Cabano conejo 50g Gato (Stock: 2)
    '1014',           -- Cábano Loky (Línea económica) - 1000 GR (Stock: 2)
    'ICA-18833-150G', -- Cabano Conejo 150g (Stock: 2)
    '959200 DI',      -- DISUGUAL DOG INTESTINAL DIET - CARNE LATA POR 400 GR (Stock: 2)
    'ICA-19375-150G', -- Cabano Cordero 150g (Stock: 2)
    'CDP-45G',        -- Chips deshidratados Pulmon de Res 45g (Stock: 2)
    'CDH-120G',       -- Chips deshidratados Higado de Res 120g (Stock: 2)
    '142311 TP',      -- THREE PETS DOG SNACK ROLLITOS DE RES X 24 UNDS 250 GR (Stock: 1)
    '957770 DI',      -- DISUGUAL CAT RECOVERY DIET - SALMON LATA POR 85 GR (Stock: 1)
    '1011',           -- Cábano Festy (Stock: 1)
    'CDE-90G',        -- Chips deshidratados Esofago de Res 90g (Stock: 1)
    '957688 DI',      -- DISUGUAL CAT INTESTINAL DIET - PESCADO BLANCO (Stock: 1)
    '1018',           -- Recortes (Mezcla de productos) 1000g (Stock: 1)
    '956568 DI',      -- DISUGUAL DOG HIPOALLERGENIC DIET - CONEJO (Stock: 1)
    '18832-150G',     -- Galletas con Zanahoria Manzana y Avena Perros 150g (Stock: 1)
    '1012',           -- Cábano Ranchero - 1000g (Stock: 1)
    '957787 DI'       -- DISUGUAL CAT RENAL DIET - POLLO (Stock: 1)
);
*/


-- ------------------------------------------------------------------------------------
-- 5. VERIFICACIÓN POST-EJECUCIÓN
-- ------------------------------------------------------------------------------------
SELECT 
    COUNT(*) AS total_con_domicilio_gratis_y_stock
FROM public.petpro_productos
WHERE activo_b2c = true 
  AND inventario_b2c > 0 
  AND promo_b2c = 'DOMICILIO_GRATIS';
