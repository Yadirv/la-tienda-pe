/**
 * nomenclatura_node.js
 *
 * Descarga el CSV del IGAC (Nomenclatura Domiciliaria), filtra automaticamente
 * por los municipios del Area Metropolitana de Medellin y exporta un TSV
 * listo para importar en Supabase via psql \copy.
 *
 * Municipios incluidos:
 *   Medellin, Bello, Itagui, Envigado, Sabaneta, La Estrella, Caldas
 *
 * Uso:
 *   npm install axios csv-parse fast-csv
 *   node scripts/nomenclatura_node.js
 *
 * Variables de entorno opcionales:
 *   IGAC_CSV_URL  - URL directa al CSV del IGAC (si tienes la URL definitiva)
 *   IGAC_LOCAL    - Ruta a un archivo CSV local ya descargado
 */

const fs       = require('fs');
const path     = require('path');
const axios    = require('axios');
const { parse } = require('csv-parse/sync');
const fastCsv  = require('fast-csv');

// ---------------------------------------------------------------------------
// CONFIGURACION
// ---------------------------------------------------------------------------
const MUNICIPIOS_AMV = [
  'medellin', 'medellín',
  'bello',
  'itagui', 'itagüi',
  'envigado',
  'sabaneta',
  'la estrella',
  'caldas'
];

// URL del recurso CSV en ArcGIS Hub (descarga directa)
// Si esta URL cambia, buscar en: https://datos-abiertos-igac-igac-oit.hub.arcgis.com
const DATASET_URL = process.env.IGAC_CSV_URL ||
  'https://opendata.arcgis.com/datasets/6a45e5254433463b8663f3fc410c06fd_0.csv';

const OUTPUT_FILE  = path.resolve(__dirname, '..', 'data', 'nomenclatura_amv.tsv');
const LOCAL_CSV    = process.env.IGAC_LOCAL || null;

// Candidatos de nombre de columna para municipio
const MUNICIPIO_CANDIDATES = [
  'MUNICIPIO', 'municipio', 'NOMBRE_MUNICIPIO', 'NOM_MUNICIPIO',
  'MPIO_CNMBR', 'mpio_cnmbr', 'NOMBRE MUNICIPIO'
];

// Mapeo de columnas IGAC -> columnas de la tabla nomenclatura_igac
// Ajustar segun los encabezados reales que tenga el CSV descargado
const COLUMN_MAP = {
  'CODIGO_IGAC': 'codigo_igac',
  'DEPARTAMENTO': 'departamento',
  'MUNICIPIO': 'municipio',
  'BARRIO': 'barrio',
  'TIPO_VIA': 'tipo_via',
  'NOMBRE_VIA': 'nombre_via',
  'NUMERO_INI': 'numero_ini',
  'NUMERO_FIN': 'numero_fin',
  'OBSERVACIONES': 'observaciones',
  // Variantes alternativas del CSV IGAC:
  'TIPO_VIA_PRINCIPAL': 'tipo_via',
  'NOM_VIA_PRINCIPAL': 'nombre_via',
  'NROINICIAL': 'numero_ini',
  'NROFINAL': 'numero_fin',
};

// Normalizador de abreviaturas de tipo de via
const VIA_ABREVIACIONES = {
  'CL': 'Calle', 'CLL': 'Calle',
  'CR': 'Carrera', 'CRA': 'Carrera', 'KR': 'Carrera',
  'TV': 'Transversal', 'TRANSV': 'Transversal',
  'DG': 'Diagonal', 'DIAG': 'Diagonal',
  'AV': 'Avenida', 'AVD': 'Avenida',
  'AC': 'Autopista',
  'VIA': 'Via',
  'CIRC': 'Circular',
  'BV': 'Bulevar',
};

