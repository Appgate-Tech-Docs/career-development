/* =========================================================================
   CATÁLOGO — lo que administra el área de Personas
   =========================================================================
   El catálogo es el cimiento: si una habilidad no tiene descritos sus cuatro
   niveles, no se puede evaluar de forma comparable entre áreas. Por eso la
   pantalla marca las incompletas antes que cualquier otra cosa.

   Editar y crear funcionan de verdad dentro de la sesión: el cambio se ve en el
   catálogo y queda registrado en la auditoría, en el servidor.
   ========================================================================= */

import {
  esc, icon, toast, emptyState, bindModal, openModal, closeModal,
  setFieldError, clearFieldErrors, withBusy, sincronizarScrollables,
} from '../lib/ui.js';
import {
  catalogo, actualizarSkill, crearSkill, auditoria, NIVEL_ES, CATEGORIAS,
} from '../lib/almacen.js';
import { subnavAdmin, ACCIONES, campoLegible, cambioHtml } from './admin.js';

// Fuera de la vista: guardar repinta la pantalla, y los filtros tienen que sobrevivir.
const filtro = { texto: '', tipo: '', departamento: '', soloIncompletas: false };

const NIVELES = ['Basic', 'Intermediate', 'Advanced', 'Expert'];

export function vistaCatalogo({ sesion }) {

  const departamentos = [...new Set(catalogo().map((s) => s.departamento).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));

  const filtrar = () => catalogo().filter((s) => {
    if (filtro.tipo && s.tipo !== filtro.tipo) return false;
    if (filtro.departamento && s.departamento !== filtro.departamento) return false;
    if (filtro.soloIncompletas && completa(s)) return false;
    if (filtro.texto) {
      const t = filtro.texto.toLowerCase();
      if (!s.nombre.toLowerCase().includes(t)
        && !(s.descripcion ?? '').toLowerCase().includes(t)) return false;
    }
    return true;
  });

  const html = `
    ${subnavAdmin('#/admin/catalogo')}
    <div class="page-header">
      <h1 class="page-header__title">Catálogo de habilidades</h1>
      <p class="page-header__lede">
        Funciones del rol, hard skills y soft skills, cada una con la descripción de sus cuatro niveles.
      </p>
    </div>

    ${bloqueResumen()}

    <section class="section" aria-labelledby="t-lista">
      <div class="section__head">
        <h2 class="section__title" id="t-lista">Habilidades</h2>
        <button type="button" class="btn btn--primary btn--sm" data-crear>Agregar habilidad</button>
      </div>

      <div class="toolbar toolbar--filtros">
        <div class="field field--sin-margen toolbar__grow">
          <label class="field__label" for="f-texto">Buscar</label>
          <input class="input" id="f-texto" type="search" placeholder="Nombre o descripción" value="${esc(filtro.texto)}">
        </div>
        <div class="field field--sin-margen">
          <label class="field__label" for="f-tipo">Categoría</label>
          <select class="select" id="f-tipo">
            <option value="">Todas</option>
            ${CATEGORIAS.map((c) => `<option value="${esc(c.key)}" ${filtro.tipo === c.key ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}
          </select>
        </div>
        <div class="field field--sin-margen">
          <label class="field__label" for="f-dep">Departamento</label>
          <select class="select" id="f-dep">
            <option value="">Todos</option>
            ${departamentos.map((d) => `<option value="${esc(d)}" ${filtro.departamento === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}
          </select>
        </div>
        <label class="toolbar__check">
          <input type="checkbox" id="f-incompletas" ${filtro.soloIncompletas ? 'checked' : ''}>
          <span>Solo incompletas</span>
        </label>
      </div>

      <p class="section__note" id="conteo" role="status"></p>
      <div class="table-wrap table-wrap--sticky">
        <table class="table">
          <caption class="sr-only">
            Habilidades del catálogo con su categoría, departamento y si tienen los
            cuatro niveles descritos.
          </caption>
          <thead>
            <tr>
              <th scope="col">Habilidad</th>
              <th scope="col">Categoría</th>
              <th scope="col">Departamento</th>
              <th scope="col">Niveles</th>
              <th scope="col">Estado</th>
              <th scope="col"><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody id="tabla-skills"></tbody>
        </table>
      </div>
    </section>

    ${bloqueBitacora()}
    ${modalEditar()}
  `;

  return {
    html,
    montado(raiz) {
      const cuerpo = raiz.querySelector('#tabla-skills');
      const conteo = raiz.querySelector('#conteo');
      const modal = raiz.querySelector('#modal-skill');
      bindModal(modal);

      let editandoId = null;

      const pintar = () => {
        const lista = filtrar();
        conteo.textContent = lista.length === catalogo().length
          ? `${lista.length} habilidades.`
          : `${lista.length} de ${catalogo().length} habilidades.`;

        cuerpo.innerHTML = lista.length
          ? lista.map((s, i) => fila(s, i)).join('')
          : `<tr><td colspan="6">${esc('Ninguna habilidad coincide con el filtro.')}</td></tr>`;

        cuerpo.querySelectorAll('[data-ver]').forEach((b) => {
          b.addEventListener('click', () => {
            const destino = cuerpo.querySelector(`#${b.getAttribute('aria-controls')}`);
            const abierto = b.getAttribute('aria-expanded') === 'true';
            b.setAttribute('aria-expanded', String(!abierto));
            if (destino) destino.hidden = abierto;
          });
        });

        cuerpo.querySelectorAll('[data-editar]').forEach((b) => {
          b.addEventListener('click', () => abrir(b.dataset.editar));
        });

        cuerpo.querySelectorAll('[data-activa]').forEach((b) => {
          b.addEventListener('click', async () => {
            const s = catalogo().find((x) => x.id === b.dataset.activa);
            const activa = !s.activa;
            try {
              await withBusy(b, () => actualizarSkill(s.id, { activa }));
            } catch (e) {
              toast(`No se guardó el cambio: ${e.message}`, 'error');
              return;
            }
            toast(activa
              ? `«${s.nombre}» quedó activa: vuelve a aparecer en los formularios.`
              : `«${s.nombre}» quedó inactiva: no se preguntará en las próximas evaluaciones.`,
            'success');
          });
        });

        sincronizarScrollables(raiz);
      };

      function abrir(id) {
        editandoId = id;
        const s = id ? catalogo().find((x) => x.id === id) : null;
        clearFieldErrors(modal);

        modal.querySelector('#modal-titulo').textContent = s ? 'Editar habilidad' : 'Agregar habilidad';
        modal.querySelector('#sk-nombre').value = s?.nombre ?? '';
        modal.querySelector('#sk-tipo').value = s?.tipo ?? 'Funcion';
        modal.querySelector('#sk-dep').value = s?.departamento ?? '';
        modal.querySelector('#sk-desc').value = s?.descripcion ?? '';
        NIVELES.forEach((n) => {
          modal.querySelector(`#sk-${n}`).value = s?.niveles?.[n] ?? '';
        });
        openModal(modal, { focus: modal.querySelector('#sk-nombre') });
      }

      raiz.querySelector('[data-crear]').addEventListener('click', () => abrir(null));

      modal.querySelector('[data-guardar]').addEventListener('click', async (ev) => {
        const nombre = modal.querySelector('#sk-nombre');
        const desc = modal.querySelector('#sk-desc');
        clearFieldErrors(modal);

        let falla = false;
        if (!nombre.value.trim()) {
          setFieldError(nombre, 'La habilidad necesita un nombre.');
          falla = true;
        }
        // Los cuatro niveles son obligatorios y no por rigor formal: es lo que
        // hace comparable la calificación entre áreas.
        const faltan = NIVELES.filter((n) => !modal.querySelector(`#sk-${n}`).value.trim());
        if (faltan.length) {
          faltan.forEach((n) => setFieldError(modal.querySelector(`#sk-${n}`),
            'Sin este nivel descrito, la habilidad no se puede calificar de forma comparable.'));
          falla = true;
        }
        if (falla) {
          modal.querySelector('[aria-invalid="true"]')?.focus();
          return;
        }

        const datos = {
          nombre: nombre.value.trim(),
          tipo: modal.querySelector('#sk-tipo').value,
          departamento: modal.querySelector('#sk-dep').value.trim() || null,
          descripcion: desc.value.trim(),
          niveles: Object.fromEntries(
            NIVELES.map((n) => [n, modal.querySelector(`#sk-${n}`).value.trim()])),
        };

        try {
          await withBusy(ev.currentTarget, () => (editandoId
            ? actualizarSkill(editandoId, datos) : crearSkill(datos)));
        } catch (e) {
          toast(`No se guardó: ${e.message}`, 'error');
          return;
        }

        closeModal(modal);
        toast(editandoId
          ? `«${datos.nombre}» actualizada.`
          : `«${datos.nombre}» agregada al catálogo.`, 'success');
      });

      raiz.querySelector('#f-texto').addEventListener('input', (e) => {
        filtro.texto = e.target.value; pintar();
      });
      raiz.querySelector('#f-tipo').addEventListener('change', (e) => {
        filtro.tipo = e.target.value; pintar();
      });
      raiz.querySelector('#f-dep').addEventListener('change', (e) => {
        filtro.departamento = e.target.value; pintar();
      });
      raiz.querySelector('#f-incompletas').addEventListener('change', (e) => {
        filtro.soloIncompletas = e.target.checked; pintar();
      });

      pintar();
      refrescarBitacora(raiz);
    },
  };
}

/* -------------------------------------------------------------------------- */

const completa = (s) => NIVELES.every((n) => (s.niveles?.[n] ?? '').trim());

function bloqueResumen() {
  const todas = catalogo();
  const incompletas = todas.filter((s) => !completa(s)).length;
  const inactivas = todas.filter((s) => s.activa === false).length;

  return `
    <section class="section" aria-labelledby="t-res">
      <div class="section__head"><h2 class="section__title" id="t-res">Estado del catálogo</h2></div>
      <div class="kpi-grid">
        <div class="kpi kpi--accent">
          <span class="kpi__value">${todas.length}</span>
          <span class="kpi__label">Habilidades</span>
        </div>
        ${CATEGORIAS.map(({ key, label }) => `
          <div class="kpi">
            <span class="kpi__value">${todas.filter((s) => s.tipo === key).length}</span>
            <span class="kpi__label">${esc(label)}</span>
          </div>`).join('')}
        <div class="kpi">
          <span class="kpi__value">${incompletas}</span>
          <span class="kpi__label">Sin los cuatro niveles descritos</span>
        </div>
        <div class="kpi">
          <span class="kpi__value">${inactivas}</span>
          <span class="kpi__label">Inactivas</span>
        </div>
      </div>
    </section>`;
}

function fila(s, i) {
  const id = `sk-det-${i}`;
  const ok = completa(s);
  const faltan = NIVELES.filter((n) => !(s.niveles?.[n] ?? '').trim());

  return `
    <tr class="table__row${ok ? '' : ' table__row--atencion'}">
      <td>
        <b>${esc(s.nombre)}</b>
        ${s.descripcion ? `<span class="text-xs text-muted linea-aparte medida-corta">${
          esc(s.descripcion)}</span>` : ''}
      </td>
      <td class="text-xs text-muted">${esc(
        CATEGORIAS.find((c) => c.key === s.tipo)?.label ?? s.tipo)}</td>
      <td class="text-xs text-muted">${esc(s.departamento ?? 'Transversal')}</td>
      <td>
        <button type="button" class="btn btn--ghost btn--sm" data-ver
                aria-expanded="false" aria-controls="${id}">
          Ver los 4 niveles
        </button>
      </td>
      <td>
        ${s.activa === false ? '<span class="badge badge--neutral">Inactiva</span>' : ''}
        ${ok
          ? (s.activa === false ? '' : '<span class="badge badge--success">Completa</span>')
          : `<span class="badge badge--warning">Falta ${faltan.map((n) => NIVEL_ES[n]).join(', ')}</span>`}
      </td>
      <td>
        <div class="btn-group">
          <button type="button" class="btn btn--secondary btn--sm" data-editar="${esc(s.id)}">Editar</button>
          <button type="button" class="btn btn--ghost btn--sm" data-activa="${esc(s.id)}">
            ${s.activa === false ? 'Activar' : 'Desactivar'}
          </button>
        </div>
      </td>
    </tr>
    <tr class="table__detail" id="${id}" hidden>
      <td colspan="6">
        <div class="table__detail__inner">
          <div class="dl-rows">
            ${NIVELES.map((n) => `
              <div class="dl-row">
                <span class="dl-row__term"><b>${esc(NIVEL_ES[n])}</b></span>
                <span class="dl-row__values medida">${
                  (s.niveles?.[n] ?? '').trim()
                    ? esc(s.niveles[n])
                    : '<i class="text-muted">Sin describir. Mientras falte, esta habilidad no se puede calificar de forma comparable.</i>'}</span>
              </div>`).join('')}
          </div>
        </div>
      </td>
    </tr>`;
}

/* ------------------------------------------------------------------ bitácora */

function bloqueBitacora() {
  return `
    <section class="section" aria-labelledby="t-bit">
      <div class="section__head">
        <h2 class="section__title" id="t-bit">Últimos cambios al catálogo</h2>
        <a class="btn btn--ghost btn--sm" href="#/admin/auditoria">Toda la auditoría</a>
      </div>
      <div id="zona-bitacora"></div>
    </section>`;
}

async function refrescarBitacora(raiz) {
  const zona = raiz.querySelector('#zona-bitacora');
  if (!zona) return;
  zona.innerHTML = '<p class="text-sm text-muted">Cargando los últimos cambios…</p>';
  zona.setAttribute('aria-busy', 'true');
  let filas = [];
  try {
    filas = (await auditoria({ entidad: 'habilidad' }, 0, 20)).filas;
  } catch (e) {
    zona.removeAttribute('aria-busy');
    zona.innerHTML = `<p class="text-sm text-muted">No se pudieron leer los cambios: ${esc(e.message)}</p>
      <button type="button" class="btn btn--secondary btn--sm" data-reintentar>Reintentar</button>`;
    zona.querySelector('[data-reintentar]').addEventListener('click', () => refrescarBitacora(raiz));
    return;
  }
  zona.removeAttribute('aria-busy');

  zona.innerHTML = filas.length
    ? `<ul class="audit">${filas.map((b) => `
        <li class="audit__row">
          <div class="audit__head">
            <span class="audit__skill">${esc(b.entidad_nombre)}</span>
            <span class="audit__meta">${esc(ACCIONES[b.accion] ?? b.accion)}${b.campo ? ` · ${esc(campoLegible(b.campo))}` : ''} · ${esc(b.actor_nombre)} ·
              ${esc(new Date(b.ts).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }))}</span>
          </div>
          <p class="audit__change">${cambioHtml(b.campo, recortar(b.antes), recortar(b.despues))}</p>
        </li>`).join('')}</ul>`
    : emptyState({
      title: 'Todavía nadie ha cambiado el catálogo',
      body: 'Cuando alguien edite, agregue o desactive una habilidad, el cambio aparece acá.',
      glyph: 'clipboard',
    });
}

