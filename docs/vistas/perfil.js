/* =========================================================================
   PERFIL — estado de una persona frente a su cargo
   =========================================================================
   Dos entradas al mismo cálculo:

   #/mi-desarrollo   lo que ve la persona: los tres evaluadores por separado,
                     que es su pregunta real («¿cómo me ven?»). Sin simulador:
                     nadie recalcula su propio puntaje.

   #/persona/:id     lo que ve su líder: el estado frente al cargo y un
                     simulador para mover calificaciones y ver de qué depende el
                     resultado. El simulador no guarda nada, y lo dice.

   El total NUNCA aparece solo. Verificado con estos datos: alguien en 44.9
   cumple 18 de 18 habilidades de su cargo y alguien en 70.0 cumple 3 de 18. La
   cifra sola invita a la conclusión contraria.
   ========================================================================= */

import {
  esc, icon, scoreHtml, gapHtml, totalConCumplimiento, avisosHtml,
  emptyState, sincronizarScrollables, toast,
} from '../lib/ui.js';
import {
  perfil, persona, cargo, avisosEquipo, CATEGORIAS, NIVEL_ES, rolDeEvaluacion,
  matrizDeGrupo, EJE_MATRIZ, numeroCuadrante, planesDe, ronda, estadoEvaluacion,
  reportesDirectos, esInterino,
} from '../lib/almacen.js';
import {
  graficaMiradas, graficaContraEsperado, graficaMatriz, conectarGraficas,
} from '../lib/graficas.js';

const NIVELES = ['Basic', 'Intermediate', 'Advanced', 'Expert'];
const PUNTAJE_DE_NIVEL = { Basic: 2, Intermediate: 3, Advanced: 4, Expert: 5 };

/* =========================================================================
   Mi desarrollo
   ========================================================================= */

export function vistaMiDesarrollo({ sesion }) {
  const pf = perfil(sesion.persona.id);
  if (!pf) return { html: sinCargo() };
  const yo = sesion.persona.id;
  const auto = estadoEvaluacion(yo, 'Employee');
  // Revisar la autoevaluación es una acción de la persona, no una tarea más:
  // vive en la cabecera, donde se ve sin bajar.
  const accionAuto = ronda()?.abierta
    ? `<a class="btn ${auto.estado === 'enviada' ? 'btn--secondary' : 'btn--primary'}" href="#/autoevaluacion">${
        auto.estado === 'enviada' ? 'Revisar mi autoevaluación'
          : auto.estado === 'borrador' ? 'Continuar mi autoevaluación' : 'Hacer mi autoevaluación'}</a>`
    : '';
  const cabecera = `
    <div class="page-header">
      <div class="page-header--acciones">
        <div>
          <h1 class="page-header__title">Mi desarrollo</h1>
          <p class="page-header__lede">
            ${esc(pf.cargo?.nombre ?? '')} · Cómo te ves tú, cómo te ve tu líder y cómo
            te ven tus pares, contra el nivel que tu cargo espera.
          </p>
        </div>
        ${accionAuto ? `<div class="btn-group">${accionAuto}</div>` : ''}
      </div>
    </div>`;

  // Sin ninguna evaluación no hay nada que mostrar: un solo estado vacío que
  // dice qué falta, en lugar de una página de gráficas vacías que felicita.
  if (pf.evaluadas === 0) {
    return {
      html: `${cabecera}
        ${emptyState({
          title: 'Todavía no hay evaluaciones tuyas en esta ronda',
          body: 'Tu resultado aparece cuando tú, tu líder o tus pares envíen su evaluación.',
          glyph: 'clipboard',
        })}
        ${bloquePlan(yo)}`,
    };
  }

  // Primero la respuesta (dónde estoy y qué me falta), después el porqué.
  return {
    html: `${cabecera}
      ${cabeceraEstado(pf)}
      ${avisosDe(pf, { propio: true })}
      ${bloquePrioridades(pf, { propio: true })}
      ${bloquePlan(yo)}
      ${bloqueCategorias(pf)}
      ${bloqueMiradas(pf, { titulo: 'Cómo te ve cada evaluador' })}
      ${tablaEvaluadores(pf)}
    `,
    montado(raiz) {
      conectarDetalles(raiz);
      conectarGraficas(raiz);
      sincronizarScrollables(raiz);
    },
  };
}

/* =========================================================================
   Tablero de una persona del equipo
   ========================================================================= */

