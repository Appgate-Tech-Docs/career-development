/* =========================================================================
   ALMACÉN — el dato que esta persona puede ver, y el cálculo
   =========================================================================

   DE DÓNDE VIENE EL DATO
   ----------------------
   De una sola llamada, `inicio`, al entrar. El servidor (el Office Script que
   ejecuta Power Automate) arma la respuesta a partir de la sesión: un líder
   recibe a sus reportes directos y a nadie más, un par recibe solo sus propias
   respuestas sobre la persona que evalúa, y quien administra recibe todo.

   Este archivo no filtra por seguridad: lo que no debe verse ya no llegó. Las
   funciones de alcance que quedan acá (reportesDirectos, rolDeEvaluacion) solo
   ordenan lo que llegó para pintarlo.

   POR QUÉ EL CÁLCULO ES LOCAL
   ---------------------------
   Es lo que hace posible el simulador del tablero: cambiar una calificación y
   ver el total moverse exige recalcular en el momento, y cada viaje al flujo
   tarda segundos.

   LAS ESCRITURAS
   --------------
   Van al servidor, que valida permiso y datos y deja la auditoría. Cuando
   responde que sí, se aplican también acá para no pedir todo de nuevo (cada
   petición cuenta contra el límite diario de ejecuciones). Los cambios de
   administración, que pueden mover el alcance de cualquiera, sí recargan.
   ========================================================================= */

import {
  sembrarModelo, puntajePonderado, perfilDeNiveles, totalGeneral,
  brechaHabilidad, ordenarPorPrioridad, valorNivel, conceptoDePuntaje,
} from './modelo.js';
import { llamar, guardarToken, olvidarToken, tokenGuardado } from './api.js';

/* -------------------------------------------------------------------------
   Constantes del instrumento que no viajan en el modelo
   ------------------------------------------------------------------------- */

/**
 * Nivel observado a partir del puntaje 1-5: intervalos abiertos por abajo y
 * cerrados por arriba, así que 2.5 es Básico y 2.51 ya es Intermedio.
 */
const BANDA_PUNTAJE = [
  { nivel: 'Basic', max: 2.5 },
  { nivel: 'Intermediate', max: 3.5 },
  { nivel: 'Advanced', max: 4.5 },
  { nivel: 'Expert', max: 5.0 },
];

export const NIVEL_ES = {
  Basic: 'Básico', Intermediate: 'Intermedio', Advanced: 'Avanzado', Expert: 'Experto',
};

export const CATEGORIAS = [
  { key: 'Funcion', label: 'Funciones del rol' },
  { key: 'Hard Skill', label: 'Hard skills' },
  { key: 'Soft Skill', label: 'Soft skills' },
];

export const ROLES = {
  colaborador: { label: 'Colaborador', descripcion: 'Se autoevalúa y revisa su propio perfil.' },
  lider: { label: 'Líder', descripcion: 'Evalúa a su equipo y revisa el estado de cada persona.' },
  par: { label: 'Par', descripcion: 'Evalúa a compañeros asignados.' },
  admin: { label: 'Administración', descripcion: 'Ve la organización y administra personas, equipos y catálogo.' },
};

/** Puntaje 1-5 que corresponde a cada nivel, para el formulario. */
export const NIVEL_A_PUNTAJE = { Basic: 2, Intermediate: 3, Advanced: 4, Expert: 5 };

/** A menos de estos puntos del borde de banda, el nivel se considera inestable. */
const MARGEN_ALERTA = 3;

export function nivelDePuntaje(puntaje) {
  if (puntaje === null || puntaje === undefined || Number.isNaN(puntaje)) return null;
  for (const b of BANDA_PUNTAJE) if (puntaje <= b.max) return b.nivel;
  return 'Expert';
}

/* -------------------------------------------------------------------------
   Carga
   ------------------------------------------------------------------------- */

let datos = null;
let idx = { skill: new Map(), cargo: new Map(), persona: new Map(), equipo: new Map() };

function reindexar() {
  idx = {
    skill: new Map(datos.catalogo.map((s) => [s.id, s])),
    cargo: new Map(datos.cargos.map((c) => [c.id, c])),
    persona: new Map(datos.personas.map((p) => [p.id, p])),
    equipo: new Map(datos.equipos.map((e) => [e.id, e])),
  };
}

