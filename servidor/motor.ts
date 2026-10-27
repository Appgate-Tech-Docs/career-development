/* =========================================================================
   MOTOR — toda la lógica del lado del servidor, en un solo Office Script
   =========================================================================

   Corre de dos formas, con el MISMO archivo:

   1. En producción, como Office Script dentro de Excel en OneDrive. El flujo
      de Power Automate recibe la petición HTTP, ejecuta este script sobre el
      libro CDP-Datos.xlsx con la acción "Ejecutar script" y devuelve lo que el
      script responde. La función `main` es la entrada de Excel.

   2. En desarrollo, dentro de herramientas/servidor-local.mjs, que compila
      este archivo con TypeScript y llama a `ejecutar` sobre el mismo libro.

   QUIÉN VE QUÉ SE DECIDE ACÁ Y EN NINGÚN OTRO LUGAR. El front está publicado
   en GitHub Pages y cualquiera puede leer su código o llamar al flujo a mano:
   todo lo que el front oculta es comodidad, no seguridad. Cada respuesta se
   arma a partir de la sesión validada, nunca de lo que la petición dice ser.

   Reglas de Office Scripts que este archivo respeta: nada de `any`, nada de
   import/export, tipos explícitos en todos los parámetros, y `main` recibe y
   devuelve solo texto.
   ========================================================================= */

type Valor = string | number | boolean;
interface Fila { [columna: string]: Valor; }

interface Tabla {
  columnas: string[];
  filas: Fila[];          // solo filas con identificador; cada una sabe su índice en `__i`
  total: number;          // filas de datos en el libro, contando las vacías
  originales: Valor[][];  // lo leído, para escribir después solo las celdas que cambian
}

/** Lo que el motor necesita del libro. Excel y el servidor local lo implementan. */
interface Fuente {
  leer(tabla: string): { columnas: string[]; valores: Valor[][] };
  agregarFilas(tabla: string, valores: Valor[][]): void;
  actualizarCelda(tabla: string, fila: number, columna: number, valor: Valor): void;
}

interface Correo { para: string; asunto: string; html: string; }

interface Salida {
  respuesta: Respuesta;
  correo: Correo | null;   // el flujo lo envía y NUNCA lo devuelve al navegador
}

interface Respuesta { ok: boolean; error?: { codigo: string; mensaje: string }; [clave: string]: unknown; }

interface Peticion {
  accion?: string;
  token?: string;
  datos?: { [clave: string]: unknown };
}

interface Usuario {
  id: string;
  nombre: string;
  fila: Fila;
  admin: boolean;
  token: string;
}

/* -------------------------------------------------------------------------
   Contexto de una ejecución: lee cada tabla una sola vez y acumula escrituras
   ------------------------------------------------------------------------- */

class Contexto {
  fuente: Fuente;
  ahora: number;
  entropia: string;
  cache: Map<string, Tabla> = new Map();
  nuevas: Map<string, Fila[]> = new Map();
  cambiadas: Map<string, Map<number, Fila>> = new Map();
  configCache: Map<string, Valor> | null = null;

  constructor(fuente: Fuente, ahora: number, entropia: string) {
    this.fuente = fuente;
    this.ahora = ahora;
    this.entropia = entropia;
  }

  tabla(nombre: string): Tabla {
    const hit = this.cache.get(nombre);
    if (hit) return hit;
    const crudo = this.fuente.leer(nombre);
    const columnas = crudo.columnas.map((c) => String(c).trim());
    const filas: Fila[] = [];
    crudo.valores.forEach((v, i) => {
      if (v[0] === '' || v[0] === null || v[0] === undefined) return;
      const f: Fila = { __i: i };
      columnas.forEach((c, j) => { f[c] = v[j] === undefined || v[j] === null ? '' : v[j]; });
      filas.push(f);
    });
    const t: Tabla = { columnas, filas, total: crudo.valores.length, originales: crudo.valores };
    this.cache.set(nombre, t);
    return t;
  }

  filas(nombre: string): Fila[] { return this.tabla(nombre).filas; }

  agregar(nombre: string, f: Fila): Fila {
    const t = this.tabla(nombre);
    f.__i = t.total;
    t.total += 1;
    t.filas.push(f);
    const lista = this.nuevas.get(nombre) ?? [];
    lista.push(f);
    this.nuevas.set(nombre, lista);
    return f;
  }

  marcar(nombre: string, f: Fila): void {
    const indice = Number(f.__i);
    // Una fila agregada en esta misma ejecución todavía no existe en el libro:
    // se escribe completa al volcar, con sus valores finales.
    if ((this.nuevas.get(nombre) ?? []).indexOf(f) >= 0) return;
    const m = this.cambiadas.get(nombre) ?? new Map<number, Fila>();
    m.set(indice, f);
    this.cambiadas.set(nombre, m);
  }

  /**
   * Escribe solo las celdas que cambiaron, no la fila entera. El flujo no puede
   * serializar las peticiones (Power Automate no permite control de
   * simultaneidad con una acción Respuesta), así que dos ejecuciones pueden
   * cruzarse: escribiendo celda por celda, una no pisa con valores viejos lo
   * que la otra cambió en otra columna de la misma fila.
   */
  volcar(): void {
    this.cambiadas.forEach((m, nombre) => {
      const t = this.tabla(nombre);
      m.forEach((f, i) => {
        const antes = t.originales[i] ?? [];
        t.columnas.forEach((c, j) => {
          const valor = valorCelda(f[c]);
          if (valor !== valorCelda(antes[j])) this.fuente.actualizarCelda(nombre, i, j, valor);
        });
      });
    });
    this.nuevas.forEach((lista, nombre) => {
      const t = this.tabla(nombre);
      if (lista.length) this.fuente.agregarFilas(nombre, lista.map((f) => t.columnas.map((c) => valorCelda(f[c]))));
    });
  }

  config(clave: string, porDefecto: Valor): Valor {
    if (!this.configCache) {
      this.configCache = new Map();
      for (const f of this.filas('Config')) this.configCache.set(texto(f.clave), f.valor);
    }
    const v = this.configCache.get(clave);
    return v === undefined || v === '' ? porDefecto : v;
  }

  numero(clave: string, porDefecto: number): number {
    const n = Number(this.config(clave, porDefecto));
    return Number.isFinite(n) ? n : porDefecto;
  }
}

/* -------------------------------------------------------------------------
   Utilidades
   ------------------------------------------------------------------------- */