export function vistaPersona({ sesion, params }) {
  const p = persona(params.id);
  if (!p) return { html: noExiste() };

  const rol = rolDeEvaluacion(sesion.persona.id, p.id);
  const esSuLider = rol === 'Leader';
  const propio = p.id === sesion.persona.id;
  const admin = sesion.persona.roles.includes('admin');
  if (!esSuLider && !propio && !admin) return { html: sinPermiso(p) };
  // La persona ve su propio resultado en Mi desarrollo, sin simulador.
  if (propio && !admin) return vistaMiDesarrollo({ sesion });

  // Los ajustes del simulador viven acá, no en el almacén: son una pregunta que
  // se hace en pantalla, no un dato del sistema.
  const ajustes = {};

  const nombreCorto = p.nombre.split(' ')[0];
  const render = () => {
    const pf = perfil(p.id, { ajustes: Object.keys(ajustes).length ? ajustes : null });
    if (pf.evaluadas === 0) {
      return emptyState({
        title: `Todavía no hay evaluaciones de ${nombreCorto} en esta ronda`,
        body: 'No se pueden calcular su puntaje ni sus brechas hasta que llegue la primera evaluación.',
        glyph: 'clipboard',
      });
    }
    return `
      ${cabeceraEstado(pf, { simulando: Object.keys(ajustes).length > 0 })}
      ${avisosDe(pf)}
      ${bloquePrioridades(pf, { propio: false })}
      ${bloqueCategorias(pf)}
      ${bloqueMatriz(pf)}
      ${bloqueMiradas(pf, { titulo: `Cómo ven a ${nombreCorto} sus evaluadores` })}
    `;
  };

  // Las acciones van en la cabecera: es la pantalla donde se decide qué hacer
  // con la persona, y abajo de todo quedaban a varias pantallas de distancia.
  // La etiqueta dice el estado real: «Revisar» solo si ya se envió.
  const estadoMio = esSuLider ? estadoEvaluacion(p.id, 'Leader') : null;
  const accionEvaluar = esSuLider && ronda()?.abierta
    ? `<a class="btn ${estadoMio.estado === 'enviada' ? 'btn--secondary' : 'btn--primary'}" href="#/evaluar/${esc(p.id)}">${
        estadoMio.estado === 'enviada' ? 'Revisar mi evaluación'
          : estadoMio.estado === 'borrador' ? 'Continuar mi evaluación' : `Evaluar a ${esc(nombreCorto)}`}</a>`
    : '';
  const planPrimario = !accionEvaluar || estadoMio.estado === 'enviada';
  const accionPlan = (esSuLider || planesDe(p.id).length)
    ? `<a class="btn ${planPrimario ? 'btn--primary' : 'btn--secondary'}" href="#/plan/${esc(p.id)}">Plan de desarrollo</a>`
    : '';

  // Anterior y siguiente: recorrer los reportes sin volver al equipo cada vez.
  const companeros = esSuLider ? reportesDirectos(sesion.persona.id) : [];
  const i = companeros.findIndex((x) => x.id === p.id);
  const pager = companeros.length > 1 && i >= 0 ? `
    <nav class="pager" aria-label="Personas de tu equipo">
      ${i > 0 ? `<a class="task-link" href="#/persona/${esc(companeros[i - 1].id)}">${icon('chevronRight', { className: 'rotate-180' })}<span><span class="sr-only">Anterior: </span>${esc(companeros[i - 1].nombre)}</span></a>` : '<span></span>'}
      <span class="pager__pos">${i + 1} de ${companeros.length}</span>
      ${i < companeros.length - 1 ? `<a class="task-link pager__siguiente" href="#/persona/${esc(companeros[i + 1].id)}"><span><span class="sr-only">Siguiente: </span>${esc(companeros[i + 1].nombre)}</span>${icon('chevronRight')}</a>` : '<span></span>'}
    </nav>` : '';

  const pfBase = perfil(p.id);
  const html = `
    <div class="page-header">
      <a class="task-link volver" href="${esSuLider ? '#/equipo' : '#/organizacion'}">
        ${icon('chevronRight', { className: 'rotate-180' })} ${esSuLider ? 'Volver a Mi equipo' : 'Volver a la organización'}
      </a>
      <div class="page-header--acciones">
        <div>
          <h1 class="page-header__title">${esc(p.nombre)}</h1>
          <p class="page-header__lede">${esc(cargo(p.cargo_id)?.nombre ?? '')} · ${esc(p.area)}${
            esInterino(p) ? ' · <span class="badge badge--neutral">La lideras como interina o interino</span>' : ''}</p>
        </div>
        ${accionEvaluar || accionPlan ? `<div class="btn-group">${accionEvaluar}${accionPlan}</div>` : ''}
      </div>
      ${pager}
    </div>

    <div id="zona-estado">${render()}</div>
    ${pfBase.evaluadas ? tablaEvaluadores(pfBase, { lider: true }) : ''}
    ${pfBase.evaluadas && esSuLider ? bloqueSimulador(p) : ''}
  `;

  return {
    html,
    montado(raiz) {
      const zona = raiz.querySelector('#zona-estado');
      // Al simular se recalcula todo lo que depende del puntaje — el total, las
      // categorías y el cuadrante de la matriz —, así que el líder ve a la
      // persona moverse de cuadrante en vivo.
      const refrescar = () => {
        // Las tablas equivalentes que la persona abrió siguen abiertas: antes
        // cada cambio del simulador las cerraba todas.
        const abiertas = [...zona.querySelectorAll('figure.grafica')]
          .filter((f) => f.querySelector('details[open]')).map((f) => f.id);
        zona.innerHTML = render();
        abiertas.forEach((id) => {
          const d = zona.querySelector(`#${id} details`);
          if (d) d.open = true;
        });
        conectarDetalles(zona);
        conectarGraficas(zona);
        sincronizarScrollables(zona);
      };

      raiz.querySelectorAll('[data-simular]').forEach((sel) => {
        sel.addEventListener('change', () => {
          const sid = sel.dataset.simular;
          if (sel.value === '') delete ajustes[sid];
          else ajustes[sid] = Number(sel.value);
          refrescar();
          actualizarContador(raiz, ajustes);
        });
      });

      raiz.querySelector('[data-reiniciar]')?.addEventListener('click', () => {
        Object.keys(ajustes).forEach((k) => delete ajustes[k]);
        raiz.querySelectorAll('[data-simular]').forEach((s) => { s.value = ''; });
        refrescar();
        actualizarContador(raiz, ajustes);
        // El botón queda deshabilitado y el foco caía al <body>: se lleva al
        // primer selector, que es donde se sigue trabajando.
        raiz.querySelector('[data-simular]')?.focus();
        toast('Simulación reiniciada. Volviste a los datos evaluados.', 'success');
      });

      conectarDetalles(zona);
      conectarGraficas(zona);
      sincronizarScrollables(raiz);
    },
  };
}

