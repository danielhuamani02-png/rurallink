"""
RuralLink — Simulador de viabilidad de radioenlaces punto a punto
para la conectividad de zonas rurales del Perú.

Ejecutar:   streamlit run app.py
"""
import io

import folium
import pandas as pd
import streamlit as st
from streamlit_folium import st_folium

from calculos import ParametrosEnlace, analizar_enlace, distancia_km
from grafico import grafico_perfil
from terreno import obtener_perfil

st.set_page_config(page_title="RuralLink · Simulador de radioenlaces", page_icon="📡", layout="wide")

# ---------------------------------------------------------------- estado inicial
DEFAULT = {"lat_a": -12.0480, "lon_a": -75.2520, "lat_b": -12.1060, "lon_b": -75.1840,
           "ultimo_clic": None, "resultado": None}
for k, v in DEFAULT.items():
    st.session_state.setdefault(k, v)

# ---------------------------------------------------------------- encabezado
st.markdown(
    """
    <div style="background:#1F3A5F;padding:18px 24px;border-radius:10px;margin-bottom:12px">
      <h2 style="color:white;margin:0">📡 RuralLink</h2>
      <p style="color:#D9E2EC;margin:4px 0 0 0">Simulador de viabilidad de radioenlaces punto a punto
      para zonas rurales · UIT-R P.525 / P.526 / P.530</p>
    </div>
    """, unsafe_allow_html=True)

# ---------------------------------------------------------------- barra lateral
with st.sidebar:
    st.header("⚙️ Parámetros del enlace")
    st.subheader("Radio")
    f_ghz = st.selectbox("Frecuencia (GHz)", [2.4, 5.2, 5.8, 11.0, 18.0], index=2)
    ptx = st.number_input("Potencia de transmisión (dBm)", -10.0, 40.0, 25.0, 1.0)
    gtx = st.number_input("Ganancia antena A (dBi)", 0.0, 45.0, 23.0, 0.5)
    grx = st.number_input("Ganancia antena B (dBi)", 0.0, 45.0, 23.0, 0.5)
    cables = st.number_input("Pérdidas en cables y conectores, total (dB)", 0.0, 20.0, 2.0, 0.5)
    sens = st.number_input("Sensibilidad del receptor (dBm)", -110.0, -40.0, -80.0, 1.0)

    st.subheader("Torres")
    h_a = st.slider("Altura antena A (m)", 3, 120, 20)
    h_b = st.slider("Altura antena B (m)", 3, 120, 20)

    st.subheader("Criterios")
    obst = st.slider("Árboles / edificaciones sobre el terreno (m)", 0, 30, 0,
                     help="El MDE no incluye vegetación ni casas; agrégalas como margen.")
    despeje = st.slider("Despeje mínimo de Fresnel (%)", 20, 100, 60) / 100
    margen_min = st.slider("Margen de desvanecimiento deseado (dB)", 5, 30, 15)
    k = st.select_slider("Factor k (refracción)", options=[0.67, 1.0, 1.33, 4.0], value=1.33,
                         help="1.33 = atmósfera estándar (4/3). 0.67 = caso desfavorable.")
    modo_demo = st.toggle("Modo sin internet (terreno de demostración)", value=False)

params = ParametrosEnlace(f_ghz=f_ghz, ptx_dbm=ptx, gtx_dbi=gtx, grx_dbi=grx, perd_cables_db=cables,
                          sens_dbm=sens, h_torre_a=h_a, h_torre_b=h_b, k=4 / 3 if k == 1.33 else k,
                          obstaculos_m=obst, despeje_min=despeje, margen_min_db=margen_min)

# ---------------------------------------------------------------- mapa y coordenadas
col_mapa, col_coord = st.columns([3, 1.25])

