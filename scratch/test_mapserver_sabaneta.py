import requests
import urllib3
urllib3.disable_warnings()

def get_fields(url):
    try:
        resp = requests.get(url + '?f=json', timeout=10, verify=False)
        data = resp.json()
        print(f"--- {data.get('name', url)} ---")
        if 'fields' in data:
            for f in data['fields']:
                print(f.get('name'))
    except Exception as e:
        print(e)

get_fields('https://portalidem.metropol.gov.co/server/rest/services/Sabaneta_Catastro/MapServer/6')
get_fields('https://portalidem.metropol.gov.co/server/rest/services/Sabaneta_Catastro/MapServer/2')