function texto(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** Booleano tolerante: lo que Excel guarda y lo que alguien escribe a mano. */
function verdadero(v: unknown): boolean {
  if (v === true) return true;
  if (v === false || v === null || v === undefined) return false;
  if (typeof v === 'number') return v !== 0;
  const t = String(v).trim().toLowerCase();
  return ['true', 'verdadero', 'si', 'sí', 'x', '1', 'yes'].indexOf(t) >= 0;
}

function valorCelda(v: Valor | undefined): Valor {
  return v === undefined || v === null ? '' : v;
}

function fallar(codigo: string, mensaje: string): never {
  throw new Error(`CDP|${codigo}|${mensaje}`);
}

function normalizarCorreo(v: unknown): string {
  return texto(v).toLowerCase();
}

function recortar(v: unknown, max: number): string {
  const t = texto(v);
  return t.length > max ? t.slice(0, max) : t;
}

function slug(t: string): string {
  const sinTildes = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return sinTildes.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'registro';
}

function fechaLegible(ms: number): string {
  // Texto y no fecha de Excel a propósito: es solo para quien lee la hoja.
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

const NIVELES = ['Basic', 'Intermediate', 'Advanced', 'Expert'];
const TIPOS = ['Funcion', 'Soft Skill', 'Hard Skill'];
const COL_NIVEL: { [n: string]: string } = {
  Basic: 'nivel_basico', Intermediate: 'nivel_intermedio', Advanced: 'nivel_avanzado', Expert: 'nivel_experto',
};

/* -------------------------------------------------------------------------
   Entrada en Excel
   ------------------------------------------------------------------------- */

/**
 * @param peticion  el cuerpo HTTP tal como llega al flujo (texto JSON)
 * @param entropia  aleatoriedad que pone el flujo: concat(guid(), guid(), guid())
 * @returns         JSON con { respuesta, correo }. El flujo envía `correo` si
 *                  viene y responde al navegador SOLO con `respuesta`.
 */
function main(workbook: ExcelScript.Workbook, peticion: string, entropia: string): string {
  // Office Scripts vuelve asíncronas por su cuenta las llamadas a Excel, pero
  // solo las que ve escritas directamente en `main`. Si se hacen desde los
  // métodos de un objeto (la Fuente), llegan sin esperar y devuelven vacío.
  // Por eso todo el acceso a Excel está acá: se lee cada tabla al empezar, el
  // motor trabaja en memoria y anota lo que hay que escribir, y al final se
  // escribe.
  const libro: { [tabla: string]: { columnas: string[]; valores: Valor[][] } } = {};
  for (const nombre of TABLAS) {
    const t = workbook.getTable(nombre);
    if (!t) continue;   // el motor responde "Falta la tabla" si la necesita
    const columnas = t.getHeaderRowRange().getValues()[0].map((c) => String(c));
    const valores = t.getRowCount() > 0 ? t.getRangeBetweenHeaderAndTotal().getValues() : [];
    libro[nombre] = { columnas, valores };
  }

  const celdas: { tabla: string; fila: number; columna: number; valor: Valor }[] = [];
  const filasNuevas: { tabla: string; valores: Valor[][] }[] = [];
  const fuente: Fuente = {
    leer(nombre: string) {
      const t = libro[nombre];
      if (!t) fallar('configuracion', `Falta la tabla ${nombre} en el libro.`);
      return { columnas: t.columnas.slice(), valores: t.valores.map((f) => f.slice()) };
    },
    agregarFilas(nombre: string, valores: Valor[][]) { filasNuevas.push({ tabla: nombre, valores }); },
    actualizarCelda(nombre: string, fila: number, columna: number, valor: Valor) {
      celdas.push({ tabla: nombre, fila, columna, valor });
    },
  };

  const salida = ejecutar(fuente, peticion, entropia, Date.now());

  for (const c of celdas) {
    const t = workbook.getTable(c.tabla);
    if (t) t.getRangeBetweenHeaderAndTotal().getCell(c.fila, c.columna).setValue(c.valor);
  }
  for (const n of filasNuevas) {
    const t = workbook.getTable(n.tabla);
    if (t) t.addRows(-1, n.valores);
  }
  return salida;
}

/** Las tablas que el motor usa; `main` las lee todas al empezar. */
const TABLAS = [
  'Config', 'Modelo', 'Habilidades', 'Cargos', 'CargoHabilidades', 'Equipos', 'Personas',
  'Administradores', 'Pares', 'Evaluaciones', 'Planes', 'Codigos', 'Sesiones', 'Auditoria',
];

/* -------------------------------------------------------------------------
   Despacho
   ------------------------------------------------------------------------- */

function ejecutar(fuente: Fuente, cuerpo: string, entropia: string, ahora: number): string {
  const ctx = new Contexto(fuente, ahora, limpiarEntropia(entropia));
  let salida: Salida;
  try {
    const p = leerPeticion(cuerpo);
    salida = despachar(ctx, p);
    ctx.volcar();
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    // La pila solo trae ubicaciones en este código, que ya es público, y es lo
    // único que permite saber dónde falló cuando corre dentro de Excel.
    const pila = e instanceof Error && e.stack ? e.stack.split('\n').slice(0, 6).join(' | ') : '';
    const partes = m.split('|');
    salida = partes[0] === 'CDP'
      ? { respuesta: { ok: false, error: { codigo: partes[1], mensaje: partes.slice(2).join('|') } }, correo: null }
      : { respuesta: { ok: false, error: { codigo: 'interno', mensaje: 'Algo falló del lado del servidor.' }, detalle: m, pila }, correo: null };
  }
  return JSON.stringify(salida);
}

function despachar(ctx: Contexto, p: Peticion): Salida {
  const accion = texto(p.accion);
  const d = p.datos ?? {};
  const sinCorreo = (r: Respuesta): Salida => ({ respuesta: r, correo: null });

  // Lo único que se puede pedir sin sesión.
  if (accion === 'solicitarCodigo') return solicitarCodigo(ctx, d);
  if (accion === 'verificarCodigo') return sinCorreo(verificarCodigo(ctx, d));

  const u = sesionValida(ctx, texto(p.token));

  switch (accion) {
    case 'salir': return sinCorreo(salir(ctx, u));
    case 'inicio': return sinCorreo(inicio(ctx, u));
    case 'guardarEvaluacion': return sinCorreo(guardarEvaluacion(ctx, u, d));
    case 'guardarPlan': return sinCorreo(guardarPlan(ctx, u, d));
    case 'borrarPlan': return sinCorreo(borrarPlan(ctx, u, d));
    default: break;
  }

  if (accion.indexOf('admin.') === 0) {
    if (!u.admin) fallar('permiso', 'Esta acción es solo para administradores.');
    switch (accion) {
      case 'admin.actualizar': return sinCorreo(adminActualizar(ctx, u, d));
      case 'admin.crear': return sinCorreo(adminCrear(ctx, u, d));
      case 'admin.cargoHabilidad': return sinCorreo(adminCargoHabilidad(ctx, u, d));
      case 'admin.par': return sinCorreo(adminPar(ctx, u, d));
      case 'admin.administrador': return sinCorreo(adminAdministrador(ctx, u, d));
      case 'admin.anularEvaluacion': return sinCorreo(adminAnularEvaluacion(ctx, u, d));
      case 'admin.auditoria': return sinCorreo(adminAuditoria(ctx, d));
      default: break;
    }
  }
  return fallar('accion', `Acción desconocida: ${accion || '(vacía)'}.`);
}

/* -------------------------------------------------------------------------
   Lectura de la petición
   -------------------------------------------------------------------------
   El front envía JSON como text/plain a propósito: así el navegador no hace
   la consulta previa de CORS (OPTIONS), que el disparador HTTP de Power
   Automate no atiende. Según cómo lo entregue el flujo, el cuerpo llega como
   texto JSON o envuelto en { "$content": base64 }: se aceptan las dos.
   ------------------------------------------------------------------------- */

function leerPeticion(cuerpo: string): Peticion {
  let t = texto(cuerpo);
  if (!t) fallar('peticion', 'La petición llegó vacía.');
  for (let vuelta = 0; vuelta < 3; vuelta += 1) {
    let o: unknown;
    try { o = JSON.parse(t) as unknown; } catch { return fallar('peticion', 'La petición no es JSON válido.'); }
    if (typeof o === 'string') { t = o; continue; }
    if (o && typeof o === 'object') {
      const env = o as { [k: string]: unknown };
      if (typeof env['$content'] === 'string') { t = decodificarBase64(String(env['$content'])); continue; }
      return o as Peticion;
    }
    break;
  }
  return fallar('peticion', 'La petición no tiene el formato esperado.');
}

function decodificarBase64(b64: string): string {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const limpio = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < limpio.length; i += 4) {
    const n = [0, 1, 2, 3].map((k) => (i + k < limpio.length ? alfabeto.indexOf(limpio[i + k]) : -1));
    bytes.push((n[0] << 2) | (n[1] >> 4));
    if (n[2] >= 0) bytes.push(((n[1] & 15) << 4) | (n[2] >> 2));
    if (n[3] >= 0) bytes.push(((n[2] & 3) << 6) | n[3]);
  }
  // UTF-8 a texto, a mano: Office Scripts no garantiza TextDecoder.
  let s = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i];
    let cp = b; let largo = 1;
    if (b >= 0xf0) { cp = b & 7; largo = 4; } else if (b >= 0xe0) { cp = b & 15; largo = 3; } else if (b >= 0xc0) { cp = b & 31; largo = 2; }
    for (let k = 1; k < largo; k += 1) cp = (cp << 6) | (bytes[i + k] & 63);
    s += String.fromCodePoint(cp);
    i += largo;
  }
  return s;
}

