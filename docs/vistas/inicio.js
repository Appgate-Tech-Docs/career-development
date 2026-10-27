/* =========================================================================
   INICIO — la pantalla que da el ritmo
   =========================================================================
   No es un menú. Abre con lo que falta por hacer y con un enlace directo a
   hacerlo, porque el resto del producto se recorre desde acá: terminas una
   evaluación, vuelves, y su estado ya cambió.

   Una sola acción primaria por pantalla: la tarea más importante que queda.
   Lo demás es secundario aunque esté en otro bloque.
   ========================================================================= */

import { esc, icon, emptyState, estadoTareaHtml } from '../lib/ui.js';
import {
  cargo, pendientes, perfil, reportesDirectos, ronda, personasEvaluadas,
  areasConCargos, estadoEvaluacion, esInterino, personas, administracion,
  evaluacionesDe, persona,
} from '../lib/almacen.js';
import { preguntasDe } from './evaluar.js';

export function vistaInicio({ sesion }) {
  const p = sesion.persona;
  const tareas = pendientes(p.id);
  const esLider = p.roles.includes('lider');
  const esAdmin = p.roles.includes('admin');
  const abierta = Boolean(ronda()?.abierta);
  const auto = p.cargo_id && abierta ? estadoEvaluacion(p.id, 'Employee') : null;
  // La acción primaria es una sola: la autoevaluación si falta; si no, la
  // primera persona del equipo sin evaluar. El resto de botones va secundario.
  const primaria = auto && auto.estado !== 'enviada' ? 'auto' : esLider ? 'equipo' : null;

  return {
    html: `
      <div class="page-header">
        <h1 class="page-header__title">Hola, ${esc(p.nombre.split(' ')[0])}</h1>
        <p class="page-header__lede">
          ${esc(cargo(p.cargo_id)?.nombre ?? p.area ?? '')}${ronda() ? ` · Ronda ${esc(ronda().nombre)}${abierta ? '' : ' (cerrada)'}` : ''}
        </p>
      </div>

      ${!abierta && ronda() ? bloqueRondaCerrada(p) : ''}
      ${auto && auto.estado !== 'enviada' ? bloqueAutoevaluacion(p, auto) : ''}
      ${esLider ? bloqueEquipo(p.id, { primaria: primaria === 'equipo', abierta }) : ''}
      ${bloquePares(tareas)}
      ${p.cargo_id ? bloquePerfil(p.id, auto, { primaria: !primaria && !tareas.length }) : ''}
      ${esAdmin ? bloqueAdmin() : ''}
      ${sinNada(p, { esLider, esAdmin, tareas }) ? bloqueSinCargo() : ''}
    `,
  };
}

/* ------------------------------------------------------- ronda cerrada */

function bloqueRondaCerrada(p) {
  return `
    <div class="callout callout--warning inicio__aviso" role="status">
      ${icon('lock')}
      <span>
        <strong>La ronda ${esc(ronda().nombre)} está cerrada.</strong>
        Ya no se pueden enviar ni cambiar evaluaciones.${p.cargo_id
          ? ' Tus resultados siguen en <a href="#/mi-desarrollo">Mi desarrollo</a>.' : ''}
      </span>
    </div>`;
}

/* ------------------------------------------------------- autoevaluación */

// La tarea principal del año, para la mayoría, no puede verse como un enlace
// más de una lista: es una tarjeta con su costo y su progreso a la vista.
function bloqueAutoevaluacion(p, auto) {
  const total = preguntasDe(p.id).length;
  const enCurso = auto.estado === 'borrador';
  return `
    <section class="section" aria-labelledby="t-auto">
      <div class="card tarea-principal">
        <div class="tarea-principal__texto">
          <h2 class="section__title" id="t-auto">${enCurso ? 'Tu autoevaluación está a medias' : 'Tu autoevaluación está pendiente'}</h2>
          <p>
            ${enCurso
              ? `Llevas ${auto.respondidas} de ${total} habilidades. Sigues donde lo dejaste.`
              : `${total} habilidades de tu cargo · unos ${Math.max(5, Math.round(total * 0.5))} minutos · se guarda mientras avanzas.`}
          </p>
          <p class="text-sm text-muted">Sin ella, tu resultado se calcula solo con la evaluación de tu líder y de tus pares.</p>
        </div>
        <a class="btn btn--primary" href="#/autoevaluacion">${enCurso ? `Continuar (${auto.respondidas} de ${total})` : 'Empezar mi autoevaluación'}</a>
      </div>
    </section>`;
}

/* --------------------------------------------------------------- equipo */

