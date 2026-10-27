/* =========================================================================
   EVALUAR — el formulario, una habilidad a la vez
   =========================================================================
   El rol NO se elige: se deduce de la relación entre quien está en sesión y la
   persona evaluada. Uno mismo es Employee, un reporte directo es Leader, un par
   asignado es Peer. Cualquier otra combinación no tiene permiso, igual que
   decide el servidor.

   El asistente es el mismo componente de las pantallas anteriores: borrador que
   sobrevive al cierre de la pestaña, grupo de radios real con navegación por
   flechas, y progreso que se actualiza al responder y no al avanzar. Lo único
   que cambia es a dónde va el envío.
   ========================================================================= */

import { esc, icon, emptyState, toast } from '../lib/ui.js';
import { startWizard } from '../lib/wizard.js';
import {
  persona, cargo, skill, rolDeEvaluacion, guardarEvaluacion, pendientes, ronda,
  respuestasEnviadas,
} from '../lib/almacen.js';
import { ir } from '../lib/ruteo.js';

const ORDEN_TIPO = ['Funcion', 'Hard Skill', 'Soft Skill'];

const TEXTO_ROL = {
  Employee: {
    titulo: 'Tu autoevaluación',
    lede: 'Elige el nivel que mejor describe lo que haces hoy. Cada opción trae su '
        + 'definición: no elijas por la etiqueta, elige por la descripción.',
    revision: 'Revisa tu autoevaluación',
  },
  Leader: {
    titulo: (n) => `Evaluar a ${n}`,
    lede: 'Como líder directo. Califica lo que has observado, no lo que esperarías '
        + 'del cargo: el nivel esperado ya está en el modelo y se compara después.',
    revision: 'Revisa tu evaluación',
  },
  Peer: {
    titulo: (n) => `Evaluar a ${n} como par`,
    lede: 'Solo lo que has visto trabajando con esa persona. Si no tienes cómo '
        + 'juzgar una habilidad, elige el nivel más bajo que puedas sostener.',
    revision: 'Revisa tu evaluación',
  },
};

/** Las preguntas de una persona: exactamente las habilidades de su cargo. */
export function preguntasDe(personaId) {
  const p = persona(personaId);
  const c = cargo(p?.cargo_id);
  if (!c) return [];

  return ORDEN_TIPO.flatMap((tipo) => c.habilidades
    .map((h) => ({ s: skill(h.skill_id), nivel_esperado: h.nivel_esperado }))
    .filter(({ s }) => s && s.tipo === tipo && s.activa !== false)
    .map(({ s, nivel_esperado }) => ({ ...s, nivel_esperado })));
}

export function vistaEvaluar({ sesion, params }) {
  const evaluado = persona(params.id);
  if (!evaluado) return { html: emptyState({ title: 'Esa persona no existe' }) };

  const rol = rolDeEvaluacion(sesion.persona.id, evaluado.id);
  if (!rol) {
    return {
      html: emptyState({
        title: `No te corresponde evaluar a ${evaluado.nombre}`,
        body: 'Solo evalúas a tus reportes directos y a los pares que te asignaron. '
            + 'Si crees que falta una asignación, habla con el equipo de Personas.',
        glyph: 'lock',
      }),
    };
  }

  const preguntas = preguntasDe(evaluado.id);
  const texto = TEXTO_ROL[rol];

  if (!ronda()?.abierta) {
    return {
      html: emptyState({
        title: 'La ronda está cerrada',
        body: 'Ya no se pueden enviar ni cambiar evaluaciones. Si necesitas corregir algo, '
            + 'habla con el equipo de Personas.',
        glyph: 'lock',
      }),
    };
  }

  // Abrir una evaluación ya enviada muestra lo que se envió.
  const enviadas = respuestasEnviadas(evaluado.id, rol);
  const iniciales = enviadas;
  const origen = enviadas ? 'enviada' : null;
  const titulo = typeof texto.titulo === 'function' ? texto.titulo(evaluado.nombre) : texto.titulo;

  return {
    html: `
      <div class="page-header">
        <a class="task-link volver" href="#/">
          ${icon('chevronRight', { className: 'rotate-180' })} Volver al inicio
        </a>
        <h1 class="page-header__title">${esc(titulo)}</h1>
        <p class="page-header__lede">${esc(texto.lede)}</p>
        <p class="card__meta">
          ${esc(cargo(evaluado.cargo_id)?.nombre ?? '')} ·
          ${preguntas.length} ${preguntas.length === 1 ? 'habilidad' : 'habilidades'} ·
          Ronda ${esc(ronda()?.nombre ?? '')}
        </p>
      </div>

      <div class="wizard" id="asistente"></div>
    `,

    montado() {
      const w = startWizard({
        mountId: 'asistente',
        rolEvaluador: rol,
        tipoEvaluacion: rol === 'Peer' ? 'Interno' : null,
        evaluador: { id: sesion.persona.id, nombre: sesion.persona.nombre },
        evaluado,
        preguntas,
        reviewTitle: texto.revision,
        claveRonda: ronda()?.id ?? 'ronda',
        respuestasIniciales: iniciales,
        origenRespuestas: origen,

        // El servidor decide el rol por la relación; lo que se manda acá es
        // solo quién es evaluado y qué se respondió.
        guardar: async ({ evaluadoId, skills }) => {
          const respuestas = Object.fromEntries(skills.map((s) => [s.skill_id, s.puntaje]));
          const r = await guardarEvaluacion({ evaluadoId, respuestas });
          return { registros_creados: r.guardadas };
        },

        mensajeFinal: (n) => `Se registraron ${n} respuestas. Puedes volver a abrir esta `
          + 'evaluación y cambiarla mientras la ronda siga abierta.',

        onFinish: () => {
          toast('Evaluación enviada. Los promedios ya se actualizaron.', 'success');
          const acciones = w?.doneActions;
          if (!acciones) return;

          // Lo que hace que esto se sienta un producto y no una pantalla: el
          // cierre ofrece la siguiente tarea, no un enlace genérico al inicio.
          const siguiente = pendientes(sesion.persona.id)[0];
          acciones.innerHTML = `
            ${siguiente ? `
              <button type="button" class="btn btn--primary" data-siguiente="${esc(siguiente.ruta)}">
                ${esc(siguiente.titulo)}
              </button>` : ''}
            ${rol === 'Employee' ? `
              <button type="button" class="btn btn--secondary" data-ir="#/mi-desarrollo">
                Ver mi perfil
              </button>` : ''}
            ${/* Solo el líder puede abrir ese perfil. Ofrecérselo a un par sería
                  mandarlo a una pantalla que le va a negar el acceso, que es peor
                  que no ofrecer nada. */ ''}
            ${rol === 'Leader' ? `
              <button type="button" class="btn btn--secondary" data-ir="#/persona/${esc(evaluado.id)}">
                Ver el perfil de ${esc(evaluado.nombre.split(' ')[0])}
              </button>` : ''}
            <button type="button" class="btn btn--ghost" data-ir="#/">Volver al inicio</button>`;

          acciones.querySelectorAll('[data-siguiente],[data-ir]').forEach((b) => {
            b.addEventListener('click', () => ir(b.dataset.siguiente ?? b.dataset.ir));
          });
        },
      });
    },
  };
}
