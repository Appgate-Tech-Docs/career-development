/* =========================================================================
   GRÁFICAS — las del reporte del Excel V6 y las que hacen falta para escalar
   =========================================================================
   Hechas en HTML con marcadores SVG pequeños, sin librería: escalan con el
   ancho sin cálculos de viewBox, el texto sigue siendo texto (se selecciona,
   se traduce, lo lee un lector de pantalla) y el paquete de un solo archivo no
   tiene que arrastrar 200 KB de Chart.js.

   Reglas que cumplen todas, y que no hay que romper al agregar una:
   - Cada gráfica tiene su tabla equivalente. El tooltip ayuda, nunca es la
     única forma de leer un valor.
   - Con dos o más series hay leyenda. La identidad nunca va solo en el color:
     cada mirada tiene además su forma y su carril.
   - El texto usa tintas de texto, nunca el color de la serie.
   - Una sola parada de tabulación por gráfica; las flechas recorren sus
     marcas. Con una parada por marca, el tablero del equipo tenía más de
     veinte antes de llegar a la tabla de personas.
   - Los colores salen de la marca Appgate y están validados con el script de
     la guía de visualización (separación bajo daltonismo en todos los pares:
     ΔE 19,6; visión normal: 20,6). Ver styles/graficas.css.
   ========================================================================= */

import { esc, icon, sincronizarScrollables } from './ui.js';
import { NIVEL_ES, CATEGORIAS, EJE_MATRIZ, MATRIZ, numeroCuadrante } from './almacen.js';

const MIRADAS = [
  { key: 'employee', label: 'Autoevaluación', forma: 'circulo' },
  { key: 'leader', label: 'Líder', forma: 'cuadrado' },
  { key: 'peer', label: 'Pares', forma: 'rombo' },
];

const NIVELES = ['Basic', 'Intermediate', 'Advanced', 'Expert'];

const hay = (v) => v !== null && v !== undefined;
const fmt = (v, d = 1) => (hay(v) ? Number(v).toFixed(d) : '—');
const pct = (v, min, max) => `${Math.max(0, Math.min(100, ((v - min) / (max - min)) * 100))}%`;
const etiquetaCat = (k) => CATEGORIAS.find((c) => c.key === k)?.label ?? k;

/** Marcador con forma propia. Se dibuja dos veces: primero un anillo del color
 *  de la superficie, que lo separa de la cuadrícula y de otro marcador que caiga
 *  encima, y encima la figura con su borde. El borde solo se nota en Pares:
 *  #65BAE8 queda en 2,16:1 contra la superficie y el borde lo sube a 3:1. */
function marcador(forma, clase) {
  const figura = {
    circulo: '<circle cx="7" cy="7" r="5"/>',
    cuadrado: '<rect x="2.5" y="2.5" width="9" height="9" rx="1"/>',
    rombo: '<path d="M7 1.2 12.8 7 7 12.8 1.2 7Z"/>',
  }[forma];
  return `<svg class="grafica__marca ${clase}" viewBox="0 0 14 14" width="14" height="14"
              aria-hidden="true" focusable="false"><g class="grafica__anillo">${figura}</g><g class="grafica__figura">${figura}</g></svg>`;
}

/**
 * El marco común: título, leyenda, trazado, aviso y tabla equivalente.
 *
 * etiquetadoPor: id del h2 de la sección cuando la gráfica es lo único que
 * hay en ella. Ahí el título propio repetía el encabezado palabra por palabra,
 * así que se omite y la figura toma el nombre de la sección. Sin él, el título
 * es un h3: vive dentro de una sección con su propio h2.
 */
