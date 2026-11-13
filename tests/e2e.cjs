/**
 * Pruebas funcionales de extremo a extremo (E2E) de RuralLink con Playwright.
 * Se ejecutan sobre un servidor local (python -m http.server 8600) con datos de elevación
 * simulados, para que los resultados sean reproducibles.
 *   node tests/e2e.cjs  [carpeta-de-librerias]
 */
const { chromium } = require("playwright");
const fs = require("fs");
const LIB = process.argv[2] || "./node_modules/";
const URL0 = "http://localhost:8600/";
const resultados = [];
const ok = (id, nombre, cond, detalle = "") => { resultados.push({ id, nombre, ok: !!cond, detalle }); console.log(`${cond ? "PASA" : "FALLA"}  ${id} ${nombre} ${detalle}`); };

// Terreno sintético: domo ancho sobre el trayecto + cerro alto a un costado
const A = [-12.0, -75.0], B = [-12.0, -74.908];
const kx = 111.32 * Math.cos((12 * Math.PI) / 180), ky = 110.57;
const z = (lat, lon) => { const x = (lon - A[1]) * kx, y = (lat - A[0]) * ky;
  return 3000 + 150 * Math.exp(-(((x - 5) / 2.2) ** 2) - (y / 3) ** 2) + 420 * Math.exp(-(((x - 5) / 0.6) ** 2) - ((y - 2) / 0.6) ** 2); };

async function contexto(b, opts = {}) {
  const ctx = await b.newContext({ viewport: opts.viewport || { width: 1440, height: 1000 }, acceptDownloads: true });
  await ctx.route(/leaflet\.min\.js/, (r) => r.fulfill({ path: LIB + "leaflet/dist/leaflet.js", contentType: "application/javascript" }));
  await ctx.route(/leaflet\.min\.css/, (r) => r.fulfill({ path: LIB + "leaflet/dist/leaflet.css", contentType: "text/css" }));
  await ctx.route(/chart\.umd\.min\.js/, (r) => r.fulfill({ path: LIB + "chart.js/dist/chart.umd.js", contentType: "application/javascript" }));
  await ctx.route(/(tile|arcgisonline|fonts\.g)/, (r) => r.abort());
  const api = opts.api || "ok";
  ctx.llamadas = 0;
  await ctx.route(/\/api\/elevacion/, (r) => {
    ctx.llamadas++;
    if (api !== "ok") return r.fulfill({ status: 502, body: "{}" });
    const locs = new URL(r.request().url()).searchParams.get("locations").split("|").map((s) => s.split(",").map(Number));
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ status: "OK", results: locs.map(([la, lo]) => ({ elevation: z(la, lo) })) }) });
  });
  await ctx.route(/open-meteo\.com/, (r) => {
    if (api === "todo-caido") return r.abort();
    const u = new URL(r.request().url());
    const la = u.searchParams.get("latitude").split(",").map(Number), lo = u.searchParams.get("longitude").split(",").map(Number);
    r.fulfill({ contentType: "application/json", body: JSON.stringify({ elevation: la.map((v, i) => z(v, lo[i])) }) });
  });
  return ctx;
}
const txt = (p, id) => p.$eval("#" + id, (e) => e.innerText.replace(/\s+/g, " ").trim());
const visible = (p, id) => p.$eval("#" + id, (e) => !e.hidden);

