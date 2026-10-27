/* =========================================================================
   EQUIPO — el tablero del líder
   =========================================================================
   Muestra una sola cosa: dónde está cada persona frente a lo que su cargo
   espera. Sin métricas de cumplimiento de planes ni seguimiento de avances,
   porque el seguimiento no ocurre acá y un tablero que finge medirlo invita a
   decisiones sobre datos que nadie mantiene.

   Los avisos van ARRIBA de los números. Puestos abajo llegan tarde: quien ya
   leyó el puntaje no vuelve a subir para enterarse de que estaba sesgado.
   ========================================================================= */

import {
  esc, gapHtml, avisosHtml, emptyState, sincronizarScrollables, estadoTareaHtml,
} from '../lib/ui.js';
import {
  equipoExtendido, perfil, cargo, avisosEquipo,
  distribucionPorNivel, brechasPorHabilidad, matrizDeGrupo,
  estadoEvaluacion, esInterino, ronda,
} from '../lib/almacen.js';
import { preguntasDe } from './evaluar.js';
import {
  graficaDistribucion, graficaBrechas, graficaMatriz, conectarGraficas,
} from '../lib/graficas.js';

export function vistaEquipo({ sesion }) {
  const miembros = equipoExtendido(sesion.persona.id);

  if (!miembros.length) {
    return {
      html: emptyState({
        title: 'No tienes personas a cargo en esta ronda',
        body: 'Si deberías tenerlas, avisa al equipo de Personas para que lo corrija.',
        glyph: 'users',
      }),
    };
  }

  const perfiles = miembros.map((m) => ({ ...m, pf: perfil(m.persona.id) }));
  const avisos = avisosEquipo(perfiles.map((x) => x.pf));

  return {
    html: `
      <div class="page-header">
        <h1 class="page-header__title">Tu equipo</h1>
        <p class="page-header__lede">
          Estado de cada persona frente a lo que su cargo espera, y cuánto te falta
          por evaluar. El nombre abre su detalle.
        </p>
      </div>

      ${bloqueResumen(perfiles)}
      ${bloqueAvisos(avisos)}
      ${bloquePersonas(perfiles)}
      ${bloqueMatriz(perfiles)}
      ${bloqueDistribucionYBrechas(perfiles)}
    `,
    montado(raiz) {
      conectarGraficas(raiz);
      sincronizarScrollables(raiz);
    },
  };
}

/* ----------------------------------------------------------------- avisos */

function bloqueAvisos(avisos) {
  if (!avisos.length) return '';
  return `
    <details class="avisos-plegados">
      <summary>
        <span class="badge badge--warning">${avisos.length}</span>
        ${avisos.length === 1 ? 'Un aviso' : `${avisos.length} avisos`} sobre cómo leer los números:
        datos parciales o niveles en el borde. Los resultados son válidos, pero no definitivos.
      </summary>
      ${avisosHtml(avisos)}
    </details>`;
}

/* ---------------------------------------------------------------- resumen */

function bloqueResumen(perfiles) {
  const conRef = perfiles.filter((x) => x.pf.cumplimiento);
  const enNivel = conRef.filter((x) => x.pf.cumplimiento.cumple === x.pf.cumplimiento.total).length;
  const conBrecha = perfiles.filter((x) => x.pf.prioridades.length).length;
  const mias = perfiles.filter((x) => x.persona.cargo_id);
  const enviadas = mias.filter((x) => estadoEvaluacion(x.persona.id, 'Leader').estado === 'enviada').length;

  return `
    <section class="section" aria-labelledby="t-res">
      <div class="section__head"><h2 class="section__title" id="t-res">El equipo en conjunto</h2></div>
      <div class="kpi-grid">
        <div class="kpi${enviadas < mias.length ? ' kpi--alerta' : ''}">
          <span class="kpi__value">${enviadas}/${mias.length}</span>
          <span class="kpi__label">Evaluaciones tuyas enviadas</span>
        </div>
        <div class="kpi">
          <span class="kpi__value">${enNivel}/${conRef.length}</span>
          <span class="kpi__label">Cumplen todo su nivel esperado</span>
        </div>
        <!-- El acento va en la cifra que pide acción, no en el tamaño del equipo. -->
        <div class="kpi kpi--accent">
          <span class="kpi__value">${conBrecha}</span>
          <span class="kpi__label">${conBrecha === 1
            ? 'Persona con alguna brecha' : 'Personas con alguna brecha'}</span>
        </div>
      </div>
    </section>`;
}

