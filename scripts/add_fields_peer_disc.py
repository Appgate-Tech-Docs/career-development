"""
Agrega los campos necesarios para:
- Registrar perfil DISC (dato externo, no es parte del wizard de skills)
- Diferenciar evaluaciones Peer Interno vs Externo

Uso:
    $env:AIRTABLE_TOKEN="pat..."
    python add_fields_peer_disc.py
"""

import os
import requests

TOKEN = os.environ["AIRTABLE_TOKEN"]
BASE_ID = "app67VJvBnXq015CI"
TABLES = {
    "Personas": "tblJAsLi0lvyhkD5h",
    "Evaluaciones": "tblUZPKwTFRoe4N87",
}
API_ROOT = "https://api.airtable.com/v0"
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


def add_field(table_key, body):
    url = f"{API_ROOT}/meta/bases/{BASE_ID}/tables/{TABLES[table_key]}/fields"
    r = requests.post(url, headers=HEADERS, json=body)
    if r.status_code >= 300:
        print("ERROR:", r.status_code, r.text)
    r.raise_for_status()
    print(f"Campo '{body['name']}' agregado a {table_key}")


if __name__ == "__main__":
    add_field("Personas", {"name": "DISC_Perfil_Natural", "type": "singleLineText"})
    add_field("Personas", {"name": "DISC_Perfil_Adaptado", "type": "singleLineText"})
    add_field("Evaluaciones", {"name": "Tipo_Evaluacion", "type": "singleSelect",
              "options": {"choices": [{"name": "Interno"}, {"name": "Externo"}]}})
    print("\nListo.")