/** Convierte la respuesta de `inicio` en la forma que usan las vistas. */
function adoptar(r) {
  const yo = r.usuario.id;
  const personas = r.personas.map((p) => (p.id === yo
    ? { ...p, roles: r.usuario.roles, evalua_como_par: r.usuario.evalua_como_par }
    : { ...p, roles: [] }));

  // Las evaluaciones viajan como filas compactas (es lo más pesado de la
  // respuesta). `evaluador` es 'yo' para lo que evaluó quien está en sesión y
  // vacío para el resto, salvo para quien administra, que recibe el id.
  const col = r.evaluaciones.columnas;
  const evaluaciones = r.evaluaciones.filas.map((f) => {
    const e = Object.fromEntries(col.map((c, i) => [c, f[i]]));
    if (e.evaluador === yo) e.evaluador = 'yo';
    return e;
  });

  datos = {
    usuarioId: yo,
    ronda: r.ronda,
    modelo: r.modelo,
    catalogo: r.catalogo,
    cargos: r.cargos,
    personas,
    equipos: r.equipos ?? [],
    planes: r.planes ?? [],
    areas_con_cargos: r.areas_con_cargos ?? [],
    administracion: r.administracion ?? null,
    evalPorPersona: new Map(),
  };
  for (const e of evaluaciones) {
    if (!datos.evalPorPersona.has(e.persona_id)) datos.evalPorPersona.set(e.persona_id, []);
    datos.evalPorPersona.get(e.persona_id).push(e);
  }
  sembrarModelo(datos.modelo);
  reindexar();
  return datos;
}

/**
 * Carga lo que la sesión guardada puede ver. Sin sesión devuelve null y la
 * carcasa manda a la pantalla de ingreso.
 */
let pedido = 0;

export async function iniciar() {
  if (!tokenGuardado()) { datos = null; return null; }
  // Si dos recargas se cruzan, gana la última pedida, no la última en llegar:
  // si no, una respuesta vieja podía pisar un cambio recién guardado.
  const mio = ++pedido;
  try {
    const r = await llamar('inicio');
    if (mio !== pedido) return datos;
    adoptar(r);
  } catch (e) {
    if (e.codigo === 'sesion') { datos = null; return null; }
    throw e;
  }
  return datos;
}

/** Vuelve a pedir todo. Después de un cambio de administración. */
export async function recargar() {
  await iniciar();
  avisarCambio('recarga');
}

export const cargado = () => datos !== null;
export const ronda = () => datos?.ronda ?? null;
export const catalogo = () => datos?.catalogo ?? [];
export const skill = (id) => idx.skill.get(id) ?? null;
export const cargo = (id) => idx.cargo.get(id) ?? null;
export const persona = (id) => idx.persona.get(id) ?? null;
export const equipo = (id) => idx.equipo.get(id) ?? null;
export const personas = () => datos?.personas ?? [];
export const cargos = () => datos?.cargos ?? [];
export const equipos = () => datos?.equipos ?? [];
export const administracion = () => datos?.administracion ?? null;
export const usuarioId = () => datos?.usuarioId ?? null;
/** Evaluaciones de la ronda sobre una persona (lo que el servidor dejó ver). */
export const evaluacionesDe = (id) => datos?.evalPorPersona.get(id) ?? [];

/* -------------------------------------------------------------------------
   Sesión
   -------------------------------------------------------------------------
   El token vive en sessionStorage (ver api.js): cerrar el navegador cierra
   la sesión, que es lo que se quiere en un equipo compartido.
   ------------------------------------------------------------------------- */

export function sesion() {
  if (!datos) return null;
  const p = persona(datos.usuarioId);
  return p ? { persona: p } : null;
}

/** Paso 1 del ingreso. La respuesta es la misma exista o no el correo. */
export async function pedirCodigo(correo) {
  return llamar('solicitarCodigo', { correo }, { conToken: false });
}

/** Paso 2: el código que llegó al correo abre la sesión y carga el dato. */
export async function confirmarCodigo(correo, codigo) {
  const r = await llamar('verificarCodigo', { correo, codigo }, { conToken: false });
  guardarToken(r.token, r.expira);
  await iniciar();
  avisarCambio('sesion');
}

/**
 * Los borradores del formulario viven en localStorage para sobrevivir al
 * cierre de la pestaña. Al salir se borran: en un equipo compartido, la
 * siguiente persona no debe encontrar las calificaciones a medio poner de otra.
 */
function borrarBorradores() {
  try {
    const claves = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith('cdp_draft')) claves.push(k);
    }
    claves.forEach((k) => localStorage.removeItem(k));
  } catch { /* sin almacenamiento no hay borradores */ }
}

export async function salir() {
  try { if (tokenGuardado()) await llamar('salir'); } catch { /* la sesión se cierra igual */ }
  borrarBorradores();
  olvidarToken();
  datos = null;
  avisarCambio('sesion');
}

/** Para cuando el servidor dice que la sesión venció: sin llamar de nuevo. */
export function descartarSesion() {
  olvidarToken();
  datos = null;
}

