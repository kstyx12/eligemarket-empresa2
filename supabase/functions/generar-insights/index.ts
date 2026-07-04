// supabase/functions/generar-insights/index.ts
// Edge Function (Deno) que recibe estadísticas agregadas del negocio y devuelve
// un diagnóstico narrativo generado por Claude. La API key vive como secreto
// en Supabase (ANTHROPIC_API_KEY) y NUNCA se expone al navegador.
//
// Usa fetch directo al endpoint de la API de Anthropic (no depende de versión de SDK).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const SYSTEM_PROMPT = `Eres un analista comercial experto que asesora a un distribuidor mayorista de
abarrotes y bebidas en Chile (marca "EligeMarket"). Tu trabajo es leer las
estadísticas YA AGREGADAS de ventas que te entrega la aplicación y escribir un
diagnóstico claro, concreto y accionable para el dueño/administrador.

Reglas:
- Escribe en español de Chile, tono profesional pero cercano y directo.
- Enfócate en lo que NO es obvio a simple vista: concentración de clientes,
  clientes que se están "enfriando", caídas de productos, oportunidades de
  venta cruzada, márgenes, tendencias.
- Sé concreto: usa nombres, montos y porcentajes reales de los datos.
- Prioriza acciones que el vendedor pueda hacer esta semana.
- No inventes datos que no estén en el JSON. Si algo no está, no lo menciones.
- Los montos están en pesos chilenos (CLP).
- Sé conciso: cada "detalle" en 1-2 frases. Máximo 6 hallazgos y 5 acciones.`;

const SCHEMA = {
  type: "object",
  properties: {
    titular: {
      type: "string",
      description: "Una frase que resuma el estado del negocio en el período.",
    },
    resumen: {
      type: "string",
      description: "Párrafo corto (2-4 frases) con la lectura general.",
    },
    hallazgos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tipo: {
            type: "string",
            enum: ["alerta", "oportunidad", "positivo", "info"],
          },
          titulo: { type: "string" },
          detalle: { type: "string" },
        },
        required: ["tipo", "titulo", "detalle"],
        additionalProperties: false,
      },
    },
    acciones: {
      type: "array",
      items: { type: "string" },
      description: "Acciones concretas recomendadas para esta semana.",
    },
  },
  required: ["titular", "resumen", "hallazgos", "acciones"],
  additionalProperties: false,
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Método no permitido" }, 405);
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json(
        { error: "Falta configurar ANTHROPIC_API_KEY en los secretos de Supabase." },
        500,
      );
    }

    const datos = await req.json();

    const apiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 3000,
        thinking: { type: "adaptive" },
        system: SYSTEM_PROMPT,
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
        messages: [
          {
            role: "user",
            content:
              "Analiza estas estadísticas del negocio y genera el diagnóstico:\n\n" +
              JSON.stringify(datos),
          },
        ],
      }),
    });

    if (!apiResp.ok) {
      const errText = await apiResp.text();
      return json(
        { error: `La API de Claude respondió ${apiResp.status}: ${errText.slice(0, 300)}` },
        502,
      );
    }

    const data = await apiResp.json();
    // El primer bloque de texto contiene el JSON estructurado
    const textBlock = (data.content || []).find((b: { type: string }) => b.type === "text");
    const text = textBlock?.text ?? "{}";
    return json(JSON.parse(text), 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: "No se pudo generar el análisis: " + msg }, 500);
  }
});