/* ----------------------------------------------------------------- matriz */

function bloqueMatriz(perfiles) {
  return `
    <section class="section" aria-labelledby="t-matriz">
      <div class="section__head">
        <h2 class="section__title" id="t-matriz">Matriz de talento</h2>
      </div>
      <p class="section__note">
        Cada nombre abre su detalle, con la descripción y la recomendación de su cuadrante.
      </p>
      ${graficaMatriz(matrizDeGrupo(perfiles.map((x) => x.pf)), {
        titulo: 'Matriz de talento del equipo',
        etiquetadoPor: 't-matriz',
        enlazar: (pf) => `#/persona/${pf.persona.id}`,
      })}
    </section>`;
}

/* ------------------------------------------------ distribución y brechas */

function bloqueDistribucionYBrechas(perfiles) {
  const pfs = perfiles.map((x) => x.pf);
  const brechas = brechasPorHabilidad(pfs);
  return `
    <section class="section" aria-labelledby="t-dist">
      <div class="section__head">
        <h2 class="section__title" id="t-dist">Niveles y brechas</h2>
      </div>
      <div class="graficas-par">
        ${graficaDistribucion(distribucionPorNivel(pfs), { titulo: 'Personas por nivel' })}
        ${brechas.length ? graficaBrechas(brechas) : emptyState({
          title: 'Nadie está por debajo del nivel que espera su cargo',
          body: 'Si esperabas ver brechas, revisa los avisos de arriba: una categoría '
              + 'sin evaluar no produce brechas, aunque parezca que debería.',
          glyph: 'check',
        })}
      </div>
    </section>`;
}

/* --------------------------------------------------------------- personas */

function bloquePersonas(perfiles) {
  // Primero quien más lejos está de su nivel esperado. Ordenar por puntaje
  // pondría arriba a un junior que cumple todo, que es justo quien no necesita
  // atención.
  const ordenado = [...perfiles].sort((a, b) => faltante(b.pf) - faltante(a.pf));

  return `
    <section class="section" aria-labelledby="t-per">
      <div class="section__head"><h2 class="section__title" id="t-per">Persona por persona</h2></div>
      <p class="section__note">
        El puntaje total nunca va solo: al lado aparece cuántas habilidades del cargo
        alcanzan su nivel esperado. Un puntaje alto no garantiza cumplir el cargo, ni
        uno bajo significa lo contrario.
      </p>
      <div class="table-wrap table-wrap--sticky">
        <table class="table">
          <caption class="sr-only">
            Cada persona del equipo con su cargo, puntaje total, cuántas habilidades
            alcanzan el nivel esperado y cuántas brechas tiene.
          </caption>
          <thead>
            <tr>
              <th scope="col">Persona</th>
              <th scope="col">Nivel</th>
              <th scope="col">En su nivel</th>
              <th scope="col">Brechas</th>
              <th scope="col">Qué falta</th>
              <th scope="col">Tu evaluación</th>
            </tr>
          </thead>
          <tbody>
            ${ordenado.map((x) => fila(x)).join('')}
          </tbody>
        </table>
      </div>
    </section>`;
}

const faltante = (pf) => (pf.evaluadas === 0 ? Infinity
  : pf.cumplimiento ? pf.cumplimiento.total - pf.cumplimiento.cumple : -1);

const ROL_LEGIBLE = { Employee: 'autoevaluación', Leader: 'tu evaluación', Peer: 'pares' };

function fila({ persona: p, pf }) {
  const c = pf.cumplimiento;
  const todo = c && c.cumple === c.total;
  const sinDatos = pf.evaluadas === 0;
  const criticas = pf.prioridades.filter((h) => h.severidad === 'brecha-critica').length;
  const est = estadoEvaluacion(p.id, 'Leader');
  const abierta = Boolean(ronda()?.abierta);
  // «Qué falta» en palabras: quién no ha evaluado y si el nivel está en el borde.
  const faltan = pf.evaluadores_faltantes.map((r) => ROL_LEGIBLE[r] ?? r);
  const falta = [
    faltan.length ? `Falta: ${faltan.join(', ')}` : '',
    pf.cerca_de_umbral && pf.banda_vecina ? bordeDe(pf) : '',
  ].filter(Boolean);

  return `
    <tr class="table__row${criticas ? ' table__row--atencion' : ''}">
      <th scope="row" class="table__rowhead">
        <a href="#/persona/${esc(p.id)}">${esc(p.nombre)}</a>
        <span class="text-sm text-muted linea-aparte">${esc(cargo(p.cargo_id)?.nombre ?? '—')}</span>
        ${esInterino(p) ? '<span class="badge badge--neutral">Interino</span>' : ''}
      </th>
      <td>
        ${sinDatos ? '<span class="text-muted">—</span>' : `
          <b>${esc(pf.nivel_es ?? '—')}</b>
          <span class="text-sm text-muted linea-aparte numeric">${pf.perfil_total === null ? '' : `${pf.perfil_total.toFixed(1)} de 100`}</span>`}
      </td>
      <td>
        ${c ? `<span class="numeric ${todo ? 'texto-exito' : ''}">${c.cumple}/${c.total}</span>`
          : '<span class="text-muted">—</span>'}
      </td>
      <td>
        ${sinDatos ? gapHtml('sin-evaluar', {})
          : pf.prioridades.length
            ? `<span class="numeric">${pf.prioridades.length}</span>${
                criticas ? `<span class="text-sm linea-aparte texto-peligro">${
                  criticas} ${criticas === 1 ? 'crítica' : 'críticas'}</span>` : ''}`
            : pf.sin_evaluar ? `<span class="text-sm">Ninguna aún · faltan ${pf.sin_evaluar}</span>` : gapHtml('cumple', {})}
      </td>
      <td class="text-sm">${falta.length ? falta.map(esc).join('<br>') : '<span class="text-muted">Nada</span>'}</td>
      <td>
        <span class="tabla-tarea">
          ${estadoTareaHtml(est, preguntasDe(p.id).length)}
          ${abierta ? `<a class="btn ${est.estado === 'enviada' ? 'btn--ghost' : 'btn--secondary'} btn--sm" href="#/evaluar/${esc(p.id)}">${
            est.estado === 'enviada' ? 'Revisar' : est.estado === 'borrador' ? 'Continuar' : 'Evaluar'}<span class="sr-only"> a ${esc(p.nombre)}</span></a>` : ''}
        </span>
      </td>
    </tr>`;
}


const ORDEN_NIVEL = ['Básico', 'Intermedio', 'Avanzado', 'Experto'];

/** Cerca de un corte, dicho con dirección: no es lo mismo estar a punto de subir que de bajar. */
function bordeDe(pf) {
  const m = Number(pf.margen_banda);
  if (m < 0.05) return `Justo en el borde con ${pf.banda_vecina}`;
  const baja = ORDEN_NIVEL.indexOf(pf.banda_vecina) < ORDEN_NIVEL.indexOf(pf.nivel_es);
  return baja
    ? `${m.toFixed(1)} pts sobre el corte de ${pf.banda_vecina}`
    : `A ${m.toFixed(1)} pts de subir a ${pf.banda_vecina}`;
}