function limpiarEntropia(e: string): string {
  return texto(e).toLowerCase().replace(/[^0-9a-f]/g, '');
}

/* -------------------------------------------------------------------------
   Ingreso: código al correo y sesión
   ------------------------------------------------------------------------- */

const MENSAJE_CODIGO = 'Si el correo está registrado, te llegará un código en unos segundos.';

function personaPorCorreo(ctx: Contexto, correo: string): Fila | null {
  return ctx.filas('Personas').find((p) => normalizarCorreo(p.correo) === correo) ?? null;
}

function solicitarCodigo(ctx: Contexto, d: { [k: string]: unknown }): Salida {
  const correo = normalizarCorreo(d.correo);
  // La respuesta es la misma exista o no el correo: si no, la pantalla de
  // ingreso serviría para averiguar quién trabaja en la empresa.
  const generica: Salida = { respuesta: { ok: true, mensaje: MENSAJE_CODIGO }, correo: null };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return generica;

  const p = personaPorCorreo(ctx, correo);
  if (!p || !verdadero(p.activo)) return generica;

  const espera = ctx.numero('codigo_espera_segundos', 60) * 1000;
  const maxHora = ctx.numero('codigo_max_hora', 5);
  const propios = ctx.filas('Codigos').filter((c) => normalizarCorreo(c.correo) === correo);
  const ultimaHora = propios.filter((c) => Number(c.ts_creado) > ctx.ahora - 3600000);
  if (ultimaHora.length >= maxHora) return generica;
  if (ultimaHora.some((c) => Number(c.ts_creado) > ctx.ahora - espera)) return generica;

  if (ctx.entropia.length < 56) fallar('configuracion', 'El flujo no está enviando la entropía (concat(guid(), guid(), guid())).');

  // Un código nuevo invalida los anteriores: solo vale el último que llegó.
  for (const c of propios) {
    if (!verdadero(c.usado)) { c.usado = true; ctx.marcar('Codigos', c); }
  }
  const codigo = (parseInt(ctx.entropia.slice(48, 56), 16) % 900000) + 100000;
  const minutos = ctx.numero('codigo_minutos', 10);
  ctx.agregar('Codigos', {
    correo, codigo, ts_creado: ctx.ahora, ts_expira: ctx.ahora + minutos * 60000, intentos: 0, usado: false,
  });

  const herramienta = texto(ctx.config('nombre_herramienta', 'Desarrollo de Carrera'));
  return {
    respuesta: generica.respuesta,
    correo: {
      para: correo,
      asunto: `${herramienta}: tu código de ingreso`,
      html: `<p>Hola, ${escaparHtml(texto(p.nombre).split(' ')[0])}:</p>`
        + `<p>Tu código para entrar a ${escaparHtml(herramienta)} es</p>`
        + `<p style="font-size:28px;font-weight:700;letter-spacing:4px;font-family:monospace">${codigo}</p>`
        + `<p>Vale ${minutos} minutos y sirve una sola vez. Si no lo pediste, ignora este correo: nadie puede entrar sin él.</p>`,
    },
  };
}

function verificarCodigo(ctx: Contexto, d: { [k: string]: unknown }): Respuesta {
  const correo = normalizarCorreo(d.correo);
  const codigo = texto(d.codigo).replace(/\D/g, '');
  // Se responde en lugar de lanzar: una excepción descarta las escrituras de la
  // ejecución, y el contador de intentos fallidos TIENE que quedar guardado o
  // se podría probar el millón de códigos sin que nunca se bloquee.
  const invalido = (): Respuesta => ({ ok: false, error: { codigo: 'codigo', mensaje: 'El código no es válido o ya venció. Pide uno nuevo.' } });

  const vigente = ctx.filas('Codigos')
    .filter((c) => normalizarCorreo(c.correo) === correo && !verdadero(c.usado) && Number(c.ts_expira) > ctx.ahora)
    .sort((a, b) => Number(b.ts_creado) - Number(a.ts_creado))[0];
  if (!vigente || !codigo) return invalido();

  if (String(vigente.codigo) !== codigo) {
    vigente.intentos = Number(vigente.intentos || 0) + 1;
    if (vigente.intentos >= ctx.numero('codigo_intentos', 5)) vigente.usado = true;
    ctx.marcar('Codigos', vigente);
    return invalido();
  }

  const p = personaPorCorreo(ctx, correo);
  if (!p || !verdadero(p.activo)) return invalido();

  vigente.usado = true;
  ctx.marcar('Codigos', vigente);

  const token = ctx.entropia.slice(0, 48);
  if (token.length < 48) fallar('configuracion', 'El flujo no está enviando la entropía.');
  const horas = ctx.numero('sesion_horas', 8);
  const expira = ctx.ahora + horas * 3600000;
  ctx.agregar('Sesiones', { token, persona_id: texto(p.id), ts_creado: ctx.ahora, ts_expira: expira, activa: true });
  auditar(ctx, { id: texto(p.id), nombre: texto(p.nombre) }, {
    accion: 'sesion.ingreso', entidad: 'persona', entidad_id: texto(p.id), entidad_nombre: texto(p.nombre),
  });
  return { ok: true, token, expira };
}

function sesionValida(ctx: Contexto, token: string): Usuario {
  const caducada = (): never => fallar('sesion', 'Tu sesión terminó. Vuelve a entrar.');
  if (!token || token.length < 32) return caducada();
  const s = ctx.filas('Sesiones').find((x) => texto(x.token) === token);
  if (!s || !verdadero(s.activa) || Number(s.ts_expira) <= ctx.ahora) return caducada();
  const p = persona(ctx, texto(s.persona_id));
  // Desactivar a alguien en la hoja Personas corta sus sesiones abiertas en la
  // siguiente petición, sin tener que buscarlas.
  if (!p || !verdadero(p.activo)) return caducada();
  return { id: texto(p.id), nombre: texto(p.nombre), fila: p, admin: esAdmin(ctx, texto(p.id)), token };
}

function salir(ctx: Contexto, u: Usuario): Respuesta {
  const s = ctx.filas('Sesiones').find((x) => texto(x.token) === u.token);
  if (s) { s.activa = false; ctx.marcar('Sesiones', s); }
  return { ok: true };
}

/* -------------------------------------------------------------------------
   Alcance: la única definición de quién ve a quién
   -------------------------------------------------------------------------
   Un líder ve a los miembros de los equipos que lidera, como titular o como
   interino. Nada más: ni los equipos de sus reportes ni los de otros líderes.

   Si un día la regla cambia (por ejemplo, ver también el equipo extendido),
   se cambia `equiposQueLidera` y nada más: el resto de las respuestas se
   arman a partir de ella.
   ------------------------------------------------------------------------- */

function persona(ctx: Contexto, id: string): Fila | null {
  return ctx.filas('Personas').find((p) => texto(p.id) === id) ?? null;
}

function equipo(ctx: Contexto, id: string): Fila | null {
  return id ? ctx.filas('Equipos').find((e) => texto(e.id) === id) ?? null : null;
}

