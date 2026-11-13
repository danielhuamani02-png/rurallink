/* app.js — Interfaz de RuralLink */
import { distanciaKm, azimut, analizarEnlace, compararFrecuencias, PARAMETROS_DEFECTO } from "./calculos.js";
import { obtenerPerfil } from "./terreno.js";
import { dibujarPerfil } from "./grafico.js";

const $ = (id) => document.getElementById(id);
const fmt = (v, d = 1) => v.toLocaleString("es-PE", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false });

const EJEMPLO = { A: [-12.048, -75.252], B: [-12.106, -75.184] };
const PRESETS = {
  "5g23": { fGhz: 5.8, ptxDbm: 25, gtxDbi: 23, grxDbi: 23, perdCablesDb: 2, sensDbm: -80 },
  "5g30": { fGhz: 5.8, ptxDbm: 25, gtxDbi: 30, grxDbi: 30, perdCablesDb: 2, sensDbm: -78 },
  "2g24": { fGhz: 2.4, ptxDbm: 23, gtxDbi: 24, grxDbi: 24, perdCablesDb: 2, sensDbm: -85 },
  "11g": { fGhz: 11, ptxDbm: 22, gtxDbi: 38, grxDbi: 38, perdCablesDb: 1, sensDbm: -75 },
};
const CAMPOS = ["fGhz", "ptxDbm", "gtxDbi", "grxDbi", "perdCablesDb", "sensDbm", "hTorreA", "hTorreB", "obstaculosM", "despejeMin", "margenMinDb", "k"];

const estado = { A: [...EJEMPLO.A], B: [...EJEMPLO.B], torre: "A", perfil: null, res: null };

/* ===================== MAPA ===================== */
const mapa = L.map("mapa", { zoomControl: true, attributionControl: true });
const capas = {
  "Topográfico": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: "© OpenStreetMap · © OpenTopoMap (CC-BY-SA)" }),
  "Satélite": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Imágenes © Esri, Maxar, Earthstar Geographics" }),
  "Calles": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }),
};
capas["Topográfico"].addTo(mapa);
L.control.layers(capas, null, { position: "topright" }).addTo(mapa);
L.control.scale({ imperial: false }).addTo(mapa);

const icono = (t) => L.divIcon({ className: "", html: `<div class="pin ${t.toLowerCase()}"><b>${t}</b></div>`, iconSize: [30, 30], iconAnchor: [15, 30] });
const mA = L.marker(estado.A, { draggable: true, icon: icono("A") }).addTo(mapa).bindTooltip("Torre A · nodo con internet");
const mB = L.marker(estado.B, { draggable: true, icon: icono("B") }).addTo(mapa).bindTooltip("Torre B · localidad");
const linea = L.polyline([estado.A, estado.B], { color: "#14273F", weight: 4, dashArray: "8 7" }).addTo(mapa);
const marcaPeor = L.circleMarker([0, 0], { radius: 7, color: "#fff", weight: 2, fillOpacity: 1 });

function actualizarGeometria(encuadrar = false) {
  mA.setLatLng(estado.A); mB.setLatLng(estado.B); linea.setLatLngs([estado.A, estado.B]);
  ["latA", "lonA", "latB", "lonB"].forEach((id, i) => { $(id).value = [estado.A[0], estado.A[1], estado.B[0], estado.B[1]][i].toFixed(5); });
  const d = distanciaKm(...estado.A, ...estado.B);
  $("chip-dist").textContent = `${fmt(d, 2)} km · ${fmt(azimut(...estado.A, ...estado.B), 0)}°`;
  if (encuadrar) mapa.fitBounds(L.latLngBounds([estado.A, estado.B]).pad(0.35));
}

function moverTorre(t, latlng) {
  estado[t] = [latlng.lat, latlng.lng];
  actualizarGeometria();
  if (estado.perfil) simularPronto();
}
mA.on("dragend", (e) => moverTorre("A", e.target.getLatLng()));
mB.on("dragend", (e) => moverTorre("B", e.target.getLatLng()));
mapa.on("click", (e) => {
  moverTorre(estado.torre, e.latlng);
  if (estado.torre === "A") elegirTorre("B");
});

function elegirTorre(t) {
  estado.torre = t;
  document.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("activo", b.dataset.torre === t));
}
document.querySelectorAll(".seg-btn").forEach((b) => b.addEventListener("click", () => elegirTorre(b.dataset.torre)));

