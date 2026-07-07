import json
import io
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "n8n")


def wf_sugerencias():
    code = """const records = $json.records || [];
if (!records.length) {
  return [{ json: { error: 'No hay dashboard calculado para esta persona. Corre compute_dashboards.py.' } }];
}
const data = JSON.parse(records[0].fields.Datos_JSON);
const ACCION_POR_TIPO = {
  'Funcion': 'Asignar un proyecto o tarea practica donde deba ejercitar esta funcion, con acompanamiento cercano.',
  'Hard Skill': 'Inscribir en un curso o certificacion tecnica especifica para esta habilidad.',
  'Soft Skill': 'Sesiones de mentoria o coaching enfocadas en este comportamiento, con retroalimentacion periodica.'
};
const sugerencias = (data.gaps_prioritarios || []).slice(0, 3).map(g => ({
  skill_id: g.skill_id,
  skill_nombre: g.nombre,
  tipo: g.tipo,
  promedio_actual: g.promedio,
  promedio_area: g.promedio_area,
  accion_sugerida: ACCION_POR_TIPO[g.tipo] || 'Definir un plan de accion especifico con el colaborador.'
}));
return [{ json: { persona: data.persona, sugerencias } }];"""

    return {
        "name": "PoC - GET Sugerencias Crecimiento",
        "nodes": [
            {"parameters": {"httpMethod": "GET", "path": "sugerencias", "responseMode": "responseNode", "options": {}},
             "id": "webhook", "name": "Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [200, 300]},
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
             "position": [420, 300], "credentials": {"httpHeaderAuth": {"id": "REEMPLAZAR_ID_CREDENCIAL", "name": "Airtable Token"}}},
            {"parameters": {"jsCode": code}, "id": "compute", "name": "Armar Sugerencias", "type": "n8n-nodes-base.code",
             "typeVersion": 2, "position": [640, 300]},
            {"parameters": {"respondWith": "json", "responseBody": "={{ $json }}",
             "options": {"responseHeaders": {"entries": [
                 {"name": "Access-Control-Allow-Origin", "value": "*"},
                 {"name": "Access-Control-Allow-Methods", "value": "GET, OPTIONS"}]}}},
             "id": "respond", "name": "Respond to Webhook", "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": [860, 300]}
        ],
        "connections": {
            "Webhook": {"main": [[{"node": "Get Dashboard Cache", "type": "main", "index": 0}]]},
            "Get Dashboard Cache": {"main": [[{"node": "Armar Sugerencias", "type": "main", "index": 0}]]},
            "Armar Sugerencias": {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]}
        }
    }


def wf_get_compromisos():
    code = """const records = $json.records || [];
const compromisos = records.map(r => ({
  id: r.id,
  accion_recomendada: r.fields.Accion_Recomendada || '',
  responsable: r.fields.Responsable || '',
  fecha_compromiso: r.fields.Fecha_Compromiso || '',
  estado: r.fields.Estado || '',
  notas_seguimiento: r.fields.Notas_Seguimiento || ''
}));
return [{ json: { compromisos } }];"""

    return {
        "name": "PoC - GET Compromisos",
        "nodes": [
            {"parameters": {"httpMethod": "GET", "path": "compromisos", "responseMode": "responseNode", "options": {}},
             "id": "webhook", "name": "Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [200, 300]},
            {"parameters": {
                "url": "https://api.airtable.com/v0/app67VJvBnXq015CI/Plan_Desarrollo",
                "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
                "sendQuery": True,
                "queryParameters": {"parameters": [
                    {"name": "filterByFormula", "value": "={{ 'FIND(\"' + $json.query.persona_id + '\", ARRAYJOIN({Persona}))' }}"}
                ]},
                "options": {}},
             "id": "get-plan", "name": "Get Plan Desarrollo", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
             "position": [420, 300], "credentials": {"httpHeaderAuth": {"id": "REEMPLAZAR_ID_CREDENCIAL", "name": "Airtable Token"}}},
            {"parameters": {"jsCode": code}, "id": "compute", "name": "Armar Lista", "type": "n8n-nodes-base.code",
             "typeVersion": 2, "position": [640, 300]},
            {"parameters": {"respondWith": "json", "responseBody": "={{ $json }}",
             "options": {"responseHeaders": {"entries": [
                 {"name": "Access-Control-Allow-Origin", "value": "*"},
                 {"name": "Access-Control-Allow-Methods", "value": "GET, OPTIONS"}]}}},
             "id": "respond", "name": "Respond to Webhook", "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": [860, 300]}
        ],
        "connections": {
            "Webhook": {"main": [[{"node": "Get Plan Desarrollo", "type": "main", "index": 0}]]},
            "Get Plan Desarrollo": {"main": [[{"node": "Armar Lista", "type": "main", "index": 0}]]},
            "Armar Lista": {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]}
        }
    }


