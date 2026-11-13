// Pruebas del motor de cálculo (mismos casos que python/test_calculos.py)
// Ejecutar:  node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { buscarRepetidor, fsplDb, radioFresnelM, abultamientoM, distanciaKm, perdidaFiloCuchilloDb, analizarEnlace, PARAMETROS_DEFECTO } from "../js/calculos.js";

const cerca = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} (±${tol})`);

test("FSPL 10 km a 5800 MHz = 127,71 dB", () => cerca(fsplDb(10, 5800), 127.71, 0.01));
test("Radio de Fresnel en el punto medio = 11,37 m", () => cerca(radioFresnelM(5, 5, 5.8), 11.37, 0.01));
test("Curvatura en el punto medio (k = 4/3) = 1,47 m", () => cerca(abultamientoM(5, 5, 4 / 3), 1.47, 0.01));
test("Un grado de latitud = 111,19 km", () => cerca(distanciaKm(0, 0, 1, 0), 111.19, 0.05));
test("Obstáculo rasante (v = 0) ≈ 6 dB", () => cerca(perdidaFiloCuchilloDb(0), 6.0, 0.1));

test("Terreno plano: enlace viable, Prx = −58,71 dBm, margen 21,29 dB", () => {
  const r = analizarEnlace(10, new Array(101).fill(3000));
  assert.equal(r.veredicto, "VIABLE");
  cerca(r.prxDbm, -58.71, 0.01);
  cerca(r.margenDb, 21.29, 0.01);
});

test("Cerro que bloquea: la altura recomendada cumple el despeje", () => {
  const elev = new Array(101).fill(3000); elev[50] = 3040;
  const r = analizarEnlace(10, elev);
  assert.equal(r.losLibre, false);
  assert.ok(r.alturaExtraM > 20);
  const h = PARAMETROS_DEFECTO.hTorreA + r.alturaExtraM;
  assert.ok(analizarEnlace(10, elev, { hTorreA: h, hTorreB: h }).fresnelOk);
});

test("Repetidor: una cordillera exige torres irreales y el repetidor la resuelve", () => {
  // 30 km, valle a 3000 m con una cordillera de 3300 m en el centro
  const elev = Array.from({ length: 101 }, (_, i) => 3000 + 300 * Math.exp(-(((i - 50) / 6) ** 2)));
  const directo = analizarEnlace(30, elev);
  assert.ok(directo.alturaExtraM > 200, "el enlace directo necesita torres de cientos de metros");
  const rep = buscarRepetidor(30, elev);
  assert.ok(Math.abs(rep.indice - 50) <= 3, "el repetidor se ubica en la cumbre");
  assert.ok(rep.hR <= 30 && rep.realista);
  assert.ok(rep.salto1.fresnelOk && rep.salto2.fresnelOk);
  assert.ok(rep.salto1.margenDb > directo.margenDb);
});
