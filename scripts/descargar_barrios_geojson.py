#!/usr/bin/env python3
"""
Descarga GeoJSON desde ArcGIS REST MapServer por municipio (Valle de Aburrá).
Este script está adaptado ESPECÍFICAMENTE para descargar la capa de "Barrios" 
de cada municipio, sirviendo como base estática (Fallback) para el panel de 
Zonas de Cobertura de La Tienda Pet.
"""

import json
import time
from pathlib import Path
from typing import Any

import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# =============================================================================
# CAPAS DE BARRIOS POR MUNICIPIO
# Estas URLs apuntan directamente a la capa de polígonos de barrios.
# Las llaves (ej. 'medellin', 'la-estrella') coinciden exactamente con los 
# nombres usados en dashboard.html para que sobrescriban los archivos correctamente.
# =============================================================================

LAYERS: dict[str, dict[str, Any]] = {
    "medellin": {
        "label": "Medellín — Límite Barrio/Vereda",
        "url": "https://www.medellin.gov.co/servidormapas/rest/services/ServiciosCatastro/Base_Catastral/MapServer/1",
    },
    "envigado": {
        "label": "Envigado — Barrios",
        "url": "https://portalidem.metropol.gov.co/server/rest/services/Envigado_Catastro/MapServer/2",
    },
    "sabaneta": {
        "label": "Sabaneta — Barrios",
        "url": "https://portalidem.metropol.gov.co/server/rest/services/Sabaneta_Catastro/MapServer/2",
    },
    "itagui": {
        "label": "Itagüí — Barrios",
        "url": "https://portalidem.metropol.gov.co/server/rest/services/Itag%C3%BC%C3%AD_Catastro/MapServer/2",
    },
    "la-estrella": {
        "label": "La Estrella — Barrios",
        "url": "https://portalidem.metropol.gov.co/server/rest/services/La_Estrella_Catastro/MapServer/2",
    },
    "caldas": {
        "label": "Caldas — Barrios (Suele ser la capa 1 o 2)",
        "url": "https://portalidem.metropol.gov.co/server/rest/services/Caldas_Catastro/MapServer/2",
    },
    "bello": {
        "label": "Bello — Barrios",
        "url": "https://portalidem.metropol.gov.co/server/rest/services/Bello_Catastro/MapServer/2",
    },
}

# Configuración de salida
OUT_DIR = Path("data/geojson")
OUT_SR = 4326 # WGS84, formato estándar para GeoJSON y Leaflet
TIMEOUT = 120
MAX_FEATURES = None # Descargar todos los barrios
SLEEP_BETWEEN_PAGES = 0.5 # Pausa amigable con el servidor
WHERE = "1=1"
OUT_FIELDS = "*" # Traer todos los atributos (nombre del barrio, código, etc)

def get_meta(layer_url: str) -> dict[str, Any]:
    r = requests.get(layer_url, params={"f": "json"}, timeout=TIMEOUT, verify=False)
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        raise RuntimeError(data["error"])
    return data

def count_features(layer_url: str, where: str = "1=1") -> int:
    r = requests.get(
        f"{layer_url.rstrip('/')}/query",
        params={"where": where, "returnCountOnly": "true", "f": "json"},
        timeout=TIMEOUT,
        verify=False,
    )
    r.raise_for_status()
    data = r.json()
    if "error" in data:
        raise RuntimeError(data["error"])
    return int(data.get("count") or 0)

def fetch_page(
    layer_url: str,
    *,
    where: str,
    out_fields: str,
    offset: int,
    page_size: int,
    oid_field: str,
    out_sr: int,
) -> dict[str, Any]:
    params = {
        "where": where,
        "outFields": out_fields,
        "returnGeometry": "true",
        "outSR": out_sr,
        "resultOffset": offset,
        "resultRecordCount": page_size,
        "orderByFields": oid_field,
        "f": "geojson",
    }
    url = f"{layer_url.rstrip('/')}/query"
    
    # Intento de petición
    r = requests.get(url, params=params, timeout=TIMEOUT, verify=False)
    r.raise_for_status()
    data = r.json()
    
    # Si falla por orderByFields (algunos servidores viejos no lo soportan)
    if isinstance(data, dict) and data.get("error"):
        params.pop("orderByFields", None)
        r = requests.get(url, params=params, timeout=TIMEOUT, verify=False)
        r.raise_for_status()
        data = r.json()
        if isinstance(data, dict) and data.get("error"):
            raise RuntimeError(data["error"])
            
    return data