const recortar = (t) => {
  const s = String(t ?? '');
  return s.length > 140 ? `${s.slice(0, 140)}…` : s;
};

/* -------------------------------------------------------------------- modal */

function modalEditar() {
  return `
    <dialog class="modal modal--wide" id="modal-skill" aria-labelledby="modal-titulo">
      <div class="modal__body">
        <h2 class="modal__title" id="modal-titulo">Editar habilidad</h2>
        <p class="modal__lede">
          Los cuatro niveles son obligatorios. Sin ellos, dos líderes de áreas
          distintas califican la misma habilidad con criterios distintos, y los
          puntajes dejan de ser comparables.
        </p>
        <div class="modal__scroll">
          <div class="field">
            <label class="field__label" for="sk-nombre">
              Nombre <span class="field__required">(obligatorio)</span>
            </label>
            <input class="input" id="sk-nombre" type="text" maxlength="140">
          </div>
          <div class="field-row">
            <div class="field">
              <label class="field__label" for="sk-tipo">Categoría</label>
              <select class="select" id="sk-tipo">
                ${CATEGORIAS.map((c) => `<option value="${esc(c.key)}">${esc(c.label)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label class="field__label" for="sk-dep">Departamento</label>
              <input class="input" id="sk-dep" type="text" maxlength="60"
                     placeholder="Vacío = transversal">
              <p class="field__hint">Las soft skills suelen ir sin departamento.</p>
            </div>
          </div>
          <div class="field">
            <label class="field__label" for="sk-desc">Descripción general</label>
            <textarea class="textarea" id="sk-desc" rows="2" maxlength="600"></textarea>
          </div>
          ${NIVELES.map((n) => `
            <div class="field">
              <label class="field__label" for="sk-${n}">
                Nivel ${esc(NIVEL_ES[n])} <span class="field__required">(obligatorio)</span>
              </label>
              <textarea class="textarea" id="sk-${n}" rows="2" maxlength="800"></textarea>
            </div>`).join('')}
        </div>
        <div class="modal__actions">
          <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
          <button type="button" class="btn btn--primary" data-guardar>Guardar</button>
        </div>
      </div>
    </dialog>`;
}