function contenedor({ id, titulo, etiquetadoPor = null, subtitulo, leyenda = '', cuerpo, aviso = '', tabla, marcas = true }) {
  const nombre = etiquetadoPor ?? `${id}-t`;
  return `
    <figure class="grafica${etiquetadoPor ? ' grafica--suelta' : ''}" id="${id}" aria-labelledby="${nombre}">
      <figcaption class="grafica__cabeza">
        ${etiquetadoPor ? '' : `<h3 class="grafica__titulo" id="${id}-t">${esc(titulo)}</h3>`}
        ${subtitulo ? `<span class="grafica__subtitulo">${subtitulo}</span>` : ''}
      </figcaption>
      ${leyenda}
      <div class="grafica__cuerpo" data-marcas>${marcas
        ? '<p class="sr-only">Con el foco en la gráfica, las flechas recorren los valores. La tabla de abajo tiene los mismos datos.</p>' : ''}${cuerpo}</div>
      ${aviso}
      <details class="grafica__tabla">
        <summary>${icon('chevronRight', { className: 'grafica__tabla-flecha' })}<span class="grafica__tabla-ver">Ver como tabla</span><span class="grafica__tabla-ocultar">Ocultar tabla</span></summary>
        <div class="table-wrap">${tabla}</div>
      </details>
    </figure>`;
}

/* =========================================================================
   G1 — Las tres miradas por categoría
   ========================================================================= */

/**
 * Puntos alineados: una fila por categoría, un carril por evaluador, en la
 * escala 1-5. Reemplaza el radar del Excel: con tres ejes, un radar es un
 * triángulo que engaña con el área y no deja comparar dos valores.
 */
