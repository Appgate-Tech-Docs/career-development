"""
Carga datos de prueba en la base ya creada (app67VJvBnXq015CI):
- 1 Ronda piloto
- 5 Personas (con relacion Lider)
- Registros de Evaluaciones (Employee/Leader/Peer) cruzando 3 skills reales
  del catalogo ya migrado, para poder probar dashboards de inmediato.

Uso:
    $env:AIRTABLE_TOKEN="pat..."
    python seed_data.py
"""

import os
import requests

TOKEN = os.environ["AIRTABLE_TOKEN"]
BASE_ID = "app67VJvBnXq015CI"

TABLES = {
    "Catalogo_Skills": "tblimSycH4tFQ2zA2",
    "Personas": "tblJAsLi0lvyhkD5h",
    "Rondas": "tblYrE0rloQoTe7l9",
    "Evaluaciones": "tblUZPKwTFRoe4N87",
    "Plan_Desarrollo": "tbl1bfHCBGCkEK1Eo",
}

API_ROOT = "https://api.airtable.com/v0"
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}


def create_records(table_key, fields_list):
    url = f"{API_ROOT}/{BASE_ID}/{TABLES[table_key]}"
    body = {"records": [{"fields": f} for f in fields_list]}
    r = requests.post(url, headers=HEADERS, json=body)
    if r.status_code >= 300:
        print("ERROR:", r.status_code, r.text)
    r.raise_for_status()
    return r.json()["records"]


def list_records(table_key, params=None):
    url = f"{API_ROOT}/{BASE_ID}/{TABLES[table_key]}"
    r = requests.get(url, headers=HEADERS, params=params or {})
    r.raise_for_status()
    return r.json()["records"]


if __name__ == "__main__":
    ronda = create_records("Rondas", [{
        "Nombre_Ronda": "Q1 2026 - Piloto",
        "Fecha_Inicio": "2026-01-01",
        "Fecha_Cierre": "2026-03-31",
        "Estado": "Abierta",
    }])[0]
    ronda_id = ronda["id"]
    print("Ronda creada:", ronda_id)

    lider = create_records("Personas", [{
        "Nombre": "Carla Mendez", "Area": "Cloud",
        "Perfil_Rol": "Cloud", "Email": "carla.mendez@example.com",
    }])[0]
    lider_id = lider["id"]

    empleados = create_records("Personas", [
        {"Nombre": "Juan Perez", "Area": "Cloud", "Perfil_Rol": "Cloud",
         "Email": "juan.perez@example.com", "Lider": [lider_id]},
        {"Nombre": "Maria Rojas", "Area": "Cloud", "Perfil_Rol": "Cloud",
         "Email": "maria.rojas@example.com", "Lider": [lider_id]},
        {"Nombre": "Pedro Gomez", "Area": "Sales", "Perfil_Rol": "Sales",
         "Email": "pedro.gomez@example.com", "Lider": [lider_id]},
        {"Nombre": "Ana Torres", "Area": "Sales", "Perfil_Rol": "Sales",
         "Email": "ana.torres@example.com", "Lider": [lider_id]},
    ])
    print("Personas creadas:", lider_id, [e["id"] for e in empleados])

    skills_cloud = list_records("Catalogo_Skills", params={
        "filterByFormula": "{Perfil_Rol}='Cloud'", "maxRecords": 3})
    skills_sales = list_records("Catalogo_Skills", params={
        "filterByFormula": "{Perfil_Rol}='Sales'", "maxRecords": 3})

    print("Skills Cloud encontradas:", len(skills_cloud))
    print("Skills Sales encontradas:", len(skills_sales))

    eval_rows = []
    roles = ["Employee", "Leader", "Peer"]
    scores = {"Employee": 4, "Leader": 3, "Peer": 4}

    for persona, skills in [(empleados[0], skills_cloud), (empleados[1], skills_cloud),
                              (empleados[2], skills_sales), (empleados[3], skills_sales)]:
        for skill in skills:
            for rol in roles:
                eval_rows.append({
                    "Ronda": [ronda_id],
                    "Evaluado": [persona["id"]],
                    "Skill": [skill["id"]],
                    "Rol_Evaluador": rol,
                    "Nombre_Evaluador": persona["fields"]["Nombre"] if rol == "Employee" else lider["fields"]["Nombre"],
                    "Puntaje": scores[rol],
                })

    for i in range(0, len(eval_rows), 10):
        batch = eval_rows[i:i + 10]
        created = create_records("Evaluaciones", batch)
        print(f"Evaluaciones cargadas: {len(created)} (lote {i // 10 + 1})")

    print("\nListo. Total evaluaciones de prueba:", len(eval_rows))
    print("Revisa la base:", f"https://airtable.com/{BASE_ID}")
