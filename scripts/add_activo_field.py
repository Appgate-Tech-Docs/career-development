"""
Agrega el campo Activo (checkbox) a Catalogo_Skills, y activa todas las skills
existentes para que no desaparezcan de los formularios al agregar este campo.

Uso:
    $env:AIRTABLE_TOKEN="pat..."
    python add_activo_field.py
"""

import os
import requests

TOKEN = os.environ["AIRTABLE_TOKEN"]
BASE_ID = "app67VJvBnXq015CI"
TABLES = {"Catalogo_Skills": "tblimSycH4tFQ2zA2"}
API_ROOT = "https://api.airtable.com/v0"
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


def fetch_all(table_id):
    url = f"{API_ROOT}/{BASE_ID}/{table_id}"
    records, offset = [], None
    while True:
        params = {"pageSize": 100}
        if offset:
            params["offset"] = offset
        r = requests.get(url, headers=HEADERS, params=params)
        r.raise_for_status()
        data = r.json()
        records.extend(data["records"])
        offset = data.get("offset")
        if not offset:
            break
    return records


def update_records(table_id, updates):
    url = f"{API_ROOT}/{BASE_ID}/{table_id}"
    for i in range(0, len(updates), 10):
        batch = updates[i:i + 10]
        r = requests.patch(url, headers=HEADERS, json={"records": batch})
        if r.status_code >= 300:
            print("ERROR:", r.status_code, r.text)
        r.raise_for_status()


def campo_existe(table_id, nombre_campo):
    r = requests.get(f"{API_ROOT}/meta/bases/{BASE_ID}/tables", headers=HEADERS)
    r.raise_for_status()
    for t in r.json()["tables"]:
        if t["id"] == table_id:
            return any(f["name"] == nombre_campo for f in t["fields"])
    return False


if __name__ == "__main__":
    if campo_existe(TABLES["Catalogo_Skills"], "Activo"):
        print("Campo Activo ya existe, se omite la creacion.")
    else:
        field_url = f"{API_ROOT}/meta/bases/{BASE_ID}/tables/{TABLES['Catalogo_Skills']}/fields"
        r = requests.post(field_url, headers=HEADERS, json={
            "name": "Activo", "type": "checkbox",
            "options": {"icon": "check", "color": "greenBright"}
        })
        if r.status_code >= 300:
            print("ERROR creando campo:", r.status_code, r.text)
        r.raise_for_status()
        print("Campo Activo agregado a Catalogo_Skills")

    print("Activando todas las skills existentes...")
    records = fetch_all(TABLES["Catalogo_Skills"])
    updates = [{"id": r["id"], "fields": {"Activo": True}} for r in records]
    update_records(TABLES["Catalogo_Skills"], updates)
    print(f"Listo. {len(updates)} skills marcadas como activas.")
