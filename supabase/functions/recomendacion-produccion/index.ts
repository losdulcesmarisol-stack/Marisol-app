// Recomendación de producción para el próximo día de reparto.
// 1) Siempre: cálculo con los datos reales (encargos ya apuntados + lo que se suele
//    vender en mostrador ese día de la semana + lo que se hizo y sobró esos días).
// 2) Si el servidor tiene la clave ANTHROPIC_API_KEY: un consejo escrito por Claude.
// Todas las consultas van con el usuario que llama, así que las reglas de seguridad
// (solo usuarios activos) se aplican igual que en la app. La clave nunca sale del servidor.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import Anthropic from "npm:@anthropic-ai/sdk";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function ahoraMadrid() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false })
    .formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) % 24 };
}
const sumarDias = (f: string, n: number) => { const d = new Date(f + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const num = (v: unknown) => Number(String(v ?? "").replace(",", ".")) || 0;
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "Sin sesión" }, 401);

  let condicion = "";
  try { condicion = String((await req.json())?.condicion ?? "").slice(0, 300); } catch { /* sin cuerpo */ }

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: activo, error: eAct } = await sb.rpc("usuario_activo");
  if (eAct || !activo) return json({ error: "Usuario no autorizado" }, 403);

  // Día de reparto: hasta las 10:00 el de hoy; después, el de mañana (igual que la app)
  const { fecha: hoy, hora } = ahoraMadrid();
  const objetivo = hora >= 10 ? sumarDias(hoy, 1) : hoy;
  const mismosDias = [1, 2, 3, 4].map((s) => sumarDias(objetivo, -7 * s)); // mismo día de la semana, 4 semanas

  const [prods, encargos, mostrador, produccion, historial] = await Promise.all([
    sb.from("productos").select("id, nombre, icono").eq("activo", true),
    sb.from("comandas").select("items").eq("fecha_entrega", objetivo).eq("estado", "pendiente"),
    sb.from("ventas").select("fecha_entrega, items").is("cliente_id", null).in("fecha_entrega", mismosDias),
    sb.from("produccion_diaria").select("fecha, condicion, productos").in("fecha", mismosDias),
    sb.from("produccion_diaria").select("fecha, condicion, productos").gte("fecha", sumarDias(hoy, -35)).order("fecha"),
  ]);
  const err = [prods, encargos, mostrador, produccion, historial].find((r) => r.error)?.error;
  if (err) return json({ error: err.message }, 500);

  type Fila = { id: string; nombre: string; icono: string; encargos: number; mostrador: number; hecho: number; sobrante: number; recomendado: number };
  const filas = new Map<string, Fila>();
  const fila = (id: string, nombre: string, icono = "") => {
    if (!filas.has(id)) filas.set(id, { id, nombre, icono, encargos: 0, mostrador: 0, hecho: 0, sobrante: 0, recomendado: 0 });
    return filas.get(id)!;
  };
  for (const p of prods.data!) fila(p.id, p.nombre, p.icono ?? "");
  for (const c of encargos.data!) for (const i of c.items ?? []) if (filas.has(i.prodId)) filas.get(i.prodId)!.encargos += num(i.qty);
  const diasMostrador = new Set(mostrador.data!.map((v) => v.fecha_entrega)).size || 1;
  for (const v of mostrador.data!) for (const i of v.items ?? []) if (filas.has(i.prodId)) filas.get(i.prodId)!.mostrador += num(i.qty) / diasMostrador;
  const diasProd = produccion.data!.length || 1;
  for (const d of produccion.data!) for (const i of d.productos ?? []) if (filas.has(i.prodId)) {
    const f = filas.get(i.prodId)!; f.hecho += num(i.cocidas) / diasProd; f.sobrante += num(i.mermas) / diasProd;
  }
  const lista = [...filas.values()].map((f) => ({
    ...f,
    mostrador: Math.round(f.mostrador * 10) / 10,
    hecho: Math.round(f.hecho * 10) / 10,
    sobrante: Math.round(f.sobrante * 10) / 10,
    recomendado: Math.ceil(f.encargos + f.mostrador),
  })).filter((f) => f.encargos || f.mostrador || f.hecho).sort((a, b) => b.recomendado - a.recomendado);

  const dia = DIAS[new Date(objetivo + "T12:00:00Z").getUTCDay()];
  const respuesta: Record<string, unknown> = { objetivo, dia, semanas: mismosDias.length, filas: lista, consejo: null, consejoMotivo: null };

  const clave = Deno.env.get("ANTHROPIC_API_KEY");
  if (!clave) { respuesta.consejoMotivo = "sin_clave"; return json(respuesta); }

  try {
    const client = new Anthropic({ apiKey: clave });
    const datos = {
      dia_de_reparto: `${dia} ${objetivo}`,
      condiciones_previstas: condicion || "no indicadas",
      calculo_por_producto: lista.map(({ nombre, encargos, mostrador, hecho, sobrante, recomendado }) => ({ nombre, encargos_ya_apuntados: encargos, mostrador_medio_este_dia: mostrador, horneado_medio_este_dia: hecho, sobrante_medio_este_dia: sobrante, recomendado_calculado: recomendado })),
      produccion_ultimas_5_semanas: historial.data!.map((d) => ({ fecha: d.fecha, condicion: d.condicion, productos: (d.productos ?? []).filter((p: Record<string, unknown>) => num(p.cocidas) || num(p.mermas)).map((p: Record<string, unknown>) => ({ nombre: p.nombre, cocidas: num(p.cocidas), mermas: num(p.mermas) })) })),
    };
    const r = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: "Eres el asesor de producción de Productos MariSol, una panadería artesana de un pueblo de Cuenca. Hablas con la dueña en español de España, sencillo y directo, sin tecnicismos ni tablas. Te dan un cálculo hecho con sus datos reales. Tu trabajo es revisarlo con sentido común: ajusta solo los productos donde las condiciones previstas, la tendencia reciente o los sobrantes lo justifiquen, y di por qué en pocas palabras. No inventes datos que no estén. Responde con como mucho 8 frases cortas o viñetas.",
      messages: [{ role: "user", content: `Datos para la producción del próximo reparto:\n${JSON.stringify(datos)}` }],
    } as never) as unknown as { stop_reason: string; content: { type: string; text?: string }[] };
    if (r.stop_reason === "refusal") respuesta.consejoMotivo = "rechazo";
    else respuesta.consejo = r.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim() || null;
  } catch (e) {
    console.error("IA:", e instanceof Error ? e.message : e);
    respuesta.consejoMotivo = "error_ia";
  }
  return json(respuesta);
});
