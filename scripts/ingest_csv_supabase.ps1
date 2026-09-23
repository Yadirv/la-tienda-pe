# =============================================================================
# ingest_csv_supabase.ps1
# Importa el TSV generado por nomenclatura_node.js a la tabla
# nomenclatura_igac en Supabase usando psql \copy
#
# Requisito: psql instalado (viene con PostgreSQL client tools)
# Descarga: https://www.postgresql.org/download/windows/
# =============================================================================

# ----- CONFIGURACION ---------------------------------------------------------
# Reemplaza con los datos de conexion de tu Supabase
# Los encontras en: Supabase Dashboard > Project Settings > Database
$DB_HOST     = "db.qkzhopjfrlyvqfievcfi.supabase.co"
$DB_PORT     = "5432"
$DB_NAME     = "postgres"
$DB_USER     = "postgres"
$DB_PASS     = "TU_PASSWORD_AQUI"   # Reemplazar con tu password real

$TSV_FILE    = Join-Path $PSScriptRoot "..\data\nomenclatura_amv.tsv"
$TSV_FILE    = (Resolve-Path $TSV_FILE).Path
# -----------------------------------------------------------------------------

if (-not (Test-Path $TSV_FILE)) {
    Write-Error "No se encontro el archivo TSV: $TSV_FILE"
    Write-Host "Ejecuta primero: node scripts/nomenclatura_node.js"
    exit 1
}

$lineCount = (Get-Content $TSV_FILE | Measure-Object -Line).Lines
Write-Host "Archivo encontrado: $TSV_FILE"
Write-Host "Total de lineas (incluye header): $lineCount"
Write-Host ""
Write-Host "Conectando a Supabase en $DB_HOST..."

# Construir connection string
$env:PGPASSWORD = $DB_PASS
$connStr = "host=$DB_HOST port=$DB_PORT dbname=$DB_NAME user=$DB_USER sslmode=require"

# Ejecutar \copy
$copyCmd = "\copy public.nomenclatura_igac (codigo_igac,departamento,municipio,barrio,tipo_via,nombre_via,numero_ini,numero_fin,observaciones) FROM '$($TSV_FILE.Replace('\','\\'))' WITH (FORMAT csv, DELIMITER E'\t', HEADER true, ENCODING 'UTF8')"

Write-Host "Ejecutando COPY..."
$result = & psql $connStr -c $copyCmd 2>&1
Write-Host $result

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Importacion completada exitosamente!"
    # Contar registros importados
    & psql $connStr -c "SELECT municipio, COUNT(*) as total FROM public.nomenclatura_igac GROUP BY municipio ORDER BY total DESC;"
} else {
    Write-Error "Error durante la importacion. Revisar logs arriba."
}

Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
