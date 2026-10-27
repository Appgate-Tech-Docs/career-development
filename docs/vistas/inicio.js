/* =========================================================================
   INICIO — la pantalla que da el ritmo
   =========================================================================
   No es un menú. Abre con lo que falta por hacer y con un enlace directo a
   hacerlo, porque el resto del producto se recorre desde acá: terminas una
   evaluación, vuelves, y lo que hiciste ya no está en la lista.

   Cuando no queda nada pendiente lo dice y ofrece el siguiente paso real, en
   lugar de dejar un vacío que parece un error.
   ========================================================================= */

import { esc, icon, emptyState } from '../lib/ui.js';
import {
  cargo, pendientes, perfil, reportesDirectos, equipoExtendido,
  catalogo, ronda, personasEvaluadas, areasConCargos,
} from '../lib/almacen.js';

export function vistaInicio({ sesion }) {
  const p = sesion.persona;
  const tareas = pendientes(p.id);
  const esLider = p.roles.includes('lider');
  const esRrhh = p.roles.includes('admin');
  // Quien no evalúa a nadie ni es evaluado no debe ver una bandeja vacía que
  // dice "ya enviaste todo": nunca tuvo nada que enviar, y el mensaje sugiere
  // lo contrario. La cuenta de Personas es exactamente ese caso.
  const evalua = Boolean(p.cargo_id) || esLider || (p.evalua_como_par ?? []).length > 0;

  return {
    html: `
      <div class="page-header">
        <h1 class="page-header__title">Hola, ${esc(p.nombre.split(' ')[0])}</h1>
        <p class="page-header__lede">
          ${esc(cargo(p.cargo_id)?.nombre ?? p.area)} ·
          Ronda ${esc(ronda()?.nombre ?? '')}
        </p>
      </div>

      ${evalua ? bloqueTareas(tareas) : ''}
      ${esRrhh ? bloqueOrganizacion() : ''}
      ${esRrhh ? bloqueRrhh() : ''}
      ${p.cargo_id ? bloquePerfil(p.id) : ''}
      ${esLider ? bloqueEquipo(p.id) : ''}
    `,
  };
}

/* ---------------------------------------------------------------- tareas */

function bloqueTareas(tareas) {
  if (!tareas.length) {
    return `
      <section class="section" aria-labelledby="t-pend">
        <div class="section__head">
          <h2 class="section__title" id="t-pend">Pendientes</h2>
        </div>
        ${emptyState({
          title: 'No te queda nada por evaluar',
          body: 'Ya enviaste todo lo que te corresponde en esta ronda. Desde acá puedes '
              + 'revisar tu perfil o, si lideras un equipo, ver cómo va.',
          glyph: 'check',
        })}
      </section>`;
  }

  const grupos = [
    { tipo: 'autoevaluacion', titulo: 'Lo tuyo' },
    { tipo: 'equipo', titulo: 'Tu equipo' },
    { tipo: 'par', titulo: 'Tus pares' },
  ].map((g) => ({ ...g, lista: tareas.filter((t) => t.tipo === g.tipo) }))
   .filter((g) => g.lista.length);

  return `
    <section class="section" aria-labelledby="t-pend">
      <div class="section__head">
        <h2 class="section__title" id="t-pend">
          Pendientes <span class="badge badge--warning">${tareas.length}</span>
        </h2>
      </div>
      <p class="section__note">
        En el orden en que conviene hacerlas: primero lo tuyo, porque tu perfil se
        calcula con las tres miradas y sin la tuya queda incompleto.
      </p>
      <div class="dl-rows">
        ${grupos.map((g) => `
          <p class="card__meta" style="padding:var(--space-2xs) var(--space-sm) 0">${esc(g.titulo)}</p>
          ${g.lista.map((t) => `
            <a class="task-link" href="${esc(t.ruta)}" style="padding:var(--space-2xs) var(--space-sm)">
              ${icon(t.tipo === 'autoevaluacion' ? 'user' : t.tipo === 'equipo' ? 'users' : 'clipboard')}
              <span>
                <b style="display:block">${esc(t.titulo)}</b>
                ${t.detalle ? `<span class="text-xs text-muted">${esc(t.detalle)}</span>` : ''}
              </span>
              ${icon('chevronRight', { className: 'task-link__arrow' })}
            </a>`).join('')}
        `).join('')}
      </div>
    </section>`;
}