def download_layer(key: str, cfg: dict[str, Any], out_dir: Path) -> Path | None:
    url, label = cfg["url"], cfg["label"]
    print(f"\n=== {key} | {label} ===\nURL: {url}")

    try:
        meta = get_meta(url)
    except Exception as exc:
        print(f"  [ERROR] metadata: {exc}")
        return None

    name = meta.get("name", key)
    page_size = int(meta.get("maxRecordCount") or 1000)
    oid_field = meta.get("objectIdField") or "OBJECTID"
    print(f"  Layer: {name} | maxRecordCount={page_size}")

    try:
        total = count_features(url, WHERE)
    except Exception as exc:
        print(f"  [WARNING] count falló: {exc}. Procediendo con total estimado (10000).")
        total = 10000

    target = total if MAX_FEATURES is None else min(total, MAX_FEATURES)
    print(f"  Features servidor={total} | a descargar={target}")

    all_features = []
    seen = set()
    offset = 0

    while offset < target:
        batch = min(page_size, target - offset)
        print(f"  offset={offset} size={batch} …", end=" ", flush=True)
        try:
            page = fetch_page(
                url,
                where=WHERE,
                out_fields=OUT_FIELDS,
                offset=offset,
                page_size=batch,
                oid_field=oid_field,
                out_sr=OUT_SR,
            )
        except Exception as exc:
            print(f"ERROR: {exc}")
            break

        feats = page.get("features") or []
        if not feats:
            print("fin (vacío o sin formato geojson)")
            break

        for f in feats:
            props = f.get("properties") or f.get("attributes") or {}
            fid = props.get(oid_field) or props.get("OBJECTID")
            if fid is not None:
                if fid in seen:
                    continue
                seen.add(fid)
                
            geom = f.get("geometry")
            if geom: # Solo guardar polígonos que tengan geometría válida
                # Estandarizar nombre del barrio para todos los municipios
                nombre = props.get("nombre") or props.get("NOM_BARRIO") or props.get("NOMBARRIO") or props.get("NOM_VEREDA") or props.get("nombre_barrio") or props.get("NMG") or "Desconocido"
                props["nombre_barrio_estandarizado"] = str(nombre).strip()
                props["municipio_estandarizado"] = key
                
                all_features.append(
                    {"type": "Feature", "geometry": geom, "properties": props}
                )

        print(f"+{len(feats)} acum={len(all_features)}")
        offset += len(feats)
        
        if len(feats) < batch:
            break
            
        time.sleep(SLEEP_BETWEEN_PAGES)

    # Guardar GeoJSON final
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{key}.geojson"
    
    fc = {
        "type": "FeatureCollection",
        "name": f"{key}_{name}",
        "features": all_features,
    }
    out_path.write_text(json.dumps(fc, ensure_ascii=False), encoding="utf-8")
    
    print(f"  OK -> Guardado en {out_path} ({len(all_features)} features válidos)")
    return out_path


def main() -> None:
    print("Municipios configurados:")
    keys = list(LAYERS.keys())
    for i, k in enumerate(keys):
        print(f"{i+1}. {k} ({LAYERS[k]['label']})")
    print(f"{len(keys)+1}. Todos")
    
    op = input("\nSeleccione el número del municipio a descargar (separados por coma, ej: 3,6): ")
    selected_keys = []
    
    for val in op.split(","):
        val = val.strip()
        if val.isdigit():
            idx = int(val) - 1
            if 0 <= idx < len(keys):
                if keys[idx] not in selected_keys:
                    selected_keys.append(keys[idx])
            elif idx == len(keys):
                selected_keys = keys
                break

    if not selected_keys:
        print("No se seleccionó ningún municipio válido. Saliendo...")
        return

    print(f"\nIniciando descarga a: {OUT_DIR.resolve()} | OUT_SR={OUT_SR}")
    ok, fail = [], []
    for key in selected_keys:
        cfg = LAYERS[key]
        path = download_layer(key, cfg, OUT_DIR)
        (ok if path else fail).append(key)
        
    print(f"\n=======================")
    print(f"RESUMEN DE DESCARGA:")
    print(f"Éxito ({len(ok)}): {ok}")
    if fail:
        print(f"Fallaron ({len(fail)}): {fail}")
    print(f"Directorio final: {OUT_DIR.resolve()}")
    print(f"=======================")


if __name__ == "__main__":
    main()
