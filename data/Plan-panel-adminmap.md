# Panel de Administración: Mapa de Zonas de Cobertura (Admin Map)

Este plan detalla la implementación de una interfaz administrativa interactiva ("Admin Map") que permitirá visualizar, filtrar y seleccionar barrios en el mapa. Utilizaremos la arquitectura del proyecto `mapa-catastral-aburra/`: un backend proxy con **FastAPI** que consulta los MapServers catastrales y los sirve como GeoJSON, y un frontend con **Leaflet** (usando OSM como mapa base) que renderiza y permite interactuar con los polígonos. Esto servirá para configurar zonas de "Domicilio Gratis" y segmentación de campañas Ads.

## 1. Arquitectura y Análisis de Datos
- **Arquitectura de Flujo:** 
  `Base Map (OSM / Leaflet) <---> FastAPI Proxy (/api/query) <---> MapServers Catastrales (portalidem.metropol.gov.co, etc.)`
- **Por qué el Proxy (FastAPI):**
  - **Evita CORS:** Resuelve las restricciones de origen al consultar MapServers catastrales directamente.
  - **Simplifica Paginación:** El backend se encarga de paginar usando `resultOffset`/`resultRecordCount` para sortear los límites de `maxRecordCount` del servidor catastral.
  - **Normalización GeoJSON:** Devuelve un GeoJSON unificado que Leaflet consume de forma nativa sin necesitar librerías complejas como Esri Leaflet.
- **Base de Datos (Supabase):** Se requiere crear una nueva tabla `petpro_zonas_cobertura` para persistir los barrios seleccionados.

### Sinergia de Datos: Supabase (`nomenclatura_igac`) vs MapServer
Para lograr que las promociones automáticas en el checkout funcionen, dividiremos las responsabilidades de los datos de la siguiente manera:

1. **Lo que ya tenemos en Supabase (`nomenclatura_igac`):** 
   - Tenemos una tabla extensa con puntos exactos, validaciones de direcciones de texto ("Calle 10", etc.) y la correspondencia alfanumérica de a qué **Municipio** y **Barrio** pertenece cada dirección.
   - **Uso:** El frontend de la tienda lo utiliza como diccionario para el autocompletado y para validar la dirección final del cliente.
2. **Lo que extraemos del MapServer (Polígonos de Barrios):**
   - Supabase no tiene la "geometría" (el área o perímetro) visual de un barrio, solo su nombre.
   - **Uso:** El proxy `/api/barrios` descarga el **GeoJSON de los polígonos** de cada barrio para dibujarlos en el Admin Map. Esto permite que el administrador vea el mapa real de la ciudad y dé clics fáciles e intuitivos en las áreas de cobertura sin tener que tipear nombres a ciegas.
3. **El Punto de Encuentro (Match):**
   - El administrador hace clic en el polígono del barrio en el mapa (ej. "El Poblado"). El sistema guarda esa relación exacta en la nueva tabla `petpro_zonas_cobertura`.
   - Cuando un cliente va a comprar, su dirección se autocompleta con los datos locales de `nomenclatura_igac` (que le asigna el barrio "El Poblado"). 
   - El checkout cruza silenciosamente ese nombre de barrio contra `petpro_zonas_cobertura` y, ¡listo!, le activa el Domicilio Gratis **sin necesidad de procesar geometrías espaciales pesadas en la base de datos de la tienda**, manteniendo la compra ultra-rápida.
4. **¿Por qué cargar Predios/Placas desde MapServer a demanda?**
   - En el Admin Map, cargar las placas directamente del MapServer como capa de contexto permite al administrador acercarse al máximo nivel de zoom y verificar visualmente los límites exactos de un barrio (ej. "hasta qué acera o conjunto llega el barrio X") para estar completamente seguro antes de activar el Domicilio Gratis.


## 2. Cambios Propuestos en Base de Datos

### [NEW] Tabla `petpro_zonas_cobertura`
Se creará un script SQL para desplegar esta tabla en Supabase:
- `id`: UUID (Primary Key)
- `municipio`: TEXT (Ej. 'medellin')
- `barrio`: TEXT (Nombre oficial del barrio según MapServer)
- `estrato`: INTEGER (Opcional, si el MapServer o el proxy provee el dato)
- `tipo_promocion`: TEXT (Ej: 'DOMICILIO_GRATIS', 'ADS_SECTOR')
- `activa`: BOOLEAN (default: true)
- `created_at`: TIMESTAMP

