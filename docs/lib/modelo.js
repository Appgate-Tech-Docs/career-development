/**
 * Modelo de evaluación — Career Development Portal
 *
 * Implementa el cálculo tal como está definido en el Excel origen (hojas ESCALA
 * y MasterTable), que es la línea base del instrumento. El PoC no lo tenía: usaba
 * una escala lineal 2/3/4/5, promediaba los tres evaluadores por igual, y llamaba
 * "brecha" al promedio más bajo. Ninguna de esas tres cosas es lo que el
 * instrumento hace.
 *
 * Los pesos y escalas NO están fijos en este archivo: se leen de
 * `data/framework.json`, que genera `scripts/extract_framework.py` desde el
 * Excel. Si RRHH cambia un peso, se vuelve a correr el script y el portal lo
 * toma — sin tocar código.
 *
 * ============================ DOS DIVERGENCIAS ============================
 * Este módulo se aparta del Excel en dos puntos, ambos deliberados y marcados
 * con DIVERGENCIA en el código. No son bugs y no deben "corregirse" sin decidir
 * antes con RRHH. Ver DESIGN-SYSTEM.md § Modelo de evaluación.
 * =========================================================================
 */

let framework = null;
let cargando = null;

/** Carga (y memoriza) el framework. Idempotente y seguro de llamar en paralelo. */
export async function cargarFramework() {
  if (framework) return framework;
  if (cargando) return cargando;

  cargando = fetch(new URL('../data/framework.json', import.meta.url))
    .then((res) => {
      if (!res.ok) throw new Error(`framework.json: HTTP ${res.status}`);
      return res.json();
    })
    .then((data) => { framework = data; return data; })
    .finally(() => { cargando = null; });

  return cargando;
}

/** El framework ya cargado, o null. Para código sincrónico que no puede esperar. */
export const frameworkActual = () => framework;

/**
 * Siembra el modelo que llega en la respuesta de `inicio` (hoja Modelo del
 * Excel). Una sola fuente para la escala: dos es la forma más fácil de que
 * diverjan sin que nadie lo note.
 */
export function sembrarModelo(modelo, listaCargos = []) {
  framework = { modelo, cargos: listaCargos };
  return framework;
}

/* =========================================================================
   Constantes del instrumento
   =========================================================================
   Viven acá y no en api.js porque describen la escala, no el transporte. El
   formulario y las bandas de puntaje tienen que coincidir en esto, y api.js las
   reexporta para que las pantallas anteriores no cambien.
   ========================================================================= */

/** Nivel → puntaje 1-5. */
export const NIVEL_A_PUNTAJE = { Basic: 2, Intermediate: 3, Advanced: 4, Expert: 5 };

/** Orden del más bajo al más alto. Un índice acá ES la severidad de la brecha. */
export const NIVEL_ORDEN = ['Basic', 'Intermediate', 'Advanced', 'Expert'];

export const NIVEL_LABEL = {
  Basic: 'Básico', Intermediate: 'Intermedio', Advanced: 'Avanzado', Expert: 'Experto',
};

/* =========================================================================
   Escalas
   ========================================================================= */

/**
 * Valor numérico de un nivel: Basic 40, Intermediate 70, Advanced 90, Expert 100.
 * Es la escala del instrumento (ESCALA!J18:K21) y NO es lineal: el salto de
 * Basic a Intermediate son 30 puntos, el de Advanced a Expert son 10.
 */
export function valorNivel(nivel) {
  const tabla = framework?.modelo?.valor_nivel ?? {};
  return tabla[nivel] ?? null;
}

/** Banda de nivel para un valor 0-100 (ESCALA!W18:Y21). */
export function nivelDeValor(valor) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return null;
  const bandas = framework?.modelo?.bandas_total ?? [];
  // El Excel evalúa con <= sobre el máximo de cada banda, en orden.
  for (const banda of bandas) {
    if (valor <= banda.max) return banda.nivel;
  }
  return bandas.length ? bandas[bandas.length - 1].nivel : null;
}

/**
 * Etiqueta cualitativa de un puntaje 1-5 (ESCALA!D6:G10):
 * 1 Critical · 2 Low · 3 Satisfactory · 4 Outstanding · 5 Excellent.
 * El Excel usa ROUNDDOWN, así que 2.9 sigue siendo "Low".
 */
