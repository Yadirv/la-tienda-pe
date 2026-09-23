import requests
import pandas as pd
import time
import os
import json
import urllib3
from tqdm import tqdm

# Deshabilitar advertencias de certificados SSL no verificados
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

DATA_DIR = r"c:\proyectos\WorkScripts\1_Flujo_Multiagent\workspace\ecommerce-mascotas-colombia\data"
OUTPUT_TSV = os.path.join(DATA_DIR, "nomenclatura_amv.tsv")
STATE_FILE = os.path.join(DATA_DIR, "descarga_amv_state.json")

# Esquema unificado (columnas requeridas)
COLS_UNIFICADAS = [
    "codigo_igac", "departamento", "municipio", "barrio", 
    "via", "placa", "numero_placa", "observaciones", 
    "latitud", "longitud"
]

ENDPOINTS = [
    {
        "id": "envigado_l6",
        "url": "https://portalidem.metropol.gov.co/server/rest/services/Envigado_Catastro/MapServer/6/query",
        "where": "1=1",
        "municipio_default": "Envigado"
    },
    {
        "id": "sabaneta_l2",
        "url": "https://portalidem.metropol.gov.co/server/rest/services/Sabaneta_Catastro/MapServer/2/query",
        "where": "1=1",
        "municipio_default": "Sabaneta"
    },
    {
        "id": "sabaneta_l6",
        "url": "https://portalidem.metropol.gov.co/server/rest/services/Sabaneta_Catastro/MapServer/6/query",
        "where": "1=1",
        "municipio_default": "Sabaneta"
    },
    {
        "id": "itagui_l6",
        "url": "https://arcgis.itagui.gov.co/waserver/rest/services/Catastro/Catastro_2022/MapServer/6/query",
        "where": "1=1",
        "municipio_default": "Itagüí"
    },
    {
        "id": "itagui_l7",
        "url": "https://arcgis.itagui.gov.co/waserver/rest/services/Catastro/Catastro_2022/MapServer/7/query",
        "where": "1=1",
        "municipio_default": "Itagüí"
    },
    {
        "id": "bello_pot_l2",
        "url": "https://sim.metropol.gov.co/arcgis/rest/services/Planes_Ordenamiento_Territorial/POT_Bello/MapServer/2/query",
        "where": "1=1",
        "municipio_default": "Bello"
    },
    {
        "id": "la_estrella_l8",
        "url": "https://portalidem.metropol.gov.co/server/rest/services/La_Estrella_Catastro/MapServer/8/query",
        "where": "1=1",
        "municipio_default": "La Estrella"
    },
    {
        "id": "antioquia_l6_caldas",
        "url": "https://geodatos.antioquia.gov.co/server/rest/services/Catastro/Visor_Geo/MapServer/6/query",
        "where": "MUNICIPIO = '129' OR MUNICIPIO = 'CALDAS' OR MUNICIPIO = 'Caldas'",
        "municipio_default": "Caldas"
    }
]

def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def save_state(state):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f)

def map_attributes(attrs, centroid, municipio_def):
    # Intentar buscar la direccion y demas en campos comunes de MapServer catastral
    # Esta es una aproximación generica, cada municipio puede llamarlos diferente.
    
    # Barrio
    barrio = attrs.get("BARRIO") or attrs.get("barrio") or attrs.get("NOM_BARRIO") or ""
    
    # Dirección / Placa (Soporta DESCRIPCIO de Bello, y LOCAL_ID/TERRENO_CO como fallback de La Estrella)
    direccion = attrs.get("DESCRIPCIO") or attrs.get("LOCAL_ID") or attrs.get("TERRENO_CO") or attrs.get("DIRECCION") or attrs.get("direccion") or attrs.get("ETIQUETA") or attrs.get("PREDIOS") or ""
    placa = str(direccion).strip()
    
    # Extraer tipo_via (via) y resto
    via = ""
    parts = placa.split(" ", 1)
    if len(parts) > 1 and parts[0].lower() in ["cl", "cll", "calle", "cr", "cra", "carrera", "dg", "diagonal", "tv", "transversal", "av", "avenida"]:
        via = parts[0]

    # Coordenadas centroid
    lat = centroid.get("y") if centroid else None
    lon = centroid.get("x") if centroid else None

    # Codigo IGAC
    codigo_igac = attrs.get("TERRENO_CO") or attrs.get("LOCAL_ID") or attrs.get("PK_PREDIOS") or attrs.get("TERRENO_CODIGO") or attrs.get("OBJECTID_1") or attrs.get("OBJECTID") or ""

    return {
        "codigo_igac": str(codigo_igac).strip(),
        "departamento": "ANTIOQUIA",
        "municipio": municipio_def,
        "barrio": str(barrio).strip(),
        "via": via,
        "placa": placa,
        "numero_placa": "",
        "observaciones": "Origen: " + str(attrs.get("OBJECTID", attrs.get("OBJECTID_1", ""))),
        "latitud": lat,
        "longitud": lon
    }