Se agregarán **Políticas RLS** a esta tabla:
- **Admin:** Lectura y Escritura total (requiere auth validada).
- **Público (anon):** Solo Lectura (SELECT) para que el checkout pueda verificar de forma instantánea si el barrio del cliente califica para domicilio gratis.

## 3. Estructura del Módulo (`mapa-catastral-aburra/`)

```
mapa-catastral-aburra/
├── backend/
│   ├── main.py                 # FastAPI (CORS configurado para * o dominio de la tienda)
│   ├── mapserver_client.py     # Lógica robusta de /query paginado + conversión GeoPandas
│   ├── layers_config.py        # URLs y mapeos de campos (name_field) por municipio
│   └── requirements.txt        # fastapi, uvicorn, geopandas, requests, pandas, shapely
└── frontend/
    ├── index.html              # UI de administración (Mapa Leaflet + Sidebar de filtros)
    ├── css/styles.css          # Estilización del panel administrativo y sidebar
    └── js/app.js               # Lógica del mapa (Consumo de la API FastAPI y guardado en Supabase)
```

## 4. Cambios Propuestos en el Frontend (Admin Map)

### [NEW] `frontend/index.html`
- **Autenticación (Logueado):** Integra validación de sesión con Supabase Auth. Si no hay sesión activa, redirige a `login.html`.
- **Librerías a Utilizar:** 
  - `Leaflet` (Motor del mapa base).
- **Layout y Controles:**
  - Panel lateral (Sidebar):
    - **Filtros:** Selector de Municipio y selector de Estrato.
    - **Cargador de Capas:** Checkbox para activar visualización de "Predios" o "Nomenclatura" (placas) bajo demanda.
    - **Zonas Seleccionadas:** Listado dinámico de barrios elegidos con clic en el mapa.
    - **Botón de Guardar:** Envía los barrios seleccionados a la base de datos de Supabase.
  - **Mapa Central:** Inicializa Leaflet con capa base de OpenStreetMap.

### [NEW] `frontend/js/app.js`
- **Consumo del Proxy Backend:**
  - Al cambiar de municipio, consulta `GET http://localhost:8000/api/barrios/{municipio}` y dibuja los polígonos GeoJSON en Leaflet.
  - Al hacer clic en un polígono (barrio), se resalta visualmente (estilo Leaflet) y se agrega al array de selección.
  - Si la visualización de "predios/nomenclatura" está activa, detecta el evento `moveend` del mapa y si el zoom es `≥ 15`, hace un fetch de predios usando la caja delimitadora (`bbox = xmin,ymin,xmax,ymax` del mapa actual): `GET http://localhost:8000/api/predios/{municipio}?bbox=...`.
- **Guardar Zonas en Supabase:**
  - Utiliza el cliente JS de Supabase para realizar un `UPSERT` masivo de los barrios seleccionados a la tabla `petpro_zonas_cobertura` con el tipo de promoción asignado.

### [MODIFY] `js/checkout.js` / `js/cart.js` (En la tienda principal)
- **Integración "Domicilio Gratis":**
  - Al completar la validación de dirección (que recupera `municipio` y `barrio`), realiza una consulta rápida a `petpro_zonas_cobertura` donde `municipio = {municipio}` y `barrio = {barrio}` y `tipo_promocion = 'DOMICILIO_GRATIS'`.
  - Si se encuentra un registro activo, el costo de envío en el total del carrito se actualiza automáticamente a `$0 COP`.

## Open Questions

> [!IMPORTANT]
> - ¿Actualmente tienes configurada la autenticación en Supabase (`login.html`) o deseas que construyamos una pantalla de login básica conectada a `supabase.auth`?
> - ¿Qué otros tipos de promociones o segmentaciones aparte de "Domicilio Gratis" y "ADS" te gustaría agregar en un futuro? (Para dejar la tabla escalable).

## Enlaces MapServer

