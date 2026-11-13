/* app.js — Interfaz de RuralLink */
import { distanciaKm, azimut, analizarEnlace, compararFrecuencias, buscarRepetidor, disenarRepetidor, PARAMETROS_DEFECTO } from "./calculos.js";
import { obtenerPerfil, elevaciones } from "./terreno.js";
import { dibujarPerfil, vistaDirecta, vistaRepetidor } from "./grafico.js";

const $ = (id) => document.getElementById(id);
const fmt = (v, d = 1) => v.toLocaleString("es-PE", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false });

const EJEMPLO = { A: [-12.048, -75.252], B: [-12.106, -75.184] };
const PRESETS = {
  "5g23": { fGhz: 5.8, ptxDbm: 25, gtxDbi: 23, grxDbi: 23, perdCablesDb: 2, sensDbm: -80 },
  "5g30": { fGhz: 5.8, ptxDbm: 25, gtxDbi: 30, grxDbi: 30, perdCablesDb: 2, sensDbm: -78 },
  "2g24": { fGhz: 2.4, ptxDbm: 23, gtxDbi: 24, grxDbi: 24, perdCablesDb: 2, sensDbm: -85 },
  "11g": { fGhz: 11, ptxDbm: 22, gtxDbi: 38, grxDbi: 38, perdCablesDb: 1, sensDbm: -75 },
};
const CAMPOS = ["fGhz", "ptxDbm", "gtxDbi", "grxDbi", "perdCablesDb", "sensDbm", "hTorreA", "hTorreB", "obstaculosM", "despejeMin", "margenMinDb", "hMaxM", "k"];

const estado = {
  A: [...EJEMPLO.A], B: [...EJEMPLO.B], torre: "A",
  perfil: null, res: null,
  rep: null,          // diseño del repetidor vigente
  repManual: null,    // { pos:[lat,lon], perfil1, perfil2 } si el usuario movió R
  verRep: false,      // mostrar la solución con repetidor
};

/* ===================== MAPA ===================== */
const mapa = L.map("mapa", { zoomControl: true, attributionControl: true });
const etiquetas = () => L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Nombres © Esri" });
const capas = {
  "Topográfico": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: "© OpenStreetMap · © OpenTopoMap (CC-BY-SA)" }),
  "Satélite con nombres": L.layerGroup([
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Imágenes © Esri, Maxar, Earthstar Geographics" }),
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, opacity: 0.7 }),
    etiquetas(),
  ]),
  "Calles": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }),
};
capas["Topográfico"].addTo(mapa);
L.control.layers(capas, null, { position: "topright" }).addTo(mapa);
L.control.scale({ imperial: false }).addTo(mapa);

const icono = (t) => L.divIcon({ className: "", html: `<div class="pin ${t.toLowerCase()}"><b>${t}</b></div>`, iconSize: [30, 30], iconAnchor: [15, 30] });
const mA = L.marker(estado.A, { draggable: true, icon: icono("A") }).addTo(mapa).bindTooltip("Torre A · nodo con internet");
const mB = L.marker(estado.B, { draggable: true, icon: icono("B") }).addTo(mapa).bindTooltip("Torre B · localidad");
const mR = L.marker([0, 0], { draggable: true, icon: icono("R") }).bindTooltip("Repetidor R · arrástralo a un cerro cercano");
const linea = L.polyline([estado.A, estado.B], { color: "#14273F", weight: 4, dashArray: "8 7" }).addTo(mapa);
const lineaRep = L.polyline([], { color: "#7C3AED", weight: 4 });
const marcaPeor = L.layerGroup().addTo(mapa);

function actualizarGeometria(encuadrar = false) {
  mA.setLatLng(estado.A); mB.setLatLng(estado.B); linea.setLatLngs([estado.A, estado.B]);
  ["latA", "lonA", "latB", "lonB"].forEach((id, i) => { $(id).value = [estado.A[0], estado.A[1], estado.B[0], estado.B[1]][i].toFixed(5); });
  const d = distanciaKm(...estado.A, ...estado.B);
  $("chip-dist").textContent = `${fmt(d, 2)} km · ${fmt(azimut(...estado.A, ...estado.B), 0)}°`;
  if (encuadrar) mapa.fitBounds(L.latLngBounds([estado.A, estado.B]).pad(0.35));
}