export function conceptoDePuntaje(puntaje) {
  if (puntaje === null || puntaje === undefined || Number.isNaN(puntaje)) return null;
  const bandas = [...(framework?.modelo?.bandas_puntaje ?? [])]
    .filter((b) => b.etiqueta)
    .sort((a, b) => a.puntaje - b.puntaje);
  // La banda es la de mayor umbral que no supera el puntaje, SIN redondear.
  // El Excel V6 hace ROUNDDOWN(puntaje, 0) antes de buscar — resto de la
  // escala de 5 bandas enteras — y con eso 5 de sus 10 etiquetas quedan
  // inalcanzables: un 3.6 nunca llega a "Good / Satisfactory". Acá se busca con
  // el valor real para que la escala nueva funcione como se diseñó.
  let salida = null;
  for (const banda of bandas) {
    if (banda.puntaje <= puntaje + 1e-9) salida = banda.etiqueta;
  }
  return salida ?? (bandas[0]?.etiqueta ?? null);
}

/**
 * La etiqueta cualitativa en español. El Excel la trae en inglés, igual que los
 * niveles; el portal traduce los dos para que una misma pantalla no mezcle
 * idiomas. La clave es el texto exacto de ESCALA, así que si RRHH cambia una
 * etiqueta, la traducción que falte se nota: cae al original en inglés.
 */
export const CONCEPTO_ES = {
  'Critical (Severe)': 'Crítico (severo)',
  'Critical (Moderate)': 'Crítico (moderado)',
  'Low (Incomplete)': 'Bajo (incompleto)',
  'Low (Close to Target)': 'Bajo (cerca de la meta)',
  'Satisfactory': 'Satisfactorio',
  'Good / Satisfactory': 'Bueno / satisfactorio',
  'Outstanding': 'Sobresaliente',
  'Outstanding +': 'Sobresaliente +',
  'Excellent': 'Excelente',
  'Exceptional': 'Excepcional',
};

export function conceptoEs(puntaje) {
  const c = conceptoDePuntaje(puntaje);
  return c ? (CONCEPTO_ES[c] ?? c) : null;
}

/* =========================================================================
   Puntaje ponderado por evaluador
   ========================================================================= */

/**
 * Puntaje ponderado de una habilidad, en escala 1-5.
 *
 * Fórmula del Excel (Assessment!AE8):
 *     0.30 × Employee + 0.35 × Leader + 0.35 × Peer
 *
 * DIVERGENCIA 1 — evaluadores ausentes.
 * El Excel trata una celda vacía como 0, así que una habilidad calificada 4 y 4
 * por empleado y líder, sin par, da 2.6 en lugar de 4.0 — y cae en la banda
 * "Low". Durante una ronda en curso, donde las evaluaciones de pares llegan
 * tarde, eso hace que todo el mundo se vea en crisis por un dato que falta.
 *
 * Acá los pesos se REDISTRIBUYEN entre los evaluadores presentes, así que 4 y 4
 * sin par da 4.0. `evaluadoresFaltantes` viaja en el resultado para que la
 * interfaz pueda decir que el dato está incompleto en lugar de fingir que no.
 *
 * Pasa `redistribuir: false` para reproducir exactamente el número del Excel.
 */
export function puntajePonderado(puntajes, { redistribuir = true } = {}) {
  const pesos = framework?.modelo?.pesos_evaluador ?? {};
  const entradas = [
    ['Employee', puntajes.employee],
    ['Leader', puntajes.leader],
    ['Peer', puntajes.peer],
  ];

  const presentes = entradas.filter(([, v]) => v !== null && v !== undefined && !Number.isNaN(v));
  const faltantes = entradas.filter(([, v]) => v === null || v === undefined || Number.isNaN(v)).map(([k]) => k);

  if (!presentes.length) {
    return { valor: null, concepto: null, evaluadoresFaltantes: faltantes, completo: false };
  }

  const pesoTotal = presentes.reduce((acc, [rol]) => acc + (pesos[rol] ?? 0), 0);
  const bruto = presentes.reduce((acc, [rol, v]) => acc + (pesos[rol] ?? 0) * v, 0);

  // Sin redistribuir, el divisor es 1 (la suma de TODOS los pesos), que es lo
  // que hace el Excel al dejar la celda ausente en cero.
  const valor = redistribuir && pesoTotal > 0 ? bruto / pesoTotal : bruto;

  return {
    valor: Math.round(valor * 100) / 100,
    concepto: conceptoDePuntaje(valor),
    evaluadoresFaltantes: faltantes,
    completo: faltantes.length === 0,
  };
}