/* -------------------------------------------------------------------------
   Cálculo del perfil
   ------------------------------------------------------------------------- */

/**
 * Perfil completo de una persona.
 *
 * `ajustes` permite sobrescribir puntajes por habilidad sin tocar el dato:
 * `{ [skillId]: 4 }`. Es lo que usa el simulador del tablero — cambia lo que se
 * ve, no lo que hay.
 */
export function perfil(personaId, { ajustes = null } = {}) {
  const p = persona(personaId);
  if (!p) return null;
  const c = cargo(p.cargo_id);

  const evs = datos.evalPorPersona.get(personaId) ?? [];
  const porSkill = new Map();
  // Promedio por rol, no el último que llegó. Con dos pares asignados, asignar
  // directo hacía que el segundo pisara al primero: el puntaje de "Pares" era
  // en realidad el de un solo par. Es lo mismo que hace `v_eval_rol` en la base
  // (avg por rol), así que las dos implementaciones vuelven a coincidir.
  const acumulado = new Map();
  for (const e of evs) {
    const clave = `${e.skill_id}|${e.rol}`;
    const a = acumulado.get(clave) ?? { skill_id: e.skill_id, rol: e.rol, suma: 0, n: 0 };
    a.suma += e.puntaje;
    a.n += 1;
    acumulado.set(clave, a);
  }
  for (const a of acumulado.values()) {
    if (!porSkill.has(a.skill_id)) porSkill.set(a.skill_id, {});
    porSkill.get(a.skill_id)[a.rol.toLowerCase()] = redondear(a.suma / a.n);
  }

  // El universo de habilidades es el del cargo. Sin cargo no habría con qué
  // comparar; quien no tiene cargo no se evalúa.
  const definicion = c?.habilidades ?? [];
  const habilidades = definicion.map(({ skill_id: sid, nivel_esperado }) => {
    const s = skill(sid);
    const puntajes = porSkill.get(sid) ?? {};
    const ajuste = ajustes?.[sid];

    // Un ajuste del simulador reemplaza el consolidado, no un evaluador: es lo
    // honesto, porque el líder está preguntando "¿y si esta habilidad valiera
    // otra cosa?", no "¿y si yo hubiera calificado distinto?".
    const pond = ajuste !== undefined && ajuste !== null
      ? { valor: ajuste, concepto: conceptoDePuntaje(ajuste), evaluadoresFaltantes: [], completo: true }
      : puntajePonderado(puntajes);

    const nivelObservado = nivelDePuntaje(pond.valor);
    return {
      skill_id: sid,
      nombre: s?.nombre ?? sid,
      tipo: s?.tipo ?? null,
      descripcion: s?.descripcion ?? '',
      niveles: s?.niveles ?? {},
      nivel_esperado,
      nivel_esperado_label: NIVEL_ES[nivel_esperado] ?? nivel_esperado,
      puntajes: {
        employee: puntajes.employee ?? null,
        leader: puntajes.leader ?? null,
        peer: puntajes.peer ?? null,
      },
      promedio: pond.valor,
      concepto: pond.concepto,
      evaluadores_faltantes: pond.evaluadoresFaltantes,
      completo: pond.completo,
      simulado: ajuste !== undefined && ajuste !== null,
      nivel: nivelObservado,
      nivel_label: NIVEL_ES[nivelObservado] ?? nivelObservado,
      nivel_descripcion: nivelObservado ? (s?.niveles?.[nivelObservado] ?? '') : '',
      ...derivarBrecha(nivelObservado, nivel_esperado),
    };
  });

  const evaluadas = habilidades.filter((h) => h.promedio !== null);

  const porCategoria = {};
  const promedioCategoria = {};
  // G2: el valor que la categoría tendría si cada habilidad estuviera justo en el
  // nivel que el cargo espera. Misma fórmula que el observado (promedio de los
  // valores de nivel), así que las dos barras son comparables en el mismo eje.
  const esperadoCategoria = {};
  // G1: cómo ve cada evaluador cada categoría, en la escala 1-5 del formulario.
  const miradas = {};
  for (const { key } of CATEGORIAS) {
    const delCargo = habilidades.filter((h) => h.tipo === key);
    if (delCargo.length) {
      esperadoCategoria[key] = perfilDeNiveles(delCargo.map((h) => h.nivel_esperado)).valor;
    }
    const del = evaluadas.filter((h) => h.tipo === key);
    if (!del.length) continue;
    porCategoria[key] = perfilDeNiveles(del.map((h) => h.nivel)).valor;
    promedioCategoria[key] = redondear(del.reduce((a, h) => a + h.promedio, 0) / del.length);
    miradas[key] = {};
    for (const rol of ['employee', 'leader', 'peer']) {
      const vals = del.map((h) => h.puntajes[rol]).filter((v) => v !== null && v !== undefined);
      miradas[key][rol] = vals.length ? redondear(vals.reduce((a, v) => a + v, 0) / vals.length) : null;
    }
  }

  const total = totalGeneral(porCategoria, { ponderado: true });
  const cerca = margenDeBanda(total.valor);

  const conReferencia = habilidades.filter((h) => h.nivel_esperado && h.promedio !== null);
  const cumplimiento = conReferencia.length
    ? { cumple: conReferencia.filter((h) => h.brecha_cumple).length, total: conReferencia.length }
    : null;

  const categoriasDelCargo = new Set(
    definicion.map(({ skill_id: sid }) => skill(sid)?.tipo).filter(Boolean));
  const categoriasFaltantes = [...categoriasDelCargo]
    .filter((cat) => !evaluadas.some((h) => h.tipo === cat))
    .map((cat) => CATEGORIAS.find((x) => x.key === cat)?.label ?? cat);

  return {
    persona: p,
    cargo: c,
    habilidades,
    prioridades: ordenarPorPrioridad(
      habilidades.map((h) => ({ ...h, brecha: { escalones: h.escalones } })))
      .filter((h) => h.severidad === 'brecha-critica' || h.severidad === 'brecha-leve'),
    perfil_por_categoria: porCategoria,
    esperado_por_categoria: esperadoCategoria,
    promedio_por_categoria: promedioCategoria,
    miradas_por_categoria: miradas,
    matriz: ubicarEnMatriz(promedioCategoria),
    promedio_general: evaluadas.length
      ? redondear(evaluadas.reduce((a, h) => a + h.promedio, 0) / evaluadas.length) : null,
    perfil_total: total.valor,
    nivel: total.nivel,
    nivel_es: NIVEL_ES[total.nivel] ?? total.nivel,
    cumplimiento,
    margen_banda: cerca?.margen ?? null,
    banda_vecina: cerca?.vecina ?? null,
    cerca_de_umbral: Boolean(cerca?.cerca),
    categorias_faltantes: categoriasFaltantes,
    evaluadores_faltantes: rolesAusentes(habilidades),
  };
}

