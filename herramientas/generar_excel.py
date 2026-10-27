"""
Genera excel/CDP-Datos-prueba.xlsx: el almacenamiento de la herramienta, con
datos INVENTADOS.

Uso:
    python herramientas/generar_excel.py <ruta a demo.json del MVP>

Convenciones que el script de Excel (servidor/motor.ts) da por hechas, y que
hay que respetar al cargar los datos reales:

- Una hoja por tabla, con una tabla de Excel del MISMO nombre que empieza en A1.
- La primera columna de cada tabla es su identificador o, en las tablas de
  relación, la primera parte de la clave. Una fila con esa celda vacía se ignora.
- Los encabezados no se traducen ni se renombran: el motor los busca por nombre.
  Se pueden agregar columnas nuevas al final; el motor las ignora.
- Verdadero/falso se guarda como booleano de Excel (VERDADERO/FALSO). El motor
  también acepta "sí"/"no" escritos a mano.
- Las fechas que usa el motor van en milisegundos (columnas ts_*). Las columnas
  "fecha" son solo para leer en Excel.

Los correos son @example.com, un dominio reservado que nunca entrega correo.
Para probar el ingreso, cambia el correo de las personas con las que quieras
entrar por uno real (sirve el tuyo con alias: nombre+lider@empresa.com).
"""

import json
import sys
import unicodedata
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "excel" / "CDP-Datos-prueba.xlsx"

# --------------------------------------------------------------------------
# Esquema: tabla -> columnas. Es el contrato con servidor/motor.ts.
# --------------------------------------------------------------------------
ESQUEMA = {
    "Config": ["clave", "valor", "nota"],
    "Modelo": ["clave", "valor_json"],
    "Habilidades": ["id", "nombre", "tipo", "departamento", "descripcion",
                    "nivel_basico", "nivel_intermedio", "nivel_avanzado", "nivel_experto",
                    "activa", "oculto"],
    "Cargos": ["id", "nombre", "area", "oculto"],
    "CargoHabilidades": ["cargo_id", "skill_id", "nivel_esperado"],
    "Equipos": ["id", "nombre", "area", "lider_id", "lider_interino_id", "oculto"],
    "Personas": ["id", "nombre", "correo", "cargo_id", "equipo_id", "area", "activo", "oculto"],
    "Administradores": ["persona_id", "activo"],
    "Pares": ["evaluador_id", "evaluado_id", "ronda_id", "activo"],
    "Evaluaciones": ["ronda_id", "evaluado_id", "evaluador_id", "rol", "skill_id", "puntaje", "ts", "fecha", "anulada"],
    "Planes": ["id", "persona_id", "titulo", "objetivo", "propuesta", "skill_ids",
               "autor_id", "ts_creado", "ts_editado", "oculto"],
    "Codigos": ["correo", "codigo", "ts_creado", "ts_expira", "intentos", "usado"],
    "Sesiones": ["token", "persona_id", "ts_creado", "ts_expira", "activa"],
    "Auditoria": ["ts", "fecha", "actor_id", "actor_nombre", "accion", "entidad", "entidad_id",
                  "entidad_nombre", "campo", "antes", "despues", "equipo_id", "detalle"],
}

# Columnas de texto: se formatean como texto para que Excel no convierta un id
# o un código en número o en fecha al escribir encima.
NO_TEXTO = {"activa", "oculto", "activo", "usado", "anulada", "puntaje", "intentos", "codigo",
            "ts", "ts_creado", "ts_expira", "ts_editado", "fecha"}

NIVEL_COL = {"Basic": "nivel_basico", "Intermediate": "nivel_intermedio",
             "Advanced": "nivel_avanzado", "Expert": "nivel_experto"}

RONDA_ID = "R2026-1"
TS_BASE = 1767225600000  # 2026-01-01T00:00:00Z: las evaluaciones de prueba llevan esta marca


def slug(texto):
    t = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode()
    return t.lower().strip().replace(" ", ".")


def correo_de(nombre):
    return f"{slug(nombre)}@example.com"