function actualizarContador(raiz, ajustes) {
  const n = Object.keys(ajustes).length;
  const chip = raiz.querySelector('[data-contador]');
  const boton = raiz.querySelector('[data-reiniciar]');
  if (chip) {
    chip.textContent = n ? `${n} ${n === 1 ? 'habilidad modificada' : 'habilidades modificadas'}` : 'Sin cambios';
    chip.className = `badge ${n ? 'badge--warning' : 'badge--neutral'}`;
  }
  if (boton) boton.disabled = n === 0;
}

/* =========================================================================
   Piezas compartidas
   ========================================================================= */

function cabeceraEstado(pf, { simulando = false } = {}) {
  return `
    <section class="section" aria-labelledby="t-estado">
      <div class="section__head">
        <h2 class="section__title" id="t-estado">Estado actual</h2>
        ${simulando ? '<span class="badge badge--warning">Con cambios simulados</span>' : ''}
      </div>
      <div class="card">
        ${totalConCumplimiento({
          total: pf.perfil_total,
          nivel: pf.nivel_es,
          cumplimiento: pf.cumplimiento,
          margen: pf.margen_banda,
          vecina: pf.banda_vecina,
          evaluadas: pf.evaluadas,
          sinEvaluar: pf.sin_evaluar,
        })}
      </div>
      ${simulando ? `
        <div class="callout callout--warning">
          ${icon('alert')}
          <span>Estás viendo una simulación. Nada de esto queda guardado: al salir de
          la pantalla vuelve a los datos evaluados.</span>
        </div>` : ''}
    </section>`;
}

