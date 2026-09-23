import os, requests
from dotenv import load_dotenv
load_dotenv('.env')
url = os.environ.get('SUPABASE_URL')
key = os.environ.get('SUPABASE_SERVICE_KEY')
headers = {'apikey': key, 'Authorization': f'Bearer {key}'}

# Simulate input: 'cr 54a este'
# tokens: ['CR', '54A', 'ESTE']
query = f"{url}/rest/v1/nomenclatura_igac?select=placa,municipio,barrio,latitud,longitud&and=(placa.ilike.*CR*,placa.ilike.*54A*,placa.ilike.*ESTE*)&limit=5"
res = requests.get(query, headers=headers)
print(res.json())