/* ---------------------------------------------------------------- perfil */

function bloquePerfil(personaId) {
  const pf = perfil(personaId);
  if (!pf) return '';
  const brechas = pf.prioridades.length;

  return `
    <section class="section" aria-labelledby="t-mio">
      <div class="section__head">
        <h2 class="section__title" id="t-mio">Tu perfil</h2>
        <a class="btn btn--secondary btn--sm" href="#/mi-desarrollo">Ver el detalle</a>
      </div>
      <div class="kpi-grid">
        <div class="kpi kpi--accent">
          <span class="kpi__value">${pf.perfil_total === null ? '—' : pf.perfil_total.toFixed(1)}</span>
          <span class="kpi__label">Puntaje total · ${esc(pf.nivel_es ?? 'sin evaluar')}</span>
        </div>
        <div class="kpi">
          <span class="kpi__value">${pf.cumplimiento
            ? `${pf.cumplimiento.cumple}/${pf.cumplimiento.total}` : '—'}</span>
          <span class="kpi__label">Habilidades en su nivel esperado</span>
        </div>
        <div class="kpi">
          <span class="kpi__value">${brechas}</span>
          <span class="kpi__label">${brechas === 1 ? 'Brecha por cerrar' : 'Brechas por cerrar'}</span>
        </div>
      </div>
    </section>`;
}

/* ---------------------------------------------------------------- equipo */

function bloqueEquipo(liderId) {
  const directos = reportesDirectos(liderId).length;
  const extendido = equipoExtendido(liderId).length;

  return `
    <section class="section" aria-labelledby="t-eq">
      <div class="section__head">
        <h2 class="section__title" id="t-eq">Tu equipo</h2>
        <a class="btn btn--primary btn--sm" href="#/equipo">Abrir el tablero</a>
      </div>
      <p class="section__note">
        ${directos} ${directos === 1 ? 'reporte directo' : 'reportes directos'}${
          extendido > directos ? ` y ${extendido - directos} en niveles inferiores` : ''}.
        El tablero muestra el estado de cada persona frente a su cargo y permite
        simular cambios de calificación para entender de qué depende el resultado.
      </p>
    </section>`;
}

/* ----------------------------------------------------------- organización */

function bloqueOrganizacion() {
  const n = personasEvaluadas().length;
  const areas = areasConCargos();
  return `
    <section class="section" aria-labelledby="t-org">
      <div class="section__head">
        <h2 class="section__title" id="t-org">La organización</h2>
        <a class="btn btn--primary btn--sm" href="#/organizacion">Ver el panorama</a>
      </div>
      <p class="section__note">
        ${n} personas evaluadas en ${areas.length} áreas (${esc(areas.join(', '))}):
        matriz de talento, distribución por nivel y las habilidades con más brechas.
      </p>
    </section>`;
}

/* ------------------------------------------------------------------ RRHH */

function bloqueRrhh() {
  const total = catalogo().length;
  const porTipo = catalogo().reduce((acc, s) => {
    acc[s.tipo] = (acc[s.tipo] ?? 0) + 1; return acc;
  }, {});

  return `
    <section class="section" aria-labelledby="t-cat">
      <div class="section__head">
        <h2 class="section__title" id="t-cat">Administración</h2>
        <a class="btn btn--primary btn--sm" href="#/admin/personas">Abrir</a>
      </div>
      <p class="section__note">
        Personas, equipos, cargos, pares, catálogo y la auditoría de cada cambio.
      </p>
      <div class="kpi-grid">
        <div class="kpi kpi--accent">
          <span class="kpi__value">${total}</span>
          <span class="kpi__label">Habilidades en el catálogo</span>
        </div>
        ${Object.entries(porTipo).map(([tipo, n]) => `
          <div class="kpi">
            <span class="kpi__value">${n}</span>
            <span class="kpi__label">${esc(tipo === 'Funcion' ? 'Funciones del rol'
              : tipo === 'Hard Skill' ? 'Hard skills' : 'Soft skills')}</span>
          </div>`).join('')}
      </div>
    </section>`;
}
