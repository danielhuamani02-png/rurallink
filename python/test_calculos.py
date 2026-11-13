"""Pruebas del motor de cálculo. Ejecutar:  pytest -q"""
import math

import numpy as np

from calculos import (ParametrosEnlace, abultamiento_tierra_m, analizar_enlace, distancia_km,
                      fspl_db, perdida_filo_cuchillo_db, radio_fresnel_m)


def test_fspl_10km_5800mhz():
    assert math.isclose(fspl_db(10, 5800), 127.71, abs_tol=0.01)


def test_fresnel_punto_medio():
    assert math.isclose(float(radio_fresnel_m(5, 5, 5.8)), 11.37, abs_tol=0.01)


def test_curvatura_punto_medio():
    assert math.isclose(abultamiento_tierra_m(5, 5, 4 / 3), 1.47, abs_tol=0.01)


def test_distancia_un_grado_de_latitud():
    assert math.isclose(distancia_km(0, 0, 1, 0), 111.19, abs_tol=0.05)


def test_filo_cuchillo_rasante_6db():
    # Obstáculo justo en la línea de vista (v = 0) → ≈ 6 dB (UIT-R P.526)
    assert math.isclose(perdida_filo_cuchillo_db(0.0), 6.0, abs_tol=0.1)


def test_enlace_plano_es_viable():
    res = analizar_enlace(10, np.full(101, 3000.0), ParametrosEnlace())
    assert res.veredicto == "VIABLE"
    assert math.isclose(res.prx_dbm, -58.71, abs_tol=0.01)
    assert math.isclose(res.margen_db, 21.29, abs_tol=0.01)


def test_cerro_bloquea_y_recomienda_altura():
    elev = np.full(101, 3000.0)
    elev[50] = 3040  # cerro de 40 m en el centro, torres de 20 m
    res = analizar_enlace(10, elev, ParametrosEnlace())
    assert not res.linea_vista_libre
    assert res.altura_extra_m > 20
    # Con la altura recomendada el despeje debe cumplirse
    p = ParametrosEnlace(h_torre_a=20 + res.altura_extra_m, h_torre_b=20 + res.altura_extra_m)
    assert analizar_enlace(10, elev, p).fresnel_ok
