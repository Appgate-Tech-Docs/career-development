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
  esc, gapHtml, avisosHtml, emptyState, sincronizarScrollables,
} from '../lib/ui.js';
import {
  equipoExtendido, perfil, cargo, avisosEquipo,
  distribucionPorNivel, brechasPorHabilidad, matrizDeGrupo,
} from '../lib/almacen.js';
import {
  graficaDistribucion, graficaBrechas, graficaMatriz, conectarGraficas,
} from '../lib/graficas.js';

export function vistaEquipo({ sesion }) {
  const miembros = equipoExtendido(sesion.persona.id);

  if (!miembros.length) {
    return {
      html: emptyState({
        title: 'No tienes reportes directos',
        body: 'Este tablero aparece cuando alguien reporta a ti. Desde el menú de '
            + 'usuario puedes entrar como otra persona para verlo.',
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
          Estado de cada persona frente a las funciones y habilidades que su cargo
          espera. «Ver detalle» abre su matriz de talento y el simulador.
        </p>
      </div>

      ${bloqueAvisos(avisos)}
      ${bloqueResumen(perfiles)}
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
    <section class="section" aria-labelledby="t-avisos">
      <div class="section__head">
        <h2 class="section__title" id="t-avisos">Antes de leer los números</h2>
      </div>
      <p class="section__note">
        Cosas que afectan cómo interpretar los resultados. No son problemas de las
        personas: son límites del cómputo.
      </p>
      ${avisosHtml(avisos)}
    </section>`;
}

/* ---------------------------------------------------------------- resumen */

function bloqueResumen(perfiles) {
  const conRef = perfiles.filter((x) => x.pf.cumplimiento);
  const enNivel = conRef.filter((x) => x.pf.cumplimiento.cumple === x.pf.cumplimiento.total).length;
  const conBrecha = perfiles.filter((x) => x.pf.prioridades.length).length;

  return `
    <section class="section" aria-labelledby="t-res">
      <div class="section__head"><h2 class="section__title" id="t-res">El equipo en conjunto</h2></div>
      <div class="kpi-grid">
        <div class="kpi">
          <span class="kpi__value">${perfiles.length}</span>
          <span class="kpi__label">Personas en el equipo extendido</span>
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
              <th scope="col">Cargo</th>
              <th scope="col">Total</th>
              <th scope="col">En su nivel</th>
              <th scope="col">Brechas</th>
              <th scope="col">Estado</th>
              <th scope="col"><span class="sr-only">Acción</span></th>
            </tr>
          </thead>
          <tbody>
            ${ordenado.map((x) => fila(x)).join('')}
          </tbody>
        </table>
      </div>
    </section>`;
}

const faltante = (pf) => (pf.cumplimiento
  ? pf.cumplimiento.total - pf.cumplimiento.cumple : -1);

function fila({ persona: p, directo, pf }) {
  const c = pf.cumplimiento;
  const todo = c && c.cumple === c.total;
  const criticas = pf.prioridades.filter((h) => h.severidad === 'brecha-critica').length;

  return `
    <tr class="table__row${criticas ? ' table__row--atencion' : ''}">
      <td>
        <b>${esc(p.nombre)}</b>
        ${!directo ? '<span class="badge badge--neutral">Nivel inferior</span>' : ''}
      </td>
      <td class="text-xs text-muted">${esc(cargo(p.cargo_id)?.nombre ?? '—')}</td>
      <td>
        <span class="numeric">${pf.perfil_total === null ? '—' : pf.perfil_total.toFixed(1)}</span>
        <span class="text-xs text-muted linea-aparte">${esc(pf.nivel_es ?? '')}</span>
      </td>
      <td>
        ${c ? `<span class="numeric ${todo ? 'texto-exito' : 'text-muted'}">${c.cumple}/${c.total}</span>`
          : '<span class="text-muted">—</span>'}
      </td>
      <td>
        ${pf.prioridades.length
          ? `<span class="numeric">${pf.prioridades.length}</span>${
              criticas ? `<span class="text-xs linea-aparte texto-peligro">${
                criticas} ${criticas === 1 ? 'crítica' : 'críticas'}</span>` : ''}`
          : gapHtml('cumple', {})}
      </td>
      <td>
        ${pf.cerca_de_umbral
          ? '<span class="badge badge--warning">Nivel inestable</span>' : ''}
        ${pf.evaluadores_faltantes.length
          ? '<span class="badge badge--warning">Incompleta</span>' : ''}
        ${!pf.cerca_de_umbral && !pf.evaluadores_faltantes.length
          ? '<span class="text-xs text-muted">Completa</span>' : ''}
      </td>
      <td>
        <a class="btn btn--secondary btn--sm" href="#/persona/${esc(p.id)}">
          Ver detalle
        </a>
      </td>
    </tr>`;
}

