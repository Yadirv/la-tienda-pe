import requests
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

urls = [
    'https://portalidem.metropol.gov.co/server/rest/services/Envigado_Catastro/MapServer',
    'https://portalidem.metropol.gov.co/server/rest/services/Itagui_Catastro/MapServer',
    'https://portalidem.metropol.gov.co/server/rest/services/Sabaneta_Catastro/MapServer',
    'https://portalidem.metropol.gov.co/server/rest/services/Medellin_Catastro/MapServer',
    'https://portalidem.metropol.gov.co/server/rest/services/Bello_Catastro/MapServer'
]

for url in urls:
    try:
        res = requests.get(f"{url}?f=json", verify=False, timeout=10)
        if res.status_code == 200:
            data = res.json()
            print(f"\n--- {url.split('/')[-2]} ---")
            for layer in data.get('layers', []):
                print(f"Layer {layer['id']}: {layer['name']}")
    except Exception as e:
        print('Error:', e)