function esAdmin(ctx: Contexto, id: string): boolean {
  return ctx.filas('Administradores').some((a) => texto(a.persona_id) === id && verdadero(a.activo));
}

function equiposQueLidera(ctx: Contexto, id: string): Set<string> {
  return new Set(ctx.filas('Equipos')
    .filter((e) => !verdadero(e.oculto) && (texto(e.lider_id) === id || texto(e.lider_interino_id) === id))
    .map((e) => texto(e.id)));
}

function visible(p: Fila): boolean {
  return verdadero(p.activo) && !verdadero(p.oculto);
}

function reportes(ctx: Contexto, id: string): Fila[] {
  const eqs = equiposQueLidera(ctx, id);
  return ctx.filas('Personas').filter((p) => texto(p.id) !== id && eqs.has(texto(p.equipo_id)) && visible(p));
}

function rondaActiva(ctx: Contexto): string {
  return texto(ctx.config('ronda_id', ''));
}

function paresDe(ctx: Contexto, id: string): Set<string> {
  const ronda = rondaActiva(ctx);
  return new Set(ctx.filas('Pares')
    .filter((x) => texto(x.evaluador_id) === id && texto(x.ronda_id) === ronda && verdadero(x.activo))
    .map((x) => texto(x.evaluado_id))
    .filter((pid) => { const p = persona(ctx, pid); return p !== null && visible(p); }));
}

type Relacion = 'yo' | 'reporte' | 'par' | null;

function relacion(ctx: Contexto, u: Usuario, otroId: string): Relacion {
  if (otroId === u.id) return 'yo';
  if (reportes(ctx, u.id).some((p) => texto(p.id) === otroId)) return 'reporte';
  if (paresDe(ctx, u.id).has(otroId)) return 'par';
  return null;
}

/** Líder efectivo de una persona: el interino de su equipo si hay, si no el titular. */
function liderDe(ctx: Contexto, p: Fila): string {
  const e = equipo(ctx, texto(p.equipo_id));
  if (!e) return '';
  return texto(e.lider_interino_id) || texto(e.lider_id);
}

/* -------------------------------------------------------------------------
   Catálogo y cargos
   ------------------------------------------------------------------------- */

function habilidadVigente(h: Fila): boolean {
  return verdadero(h.activa) && !verdadero(h.oculto);
}

function salidaHabilidad(h: Fila, admin: boolean): { [k: string]: unknown } {
  const niveles: { [n: string]: string } = {};
  for (const n of NIVELES) niveles[n] = texto(h[COL_NIVEL[n]]);
  const s: { [k: string]: unknown } = {
    id: texto(h.id), nombre: texto(h.nombre), tipo: texto(h.tipo), departamento: texto(h.departamento) || null,
    descripcion: texto(h.descripcion), niveles, activa: verdadero(h.activa),
  };
  if (admin) s.oculto = verdadero(h.oculto);
  return s;
}

function salidaCargo(ctx: Contexto, c: Fila, vigentes: Set<string>, admin: boolean): { [k: string]: unknown } {
  const id = texto(c.id);
  const filas = ctx.filas('CargoHabilidades').filter((x) => texto(x.cargo_id) === id && NIVELES.indexOf(texto(x.nivel_esperado)) >= 0);
  const s: { [k: string]: unknown } = {
    id, nombre: texto(c.nombre), area: texto(c.area),
    // Lo que se evalúa: solo habilidades vigentes. Ocultar o desactivar una
    // habilidad la saca de todos los formularios y cálculos a la vez.
    habilidades: filas.filter((x) => vigentes.has(texto(x.skill_id)))
      .map((x) => ({ skill_id: texto(x.skill_id), nivel_esperado: texto(x.nivel_esperado) })),
  };
  if (admin) {
    s.oculto = verdadero(c.oculto);
    s.habilidades_todas = filas.map((x) => ({ skill_id: texto(x.skill_id), nivel_esperado: texto(x.nivel_esperado) }));
  }
  return s;
}

function cargoVigente(ctx: Contexto, id: string, admin: boolean): boolean {
  const c = ctx.filas('Cargos').find((x) => texto(x.id) === id);
  return Boolean(c) && (admin || !verdadero((c as Fila).oculto));
}

/* -------------------------------------------------------------------------
   Inicio: todo lo que esta persona puede ver, de una vez
   -------------------------------------------------------------------------
   Una sola llamada al entrar en lugar de una por pantalla: cada ejecución del
   flujo tarda segundos y cuenta contra el límite diario de Office Scripts.
   ------------------------------------------------------------------------- */

function inicio(ctx: Contexto, u: Usuario): Respuesta {
  const admin = u.admin;
  const ronda = rondaActiva(ctx);
  const misReportes = reportes(ctx, u.id);
  const misPares = paresDe(ctx, u.id);

  // Quién aparece y con qué relación.
  const rel = new Map<string, string>();
  rel.set(u.id, 'yo');
  for (const p of misReportes) rel.set(texto(p.id), 'reporte');
  misPares.forEach((id) => { if (!rel.has(id)) rel.set(id, 'par'); });

  const personasFuente = admin ? ctx.filas('Personas') : ctx.filas('Personas').filter((p) => rel.has(texto(p.id)));
  const personasSalida = personasFuente.map((p) => {
    const id = texto(p.id);
    const cargoId = texto(p.cargo_id);
    const s: { [k: string]: unknown } = {
      id, nombre: texto(p.nombre), area: texto(p.area), equipo_id: texto(p.equipo_id),
      cargo_id: cargoId && cargoVigente(ctx, cargoId, admin) ? cargoId : null,
      lider_id: liderDe(ctx, p) || null,
      relacion: rel.get(id) ?? null,
    };
    if (admin || id === u.id) s.correo = texto(p.correo);
    if (admin) {
      s.activo = verdadero(p.activo);
      s.oculto = verdadero(p.oculto);
      s.admin = esAdmin(ctx, id);
    }
    return s;
  });

  // Evaluaciones. De uno mismo y de los reportes: todas, sin decir quién
  // evaluó (salvo lo que evaluó uno mismo). De un par: solo lo que uno le dio.
  const completas = new Set<string>([u.id, ...misReportes.map((p) => texto(p.id))]);
  const evals: Valor[][] = [];
  for (const e of ctx.filas('Evaluaciones')) {
    if (texto(e.ronda_id) !== ronda || verdadero(e.anulada)) continue;
    const evaluado = texto(e.evaluado_id);
    const evaluador = texto(e.evaluador_id);
    const mio = evaluador === u.id;
    if (!admin && !(completas.has(evaluado) || (mio && rel.has(evaluado)))) continue;
    evals.push([evaluado, texto(e.skill_id), texto(e.rol), Number(e.puntaje), admin ? evaluador : mio ? 'yo' : '']);
  }

  // Cargos y habilidades: los de las personas visibles; todo para quien administra.
  const vigentes = new Set(ctx.filas('Habilidades').filter(habilidadVigente).map((h) => texto(h.id)));
  const cargosVistos = new Set(personasSalida.map((p) => texto(p.cargo_id)).filter(Boolean));
  const cargos = ctx.filas('Cargos')
    .filter((c) => admin || cargosVistos.has(texto(c.id)))
    .map((c) => salidaCargo(ctx, c, vigentes, admin));
  const skillsUsadas = new Set<string>();
  for (const c of cargos) for (const h of (c.habilidades as { skill_id: string }[])) skillsUsadas.add(h.skill_id);
  const catalogo = ctx.filas('Habilidades')
    .filter((h) => (admin ? true : skillsUsadas.has(texto(h.id))))
    .map((h) => salidaHabilidad(h, admin));

  const planes = ctx.filas('Planes')
    .filter((x) => !verdadero(x.oculto) && (admin || completas.has(texto(x.persona_id))))
    .map((x) => salidaPlan(ctx, x));

  const equiposVistos = new Set<string>(personasSalida.map((p) => texto(p.equipo_id)).filter(Boolean));
  equiposQueLidera(ctx, u.id).forEach((id) => equiposVistos.add(id));
  const equipos = ctx.filas('Equipos')
    .filter((e) => admin || equiposVistos.has(texto(e.id)))
    .map((e) => {
      const s: { [k: string]: unknown } = {
        id: texto(e.id), nombre: texto(e.nombre), area: texto(e.area),
        lider_id: texto(e.lider_id) || null, lider_interino_id: texto(e.lider_interino_id) || null,
      };
      if (admin) s.oculto = verdadero(e.oculto);
      return s;
    });

  const modelo: { [k: string]: unknown } = {};
  for (const m of ctx.filas('Modelo')) {
    try { modelo[texto(m.clave)] = JSON.parse(texto(m.valor_json)) as unknown; } catch { /* clave mal escrita: se ignora */ }
  }

  const roles: string[] = [];
  if (texto(u.fila.cargo_id) && cargoVigente(ctx, texto(u.fila.cargo_id), admin)) roles.push('colaborador');
  if (misReportes.length) roles.push('lider');
  if (misPares.size) roles.push('par');
  if (admin) roles.push('admin');

  const respuesta: Respuesta = {
    ok: true,
    usuario: {
      id: u.id, nombre: u.nombre, roles,
      evalua_como_par: Array.from(misPares),
      equipos_que_lidera: Array.from(equiposQueLidera(ctx, u.id)),
    },
    ronda: {
      id: ronda,
      nombre: texto(ctx.config('ronda_nombre', ronda)),
      inicio: texto(ctx.config('ronda_inicio', '')),
      cierre: texto(ctx.config('ronda_cierre', '')),
      abierta: verdadero(ctx.config('ronda_abierta', true)),
    },
    modelo,
    catalogo,
    cargos,
    personas: personasSalida,
    equipos,
    evaluaciones: { columnas: ['persona_id', 'skill_id', 'rol', 'puntaje', 'evaluador'], filas: evals },
    planes,
    areas_con_cargos: Array.from(new Set(ctx.filas('Cargos').filter((c) => !verdadero(c.oculto)).map((c) => texto(c.area)))),
  };

  if (admin) {
    respuesta.administracion = {
      pares: ctx.filas('Pares').filter((x) => texto(x.ronda_id) === ronda && verdadero(x.activo))
        .map((x) => ({ evaluador_id: texto(x.evaluador_id), evaluado_id: texto(x.evaluado_id) })),
      config: ctx.filas('Config').map((c) => ({ clave: texto(c.clave), valor: c.valor, nota: texto(c.nota) })),
    };
  }
  return respuesta;
}