function avisosDe(pf, { propio = false } = {}) {
  // Sin el aviso de umbral: el bloque del puntaje, justo arriba, ya dice que el
  // nivel está en el borde. Repetido, era la misma advertencia dos veces en
  // doscientos píxeles. En el tablero del equipo sí va, porque ahí no está el
  // bloque de puntaje de cada persona.
  const avisos = avisosEquipo([pf]).filter((a) => a.tipo !== 'umbral');
  if (!avisos.length) return '';
  return `
    <section class="section" aria-labelledby="t-avisos">
      <div class="section__head">
        <h2 class="section__title" id="t-avisos">${propio ? 'Tu resultado todavía es parcial' : 'Antes de leer los números'}</h2>
      </div>
      ${avisosHtml(avisos)}
    </section>`;
}

/* Las tres cifras por categoría pasaron a ser una gráfica con la marca de lo
   que el cargo espera: la cifra sola no respondía si está donde debería. */
function bloqueCategorias(pf) {
  const g = graficaContraEsperado(pf.perfil_por_categoria, pf.esperado_por_categoria, { etiquetadoPor: 't-cat' });
  if (!g) return '';
  return `
    <section class="section" aria-labelledby="t-cat">
      <div class="section__head">
        <h2 class="section__title" id="t-cat">Cada categoría contra lo que el cargo espera</h2>
      </div>
      ${g}
    </section>`;
}

function bloqueMiradas(pf, { titulo }) {
  const g = graficaMiradas(pf.miradas_por_categoria, { titulo, etiquetadoPor: 't-miradas' });
  if (!g) return '';
  return `
    <section class="section" aria-labelledby="t-miradas">
      <div class="section__head"><h2 class="section__title" id="t-miradas">${esc(titulo)}</h2></div>
      ${g}
    </section>`;
}

/* Matriz de talento de una persona: su cuadrante marcado, y debajo qué
   significa y qué recomienda el instrumento. */
function bloqueMatriz(pf) {
  if (!pf.matriz) return '';
  const m = pf.matriz;
  const grupo = matrizDeGrupo([pf]);
  return `
    <section class="section" aria-labelledby="t-matriz">
      <div class="section__head">
        <h2 class="section__title" id="t-matriz">Matriz de talento</h2>
      </div>
      ${graficaMatriz(grupo, {
        resaltar: m.clave, id: 'g-matriz-persona',
        titulo: 'Ubicación en la matriz de talento', etiquetadoPor: 't-matriz',
      })}
      <div class="matriz-detalle">
        <span class="label-micro">Cuadrante ${numeroCuadrante(m.clave)}</span>
        <span class="matriz-detalle__etiqueta">${esc(m.etiqueta)}</span>
        <p class="text-sm">${esc(m.descripcion)}</p>
        <p class="text-sm"><strong>Recomendación:</strong> ${esc(m.recomendacion)}</p>
        <p class="text-xs text-muted">
          Desempeño ${m.desempeno.toFixed(1)} (${esc(EJE_MATRIZ[m.x].toLowerCase())}) ·
          Potencial ${m.potencial.toFixed(1)} (${esc(EJE_MATRIZ[m.y].toLowerCase())}), de 1 a 5${
          pf.cumplimiento ? ` · ${pf.cumplimiento.cumple} de ${pf.cumplimiento.total} habilidades en el nivel que su cargo espera` : ''}.
        </p>
      </div>
    </section>`;
}

function bloquePrioridades(pf, { propio }) {
  const lista = pf.prioridades;

  // Sin brechas pero con habilidades sin evaluar no es «todo en nivel».
  if (!lista.length && pf.sin_evaluar) {
    return `
      <section class="section" aria-labelledby="t-prio">
        <div class="section__head"><h2 class="section__title" id="t-prio">Brechas</h2></div>
        <p class="section__note">
          Ninguna de las habilidades evaluadas está por debajo de lo esperado, pero faltan
          ${pf.sin_evaluar} por evaluar: las brechas pueden cambiar cuando lleguen.
        </p>
      </section>`;
  }

  if (!lista.length) {
    return `
      <section class="section" aria-labelledby="t-prio">
        <div class="section__head">
          <h2 class="section__title" id="t-prio">Brechas</h2>
        </div>
        ${emptyState({
          title: propio
            ? 'Estás en el nivel esperado en todas tus habilidades'
            : 'No hay brechas frente al nivel esperado del cargo',
          body: 'No hay nada por cerrar en esta ronda. El siguiente paso no es remediar, '
              + 'es crecer: subir de nivel en algo concreto o asumir habilidades de un cargo posterior.',
          glyph: 'check',
        })}
      </section>`;
  }

  return `
    <section class="section" aria-labelledby="t-prio">
      <div class="section__head">
        <h2 class="section__title" id="t-prio">
          Brechas <span class="badge badge--neutral">${lista.length}</span>
        </h2>
      </div>
      <p class="section__note">
        Habilidades por debajo del nivel que el cargo espera, de la más profunda a
        la más leve. Entre brechas iguales va primero la categoría que más pesa.
      </p>
      <div class="dl-rows dl-rows--brechas">
        ${lista.map((h) => `
          <div class="dl-row">
            <span class="dl-row__term">
              <b>${esc(h.nombre)}</b>
              <span class="text-sm text-muted linea-aparte">${esc(etiquetaTipo(h.tipo))}</span>
            </span>
            <span class="dl-row__values">
              ${gapHtml(h.severidad, { esperado: h.nivel_esperado_label, escalones: h.escalones })}
              <span class="text-sm">
                Hoy <b>${esc(h.nivel_label ?? '—')}</b>, el cargo espera <b>${esc(h.nivel_esperado_label)}</b>
              </span>
              ${scoreHtml(h.promedio, { label: `Promedio en ${h.nombre}` })}
            </span>
          </div>`).join('')}
      </div>
    </section>`;
}