// ---------------------------------------------------------------------------
// UTILIDADES
// ---------------------------------------------------------------------------
function normalize(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeTipoVia(raw) {
  if (!raw) return raw;
  const upper = raw.trim().toUpperCase();
  return VIA_ABREVIACIONES[upper] || raw.trim();
}

function detectCol(headers, candidates) {
  for (const c of candidates) {
    const found = headers.find(h => h.trim().toLowerCase() === c.toLowerCase());
    if (found) return found;
  }
  // Heuristica: buscar la columna que contenga 'mun'
  return headers.find(h => /mun/i.test(h)) || headers[0];
}

function mapRow(row, headers) {
  const out = {
    codigo_igac: '', departamento: '', municipio: '',
    barrio: '', tipo_via: '', nombre_via: '',
    numero_ini: '', numero_fin: '', observaciones: ''
  };
  for (const h of headers) {
    const targetCol = COLUMN_MAP[h.trim().toUpperCase()] || COLUMN_MAP[h.trim()];
    if (targetCol && out[targetCol] === '') {
      out[targetCol] = (row[h] || '').toString().trim();
    }
  }
  out.tipo_via = normalizeTipoVia(out.tipo_via);
  return out;
}

// ---------------------------------------------------------------------------
// DESCARGA CSV
// ---------------------------------------------------------------------------
async function downloadCSV(url) {
  console.log(`⬇  Descargando dataset desde:\n   ${url}`);
  const resp = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 180000,
    onDownloadProgress: (p) => {
      if (p.total) process.stdout.write(`\r   ${Math.round(p.loaded/1024/1024)} MB / ${Math.round(p.total/1024/1024)} MB`);
    }
  });
  console.log('\n   Descarga completa.');
  return Buffer.from(resp.data).toString('utf8');
}

// ---------------------------------------------------------------------------
// PROCESO PRINCIPAL
// ---------------------------------------------------------------------------
async function main() {
  let csvText;

  if (LOCAL_CSV && fs.existsSync(LOCAL_CSV)) {
    console.log(`📂 Usando archivo local: ${LOCAL_CSV}`);
    csvText = fs.readFileSync(LOCAL_CSV, 'utf8');
  } else {
    csvText = await downloadCSV(DATASET_URL);
  }

  console.log('📊 Parseando CSV...');
  const records = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true
  });

  if (!records.length) {
    console.error('❌ El dataset esta vacio o no pudo parsearse.');
    process.exit(1);
  }

  const headers     = Object.keys(records[0]);
  const municipioCol = detectCol(headers, MUNICIPIO_CANDIDATES);
  console.log(`🔍 Columna de municipio detectada: "${municipioCol}"`);
  console.log(`📈 Total registros en el CSV: ${records.length.toLocaleString()}`);

  // Filtrar por AMV
  console.log(`\n🏙️  Filtrando municipios del Area Metropolitana de Medellin...`);
  const filtrados = records.filter(r => {
    const val = normalize((r[municipioCol] || '').toString());
    return MUNICIPIOS_AMV.includes(val);
  });

  console.log(`✅ Registros filtrados: ${filtrados.length.toLocaleString()}`);
  if (!filtrados.length) {
    console.warn('⚠️  No se encontraron registros. Revisar nombre de la columna municipio y sus valores.');
    process.exit(1);
  }

  // Resumen por municipio
  const resumen = {};
  filtrados.forEach(r => {
    const mun = (r[municipioCol] || 'SIN_MUNICIPIO').trim();
    resumen[mun] = (resumen[mun] || 0) + 1;
  });
  console.log('\n📊 Resumen por municipio:');
  Object.entries(resumen).sort((a,b)=>b[1]-a[1]).forEach(([m,c]) => {
    console.log(`   ${m.padEnd(20)} ${c.toLocaleString()} registros`);
  });

  // Asegurar carpeta data/
  const outDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // Exportar a TSV
  console.log(`\n💾 Exportando a TSV: ${OUTPUT_FILE}`);
  const ws = fs.createWriteStream(OUTPUT_FILE, { encoding: 'utf8' });
  const TARGET_COLS = ['codigo_igac','departamento','municipio','barrio','tipo_via','nombre_via','numero_ini','numero_fin','observaciones'];
  const csvStream = fastCsv.format({ headers: TARGET_COLS, delimiter: '\t' });
  csvStream.pipe(ws).on('finish', () => {
    console.log(`\n🎉 Archivo generado exitosamente!`);
    console.log(`   ${OUTPUT_FILE}`);
    console.log(`\n▶  Siguiente paso - importar en Supabase con el script:`);
    console.log(`   scripts\\ingest_csv_supabase.ps1`);
  });

  for (const row of filtrados) {
    const mapped = mapRow(row, headers);
    const safeRow = {};
    TARGET_COLS.forEach(col => {
      safeRow[col] = mapped[col] ?? '';
    });
    csvStream.write(safeRow);
  }
  csvStream.end();
}

main().catch(err => {
  console.error('❌ Error:', err.message || err);
  process.exit(1);
});
