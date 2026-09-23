import requests
import urllib3
urllib3.disable_warnings()

def get_layers(url):
    try:
        r = requests.get(url + '?f=json', verify=False, timeout=10)
        r.raise_for_status()
        data = r.json()
        print(f'URL: {url}')
        for layer in data.get('layers', []):
            name = layer['name'].lower()
            if 'barrio' in name or 'sector' in name:
                print(f"  Layer {layer['id']}: {layer['name']}")
    except Exception as e:
        print(f'Error fetching {url}: {e}')

get_layers('https://www.medellin.gov.co/servidormapas/rest/services/ServiciosCatastro/Base_Catastral/MapServer')