with col_coord:
    st.markdown("#### 📍 Ubicación de las torres")
    mover = st.radio("Al hacer clic en el mapa, mover:", ["Torre A (con internet)", "Torre B (localidad)"])
    st.markdown("**Torre A**")
    st.session_state.lat_a = st.number_input("Latitud A", -90.0, 90.0, st.session_state.lat_a, format="%.5f")
    st.session_state.lon_a = st.number_input("Longitud A", -180.0, 180.0, st.session_state.lon_a, format="%.5f")
    st.markdown("**Torre B**")
    st.session_state.lat_b = st.number_input("Latitud B", -90.0, 90.0, st.session_state.lat_b, format="%.5f")
    st.session_state.lon_b = st.number_input("Longitud B", -180.0, 180.0, st.session_state.lon_b, format="%.5f")
    d = distancia_km(st.session_state.lat_a, st.session_state.lon_a,
                     st.session_state.lat_b, st.session_state.lon_b)
    st.metric("Distancia del enlace", f"{d:.2f} km")
    simular = st.button("▶ Simular enlace", type="primary", use_container_width=True)

with col_mapa:
    A = (st.session_state.lat_a, st.session_state.lon_a)
    B = (st.session_state.lat_b, st.session_state.lon_b)
    m = folium.Map(location=[(A[0] + B[0]) / 2, (A[1] + B[1]) / 2], zoom_start=12,
                   tiles="OpenTopoMap", attr="© OpenTopoMap (CC-BY-SA) · © OpenStreetMap")
    folium.TileLayer("OpenStreetMap", name="Calles").add_to(m)
    folium.Marker(A, tooltip="Torre A", icon=folium.Icon(color="blue", icon="signal")).add_to(m)
    folium.Marker(B, tooltip="Torre B", icon=folium.Icon(color="red", icon="home")).add_to(m)
    folium.PolyLine([A, B], color="#1F3A5F", weight=4, dash_array="8").add_to(m)
    folium.LayerControl().add_to(m)
    salida = st_folium(m, height=470, use_container_width=True, returned_objects=["last_clicked"])

    clic = (salida or {}).get("last_clicked")
    if clic and clic != st.session_state.ultimo_clic:
        st.session_state.ultimo_clic = clic
        if mover.startswith("Torre A"):
            st.session_state.lat_a, st.session_state.lon_a = clic["lat"], clic["lng"]
        else:
            st.session_state.lat_b, st.session_state.lon_b = clic["lat"], clic["lng"]
        st.session_state.resultado = None
        st.rerun()

# ---------------------------------------------------------------- simulación
if simular:
    if d < 0.05:
        st.error("Las torres están demasiado cerca. Sepáralas en el mapa.")
    else:
        with st.spinner("Descargando perfil de elevación y calculando…"):
            try:
                elev, fuente, lats, lons = obtener_perfil(
                    st.session_state.lat_a, st.session_state.lon_a,
                    st.session_state.lat_b, st.session_state.lon_b, modo_demo=modo_demo)
                st.session_state.resultado = (elev, fuente, lats, lons, d)
            except ConnectionError as e:
                st.error(f"{e}\n\nActiva **Modo sin internet** en la barra lateral para usar el terreno de demostración.")