function tablaEvaluadores(pf, { lider = false } = {}) {
  const filas = pf.habilidades;
  if (!filas.length) return '';

  return `
    <section class="section" aria-labelledby="t-detalle">
      <div class="section__head">
        <h2 class="section__title" id="t-detalle">Habilidad por habilidad</h2>
      </div>
      <p class="section__note">
        Cuando falta un evaluador su peso se reparte entre los presentes, así que el
        promedio es válido pero parcial. La columna lo marca.
      </p>
      <div class="table-wrap table-wrap--sticky">
        <table class="table">
          <caption class="sr-only">
            Cada habilidad del cargo con el puntaje de cada evaluador, de 1 a 5, el
            promedio, el nivel de hoy, el esperado y la brecha.
          </caption>
          <thead>
            <tr>
              <th scope="col">Habilidad</th>
              <th scope="col">Categoría</th>
              <th scope="col" class="table__cell--numeric">${lider ? 'Autoevaluación' : 'Tú'}</th>
              <th scope="col" class="table__cell--numeric">${lider ? 'Tú (líder)' : 'Líder'}</th>
              <th scope="col" class="table__cell--numeric">Pares</th>
              <th scope="col">Promedio (1 a 5)</th>
              <th scope="col">Hoy</th>
              <th scope="col">Esperado</th>
              <th scope="col">Brecha</th>
            </tr>
          </thead>
          <tbody>
            ${filas.map((h, i) => filaHabilidad(h, i)).join('')}
          </tbody>
        </table>
      </div>
    </section>`;
}

function filaHabilidad(h, i) {
  const id = `nivel-${i}`;
  const tieneDetalle = Boolean(h.nivel_descripcion);

  return `
    <tr class="table__row">
      <td>
        <div>${esc(h.nombre)}</div>
        <div class="insignias">
          ${!h.completo && h.evaluadores_faltantes.length
            ? '<span class="badge badge--warning">Parcial</span>' : ''}
          ${tieneDetalle ? `
            <button type="button" class="btn btn--ghost btn--sm"
                    aria-expanded="false" aria-controls="${id}">Qué es «${esc(h.nivel_label)}»<span class="sr-only"> en ${esc(h.nombre)}</span></button>` : ''}
        </div>
      </td>
      <td class="text-sm">${esc(etiquetaTipo(h.tipo))}</td>
      <td data-numeric class="table__cell--numeric">${fmt(h.puntajes.employee)}</td>
      <td data-numeric class="table__cell--numeric">${fmt(h.puntajes.leader)}</td>
      <td data-numeric class="table__cell--numeric">${fmt(h.puntajes.peer)}</td>
      <td>${scoreHtml(h.promedio, { label: `Promedio en ${h.nombre}` })}</td>
      <td class="text-sm">${esc(h.nivel_label ?? '—')}</td>
      <td class="text-sm">${esc(h.nivel_esperado_label ?? '—')}</td>
      <td>${gapHtml(h.severidad, { esperado: h.nivel_esperado_label, escalones: h.escalones })
            || '<span class="text-sm text-muted">—</span>'}</td>
    </tr>
    ${tieneDetalle ? `
      <tr class="table__detail" id="${id}" hidden>
        <td colspan="9">
          <div class="table__detail__inner">
            <p class="label-micro">Nivel ${esc(h.nivel_label)}</p>
            <p class="text-sm detalle-nivel">
              ${esc(h.nivel_descripcion)}
            </p>
          </div>
        </td>
      </tr>` : ''}`;
}