/* =========================================================================
   Perfil agregado por categoría
   ========================================================================= */

/**
 * Promedio ponderado de un conjunto de niveles, en escala 0-100.
 *
 * Fórmula del Excel (ESCALA!S6:S10):
 *     suma(cantidad_en_nivel × valor_del_nivel) / cantidad_total
 *
 * Que es simplemente el promedio de los valores de nivel. Se implementa contando
 * por nivel para que coincida término a término con el libro y sea auditable.
 */
export function perfilDeNiveles(niveles) {
  const validos = (niveles ?? []).filter((n) => valorNivel(n) !== null);
  if (!validos.length) return { valor: null, nivel: null, cantidad: 0, conteo: {} };

  const conteo = {};
  validos.forEach((n) => { conteo[n] = (conteo[n] ?? 0) + 1; });

  const puntos = Object.entries(conteo)
    .reduce((acc, [nivel, cantidad]) => acc + cantidad * valorNivel(nivel), 0);
  const valor = puntos / validos.length;

  return {
    valor: Math.round(valor * 100) / 100,
    nivel: nivelDeValor(valor),
    cantidad: validos.length,
    conteo,
  };
}

/**
 * Total general a partir de los tres perfiles de categoría.
 *
 * DIVERGENCIA 2 — pesos por categoría.
 * ESCALA declara Funciones 0.50 · Soft 0.25 · Hard 0.25 (celdas J12:K14), pero
 * NINGUNA fórmula del libro los referencia: el total es
 * `AVERAGE(S10:U10)`, un promedio simple. Se verificó buscando referencias a
 * esas celdas en las diez hojas: cero.
 *
 * Por defecto se replica lo que el libro HACE (promedio simple), no lo que
 * DECLARA. Pasa `ponderado: true` para aplicar los pesos declarados.
 *
 * Esto necesita decisión de RRHH: si la intención era ponderar, el total cambia
 * y las funciones deberían pesar el doble que las otras dos categorías juntas.
 */
export function totalGeneral(porCategoria, { ponderado = false } = {}) {
  const pesos = framework?.modelo?.pesos_categoria ?? {};
  const entradas = Object.entries(porCategoria ?? {})
    .filter(([, v]) => v !== null && v !== undefined && !Number.isNaN(v));

  if (!entradas.length) return { valor: null, nivel: null, metodo: null };

  let valor;
  if (ponderado) {
    const pesoTotal = entradas.reduce((acc, [cat]) => acc + (pesos[cat] ?? 0), 0);
    valor = pesoTotal > 0
      ? entradas.reduce((acc, [cat, v]) => acc + (pesos[cat] ?? 0) * v, 0) / pesoTotal
      : entradas.reduce((acc, [, v]) => acc + v, 0) / entradas.length;
  } else {
    valor = entradas.reduce((acc, [, v]) => acc + v, 0) / entradas.length;
  }

  return {
    valor: Math.round(valor * 100) / 100,
    nivel: nivelDeValor(valor),
    metodo: ponderado ? 'ponderado' : 'promedio-simple',
  };
}

/* =========================================================================
   Brechas — real vs esperado
   ========================================================================= */

export const ORDEN_NIVEL = ['Basic', 'Intermediate', 'Advanced', 'Expert'];

/**
 * Brecha de una habilidad: nivel observado contra el nivel ESPERADO del cargo.
 *
 * Esto es lo que el PoC no tenía. El PoC ordenaba por promedio más bajo y
 * llamaba "brecha" al resultado, lo que marca a un junior que rinde exactamente
 * a su nivel esperado como su propia prioridad número uno, y puede esconder a un
 * senior por debajo de lo esperado si su número absoluto es alto.
 *
 * @returns {{ cumple: boolean, escalones: number, puntos: number|null,
 *             observado: string|null, esperado: string|null, severidad: string }}
 *          `escalones` es la distancia en niveles (negativo = por debajo).
 */
