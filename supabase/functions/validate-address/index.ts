// =============================================================================
// supabase/functions/validate-address/index.ts
// Edge Function: Validacion de Direcciones IGAC + pg_trgm fuzzy search
// Runtime: Deno (Supabase Edge Functions)
//
// Deploy: supabase functions deploy validate-address
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---------------------------------------------------------------------------
// Constantes y configuracion
// ---------------------------------------------------------------------------
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const FUZZY_THRESHOLD = 0.15;   // Umbral minimo de similitud pg_trgm
const MAX_SUGGESTIONS = 5;      // Maximo de sugerencias a devolver

// Municipios del Area Metropolitana de Medellin permitidos
const MUNICIPIOS_AMV = new Set([
  "medellin", "medellín",
  "bello",
  "itagui", "itagüi",
  "envigado",
  "sabaneta",
  "la estrella",
  "caldas",
]);

// Normalizador de abreviaturas de tipo de via
const VIA_MAP: Record<string, string> = {
  cl: "Calle", cll: "Calle",
  cr: "Carrera", cra: "Carrera", kr: "Carrera",
  tv: "Transversal", transv: "Transversal",
  dg: "Diagonal", diag: "Diagonal",
  av: "Avenida", avd: "Avenida",
};

// ---------------------------------------------------------------------------
// Utilitarios de normalizacion
// ---------------------------------------------------------------------------
function stripAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalize(str: string): string {
  if (!str) return "";
  return stripAccents(str.toLowerCase().trim());
}

function expandViaAbbr(raw: string): string {
  // Intenta expandir la primera palabra si es una abreviacion conocida
  const parts = raw.trim().split(/\s+/);
  const first = normalize(parts[0]);
  if (VIA_MAP[first]) {
    parts[0] = VIA_MAP[first];
    return parts.join(" ");
  }
  return raw;
}

// Limpiar la cadena completa para fuzzy: expandir abreviaturas, quitar # y -
function cleanForFuzzy(raw: string): string {
  const expanded = expandViaAbbr(raw);
  // Quitar # y guiones, normalizar espacios
  return normalize(expanded)
    .replace(/[#\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildViaKey(tipo: string, nombre: string): string {
  const tipoExp = expandViaAbbr(tipo || "");
  return normalize(`${tipoExp} ${nombre || ""}`).trim();
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: CORS_HEADERS,
    });
  }

  const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, supabaseKey);

  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: CORS_HEADERS,
    });
  }

  const { municipio, tipo_via, nombre_via, barrio, lat, lon } = body;

  // Validacion basica
  if (!municipio) {
    return new Response(JSON.stringify({ status: "error", message: "municipio es requerido" }), {
      status: 400, headers: CORS_HEADERS,
    });
  }

  const munKey  = normalize(municipio);
  
  // Construir la cadena completa de busqueda para placa
  const direccionCompleta = body.placa || body.direccion || `${tipo_via || ""} ${nombre_via || ""}`.trim();
  const rawAddressForFuzzy = cleanForFuzzy(direccionCompleta);

  // Verificar que el municipio sea del AMV
  if (!MUNICIPIOS_AMV.has(munKey)) {
    return new Response(JSON.stringify({
      status: "out_of_zone",
      message: `El municipio "${municipio}" no esta dentro del area de cobertura (Area Metropolitana de Medellin).`,
      municipios_cobertura: [...MUNICIPIOS_AMV],
    }), { headers: CORS_HEADERS });
  }

  try {
    // ------------------------------------------------------------------
    // PASO 1: Busqueda exacta
    // ------------------------------------------------------------------
    if (direccionCompleta) {
      const { data: exactRows } = await db
        .from("nomenclatura_igac")
        .select("id, municipio, via, placa, numero_placa, barrio, latitud, longitud")
        .filter("municipio", "ilike", municipio)
        .filter("placa", "ilike", `%${direccionCompleta}%`)
        .limit(MAX_SUGGESTIONS);

      if (exactRows && exactRows.length > 0) {
        return new Response(JSON.stringify({
          status: "ok",
          method: "exact",
          matches: exactRows,
        }), { headers: CORS_HEADERS });
      }
    }

    // ------------------------------------------------------------------
    // PASO 2: Fuzzy search con pg_trgm (via RPC)
    // ------------------------------------------------------------------
    if (rawAddressForFuzzy) {
      const { data: fuzzyRows, error: fuzzyErr } = await db.rpc("fn_address_fuzzy_search", {
        p_municipio: municipio,
        p_via_query: rawAddressForFuzzy,
        p_threshold: FUZZY_THRESHOLD,
        p_limit: MAX_SUGGESTIONS
      });

      if (fuzzyRows && !fuzzyErr) {
        const valid = (fuzzyRows as Array<Record<string, unknown>>)
          .filter((r) => (r.similitud as number) >= FUZZY_THRESHOLD);
        
        if (valid.length > 0) {
          return new Response(JSON.stringify({
            status: "ok",
            method: "fuzzy",
            matches: valid,
          }), { headers: CORS_HEADERS });
        }
      }
    }

    // ------------------------------------------------------------------
    // PASO 3: Validacion espacial con PostGIS (si se envian coordenadas)
    // ------------------------------------------------------------------
    if (lat && lon) {
      const { data: spatialRows } = await db.rpc("fn_validate_spatial", {
        p_lon: parseFloat(lon),
        p_lat: parseFloat(lat),
      });

      if (spatialRows && (spatialRows as unknown[]).length > 0) {
        return new Response(JSON.stringify({
          status: "ok",
          method: "spatial",
          matches: spatialRows,
        }), { headers: CORS_HEADERS });
      }
    }

    // ------------------------------------------------------------------
    // PASO 4: No encontrado — devolver sugerencias fuzzy de municipio
    // ------------------------------------------------------------------
    return new Response(JSON.stringify({
      status: "not_found",
      message: "No se encontro la direccion. Verifica el municipio, tipo de via y nombre de via.",
      suggestion: "Usa el formato: Calle 10 # 43-12, Envigado",
    }), { headers: CORS_HEADERS });

  } catch (err) {
    console.error("validate-address error:", err);
    return new Response(JSON.stringify({
      status: "error",
      message: (err as Error).message,
    }), { status: 500, headers: CORS_HEADERS });
  }
});