/* -------------------------------------------------------------------------
   Matriz de talento (9 cuadrantes) — Reports!BB44 de V6
   -------------------------------------------------------------------------
   Desempeño = funciones del rol. Potencial = soft + hard skills. Cada eje se
   corta en bajo (< 3), medio (3 a < 4) y alto (>= 4), en la escala 1-5.

   Una diferencia con el Excel, decidida: el Excel calcula los dos ejes con
   promedios SIMPLES de los tres evaluadores; acá se usan los mismos puntajes
   ponderados (35/35/30) que en el resto del portal, para no mostrar dos
   números distintos para la misma persona.

   Los textos son los del Excel con los errores de tipeo corregidos. Lo que no
   es tipeo — el cuadrante 3,2 sin descripción, y recomendaciones que no calzan
   con su cuadrante — queda anotado en el onepager para que RRHH lo resuelva.
   ------------------------------------------------------------------------- */

export const EJE_MATRIZ = { 1: 'Bajo', 2: 'Medio', 3: 'Alto' };

/** Clave «potencial,desempeño», igual que la columna PAR P-D del Excel. */
export const MATRIZ = {
  '1,1': { etiqueta: 'Riesgo de talento',
    descripcion: 'Bajo potencial y bajo desempeño.',
    recomendacion: 'Necesita desarrollo: identificar áreas de mejora y proporcionar capacitación específica.' },
  '1,2': { etiqueta: 'Profesional sólido',
    descripcion: 'Desempeño sólido y potencial bajo.',
    recomendacion: 'Cumple expectativas: mantener en su rol actual con reconocimiento y recompensa.' },
  '1,3': { etiqueta: 'Experto destacado',
    descripcion: 'Desempeño excepcional.',
    recomendacion: 'Supera expectativas pero falta adaptación al puesto: proveer oportunidades de liderazgo y proyectos estratégicos.' },
  '2,1': { etiqueta: 'Jugador inconsistente',
    descripcion: 'Desempeño bajo con potencial sólido.',
    recomendacion: 'Potencial sólido pero aún necesita desarrollo: asignar tareas desafiantes para motivar su progreso.' },
  '2,2': { etiqueta: 'Jugador clave',
    descripcion: 'Desempeño sólido y potencial sólido.',
    recomendacion: 'Potencial sólido: ofrecer mentoría y programas de desarrollo profesional.' },
  '2,3': { etiqueta: 'Futura estrella',
    descripcion: 'Desempeño por encima de los estándares y potencial sólido.',
    recomendacion: 'Supera expectativas con un potencial sólido: asignar proyectos críticos y preparar para roles de liderazgo.' },
  '3,1': { etiqueta: 'Diamante en bruto',
    descripcion: 'Alto potencial pero no considerado para promoción.',
    recomendacion: 'Tiene alto potencial pero necesita desarrollo: fomentar el desarrollo de habilidades clave y evaluar barreras de desempeño.' },
  '3,2': { etiqueta: 'Estrella actual',
    // El Excel deja esta descripción vacía. Texto propuesto siguiendo el patrón
    // de la fila; marcado en el onepager para que RRHH lo valide.
    descripcion: 'Alto potencial y desempeño sólido.',
    recomendacion: 'Cumple las expectativas y tiene potencial sólido: crear un plan de desarrollo individualizado y establecer objetivos claros.' },
  '3,3': { etiqueta: 'Estrella consistente',
    descripcion: 'Alto desempeño y alto potencial; considerar para promoción.',
    // En el Excel esta recomendación no aparece nunca: la búsqueda termina en la
    // fila 57 y este cuadrante está en la 58.
    recomendacion: 'Planificar la sucesión y ofrecer desafíos constantes.' },
};

