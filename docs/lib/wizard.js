/**
 * Evaluation wizard — Career Development Portal
 *
 * One implementation for all three evaluation forms.
 *
 * The PoC had employee.html, leader.html and peer.html carrying three copies of
 * the same ~200-line wizard, differing only in who selects whom, which skills
 * are asked, and the role string sent to the backend. Every accessibility fix
 * below therefore had to be made three times, or — as actually happened — not
 * at all. Parameterising the differences collapses ~700 duplicated lines and
 * means the keyboard and screen-reader work lands once.
 *
 * The significant change from the PoC: the four level choices were <div>s with
 * click handlers, which are unreachable by keyboard and announce as nothing.
 * They are now a real radio group inside a fieldset, so arrow-key navigation,
 * Space selection, and "3 of 4" group semantics come from the platform.
 */

import { esc, icon, toast, withBusy, emptyState, sincronizarScrollables } from './ui.js';
import {
  NIVEL_A_PUNTAJE, NIVEL_ORDEN, NIVEL_LABEL,
  cargoPorNombre, normalizar, valorNivel,
} from './modelo.js';

export const CATEGORIA_LABEL = {
  Funcion: 'Función del rol',
  'Hard Skill': 'Hard skill',
  'Soft Skill': 'Soft skill',
};

/**
 * Build the ordered question list for one person.
 *
 * Order is deliberate — role functions, then hard skills, then soft skills —
 * because it moves from the most concrete and role-specific to the most general,
 * which is the easier direction to answer a long form in.
 *
 * TWO MODES, and which one applies is the difference between an 18-question form
 * and a 56-question one:
 *
 *   POR CARGO (preferido) — the person's `cargo` matches a role in the Excel's
 *   MasterTable, so we ask exactly the 18-26 skills HR assigned to that role,
 *   each carrying its expected level. This is what the source instrument does.
 *
 *   POR DEPARTAMENTO (respaldo) — no cargo, or a cargo HR has not defined yet.
 *   Falls back to every active skill in the person's department, which is what
 *   the PoC always did: 45-62 questions, and no expected level, so no real gap.
 *
 * The fallback exists because only 8 of 12 areas have roles defined and nobody
 * has a `cargo` assigned yet. Each person the framework covers gets the short
 * form automatically, with no migration flag day.
 *
 * @param {object}  catalogo  from getCatalogo()
 * @param {object}  persona   the person being evaluated
 * @param {boolean} soloHardSkills  external evaluators rate hard skills only
 */
export function buildPreguntas(catalogo, persona, { soloHardSkills = false } = {}) {
  // A deactivated skill arrives with `activo` ABSENT rather than false — an
  // unchecked Airtable checkbox is omitted from the API response entirely.
  // Comparing against false would therefore include every deactivated skill.
  const activas = (catalogo.skills ?? []).filter((s) => s.activo === true);

  const porCargo = preguntasPorCargo(activas, persona, { soloHardSkills });
  if (porCargo) return porCargo;

  const delPerfil = (tipo) => activas.filter((s) => s.tipo === tipo && s.perfil_rol === persona.perfil_rol);
  if (soloHardSkills) return delPerfil('Hard Skill');

  return [
    ...delPerfil('Funcion'),
    ...delPerfil('Hard Skill'),
    ...activas.filter((s) => s.tipo === 'Soft Skill'),
  ];
}

/**
 * The role-scoped question set, or null when the framework does not cover this
 * person. Each returned skill carries `nivel_esperado`, which is what makes a
 * real gap computable downstream.
 */