export function graficaMiradas(miradas, { id = 'g-miradas', titulo = 'Cómo te ve cada evaluador', etiquetadoPor = null } = {}) {
  const cats = CATEGORIAS.filter((c) => miradas?.[c.key]);
  if (!cats.length) return '';

  const leyenda = `
    <ul class="grafica__leyenda" aria-label="Leyenda">
      ${MIRADAS.map((m) => `
        <li>${marcador(m.forma, `serie-${m.key}`)}<span>${esc(m.label)}</span></li>`).join('')}
    </ul>`;

  const filas = cats.map((c) => `
    <div class="puntos__fila">
      <span class="puntos__cat">${esc(c.label)}</span>
      <div class="puntos__plot">
        ${[1, 2, 3, 4, 5].map((t) => `<span class="grafica__grid" style="left:${pct(t, 1, 5)}"></span>`).join('')}
        ${MIRADAS.map((m, i) => {
          const v = miradas[c.key][m.key];
          if (!hay(v)) return '';
          return `<span class="puntos__punto" style="left:${pct(v, 1, 5)};--carril:${i}"
                        tabindex="0" role="img"
                        aria-label="${esc(`${m.label}, ${c.label}: ${fmt(v)} de 5`)}"
                        data-tip-valor="${esc(fmt(v))}" data-tip-etiqueta="${esc(`${m.label} · ${c.label}`)}"
                  >${marcador(m.forma, `serie-${m.key}`)}</span>`;
        }).join('')}
      </div>
    </div>`).join('');

  const eje = `
    <div class="puntos__fila puntos__fila--eje" aria-hidden="true">
      <span class="puntos__cat"></span>
      <div class="puntos__eje">
        ${[1, 2, 3, 4, 5].map((t) => `<span style="left:${pct(t, 1, 5)}">${t}</span>`).join('')}
      </div>
    </div>`;

  const tabla = `
    <table class="table">
      <caption class="sr-only">Puntaje promedio de cada evaluador por categoría, de 1 a 5.</caption>
      <thead><tr><th scope="col">Categoría</th>${MIRADAS.map((m) => `<th scope="col">${esc(m.label)}</th>`).join('')}</tr></thead>
      <tbody>${cats.map((c) => `
        <tr><th scope="row" class="wizard__fila-habilidad">${esc(c.label)}</th>
          ${MIRADAS.map((m) => `<td class="numeric">${fmt(miradas[c.key][m.key])}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>`;

  return contenedor({
    id,
    titulo,
    etiquetadoPor,
    subtitulo: 'Promedio por categoría, de 1 a 5. Donde los puntos se separan, las miradas no coinciden.',
    leyenda,
    cuerpo: `<div class="puntos">${filas}${eje}</div>`,
    tabla,
  });
}

/* =========================================================================
   G2 — Cada categoría contra el nivel que el cargo espera
   ========================================================================= */

// Un valor que falta no tiene nivel. Antes caía en el primer corte (null <= 40
// es verdadero en JavaScript) y una categoría sin evaluar se leía "Básico".
const nivelDe = (v) => {
  if (!hay(v)) return 'sin dato';
  for (const [max, n] of [[40, 'Basic'], [70, 'Intermediate'], [90, 'Advanced']]) {
    if (v <= max) return NIVEL_ES[n];
  }
  return NIVEL_ES.Expert;
};

export function graficaContraEsperado(observado, esperado, { id = 'g-esperado', etiquetadoPor = null } = {}) {
  const cats = CATEGORIAS.filter((c) => hay(observado?.[c.key]) || hay(esperado?.[c.key]));
  if (!cats.length) return '';

  const leyenda = `
    <ul class="grafica__leyenda" aria-label="Leyenda">
      <li><span class="grafica__muestra grafica__muestra--barra"></span><span>Hoy</span></li>
      <li><span class="grafica__muestra grafica__muestra--meta"></span><span>Lo que el cargo espera</span></li>
    </ul>`;

  const filas = cats.map((c) => {
    const v = observado?.[c.key];
    const e = esperado?.[c.key];
    const conMeta = hay(e);
    return `
      <div class="bala__fila">
        <span class="bala__cat">${esc(c.label)}</span>
        <div class="bala__plot">
          ${[40, 70, 90].map((t) => `<span class="grafica__grid" style="left:${t}%"></span>`).join('')}
          ${hay(v) ? `<span class="bala__barra" style="width:${pct(v, 0, 100)}"
                        tabindex="0" role="img"
                        aria-label="${esc(`${c.label}: hoy ${fmt(v)} (${nivelDe(v)})${
                          conMeta ? `; el cargo espera ${fmt(e)} (${nivelDe(e)})` : ''}`)}"
                        data-tip-valor="${esc(`${fmt(v)} · ${nivelDe(v)}`)}"
                        data-tip-etiqueta="${esc(conMeta
                          ? `${c.label} · el cargo espera ${fmt(e)} (${nivelDe(e)})` : c.label)}"></span>`
            : `<span class="sr-only">${esc(c.label)}: sin evaluar${conMeta ? `; el cargo espera ${fmt(e)}` : ''}.</span>`}
          ${conMeta ? `<span class="bala__meta" style="left:${pct(e, 0, 100)}" aria-hidden="true"></span>` : ''}
          <span class="bala__valor" aria-hidden="true">${fmt(v)}</span>
        </div>
      </div>`;
  }).join('');

  // Los cortes de nivel como ejes con nombre: es lo que responde "¿en qué nivel
  // cae?" sin que haya que recordar que 70 es el borde de Intermedio.
  const eje = `
    <div class="bala__fila bala__fila--eje" aria-hidden="true">
      <span class="bala__cat"></span>
      <div>
        <div class="bala__bandas">
          ${[['Básico', 40], ['Intermedio', 30], ['Avanzado', 20], ['Experto', 10]]
            .map(([n, w]) => `<span style="width:${w}%">${n}</span>`).join('')}
        </div>
        <!-- En angosto, la franja de Experto mide unos 18 px y ningún nombre cabe:
             ahí se muestran los cortes como números. Los nombres siguen en la tabla. -->
        <div class="bala__cortes">
          ${[40, 70, 90].map((t) => `<span style="left:${t}%">${t}</span>`).join('')}
        </div>
      </div>
    </div>`;

  const tabla = `
    <table class="table">
      <caption class="sr-only">Valor de cada categoría hoy y el que el cargo espera, de 0 a 100.</caption>
      <thead><tr><th scope="col">Categoría</th><th scope="col">Hoy</th><th scope="col">Esperado</th><th scope="col">Diferencia</th></tr></thead>
      <tbody>${cats.map((c) => {
        const v = observado?.[c.key]; const e = esperado?.[c.key];
        const d = hay(v) && hay(e) ? v - e : null;
        return `<tr><th scope="row" class="wizard__fila-habilidad">${esc(c.label)}</th>
          <td class="numeric">${fmt(v)} <span class="text-xs text-muted">${hay(v) ? esc(nivelDe(v)) : ''}</span></td>
          <td class="numeric">${fmt(e)} <span class="text-xs text-muted">${hay(e) ? esc(nivelDe(e)) : ''}</span></td>
          <td class="numeric">${d === null ? '—' : `${d > 0 ? '+' : ''}${fmt(d)}`}</td></tr>`;
      }).join('')}</tbody>
    </table>`;

  return contenedor({
    id,
    titulo: 'Cada categoría contra lo que el cargo espera',
    etiquetadoPor,
    subtitulo: 'De 0 a 100, con los cortes de nivel del instrumento. En el total, las funciones pesan 50 % y hard y soft skills, 25 % cada una.',
    leyenda,
    cuerpo: `<div class="bala">${filas}${eje}</div>`,
    tabla,
  });
}

/* =========================================================================
   G5 — Cuántas personas hay en cada nivel
   ========================================================================= */

export function graficaDistribucion(dist, { id = 'g-distribucion', titulo = 'Personas por nivel', etiquetadoPor = null } = {}) {
  const max = Math.max(1, ...NIVELES.map((n) => dist.conteo[n]));
  const filas = NIVELES.map((n) => {
    const c = dist.conteo[n];
    const texto = `${c} ${c === 1 ? 'persona' : 'personas'}`;
    // Sin barra, el cero no tiene marca que anunciar: la cifra se lee como texto.
    return `
      <div class="barras__fila">
        <span class="barras__cat">${esc(NIVEL_ES[n])}</span>
        <div class="barras__plot">
          ${c ? `<span class="barras__barra nivel-${n.toLowerCase()}" style="--f:${c / max}"
                       tabindex="0" role="img" aria-label="${esc(`${NIVEL_ES[n]}: ${texto}`)}"
                       data-tip-valor="${esc(texto)}" data-tip-etiqueta="${esc(`Nivel ${NIVEL_ES[n]}`)}"></span>
                <span class="barras__valor" aria-hidden="true">${c}</span>`
            : `<span class="barras__valor">0<span class="sr-only"> personas</span></span>`}
        </div>
      </div>`;
  }).join('');

  const tabla = `
    <table class="table">
      <caption class="sr-only">Cantidad de personas en cada nivel del puntaje total.</caption>
      <thead><tr><th scope="col">Nivel</th><th scope="col">Personas</th><th scope="col">Rango del total</th></tr></thead>
      <tbody>${NIVELES.map((n, i) => `<tr><th scope="row" class="wizard__fila-habilidad">${esc(NIVEL_ES[n])}</th>
        <td class="numeric">${dist.conteo[n]}</td>
        <td class="text-xs text-muted">${['0 – 40', '41 – 70', '71 – 90', '91 – 100'][i]}</td></tr>`).join('')}
      </tbody>
    </table>`;

  return contenedor({
    id,
    titulo,
    etiquetadoPor,
    subtitulo: `${dist.total} ${dist.total === 1 ? 'persona evaluada' : 'personas evaluadas'}, según el nivel de su puntaje total.`
      + (dist.sinNivel ? ` ${dist.sinNivel} todavía sin puntaje.` : ''),
    cuerpo: `<div class="barras">${filas}</div>`,
    tabla,
  });
}

/* =========================================================================
   G6 — Habilidades donde más personas están por debajo de lo esperado
   ========================================================================= */

export function graficaBrechas(items, { id = 'g-brechas', limite = 8, titulo = 'Dónde hay más brechas', etiquetadoPor = null } = {}) {
  if (!items.length) return '';
  const top = items.slice(0, limite);
  const max = Math.max(1, ...top.map((i) => i.personas.length));

  const filas = top.map((it) => {
    const n = it.personas.length;
    const texto = `${n} ${n === 1 ? 'persona' : 'personas'}`;
    const detalle = [it.criticas ? `${it.criticas} ${it.criticas === 1 ? 'crítica' : 'críticas'}` : '',
      it.leves ? `${it.leves} ${it.leves === 1 ? 'leve' : 'leves'}` : ''].filter(Boolean).join(' · ');
    return `
      <div class="barras__fila barras__fila--larga">
        <span class="barras__cat">${esc(it.nombre)}
          <span class="text-xs text-muted">${esc(etiquetaCat(it.tipo))}</span></span>
        <div class="barras__plot">
          <span class="barras__barra serie-unica" style="--f:${n / max}"
                tabindex="0" role="img"
                aria-label="${esc(`${it.nombre}: ${texto} por debajo (${detalle}): ${it.personas.join(', ')}`)}"
                data-tip-valor="${esc(texto)}" data-tip-etiqueta="${esc(`${detalle} · ${it.personas.join(', ')}`)}"></span>
          <span class="barras__valor" aria-hidden="true">${n}</span>
        </div>
      </div>`;
  }).join('');

  const tabla = `
    <table class="table">
      <caption class="sr-only">Habilidades con más personas por debajo del nivel que su cargo espera.</caption>
      <thead><tr><th scope="col">Habilidad</th><th scope="col">Personas</th><th scope="col">Críticas</th><th scope="col">Leves</th><th scope="col">Quiénes</th></tr></thead>
      <tbody>${items.map((it) => `<tr><th scope="row" class="wizard__fila-habilidad">${esc(it.nombre)}</th>
        <td class="numeric">${it.personas.length}</td><td class="numeric">${it.criticas}</td>
        <td class="numeric">${it.leves}</td><td class="text-xs">${esc(it.personas.join(', '))}</td></tr>`).join('')}
      </tbody>
    </table>`;

  return contenedor({
    id,
    titulo,
    etiquetadoPor,
    subtitulo: `Habilidades con más personas por debajo del nivel que su cargo espera${
      items.length > limite ? `: las ${limite} primeras de ${items.length}` : ''}.`,
    cuerpo: `<div class="barras">${filas}</div>`,
    tabla,
  });
}

/* =========================================================================
   G4 — Matriz de talento
   ========================================================================= */

/**
 * Una tabla de verdad, no una cuadrícula de divs: tiene encabezados de fila
 * (potencial) y de columna (desempeño), que es exactamente como un lector de
 * pantalla necesita recorrerla.
 *
 * @param {object} grupo      resultado de matrizDeGrupo()
 * @param {object} opciones   resaltar: clave del cuadrante a marcar;
 *                            enlazar: (perfil) => href del detalle de la persona
 */
export function graficaMatriz(grupo, { id = 'g-matriz', resaltar = null, enlazar = null, titulo = 'Matriz de talento', etiquetadoPor = null } = {}) {

  const celda = (y, x) => {
    const clave = `${y},${x}`;
    const def = MATRIZ[clave];
    const gente = grupo.celdas[clave] ?? [];
    const marcada = resaltar === clave;
    // Una celda vacía queda vacía a la vista: "Nadie" repetido en cinco celdas
    // era más texto que el de las celdas con gente. El lector sí lo oye.
    return `
      <td class="matriz__celda${marcada ? ' is-marcada' : ''}${gente.length ? ' tiene-gente' : ''}">
        <span class="matriz__num" aria-hidden="true">${numeroCuadrante(clave)}</span>
        <strong class="matriz__etiqueta"><span class="sr-only">Cuadrante ${numeroCuadrante(clave)}: </span>${esc(def.etiqueta)}</strong>
        ${gente.length ? `
          <span class="matriz__conteo">${gente.length} ${gente.length === 1 ? 'persona' : 'personas'}</span>
          <!-- El cuadrante nunca va solo, por la misma razón que el puntaje: la
               matriz corta igual para todos los cargos, y alguien que cumple el
               100% de un cargo junior cae en «Riesgo de talento». El cumplimiento
               al lado impide leerlo como un veredicto. -->
          <ul class="matriz__gente">
            ${gente.map((pf) => `<li>${enlazar
              ? `<a href="${esc(enlazar(pf))}">${esc(pf.persona.nombre)}</a>`
              : esc(pf.persona.nombre)}${pf.cumplimiento
              ? ` <span class="matriz__cumple">· ${pf.cumplimiento.cumple}/${pf.cumplimiento.total} en nivel</span>` : ''}</li>`).join('')}
          </ul>` : (resaltar ? '' : '<span class="sr-only">Nadie.</span>')}
        ${marcada ? '<span class="sr-only">(este es el cuadrante de la persona)</span>' : ''}
      </td>`;
  };

  // En un contenedor con desplazamiento propio: en un teléfono cada celda medía
  // unos 80 px y las etiquetas se partían a mitad de palabra ("Diaman-te").
  // Con .table-wrap, sincronizarScrollables lo vuelve enfocable cuando desborda.
  const cuerpo = `
    <div class="table-wrap matriz__scroll">
    <div class="matriz">
      <span class="matriz__eje-y label-micro" aria-hidden="true">Potencial</span>
      <table class="matriz__tabla">
        <caption class="sr-only">${esc(titulo)}: potencial en las filas (de alto a bajo), desempeño en las columnas (de bajo a alto).</caption>
        <thead>
          <tr><td></td>${[1, 2, 3].map((x) => `<th scope="col"><span class="sr-only">Desempeño </span>${EJE_MATRIZ[x]}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${[3, 2, 1].map((y) => `
            <tr><th scope="row"><span class="sr-only">Potencial </span>${EJE_MATRIZ[y]}</th>${[1, 2, 3].map((x) => celda(y, x)).join('')}</tr>`).join('')}
        </tbody>
      </table>
      <span class="matriz__eje-x label-micro" aria-hidden="true">Desempeño</span>
    </div>
    </div>`;

  // Quien no tiene funciones o habilidades evaluadas no cae en ninguna celda.
  // Sin esta línea las celdas sumaban menos que el equipo y nada lo explicaba.
  const n = grupo.sinUbicar?.length ?? 0;
  const sinUbicar = n ? `
    <p class="grafica__nota">${n} ${n === 1 ? 'persona no aparece' : 'personas no aparecen'} en la matriz:
      ${n === 1 ? 'le falta' : 'les falta'} la evaluación de funciones o de habilidades
      (${esc(grupo.sinUbicar.map((pf) => pf.persona.nombre).join(', '))}).</p>` : '';

  // La advertencia va una sola vez y como aviso, no escondida al final del
  // subtítulo: es lo que evita leer el cuadrante como un veredicto.
  const aviso = `
    ${sinUbicar}
    <p class="grafica__aviso">${icon('info')}<span>Los cortes son los mismos para todos los
      cargos y no consideran el nivel que cada uno espera: un cargo junior que cumple
      todo puede caer abajo. Por eso cada nombre muestra cuántas habilidades tiene en su nivel.</span></p>`;

  const todos = Object.values(grupo.celdas).flat();
  const tabla = todos.length ? `
    <table class="table">
      <caption class="sr-only">Cada persona con su desempeño, su potencial y el cuadrante en que cae.</caption>
      <thead><tr><th scope="col">Persona</th><th scope="col">Desempeño</th><th scope="col">Potencial</th><th scope="col">Cuadrante</th><th scope="col">En su nivel</th></tr></thead>
      <tbody>${todos.map((pf) => `<tr><th scope="row" class="wizard__fila-habilidad">${esc(pf.persona.nombre)}</th>
        <td class="numeric">${fmt(pf.matriz.desempeno)} <span class="text-xs text-muted">${EJE_MATRIZ[pf.matriz.x]}</span></td>
        <td class="numeric">${fmt(pf.matriz.potencial)} <span class="text-xs text-muted">${EJE_MATRIZ[pf.matriz.y]}</span></td>
        <td>${numeroCuadrante(pf.matriz.clave)} · ${esc(pf.matriz.etiqueta)}</td>
        <td class="numeric">${pf.cumplimiento ? `${pf.cumplimiento.cumple}/${pf.cumplimiento.total}` : '—'}</td></tr>`).join('')}
      </tbody>
    </table>` : '<p class="text-sm text-muted">Sin personas ubicadas todavía.</p>';

  return contenedor({
    id,
    titulo,
    etiquetadoPor,
    subtitulo: 'Desempeño: funciones del rol. Potencial: promedio de hard y soft skills. '
      + 'Ambos de 1 a 5, cortados en bajo (menos de 3), medio (3 a 3,9) y alto (4 o más).',
    cuerpo,
    aviso,
    tabla,
    marcas: false,
  });
}

/* =========================================================================
   Tooltip compartido y teclado
   ========================================================================= */

let tip = null;
let temporizador = null;

const ocultar = () => {
  clearTimeout(temporizador);
  if (tip) tip.hidden = true;
};
// Con una pausa corta: sin ella, el tooltip desaparecía en el hueco de 8 px
// entre la marca y la caja, y no había cómo llegar a leerlo con el mouse
// (WCAG 1.4.13: lo que aparece al pasar el mouse tiene que poder recorrerse).
const ocultarLuego = () => {
  clearTimeout(temporizador);
  temporizador = setTimeout(ocultar, 150);
};

function crearTip() {
  tip = document.createElement('div');
  tip.className = 'grafica-tip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  tip.innerHTML = '<strong class="grafica-tip__valor"></strong><span class="grafica-tip__etiqueta"></span>';
  tip.addEventListener('pointerenter', () => clearTimeout(temporizador));
  tip.addEventListener('pointerleave', ocultarLuego);
  document.body.appendChild(tip);

  // Una sola vez para toda la página.
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ocultar(); });
  window.addEventListener('scroll', ocultar, { capture: true, passive: true });
  let espera = null;
  window.addEventListener('resize', () => {
    ocultar();
    // Las tablas equivalentes pueden empezar o dejar de desbordar al cambiar el
    // ancho; sin esto quedaban sin foco de teclado o con uno sobrante.
    clearTimeout(espera);
    espera = setTimeout(() => sincronizarScrollables(document), 150);
  });
}

function mostrar(el) {
  clearTimeout(temporizador);
  tip.querySelector('.grafica-tip__valor').textContent = el.dataset.tipValor ?? '';
  tip.querySelector('.grafica-tip__etiqueta').textContent = el.dataset.tipEtiqueta ?? '';
  // Se mide en el origen: medida donde quedó la vez anterior, cerca del borde
  // derecho la caja se encogía y el cálculo de posición salía corrido.
  tip.style.left = '0px';
  tip.style.top = '0px';
  tip.hidden = false;
  const r = el.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  const ancho = document.documentElement.clientWidth;   // sin la barra de desplazamiento
  const izq = Math.min(ancho - t.width - 8, Math.max(8, r.left + r.width / 2 - t.width / 2));
  const arriba = r.top - t.height - 8 < 8 ? r.bottom + 8 : r.top - t.height - 8;
  tip.style.left = `${izq + window.scrollX}px`;
  tip.style.top = `${arriba + window.scrollY}px`;
}

/**
 * Engancha el tooltip, el teclado y las tablas equivalentes de `raiz`. El
 * tooltip es uno solo para la página y se escribe con textContent: los nombres
 * vienen del dato y no deben volverse HTML.
 *
 * Se llama después de cada repintado. Lo primero es ocultar el tooltip: si el
 * mouse estaba sobre una marca que el repintado quitó, `pointerleave` no llega
 * nunca y el tooltip quedaba mostrando un valor viejo.
 */
export function conectarGraficas(raiz) {
  if (!tip) crearTip();
  ocultar();

  raiz.querySelectorAll('[data-marcas]').forEach((grupo) => {
    const marcas = [...grupo.querySelectorAll('[data-tip-valor]')];
    marcas.forEach((el, i) => {
      el.tabIndex = i === 0 ? 0 : -1;
      el.addEventListener('pointerenter', () => mostrar(el));
      el.addEventListener('pointerleave', ocultarLuego);
      el.addEventListener('focus', () => mostrar(el));
      el.addEventListener('blur', ocultar);
      el.addEventListener('keydown', (e) => {
        const destino = {
          ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1,
          Home: 0, End: marcas.length - 1,
        }[e.key];
        if (destino === undefined) return;
        e.preventDefault();
        const siguiente = marcas[Math.max(0, Math.min(marcas.length - 1, destino))];
        el.tabIndex = -1;
        siguiente.tabIndex = 0;
        siguiente.focus();
      });
    });
  });

  // Una tabla dentro de un <details> cerrado mide 0 y sincronizarScrollables la
  // salta; al abrirla hay que medir otra vez o no se puede desplazar con teclado.
  raiz.querySelectorAll('details.grafica__tabla').forEach((d) => {
    d.addEventListener('toggle', () => sincronizarScrollables(d));
  });
}

/** Oculta el tooltip al cambiar de pantalla, para que no quede flotando. */
export function ocultarTooltip() { ocultar(); }
