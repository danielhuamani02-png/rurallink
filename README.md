# 📡 RuralLink

**Simulador de viabilidad de radioenlaces punto a punto para la conectividad de zonas rurales del Perú.**

Marca dos torres en el mapa y RuralLink descarga el perfil real del terreno, calcula la línea de vista,
la primera zona de Fresnel, la curvatura terrestre y el presupuesto de enlace, y te dice si el enlace
funciona y qué altura de torre necesitas.

Proyecto académico · Escuela Profesional de Ingeniería de Telecomunicaciones · UNFV.

## Funciones

- Mapa topográfico, satelital y de calles, con búsqueda de lugares y marcadores que se arrastran
- Perfil de elevación real: SRTM 30 m (Open Topo Data), con respaldo en Copernicus DEM 90 m (Open-Meteo)
- Cálculos según UIT-R P.525 (espacio libre), P.526 (Fresnel y difracción) y P.530 (factor k)
- Veredicto automático y **altura de torre recomendada**, que se aplica con un clic
- Gráfico interactivo del perfil, presupuesto de enlace, azimut de las antenas y comparación de frecuencias
- Exporta CSV, PNG y reporte para imprimir; **comparte la simulación con un enlace**
- Modo sin internet con terreno de demostración
- Funciona en computadora y celular

## Fórmulas

| # | Fórmula | Referencia |
|---|---|---|
| 1 | FSPL = 32,44 + 20 log(d km) + 20 log(f MHz) | UIT-R P.525 |
| 2 | r₁ = 17,32 √(d₁·d₂ / (f GHz · d)) | UIT-R P.526 |
| 3 | h = d₁·d₂ / (12,74 · k) | UIT-R P.530 |
| 4 | Prx = Ptx + Gtx + Grx − FSPL − Lcables − Lobst | — |
| 5 | M = Prx − Srx | — |

## Estructura

```
index.html          interfaz
css/styles.css      estilos
js/calculos.js      motor de cálculo
js/terreno.js       descarga del perfil de elevación
js/grafico.js       gráfico del perfil (Chart.js)
js/app.js           lógica de la interfaz y el mapa (Leaflet)
api/elevacion.js    función de Vercel que consulta Open Topo Data (SRTM 30 m)
tests/              pruebas unitarias (node --test) y funcionales (Playwright)
python/             versión de referencia en Python + Streamlit (mismas fórmulas)
```

## Ejecutar en local

No necesita instalación: es una página estática.

```bash
npx serve .          # o:  python -m http.server
npm test             # 8 pruebas unitarias del motor de cálculo
npm i --no-save playwright leaflet@1.9.4 chart.js@4.4.1
python -m http.server 8600 &
npm run test:e2e     # 20 pruebas funcionales en navegador (Playwright)
```

## Publicar en Vercel

1. Importa este repositorio en https://vercel.com/new
2. Framework Preset: **Other** · sin comando de build · Output Directory: raíz (`./`)
3. Deploy ✅

> Evaluación preliminar: no reemplaza un estudio de campo ni un diseño de ingeniería definitivo.
