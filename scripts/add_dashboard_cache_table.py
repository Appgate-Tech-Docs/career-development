"""
Crea la tabla Dashboard_Cache: guarda los dashboards ya calculados (líder y personal)
como JSON, para que n8n solo tenga que leerlos sin recalcular nada.

Uso:
    $env:AIRTABLE_TOKEN="pat..."
    python add_dashboard_cache_table.py
"""

import os
import requests

TOKEN = os.environ["AIRTABLE_TOKEN"]
BASE_ID = "app67VJvBnXq015CI"
API_ROOT = "https://api.airtable.com/v0"
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

if __name__ == "__main__":
    body = {
        "name": "Dashboard_Cache",
        "fields": [
            {"name": "Referencia_ID", "type": "singleLineText"},
            {"name": "Tipo", "type": "singleSelect", "options": {"choices": [
                {"name": "Lider"}, {"name": "Personal"}]}},
            {"name": "Datos_JSON", "type": "multilineText"},
            {"name": "Actualizado", "type": "dateTime", "options": {
                "dateFormat": {"name": "iso"}, "timeFormat": {"name": "24hour"}, "timeZone": "utc"}},
        ],
    }
    r = requests.post(f"{API_ROOT}/meta/bases/{BASE_ID}/tables", headers=HEADERS, json=body)
    if r.status_code >= 300:
        print("ERROR:", r.status_code, r.text)
    r.raise_for_status()
    table = r.json()
    print("Tabla Dashboard_Cache creada:", table["id"])
