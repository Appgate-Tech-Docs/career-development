import json
import io
import os

OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "n8n", "n8n_workflow_sugerencias.json")

CODE_ARMAR_PROMPT = """const records = $json.records || [];
if (!records.length) {
  return [{ json: { error: 'No hay dashboard calculado para esta persona. Corre compute_dashboards.py.' } }];
}
const data = JSON.parse(records[0].fields.Datos_JSON);
const gaps = (data.gaps_prioritarios || []).slice(0, 3);

const listaGaps = gaps.map((g, i) => (
  (i + 1) + '. Skill: ' + g.nombre +
  ' | Categoria: ' + g.tipo +
  ' | Descripcion: ' + (g.descripcion || 'sin descripcion') +
  ' | Promedio actual de la persona: ' + g.promedio +
  ' | Promedio de su area: ' + (g.promedio_area !== null && g.promedio_area !== undefined ? g.promedio_area : 'sin dato')
)).join('\\n');

const prompt = 'Eres un consultor de desarrollo de talento humano. A continuacion te doy las 3 competencias con menor puntaje de un colaborador, segun una evaluacion 360. Para cada una, redacta UNA sugerencia de accion de desarrollo concreta, practica y especifica al contenido de esa competencia (no genérica), en español, de maximo 2 frases.\\n\\n' +
  listaGaps +
  '\\n\\nResponde UNICAMENTE con un array JSON de exactamente ' + gaps.length + ' strings, en el mismo orden, sin texto adicional ni markdown. Ejemplo de formato: [\"sugerencia 1\", \"sugerencia 2\", \"sugerencia 3\"]';

return [{ json: { persona: data.persona, gaps, prompt } }];"""

CODE_PARSE_IA = """const gaps = $node["Armar Prompt IA"].json.gaps;
const persona = $node["Armar Prompt IA"].json.persona;

const ACCION_POR_TIPO = {
  'Funcion': 'Asignar un proyecto o tarea practica donde deba ejercitar esta funcion, con acompanamiento cercano.',
  'Hard Skill': 'Inscribir en un curso o certificacion tecnica especifica para esta habilidad.',
  'Soft Skill': 'Sesiones de mentoria o coaching enfocadas en este comportamiento, con retroalimentacion periodica.'
};

let acciones = null;
try {
  const textoRespuesta = $json.content[0].text.trim();
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


def build():
    return {
        "name": "PoC - GET Sugerencias Crecimiento",
        "nodes": [
            {"parameters": {"httpMethod": "GET", "path": "sugerencias", "responseMode": "responseNode", "options": {}},
             "id": "webhook", "name": "Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [180, 300]},

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
             "position": [380, 300], "credentials": {"httpHeaderAuth": {"id": "REEMPLAZAR_ID_CREDENCIAL_AIRTABLE", "name": "Airtable Token"}}},

            {"parameters": {"jsCode": CODE_ARMAR_PROMPT}, "id": "armar-prompt", "name": "Armar Prompt IA",
             "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [580, 300]},

            {"parameters": {
                "method": "POST",
                "url": "https://api.anthropic.com/v1/messages",
                "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
                "sendHeaders": True,
                "headerParameters": {"parameters": [
                    {"name": "anthropic-version", "value": "2023-06-01"},
                    {"name": "content-type", "value": "application/json"}
                ]},
                "sendBody": True, "specifyBody": "json",
                "jsonBody": "={{ { \"model\": \"claude-3-5-haiku-20241022\", \"max_tokens\": 600, \"messages\": [ { \"role\": \"user\", \"content\": $json.prompt } ] } }}",
                "options": {}},
             "id": "call-ia", "name": "Generar Sugerencias IA", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
             "position": [780, 300], "credentials": {"httpHeaderAuth": {"id": "REEMPLAZAR_ID_CREDENCIAL_ANTHROPIC", "name": "Anthropic API Key"}}},

            {"parameters": {"jsCode": CODE_PARSE_IA}, "id": "parse-ia", "name": "Parse Respuesta IA",
             "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [980, 300]},

            {"parameters": {"respondWith": "json", "responseBody": "={{ $json }}",
             "options": {"responseHeaders": {"entries": [
                 {"name": "Access-Control-Allow-Origin", "value": "*"},
                 {"name": "Access-Control-Allow-Methods", "value": "GET, OPTIONS"}]}}},
             "id": "respond", "name": "Respond to Webhook", "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": [1180, 300]}
        ],
        "connections": {
            "Webhook": {"main": [[{"node": "Get Dashboard Cache", "type": "main", "index": 0}]]},
            "Get Dashboard Cache": {"main": [[{"node": "Armar Prompt IA", "type": "main", "index": 0}]]},
            "Armar Prompt IA": {"main": [[{"node": "Generar Sugerencias IA", "type": "main", "index": 0}]]},
            "Generar Sugerencias IA": {"main": [[{"node": "Parse Respuesta IA", "type": "main", "index": 0}]]},
            "Parse Respuesta IA": {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]}
        }
    }


if __name__ == "__main__":
    wf = build()
    with io.open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(wf, f, indent=2, ensure_ascii=False)
    print("Generado:", OUT_PATH)
