import pandas as pd
import requests
import math
import os
from dotenv import load_dotenv
from tqdm import tqdm

load_dotenv()

# Archivos de entrada y salida
DATA_DIR = "data"
MEDELLIN_INPUT = os.path.join(DATA_DIR, "nomenclatura_domiciliaria_medellin_layer8.csv")
AMV_INPUT = os.path.join(DATA_DIR, "nomenclatura_amv.tsv")

# Configuración Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://qkzhopjfrlyvqfievcfi.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_KEY:
    raise ValueError("Error: No se encontró la variable de entorno SUPABASE_SERVICE_KEY o SUPABASE_SERVICE_ROLE_KEY. Asegúrese de que esté en el archivo .env")

TABLE_NAME = "nomenclatura_igac"
BATCH_SIZE = 500

def procesar_medellin():
    print(f"\n--- Procesando archivo de Medellín: {MEDELLIN_INPUT} ---")
    df = pd.read_csv(MEDELLIN_INPUT)
    initial_count = len(df)
    print(f"Registros iniciales Medellín: {initial_count}")

    # Filtrar registros sin coordenadas o placa
    df = df.dropna(subset=['latitud', 'longitud', 'placa', 'via'])

    # Crear placa completa: "via # placa_cruda"
    df['placa_final'] = df['via'].str.strip() + " # " + df['placa'].str.strip()

    # Mapear columnas a esquema de base de datos
    df_out = pd.DataFrame()
    df_out['codigo_igac'] = df['cbml'].astype(str).str.strip()
    df_out['departamento'] = "ANTIOQUIA"
    df_out['municipio'] = "Medellín"
    df_out['barrio'] = df['cbml'].astype(str).str.strip().str[:4] # aproximar código de barrio
    df_out['via'] = df['via'].astype(str).str.strip()
    df_out['placa'] = df['placa_final']
    df_out['numero_placa'] = df['numero_placa'].fillna('').astype(str).str.strip()
    df_out['observaciones'] = "Origen: objectid " + df['objectid'].astype(str)
    df_out['latitud'] = df['latitud'].astype(float)
    df_out['longitud'] = df['longitud'].astype(float)

    # Eliminar duplicados
    df_out = df_out.drop_duplicates(subset=['municipio', 'placa'], keep='first')
    print(f"Registros Medellín después de limpieza: {len(df_out)} (Eliminados: {initial_count - len(df_out)})")
    return df_out

def procesar_amv():
    print(f"\n--- Procesando archivo de AMV (Municipios aledaños): {AMV_INPUT} ---")
    df = pd.read_csv(AMV_INPUT, sep='\t')
    initial_count = len(df)
    print(f"Registros iniciales AMV: {initial_count}")

    # Filtrar registros sin coordenadas o placa
    df = df.dropna(subset=['latitud', 'longitud', 'placa'])

    # Asegurar que todas las columnas requeridas existen
    for col in ['codigo_igac', 'departamento', 'municipio', 'barrio', 'via', 'numero_placa', 'observaciones']:
        if col not in df.columns:
            df[col] = ''

    # Limpiar y mapear
    df_out = pd.DataFrame()
    df_out['codigo_igac'] = df['codigo_igac'].fillna('').astype(str).str.strip()
    df_out['departamento'] = df['departamento'].fillna('ANTIOQUIA').astype(str).str.strip()
    df_out['municipio'] = df['municipio'].fillna('').astype(str).str.strip()
    df_out['barrio'] = df['barrio'].fillna('').astype(str).str.strip()
    df_out['via'] = df['via'].fillna('').astype(str).str.strip()
    df_out['placa'] = df['placa'].astype(str).str.strip()
    df_out['numero_placa'] = df['numero_placa'].fillna('').astype(str).str.strip()
    df_out['observaciones'] = df['observaciones'].fillna('').astype(str).str.strip()
    df_out['latitud'] = df['latitud'].astype(float)
    df_out['longitud'] = df['longitud'].astype(float)

    # Eliminar duplicados
    df_out = df_out.drop_duplicates(subset=['municipio', 'placa'], keep='first')
    print(f"Registros AMV después de limpieza: {len(df_out)} (Eliminados: {initial_count - len(df_out)})")
    return df_out

def subir_a_supabase(df):
    print(f"\nIniciando subida a Supabase ({TABLE_NAME})...")
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }
    
    url = f"{SUPABASE_URL}/rest/v1/{TABLE_NAME}"
    
    # Convertir NaN a None (null en JSON)
    df = df.where(pd.notnull(df), None)
    records = df.to_dict('records')
    total_records = len(records)
    total_batches = math.ceil(total_records / BATCH_SIZE)
    
    print(f"Total registros a subir: {total_records} en {total_batches} lotes de {BATCH_SIZE}")
    
    success_count = 0
    error_count = 0
    
    for i in tqdm(range(0, total_records, BATCH_SIZE)):
        batch = records[i:i+BATCH_SIZE]
        try:
            resp = requests.post(url, headers=headers, json=batch)
            resp.raise_for_status()
            success_count += len(batch)
        except requests.exceptions.RequestException as e:
            error_count += len(batch)
            print(f"\nError en el lote {i//BATCH_SIZE + 1}: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"Detalle del error: {e.response.text}")
                
    print(f"\nSubida completada. Éxito: {success_count}, Errores: {error_count}")

def main():
    dfs = []
    
    # Cargar Medellín si existe
    if os.path.exists(MEDELLIN_INPUT):
        df_med = procesar_medellin()
        dfs.append(df_med)
    else:
        print(f"Advertencia: No se encontró el archivo de Medellín en {MEDELLIN_INPUT}")

    # Cargar AMV si existe
    if os.path.exists(AMV_INPUT):
        df_amv = procesar_amv()
        dfs.append(df_amv)
    else:
        print(f"Advertencia: No se encontró el archivo de AMV en {AMV_INPUT}")

    if not dfs:
        print("Error: No hay datos para procesar o subir.")
        return

    # Unificar ambos dataframes
    df_final = pd.concat(dfs, ignore_index=True)
    df_final = df_final.drop_duplicates(subset=['municipio', 'placa'], keep='first')
    print(f"\nTotal registros finales consolidados a subir: {len(df_final)}")

    subir_a_supabase(df_final)

if __name__ == "__main__":
    main()