/** El nombre del autor va resuelto: quien lee su plan no siempre recibe a su líder entre las personas. */
function salidaPlan(ctx: Contexto, x: Fila): { [k: string]: unknown } {
  const autor = ctx.filas('Personas').find((p) => texto(p.id) === texto(x.autor_id));
  return {
    id: texto(x.id), persona_id: texto(x.persona_id), titulo: texto(x.titulo), objetivo: texto(x.objetivo),
    propuesta: texto(x.propuesta), skill_ids: texto(x.skill_ids).split(',').map((s) => s.trim()).filter(Boolean),
    autor_id: texto(x.autor_id), autor: autor ? texto(autor.nombre) : '', ts_creado: Number(x.ts_creado) || null, ts_editado: Number(x.ts_editado) || null,
  };
}

/* -------------------------------------------------------------------------
   Evaluaciones
   ------------------------------------------------------------------------- */

const ROL_POR_RELACION: { [r: string]: string } = { yo: 'Employee', reporte: 'Leader', par: 'Peer' };

function guardarEvaluacion(ctx: Contexto, u: Usuario, d: { [k: string]: unknown }): Respuesta {
  if (!verdadero(ctx.config('ronda_abierta', true))) fallar('ronda', 'La ronda está cerrada: ya no se pueden enviar evaluaciones.');
  const evaluadoId = texto(d.evaluadoId);
  const r = relacion(ctx, u, evaluadoId);
  // El rol sale de la relación, no de la petición: nadie puede declararse
  // líder de alguien para que su evaluación pese más.
  if (!r) fallar('permiso', 'No tienes una evaluación asignada sobre esta persona.');
  const rol = ROL_POR_RELACION[r as string];
  const evaluado = persona(ctx, evaluadoId) as Fila;

  const cargoId = texto(evaluado.cargo_id);
  const vigentes = new Set(ctx.filas('Habilidades').filter(habilidadVigente).map((h) => texto(h.id)));
  const delCargo = new Set(ctx.filas('CargoHabilidades')
    .filter((x) => texto(x.cargo_id) === cargoId && NIVELES.indexOf(texto(x.nivel_esperado)) >= 0 && vigentes.has(texto(x.skill_id)))
    .map((x) => texto(x.skill_id)));
  if (!delCargo.size) fallar('cargo', 'Esta persona no tiene un cargo con habilidades para evaluar.');

  const respuestas = (d.respuestas ?? {}) as { [skill: string]: unknown };
  const limpias: { [skill: string]: number } = {};
  for (const sid of Object.keys(respuestas)) {
    if (!delCargo.has(sid)) fallar('datos', `La habilidad ${sid} no es del cargo de esta persona.`);
    const n = Number(respuestas[sid]);
    if (!Number.isInteger(n) || n < 1 || n > 5) fallar('datos', `Puntaje inválido para ${sid}: debe ser de 1 a 5.`);
    limpias[sid] = n;
  }
  if (!Object.keys(limpias).length) fallar('datos', 'La evaluación llegó sin respuestas.');

  const ronda = rondaActiva(ctx);
  const existentes = ctx.filas('Evaluaciones').filter((e) => texto(e.ronda_id) === ronda
    && texto(e.evaluado_id) === evaluadoId && texto(e.evaluador_id) === u.id && texto(e.rol) === rol);
  let cambiadas = 0;
  for (const sid of Object.keys(limpias)) {
    // Reenviar actualiza en su lugar: enviar dos veces no duplica el promedio.
    const previa = existentes.find((e) => texto(e.skill_id) === sid);
    if (previa) {
      if (Number(previa.puntaje) !== limpias[sid] || verdadero(previa.anulada)) {
        previa.puntaje = limpias[sid]; previa.ts = ctx.ahora; previa.fecha = fechaLegible(ctx.ahora); previa.anulada = false;
        ctx.marcar('Evaluaciones', previa);
        cambiadas += 1;
      }
    } else {
      ctx.agregar('Evaluaciones', {
        ronda_id: ronda, evaluado_id: evaluadoId, evaluador_id: u.id, rol, skill_id: sid,
        puntaje: limpias[sid], ts: ctx.ahora, fecha: fechaLegible(ctx.ahora), anulada: false,
      });
      cambiadas += 1;
    }
  }

  auditar(ctx, u, {
    accion: existentes.length ? 'evaluacion.actualizar' : 'evaluacion.enviar',
    entidad: 'persona', entidad_id: evaluadoId, entidad_nombre: texto(evaluado.nombre),
    equipo_id: texto(evaluado.equipo_id),
    detalle: `${rol} · ${Object.keys(limpias).length} habilidades · ${cambiadas} con cambios`,
  });
  return { ok: true, rol, guardadas: Object.keys(limpias).length, cambiadas };
}

/* -------------------------------------------------------------------------
   Planes de desarrollo
   ------------------------------------------------------------------------- */

