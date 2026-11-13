/**
 * calculos.js — Motor de cálculo de RuralLink (mismas fórmulas que python/calculos.py)
 *  (1) FSPL                     UIT-R P.525
 *  (2) Radio de Fresnel         UIT-R P.526 / P.530
 *  (3) Curvatura terrestre (k)
 *  (4) Presupuesto de enlace
 *  (5) Margen de desvanecimiento
 *  +   Difracción en filo de cuchillo J(v)  UIT-R P.526
 */
export const RADIO_TIERRA_KM = 6371;

const rad = (g) => (g * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Distancia ortodrómica (Haversine) en km */
export function distanciaKm(lat1, lon1, lat2, lon2) {
  const dp = rad(lat2 - lat1), dl = rad(lon2 - lon1);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dl / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(a));
}

/** Rumbo inicial A→B en grados (0 = norte) — sirve para orientar las antenas */
export function azimut(lat1, lon1, lat2, lon2) {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x = Math.cos(rad(lat1)) * Math.sin(rad(lat2)) - Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** n puntos equiespaciados entre A y B (incluye extremos) */
export function puntosIntermedios(lat1, lon1, lat2, lon2, n) {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return [lat1 + (lat2 - lat1) * t, lon1 + (lon2 - lon1) * t];
  });
}

/** (1) Pérdida en espacio libre (dB); d en km, f en MHz */
export const fsplDb = (dKm, fMhz) => 32.44 + 20 * Math.log10(dKm) + 20 * Math.log10(fMhz);

/** (2) Radio de la n-ésima zona de Fresnel (m); d1, d2 en km, f en GHz */
export const radioFresnelM = (d1, d2, fGhz, n = 1) => {
  const d = d1 + d2 || 1e-9;
  return 17.32 * Math.sqrt((n * Math.max(d1 * d2, 0)) / (fGhz * d));
};

/** (3) Elevación aparente por curvatura terrestre (m) */
export const abultamientoM = (d1, d2, k = 4 / 3) => (d1 * d2) / (12.74 * k);

/** Pérdida por difracción en filo de cuchillo J(v) (dB) — UIT-R P.526 */
export function perdidaFiloCuchilloDb(v) {
  if (v <= -0.78) return 0;
  return 6.9 + 20 * Math.log10(Math.sqrt((v - 0.1) ** 2 + 1) + v - 0.1);
}

export const PARAMETROS_DEFECTO = {
  fGhz: 5.8, ptxDbm: 25, gtxDbi: 23, grxDbi: 23, perdCablesDb: 2, sensDbm: -80,
  hTorreA: 20, hTorreB: 20, k: 4 / 3, obstaculosM: 0, despejeMin: 0.6, margenMinDb: 15,
  hMaxM: 60, // altura máxima práctica de una torre (m)
};

/**
 * Analiza el enlace sobre un perfil de elevación (m s. n. m., de A a B, equiespaciado).
 * Devuelve resultados numéricos, veredicto y vectores para graficar.
 */
