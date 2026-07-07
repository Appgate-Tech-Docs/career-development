"""
Calcula los dashboards de Lider y Personal para todas las personas evaluables
y los guarda como JSON en la tabla Dashboard_Cache.

Correr este script cada vez que se quiera refrescar los dashboards
(por ejemplo, al cerrar una ronda de evaluacion).

Uso:
    $env:AIRTABLE_TOKEN="pat..."
    python compute_dashboards.py
"""

import os
import json
import datetime
import requests

TOKEN = os.environ["AIRTABLE_TOKEN"]
BASE_ID = "app67VJvBnXq015CI"
TABLES = {
    "Personas": "tblJAsLi0lvyhkD5h",
    "Evaluaciones": "tblUZPKwTFRoe4N87",
    "Catalogo_Skills": "tblimSycH4tFQ2zA2",
}
API_ROOT = "https://api.airtable.com/v0"
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

DASHBOARD_CACHE_TABLE_ID = None  # se resuelve dinamicamente al inicio


def get_table_id_by_name(name):
    r = requests.get(f"{API_ROOT}/meta/bases/{BASE_ID}/tables", headers=HEADERS)
    r.raise_for_status()
    for t in r.json()["tables"]:
        if t["name"] == name:
            return t["id"]
    raise RuntimeError(f"Tabla {name} no encontrada. Corre add_dashboard_cache_table.py primero.")


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


def delete_all(table_id, record_ids):
    url = f"{API_ROOT}/{BASE_ID}/{table_id}"
    for i in range(0, len(record_ids), 10):
        batch = record_ids[i:i + 10]
        params = [("records[]", rid) for rid in batch]
        r = requests.delete(url, headers=HEADERS, params=params)
        r.raise_for_status()


def create_records(table_id, fields_list):
    url = f"{API_ROOT}/{BASE_ID}/{table_id}"
    total = 0
    for i in range(0, len(fields_list), 10):
        batch = fields_list[i:i + 10]
        r = requests.post(url, headers=HEADERS, json={"records": [{"fields": f} for f in batch]})
        if r.status_code >= 300:
            print("ERROR:", r.status_code, r.text)
        r.raise_for_status()
        total += len(r.json()["records"])
    return total


def promedio(valores):
    validos = [v for v in valores if v is not None]
    if not validos:
        return None
    return round(sum(validos) / len(validos), 1)