function puedeVerPlanes(ctx: Contexto, u: Usuario, personaId: string): boolean {
  if (u.admin) return true;
  const r = relacion(ctx, u, personaId);
  return r === 'yo' || r === 'reporte';
}

function guardarPlan(ctx: Contexto, u: Usuario, d: { [k: string]: unknown }): Respuesta {
  const personaId = texto(d.personaId);
  if (!puedeVerPlanes(ctx, u, personaId)) fallar('permiso', 'No puedes crear planes para esta persona.');
  const titulo = recortar(d.titulo, 200);
  if (!titulo) fallar('datos', 'El plan necesita un título.');
  const valores: Fila = {
    titulo,
    objetivo: recortar(d.objetivo, 4000),
    propuesta: recortar(d.propuesta, 20000),
    skill_ids: (Array.isArray(d.skillIds) ? (d.skillIds as unknown[]) : []).map((s) => texto(s)).filter(Boolean).join(','),
  };
  const p = persona(ctx, personaId) as Fila;
  const id = texto(d.id);
  if (id) {
    const plan = ctx.filas('Planes').find((x) => texto(x.id) === id && !verdadero(x.oculto));
    if (!plan || texto(plan.persona_id) !== personaId) fallar('datos', 'El plan ya no existe.');
    const f = plan as Fila;
    for (const campo of Object.keys(valores)) {
      if (texto(f[campo]) !== texto(valores[campo])) {
        auditar(ctx, u, {
          accion: 'plan.editar', entidad: 'plan', entidad_id: id, entidad_nombre: `${titulo} · ${texto(p.nombre)}`,
          campo, antes: texto(f[campo]), despues: texto(valores[campo]), equipo_id: texto(p.equipo_id),
        });
        f[campo] = valores[campo];
      }
    }
    f.ts_editado = ctx.ahora;
    ctx.marcar('Planes', f);
    return { ok: true, plan: salidaPlan(ctx, f) };
  }
  const nuevo = ctx.agregar('Planes', {
    id: `plan-${ctx.ahora.toString(36)}-${ctx.entropia.slice(0, 6) || '0'}`, persona_id: personaId, ...valores,
    autor_id: u.id, ts_creado: ctx.ahora, ts_editado: ctx.ahora, oculto: false,
  });
  auditar(ctx, u, {
    accion: 'plan.crear', entidad: 'plan', entidad_id: texto(nuevo.id), entidad_nombre: `${titulo} · ${texto(p.nombre)}`,
    equipo_id: texto(p.equipo_id),
  });
  return { ok: true, plan: salidaPlan(ctx, nuevo) };
}

function borrarPlan(ctx: Contexto, u: Usuario, d: { [k: string]: unknown }): Respuesta {
  const id = texto(d.id);
  const plan = ctx.filas('Planes').find((x) => texto(x.id) === id && !verdadero(x.oculto));
  if (!plan) fallar('datos', 'El plan ya no existe.');
  const f = plan as Fila;
  if (!puedeVerPlanes(ctx, u, texto(f.persona_id))) fallar('permiso', 'No puedes borrar este plan.');
  // Se oculta, no se borra: la auditoría tiene que poder mostrar qué había.
  f.oculto = true;
  ctx.marcar('Planes', f);
  const p = persona(ctx, texto(f.persona_id));
  auditar(ctx, u, {
    accion: 'plan.borrar', entidad: 'plan', entidad_id: id, entidad_nombre: texto(f.titulo),
    equipo_id: p ? texto(p.equipo_id) : '',
  });
  return { ok: true };
}

/* -------------------------------------------------------------------------
   Administración
   ------------------------------------------------------------------------- */

interface Entidad { tabla: string; campos: string[]; booleanos: string[]; }

const ENTIDADES: { [nombre: string]: Entidad } = {
  persona: { tabla: 'Personas', campos: ['nombre', 'correo', 'cargo_id', 'equipo_id', 'area', 'activo', 'oculto'], booleanos: ['activo', 'oculto'] },
  equipo: { tabla: 'Equipos', campos: ['nombre', 'area', 'lider_id', 'lider_interino_id', 'oculto'], booleanos: ['oculto'] },
  cargo: { tabla: 'Cargos', campos: ['nombre', 'area', 'oculto'], booleanos: ['oculto'] },
  habilidad: {
    tabla: 'Habilidades',
    campos: ['nombre', 'tipo', 'departamento', 'descripcion', 'nivel_basico', 'nivel_intermedio', 'nivel_avanzado', 'nivel_experto', 'activa', 'oculto'],
    booleanos: ['activa', 'oculto'],
  },
  config: { tabla: 'Config', campos: ['valor'], booleanos: [] },
};

function idDe(entidad: string, f: Fila): string {
  return entidad === 'config' ? texto(f.clave) : texto(f.id);
}

function buscarEntidad(ctx: Contexto, entidad: string, id: string): Fila {
  const def = ENTIDADES[entidad];
  if (!def) fallar('datos', `Entidad desconocida: ${entidad}.`);
  const f = ctx.filas(def.tabla).find((x) => idDe(entidad, x) === id);
  if (!f) fallar('datos', `No existe ${entidad} con id ${id}.`);
  return f as Fila;
}

/** Valida un valor nuevo y lo normaliza. Devuelve el valor a guardar. */
function validarCampo(ctx: Contexto, entidad: string, f: Fila | null, campo: string, v: unknown): Valor {
  const def = ENTIDADES[entidad];
  if (def.booleanos.indexOf(campo) >= 0) return verdadero(v);
  const t = recortar(v, campo.indexOf('nivel_') === 0 || campo === 'descripcion' ? 4000 : 300);

  if (campo === 'nombre' && !t) fallar('datos', 'El nombre no puede quedar vacío.');
  if (entidad === 'persona' && campo === 'correo') {
    const c = t.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) fallar('datos', 'El correo no tiene un formato válido.');
    const otro = personaPorCorreo(ctx, c);
    if (otro && (!f || texto(otro.id) !== texto(f.id))) fallar('datos', `Ese correo ya lo tiene ${texto(otro.nombre)}.`);
    return c;
  }
  if (campo === 'cargo_id' && t && !ctx.filas('Cargos').some((c) => texto(c.id) === t)) fallar('datos', 'Ese cargo no existe.');
  if (campo === 'equipo_id' && t && !equipo(ctx, t)) fallar('datos', 'Ese equipo no existe.');
  if (campo === 'lider_id' || campo === 'lider_interino_id') {
    if (t) {
      const l = persona(ctx, t);
      if (!l || !verdadero(l.activo)) fallar('datos', 'El líder tiene que ser una persona activa.');
      // Quien lidera un equipo no puede ser miembro de ese mismo equipo: se
      // vería a sí mismo como reporte y evaluaría su propio desempeño como líder.
      if (f && texto((l as Fila).equipo_id) === texto(f.id)) fallar('datos', 'Esa persona es miembro de este equipo; no puede liderarlo.');
    }
    if (campo === 'lider_id' && !t) fallar('datos', 'Un equipo necesita un líder titular. Para un reemplazo temporal usa el líder interino.');
  }
  if (entidad === 'persona' && campo === 'equipo_id' && t && f) {
    const e = equipo(ctx, t) as Fila;
    if (texto(e.lider_id) === texto(f.id) || texto(e.lider_interino_id) === texto(f.id)) {
      fallar('datos', 'Esta persona lidera ese equipo; no puede ser miembro de él.');
    }
  }
  if (entidad === 'habilidad' && campo === 'tipo' && TIPOS.indexOf(t) < 0) fallar('datos', `La categoría debe ser ${TIPOS.join(', ')}.`);
  return t;
}

function nombreEntidad(entidad: string, f: Fila): string {
  return entidad === 'config' ? texto(f.clave) : texto(f.nombre);
}

