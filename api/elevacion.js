// api/elevacion.js — Función de Vercel: consulta Open Topo Data (SRTM 30 m) desde el servidor.
// El API público de Open Topo Data no permite llamadas directas desde el navegador (CORS).
export default async function handler(req, res) {
  const locations = String(req.query.locations || "");
  const n = locations.split("|").length;
  if (!/^[-0-9.,|]+$/.test(locations) || n < 2 || n > 100) {
    return res.status(400).json({ status: "INVALID_REQUEST", error: "Envíe entre 2 y 100 puntos lat,lon separados por |" });
  }
  try {
    const r = await fetch(`https://api.opentopodata.org/v1/srtm30m?locations=${encodeURIComponent(locations)}`);
    const data = await r.json();
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    return res.status(r.status).json(data);
  } catch (e) {
    return res.status(502).json({ status: "SERVER_ERROR", error: "No se pudo consultar Open Topo Data" });
  }
}
