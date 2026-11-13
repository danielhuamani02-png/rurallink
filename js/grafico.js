/* grafico.js — Perfil del trayecto con Chart.js (enlace directo o con repetidor) */
let chart = null;

const C = { navy: "#1F3A5F", navy5: "#3B5B85", terr: "#C3CFDC", terrLine: "#8696A8", gold: "rgba(242,201,76,0.38)", bad: "#B42318", ok: "#1E7B34" };

/** Convierte el resultado de un enlace directo en una "vista" para graficar */
export function vistaDirecta(r) {
  const n = r.x.length;
  return {
    x: r.x, terreno: r.terreno, terrenoEf: r.terrenoEf, los: r.los, r1: r.r1, despeje: r.despeje,
    despejeMin: r.params.despejeMin,
    torres: [
      { x: 0, base: r.terreno[0], h: r.params.hTorreA, color: "#14273F" },
      { x: r.x[n - 1], base: r.terreno[n - 1], h: r.params.hTorreB, color: "#D9480F" },
    ],
    peores: [{ x: r.x[r.iPeor], y: r.terrenoEf[r.iPeor], ok: r.fresnelOk }],
  };
}

/** Une los dos saltos A→R y R→B en una sola vista continua */
export function vistaRepetidor(rep) {
  const s1 = rep.salto1, s2 = rep.salto2, d1 = rep.d1;
  const pega = (a, b) => a.concat(b.slice(1));
  return {
    x: pega(s1.x, s2.x.map((v) => v + d1)),
    terreno: pega(s1.terreno, s2.terreno), terrenoEf: pega(s1.terrenoEf, s2.terrenoEf),
    los: pega(s1.los, s2.los), r1: pega(s1.r1, s2.r1), despeje: pega(s1.despeje, s2.despeje),
    despejeMin: s1.params.despejeMin,
    torres: [
      { x: 0, base: s1.terreno[0], h: s1.params.hTorreA, color: "#14273F" },
      { x: d1, base: rep.sueloR, h: rep.hR, color: "#7C3AED" },
      { x: d1 + rep.d2, base: s2.terreno.at(-1), h: s2.params.hTorreB, color: "#D9480F" },
    ],
    peores: [
      { x: s1.x[s1.iPeor], y: s1.terrenoEf[s1.iPeor], ok: s1.fresnelOk },
      { x: d1 + s2.x[s2.iPeor], y: s2.terrenoEf[s2.iPeor], ok: s2.fresnelOk },
    ],
  };
}

export function dibujarPerfil(canvas, v) {
  const { x, terreno, terrenoEf, los, r1 } = v;
  const pts = (arr) => arr.map((y, i) => ({ x: x[i], y }));
  const topes = v.torres.map((t) => t.base + t.h);
  const minY = Math.min(...terreno, ...los.map((l, i) => l - r1[i])) - 15;
  const maxY = Math.max(...terrenoEf, ...topes, ...los.map((l, i) => l + r1[i])) + 20;
  const d = x[x.length - 1];

  const datasets = [
    { label: "Terreno + curvatura", data: pts(terrenoEf), borderColor: C.terrLine, borderWidth: 1, backgroundColor: C.terr, fill: "start", pointRadius: 0, tension: 0.25, order: 5 },
    { label: "_fres_inf", data: pts(los.map((l, i) => l - r1[i])), borderWidth: 0, pointRadius: 0, fill: false, order: 4 },
    { label: "1.ª zona de Fresnel", data: pts(los.map((l, i) => l + r1[i])), borderWidth: 0, pointRadius: 0, backgroundColor: C.gold, fill: "-1", order: 4 },
    { label: "Límite de despeje", data: pts(los.map((l, i) => l - v.despejeMin * r1[i])), borderColor: C.navy5, borderWidth: 1.3, borderDash: [6, 4], pointRadius: 0, fill: false, order: 3 },
    { label: "Línea de vista", data: pts(los), borderColor: C.navy, borderWidth: 2.4, pointRadius: 0, fill: false, order: 2 },
    { label: "Terreno real", data: pts(terreno), borderColor: "#6B7A8C", borderWidth: 1, borderDash: [2, 3], pointRadius: 0, fill: false, order: 1 },
    ...v.torres.map((t) => ({ label: "Torre", data: [{ x: t.x, y: t.base }, { x: t.x, y: t.base + t.h }], borderColor: t.color, borderWidth: 5, pointRadius: [0, 5], pointBackgroundColor: t.color, fill: false, order: 0 })),
    { label: "Peor punto", data: v.peores.map((q) => ({ x: q.x, y: q.y })), type: "scatter", pointRadius: 7, pointHoverRadius: 8, pointBackgroundColor: v.peores.map((q) => (q.ok ? C.ok : C.bad)), pointBorderColor: "#fff", pointBorderWidth: 2, order: -1 },
  ];

  const opciones = {
    responsive: true, maintainAspectRatio: false, animation: { duration: 350 }, parsing: false, normalized: true,
    interaction: { mode: "index", intersect: false, axis: "x" },
    scales: {
      x: { type: "linear", min: 0, max: d, title: { display: true, text: "Distancia desde A (km)", color: "#5B6676" }, grid: { color: "#EEF2F6" }, ticks: { color: "#5B6676" } },
      y: { min: Math.floor(minY / 10) * 10, max: Math.ceil(maxY / 10) * 10, title: { display: true, text: "Altitud (m s. n. m.)", color: "#5B6676" }, grid: { color: "#EEF2F6" }, ticks: { color: "#5B6676", callback: (val) => String(Math.round(val)) } },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        filter: (it) => it.datasetIndex === 0,
        backgroundColor: "rgba(14,29,48,.95)", padding: 10, titleFont: { weight: "700" },
        callbacks: {
          title: (its) => `km ${x[its[0].dataIndex].toFixed(2)}`,
          label: (it) => {
            const i = it.dataIndex, dz = v.despeje[i];
            return [`Terreno: ${terreno[i].toFixed(0)} m`, `Línea de vista: ${los[i].toFixed(0)} m`,
              `Radio Fresnel: ${r1[i].toFixed(1)} m`, dz == null ? "Torre" : `Despeje: ${(dz * 100).toFixed(0)} %`];
          },
        },
      },
    },
  };

  if (chart) { chart.data = { datasets }; chart.options = opciones; chart.update(); }
  else chart = new Chart(canvas, { type: "line", data: { datasets }, options: opciones, plugins: [fondoBlanco] });
  return chart;
}

// fondo blanco para que el PNG exportado no salga transparente
const fondoBlanco = {
  id: "fondoBlanco",
  beforeDraw(c) { const { ctx } = c; ctx.save(); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.restore(); },
};
