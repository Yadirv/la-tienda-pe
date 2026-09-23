# =============================================================================
# ingest_shapefile.ps1
# Carga el Shapefile de Nomenclatura IGAC a PostGIS usando ogr2ogr (GDAL)
# 
# Requisitos:
#   - GDAL/ogr2ogr instalado. Opciones para Windows:
#     * OSGeo4W: https://trac.osgeo.org/osgeo4w/
#     * QGIS incluye ogr2ogr en: C:\Program Files\QGIS X.X\bin\ogr2ogr.exe
#     * Conda: conda install -c conda-forge gdal
#
# Uso:
#   1. Descarga el Shapefile desde ArcGIS Hub:
#      https://datos-abiertos-igac-igac-oit.hub.arcgis.com/datasets/6a45e5254433463b8663f3fc410c06fd/about
#   2. Descomprime en la carpeta data\shapefile\
#   3. Ejecuta este script: powershell -File scripts/ingest_shapefile.ps1
# =============================================================================

# ----- CONFIGURACION ---------------------------------------------------------
$DB_HOST     = "db.qkzhopjfrlyvqfievcfi.supabase.co"
$DB_PORT     = "5432"
$DB_NAME     = "postgres"
$DB_USER     = "postgres"
$DB_PASS     = "TU_PASSWORD_AQUI"   # Reemplazar con tu password real

# Ruta al .shp descargado del IGAC
$SHP_PATH    = Join-Path $PSScriptRoot "..\data\shapefile\nomenclatura_domiciliaria.shp"

# Ruta a ogr2ogr (ajusta si lo tienes en otra ubicacion)
$OGR2OGR     = "ogr2ogr"  # Si esta en PATH; si no, pon la ruta completa
# Ejemplo con QGIS: $OGR2OGR = "C:\Program Files\QGIS 3.36\bin\ogr2ogr.exe"
# -----------------------------------------------------------------------------

if (-not (Test-Path $SHP_PATH)) {
    Write-Error "No se encontro el Shapefile: $SHP_PATH"
    Write-Host "Descargalo desde: https://datos-abiertos-igac-igac-oit.hub.arcgis.com/datasets/6a45e5254433463b8663f3fc410c06fd/about"
    exit 1
}

$PG_CONN = "PG:host=$DB_HOST port=$DB_PORT dbname=$DB_NAME user=$DB_USER password=$DB_PASS"

Write-Host "Cargando Shapefile a PostGIS..."
Write-Host "Origen : $SHP_PATH"
Write-Host "Destino: nomenclatura_geom en Supabase"
Write-Host ""

# Carga completa del shapefile
& $OGR2OGR `
    -f "PostgreSQL" $PG_CONN `
    $SHP_PATH `
    -nln nomenclatura_geom `
    -overwrite `
    -lco GEOMETRY_NAME=geom `
    -lco FID=id `
    -t_srs EPSG:4326 `
    -progress

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Shapefile cargado correctamente!"
    Write-Host ""
    Write-Host "Siguiente paso: Ejecutar en Supabase SQL Editor:"
    Write-Host "  sql\03_nomenclatura_geom.sql"
    Write-Host ""
    Write-Host "Para construir la topologia de pgRouting, ejecuta tambien:"
    Write-Host "  sql\04_roads_pgrouting.sql"
    Write-Host "  SELECT pgr_createTopology('roads', 0.0001, 'geom', 'id');"
} else {
    Write-Error "Error al cargar el Shapefile. Verifica que ogr2ogr este instalado y en PATH."
}