// Lista de tareas del líder: cada reporte con el estado de SU evaluación. Lo
// enviado no desaparece; se ve como enviado, que es como se sabe cuánto falta.
function bloqueEquipo(liderId, { primaria, abierta }) {
  const gente = reportesDirectos(liderId).filter((x) => x.cargo_id);
  if (!gente.length) {
    return `
      <section class="section" aria-labelledby="t-eq">
        <div class="section__head"><h2 class="section__title" id="t-eq">Tu equipo</h2></div>
        <p class="section__note">No tienes personas a cargo con cargo asignado en esta ronda.</p>
      </section>`;
  }
  const filas = gente.map((x) => ({ p: x, est: estadoEvaluacion(x.id, 'Leader'), total: preguntasDe(x.id).length }));
  const enviadas = filas.filter((f) => f.est.estado === 'enviada').length;
  const primeraFalta = filas.find((f) => f.est.estado !== 'enviada');

  return `
    <section class="section" aria-labelledby="t-eq">
      <div class="section__head">
        <h2 class="section__title" id="t-eq">
          Tu equipo <span class="badge ${enviadas === filas.length ? 'badge--success' : 'badge--neutral'}">${enviadas} de ${filas.length} evaluaciones enviadas</span>
        </h2>
        <a class="btn ${primaria && !primeraFalta ? 'btn--primary' : 'btn--secondary'} btn--sm" href="#/equipo">Ver el tablero del equipo</a>
      </div>
      <ul class="tareas">
        ${filas.map((f) => {
          const accion = !abierta ? null
            : f.est.estado === 'enviada' ? { texto: 'Revisar', clase: 'btn--ghost' }
              : f.est.estado === 'borrador' ? { texto: 'Continuar', clase: 'btn--secondary' }
                : { texto: 'Evaluar', clase: primaria && f === primeraFalta ? 'btn--primary' : 'btn--secondary' };
          return `
          <li class="tareas__fila">
            <span class="tareas__quien">
              <a href="#/persona/${esc(f.p.id)}"><b>${esc(f.p.nombre)}</b></a>
              <span class="text-sm text-muted">${esc(cargo(f.p.cargo_id)?.nombre ?? '')}${
                esInterino(f.p) ? ' · la lideras como interina o interino' : ''}</span>
            </span>
            ${estadoTareaHtml(f.est, f.total)}
            ${accion ? `<a class="btn ${accion.clase} btn--sm" href="#/evaluar/${esc(f.p.id)}">${accion.texto}<span class="sr-only"> a ${esc(f.p.nombre)}</span></a>` : '<span></span>'}
          </li>`;
        }).join('')}
      </ul>
    </section>`;
}

/* ---------------------------------------------------------------- pares */

function bloquePares(tareas) {
  const pares = tareas.filter((t) => t.tipo === 'par');
  if (!pares.length) return '';
  return `
    <section class="section" aria-labelledby="t-pares">
      <div class="section__head">
        <h2 class="section__title" id="t-pares">Te pidieron evaluar como par <span class="badge badge--warning">${pares.length}</span></h2>
      </div>
      <p class="section__note">Califica solo lo que has visto trabajando con cada persona.</p>
      <ul class="tareas">
        ${pares.map((t) => {
          const est = estadoEvaluacion(t.personaId, 'Peer');
          return `
          <li class="tareas__fila">
            <span class="tareas__quien">
              <b>${esc(persona(t.personaId)?.nombre ?? '')}</b>
              <span class="text-sm text-muted">${esc(cargo(persona(t.personaId)?.cargo_id)?.nombre ?? '')}</span>
            </span>
            ${estadoTareaHtml(est, preguntasDe(t.personaId).length)}
            <a class="btn btn--secondary btn--sm" href="${esc(t.ruta)}">${est.estado === 'borrador' ? 'Continuar' : 'Evaluar'}<span class="sr-only"> a ${esc(persona(t.personaId)?.nombre ?? '')}</span></a>
          </li>`;
        }).join('')}
      </ul>
    </section>`;
}

/* --------------------------------------------------------------- perfil */

