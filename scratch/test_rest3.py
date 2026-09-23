import os, requests
from dotenv import load_dotenv
load_dotenv('.env')
url = os.environ.get('SUPABASE_URL')
key = os.environ.get('SUPABASE_SERVICE_KEY')
headers = {'apikey': key, 'Authorization': f'Bearer {key}'}

# Get distinct municipios by querying without limits filtering by something that hits everything
query = f"{url}/rest/v1/nomenclatura_igac?select=municipio"
res = requests.get(query, headers=headers)
print(set([r['municipio'] for r in res.json()]))
