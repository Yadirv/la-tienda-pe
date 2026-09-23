import pandas as pd
import os
import re

try:
    from pyproj import Transformer
    transformer = Transformer.from_crs("EPSG:3116", "EPSG:4326", always_xy=True)
    HAS_PYPROJ = True
except ImportError:
    HAS_PYPROJ = False
    print("Advertencia: pyproj no instalado. Las coordenadas de Itagüí no se convertirán a WGS84.")

DATA_DIR = r"c:\proyectos\WorkScripts\1_Flujo_Multiagent\workspace\ecommerce-mascotas-colombia\data"

FILES_TO_MERGE = [
    "nomenclatura_itagui.tsv",
    "nomenclatura_osm_faltantes_Caldas.tsv",
    "nomenclatura_osm_faltantes_Envigado.tsv",
    "nomenclatura_osm_faltantes_La Estrella.tsv",
    "nomenclatura_osm_faltantes_Sabaneta.tsv"
]

OUTPUT_TSV = os.path.join(DATA_DIR, "nomenclatura_amv_consolidada.tsv")

def clean_text(text):
    if pd.isna(text):
        return ""
    text = str(text).strip()
    # Replace multiple spaces with single space
    text = re.sub(r'\s+', ' ', text)
    # Remove weird characters if any, but keep accents and basic punctuation
    text = re.sub(r'[^\w\s#\-.,áéíóúÁÉÍÓÚñÑ]', '', text)
    return text.upper()

def process_coordinates(df, source_file):
    # If it's Itagüí, coordinates might be in MAGNA-SIRGAS (EPSG 3116)
    # Let's check magnitude of coordinates to decide if we need conversion
    if "itagui" in source_file.lower() and HAS_PYPROJ:
        try:
            # MAGNA-SIRGAS X (longitud) usually around 800,000, Y (latitud) usually around 1,100,000
            # Wait, our inspect showed: latitud 1173120, longitud 829085. 
            # In EPSG 3116: X (Easting) is longitud, Y (Northing) is latitud.
            
            # Convert to float
            df['latitud_float'] = pd.to_numeric(df['latitud'], errors='coerce')
            df['longitud_float'] = pd.to_numeric(df['longitud'], errors='coerce')
            
            # We use it if X > 1000
            mask = df['longitud_float'] > 1000
            
            if mask.any():
                print(f"  Transformando {mask.sum()} coordenadas de EPSG:3116 a EPSG:4326...")
                lon, lat = transformer.transform(df.loc[mask, 'longitud_float'].values, df.loc[mask, 'latitud_float'].values)
                df.loc[mask, 'longitud'] = lon.astype(str)
                df.loc[mask, 'latitud'] = lat.astype(str)
            
            df.drop(columns=['latitud_float', 'longitud_float'], inplace=True)
            
        except Exception as e:
            print(f"  Error transformando coordenadas en {source_file}: {e}")
            
    return df

def main():
    dfs = []
    
    for f in FILES_TO_MERGE:
        path = os.path.join(DATA_DIR, f)
        if not os.path.exists(path):
            print(f"Archivo no encontrado: {f}")
            continue
            
        print(f"Procesando {f}...")
        df = pd.read_csv(path, sep="\t", dtype=str)
        
        # Clean string columns
        str_cols = ['departamento', 'municipio', 'barrio', 'via', 'placa', 'numero_placa', 'observaciones']
        for col in str_cols:
            if col in df.columns:
                df[col] = df[col].apply(clean_text)
                
        df = process_coordinates(df, f)
        
        dfs.append(df)
        
    if dfs:
        consolidated = pd.concat(dfs, ignore_index=True)
        
        # Remove duplicates if any
        initial_len = len(consolidated)
        consolidated.drop_duplicates(subset=['municipio', 'placa'], keep='first', inplace=True)
        final_len = len(consolidated)
        
        if initial_len != final_len:
            print(f"Se eliminaron {initial_len - final_len} registros duplicados (misma placa en el mismo municipio).")
            
        consolidated.to_csv(OUTPUT_TSV, sep="\t", index=False, encoding="utf-8")
        print(f"\nConsolidación exitosa. Guardado en: {OUTPUT_TSV}")
        print(f"Total registros finales: {final_len}")
    else:
        print("No se encontraron datos para consolidar.")

if __name__ == "__main__":
    main()
