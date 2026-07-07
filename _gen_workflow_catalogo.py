import json
import io
import os

OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "n8n", "n8n_workflow_catalogo.json")

CODE_MERGE = """const personas = $node["Get Personas"].json.records.map(r => ({
  id: r.id, nombre: r.fields.Nombre, area: r.fields.Area,
  perfil_rol: r.fields.Perfil_Rol, lider_id: (r.fields.Lider && r.fields.Lider[0]) || null
}));

const registrosSkills = [
  ...$node["Get Skills Page1"].json.records,
  ...$node["Get Skills Page2"].json.records,
  ...$node["Get Skills Page3"].json.records
];

const skills = registrosSkills.map(r => ({
  id: r.id,
  nombre: r.fields.Nombre_Skill,
  tipo: r.fields.Tipo,
  perfil_rol: r.fields.Perfil_Rol || null,
  descripcion: r.fields.Descripcion || '',
  activo: r.fields.Activo === true,
  niveles: {
    Basic: r.fields.Nivel_Basic || '',
    Intermediate: r.fields.Nivel_Intermediate || '',
    Advanced: r.fields.Nivel_Advanced || '',
    Expert: r.fields.Nivel_Expert || ''
  }
}));

return [{ json: { personas, skills } }];"""


def skills_page_node(node_id, name, offset_expr, position):
    params = {
        "parameters": [{"name": "pageSize", "value": "100"}]
    }
    if offset_expr:
        params["parameters"].append({"name": "offset", "value": offset_expr})
    return {
        "parameters": {
            "url": "https://api.airtable.com/v0/app67VJvBnXq015CI/tblimSycH4tFQ2zA2",
            "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
            "sendQuery": True, "queryParameters": params,
            "options": {}
        },
        "id": node_id, "name": name, "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
        "position": position,
        "credentials": {"httpHeaderAuth": {"id": "REEMPLAZAR_ID_CREDENCIAL", "name": "Airtable Token"}}
    }


def build():
    return {
        "name": "PoC - GET Catalogo",
        "nodes": [
            {"parameters": {"httpMethod": "GET", "path": "catalogo", "responseMode": "responseNode", "options": {}},
             "id": "webhook-catalogo", "name": "Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [180, 300]},

            {"parameters": {
                "url": "https://api.airtable.com/v0/app67VJvBnXq015CI/tblJAsLi0lvyhkD5h",
                "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
                "options": {}},
             "id": "get-personas", "name": "Get Personas", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
             "position": [380, 300], "credentials": {"httpHeaderAuth": {"id": "REEMPLAZAR_ID_CREDENCIAL", "name": "Airtable Token"}}},

            skills_page_node("get-skills-1", "Get Skills Page1", None, [580, 200]),
            skills_page_node("get-skills-2", "Get Skills Page2", "={{ $json.offset }}", [580, 300]),
            skills_page_node("get-skills-3", "Get Skills Page3", "={{ $json.offset }}", [580, 400]),

            {"parameters": {"jsCode": CODE_MERGE}, "id": "code-merge", "name": "Armar Respuesta",
             "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [800, 300]},

            {"parameters": {"respondWith": "json", "responseBody": "={{ $json }}",
             "options": {"responseHeaders": {"entries": [
                 {"name": "Access-Control-Allow-Origin", "value": "*"},
                 {"name": "Access-Control-Allow-Methods", "value": "GET, OPTIONS"}]}}},
             "id": "respond-catalogo", "name": "Respond to Webhook", "type": "n8n-nodes-base.respondToWebhook",
             "typeVersion": 1.1, "position": [1000, 300]}
        ],
        "connections": {
            "Webhook": {"main": [[{"node": "Get Personas", "type": "main", "index": 0}]]},
            "Get Personas": {"main": [[{"node": "Get Skills Page1", "type": "main", "index": 0}]]},
            "Get Skills Page1": {"main": [[{"node": "Get Skills Page2", "type": "main", "index": 0}]]},
            "Get Skills Page2": {"main": [[{"node": "Get Skills Page3", "type": "main", "index": 0}]]},
            "Get Skills Page3": {"main": [[{"node": "Armar Respuesta", "type": "main", "index": 0}]]},
            "Armar Respuesta": {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]}
        }
    }


if __name__ == "__main__":
    wf = build()
    with io.open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(wf, f, indent=2, ensure_ascii=False)
    print("Generado:", OUT_PATH)
