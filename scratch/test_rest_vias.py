import os, requests
from dotenv import load_dotenv
load_dotenv('.env')
url = os.environ.get('SUPABASE_URL')
key = os.environ.get('SUPABASE_SERVICE_KEY')
headers = {'apikey': key, 'Authorization': f'Bearer {key}'}

query = f"{url}/rest/v1/nomenclatura_igac?select=via&limit=1000"
res = requests.get(query, headers=headers)
vias = set([r['via'].split()[0] if r['via'] else '' for r in res.json()])
print(vias)
