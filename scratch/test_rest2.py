import os, requests
from dotenv import load_dotenv
load_dotenv('.env')
url = os.environ.get('SUPABASE_URL')
key = os.environ.get('SUPABASE_SERVICE_KEY')
headers = {'apikey': key, 'Authorization': f'Bearer {key}'}

import urllib.parse
municipio = "Itagüí"
# tokens for 'cra 50' -> ['CR', '50']
tokens = ['CR', '50']
ilikeConditions = ",".join([f"placa.ilike.*{urllib.parse.quote(t)}*" for t in tokens])

query = f"{url}/rest/v1/nomenclatura_igac?select=placa,municipio,barrio,latitud,longitud&and=({ilikeConditions})&municipio=ilike.*{urllib.parse.quote(municipio)}*&limit=10"
print(query)
res = requests.get(query, headers=headers)
print(res.status_code)
try:
    print(res.json())
except Exception as e:
    print(res.text)
