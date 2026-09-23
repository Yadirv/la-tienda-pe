import os

with open('data/nomenclatura_amv.tsv', 'r', encoding='utf-8') as f:
    lines = f.readlines()

with open('data/nomenclatura_amv_fixed.tsv', 'w', encoding='utf-8') as fw:
    fw.write('codigo_igac\tdepartamento\tmunicipio\tbarrio\ttipo_via\tnombre_via\tnumero_ini\tnumero_fin\tobservaciones\tlatitud\tlongitud\n')
    fw.writelines(lines[25:])

os.replace('data/nomenclatura_amv_fixed.tsv', 'data/nomenclatura_amv.tsv')
print("Lines deleted successfully.")
