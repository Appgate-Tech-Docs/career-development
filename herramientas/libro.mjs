/* =========================================================================
   LIBRO — el Excel de prueba en memoria, con la misma interfaz que Excel
   =========================================================================
   Implementa la `Fuente` que espera servidor/motor.ts sobre las tablas del
   archivo .xlsx, y carga el motor compilado. Lo usan el servidor local y las
   pruebas: así lo que se prueba es el mismo código que corre en Excel.
   ========================================================================= */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import ExcelJS from 'exceljs';

// exceljs no resuelve la ruta absoluta (/xl/tables/...) con que openpyxl y
// Excel enlazan las tablas, y se cae leyendo una tabla que no encontró. Acá
// no hacen falta sus objetos de tabla —cada hoja ES su tabla, desde A1—, así
// que se descartan las que no pudo leer.
{
  const Worksheet = createRequire(import.meta.url)('exceljs/lib/doc/worksheet.js');
  const d = Object.getOwnPropertyDescriptor(Worksheet.prototype, 'model');
  Object.defineProperty(Worksheet.prototype, 'model', {
    ...d,
    set(v) { d.set.call(this, { ...v, tables: (v.tables ?? []).filter(Boolean) }); },
  });
}

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
export const XLSX_PRUEBA = join(RAIZ, 'excel', 'CDP-Datos-prueba.xlsx');

/** El motor compilado (npm run compilar). Devuelve la función `ejecutar`. */
export function cargarMotor() {
  const ruta = join(RAIZ, 'herramientas', 'compilado', 'motor.js');
  if (!existsSync(ruta)) throw new Error('Falta el motor compilado: corre "npm run compilar".');
  const codigo = readFileSync(ruta, 'utf8');
  // El archivo es un script de Office Scripts (sin módulos): se evalúa en un
  // ámbito propio y se toma la función de entrada que no depende de Excel.
  // eslint-disable-next-line no-new-func
  return new Function(`${codigo}\nreturn ejecutar;`)();
}

function valorDeCelda(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('result' in v) return valorDeCelda(v.result);
    if ('text' in v) return String(v.text);
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if (v instanceof Date) return v.toISOString();
    return String(v);
  }
  return v;
}

/** Lee todas las hojas: { tabla: { columnas, valores } }. */
export async function leerLibro(ruta = XLSX_PRUEBA) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(ruta);
  const tablas = {};
  wb.eachSheet((ws) => {
    const columnas = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (c, j) => { columnas[j - 1] = String(valorDeCelda(c.value)); });
    const valores = [];
    for (let i = 2; i <= ws.rowCount; i += 1) {
      const fila = ws.getRow(i);
      valores.push(columnas.map((_, j) => valorDeCelda(fila.getCell(j + 1).value)));
    }
    tablas[ws.name] = { columnas, valores };
  });
  return tablas;
}

/** Fuente en memoria sobre un objeto de tablas. Muta el objeto. */
export function fuenteSobre(tablas) {
  return {
    leer(nombre) {
      const t = tablas[nombre];
      if (!t) throw new Error(`CDP|configuracion|Falta la tabla ${nombre} en el libro.`);
      return { columnas: [...t.columnas], valores: t.valores.map((f) => [...f]) };
    },
    agregarFilas(nombre, valores) { tablas[nombre].valores.push(...valores.map((f) => [...f])); },
    actualizarFila(nombre, indice, valores) { tablas[nombre].valores[indice] = [...valores]; },
  };
}

/** Lo que el flujo pone como entropía: concat(guid(), guid(), guid()). */
export const entropia = () => `${randomUUID()}${randomUUID()}${randomUUID()}`;