function preguntasPorCargo(activas, persona, { soloHardSkills }) {
  const definicion = cargoPorNombre(persona.cargo);
  if (!definicion) return null;

  const porClave = new Map();
  activas.forEach((s) => {
    // Keyed by (tipo, departamento, nombre): 6 function names exist in two
    // departments with different definitions, so the name alone is ambiguous.
    // Soft skills have no department in the source and are cross-profile.
    const dep = s.tipo === 'Soft Skill' ? '' : normalizar(s.perfil_rol);
    porClave.set(`${s.tipo}|${dep}|${normalizar(s.nombre)}`, s);
  });

  const buscadas = soloHardSkills
    ? definicion.habilidades.filter((h) => h.tipo === 'Hard Skill')
    : ['Funcion', 'Hard Skill', 'Soft Skill'].flatMap(
        (tipo) => definicion.habilidades.filter((h) => h.tipo === tipo));

  const preguntas = [];
  const noEncontradas = [];

  buscadas.forEach((h) => {
    const dep = h.tipo === 'Soft Skill' ? '' : normalizar(h.departamento ?? definicion.area);
    const skill = porClave.get(`${h.tipo}|${dep}|${normalizar(h.nombre)}`);
    if (skill) preguntas.push({ ...skill, nivel_esperado: h.nivel_esperado });
    else noEncontradas.push(h.nombre);
  });

  if (noEncontradas.length) {
    // Expected for the 5 skills HR assigned to a role but never defined. Logged
    // rather than thrown: a missing definition must not block the evaluation of
    // every other skill in the role.
    console.warn(`Cargo "${definicion.cargo}": ${noEncontradas.length} habilidades del framework no están en el catálogo activo:`, noEncontradas);
  }

  // If the framework resolved to nothing usable, fall back rather than showing
  // an empty form.
  return preguntas.length ? preguntas : null;
}

/**
 * @param {object}   config
 * @param {string}   config.mountId        element to render the wizard into
 * @param {string}   config.rolEvaluador   'Employee' | 'Leader' | 'Peer'
 * @param {string?}  config.tipoEvaluacion 'Interno' | 'Externo' (peer only)
 * @param {object}   config.evaluador      { id, nombre } — id may be null (external)
 * @param {object}   config.evaluado       the person being rated
 * @param {object[]} config.preguntas      from buildPreguntas()
 * @param {string}   config.reviewTitle
 * @param {function} config.onFinish       called after a successful submit
 * @param {object?}  config.respuestasIniciales  { skillId: nivel } con el que
 *                                        abre el formulario si no hay borrador
 * @param {string?}  config.origenRespuestas     'precargada' | 'enviada': de
 *                                        dónde vienen, para decirlo en la revisión
 */
