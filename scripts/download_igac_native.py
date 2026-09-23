import urllib.request
import ssl
import csv
import os
import codecs

# Ignorar errores de certificado SSL
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

url = "https://metadatos.icde.gov.co/geonetwork/srv/api/records/9dda46dd-dcc8-45a8-a89b-7e5d3dfb0910/attachments/Nomenclatura_Domiciliaria_Urbana_05-2026.csv"
output_tsv = "c:/proyectos/WorkScripts/1_Flujo_Multiagent/workspace/ecommerce-mascotas-colombia/data/nomenclatura_amv.tsv"

municipios_amv = {"MEDELLIN", "MEDELLÍN", "BELLO", "ITAGUI", "ITAGÜI", "ENVIGADO", "SABANETA", "LA ESTRELLA", "CALDAS"}

try:
    print("1. Descargando CSV desde metadatos.icde.gov.co (Antioquia)...")
    req = urllib.request.urlopen(url, context=ctx)
    reader = csv.DictReader(codecs.iterdecode(req, 'utf-8-sig'), delimiter=',')
    
    # Verificar separador, a veces el IGAC usa punto y coma
    if reader.fieldnames and len(reader.fieldnames) == 1:
        req = urllib.request.urlopen(url, context=ctx)
        reader = csv.DictReader(codecs.iterdecode(req, 'utf-8-sig'), delimiter=';')
        
    print("Columnas disponibles:", reader.fieldnames)
    mun_col = next((col for col in reader.fieldnames if 'MUNICIPIO' in col.upper()), None)
    
    if mun_col:
        print(f"2. Filtrando usando la columna: {mun_col}")
        
        os.makedirs(os.path.dirname(output_tsv), exist_ok=True)
        with open(output_tsv, 'w', encoding='utf-8', newline='') as out_f:
            # Columnas exactas que espera Supabase
            fieldnames = ['codigo_igac', 'departamento', 'municipio', 'barrio', 'tipo_via', 'nombre_via', 'numero_ini', 'numero_fin', 'observaciones']
            writer = csv.DictWriter(out_f, fieldnames=fieldnames, delimiter='\t')
            writer.writeheader()
            
            # Buscar variaciones de nombres de columnas
            tipo_via_col = next((c for c in reader.fieldnames if 'TIPO_VIA' in c.upper()), '')
            nom_via_col = next((c for c in reader.fieldnames if 'NOMBRE_VIA' in c.upper() or 'NOM_VIA' in c.upper()), '')
            
            count = 0
            for row in reader:
                mun_val = str(row.get(mun_col, '')).strip().upper()
                if mun_val in municipios_amv:
                    out_row = {
                        'codigo_igac': row.get('CODIGO', row.get('codigo_igac', '')),
                        'departamento': row.get('DEPARTAMENTO', row.get('departamento', 'ANTIOQUIA')),
                        'municipio': row[mun_col],
                        'barrio': row.get('BARRIO', ''),
                        'tipo_via': row.get(tipo_via_col, '') if tipo_via_col else '',
                        'nombre_via': row.get(nom_via_col, '') if nom_via_col else '',
                        'numero_ini': row.get('NUMERO_INI', row.get('NUMERO', '')),
                        'numero_fin': row.get('NUMERO_FIN', ''),
                        'observaciones': ''
                    }
                    writer.writerow(out_row)
                    count += 1
            print(f"3. => Registros del AMV encontrados: {count}")
            print(f"4. ¡Archivo guardado exitosamente en:\n   {output_tsv}")
    else:
        print("Error: No se encontro columna de municipio en el CSV.")

except Exception as e:
    print("Error:", e)