def get_count(ep):
    params = {
        "where": ep["where"],
        "returnCountOnly": "true",
        "f": "json"
    }
    resp = requests.get(ep["url"], params=params, verify=False, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    return data.get("count", 0)

def fetch_page(ep, offset, limit=1000):
    params = {
        "where": ep["where"],
        "outFields": "*",
        "resultOffset": offset,
        "resultRecordCount": limit,
        "returnGeometry": "true",
        "returnCentroid": "true",
        "outSR": "4326", # WGS84
        "f": "json"
    }
    
    for attempt in range(5):
        try:
            resp = requests.get(ep["url"], params=params, verify=False, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                raise Exception(data["error"])
            return data.get("features", [])
        except Exception as e:
            time.sleep(2 ** attempt)
    return []

def main():
    os.makedirs(DATA_DIR, exist_ok=True)
    state = load_state()
    
    # Crear archivo si no existe, o añadirle si ya existe
    if not os.path.exists(OUTPUT_TSV):
        df_empty = pd.DataFrame(columns=COLS_UNIFICADAS)
        df_empty.to_csv(OUTPUT_TSV, sep="\t", index=False, encoding="utf-8")
        
    for ep in ENDPOINTS:
        ep_id = ep["id"]
        
        # Saltamos si ya lo completamos
        if state.get(ep_id, {}).get("completed", False):
            print(f"[{ep_id}] Ya completado previamente. Saltando.")
            continue
            
        print(f"\n--- Iniciando descarga: {ep['municipio_default']} ({ep_id}) ---")
        try:
            total_count = get_count(ep)
            print(f"Total registros esperados: {total_count}")
        except Exception as e:
            print(f"No se pudo obtener count para {ep_id}: {e}")
            continue
            
        if total_count == 0:
            print(f"Cero registros encontrados para el filtro: {ep['where']}")
            state[ep_id] = {"completed": True, "offset": 0}
            save_state(state)
            continue
            
        current_offset = state.get(ep_id, {}).get("offset", 0)
        
        with tqdm(total=total_count, initial=current_offset) as pbar:
            while current_offset < total_count:
                features = fetch_page(ep, current_offset, limit=1000)
                if not features:
                    print("No llegaron mas registros. Terminando loop.")
                    break
                    
                rows = []
                for f in features:
                    attrs = f.get("attributes", {})
                    
                    # Manejar geometrias para obtener lat/lon
                    geom = f.get("geometry", {})
                    centroid = None
                    if "x" in geom and "y" in geom: # Es un punto
                        centroid = geom
                    elif "rings" in geom: # Es un poligono, pero si pedimos returnCentroid viene en centroide? No, ARCGIS requiere returnCentroid en geometry object? O lo trae en 'centroid' 
                        # A veces returnCentroid no funciona si la version del server es vieja.
                        # Sacamos un promedio simple si hay anillos
                        rings = geom.get("rings", [])
                        if rings and len(rings) > 0 and len(rings[0]) > 0:
                            xs = [pt[0] for pt in rings[0]]
                            ys = [pt[1] for pt in rings[0]]
                            centroid = {"x": sum(xs)/len(xs), "y": sum(ys)/len(ys)}
                            
                    mapped = map_attributes(attrs, centroid, ep["municipio_default"])
                    rows.append(mapped)
                    
                df = pd.DataFrame(rows, columns=COLS_UNIFICADAS)
                df.to_csv(OUTPUT_TSV, sep="\t", mode="a", index=False, header=False, encoding="utf-8")
                
                current_offset += len(features)
                state[ep_id] = {"completed": False, "offset": current_offset}
                save_state(state)
                pbar.update(len(features))
                
        # Marcar como completado
        state[ep_id] = {"completed": True, "offset": current_offset}
        save_state(state)

    print(f"\nDescarga de todos los municipios completada. Archivo en: {OUTPUT_TSV}")

if __name__ == "__main__":
    main()
