import requests, urllib3; urllib3.disable_warnings()
try:
    resp = requests.get('https://portalidem.metropol.gov.co/server/rest/services/Envigado_Catastro/MapServer/6/query?where=1=1&outFields=*&returnGeometry=false&f=json&resultRecordCount=5', timeout=10, verify=False)
    data = resp.json()
    for feat in data.get('features', []):
        print(feat.get('attributes'))
except Exception as e: print(e)
