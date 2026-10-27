/* =========================================================================
   PLAN DE DESARROLLO — lo único que sale de la herramienta
   =========================================================================
   Tres campos: título, objetivo y plan propuesto. Nada de fechas, entregables
   ni estados, y no por falta de tiempo: el seguimiento de un plan no ocurre en
   este portal y registrarlo acá crearía una segunda verdad que nadie mantiene.
   La pantalla lo dice en voz alta, porque una herramienta que parece de
   seguimiento se usa como tal.

   Por eso lo accionable es la salida: imprimir a PDF o descargar en texto, para
   llevar el plan al proceso donde de verdad se hace seguimiento.

   El borrador se propone a partir de las brechas reales de la persona, no de su
   promedio más bajo. Es una propuesta editable, nunca algo que se envía solo.
   ========================================================================= */

import {
  esc, icon, toast, emptyState, setFieldError, clearFieldErrors, withBusy,
} from '../lib/ui.js';
import {
  persona, cargo, perfil, planesDe, guardarPlan, borrarPlan,
  rolDeEvaluacion, ronda, CATEGORIAS,
} from '../lib/almacen.js';

export function vistaPlan({ sesion, params }) {
  const p = persona(params.id);
  if (!p) return { html: emptyState({ title: 'Esa persona no existe' }) };

  const propio = p.id === sesion.persona.id;
  const esSuLider = rolDeEvaluacion(sesion.persona.id, p.id) === 'Leader';
  if (!propio && !esSuLider) {
    return {
      html: emptyState({
        title: `No puedes ver los planes de ${p.nombre}`,
        body: 'Solo esa persona y su líder directo tienen acceso.',
        glyph: 'lock',
      }),
    };
  }

  const pf = perfil(p.id);
  const puedeEditar = esSuLider;
  // Estado local de la pantalla: qué plan se está editando, o 'nuevo'.
  let editando = null;

  const render = () => `
    ${bloqueAviso()}
    ${bloqueLista(p, puedeEditar)}
    ${puedeEditar ? bloqueFormulario(p, pf, editando) : ''}
    ${bloqueImprimible(p, pf)}
  `;

  return {
    html: `
      <div class="page-header">
        <a class="task-link" href="${propio ? '#/mi-desarrollo' : `#/persona/${esc(p.id)}`}"
           style="padding-inline:0;margin-bottom:var(--space-2xs)">
          ${icon('chevronRight', { className: 'rotate-180' })} Volver
        </a>
        <h1 class="page-header__title">Plan de desarrollo</h1>
        <p class="page-header__lede">
          ${esc(p.nombre)} · ${esc(cargo(p.cargo_id)?.nombre ?? '')}
        </p>
      </div>
      <div id="zona-plan">${render()}</div>
    `,

    montado(raiz) {
      const zona = raiz.querySelector('#zona-plan');

      const refrescar = () => { zona.innerHTML = render(); conectar(); };

      function conectar() {
        // --- guardar ------------------------------------------------------
        zona.querySelector('[data-guardar]')?.addEventListener('click', async (ev) => {
          const boton = ev.currentTarget;
          const titulo = zona.querySelector('#pl-titulo');
          const objetivo = zona.querySelector('#pl-objetivo');
          const propuesta = zona.querySelector('#pl-propuesta');

          clearFieldErrors(zona);
          let falla = false;
          if (!titulo.value.trim()) {
            setFieldError(titulo, 'Ponle un título: es lo que identifica el plan en el otro proceso.');
            falla = true;
          }
          if (!propuesta.value.trim()) {
            setFieldError(propuesta, 'Describe el plan propuesto. Sin esto no hay nada que llevar.');
            falla = true;
          }
          if (falla) {
            zona.querySelector('[aria-invalid="true"]')?.focus();
            return;
          }

          try {
            await withBusy(boton, () => guardarPlan({
              id: editando && editando !== 'nuevo' ? editando : null,
              personaId: p.id,
              titulo: titulo.value.trim(),
              objetivo: objetivo.value.trim(),
              propuesta: propuesta.value.trim(),
              skillIds: [...zona.querySelectorAll('[data-skill]:checked')].map((c) => c.dataset.skill),
            }));
          } catch (e) {
            toast(`No se guardó el plan: ${e.message}`, 'error');
            return;
          }

          const eraNuevo = !editando || editando === 'nuevo';
          editando = null;
          refrescar();
          toast(eraNuevo
            ? 'Plan guardado. Ya puedes descargarlo o imprimirlo.'
            : 'Plan actualizado.', 'success');
        });

        // --- cancelar / nuevo / editar / borrar ---------------------------
        zona.querySelector('[data-cancelar]')?.addEventListener('click', () => {
          editando = null; refrescar();
        });
        zona.querySelector('[data-nuevo]')?.addEventListener('click', () => {
          editando = 'nuevo'; refrescar();
          zona.querySelector('#pl-titulo')?.focus();
        });
        zona.querySelectorAll('[data-editar]').forEach((b) => {
          b.addEventListener('click', () => {
            editando = b.dataset.editar; refrescar();
            zona.querySelector('#pl-titulo')?.focus();
          });
        });
        zona.querySelectorAll('[data-borrar]').forEach((b) => {
          b.addEventListener('click', async () => {
            try {
              await withBusy(b, () => borrarPlan(b.dataset.borrar));
            } catch (e) {
              toast(`No se eliminó el plan: ${e.message}`, 'error');
              return;
            }
            refrescar();
            toast('Plan eliminado.', 'success');
          });
        });

        // --- salidas ------------------------------------------------------
        zona.querySelector('[data-imprimir]')?.addEventListener('click', () => {
          window.print();
        });
        zona.querySelector('[data-texto]')?.addEventListener('click', () => {
          descargarTexto(p, pf);
        });
      }

      conectar();
    },
  };
}

/* -------------------------------------------------------------------- aviso */

function bloqueAviso() {
  return `
    <div class="callout" style="margin-bottom:var(--space-md)">
      ${icon('info')}
      <span>
        <strong>El seguimiento del plan no ocurre en este portal.</strong>
        El portal recolecta la información y evalúa; el plan se escribe acá para tener
        la conversación con el dato a la vista, pero las fechas, los responsables y el
        avance se manejan en el proceso de cada equipo. Lo que sale de acá es el
        documento: imprímelo o descárgalo y llévalo a donde el seguimiento ocurra.
      </span>
    </div>`;
}

/* -------------------------------------------------------------------- lista */

function bloqueLista(p, puedeEditar) {
  const planes = planesDe(p.id);

  if (!planes.length) {
    return `
      <section class="section" aria-labelledby="t-planes">
        <div class="section__head">
          <h2 class="section__title" id="t-planes">Planes propuestos</h2>
        </div>
        ${emptyState({
          title: 'Todavía no hay ningún plan',
          body: puedeEditar
            ? 'Abajo hay un borrador armado con las brechas reales de esta persona. '
            + 'Puedes cambiarlo por completo antes de guardarlo.'
            : 'Cuando tu líder proponga un plan lo verás acá, y podrás descargarlo.',
          glyph: 'clipboard',
        })}
      </section>`;
  }

  return `
    <section class="section" aria-labelledby="t-planes">
      <div class="section__head">
        <h2 class="section__title" id="t-planes">
          Planes propuestos <span class="badge badge--neutral">${planes.length}</span>
        </h2>
        ${puedeEditar
          ? '<button type="button" class="btn btn--secondary btn--sm" data-nuevo>Agregar otro</button>'
          : ''}
      </div>
      <div class="btn-group" style="margin-bottom:var(--space-2xs)">
        <button type="button" class="btn btn--primary btn--sm" data-imprimir>
          ${icon('externalLink')} Imprimir o guardar como PDF
        </button>
        <button type="button" class="btn btn--secondary btn--sm" data-texto>
          Descargar en texto
        </button>
      </div>
      ${planes.map((pl) => `
        <div class="plan">
          <div class="plan__head">
            <h3 class="plan__title">${esc(pl.titulo)}</h3>
            ${puedeEditar ? `
              <div class="btn-group">
                <button type="button" class="btn btn--ghost btn--sm" data-editar="${esc(pl.id)}">Editar</button>
                <button type="button" class="btn btn--ghost btn--sm" data-borrar="${esc(pl.id)}">Eliminar</button>
              </div>` : ''}
          </div>
          ${pl.objetivo ? `
            <p class="label-micro">Objetivo</p>
            <p class="text-sm" style="max-width:70ch">${esc(pl.objetivo)}</p>` : ''}
          <p class="label-micro" style="margin-top:var(--space-2xs)">Plan propuesto</p>
          <p class="text-sm" style="max-width:70ch;white-space:pre-wrap">${esc(pl.propuesta)}</p>
          ${pl.skill_ids?.length ? `
            <div class="plan__chips" style="margin-top:var(--space-2xs)">
              ${pl.skill_ids.map((sid) => chipHabilidad(p.id, sid)).join('')}
            </div>` : ''}
          <p class="plan__meta">Propuesto por ${esc(pl.autor)}</p>
        </div>`).join('')}
    </section>`;
}

function chipHabilidad(personaId, skillId) {
  const h = perfil(personaId)?.habilidades.find((x) => x.skill_id === skillId);
  if (!h) return '';
  return `<span class="badge badge--info">${esc(h.nombre)}</span>`;
}

/* --------------------------------------------------------------- formulario */

function bloqueFormulario(p, pf, editando) {
  const planes = planesDe(p.id);
  if (planes.length && !editando) return '';

  const enEdicion = editando && editando !== 'nuevo'
    ? planes.find((x) => x.id === editando) : null;

  const brechas = pf.prioridades.slice(0, 3);
  const sugerido = enEdicion ? null : sugerencia(p, brechas);

  const valor = enEdicion ?? sugerido ?? { titulo: '', objetivo: '', propuesta: '', skill_ids: [] };
  const marcadas = new Set(valor.skill_ids ?? []);

  return `
    <section class="section" aria-labelledby="t-form">
      <div class="section__head">
        <h2 class="section__title" id="t-form">
          ${enEdicion ? 'Editar el plan' : 'Proponer un plan'}
        </h2>
      </div>
      ${!enEdicion && brechas.length ? `
        <p class="section__note">
          El borrador sale de las ${brechas.length === 1 ? 'brecha' : `${brechas.length} brechas`}
          más profundas de ${esc(p.nombre.split(' ')[0])} frente al nivel que su cargo espera.
          Cámbialo con confianza: es un punto de partida, no una recomendación del sistema.
        </p>` : ''}

      <div class="card">
        <div class="field">
          <label class="field__label" for="pl-titulo">
            Título <span class="field__required">(obligatorio)</span>
          </label>
          <input class="input" id="pl-titulo" type="text" maxlength="120"
                 value="${esc(valor.titulo)}"
                 placeholder="Ej. Cerrar la brecha en arquitectura de automatización">
          <p class="field__hint">Es lo que identifica el plan cuando salga de acá.</p>
        </div>

        <div class="field">
          <label class="field__label" for="pl-objetivo">Objetivo</label>
          <textarea class="textarea" id="pl-objetivo" rows="3" maxlength="600"
                    placeholder="Qué debería ser distinto cuando el plan termine.">${esc(valor.objetivo)}</textarea>
          <p class="field__hint">Una frase basta. En qué cambia el nivel de la persona, no qué actividades hará.</p>
        </div>

        <div class="field">
          <label class="field__label" for="pl-propuesta">
            Plan propuesto <span class="field__required">(obligatorio)</span>
          </label>
          <textarea class="textarea" id="pl-propuesta" rows="8" maxlength="4000"
                    placeholder="Qué se propone hacer. Sin fechas: eso se define en el proceso del equipo.">${esc(valor.propuesta)}</textarea>
          <p class="field__hint">
            Sin fechas ni responsables: eso se acuerda por fuera. Acá va el contenido del plan.
          </p>
        </div>

        ${pf.habilidades.length ? `
          <div class="field">
            <span class="field__label" id="pl-skills-label">Habilidades relacionadas</span>
            <p class="field__hint">Para que quien reciba el plan sepa contra qué se está midiendo.</p>
            <div class="picker" role="group" aria-labelledby="pl-skills-label">
              ${CATEGORIAS.map(({ key, label }) => {
                const del = pf.habilidades.filter((h) => h.tipo === key);
                if (!del.length) return '';
                return `
                  <p class="picker__group">${esc(label)}</p>
                  ${del.map((h) => `
                    <label class="picker__item">
                      <input type="checkbox" data-skill="${esc(h.skill_id)}"
                             ${marcadas.has(h.skill_id) ? 'checked' : ''}>
                      <span>${esc(h.nombre)}
                        ${h.severidad === 'brecha-critica' || h.severidad === 'brecha-leve'
                          ? `<span class="badge badge--warning">${h.severidad === 'brecha-critica'
                              ? 'brecha crítica' : 'brecha'}</span>` : ''}
                      </span>
                    </label>`).join('')}`;
              }).join('')}
            </div>
          </div>` : ''}

        <div class="btn-group">
          <button type="button" class="btn btn--primary" data-guardar>
            ${enEdicion ? 'Guardar cambios' : 'Guardar el plan'}
          </button>
          ${editando ? '<button type="button" class="btn btn--ghost" data-cancelar>Cancelar</button>' : ''}
        </div>
      </div>
    </section>`;
}

/**
 * Borrador a partir de las brechas reales. Deliberadamente escueto: un texto
 * largo generado se lee como definitivo y nadie lo cambia.
 */
function sugerencia(p, brechas) {
  if (!brechas.length) {
    return {
      titulo: `Plan de crecimiento · ${p.nombre}`,
      objetivo: 'Subir de nivel en habilidades que ya cumple, o asumir habilidades de un cargo posterior.',
      propuesta: 'No hay brechas frente al nivel esperado del cargo, así que el plan no es de '
               + 'remediación. Definir con la persona en qué habilidad quiere profundizar y qué '
               + 'trabajo real lo haría posible.',
      skill_ids: [],
    };
  }

  const nombres = brechas.map((h) => h.nombre);
  return {
    titulo: `Cerrar brechas en ${nombres[0]}`,
    objetivo: `Llevar ${nombres.length === 1 ? nombres[0] : 'estas habilidades'} al nivel que `
            + 'el cargo espera.',
    propuesta: brechas.map((h) =>
      `${h.nombre} (${etiqueta(h.tipo)})\n`
      + `  Hoy: ${h.nivel_label ?? 'sin evaluar'} · Se espera: ${h.nivel_esperado_label}\n`
      + `  ${h.niveles?.[h.nivel_esperado] ? `Alcanzar ese nivel significa: ${h.niveles[h.nivel_esperado]}` : ''}`,
    ).join('\n\n'),
    skill_ids: brechas.map((h) => h.skill_id),
  };
}

/* --------------------------------------------------------------- salidas */

/**
 * Bloque que solo existe al imprimir. Se arma en el DOM en lugar de abrir otra
 * ventana: un `window.open` lo bloquea cualquier navegador con el bloqueador de
 * popups puesto, y ahí la única salida de la herramienta dejaría de funcionar.
 */
function bloqueImprimible(p, pf) {
  const planes = planesDe(p.id);
  if (!planes.length) return '';

  return `
    <div class="solo-impresion" aria-hidden="true">
      <h1>Plan de desarrollo</h1>
      <p><b>${esc(p.nombre)}</b> · ${esc(cargo(p.cargo_id)?.nombre ?? '')} · ${esc(p.area)}</p>
      <p>Ronda ${esc(ronda()?.nombre ?? '')} · Puntaje total ${
        pf.perfil_total === null ? '—' : pf.perfil_total.toFixed(1)} (${esc(pf.nivel_es ?? '')})${
        pf.cumplimiento ? ` · ${pf.cumplimiento.cumple} de ${pf.cumplimiento.total} habilidades en su nivel esperado` : ''}</p>
      <p><i>Documento de apoyo. Las fechas, los responsables y el seguimiento se
      definen en el proceso de cada equipo.</i></p>
      <hr>
      ${planes.map((pl) => `
        <h2>${esc(pl.titulo)}</h2>
        ${pl.objetivo ? `<h3>Objetivo</h3><p>${esc(pl.objetivo)}</p>` : ''}
        <h3>Plan propuesto</h3>
        <p style="white-space:pre-wrap">${esc(pl.propuesta)}</p>
        ${pl.skill_ids?.length ? `
          <h3>Habilidades relacionadas</h3>
          <ul>${pl.skill_ids.map((sid) => {
            const h = pf.habilidades.find((x) => x.skill_id === sid);
            return h ? `<li>${esc(h.nombre)} — hoy ${esc(h.nivel_label ?? 'sin evaluar')}, se espera ${
              esc(h.nivel_esperado_label)}</li>` : '';
          }).join('')}</ul>` : ''}
        <p><small>Propuesto por ${esc(pl.autor)}</small></p>`).join('<hr>')}
    </div>`;
}

function descargarTexto(p, pf) {
  const planes = planesDe(p.id);
  const lineas = [
    'PLAN DE DESARROLLO',
    '',
    `Persona:  ${p.nombre}`,
    `Cargo:    ${cargo(p.cargo_id)?.nombre ?? '—'}`,
    `Área:     ${p.area}`,
    `Ronda:    ${ronda()?.nombre ?? '—'}`,
    `Puntaje:  ${pf.perfil_total === null ? '—' : pf.perfil_total.toFixed(1)} (${pf.nivel_es ?? '—'})`
      + (pf.cumplimiento
        ? ` — ${pf.cumplimiento.cumple} de ${pf.cumplimiento.total} habilidades en su nivel esperado`
        : ''),
    '',
    'Documento de apoyo. Las fechas, los responsables y el seguimiento se definen',
    'en el proceso de cada equipo.',
    '',
  ];

  planes.forEach((pl, i) => {
    lineas.push('='.repeat(72), pl.titulo.toUpperCase(), '='.repeat(72), '');
    if (pl.objetivo) lineas.push('OBJETIVO', pl.objetivo, '');
    lineas.push('PLAN PROPUESTO', pl.propuesta, '');
    if (pl.skill_ids?.length) {
      lineas.push('HABILIDADES RELACIONADAS');
      pl.skill_ids.forEach((sid) => {
        const h = pf.habilidades.find((x) => x.skill_id === sid);
        if (h) {
          lineas.push(`  - ${h.nombre}: hoy ${h.nivel_label ?? 'sin evaluar'}, `
                    + `se espera ${h.nivel_esperado_label}`);
        }
      });
      lineas.push('');
    }
    lineas.push(`Propuesto por ${pl.autor}`, '');
    if (i < planes.length - 1) lineas.push('');
  });

  const blob = new Blob([lineas.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `plan-desarrollo-${p.id}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Se libera en el siguiente turno: revocarlo de inmediato cancela la descarga
  // en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  toast('Descargado en texto.', 'success');
}

const etiqueta = (t) => (CATEGORIAS.find((c) => c.key === t)?.label ?? t ?? '');
