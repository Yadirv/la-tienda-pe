// =============================================================================
// supabase/functions/calculate-route/index.ts
// Edge Function: Calculo de ruta de domicilio usando pgRouting (pgr_dijkstra)
// Runtime: Deno (Supabase Edge Functions)
//
// Deploy: supabase functions deploy calculate-route
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// Velocidad promedio domiciliario en moto (km/h) para estimar tiempo
const AVG_SPEED_KMH = 25;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: CORS_HEADERS,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, supabaseKey);

  let body: { origin?: Record<string,number>; destination?: Record<string,number> };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: CORS_HEADERS,
    });
  }

  const { origin, destination } = body;
  if (!origin?.lat || !origin?.lon || !destination?.lat || !destination?.lon) {
    return new Response(JSON.stringify({
      error: "Se requieren origin y destination con lat/lon",
    }), { status: 400, headers: CORS_HEADERS });
  }

  try {
    // ------------------------------------------------------------------
    // PASO 1: Encontrar nodos de la red vial mas cercanos a cada punto
    // ------------------------------------------------------------------
    const { data: startNode, error: startErr } = await db.rpc("fn_nearest_road_node", {
      p_lon: origin.lon,
      p_lat: origin.lat,
    });
    const { data: endNode, error: endErr } = await db.rpc("fn_nearest_road_node", {
      p_lon: destination.lon,
      p_lat: destination.lat,
    });

    if (startErr || endErr || !startNode || !endNode) {
      return new Response(JSON.stringify({
        status: "error",
        message: "No se encontraron nodos de la red vial cercanos a los puntos dados.",
      }), { status: 404, headers: CORS_HEADERS });
    }

    // ------------------------------------------------------------------
    // PASO 2: Calcular ruta con pgr_dijkstra via funcion SQL wrapper
    // La funcion fn_calculate_route encapsula la query de pgr_dijkstra
    // y devuelve: geojson TEXT, distance_m FLOAT8
    // ------------------------------------------------------------------
    const { data: routeResult, error: routeErr } = await db.rpc("fn_calculate_route", {
      p_start: startNode as number,
      p_end:   endNode as number,
    });

    if (routeErr || !routeResult) {
      throw new Error(routeErr?.message || "Error calculando ruta");
    }

    const route = routeResult as { geojson: string; distance_m: number };
    const distKm = route.distance_m / 1000;
    const estMinutes = Math.ceil((distKm / AVG_SPEED_KMH) * 60);

    return new Response(JSON.stringify({
      status: "ok",
      geojson: JSON.parse(route.geojson),
      distance_km: parseFloat(distKm.toFixed(2)),
      estimated_minutes: estMinutes,
      origin: { lat: origin.lat, lon: origin.lon, node: startNode },
      destination: { lat: destination.lat, lon: destination.lon, node: endNode },
    }), { headers: CORS_HEADERS });

  } catch (err) {
    console.error("calculate-route error:", err);
    return new Response(JSON.stringify({
      status: "error",
      message: (err as Error).message,
    }), { status: 500, headers: CORS_HEADERS });
  }
});