export function analizarEnlace(distKm, elev, p0 = {}) {
  const p = { ...PARAMETROS_DEFECTO, ...p0 };
  const n = elev.length;
  const x = elev.map((_, i) => (distKm * i) / (n - 1));

  const terrenoEf = elev.map((e, i) => {
    const extremo = i === 0 || i === n - 1;
    return e + abultamientoM(x[i], distKm - x[i], p.k) + (extremo ? 0 : p.obstaculosM);
  });
  const hA = elev[0] + p.hTorreA, hB = elev[n - 1] + p.hTorreB;
  const los = x.map((xi) => hA + ((hB - hA) * xi) / distKm);
  const r1 = x.map((xi) => radioFresnelM(xi, distKm - xi, p.fGhz));
  const holgura = los.map((l, i) => l - terrenoEf[i]);
  const despeje = holgura.map((h, i) => (r1[i] > 0 ? h / r1[i] : null));

  // peor punto (solo puntos interiores)
  let iPeor = 1;
  for (let i = 1; i < n - 1; i++) if (despeje[i] < despeje[iPeor]) iPeor = i;
  const despejeMin = despeje[iPeor];
  let losLibre = true, deficitMax = 0;
  for (let i = 1; i < n - 1; i++) {
    if (holgura[i] <= 0) losLibre = false;
    deficitMax = Math.max(deficitMax, p.despejeMin * r1[i] - holgura[i]);
  }
  const fresnelOk = despejeMin >= p.despejeMin - 1e-9;
  const alturaExtra = Math.ceil(deficitMax * 10) / 10; // redondeo a 0,1 m hacia arriba

  // difracción del peor obstáculo: v = √2 · h / r1, h = altura sobre la LOS
  const v = (Math.SQRT2 * -holgura[iPeor]) / r1[iPeor];
  const perdObs = perdidaFiloCuchilloDb(v);

  const fspl = fsplDb(distKm, p.fGhz * 1000);
  const pire = p.ptxDbm + p.gtxDbi - p.perdCablesDb / 2;
  const prx = p.ptxDbm + p.gtxDbi + p.grxDbi - fspl - p.perdCablesDb - perdObs;
  const margen = prx - p.sensDbm;
  const margenOk = margen >= p.margenMinDb;

  const obs = [];
  if (!losLibre) obs.push(`El terreno bloquea la línea de vista cerca del km ${x[iPeor].toFixed(2)}.`);
  else if (!fresnelOk)
    obs.push(`Solo el ${(despejeMin * 100).toFixed(0)} % de la 1.ª zona de Fresnel está libre en el km ${x[iPeor].toFixed(2)} (se requiere ${(p.despejeMin * 100).toFixed(0)} %).`);
  if (alturaExtra > 0)
    obs.push(`Subir ambas antenas ${alturaExtra.toFixed(1)} m (A = ${(p.hTorreA + alturaExtra).toFixed(1)} m, B = ${(p.hTorreB + alturaExtra).toFixed(1)} m) para cumplir el despeje.`);
  if (margen < 0) obs.push("La potencia recibida está por debajo de la sensibilidad del receptor.");
  else if (!margenOk)
    obs.push(`Margen de ${margen.toFixed(1)} dB, menor a los ${p.margenMinDb} dB recomendados: el enlace puede caerse con lluvia o interferencias.`);

  let veredicto;
  if (losLibre && fresnelOk && margenOk) veredicto = "VIABLE";
  else if (margen < 0 || (!losLibre && margen < p.margenMinDb)) veredicto = "NO VIABLE";
  else veredicto = "VIABLE CON OBSERVACIONES";

  return {
    distanciaKm: distKm, fsplDb: fspl, perdObstruccionDb: perdObs, prxDbm: prx, margenDb: margen,
    pireDbm: pire, despejeMinPct: despejeMin * 100, kmPeorPunto: x[iPeor], iPeor,
    losLibre, fresnelOk, margenOk, alturaExtraM: alturaExtra, veredicto, observaciones: obs,
    x, terreno: elev, terrenoEf, los, r1, despeje, params: p,
  };
}

/** Margen de desvanecimiento en espacio libre para varias frecuencias (comparativo) */
export function compararFrecuencias(distKm, p0, frecuencias = [2.4, 5.2, 5.8, 11, 18]) {
  const p = { ...PARAMETROS_DEFECTO, ...p0 };
  return frecuencias.map((f) => {
    const fspl = fsplDb(distKm, f * 1000);
    const prx = p.ptxDbm + p.gtxDbi + p.grxDbi - fspl - p.perdCablesDb;
    return { fGhz: f, fsplDb: fspl, prxDbm: prx, margenDb: prx - p.sensDbm, r1MaxM: radioFresnelM(distKm / 2, distKm / 2, f) };
  });
}