export function brechaHabilidad({ nivelObservado, nivelEsperado }) {
  const iObs = ORDEN_NIVEL.indexOf(nivelObservado);
  const iEsp = ORDEN_NIVEL.indexOf(nivelEsperado);

  if (iEsp === -1) {
    // Sin nivel esperado no hay brecha que calcular — no es lo mismo que
    // cumplir. La interfaz debe decir "sin referencia", no "cumple".
    return {
      cumple: null, escalones: null, puntos: null,
      observado: nivelObservado ?? null, esperado: null, severidad: 'sin-referencia',
    };
  }
  if (iObs === -1) {
    return {
      cumple: null, escalones: null, puntos: null,
      observado: null, esperado: nivelEsperado, severidad: 'sin-evaluar',
    };
  }

  const escalones = iObs - iEsp;
  const puntos = valorNivel(nivelObservado) - valorNivel(nivelEsperado);

  let severidad;
  if (escalones >= 1) severidad = 'supera';
  else if (escalones === 0) severidad = 'cumple';
  else if (escalones === -1) severidad = 'brecha-leve';
  else severidad = 'brecha-critica';

  return {
    cumple: escalones >= 0,
    escalones,
    puntos: Math.round(puntos * 100) / 100,
    observado: nivelObservado,
    esperado: nivelEsperado,
    severidad,
  };
}

/**
 * Ordena habilidades por prioridad de desarrollo real.
 * Primero las brechas más profundas; entre iguales, primero la categoría que más
 * pesa. Las que cumplen o superan quedan al final: no son prioridades.
 */
export function ordenarPorPrioridad(habilidades) {
  const pesos = framework?.modelo?.pesos_categoria ?? {};
  return [...habilidades].sort((a, b) => {
    const ea = a.brecha?.escalones, eb = b.brecha?.escalones;
    // Sin referencia va al final: no se puede priorizar lo que no se sabe.
    if (ea === null || ea === undefined) return 1;
    if (eb === null || eb === undefined) return -1;
    if (ea !== eb) return ea - eb;
    return (pesos[b.tipo] ?? 0) - (pesos[a.tipo] ?? 0);
  });
}

/* =========================================================================
   Framework por cargo
   ========================================================================= */

/** Todos los cargos definidos, ordenados por área y nombre. */
export function cargos() {
  return [...(framework?.cargos ?? [])].sort((a, b) =>
    (a.area || '').localeCompare(b.area || '', 'es') || a.cargo.localeCompare(b.cargo, 'es'));
}

/** Un cargo por nombre exacto, o null. */
export function cargoPorNombre(nombre) {
  if (!nombre) return null;
  const buscado = String(nombre).trim().toLowerCase();
  return (framework?.cargos ?? []).find((c) => c.cargo.trim().toLowerCase() === buscado) ?? null;
}

/**
 * Nivel esperado de una habilidad para un cargo, o null si el cargo no la
 * incluye. El nombre se compara normalizado porque el catálogo original tiene 19
 * nombres con espacios y saltos de línea sueltos.
 */
export function nivelEsperado(cargo, nombreHabilidad) {
  const def = typeof cargo === 'string' ? cargoPorNombre(cargo) : cargo;
  if (!def) return null;
  const buscado = normalizar(nombreHabilidad);
  return def.habilidades.find((h) => normalizar(h.nombre) === buscado)?.nivel_esperado ?? null;
}

/** Misma normalización que usa el extractor de Python, para que las claves casen. */
export function normalizar(texto) {
  return String(texto ?? '')
    .replace(/ /g, ' ')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Advertencias del framework que la interfaz de RH debería mostrar. */
export function avisosFramework() {
  const v = framework?.validacion;
  if (!v) return [];
  const avisos = [];

  if (v.sin_definicion?.length) {
    avisos.push({
      tipo: 'sin-definicion',
      cantidad: v.sin_definicion.length,
      mensaje: `${v.sin_definicion.length} habilidades están asignadas a un cargo pero no existen en el catálogo, así que no se pueden evaluar.`,
      detalle: v.sin_definicion,
    });
  }
  if (v.nivel_esperado_faltante?.length) {
    avisos.push({
      tipo: 'sin-nivel',
      cantidad: v.nivel_esperado_faltante.length,
      mensaje: `${v.nivel_esperado_faltante.length} habilidades de cargo no tienen nivel esperado, así que no generan brecha.`,
      detalle: v.nivel_esperado_faltante,
    });
  }
  if (v.duplicados_en_catalogo?.length) {
    avisos.push({
      tipo: 'duplicados',
      cantidad: v.duplicados_en_catalogo.length,
      mensaje: `${v.duplicados_en_catalogo.length} habilidades están duplicadas en el catálogo (mismo departamento y nombre).`,
      detalle: v.duplicados_en_catalogo,
    });
  }
  return avisos;
}
