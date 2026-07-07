"""
Genera 50 personas con jerarquia de 4 niveles (CEO -> Directores -> Managers -> Colaboradores)
distribuidas en las 8 areas del catalogo de skills, y las carga en Airtable respetando
el orden (primero los lideres, para poder enlazar el campo Lider).

Uso:
    $env:AIRTABLE_TOKEN="pat..."
    python generate_personas.py
"""

import os
import requests

TOKEN = os.environ["AIRTABLE_TOKEN"]
BASE_ID = "app67VJvBnXq015CI"
TABLES = {"Personas": "tblJAsLi0lvyhkD5h"}
API_ROOT = "https://api.airtable.com/v0"
HEADERS = {"Authorization": f"Bearer {TOKEN}", "Content-Type": "application/json"}

AREAS = ["Cloud", "Engineering", "Sales", "Marketing", "Support", "HR", "Product", "CustomerSuccess"]

NOMBRES = [
    "Laura Gomez", "Andres Ramirez", "Camila Torres", "Diego Herrera", "Valentina Cruz",
    "Santiago Molina", "Isabella Ortiz", "Mateo Vargas", "Sofia Castro", "Nicolas Rojas",
    "Daniela Pena", "Sebastian Diaz", "Gabriela Reyes", "Alejandro Morales", "Paula Jimenez",
    "Tomas Guzman", "Antonia Salazar", "Felipe Aguilar", "Manuela Rios", "Julian Medina",
    "Renata Contreras", "Emilio Suarez", "Martina Navarro", "Joaquin Delgado", "Victoria Paredes",
    "Cristian Beltran", "Luciana Zapata", "Esteban Cordoba", "Fernanda Nunez", "Ivan Restrepo",
    "Carolina Escobar", "Ricardo Mesa", "Adriana Puentes", "Marco Villegas", "Natalia Cardenas",
    "Oscar Trujillo", "Ximena Barrios", "Leonardo Gil", "Melissa Duarte", "Rodrigo Sepulveda",
    "Catalina Lozano", "Hernan Quintero", "Vanessa Acosta", "Cesar Bermudez", "Angela Fajardo",
    "Simon Pineda", "Tatiana Cabrera", "Miguel Bonilla", "Paola Sanchez", "Alvaro Rincon",
]

TITULO_POR_NIVEL = {"director": "Director", "manager": "Manager", "ic": "Especialista"}


def create_records(fields_list):
    url = f"{API_ROOT}/{BASE_ID}/{TABLES['Personas']}"
    created = []
    for i in range(0, len(fields_list), 10):
        batch = fields_list[i:i + 10]
        r = requests.post(url, headers=HEADERS, json={"records": [{"fields": f} for f in batch]})
        if r.status_code >= 300:
            print("ERROR:", r.status_code, r.text)
        r.raise_for_status()
        created.extend(r.json()["records"])
    return created


if __name__ == "__main__":
    nombres_iter = iter(NOMBRES)

    # Nivel 0: CEO
    ceo = create_records([{
        "Nombre": "Ricardo Fernandez", "Area": "Corporate", "Perfil_Rol": "",
        "Email": "ricardo.fernandez@example.com",
    }])[0]
    print("CEO creado:", ceo["fields"]["Nombre"])

    # Nivel 1: 1 Director por area (8 personas)
    directores = create_records([{
        "Nombre": f"{next(nombres_iter)} ({TITULO_POR_NIVEL['director']} {area})",
        "Area": area, "Perfil_Rol": area,
        "Email": f"director.{area.lower()}@example.com",
        "Lider": [ceo["id"]],
    } for area in AREAS])
    print(f"{len(directores)} directores creados")

    # Nivel 2: 2 Managers por area (16 personas)
    managers = []
    for area, director in zip(AREAS, directores):
        managers += create_records([{
            "Nombre": f"{next(nombres_iter)} ({TITULO_POR_NIVEL['manager']} {area})",
            "Area": area, "Perfil_Rol": area,
            "Email": f"manager{i}.{area.lower()}@example.com",
            "Lider": [director["id"]],
        } for i in range(1, 3)])
    print(f"{len(managers)} managers creados")

    # Nivel 3: Colaboradores repartidos entre managers hasta completar 50 personas en total
    total_creado = 1 + len(directores) + len(managers)
    restantes = 50 - total_creado
    colaboradores_fields = []
    for i in range(restantes):
        manager = managers[i % len(managers)]
        area = manager["fields"]["Area"]
        colaboradores_fields.append({
            "Nombre": next(nombres_iter),
            "Area": area, "Perfil_Rol": area,
            "Email": f"colaborador{i}.{area.lower()}@example.com",
            "Lider": [manager["id"]],
        })
    colaboradores = create_records(colaboradores_fields)
    print(f"{len(colaboradores)} colaboradores creados")

    print("\nTotal personas en la base:", 1 + len(directores) + len(managers) + len(colaboradores))
    print("Revisa la base:", f"https://airtable.com/{BASE_ID}")