if st.session_state.resultado:
    elev, fuente, lats, lons, d = st.session_state.resultado
    res = analizar_enlace(d, elev, params)  # se recalcula al mover cualquier parámetro

    st.divider()
    colores = {"VIABLE": ("#E6F4EA", "#1E7B34", "✅"),
               "VIABLE CON OBSERVACIONES": ("#FFF6E0", "#9A6700", "⚠️"),
               "NO VIABLE": ("#FDECEA", "#B42318", "❌")}
    fondo, texto, icono = colores[res.veredicto]
    st.markdown(
        f"""<div style="background:{fondo};border-left:6px solid {texto};padding:14px 18px;border-radius:8px">
        <span style="font-size:1.4rem;font-weight:700;color:{texto}">{icono} {res.veredicto}</span><br>
        <span style="color:#333">Perfil: {fuente} · {len(elev)} puntos</span></div>""",
        unsafe_allow_html=True)
    for o in res.observaciones:
        st.markdown(f"- {o}")

    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Distancia", f"{res.distancia_km:.2f} km")
    c2.metric("Pérdida espacio libre", f"{res.fspl_db:.1f} dB")
    c3.metric("Potencia recibida", f"{res.prx_dbm:.1f} dBm")
    c4.metric(("✅ " if res.margen_ok else "⚠️ ") + "Margen", f"{res.margen_db:.1f} dB")
    c5.metric(("✅ " if res.fresnel_ok else "⚠️ ") + "Despeje de Fresnel",
              f"{res.despeje_min_pct:.0f} %" if res.linea_vista_libre else "Bloqueado")

    st.markdown("#### 📈 Perfil del trayecto")
    fig = grafico_perfil(res, params)
    st.pyplot(fig)

    t1, t2 = st.columns(2)
    with t1:
        st.markdown("#### 🧮 Presupuesto de enlace")
        st.table(pd.DataFrame({
            "Concepto": ["Potencia de transmisión", "(+) Ganancia antena A", "(+) Ganancia antena B",
                         "(−) Pérdida en espacio libre", "(−) Pérdidas en cables", "(−) Pérdida por obstrucción",
                         "(=) Potencia recibida", "Sensibilidad del receptor", "Margen de desvanecimiento"],
            "Valor": [f"{params.ptx_dbm:.1f} dBm", f"{params.gtx_dbi:.1f} dBi", f"{params.grx_dbi:.1f} dBi",
                      f"{res.fspl_db:.2f} dB", f"{params.perd_cables_db:.1f} dB",
                      f"{res.perd_obstruccion_db:.2f} dB", f"{res.prx_dbm:.2f} dBm",
                      f"{params.sens_dbm:.1f} dBm", f"{res.margen_db:.2f} dB"]}).set_index("Concepto"))
    with t2:
        st.markdown("#### 🗼 Geometría")
        st.table(pd.DataFrame({
            "Concepto": ["Altitud base A", "Altitud base B", "Radio máx. de Fresnel",
                         "Peor punto del trayecto", "Línea de vista libre",
                         "Altura extra recomendada (ambas torres)", "PIRE"],
            "Valor": [f"{res.terreno_m[0]:.0f} m", f"{res.terreno_m[-1]:.0f} m", f"{res.r1_m.max():.2f} m",
                      f"km {res.km_peor_punto:.2f}", "Sí" if res.linea_vista_libre else "No",
                      f"{res.altura_extra_m:.1f} m", f"{res.pire_dbm:.1f} dBm"]}).set_index("Concepto"))

    # ---------------------------------------------------------- exportar
    perfil = pd.DataFrame({"km": res.x_km.round(3), "lat": lats.round(6), "lon": lons.round(6),
                           "elevacion_m": res.terreno_m.round(1), "terreno_efectivo_m": res.terreno_ef_m.round(1),
                           "linea_vista_m": res.los_m.round(1), "radio_fresnel_m": res.r1_m.round(2),
                           "despeje_pct": ((res.los_m - res.terreno_ef_m) / res.r1_m.clip(1e-9) * 100).round(1)})
    png = io.BytesIO()
    fig.savefig(png, format="png", dpi=200, bbox_inches="tight")
    e1, e2 = st.columns(2)
    e1.download_button("⬇️ Descargar perfil (CSV)", perfil.to_csv(index=False).encode("utf-8"),
                       "perfil_enlace.csv", "text/csv", use_container_width=True)
    e2.download_button("⬇️ Descargar gráfico (PNG)", png.getvalue(), "perfil_enlace.png",
                       "image/png", use_container_width=True)
else:
    st.info("Coloca las torres en el mapa (o escribe sus coordenadas) y pulsa **▶ Simular enlace**.")

st.caption("RuralLink · Evaluación preliminar: no reemplaza un estudio de campo. "
           "Datos de elevación: SRTM (NASA) vía Open Topo Data · Copernicus DEM vía Open-Meteo.")