if __name__ == "__main__":
    cache_table_id = get_table_id_by_name("Dashboard_Cache")

    print("Descargando datos de Airtable...")
    personas_raw = fetch_all(TABLES["Personas"])
    eval_raw = fetch_all(TABLES["Evaluaciones"])
    skills_raw = fetch_all(TABLES["Catalogo_Skills"])

    personas = [{
        "id": p["id"],
        "nombre": p["fields"].get("Nombre", ""),
        "area": p["fields"].get("Area", ""),
        "perfil_rol": p["fields"].get("Perfil_Rol", ""),
        "lider_id": (p["fields"].get("Lider") or [None])[0],
    } for p in personas_raw]
    personas_por_id = {p["id"]: p for p in personas}

    skills_por_id = {s["id"]: {
        "nombre": s["fields"].get("Nombre_Skill", ""),
        "tipo": s["fields"].get("Tipo", ""),
        "descripcion": s["fields"].get("Descripcion", ""),
    } for s in skills_raw}

    evaluaciones = [{
        "evaluado_id": (e["fields"].get("Evaluado") or [None])[0],
        "skill_id": (e["fields"].get("Skill") or [None])[0],
        "rol": e["fields"].get("Rol_Evaluador"),
        "puntaje": e["fields"].get("Puntaje"),
    } for e in eval_raw]

    def descendientes(persona_id):
        directos = [p for p in personas if p["lider_id"] == persona_id]
        resultado = list(directos)
        for d in directos:
            resultado += descendientes(d["id"])
        return resultado

    def calcular_skills(evals_de_persona):
        por_skill = {}
        for e in evals_de_persona:
            if e["skill_id"] is None:
                continue
            por_skill.setdefault(e["skill_id"], {"Employee": [], "Leader": [], "Peer": []})
            if e["rol"] in por_skill[e["skill_id"]]:
                por_skill[e["skill_id"]][e["rol"]].append(e["puntaje"])
        skills = []
        for skill_id, roles in por_skill.items():
            todas = roles["Employee"] + roles["Leader"] + roles["Peer"]
            info = skills_por_id.get(skill_id, {"nombre": "Desconocido", "tipo": ""})
            skills.append({
                "skill_id": skill_id, "nombre": info["nombre"], "tipo": info["tipo"],
                "employee": promedio(roles["Employee"]), "leader": promedio(roles["Leader"]),
                "peer": promedio(roles["Peer"]), "promedio": promedio(todas),
            })
        return skills

    print("Calculando dashboards de Lider...")
    lideres_ids = set(p["lider_id"] for p in personas if p["lider_id"])
    dashboards_lider = []
    for lider_id in lideres_ids:
        equipo = descendientes(lider_id)
        equipo_ids = set(p["id"] for p in equipo)
        evals_equipo = [e for e in evaluaciones if e["evaluado_id"] in equipo_ids]

        resultado_equipo = []
        for persona in equipo:
            evals_persona = [e for e in evals_equipo if e["evaluado_id"] == persona["id"]]
            skills = calcular_skills(evals_persona)
            por_categoria = {}
            for s in skills:
                if s["promedio"] is not None:
                    por_categoria.setdefault(s["tipo"], []).append(s["promedio"])
            resultado_equipo.append({
                "id": persona["id"], "nombre": persona["nombre"], "area": persona["area"],
                "perfil_rol": persona["perfil_rol"],
                "promedio_general": promedio([s["promedio"] for s in skills]),
                "promedio_por_categoria": {k: promedio(v) for k, v in por_categoria.items()},
                "skills": skills,
            })

        todas_skills = [dict(s, persona=p["nombre"]) for p in resultado_equipo for s in p["skills"]]
        top_gaps = sorted([s for s in todas_skills if s["promedio"] is not None],
                           key=lambda s: s["promedio"])[:8]

        dashboards_lider.append({
            "lider_id": lider_id,
            "data": {
                "lider": {"id": lider_id, "nombre": personas_por_id[lider_id]["nombre"]},
                "equipo": resultado_equipo,
                "top_gaps": top_gaps,
            }
        })

    print("Calculando dashboards Personales...")
    evaluables = [p for p in personas if p["perfil_rol"]]
    dashboards_personal = []
    for persona in evaluables:
        evals_persona = [e for e in evaluaciones if e["evaluado_id"] == persona["id"]]
        companeros_area_ids = {p["id"] for p in personas if p["area"] == persona["area"] and p["id"] != persona["id"]}
        evals_area = [e for e in evaluaciones if e["evaluado_id"] in companeros_area_ids]

        por_skill = {}
        for e in evals_persona:
            if e["skill_id"] is None:
                continue
            por_skill.setdefault(e["skill_id"], {"Employee": [], "Leader": [], "Peer": []})
            if e["rol"] in por_skill[e["skill_id"]]:
                por_skill[e["skill_id"]][e["rol"]].append(e["puntaje"])

        skills = []
        for skill_id, roles in por_skill.items():
            todas = roles["Employee"] + roles["Leader"] + roles["Peer"]
            info = skills_por_id.get(skill_id, {"nombre": "Desconocido", "tipo": "", "descripcion": ""})
            puntajes_area = [e["puntaje"] for e in evals_area if e["skill_id"] == skill_id]
            skills.append({
                "skill_id": skill_id, "nombre": info["nombre"], "tipo": info["tipo"],
                "descripcion": info.get("descripcion", ""),
                "employee": promedio(roles["Employee"]), "leader": promedio(roles["Leader"]),
                "peer": promedio(roles["Peer"]), "promedio": promedio(todas),
                "promedio_area": promedio(puntajes_area),
            })

        por_categoria = {}
        for s in skills:
            if s["promedio"] is not None:
                por_categoria.setdefault(s["tipo"], []).append(s["promedio"])

        gaps = sorted([s for s in skills if s["promedio"] is not None], key=lambda s: s["promedio"])[:5]

        dashboards_personal.append({
            "persona_id": persona["id"],
            "data": {
                "persona": persona,
                "skills": skills,
                "promedio_por_categoria": {k: promedio(v) for k, v in por_categoria.items()},
                "promedio_general": promedio([s["promedio"] for s in skills]),
                "gaps_prioritarios": gaps,
            }
        })

    print("Limpiando cache anterior...")
    cache_existente = fetch_all(cache_table_id)
    if cache_existente:
        delete_all(cache_table_id, [r["id"] for r in cache_existente])

    ahora = datetime.datetime.utcnow().isoformat()
    registros = (
        [{"Tipo": "Lider", "Referencia_ID": d["lider_id"], "Datos_JSON": json.dumps(d["data"], ensure_ascii=False), "Actualizado": ahora} for d in dashboards_lider]
        + [{"Tipo": "Personal", "Referencia_ID": d["persona_id"], "Datos_JSON": json.dumps(d["data"], ensure_ascii=False), "Actualizado": ahora} for d in dashboards_personal]
    )
    total = create_records(cache_table_id, registros)
    print(f"\nListo. {total} dashboards guardados en cache ({len(dashboards_lider)} de lider, {len(dashboards_personal)} personales).")