function bloquePerfil(personaId, auto, { primaria = false } = {}) {
  const pf = perfil(personaId);
  if (!pf) return '';
  const sinDatos = pf.evaluadas === 0;
  const brechas = pf.prioridades.length;

  return `
    <section class="section" aria-labelledby="t-mio">
      <div class="section__head">
        <h2 class="section__title" id="t-mio">Tu resultado</h2>
        <a class="btn ${primaria ? 'btn--primary' : 'btn--secondary'} btn--sm" href="#/mi-desarrollo">Ver Mi desarrollo</a>
      </div>
      ${sinDatos ? `<p class="section__note">Todavía no hay evaluaciones tuyas en esta ronda.</p>` : `
      <div class="kpi-grid">
        <div class="kpi">
          <span class="kpi__value">${esc(pf.nivel_es ?? '—')}</span>
          <span class="kpi__label">Nivel actual · ${pf.perfil_total === null ? '—' : `${pf.perfil_total.toFixed(1)} de 100`}</span>
        </div>
        <div class="kpi">
          <span class="kpi__value">${pf.cumplimiento ? `${pf.cumplimiento.cumple}/${pf.cumplimiento.total}` : '—'}</span>
          <span class="kpi__label">Habilidades en su nivel esperado</span>
        </div>
        <div class="kpi">
          <span class="kpi__value">${brechas}</span>
          <span class="kpi__label">${brechas === 1 ? 'Brecha por cerrar' : 'Brechas por cerrar'}${pf.sin_evaluar ? ` · faltan ${pf.sin_evaluar} por evaluar` : ''}</span>
        </div>
      </div>`}
      ${auto?.estado === 'enviada' ? `
        <p class="section__note inicio__hecho">${icon('check')} Enviaste tu autoevaluación.
          <a href="#/autoevaluacion">Revisarla</a> mientras la ronda siga abierta.</p>` : ''}
    </section>`;
}

/* --------------------------------------------------------- administración */

// Lo que la administración tiene que hacer, no cuántas habilidades hay en el
// catálogo: cada cifra es algo que se puede corregir y lleva a donde se corrige.
function bloqueAdmin() {
  const activas = personas().filter((p) => p.activo !== false && !p.oculto);
  const conCargo = activas.filter((p) => p.cargo_id);
  const sinCargo = activas.length - conCargo.length;
  const conPares = new Set((administracion()?.pares ?? []).map((x) => x.evaluado_id));
  const sinPares = conCargo.filter((p) => !conPares.has(p.id)).length;
  const sinAuto = conCargo.filter((p) => !evaluacionesDe(p.id).some((e) => e.rol === 'Employee')).length;
  const sinLider = conCargo.filter((p) => !evaluacionesDe(p.id).some((e) => e.rol === 'Leader')).length;
  const n = personasEvaluadas().length;
  const areas = areasConCargos();
  const r = ronda();

  const tile = (valor, texto, href, alerta) => `
    <a class="kpi kpi--enlace${alerta ? ' kpi--alerta' : ''}" href="${href}">
      <span class="kpi__value">${valor}</span>
      <span class="kpi__label">${texto}</span>
    </a>`;

  return `
    <section class="section" aria-labelledby="t-admin">
      <div class="section__head">
        <h2 class="section__title" id="t-admin">Administración</h2>
        <a class="btn btn--secondary btn--sm" href="#/admin/personas">Ir a administración</a>
      </div>
      <p class="section__note">
        Ronda ${esc(r?.nombre ?? '')}: <b>${r?.abierta ? 'abierta' : 'cerrada'}</b>.
        Cada cifra lleva a donde se corrige.
      </p>
      <div class="kpi-grid">
        ${tile(sinAuto, sinAuto === 1 ? 'Persona sin autoevaluación' : 'Personas sin autoevaluación', '#/admin/pares', sinAuto > 0)}
        ${tile(sinLider, sinLider === 1 ? 'Persona sin evaluación de su líder' : 'Personas sin evaluación de su líder', '#/admin/pares', sinLider > 0)}
        ${tile(sinPares, sinPares === 1 ? 'Persona sin pares asignados' : 'Personas sin pares asignados', '#/admin/pares', sinPares > 0)}
        ${tile(sinCargo, sinCargo === 1 ? 'Persona sin cargo' : 'Personas sin cargo', '#/admin/personas', sinCargo > 0)}
      </div>
    </section>

    <section class="section" aria-labelledby="t-org">
      <div class="section__head">
        <h2 class="section__title" id="t-org">La organización</h2>
        <a class="btn btn--secondary btn--sm" href="#/organizacion">Ver la organización</a>
      </div>
      <p class="section__note">
        ${n} personas con cargo en ${areas.length} ${areas.length === 1 ? 'área' : 'áreas'} (${esc(areas.join(', '))}):
        matriz de talento, distribución por nivel y las habilidades con más brechas.
      </p>
    </section>`;
}

/* ------------------------------------------------------------- sin nada */

function sinNada(p, { esLider, esAdmin, tareas }) {
  return !p.cargo_id && !esLider && !esAdmin && !tareas.length;
}

function bloqueSinCargo() {
  return emptyState({
    title: 'Todavía no tienes un cargo asignado',
    body: 'Sin cargo no hay habilidades que evaluar en esta ronda. El equipo de Personas lo asigna; '
        + 'cuando lo haga, aquí aparecerá tu autoevaluación.',
    glyph: 'user',
  });
}