function equipoDeEntidad(entidad: string, f: Fila): string {
  if (entidad === 'persona') return texto(f.equipo_id);
  if (entidad === 'equipo') return texto(f.id);
  return '';
}

function adminActualizar(ctx: Contexto, u: Usuario, d: { [k: string]: unknown }): Respuesta {
  const entidad = texto(d.entidad);
  const id = texto(d.id);
  const f = buscarEntidad(ctx, entidad, id);
  const def = ENTIDADES[entidad];
  const cambios = { ...((d.cambios ?? {}) as { [campo: string]: unknown }) };
  const motivo = recortar(d.motivo, 500);

  if (entidad === 'persona' && id === u.id && 'activo' in cambios && !verdadero(cambios.activo)) {
    fallar('datos', 'No puedes desactivarte a ti mismo: perderías el acceso a la administración.');
  }
  // El rol de administración viaja con el resto de la persona y se guarda en
  // la misma ejecución: si algo falla, no se guarda nada. Dos llamadas
  // separadas dejaban la mitad guardada cuando la segunda fallaba.
  let admin: boolean | null = null;
  if (entidad === 'persona' && 'admin' in cambios) {
    admin = verdadero(cambios.admin);
    delete cambios.admin;
    if (!admin && id === u.id) fallar('datos', 'No puedes quitarte a ti mismo el rol de administrador.');
  }

  const nuevos: Fila = {};
  for (const campo of Object.keys(cambios)) {
    if (def.campos.indexOf(campo) < 0) fallar('datos', `El campo ${campo} no se puede modificar en ${entidad}.`);
    nuevos[campo] = validarCampo(ctx, entidad, f, campo, cambios[campo]);
  }

  let n = 0;
  const equipoAntes = equipoDeEntidad(entidad, f);
  for (const campo of Object.keys(nuevos)) {
    const antes = f[campo];
    if (texto(antes) === texto(nuevos[campo]) && verdadero(antes) === verdadero(nuevos[campo])) continue;
    f[campo] = nuevos[campo];
    n += 1;
    auditar(ctx, u, {
      accion: accionDeCampo(campo, nuevos[campo]), entidad, entidad_id: id, entidad_nombre: nombreEntidad(entidad, f),
      campo, antes: texto(antes), despues: texto(nuevos[campo]),
      // Un cambio de equipo queda en los dos equipos: el de origen y el de destino.
      equipo_id: campo === 'equipo_id' ? `${equipoAntes} → ${texto(nuevos[campo])}` : equipoDeEntidad(entidad, f),
      detalle: motivo,
    });
  }
  if (n) {
    ctx.marcar(def.tabla, f);
    if (entidad === 'config') ctx.configCache = null;
  }
  if (admin !== null) n += Number(adminAdministrador(ctx, u, { personaId: id, activo: admin, motivo }).cambios);
  return { ok: true, cambios: n };
}

function accionDeCampo(campo: string, v: Valor): string {
  if (campo === 'oculto') return verdadero(v) ? 'ocultar' : 'mostrar';
  if (campo === 'activo' || campo === 'activa') return verdadero(v) ? 'activar' : 'desactivar';
  if (campo === 'nombre') return 'renombrar';
  if (campo === 'equipo_id') return 'mover';
  if (campo === 'lider_interino_id') return v ? 'asignar-interino' : 'quitar-interino';
  if (campo === 'lider_id') return 'cambiar-lider';
  return 'editar';
}

function adminCrear(ctx: Contexto, u: Usuario, d: { [k: string]: unknown }): Respuesta {
  const entidad = texto(d.entidad);
  const def = ENTIDADES[entidad];
  if (!def || entidad === 'config') fallar('datos', `No se puede crear ${entidad}.`);
  const valores = (d.valores ?? {}) as { [campo: string]: unknown };
  const fila: Fila = {};
  for (const campo of def.campos) {
    if (campo in valores) fila[campo] = validarCampo(ctx, entidad, null, campo, valores[campo]);
  }
  if (!texto(fila.nombre)) fallar('datos', 'Falta el nombre.');
  if (entidad === 'persona' && !texto(fila.correo)) fallar('datos', 'Una persona necesita correo para poder entrar.');
  if (entidad === 'equipo' && !texto(fila.lider_id)) fallar('datos', 'Un equipo necesita líder.');
  if (entidad === 'habilidad' && !texto(fila.tipo)) fallar('datos', 'Falta la categoría.');

  // Ids legibles y estables: se derivan del nombre y no cambian al renombrar,
  // así las evaluaciones y la auditoría siguen apuntando al mismo registro.
  const prefijo = entidad === 'equipo' ? 'eq-' : entidad === 'habilidad' ? `${texto(fila.tipo).charAt(0).toLowerCase()}-` : '';
  const base = `${prefijo}${slug(texto(fila.nombre))}`;
  const usados = new Set(ctx.filas(def.tabla).map((x) => texto(x.id)));
  let id = base;
  for (let k = 2; usados.has(id); k += 1) id = `${base}-${k}`;

  const completa: Fila = { id, ...fila };
  for (const b of def.booleanos) if (!(b in completa)) completa[b] = b === 'activo' || b === 'activa';
  ctx.agregar(def.tabla, completa);
  auditar(ctx, u, {
    accion: 'crear', entidad, entidad_id: id, entidad_nombre: texto(fila.nombre), equipo_id: equipoDeEntidad(entidad, completa),
  });
  if (entidad === 'persona' && verdadero(valores.admin)) adminAdministrador(ctx, u, { personaId: id, activo: true });
  return { ok: true, id };
}

/**
 * Niveles esperados de un cargo. Acepta un cambio suelto ({skillId, nivel}) o
 * un lote ({cambios: [{skillId, nivel}, ...]}): la pantalla de cargos guarda
 * varias filas de una vez, en una sola ejecución y todo o nada.
 */
function adminCargoHabilidad(ctx: Contexto, u: Usuario, d: { [k: string]: unknown }): Respuesta {
  const cargoId = texto(d.cargoId);
  const motivo = recortar(d.motivo, 500);
  const lote = Array.isArray(d.cambios)
    ? (d.cambios as { [k: string]: unknown }[])
    : [{ skillId: d.skillId, nivel: d.nivel }];
  if (lote.length > 300) fallar('datos', 'Demasiados cambios en una sola petición.');
  let n = 0;
  for (const c of lote) n += nivelEsperado(ctx, u, cargoId, texto(c.skillId), texto(c.nivel), motivo);
  return { ok: true, cambios: n };
}

function nivelEsperado(ctx: Contexto, u: Usuario, cargoId: string, skillId: string, nivel: string, motivo: string): number {
  const c = buscarEntidad(ctx, 'cargo', cargoId);
  buscarEntidad(ctx, 'habilidad', skillId);
  if (nivel && NIVELES.indexOf(nivel) < 0) fallar('datos', 'Nivel inválido.');
  const f = ctx.filas('CargoHabilidades').find((x) => texto(x.cargo_id) === cargoId && texto(x.skill_id) === skillId);
  const antes = f ? texto(f.nivel_esperado) : '';
  if (antes === nivel) return 0;
  // Quitar una habilidad del cargo deja la fila con el nivel vacío en vez de
  // borrarla: Office Scripts puede borrar filas, pero una fila vacía es
  // reversible y la auditoría muestra lo que había.
  if (f) { f.nivel_esperado = nivel; ctx.marcar('CargoHabilidades', f); }
  else ctx.agregar('CargoHabilidades', { cargo_id: cargoId, skill_id: skillId, nivel_esperado: nivel });
  auditar(ctx, u, {
    accion: nivel ? (antes ? 'editar' : 'agregar-habilidad') : 'quitar-habilidad',
    entidad: 'cargo', entidad_id: cargoId, entidad_nombre: texto(c.nombre),
    campo: `nivel esperado · ${skillId}`, antes, despues: nivel, detalle: motivo,
  });
  return 1;
}

