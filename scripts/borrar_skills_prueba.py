"""
Borra definitivamente los registros de prueba creados durante las pruebas
de la pantalla de gestion de habilidades ("Kubernetes en Produccion" y
"Terraform Avanzado") de la tabla Catalogo_Skills.

Uso:
    $env:AIRTABLE_TOKEN="pat..."
    python borrar_skills_prueba.py
"""

import os
import requests

TOKEN = os.environ["AIRTABLE_TOKEN"]
BASE_ID = "app67VJvBnXq015CI"
TABLES = {"Catalogo_Skills": "tblimSycH4tFQ2zA2"}
API_ROOT = "https://api.airtable.com/v0"
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

NOMBRES_A_BORRAR = ["Kubernetes en Produccion", "Terraform Avanzado"]


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


def delete_records(table_id, record_ids):
    url = f"{API_ROOT}/{BASE_ID}/{table_id}"
    for i in range(0, len(record_ids), 10):
        batch = record_ids[i:i + 10]
        params = [("records[]", rid) for rid in batch]
        r = requests.delete(url, headers=HEADERS, params=params)
        if r.status_code >= 300:
            print("ERROR:", r.status_code, r.text)
        r.raise_for_status()


if __name__ == "__main__":
    records = fetch_all(TABLES["Catalogo_Skills"])
    a_borrar = [r["id"] for r in records if r["fields"].get("Nombre_Skill", "").strip() in NOMBRES_A_BORRAR]

    if not a_borrar:
        print("No se encontraron registros de prueba para borrar.")
    else:
        print(f"Borrando {len(a_borrar)} registro(s): {a_borrar}")
        delete_records(TABLES["Catalogo_Skills"], a_borrar)
        print("Listo.")
