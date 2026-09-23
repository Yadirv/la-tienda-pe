import requests
import pandas as pd
import time
import os
import urllib3

# Deshabilitar advertencias de certificados SSL no verificados
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

DATA_DIR = r"c:\proyectos\WorkScripts\1_Flujo_Multiagent\workspace\ecommerce-mascotas-colombia\data"
OUTPUT_TSV = os.path.join(DATA_DIR, "nomenclatura_itagui.tsv")

URL = "https://arcgis.itagui.gov.co/waserver/rest/services/Catastro/Catastro_2022/MapServer/0/query"

# Esquema unificado (columnas requeridas)
COLS_UNIFICADAS = [
    "codigo_igac", "departamento", "municipio", "barrio", 
    "via", "placa", "numero_placa", "observaciones", 
    "latitud", "longitud"
]

def get_count():
    params = {
        "where": "1=1",
        "returnCountOnly": "true",
        "f": "json"
    }
    resp = requests.get(URL, params=params, verify=False, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    return data.get("count", 0)

def fetch_page(offset, limit=1000):
    params = {
        "where": "1=1",
        "outFields": "*",
        "resultOffset": offset,
        "resultRecordCount": limit,
        "outSR": "4326", # WGS84
        "f": "json"
    }
    
    for attempt in range(5):
        try:
            resp = requests.get(URL, params=params, verify=False, timeout=60)
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
    
    print(f"\n--- Iniciando descarga de Nomenclatura Itagüí ---")
    try:
        total_count = get_count()
        print(f"Total registros esperados en Itagüí: {total_count}")
    except Exception as e:
        print(f"Error obteniendo conteo: {e}")
        return

    all_rows = []
    limit = 1000
    
    for offset in range(0, total_count, limit):
        print(f"Descargando offset {offset}...")
        features = fetch_page(offset, limit)
        if not features:
            print("No se obtuvieron registros o fin de página.")
            break
            
        for feat in features:
            attrs = feat.get("attributes", {})
            geom = feat.get("geometry", {})
            
            # Mapeo específico de Itagüí (Capa 0)
            barrio = attrs.get("barrio", "")
            direccion = attrs.get("direccion", "")
            x = attrs.get("x") or geom.get("x")
            y = attrs.get("y") or geom.get("y")
            pk_predios = attrs.get("pk_predios") or attrs.get("objectid")
            
            placa = str(direccion).strip() if direccion else ""
            
            via = ""
            parts = placa.split(" ", 1)
            if len(parts) > 1 and parts[0].lower() in ["cl", "cll", "calle", "cr", "cra", "carrera", "dg", "diagonal", "tv", "transversal", "av", "avenida"]:
                via = parts[0]
                
            row = {
                "codigo_igac": str(pk_predios).strip() if pk_predios else "",
                "departamento": "ANTIOQUIA",
                "municipio": "Itagüí",
                "barrio": str(barrio).strip() if barrio else "",
                "via": via,
                "placa": placa,
                "numero_placa": "",
                "observaciones": "Origen: " + str(attrs.get("objectid", "")),
                "latitud": y,
                "longitud": x
            }
            all_rows.append(row)
            
        # Pequeña pausa para no saturar el servidor
        time.sleep(0.5)

    if all_rows:
        df = pd.DataFrame(all_rows, columns=COLS_UNIFICADAS)
        df.to_csv(OUTPUT_TSV, sep="\t", index=False, encoding="utf-8")
        print(f"¡Descarga exitosa! {len(all_rows)} registros guardados en {OUTPUT_TSV}")
    else:
        print("No se encontraron registros.")

if __name__ == "__main__":
    main()
