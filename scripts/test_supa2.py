import urllib.request
import json

url = "https://qkzhopjfrlyvqfievcfi.supabase.co/rest/v1/petpro_barrios?select=count"
headers = {
    "apikey": "sb_publishable_B8kxChkEQRWA32IFAWNLXA_viGXj1Yo",
    "Authorization": "Bearer sb_publishable_B8kxChkEQRWA32IFAWNLXA_viGXj1Yo"
}

req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req) as response:
        print("Response:", response.read().decode())
except Exception as e:
    print("Error:", e)
