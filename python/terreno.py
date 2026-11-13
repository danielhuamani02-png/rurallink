"""
terreno.py — Obtiene el perfil de elevación entre dos puntos.

Fuentes (en orden):
  1. Open Topo Data   — SRTM 30 m   (https://www.opentopodata.org)
  2. Open-Meteo       — Copernicus DEM GLO-90, 90 m (https://open-meteo.com)
  3. Terreno de demostración (sin internet), para practicar o presentar offline.
"""
from __future__ import annotations

import numpy as np
import requests

from calculos import puntos_intermedios

TIMEOUT = 15
MAX_PUNTOS = 100  # ambas APIs aceptan hasta 100 coordenadas por consulta


def _open_topo_data(lats, lons):
    locs = "|".join(f"{a:.6f},{o:.6f}" for a, o in zip(lats, lons))
    r = requests.get("https://api.opentopodata.org/v1/srtm30m",
                     params={"locations": locs}, timeout=TIMEOUT)
    r.raise_for_status()
    data = r.json()
    if data.get("status") != "OK":
        raise RuntimeError(data.get("error", "Respuesta no válida"))
    elev = [p["elevation"] for p in data["results"]]
    if any(e is None for e in elev):
        raise RuntimeError("Hay puntos sin datos de elevación")
    return elev


def _open_meteo(lats, lons):
    r = requests.get("https://api.open-meteo.com/v1/elevation",
                     params={"latitude": ",".join(f"{a:.6f}" for a in lats),
                             "longitude": ",".join(f"{o:.6f}" for o in lons)},
                     timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()["elevation"]


def terreno_demo(n: int, semilla: int = 7):
    """Perfil andino sintético (cerros y una quebrada) para usar sin internet."""
    x = np.linspace(0, 1, n)
    rng = np.random.default_rng(semilla)
    base = 3150 + 35 * np.sin(2 * np.pi * x * 1.3) + 20 * np.sin(2 * np.pi * x * 3.7 + 1)
    cerro = 95 * np.exp(-((x - 0.62) / 0.07) ** 2)
    quebrada = -80 * np.exp(-((x - 0.35) / 0.06) ** 2)
    ruido = np.convolve(rng.normal(0, 6, n), np.ones(5) / 5, mode="same")
    return list(base + cerro + quebrada + ruido)


def obtener_perfil(lat1, lon1, lat2, lon2, n: int = MAX_PUNTOS, modo_demo: bool = False):
    """Devuelve (elevaciones, fuente, lats, lons)."""
    n = min(n, MAX_PUNTOS)
    lats, lons = puntos_intermedios(lat1, lon1, lat2, lon2, n)
    if modo_demo:
        return terreno_demo(n), "Terreno de demostración (sin conexión)", lats, lons

    errores = []
    for nombre, fn in [("Open Topo Data · SRTM 30 m", _open_topo_data),
                       ("Open-Meteo · Copernicus DEM 90 m", _open_meteo)]:
        try:
            return fn(lats, lons), nombre, lats, lons
        except Exception as e:  # noqa: BLE001 — se prueba la siguiente fuente
            errores.append(f"{nombre}: {e}")
    raise ConnectionError("No se pudo obtener la elevación.\n" + "\n".join(errores))
