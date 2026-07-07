import json
import io
import os

OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "n8n", "n8n_workflow_get_compromisos.json")

CODE_ARMAR_LISTA = """const personaId = $node["Webhook"].json.query.persona_id;

const skillsPorId = {};
[...$node["Get Skills Page1"].json.records, ...$node["Get Skills Page2"].json.records, ...$node["Get Skills Page3"].json.records]
  .forEach(s => { skillsPorId[s.id] = s.fields.Nombre_Skill; });

const records = $node["Get Plan Desarrollo"].json.records || [];
const compromisos = records
  .filter(r => (r.fields.Persona || [])[0] === personaId)
  .map(r => ({
    id: r.id,
    titulo_proyecto: r.fields.Titulo_Proyecto || '',
    skills: (r.fields.Skill_Gap || []).map(id => skillsPorId[id] || 'Desconocido'),
    accion_recomendada: r.fields.Accion_Recomendada || '',
    responsable: r.fields.Responsable || '',
    fecha_compromiso: r.fields.Fecha_Compromiso || '',
    estado: r.fields.Estado || '',
    notas_seguimiento: r.fields.Notas_Seguimiento || ''
  }));
return [{ json: { compromisos } }];"""


def skills_page_node(node_id, name, offset_expr, position):
    params = {"parameters": [{"name": "pageSize", "value": "100"}]}
    if offset_expr:
        params["parameters"].append({"name": "offset", "value": offset_expr})
    return {
        "parameters": {
            "url": "https://api.airtable.com/v0/app67VJvBnXq015CI/tblimSycH4tFQ2zA2",
            "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
            "sendQuery": True, "queryParameters": params, "options": {}
        },
        "id": node_id, "name": name, "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
        "position": position,
        "credentials": {"httpHeaderAuth": {"id": "REEMPLAZAR_ID_CREDENCIAL", "name": "Airtable Token"}}
    }


def build():
    return {
        "name": "PoC - GET Compromisos",
        "nodes": [
            {"parameters": {"httpMethod": "GET", "path": "compromisos", "responseMode": "responseNode", "options": {}},
             "id": "webhook", "name": "Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [140, 300]},

            {"parameters": {
                "url": "https://api.airtable.com/v0/app67VJvBnXq015CI/Plan_Desarrollo",
                "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
                "sendQuery": True,
                "queryParameters": {"parameters": [{"name": "pageSize", "value": "100"}]},
                "options": {}},
             "id": "get-plan", "name": "Get Plan Desarrollo", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
             "position": [340, 300], "credentials": {"httpHeaderAuth": {"id": "REEMPLAZAR_ID_CREDENCIAL", "name": "Airtable Token"}}},

            skills_page_node("get-skills-1", "Get Skills Page1", None, [540, 150]),
            skills_page_node("get-skills-2", "Get Skills Page2", "={{ $json.offset }}", [540, 300]),
            skills_page_node("get-skills-3", "Get Skills Page3", "={{ $json.offset }}", [540, 450]),

            {"parameters": {"jsCode": CODE_ARMAR_LISTA}, "id": "compute", "name": "Armar Lista",
             "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [760, 300]},

            {"parameters": {"respondWith": "json", "responseBody": "={{ $json }}",
             "options": {"responseHeaders": {"entries": [
                 {"name": "Access-Control-Allow-Origin", "value": "*"},
                 {"name": "Access-Control-Allow-Methods", "value": "GET, OPTIONS"}]}}},
             "id": "respond", "name": "Respond to Webhook", "type": "n8n-nodes-base.respondToWebhook",
             "typeVersion": 1.1, "position": [960, 300]}
        ],
        "connections": {
            "Webhook": {"main": [[{"node": "Get Plan Desarrollo", "type": "main", "index": 0}]]},
            "Get Plan Desarrollo": {"main": [[{"node": "Get Skills Page1", "type": "main", "index": 0}]]},
            "Get Skills Page1": {"main": [[{"node": "Get Skills Page2", "type": "main", "index": 0}]]},
            "Get Skills Page2": {"main": [[{"node": "Get Skills Page3", "type": "main", "index": 0}]]},
            "Get Skills Page3": {"main": [[{"node": "Armar Lista", "type": "main", "index": 0}]]},
            "Armar Lista": {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]}
        }
    }


if __name__ == "__main__":
    wf = build()
    with io.open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(wf, f, indent=2, ensure_ascii=False)
    print("Generado:", OUT_PATH)
