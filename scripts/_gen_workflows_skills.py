import json
import io
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "n8n")


def wf_crear_skill():
    return {
        "name": "PoC - POST Crear Skill",
        "nodes": [
            {"parameters": {"httpMethod": "POST", "path": "skills/crear", "responseMode": "responseNode", "options": {}},
             "id": "webhook", "name": "Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [200, 300]},

            {"parameters": {
                "jsCode": "const b = $json.body;\nconst faltantes = [];\nif (!b.nombre) faltantes.push('nombre');\nif (!b.tipo) faltantes.push('tipo');\nif (!b.nivel_basic) faltantes.push('nivel_basic');\nif (!b.nivel_intermediate) faltantes.push('nivel_intermediate');\nif (!b.nivel_advanced) faltantes.push('nivel_advanced');\nif (!b.nivel_expert) faltantes.push('nivel_expert');\nif (faltantes.length) {\n  return [{ json: { error: true, mensaje: 'Faltan campos obligatorios: ' + faltantes.join(', ') } }];\n}\nreturn [{ json: { error: false, body: b } }];"
             },
             "id": "validar", "name": "Validar Campos", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [400, 300]},

            {"parameters": {
                "method": "POST",
                "url": "https://api.airtable.com/v0/app67VJvBnXq015CI/Catalogo_Skills",
                "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
                "sendBody": True, "specifyBody": "json",
                "jsonBody": "={{ { \"fields\": { \"Nombre_Skill\": $json.body.nombre, \"Tipo\": $json.body.tipo, \"Perfil_Rol\": $json.body.perfil_rol || \"\", \"Descripcion\": $json.body.descripcion || \"\", \"Nivel_Basic\": $json.body.nivel_basic, \"Nivel_Intermediate\": $json.body.nivel_intermediate, \"Nivel_Advanced\": $json.body.nivel_advanced, \"Nivel_Expert\": $json.body.nivel_expert, \"Activo\": true } } }}",
                "options": {}},
             "id": "create", "name": "Create Skill", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
             "position": [600, 220], "credentials": {"httpHeaderAuth": {"id": "REEMPLAZAR_ID_CREDENCIAL", "name": "Airtable Token"}}},

            {"parameters": {
                "conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
                    "conditions": [{"leftValue": "={{ $json.error }}", "rightValue": True, "operator": {"type": "boolean", "operation": "true"}}],
                    "combinator": "and"}
             },
             "id": "if-error", "name": "Es Error?", "type": "n8n-nodes-base.if", "typeVersion": 2, "position": [600, 380]},

            {"parameters": {"respondWith": "json", "responseBody": "={{ { status: 'ok', id: $json.id } }}",
             "options": {"responseHeaders": {"entries": [
                 {"name": "Access-Control-Allow-Origin", "value": "*"},
                 {"name": "Access-Control-Allow-Methods", "value": "POST, OPTIONS"}]}}},
             "id": "respond-ok", "name": "Respond OK", "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": [820, 220]},

            {"parameters": {"respondWith": "json", "responseBody": "={{ { status: 'error', mensaje: $json.mensaje } }}", "responseCode": 400,
             "options": {"responseHeaders": {"entries": [
                 {"name": "Access-Control-Allow-Origin", "value": "*"},
                 {"name": "Access-Control-Allow-Methods", "value": "POST, OPTIONS"}]}}},
             "id": "respond-error", "name": "Respond Error", "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": [820, 460]}
        ],
        "connections": {
            "Webhook": {"main": [[{"node": "Validar Campos", "type": "main", "index": 0}]]},
            "Validar Campos": {"main": [[{"node": "Es Error?", "type": "main", "index": 0}]]},
            "Es Error?": {"main": [
                [{"node": "Respond Error", "type": "main", "index": 0}],
                [{"node": "Create Skill", "type": "main", "index": 0}]
            ]},
            "Create Skill": {"main": [[{"node": "Respond OK", "type": "main", "index": 0}]]}
        }
    }


