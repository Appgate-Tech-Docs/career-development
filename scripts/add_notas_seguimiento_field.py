"""
Agrega el campo Notas_Seguimiento a Plan_Desarrollo, para que el lider pueda
dejar anotaciones de seguimiento sobre cada compromiso (ademas del Estado).

Uso:
    $env:AIRTABLE_TOKEN="pat..."
    python add_notas_seguimiento_field.py
"""

import os
import requests

TOKEN = os.environ["AIRTABLE_TOKEN"]
BASE_ID = "app67VJvBnXq015CI"
TABLES = {"Plan_Desarrollo": "tbl1bfHCBGCkEK1Eo"}
API_ROOT = "https://api.airtable.com/v0"
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

if __name__ == "__main__":
    url = f"{API_ROOT}/meta/bases/{BASE_ID}/tables/{TABLES['Plan_Desarrollo']}/fields"
    r = requests.post(url, headers=HEADERS, json={"name": "Notas_Seguimiento", "type": "multilineText"})
    if r.status_code >= 300:
        print("ERROR:", r.status_code, r.text)
    r.raise_for_status()
    print("Campo Notas_Seguimiento agregado a Plan_Desarrollo")