/* --------------------------------------------------------------- simulador */

function bloqueSimulador(p) {
  const pf = perfil(p.id);

  return `
    <section class="section" aria-labelledby="t-sim">
      <div class="section__head">
        <h2 class="section__title" id="t-sim">Simular otro escenario</h2>
        <span class="badge badge--neutral" data-contador role="status">Sin cambios</span>
      </div>
      <p class="section__note">
        Cambia el nivel de una habilidad y el puntaje total se recalcula arriba. Sirve
        para entender de qué depende el resultado antes de una conversación:
        <b>ninguna modificación se guarda</b> ni afecta la evaluación real.
      </p>
      <div class="toolbar">
        <span class="toolbar__grow text-xs text-muted">
          El nivel elegido reemplaza el consolidado de los tres evaluadores.
        </span>
        <button type="button" class="btn btn--secondary btn--sm" data-reiniciar disabled>
          Volver a los datos reales
        </button>
      </div>
      <div class="table-wrap">
        <table class="table">
          <caption class="sr-only">
            Habilidades del cargo con un selector para simular otro nivel observado.
          </caption>
          <thead>
            <tr>
              <th scope="col">Habilidad</th>
              <th scope="col">Categoría</th>
              <th scope="col">Esperado</th>
              <th scope="col">Hoy</th>
              <th scope="col">Simular</th>
            </tr>
          </thead>
          <tbody>
            ${pf.habilidades.map((h, i) => `
              <tr class="table__row">
                <td>${esc(h.nombre)}</td>
                <td class="text-sm">${esc(etiquetaTipo(h.tipo))}</td>
                <td class="text-sm">${esc(h.nivel_esperado_label ?? '—')}</td>
                <td class="text-sm">${esc(h.nivel_label ?? 'sin evaluar')}</td>
                <td>
                  <label class="sr-only" for="sim-${i}">Simular nivel de ${esc(h.nombre)}</label>
                  <select class="select" id="sim-${i}" data-simular="${esc(h.skill_id)}">
                    <option value="">Sin cambio</option>
                    ${NIVELES.map((n) => `
                      <option value="${PUNTAJE_DE_NIVEL[n]}">${esc(NIVEL_ES[n])}</option>`).join('')}
                  </select>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>`;
}

/* ------------------------------------------------------------------- plan */

function bloquePlan(personaId) {
  const n = planesDe(personaId).length;
  return `
    <section class="section" aria-labelledby="t-plan">
      <div class="section__head">
        <h2 class="section__title" id="t-plan">Tu plan de desarrollo</h2>
        ${n ? `<a class="btn btn--primary btn--sm" href="#/plan/${esc(personaId)}">Ver mi plan</a>` : ''}
      </div>
      <p class="section__note">${n
        ? `Tu líder propuso ${n === 1 ? 'un plan' : `${n} planes`} a partir de estas brechas.`
        : 'Tu líder todavía no ha propuesto un plan. Cuando lo haga, aparecerá aquí.'}</p>
    </section>`;
}

/* ------------------------------------------------------------------ apoyo */

function conectarDetalles(raiz) {
  raiz.querySelectorAll('[aria-controls^="nivel-"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const destino = raiz.querySelector(`#${btn.getAttribute('aria-controls')}`);
      if (!destino) return;
      const abierto = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!abierto));
      destino.hidden = abierto;
    });
  });
}

const etiquetaTipo = (t) => (CATEGORIAS.find((c) => c.key === t)?.label ?? t ?? '');
const fmt = (v) => (v === null || v === undefined ? '—' : Number(v).toFixed(1));

const sinCargo = () => emptyState({
  title: 'Todavía no tienes cargo asignado',
  body: 'Sin cargo no hay nivel esperado con el que comparar. El área de Personas '
      + 'define los cargos en la matriz del instrumento.',
});

const noExiste = () => emptyState({
  title: 'Esa persona no existe',
  body: 'Puede que el enlace esté mal o que hayas cambiado de usuario. Vuelve al inicio.',
});

const sinPermiso = (p) => emptyState({
  title: `No puedes ver el perfil de ${p.nombre}`,
  body: 'Solo esa persona y su líder directo tienen acceso a este detalle. '
      + 'Si crees que deberías verlo, habla con el equipo de Personas.',
  glyph: 'lock',
});