/* ======================================================================
 * REPETIDOR (tercera antena)
 * Si el enlace directo exige torres demasiado altas, se divide en dos saltos
 * A → R → B. Las torres A y B quedan con la altura elegida por el usuario y se
 * calcula la altura mínima de la torre R para que ambos saltos cumplan el despeje.
 * ====================================================================== */

/** Altura absoluta mínima (m s. n. m.) en el extremo final de un salto para que cumpla
 *  el despeje, con la antena inicial fija a hIniAbs. Para cada punto j del trayecto:
 *  la línea de vista pasa por (0, hIni) y (D, hFin) ⇒ hFin ≥ hIni + (necesario_j − hIni)·D/x_j */
export function alturaRequeridaFin(elev, dKm, hIniAbs, p) {
  const n = elev.length;
  let req = -Infinity;
  for (let j = 1; j < n - 1; j++) {
    const xj = (dKm * j) / (n - 1);
    const tef = elev[j] + abultamientoM(xj, dKm - xj, p.k) + p.obstaculosM;
    const necesario = tef + p.despejeMin * radioFresnelM(xj, dKm - xj, p.fGhz);
    req = Math.max(req, hIniAbs + ((necesario - hIniAbs) * dKm) / xj);
  }
  return req;
}

const RANGO = { "VIABLE": 0, "VIABLE CON OBSERVACIONES": 1, "NO VIABLE": 2 };

/** Diseña el repetidor dados los perfiles A→R (elev1) y R→B (elev2) */
export function disenarRepetidor(elev1, d1, elev2, d2, p0 = {}) {
  const p = { ...PARAMETROS_DEFECTO, ...p0 };
  const suelo = elev1[elev1.length - 1];
  const e2 = [suelo, ...elev2.slice(1)]; // mismo punto R en ambos perfiles
  const hA = elev1[0] + p.hTorreA, hB = e2[e2.length - 1] + p.hTorreB;
  const req1 = alturaRequeridaFin(elev1, d1, hA, p);
  const req2 = alturaRequeridaFin([...e2].reverse(), d2, hB, p);
  const hR = Math.max(6, Math.ceil(Math.max(req1, req2) - suelo)); // mástil mínimo de 6 m
  const salto1 = analizarEnlace(d1, elev1, { ...p, hTorreB: hR });
  const salto2 = analizarEnlace(d2, e2, { ...p, hTorreA: hR });
  const peor = RANGO[salto1.veredicto] >= RANGO[salto2.veredicto] ? salto1 : salto2;
  return { hR, sueloR: suelo, d1, d2, salto1, salto2, veredicto: peor.veredicto, realista: hR <= p.hMaxM };
}

/** Busca sobre el trayecto directo el punto donde el repetidor necesita la torre más baja */
export function buscarRepetidor(distKm, elev, p0 = {}) {
  const p = { ...PARAMETROS_DEFECTO, ...p0 };
  const n = elev.length;
  const hA = elev[0] + p.hTorreA, hB = elev[n - 1] + p.hTorreB;
  let mejor = null;
  for (let i = Math.ceil(0.08 * (n - 1)); i <= Math.floor(0.92 * (n - 1)); i++) {
    const d1 = (distKm * i) / (n - 1), d2 = distKm - d1;
    const e1 = elev.slice(0, i + 1), e2 = elev.slice(i);
    const req = Math.max(alturaRequeridaFin(e1, d1, hA, p), alturaRequeridaFin([...e2].reverse(), d2, hB, p));
    const hR = Math.max(6, req - elev[i]);
    const desequilibrio = Math.abs(d1 - d2) / distKm; // a igual altura, preferir saltos parecidos
    const puntaje = hR + 2 * desequilibrio;
    if (!mejor || puntaje < mejor.puntaje) mejor = { i, puntaje };
  }
  const i = mejor.i, d1 = (distKm * i) / (n - 1);
  return { indice: i, ...disenarRepetidor(elev.slice(0, i + 1), d1, elev.slice(i), distKm - d1, p) };
}