/** Número del cuadrante (1 a 9), el mismo de la columna CUADRANTE del Excel. */
export const numeroCuadrante = (clave) => Object.keys(MATRIZ).indexOf(clave) + 1;

const corteMatriz = (v) => (v === null || v === undefined ? null : v >= 4 ? 3 : v >= 3 ? 2 : 1);

function ubicarEnMatriz(promedioCategoria) {
  const desempeno = promedioCategoria.Funcion ?? null;
  const soft = promedioCategoria['Soft Skill'];
  const hard = promedioCategoria['Hard Skill'];
  const partes = [soft, hard].filter((v) => v !== null && v !== undefined);
  // Soft y hard pesan lo mismo (25/25), así que el promedio de las dos ES el
  // ponderado. Si falta una, el potencial se calcula con la que hay y la
  // pantalla ya avisa que falta una categoría.
  const potencial = partes.length ? redondear(partes.reduce((a, v) => a + v, 0) / partes.length) : null;
  const x = corteMatriz(desempeno);
  const y = corteMatriz(potencial);
  if (!x || !y) return null;
  const clave = `${y},${x}`;
  return { desempeno, potencial, x, y, clave, ...MATRIZ[clave] };
}

function derivarBrecha(nivelObservado, nivelEsperado) {
  const b = brechaHabilidad({ nivelObservado, nivelEsperado });
  return {
    severidad: b.severidad,
    escalones: b.escalones,
    brecha_cumple: b.cumple === true,
  };
}

function rolesAusentes(habilidades) {
  const conteo = { Employee: 0, Leader: 0, Peer: 0 };
  for (const h of habilidades) for (const r of h.evaluadores_faltantes) conteo[r] = (conteo[r] ?? 0) + 1;
  // Un rol cuenta como ausente solo si falta en TODAS: si falta en algunas es
  // una evaluación a medio enviar, no un evaluador que no participó.
  return Object.entries(conteo)
    .filter(([, n]) => n > 0 && n === habilidades.length)
    .map(([r]) => r);
}

function margenDeBanda(total) {
  if (total === null || total === undefined) return null;
  const bandas = datos.modelo.bandas_total ?? [];
  const i = bandas.findIndex((b) => total <= b.max);
  if (i === -1) return null;
  const arriba = bandas[i].max - total;
  const abajo = total - (i > 0 ? bandas[i - 1].max : 0);
  const haciaArriba = arriba <= abajo;
  const vecinaNivel = haciaArriba ? bandas[i + 1]?.nivel : bandas[i - 1]?.nivel;
  const margen = Math.min(arriba, abajo);
  return {
    margen: redondear(margen),
    vecina: vecinaNivel ? (NIVEL_ES[vecinaNivel] ?? vecinaNivel) : null,
    cerca: margen <= MARGEN_ALERTA && Boolean(vecinaNivel),
  };
}

const redondear = (v) => (v === null || v === undefined ? null : Math.round(v * 100) / 100);

/* -------------------------------------------------------------------------
   Equipo
   ------------------------------------------------------------------------- */

/**
 * Reportes directos de alguien. Para quien está en sesión son los que el
 * servidor marcó como `reporte` (incluye equipos que lidera como interino);
 * para otra persona —solo lo pide la administración—, los que la tienen como
 * líder efectivo.
 */