def wf_crear_compromiso():
    return {
        "name": "PoC - POST Crear Compromiso",
        "nodes": [
            {"parameters": {"httpMethod": "POST", "path": "compromisos", "responseMode": "responseNode", "options": {}},
             "id": "webhook", "name": "Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [200, 300]},
            {"parameters": {
                "method": "POST",
                "url": "https://api.airtable.com/v0/app67VJvBnXq015CI/Plan_Desarrollo",
                "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
                "sendBody": True, "specifyBody": "json",
                "jsonBody": "={{ { \"fields\": { \"Persona\": [$json.body.persona_id], \"Skill_Gap\": [$json.body.skill_id], \"Accion_Recomendada\": $json.body.accion_recomendada, \"Responsable\": $json.body.responsable, \"Fecha_Compromiso\": $json.body.fecha_compromiso, \"Estado\": \"No iniciado\" } } }}",
                "options": {}},
             "id": "create", "name": "Create Compromiso", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
             "position": [420, 300], "credentials": {"httpHeaderAuth": {"id": "REEMPLAZAR_ID_CREDENCIAL", "name": "Airtable Token"}}},
            {"parameters": {"respondWith": "json", "responseBody": "={{ { status: 'ok', id: $json.id } }}",
             "options": {"responseHeaders": {"entries": [
                 {"name": "Access-Control-Allow-Origin", "value": "*"},
                 {"name": "Access-Control-Allow-Methods", "value": "POST, OPTIONS"}]}}},
             "id": "respond", "name": "Respond to Webhook", "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": [640, 300]}
        ],
        "connections": {
            "Webhook": {"main": [[{"node": "Create Compromiso", "type": "main", "index": 0}]]},
            "Create Compromiso": {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]}
        }
    }


def wf_actualizar_compromiso():
    return {
        "name": "PoC - POST Actualizar Compromiso",
        "nodes": [
            {"parameters": {"httpMethod": "POST", "path": "compromisos/actualizar", "responseMode": "responseNode", "options": {}},
             "id": "webhook", "name": "Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [200, 300]},
            {"parameters": {
                "method": "PATCH",
                "url": "={{ 'https://api.airtable.com/v0/app67VJvBnXq015CI/Plan_Desarrollo/' + $json.body.record_id }}",
                "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
                "sendBody": True, "specifyBody": "json",
                "jsonBody": "={{ { \"fields\": { \"Estado\": $json.body.estado, \"Notas_Seguimiento\": $json.body.notas_seguimiento } } }}",
                "options": {}},
             "id": "update", "name": "Update Compromiso", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
             "position": [420, 300], "credentials": {"httpHeaderAuth": {"id": "REEMPLAZAR_ID_CREDENCIAL", "name": "Airtable Token"}}},
            {"parameters": {"respondWith": "json", "responseBody": "={{ { status: 'ok' } }}",
             "options": {"responseHeaders": {"entries": [
                 {"name": "Access-Control-Allow-Origin", "value": "*"},
                 {"name": "Access-Control-Allow-Methods", "value": "POST, OPTIONS"}]}}},
             "id": "respond", "name": "Respond to Webhook", "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": [640, 300]}
        ],
        "connections": {
            "Webhook": {"main": [[{"node": "Update Compromiso", "type": "main", "index": 0}]]},
            "Update Compromiso": {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]}
        }
    }


if __name__ == "__main__":
    workflows = {
        "n8n_workflow_sugerencias.json": wf_sugerencias(),
        "n8n_workflow_get_compromisos.json": wf_get_compromisos(),
        "n8n_workflow_crear_compromiso.json": wf_crear_compromiso(),
        "n8n_workflow_actualizar_compromiso.json": wf_actualizar_compromiso(),
    }
    for fname, wf in workflows.items():
        path = os.path.join(OUT_DIR, fname)
        with io.open(path, "w", encoding="utf-8") as f:
            json.dump(wf, f, indent=2, ensure_ascii=False)
        print("Generado:", path)
