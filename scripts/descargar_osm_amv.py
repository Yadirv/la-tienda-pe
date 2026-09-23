import requests
import pandas as pd
import os
import time

DATA_DIR = r"c:\proyectos\WorkScripts\1_Flujo_Multiagent\workspace\ecommerce-mascotas-colombia\data"

# Municipios faltantes del AMV que buscaremos en OSM
MUNICIPIOS = ["Envigado", "Sabaneta", "La Estrella", "Caldas"]

# Endpoint de la API pública de Overpass
OVERPASS_URL = "https://overpass.kumi.systems/api/interpreter"

COLS_UNIFICADAS = [
    "codigo_igac", "departamento", "municipio", "barrio", 
    "via", "placa", "numero_placa", "observaciones", 
    "latitud", "longitud"
]

def build_query(municipio, timeout_val=60):
    """
    Construye la consulta en lenguaje Overpass QL.
    Busca elementos geográficos que tengan las etiquetas 'addr:street' (Vía) 
    y 'addr:housenumber' (Número/Placa) dentro de los límites del municipio.
    """
    return f"""
    [out:json][timeout:{timeout_val}];
    area["name"="{municipio}"]["admin_level"~"6|8"]->.searchArea;
    (
      node["addr:street"]["addr:housenumber"](area.searchArea);
      way["addr:street"]["addr:housenumber"](area.searchArea);
      relation["addr:street"]["addr:housenumber"](area.searchArea);
    );
    out center;
    """

def extract_osm_data():
    print("\nSelecciona el municipio que deseas consultar en OSM:")
    for i, m in enumerate(MUNICIPIOS, 1):
        print(f"  {i}. {m}")
    print(f"  {len(MUNICIPIOS) + 1}. Todos los anteriores")
    
    opcion = input("\nIngresa el número de tu opción: ")
    
    try:
        opcion_idx = int(opcion.strip())
        if 1 <= opcion_idx <= len(MUNICIPIOS):
            municipios_a_consultar = [MUNICIPIOS[opcion_idx - 1]]
        elif opcion_idx == len(MUNICIPIOS) + 1:
            municipios_a_consultar = MUNICIPIOS
        else:
            print("Opción inválida. Saliendo del script.")
            return
    except ValueError:
        print("Opción inválida. Saliendo del script.")
        return

    for municipio in municipios_a_consultar:
        print(f"\nConsultando OSM para: {municipio}")
        
        timeout_val = 60
        intento = 1
        
        while True:
            print(f"  Intento {intento} (timeout {timeout_val}s)...")
            rows_municipio = []
            query = build_query(municipio, timeout_val)
            
            try:
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': '*/*'
                }
                
                # Configuramos el timeout de requests un poco más alto que el timeout de Overpass
                response = requests.post(OVERPASS_URL, data={'data': query}, headers=headers, timeout=timeout_val + 10)
                response.raise_for_status()
                data = response.json()
                
                elements = data.get("elements", [])
                print(f"  Encontrados: {len(elements)} registros de direcciones.")
                
                for el in elements:
                    tags = el.get("tags", {})
                    calle = tags.get("addr:street", "")
                    numero = tags.get("addr:housenumber", "")
                    barrio = tags.get("addr:suburb", tags.get("addr:neighbourhood", ""))
                    
                    direccion_completa = f"{calle} # {numero}"
                    via = calle.split(" ")[0] if calle else ""
                    
                    lat = el.get("lat", el.get("center", {}).get("lat"))
                    lon = el.get("lon", el.get("center", {}).get("lon"))
                    osm_id = el.get("id", "")
                    
                    rows_municipio.append({
                        "codigo_igac": f"OSM-{osm_id}",
                        "departamento": "ANTIOQUIA",
                        "municipio": municipio,
                        "barrio": barrio.strip(),
                        "via": via,
                        "placa": direccion_completa,
                        "numero_placa": numero,
                        "observaciones": "Origen: OpenStreetMap",
                        "latitud": lat,
                        "longitud": lon
                    })
                
                if rows_municipio:
                    os.makedirs(DATA_DIR, exist_ok=True)
                    df = pd.DataFrame(rows_municipio, columns=COLS_UNIFICADAS)
                    out_file = os.path.join(DATA_DIR, f"nomenclatura_osm_faltantes_{municipio}.tsv")
                    df.to_csv(out_file, sep="\t", index=False, encoding="utf-8")
                    print(f"  [Guardado] {len(rows_municipio)} registros en {out_file}")
                
                # Salimos del while (éxito) y pasamos al siguiente municipio
                break 
                    
            except requests.exceptions.HTTPError as e:
                print(f"  [Error] Fallo HTTP: {e}")
                if e.response is not None:
                    print(f"  Respuesta del servidor: {e.response.text.strip()}")
            except requests.exceptions.Timeout as e:
                print(f"  [Error] Tiempo de espera agotado: {e}")
            except Exception as e:
                print(f"  [Error] Inesperado: {e}")
            
            # Si llegamos aquí, hubo un error.
            if intento == 1:
                print(f"  Reintentando automáticamente con timeout de 180s...")
                timeout_val = 180
                intento += 1
                time.sleep(3)
                continue
            else:
                # A partir del intento 2, consultamos al usuario
                ans = input(f"  El intento {intento} falló. ¿Deseas reintentar de nuevo para {municipio}? (s/n): ")
                if ans.lower() == 's':
                    intento += 1
                    # Aumentamos ligeramente el timeout a 300s solo por si acaso
                    timeout_val = 300 
                    continue
                else:
                    print(f"  Saltando el municipio: {municipio}")
                    break
        
        # Pausa por respeto a las políticas de uso de la API gratuita de Overpass antes del siguiente municipio
        time.sleep(3)

if __name__ == "__main__":
    extract_osm_data()
