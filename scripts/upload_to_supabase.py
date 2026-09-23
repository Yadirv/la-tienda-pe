import os
import pandas as pd
from supabase import create_client, Client
from dotenv import load_dotenv
import math

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")
FILE_PATH = r"c:\proyectos\WorkScripts\1_Flujo_Multiagent\workspace\ecommerce-mascotas-colombia\data\nomenclatura_amv_consolidada.tsv"

def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Faltan variables de entorno para Supabase.")
        return

    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    print(f"Cargando datos desde {FILE_PATH}...")
    df = pd.read_csv(FILE_PATH, sep="\t", dtype=str)
    
    # Supabase expects null for empty numeric fields.
    # Convert all NaN/pd.NA to None, not empty string.
    import numpy as np
    df = df.replace({np.nan: None, pd.NA: None})
    
    # Also explicitly cast lat/lon to float to ensure proper json typing, keeping None for empty
    df['latitud'] = pd.to_numeric(df['latitud'], errors='coerce')
    df['longitud'] = pd.to_numeric(df['longitud'], errors='coerce')
    df = df.replace({np.nan: None})
    
    # We will upload in chunks of 5000 records to avoid payload too large
    chunk_size = 5000
    total_records = len(df)
    total_chunks = math.ceil(total_records / chunk_size)
    
    print(f"Total registros: {total_records} en {total_chunks} lotes.")
    
    records = df.to_dict('records')
    
    for i in range(total_chunks):
        start = i * chunk_size
        end = start + chunk_size
        chunk = records[start:end]
        
        try:
            # Use insert to avoid missing unique constraint issues
            response = supabase.table("nomenclatura_igac").insert(chunk).execute()
            print(f"Lote {i+1}/{total_chunks} insertado/actualizado exitosamente.")
        except Exception as e:
            print(f"Error en el lote {i+1}: {e}")

if __name__ == "__main__":
    main()