export const reportesDirectos = (liderId) => (liderId === datos?.usuarioId
  ? personas().filter((p) => p.relacion === 'reporte')
  : personas().filter((p) => p.lider_id === liderId && p.id !== liderId && p.activo !== false && !p.oculto));

/**
 * El equipo que ve un líder: hoy, solo sus reportes directos. Si la regla
 * cambia y debe ver también el equipo extendido, el cambio va en el servidor
 * (equiposQueLidera en servidor/motor.ts); esta función ya pinta lo que llegue.
 */
export function equipoExtendido(liderId) {
  return reportesDirectos(liderId).map((p) => ({ persona: p, nivel: 1, directo: true }));
}

/* -------------------------------------------------------------------------
   Agregados de un grupo de personas — equipo de un líder u organización
   ------------------------------------------------------------------------- */

/** Todas las personas evaluables (con cargo, activas y visibles), opcionalmente de un área. */
export const personasEvaluadas = (area = null) => personas()
  .filter((p) => p.cargo_id && p.activo !== false && !p.oculto && (!area || p.area === area));

/** Áreas que tienen cargos definidos, en el orden en que aparecen. */
export const areasConCargos = () => datos?.areas_con_cargos ?? [];

/** G5 — cuántas personas hay en cada nivel del total. */
export function distribucionPorNivel(perfiles) {
  const conteo = { Basic: 0, Intermediate: 0, Advanced: 0, Expert: 0 };
  let sinNivel = 0;
  for (const pf of perfiles) {
    if (pf.nivel && conteo[pf.nivel] !== undefined) conteo[pf.nivel] += 1;
    else sinNivel += 1;
  }
  return { conteo, sinNivel, total: perfiles.length };
}

/**
 * G6 — habilidades con más personas por debajo del nivel esperado.
 * Cuenta PERSONAS, no brechas: una habilidad donde tres personas están un
 * nivel abajo pesa más para planear formación que una sola persona dos abajo.
 */
export function brechasPorHabilidad(perfiles) {
  const por = new Map();
  for (const pf of perfiles) {
    for (const h of pf.prioridades) {
      const a = por.get(h.skill_id) ?? {
        skill_id: h.skill_id, nombre: h.nombre, tipo: h.tipo, personas: [], criticas: 0, leves: 0,
      };
      a.personas.push(pf.persona.nombre);
      if (h.severidad === 'brecha-critica') a.criticas += 1; else a.leves += 1;
      por.set(h.skill_id, a);
    }
  }
  return [...por.values()].sort((a, b) =>
    (b.personas.length - a.personas.length) || (b.criticas - a.criticas)
    || a.nombre.localeCompare(b.nombre, 'es'));
}

/** G4 — quién cae en cada cuadrante. */
export function matrizDeGrupo(perfiles) {
  const celdas = Object.fromEntries(Object.keys(MATRIZ).map((k) => [k, []]));
  const sinUbicar = [];
  for (const pf of perfiles) {
    if (pf.matriz) celdas[pf.matriz.clave].push(pf);
    else sinUbicar.push(pf);
  }
  return { celdas, sinUbicar };
}

/** Avisos sobre el cómputo del equipo, no sobre las personas. */
export function avisosEquipo(perfiles) {
  const avisos = [];
  for (const pf of perfiles) {
    if (pf.categorias_faltantes.length) {
      avisos.push({
        tipo: 'categoria-faltante', severidad: 'alta', persona: pf.persona.nombre,
        mensaje: `El cómputo de ${pf.persona.nombre} puede estar sesgado: no hay evaluaciones de `
               + `${pf.categorias_faltantes.join(' ni ')}, así que las categorías restantes pesan `
               + 'más de lo que define el modelo.',
      });
    }
    if (pf.evaluadores_faltantes.length) {
      const es = { Employee: 'la autoevaluación', Leader: 'la evaluación del líder', Peer: 'la de los pares' };
      avisos.push({
        tipo: 'evaluador-faltante', severidad: 'media', persona: pf.persona.nombre,
        mensaje: `A ${pf.persona.nombre} le falta ${pf.evaluadores_faltantes.map((r) => es[r]).join(' y ')}. `
               + 'El peso se reparte entre quienes sí evaluaron, así que el número es válido pero parcial.',
      });
    }
    if (pf.cerca_de_umbral) {
      // "a 0 puntos de" se lee como un error de cálculo. Cuando el total cae
      // exactamente en el borde hay que decir eso, que además es más grave.
      const donde = pf.margen_banda < 0.05
        ? `está justo en el borde con ${pf.banda_vecina}`
        : `está a ${pf.margen_banda} ${pf.margen_banda === 1 ? 'punto' : 'puntos'} `
          + `de pasar a ${pf.banda_vecina}`;
      avisos.push({
        tipo: 'umbral', severidad: 'media', persona: pf.persona.nombre,
        mensaje: `${pf.persona.nombre} ${donde}. Un solo cambio de criterio puede moverlo, `
               + `así que conviene mirar el número (${pf.perfil_total}) y no solo el nivel.`,
      });
    }
  }
  return avisos;
}

