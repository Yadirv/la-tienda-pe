import requests
import pandas as pd
import time
import os
import json
from tqdm import tqdm

# Configuración del servicio
BASE_URL = "https://www.medellin.gov.co/servidormapas/rest/services"
SERVICE = "ServiciosCatastro/Base_Catastral/MapServer"
LAYER_ID = 8  # Nomenclatura Domiciliaria
QUERY_URL = f"{BASE_URL}/{SERVICE}/{LAYER_ID}/query"

# Campos a extraer
OUT_FIELDS = [
    "objectid", "cbml", "via", "placa", "numero_placa",
    "direccioncodificada", "direccionencasillada",
    "latitud", "longitud", "codigo_postal", "fecha_sincronizacion"
]

OUTPUT_CSV = "nomenclatura_domiciliaria_medellin_layer8.csv"
STATE_FILE = "nomenclatura_download_state.json"
MAX_RECORD_COUNT = 1000

def get_total_count():
    params = {
        "f": "json",
        "where": "1=1",
        "returnCountOnly": "true"
    }
    resp = requests.get(QUERY_URL, params=params)
    resp.raise_for_status()
    data = resp.json()
    return data.get("count", 0)

def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, "r") as f:
            return json.load(f)
    return {"offset": 0, "total": 0}

def save_state(offset, total):
    with open(STATE_FILE, "w") as f:
        json.dump({"offset": offset, "total": total}, f)

def fetch_page(offset, limit, retries=5):
    params = {
        "f": "json",
        "where": "1=1",
        "outFields": ",".join(OUT_FIELDS),
        "returnGeometry": "false",
        "resultOffset": offset,
        "resultRecordCount": limit,
        "orderByFields": "objectid ASC"
    }
    
    for attempt in range(retries):
        try:
            resp = requests.get(QUERY_URL, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            if "error" in data:
                raise Exception(data["error"])
            return data.get("features", [])
        except Exception as e:
            print(f"Error fetching offset {offset}, attempt {attempt+1}/{retries}: {e}")
            time.sleep(2 ** attempt)  # Exponential backoff
    
    raise Exception(f"Failed to fetch data at offset {offset} after {retries} retries.")

def main():
    total_count = get_total_count()
    print(f"Total registros a descargar: {total_count}")
    
    state = load_state()
    current_offset = state.get("offset", 0)
    
    if current_offset >= total_count:
        print("La descarga ya fue completada previamente.")
        return
        
    print(f"Reanudando desde offset: {current_offset}")
    
    # Abrir archivo en modo append si ya existe y tenemos un offset > 0
    mode = "a" if current_offset > 0 and os.path.exists(OUTPUT_CSV) else "w"
    
    with tqdm(total=total_count, initial=current_offset) as pbar:
        while current_offset < total_count:
            features = fetch_page(current_offset, MAX_RECORD_COUNT)
            if not features:
                print("No se encontraron más registros. Terminando prematuramente.")
                break
                
            rows = [f.get("attributes", {}) for f in features]
            df = pd.DataFrame(rows)
            
            # Si es la primera escritura, incluir cabeceras
            header = True if current_offset == 0 else False
            df.to_csv(OUTPUT_CSV, mode=mode, index=False, header=header, encoding="utf-8-sig")
            
            current_offset += len(features)
            save_state(current_offset, total_count)
            pbar.update(len(features))
            
            # Cambiar a modo append después de la primera escritura
            mode = "a"
            
            # Pequeña pausa para no saturar el servidor
            time.sleep(0.1)
            
    print(f"Descarga completa. Archivo guardado en {OUTPUT_CSV}")

if __name__ == "__main__":
    main()