export function startWizard(config) {
  const mount = document.getElementById(config.mountId);
  if (!mount) return null;

  const { rolEvaluador, tipoEvaluacion = null, evaluador, evaluado, preguntas } = config;

  if (!preguntas.length) {
    mount.innerHTML = emptyState({
      title: 'No hay habilidades que evaluar',
      body: `El perfil "${evaluado.perfil_rol || 'sin perfil'}" no tiene habilidades activas asignadas. Avisa al equipo de RH.`,
    });
    return null;
  }

  /* Draft key is scoped by round, role, modality, evaluator and subject, so a
     leader part-way through evaluating three people keeps three separate drafts
     instead of overwriting one.

     External evaluators have no record id, so the key falls back to their typed
     name, normalised so "Consultor ", "consultor" and "Consultor" resolve to the
     same draft instead of silently abandoning it on return.

     ACCEPTED LIMITATION: two different external evaluators who type the same
     name and rate the same person still share one draft. There is no identity to
     key on until real authentication exists (see DESIGN-SYSTEM.md § 7), and the
     alternative — a random per-session key — would make returning to an
     unfinished form impossible, which is the worse failure for someone filling a
     long form on a borrowed link. */
  const claveEvaluador = evaluador.id
    ?? String(evaluador.nombre).trim().toLowerCase().replace(/\s+/g, ' ');

  const draftKey = [
    'cdp_draft', config.claveRonda ?? 'ronda', rolEvaluador, tipoEvaluacion ?? '-',
    claveEvaluador, evaluado.id,
  ].join('_');

  const state = {
    respuestas: readDraft(draftKey),
    indice: 0,
    step: 'pregunta',   // 'pregunta' | 'review' | 'done'
    // Se entró a una pregunta desde la revisión con «Cambiar»: al responderla
    // hay que volver a la revisión, no seguir a la pregunta siguiente.
    desdeRevision: false,
    // La fila desde la que se entró, para devolverle el foco al volver. Sin
    // esto, quien usa teclado caía en el título y tenía que tabular 20 filas
    // para encontrar dónde estaba.
    filaOrigen: null,
    // La respuesta antes del desvío, para que «Cancelar» la restaure.
    valorPrevio: undefined,
    // Ya se vio la revisión alguna vez. Decide si el último botón dice
    // «Revisar respuestas» (primera vez) o «Volver a la revisión».
    vioRevision: false,
  };

  /* Drop draft entries for skills that are no longer being asked.
     A deactivated skill leaves its answer behind in the draft, and counting raw
     draft keys pushed the progress label past 100% ("Pregunta 1 de 46 · 104%")
     while <progress> clamped at max — the two readings disagreed. */
  const idsVigentes = new Set(preguntas.map((p) => p.id));
  Object.keys(state.respuestas).forEach((id) => {
    if (!idsVigentes.has(id)) delete state.respuestas[id];
  });

  /** Answered count, always derived from the live question set. */
  const contarRespondidas = () => preguntas.filter((p) => state.respuestas[p.id]).length;

  /* Respuestas iniciales, solo si no hay un borrador propio.
     El borrador manda porque es trabajo de la persona: si empezó a cambiar las
     respuestas precargadas y cerró la pestaña, al volver tiene que encontrar SUS
     cambios, no la precarga de nuevo encima.

     Se decide DESPUÉS de podar: un borrador que solo tenía habilidades ya
     desactivadas contaba como borrador, se saltaba la precarga, y la persona
     caía en la pregunta 1 en blanco. */
  const huboBorrador = contarRespondidas() > 0;
  if (!huboBorrador && config.respuestasIniciales) {
    Object.entries(config.respuestasIniciales).forEach(([skillId, nivel]) => {
      if (idsVigentes.has(skillId) && NIVEL_A_PUNTAJE[nivel] !== undefined) {
        state.respuestas[skillId] = { nivel, puntaje: NIVEL_A_PUNTAJE[nivel] };
      }
    });
  }
  /* De dónde vienen las respuestas y si hay cambios encima. Las dos cosas se
     dicen por separado: un borrador sobre una evaluación ya enviada son CAMBIOS
     SIN ENVIAR, y antes se anunciaba como «nada se ha enviado», que es falso. */
  const origen = config.origenRespuestas ?? (huboBorrador ? 'borrador' : null);
  const conCambios = huboBorrador && Boolean(config.origenRespuestas);

  /* Resume where they stopped.
     An ALREADY-COMPLETE draft goes straight to the review step. The previous
     version clamped a findIndex of -1 to 0 with Math.max, so someone who
     answered all 56 questions and closed the tab before submitting came back to
     question 1 with no route to the submit button but 56 more clicks — the
     difference between submitting and giving up. */
  const primeraSinResponder = preguntas.findIndex((p) => !state.respuestas[p.id]);
  if (primeraSinResponder === -1) {
    state.step = 'review';
  } else {
    state.indice = primeraSinResponder;
  }

  render();

  /* ------------------------------------------------------------------ draft */

  function readDraft(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || '{}');
    } catch {
      return {};
    }
  }

  function saveDraft() {
    try {
      localStorage.setItem(draftKey, JSON.stringify(state.respuestas));
    } catch {
      /* Storage full or blocked (private mode). The evaluation still works —
         it just will not survive a reload — so this must not throw. */
    }
  }

  function clearDraft() {
    try { localStorage.removeItem(draftKey); } catch { /* see above */ }
  }

  /* ----------------------------------------------------------------- render */

  function render() {
    if (state.step === 'pregunta') renderPregunta();
    else if (state.step === 'review') renderReview();
  }

  function renderPregunta() {
    const skill = preguntas[state.indice];
    const total = preguntas.length;
    const numero = state.indice + 1;
    const elegido = state.respuestas[skill.id]?.nivel ?? null;
    const respondidas = contarRespondidas();

    mount.innerHTML = `
      ${progresoHtml(numero, total, respondidas)}

      <div class="card wizard__card">
        <p class="label-micro">${esc(CATEGORIA_LABEL[skill.tipo] ?? skill.tipo)}</p>
        <!-- El título recibe el foco en cada cambio de paso. La posición va
             dentro para que un lector de pantalla la anuncie: el "Pregunta N de M"
             visible queda antes en el orden y el foco se lo salta. -->
        <h2 class="wizard__skill" id="wizard-skill"><span class="sr-only">Pregunta ${numero} de ${total}: </span>${esc(String(skill.nombre).trim())}</h2>
        ${skill.descripcion ? `<p class="wizard__desc">${esc(skill.descripcion)}</p>` : ''}

        <!-- A real fieldset + radio group. Arrow keys move between options,
             Space selects, and the group is announced as "N of 4" — none of
             which the PoC's clickable <div>s provided. -->
        <fieldset class="choices">
          <legend class="sr-only">Nivel de ${esc(String(skill.nombre).trim())}</legend>
          ${NIVEL_ORDEN.map((nivel) => `
            <label class="choice">
              <input class="choice__input" type="radio" name="nivel-${esc(skill.id)}"
                     value="${esc(nivel)}" ${elegido === nivel ? 'checked' : ''}>
              <span class="choice__body">
                <span class="choice__name">${esc(NIVEL_LABEL[nivel])}</span>
                <span class="choice__desc">${esc(skill.niveles?.[nivel] || 'Sin descripción disponible.')}</span>
              </span>
            </label>
          `).join('')}
        </fieldset>
      </div>

      <div class="wizard__nav">
        <button type="button" class="btn btn--secondary" id="wizard-back"
                ${!state.desdeRevision && state.indice === 0 ? 'disabled' : ''}>${
          state.desdeRevision ? 'Cancelar' : 'Atrás'}</button>
        <button type="button" class="btn btn--primary" id="wizard-next"
                ${elegido ? '' : 'disabled'}>${etiquetaSiguiente()}</button>
      </div>

      <p class="wizard__hint text-xs text-muted">
        Tus respuestas se guardan en este navegador mientras avanzas. Puedes cerrar
        y continuar después desde donde te quedaste.
      </p>`;

    mount.querySelectorAll('.choice__input').forEach((input) => {
      input.addEventListener('change', () => {
        state.respuestas[skill.id] = {
          nivel: input.value,
          puntaje: NIVEL_A_PUNTAJE[input.value],
        };
        saveDraft();
        mount.querySelector('#wizard-next').disabled = false;
        // Updated in place, not on navigation. The first thing anyone does on a
        // 56-question form is answer question 1 — leaving the bar at 0% until
        // they press Siguiente reads as "nothing happened".
        actualizarProgreso();
      });
    });

    mount.querySelector('#wizard-back').addEventListener('click', () => {
      // En un desvío desde la revisión, «Atrás» caminaba hacia la pregunta
      // anterior, que nadie pidió. Ahí es «Cancelar»: deshace y vuelve.
      if (state.desdeRevision) {
        if (state.valorPrevio === undefined) delete state.respuestas[skill.id];
        else state.respuestas[skill.id] = state.valorPrevio;
        saveDraft();
        irARevision();
        return;
      }
      if (state.indice > 0) { state.indice -= 1; render(); focusHeading(); }
    });

    mount.querySelector('#wizard-next').addEventListener('click', () => {
      if (state.desdeRevision || state.indice === total - 1) {
        irARevision();
        return;
      }
      state.indice += 1;
      render();
      focusHeading();
    });
  }

  /** «Volver a» solo promete un lugar donde ya se estuvo. */
  function etiquetaSiguiente() {
    const ultima = state.indice === preguntas.length - 1;
    if (state.desdeRevision || (ultima && state.vioRevision)) return 'Volver a la revisión';
    return ultima ? 'Revisar respuestas' : 'Siguiente';
  }

  /** Vuelve a la revisión y devuelve el foco a la fila de donde se salió. */
  function irARevision() {
    const fila = state.desdeRevision ? state.filaOrigen : null;
    state.desdeRevision = false;
    state.filaOrigen = null;
    state.valorPrevio = undefined;
    state.step = 'review';
    render();
    const boton = fila === null ? null : mount.querySelector(`[data-cambiar="${fila}"]`);
    if (boton) boton.focus();
    else focusHeading();
  }

  function progresoHtml(numero, total, respondidas) {
    const pct = Math.round((respondidas / total) * 100);
    return `
      <div class="wizard__progress">
        <div class="wizard__progress-label">
          <span>Pregunta ${numero} de ${total}${
            rolEvaluador === 'Employee' ? '' : ` · evaluando a ${esc(evaluado.nombre)}`}</span>
          <span class="numeric" data-progreso-pct>${pct}%</span>
        </div>
        <!-- Native <progress>: the value is exposed to assistive tech without
             any ARIA, and it degrades to a sensible control if CSS fails. -->
        <progress class="wizard__bar" max="${total}" value="${respondidas}"
                  aria-label="Progreso de la evaluación">${pct}%</progress>
      </div>`;
  }

  /** Refresh the bar and the percentage without re-rendering the question. */
  function actualizarProgreso() {
    const bar = mount.querySelector('.wizard__bar');
    const pctEl = mount.querySelector('[data-progreso-pct]');
    if (!bar) return;
    const respondidas = contarRespondidas();
    bar.value = respondidas;
    const pct = Math.round((respondidas / preguntas.length) * 100);
    bar.textContent = `${pct}%`;
    if (pctEl) pctEl.textContent = `${pct}%`;
  }

  function renderReview() {
    state.vioRevision = true;
    const respondidas = contarRespondidas();
    const total = preguntas.length;
    const completas = respondidas === total;

    mount.innerHTML = `
      <div class="card wizard__card">
        <h2 class="section__title wizard__titulo-revision" id="wizard-skill">
          ${esc(config.reviewTitle ?? 'Revisa tus respuestas')}
        </h2>
        ${avisoDeOrigen()}

        <!-- La región desplazable ya no lleva tabindex fijo: ahora cada fila
             tiene un botón, así que tabular hasta él desplaza la tabla solo, y un
             tabindex permanente sumaba una parada inútil. sincronizarScrollables
             lo pone únicamente cuando la tabla de verdad desborda. -->
        <div class="table-wrap">
          <table class="table">
            <caption class="sr-only">Resumen de las respuestas antes de enviar</caption>
            <thead>
              <tr>
                <th scope="col">Habilidad</th>
                <th scope="col">Categoría</th>
                <th scope="col">Nivel elegido</th>
                <th scope="col"><span class="sr-only">Acción</span></th>
              </tr>
            </thead>
            <tbody>
              ${preguntas.map((skill, i) => {
                const nivel = state.respuestas[skill.id]?.nivel;
                return `
                <tr class="table__row">
                  <!-- Encabezado de fila: al recorrer la columna "Nivel elegido",
                       el lector anuncia de qué habilidad es cada nivel. -->
                  <th scope="row" class="wizard__fila-habilidad">${esc(String(skill.nombre).trim())}</th>
                  <td class="text-xs text-muted">${esc(CATEGORIA_LABEL[skill.tipo] ?? skill.tipo)}</td>
                  <!-- An unanswered row must not look like an answered one:
                       badge--info is the same neutral blue as a valid level. -->
                  <td><span class="badge ${nivel ? 'badge--info' : 'badge--warning'}">${
                    nivel ? esc(NIVEL_LABEL[nivel]) : 'Sin responder'}</span></td>
                  <!-- Ir directo a una pregunta. Sin esto, cambiar la tercera de
                       26 exigía pulsar "Atrás" 23 veces, que en una demo es lo
                       mismo que no poder cambiarla. -->
                  <td class="table__cell--tight"><button type="button"
                      class="btn btn--ghost btn--sm wizard__cambiar" data-cambiar="${i}"
                      aria-label="Cambiar ${esc(String(skill.nombre).trim())}">Cambiar</button></td>
                </tr>`; }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Fija abajo mientras se recorre la tabla. Con 26 filas el botón de
           enviar quedaba unos 1.600 px más abajo de donde se llega, y en una
           demo la única acción de la pantalla no se veía. El conteo al lado
           responde "¿está todo respondido?" sin recorrer 26 insignias.

           Sin «Atrás»: cada fila tiene su «Cambiar», que va directo a la
           pregunta. «Atrás» mandaba a la última pregunta, que es un caso
           particular de lo mismo y quitaba claridad a la acción principal. -->
      <div class="wizard__nav wizard__nav--fija">
        <span class="wizard__conteo${completas ? '' : ' wizard__conteo--incompleto'}">
          <strong class="numeric">${respondidas} de ${total}</strong> respondidas
        </span>
        <button type="button" class="btn btn--primary" id="wizard-submit">${
          config.origenRespuestas === 'enviada' ? 'Reenviar evaluación' : 'Enviar evaluación'}</button>
      </div>`;

    sincronizarScrollables(mount);

    mount.querySelectorAll('[data-cambiar]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.cambiar);
        state.indice = i;
        state.filaOrigen = i;
        state.valorPrevio = state.respuestas[preguntas[i].id];
        state.step = 'pregunta';
        state.desdeRevision = true;
        render();
        focusHeading();
      });
    });

    mount.querySelector('#wizard-submit').addEventListener('click', (event) => enviar(event.currentTarget));
  }

  /** Dice de dónde salen las respuestas que se están revisando: lo ya enviado
   *  o un borrador propio. */
  function avisoDeOrigen() {
    const textos = {
      enviada: conCambios
        ? `<strong>Ya enviaste esta evaluación y tienes cambios sin enviar.</strong>
           Si la reenvías, la nueva versión reemplaza a la anterior.`
        : `<strong>Ya enviaste esta evaluación.</strong> Estas son tus respuestas. Si cambias
           alguna y la reenvías, la nueva versión reemplaza a la anterior.`,
      borrador: 'Retomaste donde ibas. Todavía no se ha enviado nada.',
    };
    const texto = textos[origen] ?? 'Todavía no se ha enviado nada. Revisa y cambia lo que quieras antes de enviar.';
    // Ícono de información, no de alerta: el aviso es informativo y el callout
    // es el azul neutro. Un signo de exclamación lo leía como advertencia.
    return origen === 'enviada'
      ? `<div class="callout wizard__aviso">${icon('info')}<span><span class="sr-only">Aviso: </span>${texto}</span></div>`
      : `<p class="section__note wizard__aviso">${texto}</p>`;
  }

  async function enviar(button) {
    // Defensive: the Next button stays disabled until the current question is
    // answered, so reaching review with gaps should be unreachable. If it ever
    // becomes reachable, say WHICH question rather than just how many.
    const sinResponder = preguntas.filter((p) => !state.respuestas[p.id]);
    if (sinResponder.length) {
      const primera = preguntas.indexOf(sinResponder[0]) + 1;
      toast(sinResponder.length === 1
        ? `Falta 1 respuesta: la pregunta ${primera}. Usa «Cambiar» en esa fila para completarla.`
        : `Faltan ${sinResponder.length} respuestas, empezando por la pregunta ${primera}.`, 'error');
      return;
    }

    // Mientras se envía, los «Cambiar» quedan inactivos. withBusy solo protege
    // el botón de enviar; con un backend real, tocar «Cambiar» a mitad del envío
    // re-renderizaba la pantalla y el resultado aparecía sobre la vista equivocada.
    const otros = [...mount.querySelectorAll('button')].filter((b) => b !== button);
    otros.forEach((b) => { b.disabled = true; });

    try {
      const guardar = config.guardar
        ?? (async (payload) => (await import('./api.js')).enviarEvaluacion(payload));
      const data = await withBusy(button, () => guardar({
        evaluadoId: evaluado.id,
        evaluadorNombre: evaluador.nombre,
        rolEvaluador,
        tipoEvaluacion,
        skills: preguntas.map((skill) => ({
          skill_id: skill.id,
          puntaje: state.respuestas[skill.id].puntaje,
        })),
      }), { label: 'Enviando…' });

      clearDraft();
      state.step = 'done';
      renderDone(data?.registros_creados ?? preguntas.length);
      config.onFinish?.();
    } catch (error) {
      otros.forEach((b) => { b.disabled = false; });
      // The draft is intact, so retrying costs nothing — say so, because the
      // PoC's "Error al enviar" left people wondering if they had lost an hour.
      // El motivo del servidor dice si reintentar sirve («la ronda se cerró» no
      // se arregla reintentando). La sesión vencida ya la atiende la carcasa.
      if (error?.codigo !== 'sesion') {
        toast(
          error?.codigo === 'ronda'
            ? 'La ronda se cerró antes de enviar. Tus respuestas quedaron en este navegador; habla con el equipo de Personas.'
            : error?.message
              ? `No se pudo enviar: ${error.message} Tus respuestas siguen guardadas.`
              : 'No se pudo enviar. Tus respuestas siguen guardadas; intenta de nuevo.',
          'error',
        );
      }
      console.error(error);
    }
  }

  function renderDone(registros) {
    mount.innerHTML = `
      <div class="card">
        <div class="state">
          <span class="state__icon" style="color:var(--color-success-text)">
            ${icon('check', { size: 32 })}
          </span>
          <p class="state__title">Evaluación enviada</p>
          <p class="state__body">
            ${config.mensajeFinal
              ? esc(config.mensajeFinal(registros))
              : `Se guardaron ${registros} respuestas${
                  rolEvaluador === 'Employee' ? '' : ` sobre ${esc(evaluado.nombre)}`}.
                 Gracias por tomarte el tiempo.`}
          </p>
          <div class="btn-group" id="wizard-done-actions" style="justify-content:center;margin-top:var(--space-2xs)"></div>
        </div>
      </div>`;
    focusHeading();
  }

  /** Move focus to the new heading after a step change so keyboard and screen
   *  reader users land on the new content instead of staying where the old
   *  button used to be. */
  function focusHeading() {
    const heading = mount.querySelector('#wizard-skill') ?? mount.querySelector('.state__title');
    if (!heading) return;
    heading.setAttribute('tabindex', '-1');
    heading.focus();
  }

  return {
    get doneActions() { return mount.querySelector('#wizard-done-actions'); },
  };
}
