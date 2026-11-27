// Lee el texto de la foto de una factura con Google Vision.
// La clave de Google está guardada en el servidor (GOOGLE_VISION_KEY) y nunca llega al móvil.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// La clave: primero la de los secretos de Edge Functions; si no, la guardada cifrada desde la app
async function claveServicio(nombre: string): Promise<string | null> {
  const env = Deno.env.get(nombre);
  if (env) return env;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await admin.rpc("leer_clave_servicio", { p_nombre: nombre });
  if (error) { console.error("clave:", error.message); return null; }
  return data || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "Sin sesión" }, 401);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: activo, error: eAct } = await sb.rpc("usuario_activo");
  if (eAct || !activo) return json({ error: "Usuario no autorizado" }, 403);

  const clave = await claveServicio("GOOGLE_VISION_KEY");
  if (!clave) return json({ error: "Falta la clave de Google. Un administrador puede ponerla en Más → Historial → Claves." }, 503);

  let imagen = "";
  try { imagen = String((await req.json())?.imagen ?? ""); } catch { /* cuerpo no válido */ }
  if (!imagen || imagen.length > 8_000_000 || !/^[A-Za-z0-9+/=]+$/.test(imagen)) return json({ error: "Imagen no válida o demasiado grande" }, 400);

  const r = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(clave)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests: [{ image: { content: imagen }, features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }] }] }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) {
    console.error("Vision:", r.status, data?.error?.message);
    return json({ error: "Google no ha podido leer la foto (" + (data?.error?.status || r.status) + ")" }, 502);
  }
  return json({ texto: data.responses?.[0]?.fullTextAnnotation?.text || "" });
});