function moverTorre(t, latlng) {
  estado[t] = [latlng.lat, latlng.lng];
  estado.repManual = null;
  actualizarGeometria();
  if (estado.perfil) simularPronto();
}
mA.on("dragend", (e) => moverTorre("A", e.target.getLatLng()));
mB.on("dragend", (e) => moverTorre("B", e.target.getLatLng()));
mR.on("dragend", (e) => moverRepetidor(e.target.getLatLng()));
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
  estado.A = [v[0], v[1]]; estado.B = [v[2], v[3]]; estado.repManual = null;
  actualizarGeometria(true);
  if (estado.perfil) simularPronto();
}));
$("btn-ejemplo").addEventListener("click", () => {
  estado.A = [...EJEMPLO.A]; estado.B = [...EJEMPLO.B]; estado.repManual = null; actualizarGeometria(true);
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
    if (["hTorreA", "hTorreB"].includes(c) && p[c] > +$(c).max) $(c).max = Math.ceil(p[c]);
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
  $("o-hMaxM").textContent = `${$("hMaxM").value} m`;
}
$("preset").addEventListener("change", (e) => { if (PRESETS[e.target.value]) { escribirParametros(PRESETS[e.target.value]); recalcular(); } });
CAMPOS.forEach((c) => $(c).addEventListener("input", () => {
  if (["fGhz", "ptxDbm", "gtxDbi", "grxDbi", "perdCablesDb", "sensDbm"].includes(c)) $("preset").value = "";
  pintarSalidas(); recalcular();
}));
$("demo").addEventListener("change", () => { estado.repManual = null; if (estado.perfil) simular(); });

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
    if (!$("demo").checked && estado.rep && !estado.rep.realista && !estado.repManual) await buscarEnCerros();
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
  // repetidor: automático sobre el trayecto o en la posición que eligió el usuario
  if (estado.repManual) {
    const m = estado.repManual;
    estado.rep = { ...disenarRepetidor(m.perfil1.elev, m.d1, m.perfil2.elev, m.d2, p), pos: m.pos, origen: m.origen || "manual" };
  } else {
    const b = buscarRepetidor(estado.perfil.d, estado.perfil.elev, p);
    estado.rep = { ...b, pos: estado.perfil.pts[b.indice], origen: "trayecto" };
  }
  pintarResultados(r, p);
  guardarEnUrl();
}

