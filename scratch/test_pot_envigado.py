import requests, urllib3; urllib3.disable_warnings()
try:
    resp = requests.get('https://portalidem.metropol.gov.co/server/rest/services/POT_Envigado/MapServer?f=json', timeout=10, verify=False)
    data = resp.json()
    for l in data.get('layers', []):
        if 'nomenclatura' in l['name'].lower() or 'direccion' in l['name'].lower() or 'predio' in l['name'].lower() or 'vias' in l['name'].lower() or 'via' in l['name'].lower():
            print(f"Layer {l['id']}: {l['name']}")
except Exception as e: print(e)