["latA", "lonA", "latB", "lonB"].forEach((id) => $(id).addEventListener("change", () => {
  const v = ["latA", "lonA", "latB", "lonB"].map((k) => parseFloat($(k).value));
  if (v.some(Number.isNaN)) return;
  estado.A = [v[0], v[1]]; estado.B = [v[2], v[3]];
  actualizarGeometria(true);
  if (estado.perfil) simularPronto();
}));
$("btn-ejemplo").addEventListener("click", () => {
  estado.A = [...EJEMPLO.A]; estado.B = [...EJEMPLO.B]; actualizarGeometria(true);
  if (estado.perfil) simularPronto();
});

/* ===================== BÚSQUEDA DE LUGARES ===================== */
$("form-buscar").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("buscar").value.trim(); if (!q) return;
  const ul = $("sugerencias"); ul.innerHTML = "<li>Buscando…</li>"; ul.hidden = false;
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=es&countrycodes=pe&q=${encodeURIComponent(q)}`);
    const datos = await r.json();
    ul.innerHTML = datos.length ? "" : "<li>Sin resultados</li>";
    datos.forEach((d) => {
      const li = document.createElement("li"); li.textContent = d.display_name;
      li.onclick = () => { ul.hidden = true; mapa.setView([+d.lat, +d.lon], 13); aviso(`Ahora haz clic en el mapa para colocar la torre ${estado.torre}`); };
      ul.appendChild(li);
    });
  } catch { ul.innerHTML = "<li>No se pudo buscar (sin conexión)</li>"; }
});
document.addEventListener("click", (e) => { if (!e.target.closest(".search")) $("sugerencias").hidden = true; });

/* ===================== PARÁMETROS ===================== */
function leerParametros() {
  const p = {};
  CAMPOS.forEach((c) => { p[c] = parseFloat($(c).value); });
  return { ...PARAMETROS_DEFECTO, ...Object.fromEntries(Object.entries(p).filter(([, v]) => !Number.isNaN(v))) };
}
function escribirParametros(p) {
  CAMPOS.forEach((c) => {
    if (p[c] === undefined) return;
    if (c === "k") {
      const sel = $("k"); const opt = [...sel.options].find((o) => Math.abs(+o.value - p.k) < 0.01);
      if (opt) sel.value = opt.value; return;
    }
    $(c).value = p[c];
  });
  pintarSalidas();
}
function pintarSalidas() {
  $("o-hTorreA").textContent = `${$("hTorreA").value} m`;
  $("o-hTorreB").textContent = `${$("hTorreB").value} m`;
  $("o-obstaculosM").textContent = `${$("obstaculosM").value} m`;
  $("o-despejeMin").textContent = `${Math.round($("despejeMin").value * 100)} %`;
  $("o-margenMinDb").textContent = `${$("margenMinDb").value} dB`;
}
$("preset").addEventListener("change", (e) => { if (PRESETS[e.target.value]) { escribirParametros(PRESETS[e.target.value]); recalcular(); } });
CAMPOS.forEach((c) => $(c).addEventListener("input", () => {
  if (["fGhz", "ptxDbm", "gtxDbi", "grxDbi", "perdCablesDb", "sensDbm"].includes(c)) $("preset").value = "";
  pintarSalidas(); recalcular();
}));
$("demo").addEventListener("change", () => { if (estado.perfil) simular(); });

/* ===================== SIMULACIÓN ===================== */
let temporizador;
const simularPronto = () => { clearTimeout(temporizador); temporizador = setTimeout(simular, 700); };

async function simular() {
  const d = distanciaKm(...estado.A, ...estado.B);
  if (d < 0.05) { mostrarError("Las torres están demasiado cerca. Sepáralas en el mapa."); return; }
  $("btn-simular").disabled = true; $("vacio").hidden = true; $("error").hidden = true; $("cargando").hidden = false;
  try {
    const perfil = await obtenerPerfil(estado.A, estado.B, { demo: $("demo").checked });
    estado.perfil = { ...perfil, d };
    recalcular();
    guardarEnUrl();
  } catch (e) {
    mostrarError(`${e.message}\n\nActiva «Modo sin internet» para usar el terreno de demostración.`);
  } finally {
    $("btn-simular").disabled = false; $("cargando").hidden = true;
  }
}
$("btn-simular").addEventListener("click", simular);
$("btn-simular-2").addEventListener("click", simular);

function mostrarError(msg) { $("error").textContent = msg; $("error").hidden = false; $("cargando").hidden = true; }

function recalcular() {
  if (!estado.perfil) return;
  const p = leerParametros();
  const r = analizarEnlace(estado.perfil.d, estado.perfil.elev, p);
  estado.res = r;
  pintarResultados(r, p);
  guardarEnUrl();
}

const ICONOS = {
  ok: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warn: '<svg viewBox="0 0 24 24"><path d="M12 7v6M12 17h.01" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
  bad: '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
};

function pintarResultados(r, p) {
  $("resultados").hidden = false;
  const cls = { "VIABLE": "ok", "VIABLE CON OBSERVACIONES": "warn", "NO VIABLE": "bad" }[r.veredicto];
  $("veredicto").className = `verdict ${cls}`;
  $("v-icono").innerHTML = ICONOS[cls];
  $("v-titulo").textContent = { ok: "Enlace viable", warn: "Viable con observaciones", bad: "Enlace no viable" }[cls];
  $("v-obs").innerHTML = (r.observaciones.length ? r.observaciones : ["La línea de vista y la zona de Fresnel están despejadas y el margen es suficiente."])
    .map((o) => `<li>${o}</li>`).join("");
  $("v-fuente").textContent = `Perfil: ${estado.perfil.fuente} · ${r.x.length} puntos`;
  $("btn-aplicar").hidden = !(r.alturaExtraM > 0);

  const az = azimut(...estado.A, ...estado.B);
  $("k-dist").textContent = `${fmt(r.distanciaKm, 2)} km`;
  $("k-azi").textContent = `Azimut A→B ${fmt(az, 1)}° · B→A ${fmt((az + 180) % 360, 1)}°`;
  $("k-fspl").textContent = `${fmt(r.fsplDb, 1)} dB`;
  $("k-prx").textContent = `${fmt(r.prxDbm, 1)} dBm`;
  $("k-obs").textContent = r.perdObstruccionDb > 0.05 ? `Incluye ${fmt(r.perdObstruccionDb, 1)} dB por obstrucción` : "Sin pérdida por obstrucción";
  $("k-margen").textContent = `${fmt(r.margenDb, 1)} dB`;
  $("k-despeje").textContent = r.losLibre ? `${fmt(r.despejeMinPct, 0)} %` : "Bloqueado";
  medidor("m-margen", Math.max(0, Math.min(1, r.margenDb / 30)), r.margenOk ? "var(--ok)" : r.margenDb < 0 ? "var(--bad)" : "#C98A00");
  medidor("m-despeje", Math.max(0, Math.min(1, r.despejeMinPct / 100)), r.fresnelOk ? "var(--ok)" : r.losLibre ? "#C98A00" : "var(--bad)");

  dibujarPerfil($("grafico"), r);

  // marcador del peor punto en el mapa
  const pt = estado.perfil.pts[r.iPeor];
  marcaPeor.setLatLng(pt).setStyle({ fillColor: r.fresnelOk ? "#1E7B34" : "#B42318" }).addTo(mapa)
    .bindTooltip(`Peor punto · km ${fmt(r.kmPeorPunto, 2)} · ${r.losLibre ? fmt(r.despejeMinPct, 0) + " % de despeje" : "obstrucción"}`);

  const fila = (s, t, v, c = "") => `<tr class="${c}"><td>${s ? `<span class="sig ${s === "+" ? "pos" : "neg"}">${s}</span>` : '<span class="sig"></span>'}${t}</td><td>${v}</td></tr>`;
  $("t-presupuesto").innerHTML =
    fila("", "Potencia de transmisión", `${fmt(p.ptxDbm, 1)} dBm`) +
    fila("+", "Ganancia antena A", `${fmt(p.gtxDbi, 1)} dBi`) +
    fila("+", "Ganancia antena B", `${fmt(p.grxDbi, 1)} dBi`) +
    fila("−", "Pérdida en espacio libre", `${fmt(r.fsplDb, 2)} dB`) +
    fila("−", "Pérdidas en cables y conectores", `${fmt(p.perdCablesDb, 1)} dB`) +
    fila("−", "Pérdida por obstrucción (P.526)", `${fmt(r.perdObstruccionDb, 2)} dB`) +
    fila("=", "Potencia recibida", `${fmt(r.prxDbm, 2)} dBm`, "total") +
    fila("", "Sensibilidad del receptor", `${fmt(p.sensDbm, 1)} dBm`) +
    fila("", "Margen de desvanecimiento", `${fmt(r.margenDb, 2)} dB`, "total");
  $("t-geometria").innerHTML =
    fila("", "Altitud del suelo en A", `${fmt(r.terreno[0], 0)} m`) +
    fila("", "Altitud del suelo en B", `${fmt(r.terreno.at(-1), 0)} m`) +
    fila("", "Radio máximo de Fresnel", `${fmt(Math.max(...r.r1), 2)} m`) +
    fila("", "Peor punto del trayecto", `km ${fmt(r.kmPeorPunto, 2)}`) +
    fila("", "Línea de vista libre", r.losLibre ? "Sí" : "No") +
    fila("", "Altura extra recomendada", `${fmt(r.alturaExtraM, 1)} m`) +
    fila("", "PIRE (potencia radiada)", `${fmt(r.pireDbm, 1)} dBm`) +
    fila("", "Factor k", fmt(p.k, 2));

  const comp = compararFrecuencias(r.distanciaKm, p);
  const maxM = Math.max(...comp.map((c) => c.margenDb), 1);
  $("t-freq").innerHTML = "<tr><th>Frecuencia</th><th>FSPL</th><th>Prx</th><th>Margen</th><th style='width:30%'></th><th>Fresnel máx.</th></tr>" +
    comp.map((c) => `<tr class="${Math.abs(c.fGhz - p.fGhz) < 0.05 ? "actual" : ""}"><td>${fmt(c.fGhz, 1)} GHz</td><td>${fmt(c.fsplDb, 1)} dB</td><td>${fmt(c.prxDbm, 1)} dBm</td><td>${fmt(c.margenDb, 1)} dB</td>
      <td><div class="bar" style="width:${Math.max(0, c.margenDb) / maxM * 100}%;background:${c.margenDb >= p.margenMinDb ? "var(--ok)" : c.margenDb >= 0 ? "#C98A00" : "var(--bad)"}"></div></td><td>${fmt(c.r1MaxM, 1)} m</td></tr>`).join("");
}
function medidor(id, frac, color) { $(id).style.width = `${frac * 100}%`; $(id).style.background = color; }

