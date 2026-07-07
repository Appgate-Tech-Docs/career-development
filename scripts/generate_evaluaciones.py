"""
Genera evaluaciones de prueba (Employee, Leader, Peer) para las 50 personas
ya cargadas con generate_personas.py, usando la ronda piloto existente.

Por cada persona con Perfil_Rol (todas menos el CEO):
  - Autoevaluacion (Employee)
  - Evaluacion de su lider directo (Leader)
  - Evaluacion de un companero de la misma area (Peer, Interno)
Cubriendo hasta 3 Funciones + 3 Hard Skills + 3 Soft Skills de su perfil.

Uso:
    $env:AIRTABLE_TOKEN="pat..."
    python generate_evaluaciones.py
"""

import os
import random
import requests

random.seed(42)

TOKEN = os.environ["AIRTABLE_TOKEN"]
BASE_ID = "app67VJvBnXq015CI"
TABLES = {
    "Personas": "tblJAsLi0lvyhkD5h",
    "Catalogo_Skills": "tblimSycH4tFQ2zA2",
    "Evaluaciones": "tblUZPKwTFRoe4N87",
}
RONDA_ID = "recyFnw4J1OiroFZT"
API_ROOT = "https://api.airtable.com/v0"
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

MAX_POR_CATEGORIA = 3


def fetch_all(table_key):
    url = f"{API_ROOT}/{BASE_ID}/{TABLES[table_key]}"
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


def create_records(fields_list):
    url = f"{API_ROOT}/{BASE_ID}/{TABLES['Evaluaciones']}"
    total = 0
    for i in range(0, len(fields_list), 10):
        batch = fields_list[i:i + 10]
        r = requests.post(url, headers=HEADERS, json={"records": [{"fields": f} for f in batch]})
        if r.status_code >= 300:
            print("ERROR:", r.status_code, r.text)
        r.raise_for_status()
        total += len(r.json()["records"])
    return total


def puntaje_random(bajo=2, alto=5, sesgo=0):
    return max(2, min(5, random.randint(bajo, alto) + sesgo))


if __name__ == "__main__":
    print("Descargando personas y catalogo...")
    personas_raw = fetch_all("Personas")
    skills_raw = fetch_all("Catalogo_Skills")

    personas = [{
        "id": p["id"],
        "nombre": p["fields"].get("Nombre", ""),
        "area": p["fields"].get("Area", ""),
        "perfil_rol": p["fields"].get("Perfil_Rol", ""),
        "lider_id": (p["fields"].get("Lider") or [None])[0],
    } for p in personas_raw]

    personas_por_id = {p["id"]: p for p in personas}

    skills_por_perfil_tipo = {}
    for s in skills_raw:
        perfil = s["fields"].get("Perfil_Rol")
        tipo = s["fields"].get("Tipo")
        if not perfil or not tipo:
            continue
        skills_por_perfil_tipo.setdefault((perfil, tipo), []).append(s["id"])

    soft_skill_ids = [s["id"] for s in skills_raw if s["fields"].get("Tipo") == "Soft Skill"]

    evaluables = [p for p in personas if p["perfil_rol"]]
    print(f"{len(evaluables)} personas evaluables (con Perfil_Rol)")

    registros = []

    for persona in evaluables:
        funciones = skills_por_perfil_tipo.get((persona["perfil_rol"], "Funcion"), [])[:MAX_POR_CATEGORIA]
        hard_skills = skills_por_perfil_tipo.get((persona["perfil_rol"], "Hard Skill"), [])[:MAX_POR_CATEGORIA]
        soft_skills = random.sample(soft_skill_ids, min(MAX_POR_CATEGORIA, len(soft_skill_ids)))
        skills_a_evaluar = funciones + hard_skills + soft_skills

        if not skills_a_evaluar:
            continue

        # Employee (autoevaluacion, tiende a puntuarse un poco mas alto)
        for skill_id in skills_a_evaluar:
            registros.append({
                "Ronda": [RONDA_ID], "Evaluado": [persona["id"]], "Skill": [skill_id],
                "Rol_Evaluador": "Employee", "Nombre_Evaluador": persona["nombre"],
                "Puntaje": puntaje_random(2, 5, sesgo=1),
                "Tipo_Evaluacion": "Interno",
            })

        # Leader (si tiene lider)
        lider = personas_por_id.get(persona["lider_id"]) if persona["lider_id"] else None
        if lider:
            for skill_id in skills_a_evaluar:
                registros.append({
                    "Ronda": [RONDA_ID], "Evaluado": [persona["id"]], "Skill": [skill_id],
                    "Rol_Evaluador": "Leader", "Nombre_Evaluador": lider["nombre"],
                    "Puntaje": puntaje_random(2, 5),
                    "Tipo_Evaluacion": "Interno",
                })

        # Peer (companero de la misma area, interno)
        companeros = [p for p in personas if p["area"] == persona["area"] and p["id"] != persona["id"]]
        if companeros:
            peer = random.choice(companeros)
            for skill_id in skills_a_evaluar:
                registros.append({
                    "Ronda": [RONDA_ID], "Evaluado": [persona["id"]], "Skill": [skill_id],
                    "Rol_Evaluador": "Peer", "Nombre_Evaluador": peer["nombre"],
                    "Puntaje": puntaje_random(2, 5),
                    "Tipo_Evaluacion": "Interno",
                })

    print(f"Preparados {len(registros)} registros de evaluacion. Cargando a Airtable...")
    total_creado = create_records(registros)
    print(f"\nListo. {total_creado} evaluaciones creadas.")
    print("Revisa la base:", f"https://airtable.com/{BASE_ID}")
