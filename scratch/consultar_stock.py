import urllib.request
import json

url = 'https://qkzhopjfrlyvqfievcfi.supabase.co/rest/v1/petpro_productos?select=ref,producto,marca,categoria,inventario_b2c,activo_b2c,promo_b2c&inventario_b2c=gt.0&order=inventario_b2c.desc'
headers = {
    'apikey': 'sb_publishable_B8kxChkEQRWA32IFAWNLXA_viGXj1Yo',
    'Authorization': 'Bearer sb_publishable_B8kxChkEQRWA32IFAWNLXA_viGXj1Yo'
}

req = urllib.request.Request(url, headers=headers)
with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))

print(f"Total productos con inventario_b2c > 0: {len(data)}")

activos = [p for p in data if p.get('activo_b2c') is True]
print(f"Total con inventario_b2c > 0 Y activo_b2c == True: {len(activos)}")

print("\n--- Listado completo de productos activos con stock ---")
for idx, p in enumerate(activos, 1):
    ref = p.get('ref')
    stock = p.get('inventario_b2c')
    promo = p.get('promo_b2c') or 'NINGUNA'
    cat = p.get('categoria') or 'S/C'
    prod = p.get('producto')
    print(f"{idx:02d}. [{ref}] (Stock: {stock}) [Cat: {cat}] [Promo actual: {promo}] -> {prod}")