$("btn-aplicar").addEventListener("click", () => {
  const r = estado.res; if (!r) return;
  const extra = Math.ceil(r.alturaExtraM);
  ["hTorreA", "hTorreB"].forEach((id) => { $(id).max = Math.max(+$(id).max, +$(id).value + extra); $(id).value = +$(id).value + extra; });
  pintarSalidas(); recalcular();
  aviso(`Torres elevadas ${extra} m`);
});

/* ===================== EXPORTAR / COMPARTIR ===================== */
function descargar(nombre, contenido, tipo) {
  const a = document.createElement("a");
  a.href = typeof contenido === "string" && contenido.startsWith("data:") ? contenido : URL.createObjectURL(new Blob([contenido], { type: tipo }));
  a.download = nombre; a.click();
}
$("btn-csv").addEventListener("click", () => {
  const r = estado.res; if (!r) return;
  const filas = ["km,lat,lon,elevacion_m,terreno_efectivo_m,linea_vista_m,radio_fresnel_m,despeje_pct"];
  r.x.forEach((x, i) => {
    const [la, lo] = estado.perfil.pts[i];
    filas.push([x.toFixed(3), la.toFixed(6), lo.toFixed(6), r.terreno[i].toFixed(1), r.terrenoEf[i].toFixed(1), r.los[i].toFixed(1), r.r1[i].toFixed(2), r.despeje[i] == null ? "" : (r.despeje[i] * 100).toFixed(1)].join(","));
  });
  descargar("rurallink_perfil.csv", "﻿" + filas.join("\n"), "text/csv;charset=utf-8");
});
$("btn-png").addEventListener("click", () => descargar("rurallink_perfil.png", $("grafico").toDataURL("image/png"), "image/png"));
$("btn-imprimir").addEventListener("click", () => window.print());

