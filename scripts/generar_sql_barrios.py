import os
import json
import uuid

GEOJSON_DIR = 'data/geojson'
OUTPUT_SQL = 'barrios_supabase.sql'

def generar_sql():
    if not os.path.exists(GEOJSON_DIR):
        print(f"Error: Directorio {GEOJSON_DIR} no existe.")
        return

    sql_statements = [
        "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";",
        "CREATE TABLE IF NOT EXISTS petpro_barrios (",
        "    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),",
        "    municipio TEXT NOT NULL,",
        "    nombre TEXT NOT NULL,",
        "    UNIQUE(municipio, nombre)",
        ");",
        "",
        "TRUNCATE TABLE petpro_barrios;",
        ""
    ]

    inserts = []
    
    # Conjunto para evitar duplicados exactos dentro del script
    vistos = set()

    for filename in os.listdir(GEOJSON_DIR):
        if not filename.endswith('.geojson'):
            continue
            
        filepath = os.path.join(GEOJSON_DIR, filename)
        with open(filepath, 'r', encoding='utf-8') as f:
            try:
                data = json.load(f)
                if 'features' not in data:
                    continue
                
                for feature in data['features']:
                    props = feature.get('properties', {})
                    
                    # Intentar obtener el nombre del barrio
                    bName = (props.get('nombre_barrio_estandarizado') or 
                             props.get('NOMBRE') or 
                             props.get('BARRIO') or 
                             props.get('NOM_BARRIO') or 
                             props.get('nombre') or 
                             props.get('barrio'))
                             
                    # Intentar obtener el municipio
                    mun = (props.get('municipio_estandarizado') or 
                           props.get('MUNICIPIO') or 
                           props.get('MPIO') or
                           filename.replace('.geojson', ''))
                    
                    if bName and mun:
                        # Estandarizar
                        bName = str(bName).strip().upper()
                        mun = str(mun).strip().upper()
                        # La Estrella workaround
                        if mun == 'LA-ESTRELLA': mun = 'LA ESTRELLA'
                        
                        unique_key = f"{mun}::{bName}"
                        if unique_key not in vistos:
                            vistos.add(unique_key)
                            
                            # Escapar comillas simples
                            bName_esc = bName.replace("'", "''")
                            mun_esc = mun.replace("'", "''")
                            
                            inserts.append(f"('{mun_esc}', '{bName_esc}')")
                            
            except Exception as e:
                print(f"Error procesando {filename}: {e}")
                
    if inserts:
        # Hacer chunks de 1000 inserts para no romper el límite de query
        chunk_size = 1000
        for i in range(0, len(inserts), chunk_size):
            chunk = inserts[i:i+chunk_size]
            sql_statements.append("INSERT INTO petpro_barrios (municipio, nombre) VALUES")
            sql_statements.append(",\n".join(chunk) + ";\n")
            
    with open(OUTPUT_SQL, 'w', encoding='utf-8') as f:
        f.write("\n".join(sql_statements))
        
    print(f"Generado exitosamente {OUTPUT_SQL} con {len(inserts)} barrios.")

if __name__ == '__main__':
    generar_sql()
