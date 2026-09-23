/**
 * address-validator.js
 * =====================================================================
 * Modulo de validacion de direcciones IGAC para el checkout de VitalPets.
 *
 * Responsabilidades:
 *  1. Poblar el <select id="select-municipio"> desde Supabase v_municipios.
 *  2. Escuchar el input de direccion y llamar (con debounce) a la
 *     API REST de Supabase directamente (nomenclatura_igac).
 *  3. Renderizar sugerencias fuzzy en el panel #address-suggestions.
 *  4. Al seleccionar una sugerencia, marcar la direccion como validada
 *     y mostrar el mini-mapa Leaflet con el punto.
 *  5. Comportamiento suave: no se bloquea el formulario si la direccion
 *     no aparece en catastro.
 * =====================================================================
 */

(function () {
  'use strict';

  // ------------------------------------------------------------------
  // Configuracion
  // ------------------------------------------------------------------
  const IGAC_VALIDATION_ENABLED = true;

  // URL de la API REST de Supabase para la tabla
  const VALIDATE_REST_URL = 'https://qkzhopjfrlyvqfievcfi.supabase.co/rest/v1/nomenclatura_igac';
  const getAnonKey = () => typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : '';

  const DEBOUNCE_MS   = 2000;  // 2 segundos de pausa antes de geocodificar en silencio
  const MIN_CHARS     = 6;      // Minimo de caracteres para buscar

  // Mapeo de abreviaturas a sus formas normalizadas en BD (CR, CL, etc.)
  const VIA_MAP = {
    "cll": "cl",
    "cl": "cl",
    "calle": "cl",
    "cra": "cr",
    "cr": "cr",
    "kra": "cr",
    "carrera": "cr",
    "tv": "tv",
    "transv": "tv",
    "trans": "tv",
    "transversal": "tv",
    "dg": "dg",
    "diag": "dg",
    "diagonal": "dg",
    "av": "av",
    "avd": "av",
    "avda": "av",
    "avenida": "av"
  };

  function getTokensForSearch(raw) {
    let s = (raw || '').trim().toLowerCase();
    const parts = s.split(/\s+/);
    if (parts.length > 0 && VIA_MAP[parts[0]]) {
      parts[0] = VIA_MAP[parts[0]];
    }
    s = parts.join(' ');
    // Limpiar caracteres especiales de las nomenclaturas
    s = s.replace(/[#\-.,]/g, ' ');
    // Retornar array de palabras (ignorando espacios extra y palabras muy cortas, a menos que sean numeros)
    return s.split(/\s+/).filter(t => t.length > 1 || !isNaN(t)).map(t => t.toUpperCase());
  }

  // Coordenadas por defecto para el mapa (centro de Medellin)
  const DEFAULT_CENTER = [6.2442, -75.5812];
  const DEFAULT_ZOOM   = 14;

  // Municipios del AMV con coordenadas (clave en MAYUSCULAS SIN TILDES)
  const MUNICIPIO_COORDS = {
    'MEDELLIN':    [6.2442, -75.5812],
    'BELLO':       [6.3333, -75.5580],
    'ITAGUI':      [6.1849, -75.5991],
    'ENVIGADO':    [6.1752, -75.5941],
    'SABANETA':    [6.1516, -75.6155],
    'LA ESTRELLA': [6.1570, -75.6443],
    'CALDAS':      [6.0939, -75.6356],
  };

  // Normaliza un nombre de municipio a MAYUSCULAS sin tildes para comparar
  function normalizeMun(mun) {
    if (!mun) return '';
    return mun
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')  // quita tildes
      .replace(/-/g, ' ');              // cambia guion por espacio (la-estrella -> LA ESTRELLA)
  }

  // ------------------------------------------------------------------
  // Estado interno
  // ------------------------------------------------------------------
  let leafletMap = null;
  let leafletMarker = null;
  let geoJsonLayer = null;
  let barrioLayersMap = new Map();
  let selectedPolygonLayer = null;
  const cachedGeoJson = new Map();
  let debounceTimer = null;
  let isValidated = false;
  let validatedData = null;

  // ------------------------------------------------------------------
  // Referencias DOM
  // ------------------------------------------------------------------
  const getEl = (id) => document.getElementById(id);

  // ------------------------------------------------------------------
  // Poblar select de municipios desde Supabase
  // ------------------------------------------------------------------
  async function loadMunicipios() {
    const sel = getEl('select-municipio');
    if (!sel) return;

    // Nombres para mostrar al usuario (con tilde/acento correcto)
    const DISPLAY_NAMES = {
      'MEDELLIN':    'Medellín',
      'BELLO':       'Bello',
      'ITAGUI':      'Itagüi',
      'ENVIGADO':    'Envigado',
      'SABANETA':    'Sabaneta',
      'LA ESTRELLA': 'La Estrella',
      'CALDAS':      'Caldas',
    };

    try {
      if (!window.supabase || typeof SUPABASE_URL === 'undefined') throw new Error('No Supabase');
      const client = window.supabase.createClient(SUPABASE_URL, getAnonKey());
      
      // Leer municipios distintos de petpro_barrios (nuestra fuente de verdad estandarizada)
      const { data, error } = await client
        .from('petpro_barrios')
        .select('municipio')
        .order('municipio', { ascending: true });

      if (error) throw error;

      // Obtener lista unica de municipios
      const uniqueMuns = [...new Set((data || []).map(r => r.municipio.trim().toUpperCase()))];

      sel.innerHTML = '<option value="">Selecciona tu municipio…</option>';
      uniqueMuns.forEach(mun => {
        const opt = document.createElement('option');
        opt.value = mun;  // valor interno = MAYUSCULAS normalizado
        opt.textContent = DISPLAY_NAMES[mun] || mun;  // texto visible = con tilde
        sel.appendChild(opt);
      });

    } catch (e) {
      console.warn('No se pudo cargar municipios desde petpro_barrios, usando lista estatica.', e);
      const fallback = [
        { v: 'MEDELLIN',    t: 'Medellín'   },
        { v: 'BELLO',       t: 'Bello'       },
        { v: 'ITAGUI',      t: 'Itagüi'      },
        { v: 'ENVIGADO',    t: 'Envigado'    },
        { v: 'SABANETA',    t: 'Sabaneta'    },
        { v: 'LA ESTRELLA', t: 'La Estrella' },
        { v: 'CALDAS',      t: 'Caldas'      },
      ];
      sel.innerHTML = '<option value="">Selecciona tu municipio…</option>';
      fallback.forEach(({ v, t }) => {
        const opt = document.createElement('option');
        opt.value = v; opt.textContent = t;
        sel.appendChild(opt);
      });
    }

    sel.addEventListener('change', () => {
      resetValidation();
      const munSelected = sel.value;
      if (munSelected) {
        centerMapOnMunicipio(munSelected);
        // Pre-cargar GeoJSON en memoria silenciosamente
        const munKey = normalizeMun(munSelected).toLowerCase().replace(/\s+/g, '-');
        if (!cachedGeoJson.has(munKey)) {
          fetch(`/data/geojson/${munKey}.geojson`)
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) cachedGeoJson.set(munKey, data); })
            .catch(() => {});
        }
      }
    });
  }

  // ------------------------------------------------------------------
  // Centrar mapa en el municipio seleccionado
  // ------------------------------------------------------------------
  function centerMapOnMunicipio(mun) {
    const key = normalizeMun(mun);
    const coords = MUNICIPIO_COORDS[key] || DEFAULT_CENTER;
    if (leafletMap) {
      leafletMap.setView(coords, DEFAULT_ZOOM);
    }
  }

  // ------------------------------------------------------------------
  // Inicializar mini-mapa Leaflet
  // ------------------------------------------------------------------
  function initMap(lat, lon) {
    const mapWrap = getEl('checkout-map-wrap');
    if (!mapWrap) return;
    mapWrap.classList.remove('hidden');

    if (!leafletMap && window.L) {
      leafletMap = L.map('checkout-map', { zoomControl: true }).setView([lat, lon], 19);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(leafletMap);
    } else if (leafletMap) {
      leafletMap.setView([lat, lon], 19);
    }

    if (leafletMarker) {
      leafletMarker.setLatLng([lat, lon]);
    } else if (window.L) {
      leafletMarker = L.marker([lat, lon], { draggable: true })
        .addTo(leafletMap)
        .bindPopup('📍 Tu dirección de entrega')
        .openPopup();

      leafletMarker.on('dragend', function (e) {
        const pos = e.target.getLatLng();
        if (validatedData) {
          validatedData.user_lat = pos.lat;
          validatedData.user_lon = pos.lng;
          const hiddenField = getEl('validated-address-json');
          if (hiddenField) hiddenField.value = JSON.stringify(validatedData);
        }
      });
    }

    setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 200);
  }

  // ------------------------------------------------------------------
  // Mostrar mapa al seleccionar municipio y detectar barrio por pin
  // ------------------------------------------------------------------
  async function detectBarrioFromCoords(lat, lon, municipio) {
    let officialBarrio = '';
    try {
      if (window.turf && !isNaN(lat) && !isNaN(lon)) {
        const pt = turf.point([lon, lat]);
        let munKey = municipio.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (munKey === 'la estrella') munKey = 'la-estrella';
        const res = await fetch(`/data/geojson/${munKey}.geojson`);
        if (res.ok) {
          const geojson = await res.json();
          for (let feature of geojson.features) {
            let bName = feature.properties.nombre_barrio_estandarizado || feature.properties.NOMBRE || feature.properties.BARRIO || feature.properties.NOM_BARRIO || feature.properties.nombre || feature.properties.barrio;
            if (feature.geometry && turf.booleanPointInPolygon(pt, feature)) {
              officialBarrio = bName;
              break;
            }
          }
        }
      }
    } catch (e) {
      console.error('Error en Point in Polygon:', e);
    }
    return officialBarrio;
  }

  async function onPinMoved(lat, lon) {
    const municipio = getEl('select-municipio')?.value || '';
    const hint = getEl('address-hint');
    if (hint) {
      hint.textContent = '📍 Cruzando coordenadas con mapa catastral...';
      hint.className = 'text-[10px] text-amber-500 mt-1 ml-1';
    }
    const officialBarrio = await detectBarrioFromCoords(lat, lon, municipio);
    
    if (validatedData) {
      validatedData.user_lat = lat;
      validatedData.user_lon = lon;
      validatedData.barrio_oficial = officialBarrio;
      const hiddenField = getEl('validated-address-json');
      if (hiddenField) hiddenField.value = JSON.stringify(validatedData);
    } else {
      validatedData = {
        municipio_seleccionado: municipio,
        barrio_oficial: officialBarrio,
        user_lat: lat,
        user_lon: lon,
        validated_at: new Date().toISOString(),
        method: 'pin_turf',
      };
      const hiddenField = getEl('validated-address-json');
      if (hiddenField) hiddenField.value = JSON.stringify(validatedData);
    }

    isValidated = true;
    const btnSubmit = getEl('btn-submit-checkout');
    if (btnSubmit) btnSubmit.disabled = false;

    if (window.CartManager && typeof window.CartManager.checkFreeShipping === 'function') {
      window.CartManager.checkFreeShipping(municipio, officialBarrio);
    }

    if (hint) {
      if (officialBarrio && officialBarrio !== 'Desconocido') {
        hint.textContent = `✅ Barrio detectado: ${officialBarrio}. Ajusta el pin si es necesario.`;
        hint.className = 'text-[10px] text-emerald-600 mt-1 ml-1';
      } else {
        hint.textContent = '⚠️ Barrio no detectado en el mapa catastral. Arrastra el pin con más precisión.';
        hint.className = 'text-[10px] text-amber-500 mt-1 ml-1';
      }
    }
  }

  function showMapForMunicipio(municipio) {
    const coords = MUNICIPIO_COORDS[municipio.toLowerCase()] || DEFAULT_CENTER;
    const mapWrap = getEl('checkout-map-wrap');
    const hint = getEl('address-hint');
    if (!mapWrap) return;
    mapWrap.style.display = '';
    mapWrap.classList.remove('hidden');

    if (!leafletMap && window.L) {
      leafletMap = L.map('checkout-map', { zoomControl: true }).setView(coords, 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(leafletMap);
    } else if (leafletMap) {
      leafletMap.setView(coords, 15);
    }

    if (!leafletMarker && window.L) {
      leafletMarker = L.marker(coords, { draggable: true })
        .addTo(leafletMap)
        .bindPopup('📍 Arrastra este pin a tu dirección exacta')
        .openPopup();

      leafletMarker.on('dragend', async function (e) {
        const pos = e.target.getLatLng();
        await onPinMoved(pos.lat, pos.lng);
      });
      
      // También detectar en la posición inicial al abrir el mapa
      leafletMarker.on('click', async function (e) {
        const pos = e.target.getLatLng();
        await onPinMoved(pos.lat, pos.lng);
      });
    } else if (leafletMarker) {
      leafletMarker.setLatLng(coords);
    }

    setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 200);
    
    if (hint) {
      hint.textContent = '📍 Arrastra el pin rojo hasta tu dirección exacta para detectar el barrio y verificar el envío gratis.';
      hint.className = 'text-[10px] text-slate-500 mt-1 ml-1';
    }
  }

  async function validateAddress(municipio, rawAddress) {
    try {
      if (!rawAddress || rawAddress.length < MIN_CHARS) return { status: 'out_of_zone', message: '' };

      const query = `${rawAddress}, ${municipio}, Antioquia, Colombia`;
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`;

      const res = await fetch(url, {
        headers: { 'Accept-Language': 'es' }
      });
      
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      let matches = await res.json();
      
      // Filtrar resultados demasiado genéricos (municipios enteros en lugar de direcciones)
      const genericTypes = ['town', 'city', 'county', 'state', 'country', 'municipality', 'village', 'state_district', 'region', 'city_district'];
      matches = matches.filter(m => !genericTypes.includes(m.addresstype));
      
      if (!matches || matches.length === 0) {
        return { status: 'out_of_zone', message: 'No se encontró una dirección específica en Nominatim/OSM.' };
      }
      return { status: 'ok', matches: matches };
    } catch (e) {
      console.error('validate-address error:', e);
      return { status: 'error', message: e.message };
    }
  }

  // ------------------------------------------------------------------
  // Renderizar sugerencias en el panel
  // ------------------------------------------------------------------
  function renderSuggestions(matches) {
    const panel = getEl('address-suggestions');
    if (!panel) return;

    if (!matches || matches.length === 0) {
      panel.innerHTML = '<li class="px-4 py-2 text-slate-400 text-xs">Sin coincidencias exactas. Revisa la dirección.</li>';
      panel.classList.remove('hidden');
      return;
    }

    panel.innerHTML = '';
    matches.forEach((m) => {
      const li = document.createElement('li');
      li.className = 'px-4 py-2 hover:bg-slate-50 cursor-pointer flex flex-col gap-0.5 border-b last:border-0';
      const displayName = m.display_name.split(',').slice(0, 3).join(', ');
      li.innerHTML = `
        <span class="font-semibold text-[#004E4A]">${displayName}</span>
        <span class="text-[10px] text-emerald-500">Dirección verificada (OSM)</span>
      `;
      li.addEventListener('click', () => onSuggestionSelected(m));
      panel.appendChild(li);
    });
    panel.classList.remove('hidden');
  }

  // ------------------------------------------------------------------
  // Al seleccionar una sugerencia
  // ------------------------------------------------------------------
  async function onSuggestionSelected(match) {
    const dirInput  = getEl('input-direccion');
    const hiddenFld = getEl('validated-address-json');
    const badge     = getEl('address-status-badge');
    const hint      = getEl('address-hint');
    const panel     = getEl('address-suggestions');
    let municipio = getEl('select-municipio')?.value || '';

    // munKey para el archivo GeoJSON: minusculas con guion (la-estrella, itagui, etc)
    let munKey = normalizeMun(municipio)   // LA ESTRELLA
      .toLowerCase()                       // la estrella
      .replace(/\s+/g, '-');              // la-estrella

    const lat = parseFloat(match.lat);
    const lon = parseFloat(match.lon);
    let officialBarrio = '';

    hint.textContent = '📍 Cruzando coordenadas con mapa catastral...';
    hint.classList.remove('text-slate-400');
    hint.classList.add('text-amber-500');

    try {
      // 1. Point in Polygon con Turf.js
      if (window.turf && !isNaN(lat) && !isNaN(lon)) {
        const pt = turf.point([lon, lat]);
        const res = await fetch(`/data/geojson/${munKey}.geojson`);
        if (res.ok) {
          const geojson = await res.json();
          for (let feature of geojson.features) {
            // Intentar leer la llave estandarizada primero
            let bName = feature.properties.nombre_barrio_estandarizado || feature.properties.NOMBRE || feature.properties.BARRIO || feature.properties.NOM_BARRIO || feature.properties.nombre || feature.properties.barrio;
            if (feature.geometry && turf.booleanPointInPolygon(pt, feature)) {
              officialBarrio = bName;
              break;
            }
          }
        }
      }
    } catch (e) {
      console.error("Error validando polígono:", e);
    }

    // Ya no reescribimos el input con la dirección de OSM para evitar cambiar lo que el usuario escribió

    // Guardar JSON validado en campo oculto
    validatedData = {
      ...match,
      municipio_seleccionado: municipio,
      barrio_oficial: officialBarrio,
      user_lat: lat,
      user_lon: lon,
      validated_at: new Date().toISOString(),
      method: 'osm_turf',
    };
    if (hiddenFld) hiddenFld.value = JSON.stringify(validatedData);

    if (window.CartManager && typeof window.CartManager.checkFreeShipping === 'function') {
      const isFree = await window.CartManager.checkFreeShipping(municipio, officialBarrio);
      try {
        localStorage.setItem('la_tienda_pet_shipping_address', JSON.stringify({
          municipio: municipio,
          direccion: dirInput ? dirInput.value : '',
          barrio: officialBarrio || '',
          isFreeShipping: isFree,
          timestamp: Date.now()
        }));
      } catch(e) {}
      const bannerContainer = getEl('checkout-shipping-banner');
      if (bannerContainer) {
        if (isFree) {
          bannerContainer.innerHTML = `
            <div class="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-start gap-3 animate-fade-in">
                <span class="text-emerald-500 mt-0.5">✅</span>
                <div>
                    <p class="text-sm font-bold text-emerald-800">¡Felicidades! Tu dirección aplica para Domicilio Gratis</p>
                    <p class="text-xs text-emerald-700 mt-0.5">Válido en productos seleccionados.</p>
                </div>
            </div>`;
        } else {
          bannerContainer.innerHTML = `
            <div class="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 animate-fade-in">
                <span class="text-slate-500 mt-0.5">ℹ️</span>
                <div>
                    <p class="text-sm font-bold text-slate-800">Costo de envío estándar: $12.000</p>
                    <p class="text-xs text-slate-500 mt-0.5">Tu barrio (${officialBarrio || 'Desconocido'}) no cuenta con promoción activa.</p>
                </div>
            </div>`;
        }
      }
    }

    isValidated = true;

    const btnSubmit = getEl('btn-submit-checkout');
    if (btnSubmit) btnSubmit.disabled = false;
    if (panel) panel.classList.add('hidden');

    initMap(lat, lon);
  }

  // ------------------------------------------------------------------
  // Resetear estado de validación
  // ------------------------------------------------------------------
  function resetValidation() {
    isValidated = false;
    validatedData = null;
    selectedPolygonLayer = null;

    if (window.CartManager) {
        window.CartManager.freeShippingActive = false;
        window.CartManager.render();
    }

    const badge  = getEl('address-status-badge');
    const panel  = getEl('address-suggestions');
    const hidden = getEl('validated-address-json');
    const hint   = getEl('address-hint');
    const barrioBadge = getEl('selected-barrio-badge');
    const hoverLabel  = getEl('map-hover-barrio');

    if (badge) { badge.className = 'hidden'; badge.textContent = ''; }
    if (barrioBadge) { barrioBadge.className = 'hidden'; barrioBadge.textContent = ''; }
    if (hoverLabel) hoverLabel.textContent = '';
    if (panel) panel.classList.add('hidden');
    if (hidden) hidden.value = '';
    if (hint) hint.textContent = 'Escribe tu dirección. La verificaremos automáticamente en 2 segundos.';
    const bannerContainer = getEl('checkout-shipping-banner');
    if (bannerContainer) bannerContainer.innerHTML = '';
    
    // Ocultar y resetear fallback
    const fallbackWrap = getEl('fallback-barrio-wrap');
    if (fallbackWrap) fallbackWrap.classList.add('hidden');
    const fallbackInput = getEl('input-barrio-fallback');
    if (fallbackInput) {
      fallbackInput.value = '';
      fallbackInput.required = false;
    }
    
    // Ocultar mapa (y pin) si se resetea la validación
    const mapWrap = getEl('checkout-map-wrap');
    if (mapWrap) mapWrap.classList.add('hidden');
    if (geoJsonLayer && leafletMap) {
      leafletMap.removeLayer(geoJsonLayer);
      geoJsonLayer = null;
    }
    if (leafletMarker && leafletMap) {
      leafletMap.removeLayer(leafletMarker);
      leafletMarker = null;
    }
  }

  // ------------------------------------------------------------------
  // Renderizar mapa de polígonos de barrios del municipio
  // ------------------------------------------------------------------
  async function renderMunicipalityBarriosMap(municipio, preselectedBarrio) {
    if (!municipio) return;

    let munKey = normalizeMun(municipio)
      .toLowerCase()
      .replace(/\s+/g, '-');

    const mapWrap = getEl('checkout-map-wrap');
    const mapHeaderTitle = getEl('map-header-title');
    const hoverLabel = getEl('map-hover-barrio');
    
    if (mapWrap) mapWrap.classList.remove('hidden');
    if (mapHeaderTitle) {
      const displayMun = municipio.charAt(0).toUpperCase() + municipio.slice(1).toLowerCase();
      mapHeaderTitle.textContent = `📍 Mapa de Barrios — ${displayMun}`;
    }

    // Inicializar mapa si no existe
    if (!leafletMap && window.L) {
      const coords = MUNICIPIO_COORDS[normalizeMun(municipio)] || DEFAULT_CENTER;
      leafletMap = L.map('checkout-map', { zoomControl: true }).setView(coords, DEFAULT_ZOOM);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(leafletMap);
    }

    // Limpiar capas previas
    if (geoJsonLayer && leafletMap) {
      leafletMap.removeLayer(geoJsonLayer);
      geoJsonLayer = null;
    }
    if (leafletMarker && leafletMap) {
      leafletMap.removeLayer(leafletMarker);
      leafletMarker = null;
    }
    barrioLayersMap.clear();
    selectedPolygonLayer = null;

    try {
      let geojson = cachedGeoJson.get(munKey);
      if (!geojson) {
        const res = await fetch(`/data/geojson/${munKey}.geojson`);
        if (!res.ok) throw new Error(`No se pudo cargar /data/geojson/${munKey}.geojson`);
        geojson = await res.json();
        cachedGeoJson.set(munKey, geojson);
      }

      // Estilos base
      const defaultStyle = {
        fillColor: '#3b82f6',
        fillOpacity: 0.12,
        color: '#2563eb',
        weight: 1.5,
        opacity: 0.7
      };

      geoJsonLayer = L.geoJSON(geojson, {
        style: defaultStyle,
        onEachFeature: function (feature, layer) {
          const props = feature.properties || {};
          const barrioName = props.nombre_barrio_estandarizado || props.NOMBRE || props.BARRIO || props.NOM_BARRIO || props.nombre || props.barrio || "Desconocido";
          const normalizedKey = barrioName.trim().toUpperCase();

          barrioLayersMap.set(normalizedKey, layer);

          // Tooltip con el nombre del barrio
          layer.bindTooltip(barrioName, {
            permanent: false,
            direction: 'center',
            className: 'bg-white px-2 py-1 shadow-md rounded border border-slate-200 text-xs font-bold text-slate-800'
          });

          // Hover
          layer.on('mouseover', function () {
            if (layer !== selectedPolygonLayer) {
              layer.setStyle({
                fillOpacity: 0.35,
                color: '#1d4ed8',
                weight: 2.5
              });
            }
            if (hoverLabel) hoverLabel.textContent = `📍 ${barrioName}`;
          });

          layer.on('mouseout', function () {
            if (layer !== selectedPolygonLayer) {
              layer.setStyle(defaultStyle);
            }
            if (hoverLabel && !selectedPolygonLayer) {
              hoverLabel.textContent = '';
            } else if (hoverLabel && selectedPolygonLayer) {
              hoverLabel.textContent = `✅ ${selectedPolygonLayer.feature?.properties?._barrioName || ''}`;
            }
          });

          // Clic para seleccionar barrio en el mapa
          layer.on('click', function (e) {
            if (e && e.originalEvent) {
              e.originalEvent.stopPropagation();
            }
            applySelectedBarrio(barrioName, municipio, layer);
          });

          feature.properties._barrioName = barrioName;
        }
      }).addTo(leafletMap);

      // Ajustar vista del mapa al tamaño de los barrios
      if (geoJsonLayer.getBounds().isValid()) {
        leafletMap.fitBounds(geoJsonLayer.getBounds(), { padding: [15, 15] });
      }

      // Si ya hay un barrio seleccionado, resaltarlo
      if (preselectedBarrio) {
        const targetLayer = barrioLayersMap.get(preselectedBarrio.trim().toUpperCase());
        if (targetLayer) {
          applySelectedBarrio(preselectedBarrio, municipio, targetLayer);
          if (targetLayer.getBounds && targetLayer.getBounds().isValid()) {
            leafletMap.fitBounds(targetLayer.getBounds(), { maxZoom: 16, padding: [20, 20] });
          }
        }
      }

      setTimeout(() => {
        if (leafletMap) leafletMap.invalidateSize();
      }, 200);

    } catch (err) {
      console.warn("Error cargando polígonos de barrios:", err);
    }
  }

  // ------------------------------------------------------------------
  // Aplicar selección de barrio (por clic en mapa o input)
  // ------------------------------------------------------------------
  async function applySelectedBarrio(barrioName, municipio, targetLayer) {
    if (!barrioName || !municipio) return;

    // Resetear capa previa
    if (selectedPolygonLayer && geoJsonLayer) {
      geoJsonLayer.resetStyle(selectedPolygonLayer);
    }

    // Resaltar nueva capa
    if (targetLayer) {
      selectedPolygonLayer = targetLayer;
      targetLayer.setStyle({
        fillColor: '#54B435',
        fillOpacity: 0.5,
        color: '#166534',
        weight: 3,
        opacity: 1
      });
      if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) {
        targetLayer.bringToFront();
      }
    }

    // Actualizar input de fallback y badge
    const fallbackInput = getEl('input-barrio-fallback');
    if (fallbackInput) {
      fallbackInput.value = barrioName;
    }

    const badge = getEl('selected-barrio-badge');
    if (badge) {
      badge.textContent = `✅ ${barrioName}`;
      badge.classList.remove('hidden');
    }

    const hoverLabel = getEl('map-hover-barrio');
    if (hoverLabel) {
      hoverLabel.textContent = `✅ ${barrioName}`;
    }

    const hint = getEl('address-hint');
    if (hint) {
      hint.textContent = `✅ Barrio "${barrioName}" seleccionado en el mapa.`;
      hint.className = 'text-[10px] text-emerald-600 mt-1 ml-1 font-semibold';
    }

    // Permitir avanzar el pedido
    const btnSubmit = getEl('btn-submit-checkout');
    if (btnSubmit) btnSubmit.disabled = false;

    // Chequear promoción de envío gratis
    if (window.CartManager && typeof window.CartManager.checkFreeShipping === 'function') {
      const isFree = await window.CartManager.checkFreeShipping(municipio, barrioName);
      try {
        const dirInput = getEl('input-direccion');
        localStorage.setItem('la_tienda_pet_shipping_address', JSON.stringify({
          municipio: municipio,
          direccion: dirInput ? dirInput.value : '',
          barrio: barrioName || '',
          isFreeShipping: isFree,
          timestamp: Date.now()
        }));
      } catch(e) {}
      const bannerContainer = getEl('checkout-shipping-banner');
      if (bannerContainer) {
        if (isFree) {
          bannerContainer.innerHTML = `
            <div class="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-start gap-3 animate-fade-in">
                <span class="text-emerald-500 mt-0.5">✅</span>
                <div>
                    <p class="text-sm font-bold text-emerald-800">¡Felicidades! Tu dirección aplica para Domicilio Gratis</p>
                    <p class="text-xs text-emerald-700 mt-0.5">Válido en productos seleccionados.</p>
                </div>
            </div>`;
        } else {
          bannerContainer.innerHTML = `
            <div class="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 animate-fade-in">
                <span class="text-slate-500 mt-0.5">ℹ️</span>
                <div>
                    <p class="text-sm font-bold text-slate-800">Costo de envío estándar: $12.000</p>
                    <p class="text-xs text-slate-500 mt-0.5">Tu barrio (${barrioName}) no cuenta con promoción activa.</p>
                </div>
            </div>`;
        }
      }
    }

    // Guardar metadata
    if (validatedData) {
      validatedData.barrio_oficial = barrioName;
      validatedData.method = 'map_polygon_selection';
    } else {
      validatedData = {
        municipio_seleccionado: municipio,
        barrio_oficial: barrioName,
        validated_at: new Date().toISOString(),
        method: 'map_polygon_selection',
      };
    }

    const hiddenFld = getEl('validated-address-json');
    if (hiddenFld) hiddenFld.value = JSON.stringify(validatedData);
  }

  // ------------------------------------------------------------------
  // Fallback Manual y Visual de Barrios
  // ------------------------------------------------------------------
  async function loadFallbackBarrios(municipio) {
    const datalist = getEl('barrios-list');
    const fallbackWrap = getEl('fallback-barrio-wrap');
    const fallbackInput = getEl('input-barrio-fallback');
    
    if (!datalist || !fallbackWrap || !fallbackInput) return;
    
    datalist.innerHTML = '';
    
    // 1. Mostrar contenedor de fallback y mapa interactivo de barrios
    fallbackWrap.classList.remove('hidden');
    fallbackInput.required = true;
    
    // 2. Cargar el mapa con los polígonos de barrios del municipio
    await renderMunicipalityBarriosMap(municipio);

    // 3. Llenar datalist desde Supabase o desde los polígonos cargados
    try {
      if (window.supabase && typeof SUPABASE_URL !== 'undefined') {
        const client = window.supabase.createClient(SUPABASE_URL, getAnonKey());
        const { data, error } = await client
          .from('petpro_barrios')
          .select('nombre')
          .ilike('municipio', municipio)
          .order('nombre', { ascending: true });
          
        if (!error && data && data.length > 0) {
          data.forEach(b => {
            const option = document.createElement('option');
            option.value = b.nombre;
            datalist.appendChild(option);
          });
        }
      }
    } catch (e) {
      console.error("Error cargando barrios fallback de BD:", e);
    }

    // Si el datalist sigue vacío, poblarlo desde las llaves del mapa
    if (datalist.children.length === 0 && barrioLayersMap.size > 0) {
      Array.from(barrioLayersMap.keys()).sort().forEach(bName => {
        const option = document.createElement('option');
        option.value = bName;
        datalist.appendChild(option);
      });
    }
  }
  
  function bindFallbackInput() {
    const fallbackInput = getEl('input-barrio-fallback');
    if (!fallbackInput) return;
    
    const handleBarrioInputChange = async () => {
      const selectedBarrio = fallbackInput.value.trim().toUpperCase();
      const municipio = getEl('select-municipio')?.value || '';
      
      if (!selectedBarrio || !municipio) return;

      const targetLayer = barrioLayersMap.get(selectedBarrio);
      await applySelectedBarrio(selectedBarrio, municipio, targetLayer);

      if (targetLayer && targetLayer.getBounds && targetLayer.getBounds().isValid() && leafletMap) {
        leafletMap.fitBounds(targetLayer.getBounds(), { maxZoom: 16, padding: [20, 20] });
      }
    };

    fallbackInput.addEventListener('change', handleBarrioInputChange);
    fallbackInput.addEventListener('input', () => {
      const val = fallbackInput.value.trim().toUpperCase();
      if (barrioLayersMap.has(val)) {
        handleBarrioInputChange();
      }
    });
  }

  // ------------------------------------------------------------------
  // Listener del input de direccion (debounce)
  // ------------------------------------------------------------------
  function bindAddressInput() {
    const input = getEl('input-direccion');
    const badge = getEl('address-status-badge');
    const hint = getEl('address-hint');
    if (!input) return;

    // Trick para evitar autocomplete del navegador
    input.setAttribute('readonly', 'true');
    setTimeout(() => input.removeAttribute('readonly'), 500);

    input.addEventListener('input', () => {
      if (!IGAC_VALIDATION_ENABLED) return;
      if (isValidated) resetValidation();

      // Mostrar indicador de escritura
      if (badge) {
        badge.textContent = '...';
        badge.className = 'shrink-0 text-xs font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-400';
        badge.classList.remove('hidden');
      }

      // Ocultar sugerencias mientras escribe
      getEl('address-suggestions')?.classList.add('hidden');

      clearTimeout(debounceTimer);
      const val = input.value.trim();
      if (val.length < MIN_CHARS) {
        if (badge) badge.classList.add('hidden');
        return;
      }

      debounceTimer = setTimeout(async () => {
        const municipio = getEl('select-municipio')?.value || '';
        if (!municipio) {
          if (hint) {
            hint.textContent = '⚠️ Primero selecciona tu municipio.';
            hint.className = 'text-[10px] text-amber-500 mt-1 ml-1';
          }
          if (badge) badge.classList.add('hidden');
          return;
        }

        // Geocodificacion silenciosa: toma automaticamente el primer resultado
        if (badge) {
          badge.textContent = '📍';
          badge.className = 'shrink-0 text-xs font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-600';
        }
        if (hint) {
          hint.textContent = 'Verificando dirección con el mapa catastral...';
          hint.className = 'text-[10px] text-amber-500 mt-1 ml-1';
        }

        const result = await validateAddress(municipio, val);

        if (result.status === 'ok' && result.matches && result.matches.length > 0) {
          // Tomar automaticamente el primer match sin mostrarselo al usuario
          await onSuggestionSelected(result.matches[0]);
        } else {
          // Fallback: OSM falló, cargar barrios para selección manual
          loadFallbackBarrios(municipio);
          
          if (badge) {
            badge.textContent = '⚠️';
            badge.className = 'shrink-0 text-xs font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-600';
          }
          if (hint) {
            hint.textContent = 'Dirección no encontrada. Selecciona tu barrio abajo.';
            hint.className = 'text-[10px] text-amber-600 mt-1 ml-1 font-semibold';
          }
        }
      }, 2000);
    });

    // Cerrar sugerencias al hacer clic fuera
    document.addEventListener('click', (e) => {
      if (!input.contains(e.target) && !getEl('address-suggestions')?.contains(e.target)) {
        getEl('address-suggestions')?.classList.add('hidden');
      }
    });
  }

  // ------------------------------------------------------------------
  // Comprobación de Cobertura para Modal Independiente y Caché
  // ------------------------------------------------------------------
  async function checkCoverage(municipio, direccion) {
    if (!municipio) {
      return { status: 'error', message: 'Por favor selecciona un municipio.' };
    }
    if (!direccion || direccion.trim().length < 3) {
      return { status: 'error', message: 'Por favor ingresa una dirección válida.' };
    }

    const normMun = normalizeMun(municipio);
    let munKey = normMun.toLowerCase().replace(/\s+/g, '-');
    let officialBarrio = '';
    let lat = null;
    let lon = null;

    // 1. Intentar geocodificar con Nominatim
    try {
      const geoResult = await validateAddress(normMun, direccion.trim());
      if (geoResult.status === 'ok' && geoResult.matches && geoResult.matches.length > 0) {
        const match = geoResult.matches[0];
        lat = parseFloat(match.lat);
        lon = parseFloat(match.lon);
        officialBarrio = await detectBarrioFromCoords(lat, lon, normMun);
      }
    } catch(e) {
      console.warn("Geocoding check error:", e);
    }

    // 2. Si no se detectó por coordenadas, buscar si el texto de la dirección menciona un barrio
    if (!officialBarrio) {
      try {
        let geojson = cachedGeoJson.get(munKey);
        if (!geojson) {
          const res = await fetch(`/data/geojson/${munKey}.geojson`);
          if (res.ok) {
            geojson = await res.json();
            cachedGeoJson.set(munKey, geojson);
          }
        }
        if (geojson && geojson.features) {
          const dirUpper = direccion.toUpperCase();
          for (let feature of geojson.features) {
            let bName = feature.properties.nombre_barrio_estandarizado || feature.properties.NOMBRE || feature.properties.BARRIO || feature.properties.NOM_BARRIO || feature.properties.nombre || feature.properties.barrio;
            if (bName && dirUpper.includes(bName.toUpperCase())) {
              officialBarrio = bName;
              break;
            }
          }
        }
      } catch(e) {}
    }

    // 3. Verificar envío gratis con CartManager
    let isFree = false;
    if (window.CartManager && typeof window.CartManager.checkFreeShipping === 'function') {
      if (officialBarrio) {
        isFree = await window.CartManager.checkFreeShipping(normMun, officialBarrio);
      } else {
        isFree = false;
      }
    }

    // 4. Guardar en caché localStorage
    const cacheData = {
      municipio: normMun,
      direccion: direccion.trim(),
      barrio: officialBarrio || '',
      isFreeShipping: isFree,
      timestamp: Date.now()
    };
    try {
      localStorage.setItem('la_tienda_pet_shipping_address', JSON.stringify(cacheData));
    } catch(e) {}

    return {
      status: 'ok',
      municipio: normMun,
      direccion: direccion.trim(),
      barrio: officialBarrio,
      isFreeShipping: isFree,
      lat,
      lon
    };
  }

  // ------------------------------------------------------------------
  // Inicializacion cuando se abre el modal de checkout
  // ------------------------------------------------------------------
  function initOnModalOpen() {
    const modal = getEl('modal-checkout');
    if (!modal) return;

    const applyCachedData = () => {
      try {
        const raw = localStorage.getItem('la_tienda_pet_shipping_address');
        if (!raw) return;
        const cached = JSON.parse(raw);
        if (!cached) return;

        const sel = getEl('select-municipio');
        const dir = getEl('input-direccion');

        if (sel && cached.municipio && !sel.value) {
          sel.value = cached.municipio;
          centerMapOnMunicipio(cached.municipio);
        }
        if (dir && cached.direccion && !dir.value) {
          dir.value = cached.direccion;
        }

        const bannerContainer = getEl('checkout-shipping-banner');
        if (bannerContainer) {
          if (cached.isFreeShipping) {
            bannerContainer.innerHTML = `
              <div class="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-start gap-3 animate-fade-in">
                  <span class="text-emerald-500 mt-0.5">✅</span>
                  <div>
                      <p class="text-sm font-bold text-emerald-800">¡Felicidades! Tu dirección aplica para Domicilio Gratis</p>
                      <p class="text-xs text-emerald-700 mt-0.5">Válido en productos seleccionados.</p>
                  </div>
              </div>`;
            if (window.CartManager) {
              window.CartManager.freeShippingActive = true;
              window.CartManager.render();
            }
          }
        }
      } catch(e) {
        console.warn("Error cargando caché en checkout:", e);
      }
    };

    const runInit = () => {
      loadMunicipios().then(() => {
        applyCachedData();
      });
      bindAddressInput();
      bindFallbackInput();
      
      // COMPORTAMIENTO SUAVE: el botón nunca está bloqueado
      if (!IGAC_VALIDATION_ENABLED) {
          isValidated = true;
      }
    };

    const isVisible = modal.style.display !== 'none' && !modal.classList.contains('hidden');
    if (isVisible) {
      runInit();
    } else {
      const observer = new MutationObserver(() => {
        const nowVisible = modal.style.display !== 'none' && !modal.classList.contains('hidden');
        if (nowVisible) {
          runInit();
          observer.disconnect();
        }
      });
      observer.observe(modal, { attributes: true, attributeFilter: ['style', 'class'] });
    }
  }

  // ------------------------------------------------------------------
  // API publica
  // ------------------------------------------------------------------
  window.AddressValidator = {
    isValidated: () => !IGAC_VALIDATION_ENABLED ? true : isValidated,
    getValidatedData: () => !IGAC_VALIDATION_ENABLED ? null : validatedData,
    reset: resetValidation,
    init: initOnModalOpen,
    checkCoverage: checkCoverage,
    getCachedData: () => {
      try {
        const raw = localStorage.getItem('la_tienda_pet_shipping_address');
        return raw ? JSON.parse(raw) : null;
      } catch(e) { return null; }
    }
  };

  // Inicializar
  document.addEventListener('DOMContentLoaded', initOnModalOpen);

})();