function guardarEnUrl() {
  const p = leerParametros();
  const q = new URLSearchParams({ a: estado.A.map((v) => v.toFixed(5)).join(","), b: estado.B.map((v) => v.toFixed(5)).join(",") });
  CAMPOS.forEach((c) => q.set(c, +p[c].toFixed(4)));
  if ($("demo").checked) q.set("demo", "1");
  history.replaceState(null, "", `#${q}`);
}
function cargarDeUrl() {
  const q = new URLSearchParams(location.hash.slice(1));
  if (!q.has("a") || !q.has("b")) return false;
  estado.A = q.get("a").split(",").map(Number); estado.B = q.get("b").split(",").map(Number);
  const p = {}; CAMPOS.forEach((c) => { if (q.has(c)) p[c] = +q.get(c); });
  escribirParametros(p); $("preset").value = "";
  $("demo").checked = q.get("demo") === "1";
  return true;
}
$("btn-compartir").addEventListener("click", async () => {
  guardarEnUrl();
  try { await navigator.clipboard.writeText(location.href); aviso("Enlace copiado: quien lo abra verá esta misma simulación"); }
  catch { aviso("Copia la dirección de la barra del navegador"); }
});

$("btn-teoria").addEventListener("click", () => $("dlg-teoria").showModal());

let tAviso;
function aviso(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(tAviso); tAviso = setTimeout(() => (t.hidden = true), 2800); }

/* ===================== INICIO ===================== */
escribirParametros({ ...PARAMETROS_DEFECTO, ...PRESETS["5g23"] });
const desdeUrl = cargarDeUrl();
actualizarGeometria(true);
if (desdeUrl) simular();
