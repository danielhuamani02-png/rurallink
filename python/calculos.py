"""
calculos.py — Motor de cálculo de RuralLink.

Contiene solo funciones puras (sin interfaz) para que puedan probarse
de forma independiente. Fórmulas:
  (1) FSPL           — UIT-R P.525
  (2) Zona de Fresnel — UIT-R P.526 / P.530
  (3) Curvatura terrestre con factor k
  (4) Presupuesto de enlace
  (5) Margen de desvanecimiento
  + Pérdida por difracción en filo de cuchillo — UIT-R P.526
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

RADIO_TIERRA_KM = 6371.0
C = 299_792_458.0  # velocidad de la luz (m/s)


# ---------------------------------------------------------------------------
# Geometría
# ---------------------------------------------------------------------------
def distancia_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distancia ortodrómica (fórmula de Haversine) en km."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * RADIO_TIERRA_KM * math.asin(math.sqrt(a))


def puntos_intermedios(lat1, lon1, lat2, lon2, n: int):
    """n puntos equiespaciados entre A y B (incluye ambos extremos).
    Para enlaces de pocas decenas de km la interpolación lineal es suficiente."""
    t = np.linspace(0.0, 1.0, n)
    return lat1 + (lat2 - lat1) * t, lon1 + (lon2 - lon1) * t


# ---------------------------------------------------------------------------
# Fórmulas de propagación
# ---------------------------------------------------------------------------
def fspl_db(d_km: float, f_mhz: float) -> float:
    """(1) Pérdida en espacio libre en dB. d en km, f en MHz."""
    return 32.44 + 20 * math.log10(d_km) + 20 * math.log10(f_mhz)


def radio_fresnel_m(d1_km, d2_km, f_ghz: float, n: int = 1):
    """(2) Radio de la n-ésima zona de Fresnel en metros."""
    d = d1_km + d2_km
    d = np.where(d == 0, 1e-9, d)
    return 17.32 * np.sqrt(n * np.clip(d1_km * d2_km, 0, None) / (f_ghz * d))


def abultamiento_tierra_m(d1_km, d2_km, k: float = 4 / 3):
    """(3) Elevación aparente del terreno por la curvatura terrestre (m)."""
    return d1_km * d2_km / (12.74 * k)


def perdida_filo_cuchillo_db(v: float) -> float:
    """Pérdida por difracción J(v) de un obstáculo en filo de cuchillo (UIT-R P.526).
    v = parámetro de difracción. Para v <= -0.78 la pérdida es despreciable (0 dB)."""
    if v <= -0.78:
        return 0.0
    return 6.9 + 20 * math.log10(math.sqrt((v - 0.1) ** 2 + 1) + v - 0.1)


# ---------------------------------------------------------------------------
# Análisis completo de un enlace
# ---------------------------------------------------------------------------
@dataclass
class ParametrosEnlace:
    f_ghz: float = 5.8           # frecuencia
    ptx_dbm: float = 25.0        # potencia de transmisión
    gtx_dbi: float = 23.0        # ganancia antena A
    grx_dbi: float = 23.0        # ganancia antena B
    perd_cables_db: float = 2.0  # cables + conectores (ambos extremos)
    sens_dbm: float = -80.0      # sensibilidad del receptor
    h_torre_a: float = 20.0      # altura antena A sobre el suelo (m)
    h_torre_b: float = 20.0      # altura antena B sobre el suelo (m)
    k: float = 4 / 3             # factor de radio terrestre efectivo
    obstaculos_m: float = 0.0    # altura extra por árboles/edificaciones (m)
    despeje_min: float = 0.6     # fracción de la 1.ª zona de Fresnel que debe estar libre
    margen_min_db: float = 15.0  # margen de desvanecimiento deseado


@dataclass
class ResultadoEnlace:
    distancia_km: float
    fspl_db: float
    perd_obstruccion_db: float
    prx_dbm: float
    margen_db: float
    pire_dbm: float
    despeje_min_pct: float       # peor despeje de Fresnel en el trayecto (%)
    km_peor_punto: float
    linea_vista_libre: bool
    fresnel_ok: bool
    margen_ok: bool
    altura_extra_m: float        # metros a sumar a AMBAS torres para cumplir el despeje
    veredicto: str               # "VIABLE" | "VIABLE CON OBSERVACIONES" | "NO VIABLE"
    observaciones: list
    # vectores para el gráfico
    x_km: np.ndarray
    terreno_m: np.ndarray        # elevación real
    terreno_ef_m: np.ndarray     # elevación + curvatura + obstáculos
    los_m: np.ndarray
    r1_m: np.ndarray


def analizar_enlace(dist_km: float, elev_m, p: ParametrosEnlace) -> ResultadoEnlace:
    """Aplica las ecuaciones (1)–(5) sobre el perfil de elevación `elev_m`
    (lista de alturas en m s. n. m., de A hacia B, equiespaciadas)."""
    elev = np.asarray(elev_m, dtype=float)
    n = len(elev)
    x = np.linspace(0.0, dist_km, n)
    d1, d2 = x, dist_km - x

    # Terreno efectivo: elevación + curvatura terrestre + obstáculos (árboles, casas)
    bulge = abultamiento_tierra_m(d1, d2, p.k)
    extra = np.full(n, p.obstaculos_m)
    extra[0] = extra[-1] = 0.0  # en las torres no se suma
    terreno_ef = elev + bulge + extra

    # Línea de vista entre las dos antenas
    h_a = elev[0] + p.h_torre_a
    h_b = elev[-1] + p.h_torre_b
    los = h_a + (h_b - h_a) * x / dist_km

    # Primera zona de Fresnel y despeje en cada punto
    r1 = radio_fresnel_m(d1, d2, p.f_ghz)
    interior = slice(1, n - 1)  # los extremos tienen r1 = 0
    holgura = los - terreno_ef                       # m libres sobre el terreno
    ratio = holgura[interior] / r1[interior]          # fracción de r1 libre
    i_peor = int(np.argmin(ratio)) + 1
    despeje_min = float(ratio.min())

    linea_vista_libre = bool((holgura[interior] > 0).all())
    fresnel_ok = despeje_min >= p.despeje_min - 1e-9

    # Altura extra necesaria (igual en ambas torres): la LOS sube Δ en todo el trayecto
    deficit = p.despeje_min * r1[interior] - holgura[interior]
    altura_extra = math.ceil(max(0.0, float(deficit.max())) * 10) / 10  # redondeo a 0,1 m hacia arriba

    # Pérdida por obstrucción (peor obstáculo, filo de cuchillo, UIT-R P.526)
    # v = √2 · h / r1, con h = altura del obstáculo SOBRE la línea de vista
    v = math.sqrt(2) * (-holgura[i_peor]) / r1[i_peor]
    perd_obs = perdida_filo_cuchillo_db(v)

    # Presupuesto de enlace
    perdida_fs = fspl_db(dist_km, p.f_ghz * 1000)
    pire = p.ptx_dbm + p.gtx_dbi - p.perd_cables_db / 2
    prx = p.ptx_dbm + p.gtx_dbi + p.grx_dbi - perdida_fs - p.perd_cables_db - perd_obs
    margen = prx - p.sens_dbm
    margen_ok = margen >= p.margen_min_db

    # Veredicto
    obs = []
    if not linea_vista_libre:
        obs.append(f"El terreno bloquea la línea de vista cerca del km {x[i_peor]:.2f}.")
    elif not fresnel_ok:
        obs.append(f"Solo el {despeje_min*100:.0f} % de la 1.ª zona de Fresnel está libre "
                   f"en el km {x[i_peor]:.2f} (se requiere {p.despeje_min*100:.0f} %).")
    if altura_extra > 0:
        obs.append(f"Subir ambas antenas {altura_extra:.1f} m (A = {p.h_torre_a + altura_extra:.1f} m, "
                   f"B = {p.h_torre_b + altura_extra:.1f} m) para cumplir el despeje.")
    if margen < 0:
        obs.append("La potencia recibida está por debajo de la sensibilidad del receptor.")
    elif not margen_ok:
        obs.append(f"Margen de {margen:.1f} dB, menor a los {p.margen_min_db:.0f} dB recomendados: "
                   "el enlace puede caerse con lluvia o interferencias.")

    if linea_vista_libre and fresnel_ok and margen_ok:
        veredicto = "VIABLE"
    elif margen < 0 or (not linea_vista_libre and margen < p.margen_min_db):
        veredicto = "NO VIABLE"
    else:
        veredicto = "VIABLE CON OBSERVACIONES"

    return ResultadoEnlace(
        distancia_km=dist_km, fspl_db=perdida_fs, perd_obstruccion_db=perd_obs,
        prx_dbm=prx, margen_db=margen, pire_dbm=pire,
        despeje_min_pct=despeje_min * 100, km_peor_punto=float(x[i_peor]),
        linea_vista_libre=linea_vista_libre, fresnel_ok=fresnel_ok, margen_ok=margen_ok,
        altura_extra_m=altura_extra, veredicto=veredicto, observaciones=obs,
        x_km=x, terreno_m=elev, terreno_ef_m=terreno_ef, los_m=los, r1_m=r1,
    )
