import pandas as pd
import ssl
import os

# Ignorar errores de certificado SSL
ssl._create_default_https_context = ssl._create_unverified_context

url = "https://metadatos.icde.gov.co/geonetwork/srv/api/records/9dda46dd-dcc8-45a8-a89b-7e5d3dfb0910/attachments/Nomenclatura_Domiciliaria_Urbana_05-2026.csv"
output_tsv = "c:/proyectos/WorkScripts/1_Flujo_Multiagent/workspace/ecommerce-mascotas-colombia/data/nomenclatura_amv.tsv"

try:
    print("1. Descargando CSV desde metadatos.icde.gov.co (Antioquia)...")
    df = pd.read_csv(url, encoding="utf-8", sep=";", on_bad_lines="skip")
    
    # Si la separacion por ; no dio multiples columnas, reintentar con coma
    if len(df.columns) == 1:
        df = pd.read_csv(url, encoding="utf-8", sep=",", on_bad_lines="skip")
        
    print(f"2. Descarga exitosa. Total registros en Antioquia: {len(df)}")
    print("Columnas disponibles:", df.columns.tolist())
    
    # Filtrar AMV
    municipios_amv = ["MEDELLIN", "MEDELLÍN", "BELLO", "ITAGUI", "ITAGÜI", "ENVIGADO", "SABANETA", "LA ESTRELLA", "CALDAS"]
    
    mun_col = next((col for col in df.columns if 'MUNICIPIO' in col.upper()), None)
    if mun_col:
        print(f"3. Filtrando usando la columna: {mun_col}")
        # Normalizar valores para el filtro
        df_amv = df[df[mun_col].astype(str).str.upper().str.strip().isin(municipios_amv)]
        print(f"   => Registros del AMV encontrados: {len(df_amv)}")
        
        # Mapeo a las columnas que espera Supabase
        # id, codigo_igac, departamento, municipio, barrio, tipo_via, nombre_via, numero_ini, numero_fin, observaciones
        
        # Crear DataFrame con estructura Supabase
        df_out = pd.DataFrame()
        df_out['codigo_igac'] = df_amv.get('CODIGO', df_amv.get('codigo_igac', ''))
        df_out['departamento'] = df_amv.get('DEPARTAMENTO', df_amv.get('departamento', 'ANTIOQUIA'))
        df_out['municipio'] = df_amv[mun_col]
        df_out['barrio'] = df_amv.get('BARRIO', '')
        
        # Intentar varias alternativas de nombres para la via
        tipo_via_col = next((c for c in df_amv.columns if 'TIPO_VIA' in c.upper()), '')
        nom_via_col = next((c for c in df_amv.columns if 'NOMBRE_VIA' in c.upper() or 'NOM_VIA' in c.upper()), '')
        
        df_out['tipo_via'] = df_amv[tipo_via_col] if tipo_via_col else ''
        df_out['nombre_via'] = df_amv[nom_via_col] if nom_via_col else ''
        
        df_out['numero_ini'] = df_amv.get('NUMERO_INI', df_amv.get('NUMERO', ''))
        df_out['numero_fin'] = df_amv.get('NUMERO_FIN', '')
        df_out['observaciones'] = ''
        
        # Guardar
        os.makedirs(os.path.dirname(output_tsv), exist_ok=True)
        df_out.to_csv(output_tsv, sep="\t", index=False)
        print(f"4. ¡Archivo guardado exitosamente en:\n   {output_tsv}")
    else:
        print("Error: No se encontro columna de municipio en el CSV.")
except Exception as e:
    print("Error durante la descarga o procesamiento:", e)