(async () => {
  const b = await chromium.launch();
  let ctx = await contexto(b);
  let p = await ctx.newPage();
  const errores = []; p.on("pageerror", (e) => errores.push(e.message));

  // F01 — carga
  let t0 = Date.now();
  await p.goto(URL0); await p.waitForSelector("#btn-simular");
  ok("F01", "La aplicación carga sin errores de JavaScript", errores.length === 0, `(${Date.now() - t0} ms)`);

  // F02 — simulación en modo sin internet
  await p.click("label.toggle"); t0 = Date.now(); await p.click("#btn-simular");
  await p.waitForSelector("#resultados:not([hidden])");
  ok("F02", "Simulación en modo sin internet muestra el veredicto", (await txt(p, "v-titulo")).length > 0, `«${await txt(p, "v-titulo")}» (${Date.now() - t0} ms)`);

  // F03 — indicadores
  const kpis = await Promise.all(["k-dist", "k-fspl", "k-prx", "k-margen", "k-despeje"].map((k) => txt(p, k)));
  ok("F03", "Se muestran los 5 indicadores del enlace", kpis.every((v) => v && v !== "—"), kpis.join(" | "));

  // F04 — gráfico
  const lienzo = await p.$eval("#grafico", (c) => [c.width, c.height]);
  ok("F04", "El gráfico del perfil se dibuja", lienzo[0] > 300 && lienzo[1] > 200, `${lienzo[0]}×${lienzo[1]} px`);

  // F05 — recálculo en vivo al mover la altura
  const antes = await txt(p, "k-margen");
  await p.$eval("#hTorreA", (e) => { e.value = 60; e.dispatchEvent(new Event("input")); });
  await p.$eval("#hTorreB", (e) => { e.value = 60; e.dispatchEvent(new Event("input")); });
  const despues = await txt(p, "k-margen");
  ok("F05", "Al cambiar la altura de las torres el resultado se recalcula", antes !== despues, `${antes} → ${despues}`);
  await p.$eval("#hTorreA", (e) => { e.value = 20; e.dispatchEvent(new Event("input")); });
  await p.$eval("#hTorreB", (e) => { e.value = 20; e.dispatchEvent(new Event("input")); });

  // F06 — opciones de solución
  ok("F06", "Si el enlace no es viable aparecen las dos soluciones", await visible(p, "opciones"), await txt(p, "op-resumen"));

  // F07 — altura máxima práctica cambia la recomendación
  const tag60 = await txt(p, "op1-tag");
  await p.$eval("#hMaxM", (e) => { e.value = 40; e.dispatchEvent(new Event("input")); });
  const tag40 = await txt(p, "op1-tag");
  ok("F07", "La altura máxima práctica cambia la recomendación", tag60 !== tag40, `opción 1: ${tag60} → ${tag40}`);

  // F08 — repetidor
  await p.click("#btn-repetidor"); await p.waitForTimeout(400);
  ok("F08", "La vista con repetidor muestra la tabla de saltos y el marcador R",
    (await visible(p, "card-saltos")) && (await p.$$(".pin.r")).length === 1, await txt(p, "v-titulo"));

  // F09 — compartir
  const url = await p.evaluate(() => location.href);
  const p2 = await ctx.newPage(); await p2.goto(url); await p2.waitForSelector("#card-saltos:not([hidden])", { timeout: 8000 });
  ok("F09", "El enlace compartido reproduce la misma simulación (con repetidor)", (await txt(p2, "v-titulo")) === (await txt(p, "v-titulo")), url.length + " caracteres");
  await p2.close();

  // F10 — aplicar alturas
  await p.$eval("#hMaxM", (e) => { e.value = 60; e.dispatchEvent(new Event("input")); });
  await p.click("#btn-aplicar"); await p.waitForTimeout(300);
  ok("F10", "«Aplicar estas alturas» vuelve viable el enlace directo", (await txt(p, "v-titulo")) === "Enlace viable", `torres = ${await p.inputValue("#hTorreA")} m`);

  // F11 / F12 — exportar
  let [dl] = await Promise.all([p.waitForEvent("download"), p.click("#btn-csv")]);
  const csv = fs.readFileSync(await dl.path(), "utf8").trim().split("\n");
  ok("F11", "Exporta el perfil en CSV", csv.length === 101 && csv[0].includes("radio_fresnel_m"), `${csv.length - 1} filas`);
  [dl] = await Promise.all([p.waitForEvent("download"), p.click("#btn-png")]);
  const png = fs.statSync(await dl.path()).size;
  ok("F12", "Exporta el gráfico en PNG", png > 10000, `${Math.round(png / 1024)} KB`);

  // F13 — configuraciones rápidas
  await p.selectOption("#preset", "2g24");
  ok("F13", "La configuración rápida cambia los parámetros del equipo", (await p.inputValue("#fGhz")) === "2.4" && (await p.inputValue("#gtxDbi")) === "24");

  // F14 — comparación de frecuencias
  const filas = await p.$$eval("#t-freq tr", (t) => t.length);
  ok("F14", "La comparación de frecuencias muestra 5 bandas y resalta la actual", filas === 6 && (await p.$$("#t-freq tr.actual")).length === 1);

  // F15 — diálogo
  await p.click("#btn-teoria");
  ok("F15", "El diálogo «Fundamento» muestra las 5 ecuaciones", (await p.$$eval("dialog[open] .eqs > div", (d) => d.length)) === 5);
  await p.keyboard.press("Escape");

  // F16 — validación de entrada
  await p.fill("#latB", "-12.04800"); await p.fill("#lonB", "-75.25200"); await p.$eval("#lonB", (e) => e.dispatchEvent(new Event("change")));
  await p.click("#btn-simular"); await p.waitForTimeout(300);
  ok("F16", "Rechaza torres demasiado cercanas", (await visible(p, "error")) && (await txt(p, "error")).includes("demasiado cerca"));
  await ctx.close();

  // F17 — búsqueda en cerros cercanos (terreno sintético con API simulada)
  ctx = await contexto(b); p = await ctx.newPage();
  await p.goto(`${URL0}#a=${A.join(",")}&b=${B.join(",")}&hTorreA=15&hTorreB=15&hMaxM=40`);
  await p.waitForSelector("#resultados:not([hidden])"); await p.waitForFunction(() => document.getElementById("cargando").hidden);
  const enLinea = await txt(p, "op2-datos");
  t0 = Date.now(); await p.click("#btn-buscar-cerros"); await p.waitForTimeout(300);
  await p.waitForFunction(() => document.getElementById("cargando").hidden, null, { timeout: 60000 });
  const enCerro = await txt(p, "op2-datos");
  const hR = (s) => +s.match(/Torre R (\d+) m/)[1];
  ok("F17", "La búsqueda en cerros encuentra una ubicación con torre más baja", enCerro.includes("cerro cercano") && hR(enCerro) < hR(enLinea),
    `R: ${hR(enLinea)} m (línea A–B) → ${hR(enCerro)} m (cerro) · ${ctx.llamadas} consultas · ${Math.round((Date.now() - t0) / 1000)} s`);
  await ctx.close();

  // F18 — respaldo de la fuente de elevación
  ctx = await contexto(b, { api: "srtm-caido" }); p = await ctx.newPage();
  await p.goto(`${URL0}#a=${A.join(",")}&b=${B.join(",")}`); await p.waitForSelector("#resultados:not([hidden])");
  ok("F18", "Si Open Topo Data falla, usa Open-Meteo como respaldo", (await txt(p, "v-fuente")).includes("Open-Meteo"), await txt(p, "v-fuente"));
  await ctx.close();

  // F19 — sin conexión a ninguna fuente
  ctx = await contexto(b, { api: "todo-caido" }); p = await ctx.newPage();
  await p.goto(URL0); await p.click("#btn-simular"); await p.waitForSelector("#error:not([hidden])", { timeout: 30000 });
  ok("F19", "Sin conexión muestra un mensaje claro y sugiere el modo sin internet", (await txt(p, "error")).includes("Modo sin internet"));
  await ctx.close();

  // F20 — celular
  ctx = await contexto(b, { viewport: { width: 390, height: 844 } }); p = await ctx.newPage();
  await p.goto(URL0 + "#a=-12.048,-75.252&b=-12.106,-75.184&demo=1"); await p.waitForSelector("#resultados:not([hidden])");
  const ancho = await p.evaluate(() => document.documentElement.scrollWidth);
  ok("F20", "Diseño adaptable: en un celular de 390 px no hay desplazamiento horizontal", ancho <= 390, `ancho del documento = ${ancho} px`);
  await p.screenshot({ path: "e2e_movil.png", fullPage: false });
  await ctx.close();

  await b.close();
  fs.writeFileSync("e2e_resultados.json", JSON.stringify(resultados, null, 2));
  const n = resultados.filter((r) => r.ok).length;
  console.log(`\n${n}/${resultados.length} pruebas superadas`);
})();
