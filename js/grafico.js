/* grafico.js — Perfil del trayecto con Chart.js */
let chart = null;

const C = { navy: "#1F3A5F", navy5: "#3B5B85", terr: "#C3CFDC", terrLine: "#8696A8", gold: "rgba(242,201,76,0.38)", bad: "#B42318", ok: "#1E7B34" };

export function dibujarPerfil(canvas, r) {
  const { x, terreno, terrenoEf, los, r1, params: p } = r;
  const pts = (arr) => arr.map((y, i) => ({ x: x[i], y }));
  const minY = Math.min(...terreno, ...los.map((l, i) => l - r1[i])) - 15;
  const maxY = Math.max(...terrenoEf, ...los.map((l, i) => l + r1[i])) + 20;
  const d = x[x.length - 1];
  const malo = !r.fresnelOk;

  const data = {
    datasets: [
      { label: "Terreno + curvatura", data: pts(terrenoEf), borderColor: C.terrLine, borderWidth: 1, backgroundColor: C.terr, fill: "start", pointRadius: 0, tension: 0.25, order: 5 },
      { label: "_fres_inf", data: pts(los.map((l, i) => l - r1[i])), borderWidth: 0, pointRadius: 0, fill: false, order: 4 },
      { label: "1.ª zona de Fresnel", data: pts(los.map((l, i) => l + r1[i])), borderWidth: 0, pointRadius: 0, backgroundColor: C.gold, fill: "-1", order: 4 },
      { label: "Límite de despeje", data: pts(los.map((l, i) => l - p.despejeMin * r1[i])), borderColor: C.navy5, borderWidth: 1.3, borderDash: [6, 4], pointRadius: 0, fill: false, order: 3 },
      { label: "Línea de vista", data: pts(los), borderColor: C.navy, borderWidth: 2.4, pointRadius: 0, fill: false, order: 2 },
      { label: "Terreno real", data: pts(terreno), borderColor: "#6B7A8C", borderWidth: 1, borderDash: [2, 3], pointRadius: 0, fill: false, order: 1 },
      { label: "Torre A", data: [{ x: 0, y: terreno[0] }, { x: 0, y: terreno[0] + p.hTorreA }], borderColor: "#14273F", borderWidth: 5, pointRadius: [0, 5], pointBackgroundColor: "#14273F", fill: false, order: 0 },
      { label: "Torre B", data: [{ x: d, y: terreno.at(-1) }, { x: d, y: terreno.at(-1) + p.hTorreB }], borderColor: "#D9480F", borderWidth: 5, pointRadius: [0, 5], pointBackgroundColor: "#D9480F", fill: false, order: 0 },
      { label: "Peor punto", data: [{ x: x[r.iPeor], y: terrenoEf[r.iPeor] }], type: "scatter", pointRadius: 7, pointHoverRadius: 8, pointBackgroundColor: malo ? C.bad : C.ok, pointBorderColor: "#fff", pointBorderWidth: 2, order: -1 },
    ],
  };

  const opciones = {
    responsive: true, maintainAspectRatio: false, animation: { duration: 350 }, parsing: false, normalized: true,
    interaction: { mode: "index", intersect: false, axis: "x" },
    scales: {
      x: { type: "linear", min: 0, max: d, title: { display: true, text: "Distancia (km)", color: "#5B6676" }, grid: { color: "#EEF2F6" }, ticks: { color: "#5B6676" } },
      y: { min: Math.floor(minY / 10) * 10, max: Math.ceil(maxY / 10) * 10, title: { display: true, text: "Altitud (m s. n. m.)", color: "#5B6676" }, grid: { color: "#EEF2F6" }, ticks: { color: "#5B6676", callback: (v) => String(Math.round(v)) } },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        filter: (it) => it.datasetIndex === 0,
        backgroundColor: "rgba(14,29,48,.95)", padding: 10, titleFont: { weight: "700" },
        callbacks: {
          title: (its) => `km ${x[its[0].dataIndex].toFixed(2)}`,
          label: (it) => {
            const i = it.dataIndex;
            const dz = r.despeje[i];
            return [
              `Terreno: ${terreno[i].toFixed(0)} m`,
              `Línea de vista: ${los[i].toFixed(0)} m`,
              `Radio Fresnel: ${r1[i].toFixed(1)} m`,
              dz == null ? "Torre" : `Despeje: ${(dz * 100).toFixed(0)} %`,
            ];
          },
        },
      },
    },
  };

  if (chart) { chart.data = data; chart.options = opciones; chart.update(); }
  else chart = new Chart(canvas, { type: "line", data, options: opciones, plugins: [fondoBlanco] });
  return chart;
}

// fondo blanco para que el PNG exportado no salga transparente
const fondoBlanco = {
  id: "fondoBlanco",
  beforeDraw(c) { const { ctx } = c; ctx.save(); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.restore(); },
};