def construir(demo):
    filas = {t: [] for t in ESQUEMA}

    filas["Config"] = [
        ["ronda_id", RONDA_ID, "Ronda activa. Las evaluaciones y los pares se guardan con este id."],
        ["ronda_nombre", "Piloto 2026", "Nombre que ve la gente."],
        ["ronda_inicio", "2026-11-03", ""],
        ["ronda_cierre", "2026-12-12", ""],
        ["ronda_abierta", True, "FALSO cierra la ronda: nadie puede enviar ni cambiar evaluaciones."],
        ["sesion_horas", 8, "Cuánto dura una sesión antes de pedir otro código."],
        ["codigo_minutos", 10, "Cuánto vale un código de ingreso."],
        ["codigo_intentos", 5, "Intentos fallidos antes de invalidar el código."],
        ["codigo_espera_segundos", 60, "Tiempo mínimo entre dos códigos al mismo correo."],
        ["codigo_max_hora", 5, "Códigos por correo y por hora."],
        ["nombre_herramienta", "Desarrollo de Carrera", "Asunto y firma del correo."],
    ]

    for clave, valor in demo["modelo"].items():
        filas["Modelo"].append([clave, json.dumps(valor, ensure_ascii=False)])

    for s in demo["catalogo"]:
        niveles = s.get("niveles") or {}
        filas["Habilidades"].append([
            s["id"], s["nombre"], s["tipo"], s.get("departamento") or "", s.get("descripcion") or "",
            niveles.get("Basic", ""), niveles.get("Intermediate", ""),
            niveles.get("Advanced", ""), niveles.get("Expert", ""),
            bool(s.get("activa", True)), False,
        ])

    for c in demo["cargos"]:
        filas["Cargos"].append([c["id"], c["nombre"], c["area"], False])
        for h in c["habilidades"]:
            filas["CargoHabilidades"].append([c["id"], h["skill_id"], h["nivel_esperado"]])

    personas = list(demo["personas"])
    por_nombre = {p["nombre"]: p for p in personas}

    # Dos personas que el MVP no tenía y la producción sí necesita: quien dirige
    # a los líderes de área (sin ella, la evaluación de líder de los líderes de
    # área no tenía autor) y la administradora de la herramienta.
    directora = {"id": "gabriela-montoya", "nombre": "Gabriela Montoya", "area": "Dirección",
                 "cargo_id": None, "lider_id": None}
    personas.append(directora)
    por_nombre[directora["nombre"]] = directora
    por_nombre["Dirección de área"] = directora

    equipos = {}

    def equipo_de(lider_id):
        if lider_id is None:
            return None
        if lider_id not in equipos:
            lider = next(p for p in personas if p["id"] == lider_id)
            area = lider.get("area") or ""
            equipos[lider_id] = {"id": f"eq-{lider_id}", "nombre": f"{area} · equipo de {lider['nombre']}",
                                 "area": area, "lider_id": lider_id}
        return equipos[lider_id]["id"]

    for p in personas:
        if p["id"] in ("gabriela-montoya", "fabian-otero"):
            continue
        lider = p.get("lider_id") or ("gabriela-montoya" if p.get("cargo_id") else None)
        eq = equipo_de(lider)
        if p["id"] == "gabriela-montoya" or lider == "gabriela-montoya":
            equipos["gabriela-montoya"]["nombre"] = "Dirección de Operaciones"
            equipos["gabriela-montoya"]["area"] = "Dirección"
        p["_equipo"] = eq

    for e in equipos.values():
        filas["Equipos"].append([e["id"], e["nombre"], e["area"], e["lider_id"], "", False])

    for p in personas:
        filas["Personas"].append([
            p["id"], p["nombre"], correo_de(p["nombre"]), p.get("cargo_id") or "",
            p.get("_equipo") or "", p.get("area") or "", True, False,
        ])
        if "rrhh" in (p.get("roles") or []):
            filas["Administradores"].append([p["id"], True])

    for p in demo["personas"]:
        for par in p.get("evalua_como_par") or []:
            filas["Pares"].append([p["id"], par, RONDA_ID, True])

    sin_autor = set()
    for i, e in enumerate(demo["evaluaciones"]):
        autor = por_nombre.get(e["evaluador"])
        if not autor:
            sin_autor.add(e["evaluador"])
            continue
        filas["Evaluaciones"].append([
            RONDA_ID, e["persona_id"], autor["id"], e["rol"], e["skill_id"], e["puntaje"],
            TS_BASE + i * 1000, None, False,
        ])
    if sin_autor:
        raise SystemExit(f"Evaluaciones con autor desconocido: {sorted(sin_autor)}")

    return filas


def escribir(filas):
    wb = Workbook()
    wb.remove(wb.active)
    cabecera = Font(bold=True, color="FAFAFA")
    fondo = PatternFill("solid", fgColor="081339")

    for tabla, columnas in ESQUEMA.items():
        ws = wb.create_sheet(tabla)
        ws.append(columnas)
        datos = filas[tabla]
        for f in datos:
            ws.append(f)
        # Una tabla de Excel necesita al menos una fila de datos. Las tablas que
        # nacen vacías (sesiones, códigos, auditoría) llevan una fila en blanco;
        # el motor ignora las filas sin identificador.
        ultima = max(2, len(datos) + 1)
        ref = f"A1:{get_column_letter(len(columnas))}{ultima}"
        t = Table(displayName=tabla, ref=ref)
        t.tableStyleInfo = TableStyleInfo(name="TableStyleLight9", showRowStripes=True)
        ws.add_table(t)

        for j, col in enumerate(columnas, start=1):
            letra = get_column_letter(j)
            ws[f"{letra}1"].font = cabecera
            ws[f"{letra}1"].fill = fondo
            ancho = max(len(col) + 2, min(60, max((len(str(f[j - 1] or "")) for f in datos), default=0) + 2))
            ws.column_dimensions[letra].width = min(ancho, 60)
            if col not in NO_TEXTO:
                for fila in range(2, ultima + 1):
                    ws[f"{letra}{fila}"].number_format = "@"
        ws.freeze_panes = "A2"

    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    wb.save(SALIDA)


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    demo = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    filas = construir(demo)
    escribir(filas)
    print(f"{SALIDA.relative_to(RAIZ)}")
    for t, f in filas.items():
        print(f"  {t:<17} {len(f):>5} filas")


if __name__ == "__main__":
    main()