/* -------------------------------------------------------------------------
   Pendientes — lo que le da ritmo a la sesión
   ------------------------------------------------------------------------- */

function tieneEvaluacion(evaluadoId, rol, mia = false) {
  const evs = datos.evalPorPersona.get(evaluadoId) ?? [];
  return evs.some((e) => e.rol === rol && (!mia || e.evaluador === 'yo'));
}

/**
 * Tareas abiertas del usuario en sesión, en el orden en que conviene hacerlas:
 * primero lo propio, después lo del equipo, al final lo de los pares.
 */
export function pendientes(personaId) {
  const p = persona(personaId);
  if (!p) return [];
  const tareas = [];

  if (p.cargo_id && !tieneEvaluacion(p.id, 'Employee')) {
    tareas.push({
      tipo: 'autoevaluacion', ruta: '#/autoevaluacion',
      titulo: 'Tu autoevaluación', detalle: 'Sin ella tu perfil se calcula con dos de tres miradas.',
    });
  }

  for (const p2 of reportesDirectos(p.id)) {
    if (p2.cargo_id && !tieneEvaluacion(p2.id, 'Leader', true)) {
      tareas.push({
        tipo: 'equipo', ruta: `#/evaluar/${p2.id}`, personaId: p2.id,
        titulo: `Evaluar a ${p2.nombre}`,
        detalle: cargo(p2.cargo_id)?.nombre ?? '',
      });
    }
  }

  for (const parId of p.evalua_como_par ?? []) {
    const p2 = persona(parId);
    if (p2 && p2.cargo_id && !tieneEvaluacion(p2.id, 'Peer', true)) {
      tareas.push({
        tipo: 'par', ruta: `#/evaluar/${p2.id}`, personaId: p2.id,
        titulo: `Evaluar a ${p2.nombre} como par`,
        detalle: 'Solo lo que has observado trabajando con esa persona.',
      });
    }
  }

  return tareas;
}

/* -------------------------------------------------------------------------
   Respuestas con las que abre el formulario
   -------------------------------------------------------------------------
   Abrir una evaluación ya enviada muestra lo que se envió, no un formulario
   en blanco: "Revisar mi evaluación" que obliga a contestar de nuevo no
   revisa nada.
   ------------------------------------------------------------------------- */

const PUNTAJE_A_NIVEL = Object.fromEntries(
  Object.entries(NIVEL_A_PUNTAJE).map(([nivel, puntaje]) => [puntaje, nivel]));

/** Lo que quien está en sesión ya envió sobre esta persona: `{ skillId: nivel }`, o null. */
export function respuestasEnviadas(evaluadoId, rol) {
  const propias = (datos?.evalPorPersona.get(evaluadoId) ?? [])
    .filter((e) => e.rol === rol && e.evaluador === 'yo');
  if (!propias.length) return null;
  return Object.fromEntries(propias
    .map((e) => [e.skill_id, PUNTAJE_A_NIVEL[e.puntaje] ?? (e.puntaje <= 2 ? 'Basic' : null)])
    .filter(([, nivel]) => nivel));
}

/** El rol con el que este usuario evalúa a otra persona, o null. El servidor decide igual. */
export function rolDeEvaluacion(evaluadorId, evaluadoId) {
  const p = persona(evaluadorId);
  if (!p) return null;
  if (evaluadorId === evaluadoId) return 'Employee';
  if (reportesDirectos(evaluadorId).some((x) => x.id === evaluadoId)) return 'Leader';
  if ((p.evalua_como_par ?? []).includes(evaluadoId)) return 'Peer';
  return null;
}

/* -------------------------------------------------------------------------
   Escrituras
   -------------------------------------------------------------------------
   Cada escritura avisa con un evento en lugar de que cada vista se acuerde de
   refrescar la carcasa: sin esto, el contador de pendientes del encabezado se
   quedaba viejo después de enviar una evaluación.
   ------------------------------------------------------------------------- */

function avisarCambio(que) {
  document.dispatchEvent(new CustomEvent('cdp:cambio', { detail: { que } }));
}

/**
 * Envía una evaluación. El servidor decide el rol por la relación y reemplaza
 * las respuestas previas de este evaluador: reenviar no duplica el promedio.
 */
