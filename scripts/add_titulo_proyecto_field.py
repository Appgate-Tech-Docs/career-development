"""
Agrega el campo Titulo_Proyecto a Plan_Desarrollo, para poder agrupar
varias habilidades (hard y/o soft) bajo un mismo compromiso/proyecto de desarrollo.

Uso:
    $env:AIRTABLE_TOKEN="pat..."
    python add_titulo_proyecto_field.py
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
    r = requests.post(url, headers=HEADERS, json={"name": "Titulo_Proyecto", "type": "singleLineText"})
    if r.status_code >= 300:
        print("ERROR:", r.status_code, r.text)
    r.raise_for_status()
    print("Campo Titulo_Proyecto agregado a Plan_Desarrollo")
