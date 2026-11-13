/**
 * terreno.js — Perfil de elevación entre dos puntos.
 * Fuentes: 1) Open Topo Data (SRTM 30 m)  2) Open-Meteo (Copernicus DEM 90 m)  3) Demostración offline
 */
import { puntosIntermedios } from "./calculos.js";

export const N_PUNTOS = 100; // ambas APIs aceptan hasta 100 coordenadas por consulta
const cache = new Map();

async function conTiempo(url, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function openTopoData(pts) {
  const locs = pts.map(([a, o]) => `${a.toFixed(6)},${o.toFixed(6)}`).join("|");
  // vía la función /api/elevacion de Vercel (el API público no admite CORS desde el navegador)
  const d = await conTiempo(`/api/elevacion?locations=${encodeURIComponent(locs)}`);
  if (d.status !== "OK") throw new Error(d.error || "respuesta no válida");
  const e = d.results.map((r) => r.elevation);
  if (e.some((v) => v == null)) throw new Error("puntos sin datos");
  return e;
}

async function openMeteo(pts) {
  const lat = pts.map((p) => p[0].toFixed(6)).join(",");
  const lon = pts.map((p) => p[1].toFixed(6)).join(",");
  const d = await conTiempo(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
  if (!Array.isArray(d.elevation)) throw new Error("respuesta no válida");
  return d.elevation;
}

/** Perfil andino sintético (cerros y quebrada) para practicar sin conexión */
export function terrenoDemo(n = N_PUNTOS) {
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 12;
  const raw = Array.from({ length: n }, (_, i) => {
    const x = i / (n - 1);
    return 3150 + 35 * Math.sin(2 * Math.PI * x * 1.3) + 20 * Math.sin(2 * Math.PI * x * 3.7 + 1)
      + 95 * Math.exp(-(((x - 0.62) / 0.07) ** 2)) - 80 * Math.exp(-(((x - 0.35) / 0.06) ** 2)) + rnd();
  });
  return raw.map((_, i) => { // suavizado
    const w = raw.slice(Math.max(0, i - 2), i + 3);
    return w.reduce((a, b) => a + b, 0) / w.length;
  });
}

export async function obtenerPerfil(A, B, { demo = false } = {}) {
  const pts = puntosIntermedios(A[0], A[1], B[0], B[1], N_PUNTOS);
  if (demo) return { elev: terrenoDemo(), fuente: "Terreno de demostración (sin conexión)", pts };
  const clave = pts[0].concat(pts[N_PUNTOS - 1]).map((v) => v.toFixed(5)).join(",");
  if (cache.has(clave)) return cache.get(clave);
  const errores = [];
  for (const [nombre, fn] of [["Open Topo Data · SRTM 30 m", openTopoData], ["Open-Meteo · Copernicus DEM 90 m", openMeteo]]) {
    try {
      const res = { elev: await fn(pts), fuente: nombre, pts };
      cache.set(clave, res);
      return res;
    } catch (e) { errores.push(`${nombre}: ${e.message}`); }
  }
  throw new Error("No se pudo descargar la elevación del terreno.\n" + errores.join("\n"));
}