export async function guardarEvaluacion({ evaluadoId, respuestas }) {
  const r = await llamar('guardarEvaluacion', { evaluadoId, respuestas });
  const evs = datos.evalPorPersona.get(evaluadoId) ?? [];
  const restantes = evs.filter((e) => !(e.rol === r.rol && e.evaluador === 'yo'));
  for (const [skillId, puntaje] of Object.entries(respuestas)) {
    restantes.push({ persona_id: evaluadoId, skill_id: skillId, rol: r.rol, evaluador: 'yo', puntaje: Number(puntaje) });
  }
  datos.evalPorPersona.set(evaluadoId, restantes);
  avisarCambio('evaluacion');
  return { guardadas: r.guardadas };
}

/* --- Planes de desarrollo ------------------------------------------------ */

export const planesDe = (personaId) => (datos?.planes ?? [])
  .filter((x) => x.persona_id === personaId);

export const plan = (id) => (datos?.planes ?? []).find((x) => x.id === id) ?? null;

export async function guardarPlan({ id = null, personaId, titulo, objetivo, propuesta, skillIds = [] }) {
  const r = await llamar('guardarPlan', { id, personaId, titulo, objetivo, propuesta, skillIds });
  const i = datos.planes.findIndex((x) => x.id === r.plan.id);
  if (i >= 0) datos.planes[i] = r.plan; else datos.planes.push(r.plan);
  avisarCambio('plan');
  return r.plan;
}

export async function borrarPlan(id) {
  await llamar('borrarPlan', { id });
  const i = datos.planes.findIndex((x) => x.id === id);
  if (i >= 0) datos.planes.splice(i, 1);
  avisarCambio('plan');
}

/* --- Administración -------------------------------------------------------
   Todo pasa por el servidor, que valida y audita. Después se recarga: mover a
   alguien de equipo o nombrar un interino cambia el alcance de otras personas,
   y recalcular eso acá sería duplicar la regla que vive en el script.
   ------------------------------------------------------------------------- */

/**
 * Las escrituras de administración van en fila: dos cambios rápidos seguidos
 * (dos chips, dos niveles) ya no compiten por la recarga.
 *
 * Si el guardado salió bien pero la recarga falla, NO se informa como error:
 * el cambio ya está en el servidor, y reintentar "crear" duplicaría el
 * registro. Se avisa aparte y se ofrece recargar.
 */
let fila = Promise.resolve();

function admin(accion, datosAccion) {
  const tarea = fila.then(async () => {
    const r = await llamar(accion, datosAccion);
    try {
      await recargar();
    } catch {
      document.dispatchEvent(new CustomEvent('cdp:recarga-fallida'));
    }
    return r;
  });
  fila = tarea.catch(() => {});
  return tarea;
}

export const actualizar = (entidad, id, cambios, motivo = '') =>
  admin('admin.actualizar', { entidad, id, cambios, motivo });

export const crear = (entidad, valores) => admin('admin.crear', { entidad, valores });

/** Varios niveles de un cargo de una vez: `cambios` = [{ skillId, nivel }]; nivel '' quita. */
export const fijarNivelesEsperados = (cargoId, cambios, motivo = '') =>
  admin('admin.cargoHabilidad', { cargoId, cambios, motivo });

export const asignarPar = (evaluadorId, evaluadoId, activo) =>
  admin('admin.par', { evaluadorId, evaluadoId, activo });

export const fijarAdministrador = (personaId, activo) =>
  admin('admin.administrador', { personaId, activo });

export const anularEvaluacion = (evaluadoId, evaluadorId, rol, motivo, anulada = true) =>
  admin('admin.anularEvaluacion', { evaluadoId, evaluadorId, rol, motivo, anulada });

/** Consulta de la auditoría. No recarga: solo lee. */
export const auditoria = (filtros = {}, pagina = 0, tamano = 100) =>
  llamar('admin.auditoria', { filtros, pagina, tamano });

/* --- Catálogo (la vista de catálogo usa estos nombres) -------------------- */

const COL_NIVEL = { Basic: 'nivel_basico', Intermediate: 'nivel_intermedio', Advanced: 'nivel_avanzado', Expert: 'nivel_experto' };

function aFilaHabilidad(cambios) {
  const fila = {};
  for (const [k, v] of Object.entries(cambios)) {
    if (k === 'niveles') for (const [n, t] of Object.entries(v ?? {})) fila[COL_NIVEL[n]] = t;
    else fila[k] = v ?? '';
  }
  return fila;
}

export const actualizarSkill = (id, cambios) => actualizar('habilidad', id, aFilaHabilidad(cambios));
export const crearSkill = (valores) => crear('habilidad', aFilaHabilidad(valores));

/** Valor del nivel, reexportado para que las vistas no importen dos módulos. */
export { valorNivel };