| Municipio / ámbito       | URL MapServer Completa                                                                                                          | Layers disponibles (ID / nombre)                                                                                                                                                                | Información en cada layer                                                                                                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Medellín                 | [Base_Catastral](https://www.medellin.gov.co/servidormapas/rest/services/ServiciosCatastro/Base_Catastral/MapServer)            | 2 Manzana Catastral; 3 Lotes; 6 Nomenclatura Vial; 7 Línea Nomenclatura Vial; 8 Nomenclatura Domiciliaria                                                                                       | Manzana: polígonos de manzana. Lotes: terreno mínimo (clave CBML). Nomenclatura Vial: identificación de vías. Línea Nomenclatura Vial: ejes viales. Nomenclatura Domiciliaria: puntos de placa/dirección. |
| Medellín                 | [ConsultaOperadorCatastral](https://www.medellin.gov.co/servidormapas/rest/services/ServiciosCatastro/ConsultaOperadorCatastral/MapServer) | 0 Toponimia; 1 NomenclaturaDomiciliaria; 2 Nomenclatura Vial; 3 Límite Barrio/Vereda; 4 Comuna; 5 Manzana; 6 Línea Cota Lote; 7 Lote; 8 Lote Detalle; 9 IEP; 10–13 Construcción / UConstruccion | Base operativa completa: placas domiciliarias, vías, barrios/veredas, comunas, manzanas, lotes (CBML), construcciones y áreas. Ideal para cruce alfanumérico + geometría. |
| Medellín                 | [VA_ConsultaOperadorCatastral_geo](https://www.medellin.gov.co/servidormapas/rest/services/ServiciosCatastro/VA_ConsultaOperadorCatastral_geo/MapServer) | Group Base Catastral Medellín (0) con sublayers: Toponimia, Nomenclatura Vial, Nomenclatura Domiciliaria, Límite Barrio/Vereda, Comuna, Manzana, Lote, Construcción, etc.                       | Misma lógica catastral agrupada; Nomenclatura Domiciliaria como punto (Display Field CBML); Lote como polígono unible por CBML. |
| Medellín                 | [HistoricoCatastral](https://www.medellin.gov.co/servidormapas/rest/services/ServiciosCatastro/HistoricoCatastral/MapServer)    | Group por año (ej. 2024 ID 157): NomenclaturaDomiciliaria_2024, NomenclaturaVial_2024, Manzana_2024, Lote_2024, Construccion_2024, LimiteBarrioVereda_2024, zge_2024                            | Cortes históricos anuales de nomenclatura, manzana, lote y construcción. |
| Envigado                 | [Envigado_Catastro](https://portalidem.metropol.gov.co/server/rest/services/Envigado_Catastro/MapServer)                        | 1 Veredas; 2 Barrios; 3 Manzanas; 4 Construcciones Urbanas; 5 Construcciones Rurales; 6 Predios Urbanos; 7 Predios Rurales (patrón AMVA)                                                        | Barrios: nombre/código de barrio. Manzanas: manzanas catastrales. Predios Urbanos/Rurales: polígonos prediales con atributos catastrales. Construcciones: edificaciones urbanas/rurales. |
| Envigado                 | [POT_Envigado](https://portalidem.metropol.gov.co/server/rest/services/POT_Envigado/MapServer)                                  | 0 Clasificación del Suelo; 1–2 Equipamientos; 3–4 Planes Parciales; 5–6 Riesgos; 7 Suelo de Protección; 8–9 Tratamientos; 10–11 Uso del Suelo Rural/Urbano                                      | POT (ordenamiento), no nomenclatura domiciliaria; útil para uso de suelo y tratamientos. |
| Envigado                 | [ENVIGADO_Uso_y_Valores_Suelo](https://portalidem.metropol.gov.co/server/rest/services/ENVIGADO_Uso_y_Valores_Suelo/MapServer)  | Capas de uso y valores del suelo (listado en directorio AMVA)                                                                                                                                   | Valores/usos del suelo; no es nomenclatura. |
| Sabaneta                 | [Sabaneta_Catastro](https://portalidem.metropol.gov.co/server/rest/services/Sabaneta_Catastro/MapServer)                        | Group Sabaneta Catastro (0) → Veredas, Barrios, Manzanas, Construcciones Urbanas, Construcciones Rurales, Predios Urbanos, Predios Rurales                                                      | Misma estructura AMVA: barrios, manzanas, predios y construcciones para reconstruir dirección/nomenclatura vía atributos de predio. |
| Sabaneta                 | [POT_Sabaneta](https://portalidem.metropol.gov.co/server/rest/services/POT_Sabaneta/MapServer)                                  | Capas POT (clasificación/uso/tratamientos; listado en directorio)                                                                                                                               | Ordenamiento territorial; no nomenclatura domiciliaria. |
| Sabaneta                 | [SABANETA_Uso_y_Valores_Suelo](https://portalidem.metropol.gov.co/server/rest/services/SABANETA_Uso_y_Valores_Suelo/MapServer)  | Uso y valores del suelo                                                                                                                                                                         | Valores/usos; no nomenclatura. |
| Itagüí                   | [VC_Catastro_2024](https://arcgis.itagui.gov.co/arcgis/rest/services/Catastro/VC_Catastro_2024/MapServer)                       | 0 Predio a predio; 1 Manzana; 3 Predios rurales; 5 Construcción urbana; 7 Barrios (+ Predios urbanos en el servicio)                                                                            | Predio a predio: puntos con local_id, cedula_catastral, municipio. Manzana: código de manzana. Predios urbanos/rurales: polígonos prediales. Barrios: nom_barrio. Construcción urbana: edificaciones. |
| Itagüí                   | [Catastro_2022](https://arcgis.itagui.gov.co/arcgis/rest/services/Catastro/Catastro_2022/MapServer)                             | 0 Predio a predio; 5 Predios rurales; 6 Predios urbanos; 7 Barrios; 8 Manzana                                                                                                                   | Corte 2022: predios, barrios y manzanas; base para dirección/códigos prediales. |
| Itagüí                   | [POT_Itagui](https://arcgis.itagui.gov.co/arcgis/rest/services/ItaguiCatastro/POT_Itagui/MapServer)                              | Catastro AMVA + capas POT                                                                                                                                                                       | Catastro metropolitano y POT; revisar capas en el directorio REST. |
| La Estrella              | [La_Estrella_Catastro](https://portalidem.metropol.gov.co/server/rest/services/La_Estrella_Catastro/MapServer)                  | 1 Veredas; 2 Barrios; 3 Manzanas; 4 Sector; 5 Corregimiento; 6 Construcciones Urbanas; 7 Construcciones Rurales (+ Predios según servicio)                                                      | Barrios, manzanas, sectores, veredas/corregimientos y construcciones; base local para nomenclatura vía predios/barrios. |
| La Estrella              | [POT_La_Estrella](https://portalidem.metropol.gov.co/server/rest/services/POT_La_Estrella/MapServer)                            | 0 Clasificación del Suelo; 1 Uso del Suelo; 2 Tratamientos Urbanos; 3 Tratamientos Rurales; 4+ Suelo de Protección, etc.                                                                        | Solo POT; no nomenclatura domiciliaria. |
| Caldas                   | [Caldas_Catastro](https://portalidem.metropol.gov.co/server/rest/services/Caldas_Catastro/MapServer)                            | Group Caldas Catastro (0) → Veredas, Barrios, Manzanas, Corregimiento, Construcciones Urbanas/Rurales, Predios Urbanos (+ Predios Rurales)                                                      | Predios urbanos/rurales, barrios y manzanas; vía principal local para atributos de dirección/nomenclatura. |
| Caldas                   | [POT_Caldas](https://portalidem.metropol.gov.co/server/rest/services/POT_Caldas/MapServer)                                      | Clasificación, Equipamientos, Riesgos, Suelo de Protección, Tratamientos, Uso del Suelo                                                                                                         | Solo ordenamiento; no nomenclatura. |
| Bello                    | [POT_Bello](https://portalidem.metropol.gov.co/server/rest/services/POT_Bello/MapServer)                                        | 2 Nomenclatura_Urbana; 9 Barrios; 14 Construcciones; 15 Manzanas (+ otras capas POT)                                                                                                            | Nomenclatura_Urbana: capa explícita de nomenclatura. Barrios / Manzanas / Construcciones: contexto espacial y nombres. |
| Antioquia (departamento) | [Visor_Geo](https://geodatos.antioquia.gov.co/arcgis/rest/services/Catastro/Visor_Geo/MapServer)                                | 0 Límite Municipal; 1 Veredas; 2 Corregimiento; 3 Predios Rurales; 4 Construcciones Rurales; 5 Barrios; 6 Predios Urbanos; 7 Construcciones Urbanas                                             | Cobertura departamental: predios y barrios para filtrar por municipio. |
| Antioquia (departamento) | [Base_Catastral_Priorizada](https://geodatos.antioquia.gov.co/arcgis/rest/services/Base_Catastral_Priorizada/MapServer)          | 0 _base_catastral_ant_consolidada (Display Field: COD_MUNICIPIO)                                                                                                                                | Base catastral consolidada por municipio (código DANE); útil para filtrar a nivel departamental. |
| Antioquia (departamento) | [Capas_Catastro](https://geodatos.antioquia.gov.co/arcgis/rest/services/Catastro/Capas_Catastro/MapServer)                      | 0 Cerca; 1 Vía; 2 Drenaje; 3 Curva de nivel; otras cartográficas                                                                                                                                | Cartografía base (vías, drenaje, curvas); no es nomenclatura domiciliaria predial. |
| AMVA (directorio)        | [portalidem REST root](https://portalidem.metropol.gov.co/server/rest/services/)                                                | Catálogos: Envigado_Catastro, Sabaneta_Catastro, Caldas_Catastro, La_Estrella_Catastro, Itagüí_Catastro, DISTRITO_MEDELLIN_CATASTRO, POT_* y Uso_y_Valores_Suelo_*                              | Índice de todos los MapServer metropolitanos; punto de partida para descubrir capas nuevas. |

## 5. Escalabilidad de la Tabla `petpro_zonas_cobertura`

Al tener estructurada la tabla con `tipo_promocion`, el sistema queda altamente escalable. Aquí tienes algunas sugerencias de segmentaciones o reglas de negocio que se podrían agregar en el futuro sin modificar la estructura de la base de datos:

- **Zonas de Recargo / Restricción Logística:**
  - `RECARGO_EXTENDIDO`: Barrios muy lejanos donde el envío tiene un costo adicional.
  - `NO_COBERTURA`: Zonas rojas o rurales de difícil acceso donde temporalmente no se despacha.
- **Enrutamiento y Logística:**
  - `RUTA_LUNES_JUEVES` / `RUTA_MARTES_VIERNES`: Asignar días específicos de entrega según la zona para optimizar los viajes del repartidor.
- **Estrategias de Marketing (Ads):**
  - `ADS_PREMIUM_BRANDS`: Barrios de estratos 5 y 6 donde las campañas de Meta/Google Ads se enfoquen en marcas de alimentos super premium (Taste of the Wild, Acana, etc.).
  - `PROMO_KITS_INICIO`: Zonas de nuevos desarrollos urbanísticos (muchos cachorros nuevos) para impulsar kits de bienvenida.

## 6. Referencia de Implementación Backend (`mapserver_client.py`)

Dado que el nuevo enfoque utiliza un proxy FastAPI para evitar problemas de CORS y mejorar el rendimiento, el siguiente código en Python + GeoPandas es la **base funcional exacta** que irá dentro del archivo `backend/mapserver_client.py`. Este código maneja la paginación obligatoria (`resultOffset`) de los MapServers y convierte todo a un estándar GeoJSON que el frontend (Leaflet) consumirá sin esfuerzo.

1. Dependencias del Backend

```bash
pip install geopandas requests pandas shapely pyproj
```

2. Método robusto (paginación + GeoPandas)
Los MapServer limitan cuántos features devuelven por request. Hay que paginar con resultOffset / resultRecordCount

```python
import requests
import geopandas as gpd
import pandas as pd
from urllib.parse import urlencode


def query_mapserver_to_gdf(
    layer_url: str,
    where: str = "1=1",
    out_fields: str = "*",
    out_sr: int = 4326,
    return_geometry: bool = True,
    max_workers_note: str = "",  # solo informativo
) -> gpd.GeoDataFrame:
    """
    Descarga una capa de ArcGIS MapServer/FeatureServer a GeoDataFrame,
    paginando según maxRecordCount del servicio.
    """
    query_url = f"{layer_url.rstrip('/')}/query"

    # 1) Metadatos: límite de registros por página
    meta = requests.get(layer_url, params={"f": "json"}, timeout=60).json()
    if "error" in meta:
        raise RuntimeError(meta["error"])
    page_size = int(meta.get("maxRecordCount", 1000))

    # 2) Conteo total
    count_resp = requests.get(
        query_url,
        params={"where": where, "returnCountOnly": "true", "f": "json"},
        timeout=60,
    ).json()
    total = int(count_resp.get("count", 0))
    print(f"Total features: {total} | page_size: {page_size}")

    if total == 0:
        return gpd.GeoDataFrame(geometry=[], crs=f"EPSG:{out_sr}")

    # 3) Paginación
    frames = []
    for offset in range(0, total, page_size):
        params = {
            "where": where,
            "outFields": out_fields,
            "returnGeometry": "true" if return_geometry else "false",
            "outSR": out_sr,
            "resultOffset": offset,
            "resultRecordCount": page_size,
            "orderByFields": "OBJECTID",  # estable para paginar
            "f": "geojson" if return_geometry else "json",
        }
        print(f"  offset={offset} ...")

        if return_geometry:
            # GeoPandas lee la URL GeoJSON directamente
            page_url = f"{query_url}?{urlencode(params)}"
            gdf_page = gpd.read_file(page_url)
            frames.append(gdf_page)
        else:
            # Solo atributos → DataFrame, luego GeoDataFrame vacío de geom
            data = requests.get(query_url, params=params, timeout=120).json()
            if "error" in data:
                raise RuntimeError(data["error"])
            rows = [f.get("attributes", {}) for f in data.get("features", [])]
            frames.append(gpd.GeoDataFrame(rows))

    gdf = pd.concat(frames, ignore_index=True)
    if not isinstance(gdf, gpd.GeoDataFrame):
        gdf = gpd.GeoDataFrame(gdf)

    # CRS
    if return_geometry and gdf.crs is None:
        gdf = gdf.set_crs(epsg=out_sr)

    # Quitar duplicados por OBJECTID si el servicio los repite en bordes de página
    if "OBJECTID" in gdf.columns:
        gdf = gdf.drop_duplicates(subset=["OBJECTID"]).reset_index(drop=True)

    print(f"Descargados: {len(gdf)}")
    return gdf


# --- Ejemplo: Nomenclatura Domiciliaria Medellín (layer 8) ---
LAYER = (
    "https://www.medellin.gov.co/servidormapas/rest/services/"
    "ServiciosCatastro/Base_Catastral/MapServer/8"
)

gdf = query_mapserver_to_gdf(
    layer_url=LAYER,
    where="1=1",
    out_fields="*",          # o "OBJECTID,CBML,..."
    out_sr=4326,
    return_geometry=True,
)

print(gdf.head())
print(gdf.crs)

# Exportar
gdf.drop(columns="geometry", errors="ignore").to_csv(
    "nomenclatura_medellin.csv", index=False, encoding="utf-8-sig"
)
gdf.to_file("nomenclatura_medellin.gpkg", layer="nomenclatura")
```

3. Filtros útiles

```python
# Por texto / barrio (ajusta el nombre del campo real)
gdf = query_mapserver_to_gdf(
    LAYER,
    where="BARRIO LIKE '%POBLADO%'",  # ejemplo
)

# Por OBJECTID range (útil si orderByFields falla)
gdf = query_mapserver_to_gdf(
    LAYER,
    where="OBJECTID >= 1 AND OBJECTID <= 5000",
)

# Solo atributos (más liviano, sin geometría)
gdf_attr = query_mapserver_to_gdf(
    LAYER,
    return_geometry=False,
    out_fields="OBJECTID,CBML",  # pon los campos reales del layer
)
gdf_attr.to_csv("solo_atributos.csv", index=False, encoding="utf-8-sig")
```

4. Ver campos del layer antes de consultar

```python
import requests

layer_url = (
    "https://www.medellin.gov.co/servidormapas/rest/services/"
    "ServiciosCatastro/Base_Catastral/MapServer/8"
)
meta = requests.get(layer_url, params={"f": "json"}, timeout=60).json()

print("Nombre:", meta.get("name"))
print("Geometría:", meta.get("geometryType"))
print("maxRecordCount:", meta.get("maxRecordCount"))
print("Campos:")
for f in meta.get("fields", []):
    print(f"  - {f['name']} ({f['type']})")
```
