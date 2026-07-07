import json
import io
import os

OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "n8n", "n8n_workflow_sugerencias.json")

CODE_ARMAR_CONTEXTO = """const records = $json.records || [];
if (!records.length) {
  return [{ json: { error: 'No hay dashboard calculado para esta persona. Corre compute_dashboards.py.' } }];
}
const data = JSON.parse(records[0].fields.Datos_JSON);
const gaps = (data.gaps_prioritarios || []).slice(0, 3);

const contexto_texto = gaps.map((g, i) => (
  (i + 1) + '. Skill: ' + g.nombre +
  ' | Categoria: ' + g.tipo +
  ' | Descripcion: ' + (g.descripcion || 'sin descripcion') +
  ' | Promedio actual de la persona: ' + g.promedio +
  ' | Promedio de su area: ' + (g.promedio_area !== null && g.promedio_area !== undefined ? g.promedio_area : 'sin dato')
)).join('\\n');

return [{ json: { persona: data.persona, gaps, contexto_texto, cantidad_gaps: gaps.length } }];"""

CODE_PARSE_IA = """const gaps = $node["Armar Contexto"].json.gaps;
const persona = $node["Armar Contexto"].json.persona;

const ACCION_POR_TIPO = {
  'Funcion': 'Asignar un proyecto o tarea practica donde deba ejercitar esta funcion, con acompanamiento cercano.',
  'Hard Skill': 'Inscribir en un curso o certificacion tecnica especifica para esta habilidad.',
  'Soft Skill': 'Sesiones de mentoria o coaching enfocadas en este comportamiento, con retroalimentacion periodica.'
};

let acciones = null;
try {
  const textoRespuesta = ($json.output || $json.text || '').trim();
  const jsonMatch = textoRespuesta.match(/\\[[\\s\\S]*\\]/);
  acciones = JSON.parse(jsonMatch ? jsonMatch[0] : textoRespuesta);
} catch (e) {
  acciones = null;
}

const sugerencias = gaps.map((g, i) => ({
  skill_id: g.skill_id,
  skill_nombre: g.nombre,
  tipo: g.tipo,
  promedio_actual: g.promedio,
  promedio_area: g.promedio_area,
  accion_sugerida: (acciones && acciones[i]) ? acciones[i] : (ACCION_POR_TIPO[g.tipo] || 'Definir un plan de accion especifico con el colaborador.')
}));

return [{ json: { persona, sugerencias } }];"""

SYSTEM_MESSAGE = "Eres un consultor de desarrollo de talento humano. Recibiras una lista de competencias con bajo puntaje de un colaborador (evaluacion 360: autoevaluacion, jefe y pares). Para cada una, redacta UNA sugerencia de accion de desarrollo concreta, practica y especifica al contenido de esa competencia (nunca generica), en espanol, de maximo 2 frases. Responde UNICAMENTE con un array JSON de strings en el mismo orden, sin texto adicional ni markdown ni bloques de codigo. Ejemplo: [\"sugerencia 1\", \"sugerencia 2\", \"sugerencia 3\"]"


def build():
    return {
        "name": "PoC - GET Sugerencias Crecimiento",
        "nodes": [
            {"parameters": {"httpMethod": "GET", "path": "sugerencias", "responseMode": "responseNode", "options": {}},
             "id": "webhook", "name": "Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [140, 300]},

            {"parameters": {
                "url": "https://api.airtable.com/v0/app67VJvBnXq015CI/Dashboard_Cache",
                "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
                "sendQuery": True,
                "queryParameters": {"parameters": [
                    {"name": "filterByFormula", "value": "={{ 'AND({Tipo}=\"Personal\", {Referencia_ID}=\"' + $json.query.persona_id + '\")' }}"},
                    {"name": "maxRecords", "value": "1"}
                ]},
                "options": {}},
             "id": "get-cache", "name": "Get Dashboard Cache", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
             "position": [340, 300], "credentials": {"httpHeaderAuth": {"id": "REEMPLAZAR_ID_CREDENCIAL_AIRTABLE", "name": "Airtable Token"}}},

            {"parameters": {"jsCode": CODE_ARMAR_CONTEXTO}, "id": "armar-contexto", "name": "Armar Contexto",
             "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [540, 300]},

            {"parameters": {
                "promptType": "define",
                "text": "={{ $json.contexto_texto }}",
                "hasOutputParser": False,
                "options": {
                    "systemMessage": SYSTEM_MESSAGE
                }
             },
             "id": "ai-agent", "name": "AI Agent - Sugerencias", "type": "@n8n/n8n-nodes-langchain.agent",
             "typeVersion": 1.7, "position": [740, 300]},

            {"parameters": {
                "model": {"__rl": True, "value": "claude-3-5-haiku-20241022", "mode": "list"},
                "options": {}
             },
             "id": "chat-model", "name": "Anthropic Chat Model", "type": "@n8n/n8n-nodes-langchain.lmChatAnthropic",
             "typeVersion": 1.3, "position": [700, 500],
             "credentials": {"anthropicApi": {"id": "REEMPLAZAR_ID_CREDENCIAL_ANTHROPIC", "name": "Anthropic Account"}}},

            {"parameters": {"jsCode": CODE_PARSE_IA}, "id": "parse-ia", "name": "Parse Respuesta IA",
             "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [960, 300]},

            {"parameters": {"respondWith": "json", "responseBody": "={{ $json }}",
             "options": {"responseHeaders": {"entries": [
                 {"name": "Access-Control-Allow-Origin", "value": "*"},
                 {"name": "Access-Control-Allow-Methods", "value": "GET, OPTIONS"}]}}},
             "id": "respond", "name": "Respond to Webhook", "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": [1160, 300]}
        ],
        "connections": {
            "Webhook": {"main": [[{"node": "Get Dashboard Cache", "type": "main", "index": 0}]]},
            "Get Dashboard Cache": {"main": [[{"node": "Armar Contexto", "type": "main", "index": 0}]]},
            "Armar Contexto": {"main": [[{"node": "AI Agent - Sugerencias", "type": "main", "index": 0}]]},
            "Anthropic Chat Model": {"ai_languageModel": [[{"node": "AI Agent - Sugerencias", "type": "ai_languageModel", "index": 0}]]},
            "AI Agent - Sugerencias": {"main": [[{"node": "Parse Respuesta IA", "type": "main", "index": 0}]]},
            "Parse Respuesta IA": {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]}
        }
    }


if __name__ == "__main__":
    wf = build()
    with io.open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(wf, f, indent=2, ensure_ascii=False)
    print("Generado:", OUT_PATH)
