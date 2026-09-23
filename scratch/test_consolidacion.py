import pandas as pd
import os

data_dir = r"c:\proyectos\WorkScripts\1_Flujo_Multiagent\workspace\ecommerce-mascotas-colombia\data"

files = [
    "nomenclatura_itagui.tsv",
    "nomenclatura_osm_faltantes_Caldas.tsv",
    "nomenclatura_osm_faltantes_Envigado.tsv",
    "nomenclatura_osm_faltantes_La Estrella.tsv",
    "nomenclatura_osm_faltantes_Sabaneta.tsv"
]

dfs = []
for f in files:
    path = os.path.join(data_dir, f)
    if os.path.exists(path):
        try:
            df = pd.read_csv(path, sep="\t", dtype=str)
            print(f"{f}: {len(df)} registros")
            dfs.append(df)
        except Exception as e:
            print(f"Error reading {f}: {e}")

if dfs:
    consolidated = pd.concat(dfs, ignore_index=True)
    print(f"\nTotal registros antes de limpieza: {len(consolidated)}")
    
    # Check for missing columns or weird columns
    print("\nColumnas:", list(consolidated.columns))
    
    # Muestra muestra
    print("\nEjemplos:")
    print(consolidated.sample(min(5, len(consolidated))))