/* ===================== REPETIDOR ===================== */
async function moverRepetidor(latlng) {
  let pos = [latlng.lat, latlng.lng];
  const demo = $("demo").checked;
  if (demo) { // sin internet: se proyecta sobre el trayecto del terreno de demostración
    const [a, b] = [estado.A, estado.B];
    const t = Math.max(0.08, Math.min(0.92, ((pos[0] - a[0]) * (b[0] - a[0]) + (pos[1] - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2)));
    const i = Math.round(t * (estado.perfil.elev.length - 1));
    pos = estado.perfil.pts[i];
    const e = estado.perfil.elev, d1 = estado.perfil.d * i / (e.length - 1);
    estado.repManual = { pos, d1, d2: estado.perfil.d - d1, perfil1: { elev: e.slice(0, i + 1) }, perfil2: { elev: e.slice(i) } };
    recalcular(); return;
  }
  $("cargando").hidden = false;
  try {
    const [p1, p2] = await Promise.all([obtenerPerfil(estado.A, pos), obtenerPerfil(pos, estado.B)]);
    estado.repManual = { pos, d1: distanciaKm(...estado.A, ...pos), d2: distanciaKm(...pos, ...estado.B), perfil1: p1, perfil2: p2, origen: "manual" };
    estado.verRep = true;
    recalcular();
    aviso("Repetidor recalculado con el terreno real");
  } catch (e) {
    mostrarError(e.message);
  } finally { $("cargando").hidden = true; }
}

/* Búsqueda del repetidor en cerros cercanos (no solo sobre la línea A–B):
 * 1) se consulta la elevación de una malla de puntos a ambos lados del trayecto,
 * 2) se eligen los 5 puntos más prominentes,
 * 3) para cada uno se descargan los perfiles A→R y R→B y se calcula la torre R necesaria,
 * 4) se queda la ubicación que necesita la torre más baja. */
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
async function buscarEnCerros() {
  const [A, B] = [estado.A, estado.B], d = estado.perfil.d, p = leerParametros();
  const kx = 111.32 * Math.cos((A[0] * Math.PI) / 180), ky = 110.57;
  const ux = ((B[1] - A[1]) * kx) / d, uy = ((B[0] - A[0]) * ky) / d; // dirección A→B (unitaria, en km)
  const ancho = Math.min(5, Math.max(1, d * 0.3));
  const cand = [];
  for (const t of [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8])
    for (const s of [-1, -0.75, -0.5, -0.25, 0.25, 0.5, 0.75, 1]) {
      const ex = t * d * ux - s * ancho * uy, ey = t * d * uy + s * ancho * ux;
      cand.push({ t, pos: [A[0] + ey / ky, A[1] + ex / kx] });
    }
  $("cargando").hidden = false;
  $("cargando").lastChild.textContent = "Buscando cerros cercanos para el repetidor…";
  try {
    const { elev } = await elevaciones(cand.map((c) => c.pos));
    const e0 = estado.perfil.elev[0], e1 = estado.perfil.elev.at(-1);
    cand.forEach((c, i) => { c.elev = elev[i]; c.prom = elev[i] - (e0 + (e1 - e0) * c.t); });
    const top = [];
    for (const c of [...cand].sort((a, b) => b.prom - a.prom)) {
      if (top.every((o) => Math.hypot(o.pos[0] - c.pos[0], o.pos[1] - c.pos[1]) > (ancho * 0.4) / ky)) top.push(c);
      if (top.length === 5) break;
    }
    let mejor = null;
    for (const c of top) {
      await espera(1100); // límite del API público: 1 consulta por segundo
      const p1 = await obtenerPerfil(A, c.pos);
      await espera(1100);
      const p2 = await obtenerPerfil(c.pos, B);
      const d1 = distanciaKm(...A, ...c.pos), d2 = distanciaKm(...c.pos, ...B);
      const dis = disenarRepetidor(p1.elev, d1, p2.elev, d2, p);
      if (!mejor || dis.hR < mejor.dis.hR) mejor = { c, p1, p2, d1, d2, dis };
    }
    if (mejor && mejor.dis.hR < estado.rep.hR) {
      estado.repManual = { pos: mejor.c.pos, d1: mejor.d1, d2: mejor.d2, perfil1: mejor.p1, perfil2: mejor.p2, origen: "cerro" };
      recalcular();
      aviso(`Repetidor ubicado en un cerro cercano: torre de ${estado.rep.hR} m`);
    }
  } catch (e) { console.warn("Búsqueda en cerros:", e.message); }
  finally { $("cargando").hidden = true; $("cargando").lastChild.textContent = "Descargando el perfil del terreno…"; }
}
$("btn-buscar-cerros").addEventListener("click", async () => { estado.repManual = null; recalcular(); await buscarEnCerros(); });

$("btn-repetidor").addEventListener("click", () => {
  estado.verRep = !estado.verRep; recalcular();
  if (estado.verRep) mapa.fitBounds(L.latLngBounds([estado.A, estado.B, estado.rep.pos]).pad(0.3));
});
$("btn-quitar-rep").addEventListener("click", () => { estado.verRep = false; recalcular(); });

/* ===================== RESULTADOS ===================== */
const ICONOS = {
  ok: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warn: '<svg viewBox="0 0 24 24"><path d="M12 7v6M12 17h.01" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
  bad: '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
};
const CLASE = { "VIABLE": "ok", "VIABLE CON OBSERVACIONES": "warn", "NO VIABLE": "bad" };
const pill = (v) => `<span class="pill ${CLASE[v]}">${{ ok: "Viable", warn: "Con observaciones", bad: "No viable" }[CLASE[v]]}</span>`;

function pintarResultados(r, p) {
  $("resultados").hidden = false;
  const rep = estado.rep, verRep = estado.verRep;

  // ---------- veredicto ----------
  const cls = verRep ? CLASE[rep.veredicto] : CLASE[r.veredicto];
  $("veredicto").className = `verdict ${cls}`;
  $("v-icono").innerHTML = ICONOS[cls];
  $("v-titulo").textContent = (verRep ? "Con repetidor: " : "") + { ok: "Enlace viable", warn: "Viable con observaciones", bad: "Enlace no viable" }[cls];
  let obs = verRep
    ? [`Repetidor R a ${fmt(rep.d1, 2)} km de A, con torre de ${rep.hR} m sobre un suelo de ${fmt(rep.sueloR, 0)} m s. n. m.`,
       ...rep.salto1.observaciones.filter((o) => !o.startsWith("Subir")).map((o) => "Salto A→R: " + o),
       ...rep.salto2.observaciones.filter((o) => !o.startsWith("Subir")).map((o) => "Salto R→B: " + o)]
    : r.observaciones;
  if (!obs.length) obs = ["La línea de vista y la zona de Fresnel están despejadas y el margen es suficiente."];
  $("v-obs").innerHTML = obs.map((o) => `<li>${o}</li>`).join("");
  $("v-fuente").textContent = `Perfil: ${estado.perfil.fuente} · ${r.x.length} puntos`;

  // ---------- opciones de solución ----------
  const hayProblema = r.alturaExtraM > 0 || !r.margenOk;
  $("opciones").hidden = !hayProblema && !verRep;
  if (hayProblema || verRep) pintarOpciones(r, p, rep);

  // ---------- KPIs (enlace directo) ----------
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

  // ---------- mapa y gráfico ----------
  marcaPeor.clearLayers();
  if (verRep) {
    mR.setLatLng(rep.pos).addTo(mapa);
    lineaRep.setLatLngs([estado.A, rep.pos, estado.B]).addTo(mapa);
    linea.setStyle({ opacity: 0.35 });
    $("titulo-grafico").textContent = "Perfil con repetidor: A → R → B";
    $("ley-rep").hidden = false;
    dibujarPerfil($("grafico"), vistaRepetidor(rep));
    pintarSaltos(rep);
  } else {
    mapa.removeLayer(mR); mapa.removeLayer(lineaRep); linea.setStyle({ opacity: 1 });
    $("titulo-grafico").textContent = "Perfil del trayecto directo A → B";
    $("ley-rep").hidden = true;
    dibujarPerfil($("grafico"), vistaDirecta(r));
    const pt = estado.perfil.pts[r.iPeor];
    L.circleMarker(pt, { radius: 7, color: "#fff", weight: 2, fillOpacity: 1, fillColor: r.fresnelOk ? "#1E7B34" : "#B42318" })
      .bindTooltip(`Peor punto · km ${fmt(r.kmPeorPunto, 2)} · ${r.losLibre ? fmt(r.despejeMinPct, 0) + " % de despeje" : "obstrucción"}`).addTo(marcaPeor);
  }
  $("card-saltos").hidden = !verRep;
  $("titulo-kpis").textContent = verRep ? "Comparación: enlace directo A → B (sin repetidor)" : "Enlace directo A → B";
  $("btn-repetidor").textContent = verRep ? "Ocultar repetidor" : "Ver solución con repetidor";
  $("btn-repetidor").classList.toggle("activo", verRep);

  // ---------- tablas ----------
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

function pintarOpciones(r, p, rep) {
  // Opción 1: elevar ambas torres en la misma cantidad
  const hA1 = p.hTorreA + r.alturaExtraM, hB1 = p.hTorreB + r.alturaExtraM;
  const r1 = analizarEnlace(r.distanciaKm, r.terreno, { ...p, hTorreA: hA1, hTorreB: hB1 });
  const op1Real = Math.max(hA1, hB1) <= p.hMaxM;
  const op1Ok = op1Real && r1.margenOk;
  // Opción 2: repetidor
  const op2Ok = rep.realista && rep.veredicto !== "NO VIABLE";
  // Recomendación: la opción realista; si ambas lo son, la más simple (sin equipos extra)
  const recomendada = op1Ok ? 1 : op2Ok ? 2 : 0;

  const dd = (t, v, c = "") => `<dt>${t}</dt><dd class="${c}">${v}</dd>`;
  $("op1-datos").innerHTML =
    dd("Torre A", `${fmt(hA1, 1)} m`, hA1 > p.hMaxM ? "malo" : "") +
    dd("Torre B", `${fmt(hB1, 1)} m`, hB1 > p.hMaxM ? "malo" : "") +
    dd("Margen", `${fmt(r1.margenDb, 1)} dB`, r1.margenOk ? "bueno" : "malo") +
    dd("Equipos de radio", "2");
  $("op2-datos").innerHTML =
    dd("Ubicación de R", `${fmt(rep.d1, 2)} km de A · ${{ trayecto: "sobre la línea A–B", cerro: "cerro cercano", manual: "elegida por ti" }[rep.origen]}`) +
    dd("Torre R", `${rep.hR} m`, rep.hR > p.hMaxM ? "malo" : "bueno") +
    dd("Torres A y B", `${fmt(p.hTorreA, 0)} m y ${fmt(p.hTorreB, 0)} m (sin cambios)`) +
    dd("Salto A → R", `${fmt(rep.d1, 2)} km · ${fmt(rep.salto1.margenDb, 1)} dB`, rep.salto1.margenOk ? "bueno" : "malo") +
    dd("Salto R → B", `${fmt(rep.d2, 2)} km · ${fmt(rep.salto2.margenDb, 1)} dB`, rep.salto2.margenOk ? "bueno" : "malo") +
    dd("Equipos de radio", "4 (2 enlaces)");

  const tag = (id, ok, real, n) => {
    const el = $(id);
    if (recomendada === n) { el.className = "tag ok"; el.textContent = "Recomendada"; }
    else if (!real) { el.className = "tag bad"; el.textContent = "Poco realista"; }
    else if (!ok) { el.className = "tag warn"; el.textContent = "Margen bajo"; }
    else { el.className = "tag warn"; el.textContent = "Alternativa"; }
  };
  tag("op1-tag", op1Ok, op1Real, 1);
  tag("op2-tag", op2Ok, rep.realista, 2);
  $("opt1").className = `opt ${recomendada === 1 ? "recomendada" : ""} ${op1Real ? "" : "irreal"}`;
  $("opt2").className = `opt ${recomendada === 2 ? "recomendada" : ""} ${rep.realista ? "" : "irreal"}`;

  $("op-resumen").innerHTML = recomendada === 1
    ? `Basta con elevar las torres hasta ${fmt(Math.max(hA1, hB1), 0)} m: es la solución más simple.`
    : recomendada === 2
      ? `Elevar las torres exigiría <b>${fmt(Math.max(hA1, hB1), 0)} m</b> (más de ${p.hMaxM} m, poco realista). Con un repetidor de <b>${rep.hR} m</b> el enlace funciona.`
      : `Ninguna opción cumple con torres de hasta ${p.hMaxM} m. Arrastra <b>R</b> a un cerro cercano, prueba otra frecuencia o considera dos repetidores.`;
}

function pintarSaltos(rep) {
  const fila = (nombre, s, d, desde, hasta) => `<tr><td><b>${nombre}</b></td><td>${fmt(d, 2)} km</td><td>${fmt(azimut(...desde, ...hasta), 1)}°</td><td>${fmt(s.fsplDb, 1)} dB</td><td>${fmt(s.prxDbm, 1)} dBm</td><td>${fmt(s.margenDb, 1)} dB</td><td>${s.losLibre ? fmt(s.despejeMinPct, 0) + " %" : "Bloqueado"}</td><td>${pill(s.veredicto)}</td></tr>`;
  $("t-saltos").innerHTML = "<tr><th>Salto</th><th>Distancia</th><th>Azimut</th><th>FSPL</th><th>Prx</th><th>Margen</th><th>Despeje</th><th>Estado</th></tr>" +
    fila("A → R", rep.salto1, rep.d1, estado.A, rep.pos) + fila("R → B", rep.salto2, rep.d2, rep.pos, estado.B) +
    `<tr><td colspan="8" class="muted">Altura de torres: A = ${fmt(rep.salto1.params.hTorreA, 0)} m · R = ${rep.hR} m · B = ${fmt(rep.salto2.params.hTorreB, 0)} m · R en ${rep.pos[0].toFixed(5)}, ${rep.pos[1].toFixed(5)}</td></tr>`;
}

function medidor(id, frac, color) { $(id).style.width = `${frac * 100}%`; $(id).style.background = color; }

$("btn-aplicar").addEventListener("click", () => {
  const r = estado.res; if (!r) return;
  const extra = Math.ceil(r.alturaExtraM);
  escribirParametros({ hTorreA: +$("hTorreA").value + extra, hTorreB: +$("hTorreB").value + extra });
  estado.verRep = false; estado.repManual = null; recalcular();
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
  const v = estado.verRep ? vistaRepetidor(estado.rep) : vistaDirecta(r);
  const filas = ["km,elevacion_m,terreno_efectivo_m,linea_vista_m,radio_fresnel_m,despeje_pct"];
  v.x.forEach((x, i) => filas.push([x.toFixed(3), v.terreno[i].toFixed(1), v.terrenoEf[i].toFixed(1), v.los[i].toFixed(1), v.r1[i].toFixed(2), v.despeje[i] == null ? "" : (v.despeje[i] * 100).toFixed(1)].join(",")));
  descargar(estado.verRep ? "rurallink_perfil_repetidor.csv" : "rurallink_perfil.csv", "﻿" + filas.join("\n"), "text/csv;charset=utf-8");
});
$("btn-png").addEventListener("click", () => descargar("rurallink_perfil.png", $("grafico").toDataURL("image/png"), "image/png"));
$("btn-imprimir").addEventListener("click", () => window.print());

function guardarEnUrl() {
  const p = leerParametros();
  const q = new URLSearchParams({ a: estado.A.map((v) => v.toFixed(5)).join(","), b: estado.B.map((v) => v.toFixed(5)).join(",") });
  CAMPOS.forEach((c) => q.set(c, +p[c].toFixed(4)));
  if ($("demo").checked) q.set("demo", "1");
  if (estado.verRep) q.set("rep", estado.repManual ? estado.repManual.pos.map((v) => v.toFixed(5)).join(",") : "auto");
  history.replaceState(null, "", `#${q}`);
}
async function cargarDeUrl() {
  const q = new URLSearchParams(location.hash.slice(1));
  if (!q.has("a") || !q.has("b")) return false;
  estado.A = q.get("a").split(",").map(Number); estado.B = q.get("b").split(",").map(Number);
  const p = {}; CAMPOS.forEach((c) => { if (q.has(c)) p[c] = +q.get(c); });
  escribirParametros(p); $("preset").value = "";
  $("demo").checked = q.get("demo") === "1";
  estado.verRep = q.has("rep");
  return q.get("rep");
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
const repUrl = await cargarDeUrl();
actualizarGeometria(true);
if (repUrl !== false) {
  await simular();
  if (repUrl && repUrl !== "auto") { const [la, lo] = repUrl.split(",").map(Number); await moverRepetidor({ lat: la, lng: lo }); }
}