def wf_actualizar_skill():
    return {
        "name": "PoC - POST Actualizar Skill",
        "nodes": [
            {"parameters": {"httpMethod": "POST", "path": "skills/actualizar", "responseMode": "responseNode", "options": {}},
             "id": "webhook", "name": "Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [200, 300]},

            {"parameters": {
                "jsCode": "const b = $json.body;\nconst faltantes = [];\nif (!b.record_id) faltantes.push('record_id');\nif (!b.nombre) faltantes.push('nombre');\nif (!b.tipo) faltantes.push('tipo');\nif (!b.nivel_basic) faltantes.push('nivel_basic');\nif (!b.nivel_intermediate) faltantes.push('nivel_intermediate');\nif (!b.nivel_advanced) faltantes.push('nivel_advanced');\nif (!b.nivel_expert) faltantes.push('nivel_expert');\nif (faltantes.length) {\n  return [{ json: { error: true, mensaje: 'Faltan campos obligatorios: ' + faltantes.join(', ') } }];\n}\nreturn [{ json: { error: false, body: b } }];"
             },
             "id": "validar", "name": "Validar Campos", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [400, 300]},

            {"parameters": {
                "method": "PATCH",
                "url": "={{ 'https://api.airtable.com/v0/app67VJvBnXq015CI/Catalogo_Skills/' + $json.body.record_id }}",
                "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
                "sendBody": True, "specifyBody": "json",
                "jsonBody": "={{ { \"fields\": { \"Nombre_Skill\": $json.body.nombre, \"Tipo\": $json.body.tipo, \"Perfil_Rol\": $json.body.perfil_rol || \"\", \"Descripcion\": $json.body.descripcion || \"\", \"Nivel_Basic\": $json.body.nivel_basic, \"Nivel_Intermediate\": $json.body.nivel_intermediate, \"Nivel_Advanced\": $json.body.nivel_advanced, \"Nivel_Expert\": $json.body.nivel_expert } } }}",
                "options": {}},
             "id": "update", "name": "Update Skill", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
             "position": [600, 220], "credentials": {"httpHeaderAuth": {"id": "REEMPLAZAR_ID_CREDENCIAL", "name": "Airtable Token"}}},

            {"parameters": {
                "conditions": {"options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
                    "conditions": [{"leftValue": "={{ $json.error }}", "rightValue": True, "operator": {"type": "boolean", "operation": "true"}}],
                    "combinator": "and"}
             },
             "id": "if-error", "name": "Es Error?", "type": "n8n-nodes-base.if", "typeVersion": 2, "position": [600, 380]},

            {"parameters": {"respondWith": "json", "responseBody": "={{ { status: 'ok' } }}",
             "options": {"responseHeaders": {"entries": [
                 {"name": "Access-Control-Allow-Origin", "value": "*"},
                 {"name": "Access-Control-Allow-Methods", "value": "POST, OPTIONS"}]}}},
             "id": "respond-ok", "name": "Respond OK", "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": [820, 220]},

            {"parameters": {"respondWith": "json", "responseBody": "={{ { status: 'error', mensaje: $json.mensaje } }}", "responseCode": 400,
             "options": {"responseHeaders": {"entries": [
                 {"name": "Access-Control-Allow-Origin", "value": "*"},
                 {"name": "Access-Control-Allow-Methods", "value": "POST, OPTIONS"}]}}},
             "id": "respond-error", "name": "Respond Error", "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": [820, 460]}
        ],
        "connections": {
            "Webhook": {"main": [[{"node": "Validar Campos", "type": "main", "index": 0}]]},
            "Validar Campos": {"main": [[{"node": "Es Error?", "type": "main", "index": 0}]]},
            "Es Error?": {"main": [
                [{"node": "Respond Error", "type": "main", "index": 0}],
                [{"node": "Update Skill", "type": "main", "index": 0}]
            ]},
            "Update Skill": {"main": [[{"node": "Respond OK", "type": "main", "index": 0}]]}
        }
    }


def wf_toggle_activo_skill():
    return {
        "name": "PoC - POST Toggle Activo Skill",
        "nodes": [
            {"parameters": {"httpMethod": "POST", "path": "skills/toggle-activo", "responseMode": "responseNode", "options": {}},
             "id": "webhook", "name": "Webhook", "type": "n8n-nodes-base.webhook", "typeVersion": 2, "position": [200, 300]},

            {"parameters": {
                "method": "PATCH",
                "url": "={{ 'https://api.airtable.com/v0/app67VJvBnXq015CI/Catalogo_Skills/' + $json.body.record_id }}",
                "authentication": "genericCredentialType", "genericAuthType": "httpHeaderAuth",
                "sendBody": True, "specifyBody": "json",
                "jsonBody": "={{ { \"fields\": { \"Activo\": $json.body.activo } } }}",
                "options": {}},
             "id": "update", "name": "Toggle Activo", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2,
             "position": [420, 300], "credentials": {"httpHeaderAuth": {"id": "REEMPLAZAR_ID_CREDENCIAL", "name": "Airtable Token"}}},

            {"parameters": {"respondWith": "json", "responseBody": "={{ { status: 'ok' } }}",
             "options": {"responseHeaders": {"entries": [
                 {"name": "Access-Control-Allow-Origin", "value": "*"},
                 {"name": "Access-Control-Allow-Methods", "value": "POST, OPTIONS"}]}}},
             "id": "respond", "name": "Respond to Webhook", "type": "n8n-nodes-base.respondToWebhook", "typeVersion": 1.1, "position": [640, 300]}
        ],
        "connections": {
            "Webhook": {"main": [[{"node": "Toggle Activo", "type": "main", "index": 0}]]},
            "Toggle Activo": {"main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]}
        }
    }


if __name__ == "__main__":
    workflows = {
        "n8n_workflow_crear_skill.json": wf_crear_skill(),
        "n8n_workflow_actualizar_skill.json": wf_actualizar_skill(),
        "n8n_workflow_toggle_activo_skill.json": wf_toggle_activo_skill(),
    }
    for fname, wf in workflows.items():
        path = os.path.join(OUT_DIR, fname)
        with io.open(path, "w", encoding="utf-8") as f:
            json.dump(wf, f, indent=2, ensure_ascii=False)
        print("Generado:", path)