function adminPar(ctx: Contexto, u: Usuario, d: { [k: string]: unknown }): Respuesta {
  const evaluadorId = texto(d.evaluadorId);
  const evaluadoId = texto(d.evaluadoId);
  const activo = verdadero(d.activo);
  if (evaluadorId === evaluadoId) fallar('datos', 'Nadie puede ser su propio par.');
  const evaluador = buscarEntidad(ctx, 'persona', evaluadorId);
  const evaluado = buscarEntidad(ctx, 'persona', evaluadoId);
  const ronda = rondaActiva(ctx);
  const f = ctx.filas('Pares').find((x) => texto(x.evaluador_id) === evaluadorId && texto(x.evaluado_id) === evaluadoId && texto(x.ronda_id) === ronda);
  if (f && verdadero(f.activo) === activo) return { ok: true, cambios: 0 };
  if (f) { f.activo = activo; ctx.marcar('Pares', f); }
  else if (activo) ctx.agregar('Pares', { evaluador_id: evaluadorId, evaluado_id: evaluadoId, ronda_id: ronda, activo: true });
  else return { ok: true, cambios: 0 };
  auditar(ctx, u, {
    accion: activo ? 'asignar-par' : 'quitar-par', entidad: 'persona', entidad_id: evaluadoId,
    entidad_nombre: texto(evaluado.nombre), campo: 'par evaluador', despues: activo ? texto(evaluador.nombre) : '',
    antes: activo ? '' : texto(evaluador.nombre), equipo_id: texto(evaluado.equipo_id),
  });
  return { ok: true, cambios: 1 };
}

function adminAdministrador(ctx: Contexto, u: Usuario, d: { [k: string]: unknown }): Respuesta {
  const personaId = texto(d.personaId);
  const activo = verdadero(d.activo);
  const p = buscarEntidad(ctx, 'persona', personaId);
  if (!activo && personaId === u.id) fallar('datos', 'No puedes quitarte a ti mismo el rol de administrador.');
  const f = ctx.filas('Administradores').find((x) => texto(x.persona_id) === personaId);
  if (f && verdadero(f.activo) === activo) return { ok: true, cambios: 0 };
  if (f) { f.activo = activo; ctx.marcar('Administradores', f); }
  else if (activo) ctx.agregar('Administradores', { persona_id: personaId, activo: true });
  else return { ok: true, cambios: 0 };
  auditar(ctx, u, {
    accion: activo ? 'dar-admin' : 'quitar-admin', entidad: 'persona', entidad_id: personaId,
    entidad_nombre: texto(p.nombre), campo: 'administrador', antes: activo ? 'no' : 'sí', despues: activo ? 'sí' : 'no',
    equipo_id: texto(p.equipo_id), detalle: recortar(d.motivo, 500),
  });
  return { ok: true, cambios: 1 };
}

function adminAnularEvaluacion(ctx: Contexto, u: Usuario, d: { [k: string]: unknown }): Respuesta {
  const evaluadoId = texto(d.evaluadoId);
  const evaluadorId = texto(d.evaluadorId);
  const rol = texto(d.rol);
  const anular = d.anulada === undefined ? true : verdadero(d.anulada);
  const ronda = rondaActiva(ctx);
  const filas = ctx.filas('Evaluaciones').filter((e) => texto(e.ronda_id) === ronda && texto(e.evaluado_id) === evaluadoId
    && texto(e.evaluador_id) === evaluadorId && texto(e.rol) === rol && verdadero(e.anulada) !== anular);
  for (const f of filas) { f.anulada = anular; ctx.marcar('Evaluaciones', f); }
  if (!filas.length) return { ok: true, cambios: 0 };
  const evaluado = buscarEntidad(ctx, 'persona', evaluadoId);
  const evaluador = persona(ctx, evaluadorId);
  auditar(ctx, u, {
    accion: anular ? 'anular-evaluacion' : 'restaurar-evaluacion', entidad: 'persona', entidad_id: evaluadoId,
    entidad_nombre: texto(evaluado.nombre), campo: `evaluación ${rol}`,
    detalle: `${filas.length} respuestas de ${evaluador ? texto(evaluador.nombre) : evaluadorId}. ${recortar(d.motivo, 400)}`.trim(),
    equipo_id: texto(evaluado.equipo_id),
  });
  return { ok: true, cambios: filas.length };
}

/* -------------------------------------------------------------------------
   Auditoría
   ------------------------------------------------------------------------- */

interface Evento {
  accion: string; entidad: string; entidad_id: string; entidad_nombre: string;
  campo?: string; antes?: string; despues?: string; equipo_id?: string; detalle?: string;
}

function auditar(ctx: Contexto, actor: { id: string; nombre: string }, e: Evento): void {
  ctx.agregar('Auditoria', {
    ts: ctx.ahora, fecha: fechaLegible(ctx.ahora), actor_id: actor.id, actor_nombre: actor.nombre,
    accion: e.accion, entidad: e.entidad, entidad_id: e.entidad_id, entidad_nombre: e.entidad_nombre,
    campo: e.campo ?? '', antes: recortar(e.antes, 1000), despues: recortar(e.despues, 1000),
    equipo_id: e.equipo_id ?? '', detalle: recortar(e.detalle, 1000),
  });
}

function adminAuditoria(ctx: Contexto, d: { [k: string]: unknown }): Respuesta {
  const f = (d.filtros ?? {}) as { [k: string]: unknown };
  const entidad = texto(f.entidad);
  const entidadId = texto(f.entidadId);
  const actorId = texto(f.actorId);
  const equipoId = texto(f.equipoId);
  const accion = texto(f.accion);
  const desde = Number(f.desde) || 0;
  const hasta = Number(f.hasta) || Number.MAX_SAFE_INTEGER;
  const q = texto(f.texto).toLowerCase();
  const pagina = Math.max(0, Number(d.pagina) || 0);
  const tam = Math.min(500, Math.max(10, Number(d.tamano) || 100));

  const todas = ctx.filas('Auditoria').filter((a) => {
    const ts = Number(a.ts);
    if (ts < desde || ts > hasta) return false;
    if (entidad && texto(a.entidad) !== entidad) return false;
    if (entidadId && texto(a.entidad_id) !== entidadId) return false;
    if (actorId && texto(a.actor_id) !== actorId) return false;
    if (equipoId && texto(a.equipo_id).split(' → ').indexOf(equipoId) < 0) return false;
    if (accion && texto(a.accion) !== accion) return false;
    if (q) {
      const blob = [a.actor_nombre, a.entidad_nombre, a.campo, a.antes, a.despues, a.detalle].map((x) => texto(x)).join(' ').toLowerCase();
      if (blob.indexOf(q) < 0) return false;
    }
    return true;
  }).sort((a, b) => (Number(b.ts) - Number(a.ts)) || (Number(b.__i) - Number(a.__i)));   // misma petición: orden de escritura

  return {
    ok: true,
    total: todas.length,
    pagina,
    tamano: tam,
    filas: todas.slice(pagina * tam, pagina * tam + tam).map((a) => ({
      ts: Number(a.ts), actor_id: texto(a.actor_id), actor_nombre: texto(a.actor_nombre), accion: texto(a.accion),
      entidad: texto(a.entidad), entidad_id: texto(a.entidad_id), entidad_nombre: texto(a.entidad_nombre),
      campo: texto(a.campo), antes: texto(a.antes), despues: texto(a.despues), equipo_id: texto(a.equipo_id),
      detalle: texto(a.detalle),
    })),
  };
}

function escaparHtml(t: string): string {
  return t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as { [k: string]: string })[c]);
}
