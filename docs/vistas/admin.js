/* =========================================================================
   ADMINISTRACIÓN — personas, equipos, cargos, pares, ronda y auditoría
   =========================================================================
   Solo llega acá quien está en la hoja Administradores, y aun así el menú no
   es la protección: cada acción la valida el servidor (admin.* en
   servidor/motor.ts) y queda en la auditoría con quién, cuándo, qué había
   antes y, si se escribió, por qué.

   OCULTAR NO ES BORRAR. Nada se elimina desde acá: ocultar saca un registro
   de todas las vistas pero lo conserva, y se deshace con el mismo interruptor.
   Desactivar a una persona además le impide entrar y corta su sesión abierta.

   Cada guardado recarga el dato completo, porque un cambio de equipo o de
   líder mueve lo que otras personas pueden ver. La carcasa repinta sin perder
   el lugar (resolver({conservar})), y los filtros y lo abierto de cada
   pantalla viven fuera de la vista para sobrevivir a ese repintado.
   ========================================================================= */

import {
  esc, icon, toast, emptyState, bindModal, openModal, closeModal,
  setFieldError, clearFieldErrors, withBusy, sincronizarScrollables,
} from '../lib/ui.js';
import {
  personas, persona, equipos, equipo, cargos, cargo, catalogo, skill,
  administracion, ronda, NIVEL_ES, CATEGORIAS,
  actualizar, crear, fijarNivelesEsperados, asignarPar,
  anularEvaluacion, auditoria, evaluacionesDe, usuarioId,
} from '../lib/almacen.js';
import { ir, selectorDe } from '../lib/ruteo.js';

const NIVELES = ['Basic', 'Intermediate', 'Advanced', 'Expert'];

/* -------------------------------------------------------------------------
   Piezas comunes
   ------------------------------------------------------------------------- */

const SECCIONES = [
  { href: '#/admin/personas', label: 'Personas' },
  { href: '#/admin/equipos', label: 'Equipos' },
  { href: '#/admin/cargos', label: 'Cargos' },
  { href: '#/admin/catalogo', label: 'Catálogo' },
  { href: '#/admin/pares', label: 'Pares y evaluaciones' },
  { href: '#/admin/ronda', label: 'Ronda y ajustes' },
  { href: '#/admin/auditoria', label: 'Auditoría' },
];

/** Las pestañas de administración. La usa también la vista de catálogo. */
export function subnavAdmin(actual) {
  return `
    <nav class="subnav" aria-label="Administración">
      ${SECCIONES.map((s) => `
        <a class="subnav__link" href="${s.href}" ${s.href === actual ? 'aria-current="page"' : ''}>${esc(s.label)}</a>`).join('')}
    </nav>`;
}

function cabecera(actual, titulo, lede) {
  return `
    ${subnavAdmin(actual)}
    <div class="page-header">
      <h1 class="page-header__title">${esc(titulo)}</h1>
      <p class="page-header__lede">${esc(lede)}</p>
    </div>`;
}

const nombreDe = (id) => (id ? persona(id)?.nombre ?? id : '');
const ordenNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/** Solo lo que se sale de lo normal: una fila sin marcas es una fila visible y activa. */
function estadoHtml(r, { femenino = false } = {}) {
  const o = femenino ? 'a' : 'o';
  return [
    r.admin ? '<span class="badge badge--info">Admin</span>' : '',
    r.activo === false ? `<span class="badge badge--warning">Inactiv${o}</span>` : '',
    r.oculto ? `<span class="badge badge--neutral">Ocult${o}</span>` : '',
  ].filter(Boolean).join(' ');
}

/** Lleva a la auditoría ya filtrada por un registro. */
const filtroAuditoria = { tipo: '', registro: '', actorId: '', texto: '', desde: '', hasta: '', pagina: 0 };
function verHistorial(tipo, id) {
  Object.assign(filtroAuditoria, { tipo, registro: `${tipo}|${id}`, actorId: '', texto: '', desde: '', hasta: '', pagina: 0 });
  ir('#/admin/auditoria');
}

/* -------------------------------------------------------------------------
   Formulario en un diálogo
   -------------------------------------------------------------------------
   Un solo componente para editar, crear y confirmar: los campos se describen
   y el formulario se arma. El motivo es opcional y viaja a la auditoría.

   Mientras guarda, el formulario queda bloqueado y el diálogo no se puede
   cerrar: cerrarlo a mitad de un guardado de varios segundos dejaba el
   resultado (o el error) sin nadie que lo viera. Al cerrar, el foco vuelve
   al control que lo abrió, aunque la pantalla se haya repintado debajo.
   ------------------------------------------------------------------------- */

let secuencia = 0;

/** Error con campo: el servidor o la validación local dicen qué campo falló. */
export class ErrorCampo extends Error {
  constructor(campo, mensaje) { super(mensaje); this.campo = campo; }
}

function campoHtml(c, valor, pre) {
  const id = `${pre}-${c.nombre}`;
  const ayuda = c.ayuda ? `<p class="field__hint" id="${id}-ayuda">${esc(c.ayuda)}</p>` : '';
  const desc = c.ayuda ? `aria-describedby="${id}-ayuda"` : '';
  const req = c.obligatorio ? ' <span class="field__required">(obligatorio)</span>' : '';
  const aria = `${desc} ${c.obligatorio ? 'aria-required="true"' : ''}`;
  if (c.tipo === 'check') {
    return `
      <div class="field">
        <label class="check">
          <input type="checkbox" id="${id}" data-campo="${c.nombre}" ${valor ? 'checked' : ''} ${c.deshabilitado ? 'disabled' : ''} ${desc}>
          <span>${esc(c.etiqueta)}</span>
        </label>
        ${ayuda}
      </div>`;
  }
  if (c.tipo === 'select') {
    return `
      <div class="field">
        <label class="field__label" for="${id}">${esc(c.etiqueta)}${req}</label>
        <select class="select" id="${id}" data-campo="${c.nombre}" ${aria}>
          ${c.opciones.map((o) => `<option value="${esc(o.valor)}" ${String(o.valor) === String(valor ?? '') ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
        </select>
        ${ayuda}
      </div>`;
  }
  if (c.tipo === 'area') {
    return `
      <div class="field">
        <label class="field__label" for="${id}">${esc(c.etiqueta)}${req}</label>
        <textarea class="textarea" id="${id}" data-campo="${c.nombre}" rows="${c.filas ?? 3}" maxlength="${c.max ?? 4000}" ${aria}>${esc(valor ?? '')}</textarea>
        ${ayuda}
      </div>`;
  }
  return `
    <div class="field">
      <label class="field__label" for="${id}">${esc(c.etiqueta)}${req}</label>
      <input class="input" id="${id}" data-campo="${c.nombre}" type="${c.tipo === 'correo' ? 'email' : c.tipo === 'fecha' ? 'date' : 'text'}"
             ${c.numerico ? 'inputmode="decimal"' : ''}
             maxlength="${c.max ?? 200}" value="${esc(valor ?? '')}" ${c.tipo === 'correo' ? 'autocomplete="off" spellcheck="false"' : ''} ${aria}>
      ${ayuda}
    </div>`;
}

/**
 * Abre un diálogo. `alGuardar(valores, motivo)` hace la llamada; si lanza, el
 * mensaje se muestra en el formulario (en el campo, si es un ErrorCampo) y el
 * diálogo sigue abierto con lo escrito.
 */
function abrirFormulario({
  titulo, lede = '', contenido = '', campos = [], valores = {}, conMotivo = true,
  motivoObligatorio = false, textoBoton = 'Guardar', peligro = false, alGuardar,
}) {
  const pre = `fm${++secuencia}`;
  const volverA = selectorDe(document.activeElement);
  let guardando = false;

  const d = document.createElement('dialog');
  d.className = 'modal modal--wide';
  d.setAttribute('aria-labelledby', `${pre}-titulo`);
  if (lede) d.setAttribute('aria-describedby', `${pre}-lede`);
  d.innerHTML = `
    <form class="modal__body" novalidate>
      <h2 class="modal__title" id="${pre}-titulo">${esc(titulo)}</h2>
      ${lede ? `<p class="modal__lede" id="${pre}-lede">${esc(lede)}</p>` : ''}
      <fieldset class="modal__campos">
        <legend class="sr-only">${esc(titulo)}</legend>
        <div class="modal__scroll">
          ${contenido}
          ${campos.map((c) => campoHtml(c, valores[c.nombre], pre)).join('')}
          ${conMotivo ? campoHtml({
            nombre: '__motivo', etiqueta: motivoObligatorio ? 'Motivo' : 'Motivo (opcional)', tipo: 'area', filas: 2, max: 500,
            obligatorio: motivoObligatorio,
            ayuda: 'Queda en la auditoría junto al cambio.',
          }, '', pre) : ''}
        </div>
      </fieldset>
      <p class="callout callout--danger form-error" role="alert"></p>
      <div class="modal__actions">
        <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
        <button type="submit" class="btn ${peligro ? 'btn--danger' : 'btn--primary'}">${esc(textoBoton)}</button>
      </div>
    </form>`;
  document.body.appendChild(d);
  bindModal(d);

  // Escape y el fondo no cierran mientras se guarda.
  d.addEventListener('cancel', (e) => { if (guardando) e.preventDefault(); });
  d.addEventListener('click', (e) => { if (guardando && e.target === d) e.stopImmediatePropagation(); }, true);
  d.addEventListener('close', () => {
    d.remove();
    const destino = volverA ? document.querySelector(volverA) : null;
    (destino ?? document.getElementById('contenido'))?.focus({ preventScroll: Boolean(destino) });
  });

  const form = d.querySelector('form');
  const error = form.querySelector('.form-error');
  const bloquear = (si) => {
    guardando = si;
    form.querySelector('fieldset').disabled = si;
    form.querySelector('[data-close]').disabled = si;
  };

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (guardando) return;
    clearFieldErrors(form);
    error.textContent = '';
    const leidos = {};
    let falla = null;
    for (const c of campos) {
      const control = form.querySelector(`[data-campo="${c.nombre}"]`);
      const v = c.tipo === 'check' ? control.checked : control.value.trim();
      if (c.obligatorio && !v) { setFieldError(control, 'Este campo es obligatorio.'); falla = falla ?? control; }
      if (c.numerico && v !== '' && !Number.isFinite(Number(v))) { setFieldError(control, 'Escribe un número.'); falla = falla ?? control; }
      leidos[c.nombre] = v;
    }
    // Todos los errores a la vez: corregir uno y descubrir el siguiente al
    // volver a enviar es una vuelta de más.
    const campoMotivo = conMotivo ? form.querySelector('[data-campo="__motivo"]') : null;
    const motivo = campoMotivo ? campoMotivo.value.trim() : '';
    if (motivoObligatorio && !motivo) {
      setFieldError(campoMotivo, 'Escribe el motivo: este cambio afecta a mucha gente y la auditoría debe explicarlo.');
      falla = falla ?? campoMotivo;
    }
    if (falla) { falla.focus(); return; }
    const boton = form.querySelector('[type=submit]');
    bloquear(true);
    try {
      await withBusy(boton, () => alGuardar(leidos, motivo), { label: 'Guardando…' });
      bloquear(false);
      closeModal(d);
    } catch (e) {
      bloquear(false);
      if (!d.isConnected) { toast(`No se guardó: ${e.message}`, 'error'); return; }
      const control = e.campo ? form.querySelector(`[data-campo="${e.campo}"]`) : null;
      if (control) { setFieldError(control, e.message); control.focus(); }
      else { error.textContent = e.message; boton.focus(); }
    }
  });

  openModal(d);
}

/** Solo los campos que cambiaron, para no auditar lo que nadie tocó. */
function diferencias(antes, despues) {
  const out = {};
  for (const [k, v] of Object.entries(despues)) {
    const a = antes[k];
    if (typeof v === 'boolean' ? Boolean(a) !== v : String(a ?? '') !== String(v ?? '')) out[k] = v;
  }
  return out;
}

const opcionesPersonas = (vacio, filtro = () => true) => [
  { valor: '', label: vacio },
  ...personas().filter((p) => p.activo !== false).filter(filtro).sort(ordenNombre).map((p) => ({ valor: p.id, label: p.nombre })),
];

/** El conteo de una lista filtrada se anuncia cuando la persona deja de escribir, no en cada tecla. */
function anunciarDespues(el, texto) {
  clearTimeout(el._espera);
  el._espera = setTimeout(() => { el.textContent = texto; }, 400);
}

/* =========================================================================
   PERSONAS
   ========================================================================= */

const filtroPersonas = { texto: '', equipo: '', estado: 'visibles' };

export function vistaAdminPersonas({ sesion }) {
  const html = `
    ${cabecera('#/admin/personas', 'Personas', 'Quién entra, en qué equipo está y con qué cargo se evalúa.')}
    <section class="section" aria-labelledby="t-personas">
      <div class="section__head">
        <h2 class="section__title" id="t-personas">Todas las personas</h2>
        <button type="button" class="btn btn--primary btn--sm" data-nueva>Agregar persona</button>
      </div>
      <div class="toolbar toolbar--filtros">
        <div class="field field--sin-margen toolbar__grow">
          <label class="field__label" for="fp-texto">Buscar</label>
          <input class="input" id="fp-texto" type="search" placeholder="Nombre o correo" value="${esc(filtroPersonas.texto)}">
        </div>
        <div class="field field--sin-margen">
          <label class="field__label" for="fp-equipo">Equipo</label>
          <select class="select" id="fp-equipo">
            <option value="">Todos</option>
            <option value="__sin" ${filtroPersonas.equipo === '__sin' ? 'selected' : ''}>Sin equipo</option>
            ${equipos().slice().sort(ordenNombre).map((e) => `<option value="${esc(e.id)}" ${filtroPersonas.equipo === e.id ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}
          </select>
        </div>
        <div class="field field--sin-margen">
          <label class="field__label" for="fp-estado">Estado</label>
          <select class="select" id="fp-estado">
            ${[['visibles', 'Visibles y activas'], ['ocultas', 'Ocultas'], ['inactivas', 'Inactivas'], ['todas', 'Todas']]
              .map(([v, l]) => `<option value="${v}" ${filtroPersonas.estado === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <p class="section__note" id="fp-conteo" role="status"></p>
      <div class="table-wrap table-wrap--sticky">
        <table class="table">
          <caption class="sr-only">Personas con su cargo, equipo, líder y estado.</caption>
          <thead><tr>
            <th scope="col">Persona</th><th scope="col">Equipo y líder</th><th scope="col">Estado</th>
            <th scope="col"><span class="sr-only">Acciones</span></th>
          </tr></thead>
          <tbody id="fp-cuerpo"></tbody>
        </table>
      </div>
    </section>`;

  return {
    html,
    montado(raiz) {
      const cuerpo = raiz.querySelector('#fp-cuerpo');
      const conteo = raiz.querySelector('#fp-conteo');
      const pintar = ({ anunciar = false } = {}) => {
        const t = filtroPersonas.texto.toLowerCase();
        const lista = personas().filter((p) => {
          if (t && !`${p.nombre} ${p.correo ?? ''}`.toLowerCase().includes(t)) return false;
          if (filtroPersonas.equipo === '__sin' && p.equipo_id) return false;
          if (filtroPersonas.equipo && filtroPersonas.equipo !== '__sin' && p.equipo_id !== filtroPersonas.equipo) return false;
          if (filtroPersonas.estado === 'visibles' && (p.oculto || p.activo === false)) return false;
          if (filtroPersonas.estado === 'ocultas' && !p.oculto) return false;
          if (filtroPersonas.estado === 'inactivas' && p.activo !== false) return false;
          return true;
        }).sort(ordenNombre);
        const texto = `${lista.length} de ${plural(personas().length, 'persona', 'personas')}.`;
        if (anunciar) anunciarDespues(conteo, texto); else conteo.textContent = texto;
        cuerpo.innerHTML = lista.length ? lista.map((p) => {
          const e = equipo(p.equipo_id);
          const c = cargo(p.cargo_id);
          return `
            <tr class="table__row">
              <th scope="row" class="table__rowhead">
                ${c ? `<a href="#/persona/${esc(p.id)}">${esc(p.nombre)}</a>` : esc(p.nombre)}
                <span class="linea-aparte text-xs text-muted">${esc(p.correo ?? '')}</span>
                <span class="linea-aparte text-xs text-muted">${esc(c?.nombre ?? 'Sin cargo')}</span>
              </th>
              <td class="text-sm">${e ? esc(e.nombre) : '<span class="text-muted">Sin equipo</span>'}
                ${p.lider_id ? `<span class="linea-aparte text-xs text-muted">Líder: ${esc(nombreDe(p.lider_id))}${e?.lider_interino_id ? ' (interino)' : ''}</span>` : ''}</td>
              <td>${estadoHtml(p, { femenino: true })}</td>
              <td class="acciones">
                <button type="button" class="btn btn--secondary btn--sm" data-editar="${esc(p.id)}">Editar<span class="sr-only"> a ${esc(p.nombre)}</span></button>
                <button type="button" class="btn btn--ghost btn--sm" data-historial="${esc(p.id)}">Historial<span class="sr-only"> de ${esc(p.nombre)}</span></button>
              </td>
            </tr>`;
        }).join('') : `<tr><td colspan="4">${emptyState({ title: 'Ninguna persona coincide con el filtro' })}</td></tr>`;

        cuerpo.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => editarPersona(persona(b.dataset.editar), sesion)));
        cuerpo.querySelectorAll('[data-historial]').forEach((b) => b.addEventListener('click', () => verHistorial('persona', b.dataset.historial)));
        sincronizarScrollables(raiz);
      };

      raiz.querySelector('#fp-texto').addEventListener('input', (e) => { filtroPersonas.texto = e.target.value; pintar({ anunciar: true }); });
      raiz.querySelector('#fp-equipo').addEventListener('change', (e) => { filtroPersonas.equipo = e.target.value; pintar(); });
      raiz.querySelector('#fp-estado').addEventListener('change', (e) => { filtroPersonas.estado = e.target.value; pintar(); });
      raiz.querySelector('[data-nueva]').addEventListener('click', () => editarPersona(null, sesion));
      pintar();
    },
  };
}

function camposPersona(p, sesion) {
  const propia = p?.id === sesion.persona.id;
  return [
    { nombre: 'nombre', etiqueta: 'Nombre', obligatorio: true },
    { nombre: 'correo', etiqueta: 'Correo', tipo: 'correo', obligatorio: true, ayuda: 'Es con el que entra: el código de ingreso llega acá.' },
    {
      nombre: 'cargo_id', etiqueta: 'Cargo', tipo: 'select',
      opciones: [{ valor: '', label: 'Sin cargo (no se evalúa)' }, ...cargos().slice().sort(ordenNombre).map((c) => ({ valor: c.id, label: `${c.nombre} · ${c.area}` }))],
      ayuda: 'Define qué habilidades se le evalúan y en qué nivel.',
    },
    {
      nombre: 'equipo_id', etiqueta: 'Equipo', tipo: 'select',
      opciones: [{ valor: '', label: 'Sin equipo' }, ...equipos().slice().sort(ordenNombre).map((e) => ({ valor: e.id, label: `${e.nombre} · líder: ${nombreDe(e.lider_id)}` }))],
      ayuda: 'Su líder es quien lidera este equipo (o el interino, si hay).',
    },
    { nombre: 'area', etiqueta: 'Área', max: 80 },
    { nombre: 'activo', etiqueta: 'Activa: puede entrar a la herramienta', tipo: 'check', deshabilitado: propia, ayuda: propia ? 'No puedes quitarte el acceso a ti mismo: pídeselo a otra persona que administre.' : 'Desactivar corta también su sesión abierta.' },
    { nombre: 'oculto', etiqueta: 'Oculta: no aparece en ninguna vista de líderes ni pares', tipo: 'check', ayuda: 'No borra nada: se deshace desmarcando.' },
    { nombre: 'admin', etiqueta: 'Administra la herramienta', tipo: 'check', deshabilitado: propia, ayuda: propia ? 'No puedes quitarte la administración a ti mismo: así nunca queda la herramienta sin nadie que la administre.' : 'Ve a toda la organización y puede cambiar cualquier registro.' },
  ];
}

function editarPersona(p, sesion) {
  abrirFormulario({
    titulo: p ? `Editar a ${p.nombre}` : 'Agregar persona',
    campos: camposPersona(p, sesion),
    valores: p ? { ...p, admin: Boolean(p.admin) } : { activo: true, oculto: false, admin: false },
    conMotivo: Boolean(p),
    async alGuardar(v, motivo) {
      // Persona y rol de administración en una sola llamada: el servidor
      // guarda todo o nada.
      if (!p) {
        await crear('persona', v);
        toast(`${v.nombre} quedó registrada. Ya puede entrar con su correo.`, 'success');
        return;
      }
      const cambios = diferencias({ ...p, admin: Boolean(p.admin) }, v);
      if (!Object.keys(cambios).length) { toast('No había cambios que guardar.', 'info'); return; }
      await actualizar('persona', p.id, cambios, motivo);
      toast(`Cambios guardados en ${v.nombre}.`, 'success');
    },
  });
}

/* =========================================================================
   EQUIPOS
   ========================================================================= */

export function vistaAdminEquipos() {
  const miembros = (id) => personas().filter((p) => p.equipo_id === id && p.activo !== false);
  const lista = equipos().slice().sort(ordenNombre);

  const html = `
    ${cabecera('#/admin/equipos', 'Equipos', 'Cada líder ve solo a los miembros de los equipos que lidera, como titular o como interino.')}
    <section class="section" aria-labelledby="t-equipos">
      <div class="section__head">
        <h2 class="section__title" id="t-equipos">Todos los equipos</h2>
        <button type="button" class="btn btn--primary btn--sm" data-nuevo>Agregar equipo</button>
      </div>
      <p class="section__note">${plural(lista.length, 'equipo', 'equipos')}.</p>
      <div class="table-wrap table-wrap--sticky">
        <table class="table">
          <caption class="sr-only">Equipos con su área, líder, líder interino, miembros y estado.</caption>
          <thead><tr>
            <th scope="col">Equipo</th><th scope="col">Líder</th><th scope="col">Miembros</th>
            <th scope="col">Estado</th><th scope="col"><span class="sr-only">Acciones</span></th>
          </tr></thead>
          <tbody>
            ${lista.length ? lista.map((e) => {
              const m = miembros(e.id);
              return `
              <tr class="table__row">
                <th scope="row" class="table__rowhead">${esc(e.nombre)}<span class="linea-aparte text-xs text-muted">${esc(e.area || '—')}</span></th>
                <td class="text-sm">${esc(nombreDe(e.lider_id) || '—')}
                  ${e.lider_interino_id ? `<span class="linea-aparte"><span class="badge badge--warning">Interino</span> ${esc(nombreDe(e.lider_interino_id))}</span>` : ''}</td>
                <td class="text-sm"><span class="numeric">${m.length}</span>
                  <span class="linea-aparte text-xs text-muted">${esc(m.slice(0, 3).map((p) => p.nombre.split(' ')[0]).join(', '))}${m.length > 3 ? '…' : ''}</span></td>
                <td>${estadoHtml(e)}</td>
                <td class="acciones">
                  <button type="button" class="btn btn--secondary btn--sm" data-editar="${esc(e.id)}">Editar<span class="sr-only"> ${esc(e.nombre)}</span></button>
                  <button type="button" class="btn btn--ghost btn--sm" data-historial="${esc(e.id)}">Historial<span class="sr-only"> de ${esc(e.nombre)}</span></button>
                </td>
              </tr>`;
            }).join('') : `<tr><td colspan="5">${emptyState({ title: 'Todavía no hay equipos' })}</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>`;

  return {
    html,
    montado(raiz) {
      raiz.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => editarEquipo(equipo(b.dataset.editar))));
      raiz.querySelectorAll('[data-historial]').forEach((b) => b.addEventListener('click', () => verHistorial('equipo', b.dataset.historial)));
      raiz.querySelector('[data-nuevo]').addEventListener('click', () => editarEquipo(null));
      sincronizarScrollables(raiz);
    },
  };
}

function editarEquipo(e) {
  // Quien es miembro del equipo no puede liderarlo: se vería a sí mismo como
  // reporte. El servidor lo rechaza igual; acá ni se ofrece.
  const noMiembro = (p) => !e || p.equipo_id !== e.id;
  abrirFormulario({
    titulo: e ? `Editar ${e.nombre}` : 'Agregar equipo',
    lede: e ? '' : 'Después, en Personas, asigna a cada miembro a este equipo.',
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre del equipo', obligatorio: true },
      { nombre: 'area', etiqueta: 'Área', max: 80 },
      { nombre: 'lider_id', etiqueta: 'Líder titular', tipo: 'select', obligatorio: true, opciones: opcionesPersonas('Elige una persona', noMiembro) },
      {
        nombre: 'lider_interino_id', etiqueta: 'Líder interino', tipo: 'select', opciones: opcionesPersonas('Sin interino', noMiembro),
        ayuda: 'Para una vacante o una ausencia: ve y evalúa al equipo mientras esté asignado. Al quitarlo, el acceso vuelve solo al titular.',
      },
      { nombre: 'oculto', etiqueta: 'Oculto: su líder deja de ver a este equipo', tipo: 'check' },
    ],
    valores: e ? { ...e } : { oculto: false },
    conMotivo: Boolean(e),
    async alGuardar(v, motivo) {
      if (!e) {
        await crear('equipo', v);
        toast(`Equipo «${v.nombre}» creado.`, 'success');
        return;
      }
      const cambios = diferencias(e, v);
      if (!Object.keys(cambios).length) { toast('No había cambios que guardar.', 'info'); return; }
      await actualizar('equipo', e.id, cambios, motivo);
      toast(`Cambios guardados en ${v.nombre}.`, 'success');
    },
  });
}

/* =========================================================================
   CARGOS — nombre, área y los niveles que cada cargo espera
   =========================================================================
   Los niveles se cambian en la tabla y se guardan juntos con un botón. Guardar
   en cada `change` del selector disparaba un guardado por cada flecha del
   teclado (en Windows, recorrer un select cerrado cambia su valor) y repintaba
   la pantalla debajo del foco.
   ========================================================================= */

const cargosAbiertos = new Set();
const pendientesCargo = new Map();   // cargoId → Map(skillId → nivel nuevo, '' = quitar)

export function vistaAdminCargos() {
  const lista = cargos().slice().sort((a, b) => a.area.localeCompare(b.area, 'es') || ordenNombre(a, b));
  const enUso = (id) => personas().filter((p) => p.cargo_id === id && p.activo !== false).length;

  const html = `
    ${cabecera('#/admin/cargos', 'Cargos', 'Qué habilidades se evalúan en cada cargo y en qué nivel se esperan.')}
    <section class="section" aria-labelledby="t-cargos">
      <div class="section__head">
        <h2 class="section__title" id="t-cargos">Todos los cargos</h2>
        <button type="button" class="btn btn--primary btn--sm" data-nuevo>Agregar cargo</button>
      </div>
      <p class="section__note">${plural(lista.length, 'cargo', 'cargos')}. Abre uno para ver y cambiar sus niveles esperados.</p>
      <div class="cargos">
        ${lista.map((c) => `
          <details class="cargo" data-cargo="${esc(c.id)}" ${cargosAbiertos.has(c.id) ? 'open' : ''}>
            <summary class="cargo__resumen">
              ${icon('chevronRight', { className: 'cargo__flecha' })}
              <span class="cargo__nombre"><b>${esc(c.nombre)}</b> <span class="text-xs text-muted">${esc(c.area)}</span></span>
              <span class="insignias">
                <span class="text-xs text-muted">${plural((c.habilidades_todas ?? c.habilidades).length, 'habilidad', 'habilidades')} · ${plural(enUso(c.id), 'persona', 'personas')}</span>
                ${c.oculto ? '<span class="badge badge--neutral">Oculto</span>' : ''}
              </span>
            </summary>
            <div class="cargo__cuerpo" data-cuerpo></div>
          </details>`).join('')}
      </div>
    </section>`;

  return {
    html,
    montado(raiz) {
      const pintarCuerpo = (det) => {
        const c = cargo(det.dataset.cargo);
        const pend = pendientesCargo.get(c.id) ?? new Map();
        pendientesCargo.set(c.id, pend);
        const actuales = c.habilidades_todas ?? c.habilidades;
        const filas = actuales
          .map((h) => ({ ...h, s: skill(h.skill_id) }))
          .sort((a, b) => (a.s?.tipo ?? '').localeCompare(b.s?.tipo ?? '') || (a.s?.nombre ?? '').localeCompare(b.s?.nombre ?? '', 'es'));
        const usadas = new Set(filas.map((f) => f.skill_id));
        const disponibles = catalogo().filter((s) => !usadas.has(s.id) && s.activa !== false && !s.oculto)
          .sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nombre.localeCompare(b.nombre, 'es'));
        const grupos = CATEGORIAS
          .map((cat) => ({ cat, lista: disponibles.filter((s) => s.tipo === cat.key) }))
          .filter((g) => g.lista.length);
        const n = pend.size;

        det.querySelector('[data-cuerpo]').innerHTML = `
          <div class="btn-group">
            <button type="button" class="btn btn--secondary btn--sm" data-editar-cargo="${esc(c.id)}">Editar cargo</button>
            <button type="button" class="btn btn--ghost btn--sm" data-historial-cargo="${esc(c.id)}">Historial</button>
          </div>
          <form class="toolbar cargo__agregar" data-agregar novalidate>
            <div class="field field--sin-margen toolbar__grow">
              <label class="field__label" for="ag-${esc(c.id)}">Agregar una habilidad</label>
              <select class="select" id="ag-${esc(c.id)}" data-skill-nueva>
                <option value="">Elige del catálogo</option>
                ${grupos.map((g) => `<optgroup label="${esc(g.cat.label)}">${g.lista
                  .map((s) => `<option value="${esc(s.id)}">${esc(s.nombre)}${s.departamento ? ` · ${esc(s.departamento)}` : ''}</option>`).join('')}</optgroup>`).join('')}
              </select>
            </div>
            <div class="field field--sin-margen">
              <label class="field__label" for="agn-${esc(c.id)}">Nivel esperado</label>
              <select class="select" id="agn-${esc(c.id)}" data-nivel-nuevo>
                ${NIVELES.map((nv) => `<option value="${nv}">${esc(NIVEL_ES[nv])}</option>`).join('')}
              </select>
            </div>
            <button type="submit" class="btn btn--secondary" data-agregar-boton="${esc(c.id)}">Agregar</button>
          </form>
          <div class="table-wrap">
            <table class="table">
              <caption class="sr-only">Habilidades de ${esc(c.nombre)} con el nivel que el cargo espera.</caption>
              <thead><tr><th scope="col">Habilidad</th><th scope="col">Nivel esperado</th><th scope="col"><span class="sr-only">Quitar</span></th></tr></thead>
              <tbody>
                ${filas.map((f) => {
                  const nuevo = pend.get(f.skill_id);
                  const quitada = nuevo === '';
                  const valor = nuevo && !quitada ? nuevo : f.nivel_esperado;
                  const nombre = f.s?.nombre ?? f.skill_id;
                  return `
                  <tr class="${quitada ? 'cargo__fila--quitada' : nuevo ? 'cargo__fila--cambiada' : ''}">
                    <th scope="row" class="table__rowhead">${esc(nombre)}
                      <span class="linea-aparte text-xs text-muted">${esc(CATEGORIAS.find((x) => x.key === f.s?.tipo)?.label ?? '')}</span>
                      ${f.s && (f.s.activa === false || f.s.oculto) ? '<span class="badge badge--neutral">No vigente</span>' : ''}
                      ${quitada ? '<span class="badge badge--warning">Se quitará</span>' : nuevo ? '<span class="badge badge--info">Cambiada</span>' : ''}</th>
                    <td>
                      <label class="sr-only" for="ne-${esc(c.id)}-${esc(f.skill_id)}">Nivel esperado de ${esc(nombre)}</label>
                      <select class="select select--sm" id="ne-${esc(c.id)}-${esc(f.skill_id)}" data-nivel="${esc(f.skill_id)}" ${quitada ? 'disabled' : ''}>
                        ${NIVELES.map((nv) => `<option value="${nv}" ${valor === nv ? 'selected' : ''}>${esc(NIVEL_ES[nv])}</option>`).join('')}
                      </select>
                    </td>
                    <td><button type="button" class="btn btn--ghost btn--sm" data-quitar-skill="${esc(f.skill_id)}" aria-pressed="${quitada}">
                      ${quitada ? 'Conservar' : 'Quitar'}<span class="sr-only"> ${esc(nombre)}</span></button></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div class="cargo__guardar">
            <p class="text-sm" role="status">${n ? `${plural(n, 'cambio sin guardar', 'cambios sin guardar')}.` : 'Sin cambios pendientes.'}</p>
            <div class="btn-group">
              <button type="button" class="btn btn--ghost" data-descartar="${esc(c.id)}" ${n ? '' : 'disabled'}>Descartar</button>
              <button type="button" class="btn btn--primary" data-guardar-niveles="${esc(c.id)}" ${n ? '' : 'disabled'}>Guardar cambios</button>
            </div>
          </div>`;

        const repintar = (enfocar) => {
          pintarCuerpo(det);
          if (enfocar) det.querySelector(enfocar)?.focus();
        };
        det.querySelector('[data-editar-cargo]').addEventListener('click', () => editarCargo(c));
        det.querySelector('[data-historial-cargo]').addEventListener('click', () => verHistorial('cargo', c.id));
        det.querySelectorAll('[data-nivel]').forEach((sel) => {
          sel.addEventListener('change', () => {
            const original = actuales.find((h) => h.skill_id === sel.dataset.nivel)?.nivel_esperado;
            if (sel.value === original) pend.delete(sel.dataset.nivel); else pend.set(sel.dataset.nivel, sel.value);
            repintar(`#${CSS.escape(sel.id)}`);
          });
        });
        det.querySelectorAll('[data-quitar-skill]').forEach((b) => {
          b.addEventListener('click', () => {
            const sid = b.dataset.quitarSkill;
            if (pend.get(sid) === '') pend.delete(sid); else pend.set(sid, '');
            repintar(`[data-quitar-skill="${CSS.escape(sid)}"]`);
          });
        });
        det.querySelector('[data-descartar]').addEventListener('click', () => { pend.clear(); repintar(`[data-editar-cargo]`); });
        det.querySelector('[data-guardar-niveles]').addEventListener('click', () => {
          const cambios = [...pend.entries()].map(([skillId, nivel]) => ({ skillId, nivel }));
          const quitadas = cambios.filter((x) => x.nivel === '');
          abrirFormulario({
            titulo: `Guardar ${plural(cambios.length, 'cambio', 'cambios')} en ${c.nombre}`,
            lede: quitadas.length
              ? `${plural(quitadas.length, 'habilidad deja', 'habilidades dejan')} de evaluarse en este cargo desde ahora.`
              : 'Los niveles nuevos se usan desde ahora en los cálculos de quienes tienen este cargo.',
            contenido: `<ul class="cambios-lista">${cambios.map((x) => `<li>${esc(skill(x.skillId)?.nombre ?? x.skillId)}: ${
              x.nivel ? `<b>${esc(NIVEL_ES[x.nivel])}</b>` : '<b>se quita</b>'}</li>`).join('')}</ul>`,
            textoBoton: 'Guardar cambios',
            async alGuardar(_v, motivo) {
              // Se vacían ANTES de la llamada: la pantalla se repinta con el
              // dato nuevo mientras la llamada termina, y tiene que repintarse
              // sin pendientes. Si falla, se devuelven.
              const copia = new Map(pend);
              pend.clear();
              try {
                await fijarNivelesEsperados(c.id, cambios, motivo);
              } catch (e) {
                copia.forEach((v, k) => pend.set(k, v));
                throw e;
              }
              toast(`Niveles guardados en ${c.nombre}.`, 'success');
            },
          });
        });
        det.querySelector('[data-agregar]').addEventListener('submit', async (ev) => {
          ev.preventDefault();
          const f = ev.currentTarget;
          const sel = f.querySelector('[data-skill-nueva]');
          clearFieldErrors(f);
          if (!sel.value) { setFieldError(sel, 'Elige una habilidad.'); sel.focus(); return; }
          const sid = sel.value;
          try {
            await withBusy(f.querySelector('[type=submit]'),
              () => fijarNivelesEsperados(c.id, [{ skillId: sid, nivel: f.querySelector('[data-nivel-nuevo]').value }]),
              { label: 'Agregando…' });
            toast(`«${skill(sid)?.nombre}» agregada a ${c.nombre}.`, 'success');
          } catch (e) { toast(`No se agregó: ${e.message}`, 'error'); }
        });
        sincronizarScrollables(det);
      };

      raiz.querySelectorAll('details.cargo').forEach((det) => {
        if (det.open) pintarCuerpo(det);
        det.addEventListener('toggle', () => {
          if (det.open) { cargosAbiertos.add(det.dataset.cargo); pintarCuerpo(det); }
          else cargosAbiertos.delete(det.dataset.cargo);
        });
      });
      raiz.querySelector('[data-nuevo]').addEventListener('click', () => editarCargo(null));
    },
  };
}

function editarCargo(c) {
  abrirFormulario({
    titulo: c ? `Editar ${c.nombre}` : 'Agregar cargo',
    lede: c ? '' : 'Después ábrelo en la lista para agregarle habilidades y niveles esperados.',
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre del cargo', obligatorio: true },
      { nombre: 'area', etiqueta: 'Área', obligatorio: true, max: 80 },
      { nombre: 'oculto', etiqueta: 'Oculto: quienes lo tienen dejan de evaluarse con él', tipo: 'check' },
    ],
    valores: c ? { ...c } : { oculto: false },
    conMotivo: Boolean(c),
    async alGuardar(v, motivo) {
      if (!c) {
        const r = await crear('cargo', v);
        cargosAbiertos.add(r.id);
        toast(`Cargo «${v.nombre}» creado.`, 'success');
        return;
      }
      const cambios = diferencias(c, v);
      if (!Object.keys(cambios).length) { toast('No había cambios que guardar.', 'info'); return; }
      await actualizar('cargo', c.id, cambios, motivo);
      toast(`Cambios guardados en ${v.nombre}.`, 'success');
    },
  });
}

/* =========================================================================
   PARES Y EVALUACIONES
   ========================================================================= */

const estadoPares = { evaluado: '', evaluador: '', persona: '', buscar: '', soloSin: false };

export function vistaAdminPares() {
  const adm = administracion() ?? { pares: [] };
  const conCargo = personas().filter((p) => p.cargo_id && p.activo !== false).sort(ordenNombre);
  const porEvaluado = new Map();
  for (const x of adm.pares) {
    if (!porEvaluado.has(x.evaluado_id)) porEvaluado.set(x.evaluado_id, []);
    porEvaluado.get(x.evaluado_id).push(x.evaluador_id);
  }
  const opcion = (p, sel) => `<option value="${esc(p.id)}" ${sel === p.id ? 'selected' : ''}>${esc(p.nombre)}</option>`;

  const html = `
    ${cabecera('#/admin/pares', 'Pares y evaluaciones', `Quién evalúa a quién como par en la ronda ${ronda()?.nombre ?? ''}, y qué evaluaciones recibió cada persona.`)}

    <div class="graficas-par">
      <section class="card admin-bloque" aria-labelledby="t-asignar">
        <h2 class="admin-bloque__titulo" id="t-asignar">Asignar un par</h2>
        <form id="f-par" novalidate>
          <div class="field">
            <label class="field__label" for="par-evaluado">Persona evaluada</label>
            <select class="select" id="par-evaluado">
              <option value="">Elige</option>
              ${conCargo.map((p) => opcion(p, estadoPares.evaluado)).join('')}
            </select>
          </div>
          <div class="field">
            <label class="field__label" for="par-evaluador">La evalúa como par</label>
            <select class="select" id="par-evaluador">
              <option value="">Elige</option>
              ${personas().filter((p) => p.activo !== false).sort(ordenNombre).map((p) => opcion(p, estadoPares.evaluador)).join('')}
            </select>
          </div>
          <button type="submit" class="btn btn--primary">Asignar</button>
        </form>
      </section>

      <section class="card admin-bloque" aria-labelledby="t-recibidas">
        <h2 class="admin-bloque__titulo" id="t-recibidas">Evaluaciones recibidas</h2>
        <div class="field">
          <label class="field__label" for="ev-persona">Persona</label>
          <select class="select" id="ev-persona">
            <option value="">Elige una persona</option>
            ${conCargo.map((p) => opcion(p, estadoPares.persona)).join('')}
          </select>
        </div>
        <p class="section__note" id="ev-estado" role="status"></p>
        <div id="ev-zona"></div>
      </section>
    </div>

    <section class="section" aria-labelledby="t-pares">
      <div class="section__head"><h2 class="section__title" id="t-pares">Asignaciones de esta ronda</h2></div>
      <!-- La pregunta de la administración es «quién no tiene pares todavía»: se
           responde con un filtro, no recorriendo doscientas filas. -->
      <div class="toolbar toolbar--filtros">
        <div class="field">
          <label class="field__label" for="par-buscar">Buscar persona</label>
          <input class="input" id="par-buscar" type="search" autocomplete="off" value="${esc(estadoPares.buscar ?? '')}">
        </div>
        <label class="check"><input type="checkbox" id="par-sin" ${estadoPares.soloSin ? 'checked' : ''}><span>Solo quienes no tienen pares</span></label>
      </div>
      <p class="section__note" id="par-cuenta" role="status"></p>
      <div class="table-wrap table-wrap--sticky">
        <table class="table">
          <caption class="sr-only">Cada persona evaluada con quienes la evalúan como par.</caption>
          <thead><tr><th scope="col">Persona evaluada</th><th scope="col">Pares que la evalúan</th></tr></thead>
          <tbody>
            ${conCargo.map((p) => {
              const ps = porEvaluado.get(p.id) ?? [];
              return `<tr data-nombre="${esc(p.nombre.toLowerCase())}" data-sin="${ps.length ? '' : '1'}">
                <th scope="row" class="table__rowhead">${esc(p.nombre)}</th>
                <td>${ps.length ? `<ul class="chips">${ps.map((ev) => `
                  <li class="chip">${esc(nombreDe(ev))}
                    <button type="button" class="chip__quitar" data-quitar="${esc(ev)}|${esc(p.id)}"
                            aria-label="Quitar a ${esc(nombreDe(ev))} como par de ${esc(p.nombre)}">${icon('close')}</button>
                  </li>`).join('')}</ul>` : '<span class="badge badge--warning">Sin pares asignados</span>'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </section>`;

  return {
    html,
    montado(raiz) {
      const filas = [...raiz.querySelectorAll('tr[data-nombre]')];
      const cuenta = raiz.querySelector('#par-cuenta');
      const sinNorm = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const filtrar = (anunciar) => {
        const q = sinNorm(raiz.querySelector('#par-buscar').value.trim());
        const solo = raiz.querySelector('#par-sin').checked;
        let n = 0;
        filas.forEach((tr) => {
          const ve = (!q || sinNorm(tr.dataset.nombre).includes(q)) && (!solo || tr.dataset.sin);
          tr.hidden = !ve; if (ve) n += 1;
        });
        const sin = filas.filter((tr) => tr.dataset.sin).length;
        const texto = `${n} de ${filas.length} personas · ${sin} sin pares asignados.`;
        if (anunciar) anunciarDespues(cuenta, texto); else cuenta.textContent = texto;
      };
      raiz.querySelector('#par-buscar').addEventListener('input', (e) => { estadoPares.buscar = e.target.value; filtrar(true); });
      raiz.querySelector('#par-sin').addEventListener('change', (e) => { estadoPares.soloSin = e.target.checked; filtrar(true); });
      filtrar(false);

      const fPar = raiz.querySelector('#f-par');
      fPar.querySelector('#par-evaluado').addEventListener('change', (e) => { estadoPares.evaluado = e.target.value; });
      fPar.querySelector('#par-evaluador').addEventListener('change', (e) => { estadoPares.evaluador = e.target.value; });
      fPar.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        clearFieldErrors(fPar);
        const evaluado = fPar.querySelector('#par-evaluado');
        const evaluador = fPar.querySelector('#par-evaluador');
        if (!evaluado.value) { setFieldError(evaluado, 'Elige a la persona evaluada.'); evaluado.focus(); return; }
        if (!evaluador.value) { setFieldError(evaluador, 'Elige quién la evalúa.'); evaluador.focus(); return; }
        if (evaluado.value === evaluador.value) { setFieldError(evaluador, 'Nadie puede ser su propio par.'); evaluador.focus(); return; }
        const [a, b] = [evaluador.value, evaluado.value];
        try {
          // La persona evaluada queda elegida: asignar varios pares a la misma
          // persona es el caso común. Solo se limpia quien evalúa.
          await withBusy(fPar.querySelector('[type=submit]'), () => asignarPar(a, b, true), { label: 'Asignando…' });
          estadoPares.evaluador = '';
          toast(`${nombreDe(a)} evaluará a ${nombreDe(b)} como par.`, 'success');
        } catch (e) { toast(`No se asignó: ${e.message}`, 'error'); }
      });

      raiz.querySelectorAll('[data-quitar]').forEach((b) => b.addEventListener('click', async () => {
        const [evaluador, evaluado] = b.dataset.quitar.split('|');
        try {
          await withBusy(b, () => asignarPar(evaluador, evaluado, false), { label: 'Quitando…' });
          toast(`${nombreDe(evaluador)} ya no evalúa a ${nombreDe(evaluado)}.`, 'success', {
            accion: { texto: 'Deshacer', alHacer: () => asignarPar(evaluador, evaluado, true) },
          });
        } catch (e) { toast(`No se quitó: ${e.message}`, 'error'); }
      }));

      const zona = raiz.querySelector('#ev-zona');
      const estado = raiz.querySelector('#ev-estado');
      const pintarRecibidas = () => {
        const id = estadoPares.persona;
        if (!id) { zona.innerHTML = ''; estado.textContent = ''; return; }
        const grupos = recibidas(id);
        estado.textContent = grupos.length
          ? `${plural(grupos.length, 'evaluación recibida', 'evaluaciones recibidas')} en esta ronda.`
          : 'Todavía no recibió evaluaciones en esta ronda.';
        zona.innerHTML = grupos.length ? `
          <div class="table-wrap">
            <table class="table">
              <caption class="sr-only">Evaluaciones recibidas por ${esc(nombreDe(id))}, por evaluador.</caption>
              <thead><tr><th scope="col">Evaluador</th><th scope="col">Como</th><th scope="col">Respuestas</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
              <tbody>
                ${grupos.map((g) => `<tr>
                  <th scope="row" class="table__rowhead">${esc(nombreDe(g.evaluador) || g.evaluador)}</th>
                  <td class="text-sm">${esc({ Employee: 'Autoevaluación', Leader: 'Líder', Peer: 'Par' }[g.rol] ?? g.rol)}</td>
                  <td class="numeric">${g.n}</td>
                  <td><button type="button" class="btn btn--ghost btn--sm" data-anular="${esc(g.evaluador)}|${esc(g.rol)}">Anular<span class="sr-only"> la evaluación de ${esc(nombreDe(g.evaluador))}</span></button></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>` : '';
        zona.querySelectorAll('[data-anular]').forEach((b) => b.addEventListener('click', () => {
          const [evaluador, rol] = b.dataset.anular.split('|');
          abrirFormulario({
            titulo: `Anular la evaluación de ${nombreDe(evaluador)}`,
            lede: `Sus respuestas sobre ${nombreDe(id)} dejan de contar en los cálculos. No se borran: quedan en el Excel marcadas como anuladas, y se pueden volver a enviar mientras la ronda esté abierta.`,
            textoBoton: 'Anular',
            peligro: true,
            motivoObligatorio: true,
            async alGuardar(_v, motivo) {
              await anularEvaluacion(id, evaluador, rol, motivo);
              toast(`Evaluación de ${nombreDe(evaluador)} anulada.`, 'success', {
                accion: { texto: 'Deshacer', alHacer: () => anularEvaluacion(id, evaluador, rol, 'Deshecho al anular', false) },
              });
            },
          });
        }));
        sincronizarScrollables(zona);
      };
      raiz.querySelector('#ev-persona').addEventListener('change', (e) => { estadoPares.persona = e.target.value; pintarRecibidas(); });
      pintarRecibidas();
      sincronizarScrollables(raiz);
    },
  };
}

/** Evaluaciones de una persona agrupadas por evaluador y rol (dato de admin). */
function recibidas(personaId) {
  const m = new Map();
  for (const e of evaluacionesDe(personaId)) {
    // Lo evaluado por quien administra llega como 'yo'; acá hace falta el id.
    const evaluador = e.evaluador === 'yo' ? usuarioId() : e.evaluador;
    const k = `${evaluador}|${e.rol}`;
    m.set(k, { evaluador, rol: e.rol, n: (m.get(k)?.n ?? 0) + 1 });
  }
  return [...m.values()].sort((a, b) => a.rol.localeCompare(b.rol));
}

/* =========================================================================
   RONDA Y AJUSTES
   ========================================================================= */

const ETIQUETA_CONFIG = {
  ronda_id: 'Identificador de la ronda',
  ronda_nombre: 'Nombre de la ronda',
  ronda_inicio: 'Inicio',
  ronda_cierre: 'Cierre',
  ronda_abierta: 'Ronda abierta',
  sesion_horas: 'Duración de la sesión (horas)',
  codigo_minutos: 'Vigencia del código de ingreso (minutos)',
  codigo_intentos: 'Intentos antes de invalidar un código',
  codigo_espera_segundos: 'Espera mínima entre dos códigos (segundos)',
  codigo_max_hora: 'Códigos por correo y por hora',
  nombre_herramienta: 'Nombre en los correos',
};

// Lo que falta en la ronda, para decidir antes de cerrarla.
function faltantesRonda() {
  const conCargo = personas().filter((p) => p.cargo_id && p.activo !== false && !p.oculto);
  const sinAuto = conCargo.filter((p) => !evaluacionesDe(p.id).some((e) => e.rol === 'Employee'));
  const sinLider = conCargo.filter((p) => !evaluacionesDe(p.id).some((e) => e.rol === 'Leader'));
  return { personas: conCargo.length, sinAuto, sinLider };
}

const FECHAS = new Set(['ronda_inicio', 'ronda_cierre']);
const DE_RONDA = ['ronda_nombre', 'ronda_inicio', 'ronda_cierre'];
const fechaLegible = (v) => {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? new Date(`${v}T12:00:00`) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) : String(v ?? '');
};

export function vistaAdminRonda() {
  const config = administracion()?.config ?? [];
  const abierta = ronda()?.abierta;
  const f = faltantesRonda();
  const nombres = (lista) => lista.slice(0, 6).map((p) => p.nombre).join(', ') + (lista.length > 6 ? ` y ${lista.length - 6} más` : '');
  const filaAjuste = (c) => `<tr>
      <th scope="row" class="table__rowhead">${esc(ETIQUETA_CONFIG[c.clave] ?? c.clave)}
        ${c.nota ? `<span class="linea-aparte text-sm text-muted">${esc(c.nota)}</span>` : ''}</th>
      <td>${esc(FECHAS.has(c.clave) ? fechaLegible(c.valor) : String(c.valor ?? ''))}</td>
      <td><button type="button" class="btn btn--ghost btn--sm" data-config="${esc(c.clave)}">Cambiar<span class="sr-only"> ${esc(ETIQUETA_CONFIG[c.clave] ?? c.clave)}</span></button></td>
    </tr>`;
  const tablaAjustes = (lista, titulo) => `
      <div class="table-wrap">
        <table class="table">
          <caption class="sr-only">${esc(titulo)}</caption>
          <thead><tr><th scope="col">Ajuste</th><th scope="col">Valor</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
          <tbody>${lista.map(filaAjuste).join('')}</tbody>
        </table>
      </div>`;
  // El identificador nunca se edita a mano: cambiarlo empieza una ronda nueva y
  // eso tiene su propio botón, con la consecuencia escrita.
  const deRonda = config.filter((c) => DE_RONDA.includes(c.clave));
  const deIngreso = config.filter((c) => !DE_RONDA.includes(c.clave) && !['ronda_id', 'ronda_abierta'].includes(c.clave));

  const html = `
    ${cabecera('#/admin/ronda', 'Ronda y ajustes', 'Abrir, cerrar o empezar una ronda, y los ajustes del ingreso.')}
    <section class="section" aria-labelledby="t-estado-ronda">
      <div class="section__head"><h2 class="section__title" id="t-estado-ronda">Ronda ${esc(ronda()?.nombre ?? '')}</h2></div>
      <div class="card ronda-estado">
        <div>
          <p>${abierta
            ? '<span class="badge badge--success">Abierta</span> Las personas pueden enviar y cambiar evaluaciones.'
            : '<span class="badge badge--warning">Cerrada</span> Nadie puede enviar ni cambiar evaluaciones. Los resultados siguen visibles.'}</p>
          <p class="text-sm">${f.sinAuto.length || f.sinLider.length
            ? `De ${f.personas} personas con cargo, <b>${f.sinAuto.length}</b> no tienen autoevaluación y <b>${f.sinLider.length}</b> no tienen la evaluación de su líder.`
            : `Las ${f.personas} personas con cargo tienen autoevaluación y evaluación de su líder.`}</p>
        </div>
        <button type="button" class="btn ${abierta ? 'btn--danger' : 'btn--primary'}" data-alternar>
          ${abierta ? 'Cerrar la ronda' : 'Abrir la ronda'}
        </button>
      </div>
      ${deRonda.length ? tablaAjustes(deRonda, 'Datos de la ronda actual') : ''}
    </section>

    <section class="section" aria-labelledby="t-nueva">
      <div class="section__head">
        <h2 class="section__title" id="t-nueva">Empezar una ronda nueva</h2>
        <button type="button" class="btn btn--secondary btn--sm" data-nueva>Empezar una ronda nueva</button>
      </div>
      <p class="section__note">
        Las evaluaciones y los pares de «${esc(ronda()?.nombre ?? '')}» dejan de mostrarse; los planes
        de desarrollo se conservan. Nada se borra: todo sigue en el Excel.
      </p>
    </section>

    <section class="section" aria-labelledby="t-ajustes">
      <div class="section__head"><h2 class="section__title" id="t-ajustes">Ajustes del ingreso</h2></div>
      <p class="section__note">Cómo funcionan el código por correo y la sesión. Rara vez hace falta cambiarlos.</p>
      ${tablaAjustes(deIngreso, 'Ajustes del ingreso con su valor actual')}
    </section>`;

  const listaFaltan = f.sinAuto.length || f.sinLider.length ? `
    <ul class="cambios-lista">
      ${f.sinAuto.length ? `<li><b>${f.sinAuto.length}</b> sin autoevaluación: ${esc(nombres(f.sinAuto))}.</li>` : ''}
      ${f.sinLider.length ? `<li><b>${f.sinLider.length}</b> sin evaluación de su líder: ${esc(nombres(f.sinLider))}.</li>` : ''}
    </ul>` : '';

  return {
    html,
    montado(raiz) {
      raiz.querySelector('[data-alternar]').addEventListener('click', () => {
        abrirFormulario({
          titulo: abierta ? 'Cerrar la ronda' : 'Abrir la ronda',
          lede: abierta
            ? 'Desde ahora nadie podrá enviar ni cambiar evaluaciones. Se puede volver a abrir.'
            : 'Las personas podrán enviar y cambiar evaluaciones.',
          contenido: abierta ? listaFaltan : '',
          motivoObligatorio: abierta,
          textoBoton: abierta ? 'Cerrar la ronda' : 'Abrir la ronda',
          peligro: abierta,
          async alGuardar(_v, motivo) {
            await actualizar('config', 'ronda_abierta', { valor: !abierta }, motivo);
            toast(abierta ? 'Ronda cerrada.' : 'Ronda abierta.', 'success');
          },
        });
      });
      raiz.querySelector('[data-nueva]').addEventListener('click', () => {
        const n = personas().filter((p) => p.cargo_id).reduce((a, p) => a + (evaluacionesDe(p.id).length ? 1 : 0), 0);
        abrirFormulario({
          titulo: 'Empezar una ronda nueva',
          lede: `Las evaluaciones de ${n} personas y los pares de «${ronda()?.nombre ?? ''}» dejarán de mostrarse a todos. Quedan en el Excel, pero desde aquí no se pueden recuperar. Los planes de desarrollo no cambian.`,
          campos: [
            { nombre: 'nombre', etiqueta: 'Nombre de la ronda nueva', obligatorio: true, max: 80, ayuda: 'Por ejemplo: Ronda 2027-1. Es lo que ve todo el mundo.' },
            { nombre: 'inicio', etiqueta: 'Inicio', tipo: 'fecha' },
            { nombre: 'cierre', etiqueta: 'Cierre previsto', tipo: 'fecha' },
          ],
          motivoObligatorio: true,
          textoBoton: 'Empezar la ronda nueva',
          peligro: true,
          async alGuardar(v, motivo) {
            if (v.nombre === ronda()?.nombre) throw new ErrorCampo('nombre', 'Ponle un nombre distinto al de la ronda actual.');
            // El identificador lo arma la herramienta: nadie tiene que inventarlo.
            const id = `R${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString(36).slice(-4)}`;
            await actualizar('config', 'ronda_id', { valor: id }, motivo);
            await actualizar('config', 'ronda_nombre', { valor: v.nombre }, motivo);
            if (v.inicio) await actualizar('config', 'ronda_inicio', { valor: v.inicio }, motivo);
            if (v.cierre) await actualizar('config', 'ronda_cierre', { valor: v.cierre }, motivo);
            if (!abierta) await actualizar('config', 'ronda_abierta', { valor: true }, motivo);
            toast(`Ronda «${v.nombre}» iniciada.`, 'success');
          },
        });
      });
      raiz.querySelectorAll('[data-config]').forEach((b) => b.addEventListener('click', () => {
        const c = config.find((x) => x.clave === b.dataset.config);
        const numerico = typeof c.valor === 'number';
        const etiqueta = ETIQUETA_CONFIG[c.clave] ?? c.clave;
        abrirFormulario({
          titulo: etiqueta,
          lede: c.nota,
          campos: [{ nombre: 'valor', etiqueta, obligatorio: true, max: 300, numerico, tipo: FECHAS.has(c.clave) ? 'fecha' : undefined }],
          valores: { valor: c.valor },
          async alGuardar(v, motivo) {
            await actualizar('config', c.clave, { valor: numerico ? Number(v.valor) : v.valor }, motivo);
            toast('Ajuste guardado.', 'success');
          },
        });
      }));
      sincronizarScrollables(raiz);
    },
  };
}

/* =========================================================================
   AUDITORÍA
   ========================================================================= */

export const ACCIONES = {
  'sesion.ingreso': 'Entró', crear: 'Creó', renombrar: 'Renombró', editar: 'Editó', mover: 'Cambió de equipo',
  ocultar: 'Ocultó', mostrar: 'Volvió a mostrar', activar: 'Activó', desactivar: 'Desactivó',
  'cambiar-lider': 'Cambió el líder', 'asignar-interino': 'Asignó líder interino', 'quitar-interino': 'Quitó el líder interino',
  'agregar-habilidad': 'Agregó una habilidad', 'quitar-habilidad': 'Quitó una habilidad',
  'asignar-par': 'Asignó un par', 'quitar-par': 'Quitó un par', 'dar-admin': 'Dio administración', 'quitar-admin': 'Quitó administración',
  'anular-evaluacion': 'Anuló una evaluación', 'restaurar-evaluacion': 'Restauró una evaluación',
  'evaluacion.enviar': 'Envió una evaluación', 'evaluacion.actualizar': 'Cambió una evaluación',
  'plan.crear': 'Creó un plan', 'plan.editar': 'Editó un plan', 'plan.borrar': 'Eliminó un plan',
};
const CUALQUIER = {
  persona: 'Cualquier persona', equipo: 'Cualquier equipo', cargo: 'Cualquier cargo',
  habilidad: 'Cualquier habilidad', plan: 'Cualquier plan', config: 'Cualquier ajuste',
};
const ENTIDADES = { persona: 'Persona', equipo: 'Equipo', cargo: 'Cargo', habilidad: 'Habilidad', plan: 'Plan', config: 'Ajuste' };
const CAMPOS = {
  nombre: 'Nombre', correo: 'Correo', cargo_id: 'Cargo', equipo_id: 'Equipo', area: 'Área', activo: 'Activa',
  activa: 'Activa', oculto: 'Oculto', lider_id: 'Líder titular', lider_interino_id: 'Líder interino',
  tipo: 'Categoría', departamento: 'Departamento', descripcion: 'Descripción', valor: 'Valor',
  nivel_basico: 'Nivel Básico', nivel_intermedio: 'Nivel Intermedio', nivel_avanzado: 'Nivel Avanzado', nivel_experto: 'Nivel Experto',
  titulo: 'Título', objetivo: 'Objetivo', propuesta: 'Propuesta', skill_ids: 'Habilidades', administrador: 'Administración',
};

/** "nivel esperado · f159" → "Nivel esperado · Case management". */
export function campoLegible(c) {
  if (!c) return '';
  const m = c.match(/^nivel esperado · (.+)$/);
  if (m) return `Nivel esperado · ${skill(m[1])?.nombre ?? m[1]}`;
  return CAMPOS[c] ?? c;
}

/** Los ids de personas, equipos y cargos se muestran con su nombre actual. */
export function legible(campo, valor) {
  if (!valor) return '';
  if (/lider|interino|par evaluador/.test(campo ?? '')) return persona(valor)?.nombre ?? valor;
  if (campo === 'equipo_id') return equipo(valor)?.nombre ?? valor;
  if (campo === 'cargo_id') return cargo(valor)?.nombre ?? valor;
  if (NIVEL_ES[valor]) return NIVEL_ES[valor];
  if (valor === 'true') return 'sí';
  if (valor === 'false') return 'no';
  return valor;
}

/** Antes y después, dicho también para lectores de pantalla (el tachado no se anuncia). */
export function cambioHtml(campo, antes, despues) {
  if (!antes && !despues) return '';
  return `${antes ? `<span class="sr-only">Antes: </span><s>${esc(legible(campo, antes))}</s> <span aria-hidden="true">→</span> ` : ''}`
    + `<span class="sr-only">${antes ? 'ahora: ' : 'Quedó: '}</span>${esc(legible(campo, despues) || '(vacío)')}`;
}

const fechaHora = (ts) => new Date(ts).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
const aTs = (fecha, finDelDia = false) => (fecha ? new Date(`${fecha}T${finDelDia ? '23:59:59' : '00:00:00'}`).getTime() : '');

export function vistaAdminAuditoria() {
  const f = filtroAuditoria;
  const anchos = window.matchMedia('(min-width: 40rem)').matches;
  const masFiltros = Boolean(f.tipo || f.registro || f.actorId || f.desde || f.hasta);
  const html = `
    ${cabecera('#/admin/auditoria', 'Auditoría', 'Cada cambio hecho en la herramienta, y cada ingreso: quién, cuándo, sobre qué, y el antes y el después.')}
    <section class="section" aria-labelledby="t-filtros">
      <h2 class="sr-only" id="t-filtros">Filtros</h2>
      <form class="filtros-auditoria" id="f-aud" novalidate>
        <div class="field">
          <label class="field__label" for="fa-texto">Buscar</label>
          <input class="input" id="fa-texto" type="search" value="${esc(f.texto)}" placeholder="Nombre, campo o valor">
        </div>
        <details class="filtros-auditoria__mas" ${anchos || masFiltros ? 'open' : ''}>
          <summary>Más filtros</summary>
          <div class="filtros-auditoria__grid">
            <div class="field">
              <label class="field__label" for="fa-registro">Registro</label>
              <select class="select" id="fa-registro">
                <option value="">Cualquiera</option>
                <optgroup label="Por tipo">${Object.entries(CUALQUIER).map(([k, v]) => `<option value="${k}|" ${f.registro === `${k}|` ? 'selected' : ''}>${v}</option>`).join('')}</optgroup>
                <optgroup label="Una persona">${personas().slice().sort(ordenNombre).map((p) => `<option value="persona|${esc(p.id)}" ${f.registro === `persona|${p.id}` ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</optgroup>
                <optgroup label="Un equipo (incluye a sus miembros)">${equipos().slice().sort(ordenNombre).map((e) => `<option value="equipo|${esc(e.id)}" ${f.registro === `equipo|${e.id}` ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}</optgroup>
                <optgroup label="Un cargo">${cargos().slice().sort(ordenNombre).map((c) => `<option value="cargo|${esc(c.id)}" ${f.registro === `cargo|${c.id}` ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</optgroup>
              </select>
            </div>
            <div class="field">
              <label class="field__label" for="fa-actor">Hecho por</label>
              <select class="select" id="fa-actor">
                <option value="">Cualquiera</option>
                ${personas().slice().sort(ordenNombre).map((p) => `<option value="${esc(p.id)}" ${f.actorId === p.id ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label class="field__label" for="fa-desde">Desde</label>
              <input class="input" id="fa-desde" type="date" value="${esc(f.desde)}">
            </div>
            <div class="field">
              <label class="field__label" for="fa-hasta">Hasta</label>
              <input class="input" id="fa-hasta" type="date" value="${esc(f.hasta)}">
            </div>
          </div>
        </details>
        <div class="filtros-auditoria__acciones">
          <button type="submit" class="btn btn--secondary">Filtrar</button>
          <button type="button" class="btn btn--ghost" data-limpiar>Limpiar</button>
        </div>
      </form>
    </section>
    <section class="section" aria-labelledby="t-eventos">
      <div class="section__head"><h2 class="section__title" id="t-eventos">Eventos</h2></div>
      <p class="section__note" id="fa-estado" role="status" tabindex="-1">Consultando…</p>
      <div id="fa-tabla"></div>
      <div class="btn-group paginacion" id="fa-paginas"></div>
    </section>`;

  return {
    html,
    montado(raiz) {
      const estado = raiz.querySelector('#fa-estado');
      const tabla = raiz.querySelector('#fa-tabla');
      const paginas = raiz.querySelector('#fa-paginas');
      const filtrar = raiz.querySelector('#f-aud [type=submit]');
      let consulta = 0;

      const consultar = async ({ enfocar = false } = {}) => {
        // Si se piden dos consultas seguidas, se muestra la última pedida, no
        // la última en llegar.
        const mia = ++consulta;
        estado.textContent = 'Consultando la auditoría…';
        tabla.setAttribute('aria-busy', 'true');
        const [tipo, id] = (f.registro || '|').split('|');
        let r;
        try {
          r = await withBusy(filtrar, () => auditoria({
            entidad: tipo === 'equipo' && id ? '' : tipo, entidadId: tipo === 'equipo' ? '' : id,
            equipoId: tipo === 'equipo' ? id : '', actorId: f.actorId,
            texto: f.texto, desde: aTs(f.desde), hasta: aTs(f.hasta, true),
          }, f.pagina, 100), { label: 'Consultando…' });
        } catch (e) {
          if (mia !== consulta) return;
          tabla.removeAttribute('aria-busy');
          estado.textContent = `No se pudo consultar: ${e.message}`;
          tabla.innerHTML = '<button type="button" class="btn btn--secondary btn--sm" data-reintentar>Reintentar</button>';
          tabla.querySelector('[data-reintentar]').addEventListener('click', () => consultar({ enfocar: true }));
          return;
        }
        if (mia !== consulta) return;
        tabla.removeAttribute('aria-busy');
        const ini = r.pagina * r.tamano;
        estado.textContent = r.total
          ? `${plural(r.total, 'evento', 'eventos')}${r.total > r.tamano ? `; se muestran del ${ini + 1} al ${Math.min(ini + r.tamano, r.total)}` : ''}, del más reciente al más antiguo.`
          : 'Ningún evento coincide con el filtro.';
        tabla.innerHTML = r.filas.length ? `
          <div class="table-wrap table-wrap--sticky">
            <table class="table auditoria">
              <caption class="sr-only">Eventos de auditoría: fecha, quién, qué hizo, sobre qué registro, y el valor antes y después.</caption>
              <thead><tr>
                <th scope="col">Cuándo</th><th scope="col">Quién</th><th scope="col">Qué</th>
                <th scope="col">Sobre</th><th scope="col">Antes y después</th>
              </tr></thead>
              <tbody>
                ${r.filas.map((a) => `<tr>
                  <td class="text-xs auditoria__fecha">${esc(fechaHora(a.ts))}</td>
                  <td class="text-sm">${esc(a.actor_nombre)}</td>
                  <td class="text-sm">${esc(ACCIONES[a.accion] ?? a.accion)}${a.campo ? `<span class="linea-aparte text-xs text-muted">${esc(campoLegible(a.campo))}</span>` : ''}</td>
                  <td class="text-sm">${esc(a.entidad_nombre)}<span class="linea-aparte text-xs text-muted">${esc(ENTIDADES[a.entidad] ?? a.entidad)}</span></td>
                  <td class="text-sm auditoria__cambio">
                    ${cambioHtml(a.campo, a.antes, a.despues)}
                    ${a.detalle ? `<span class="linea-aparte text-xs text-muted">${esc(a.detalle)}</span>` : ''}
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>` : '';
        const total = Math.ceil(r.total / r.tamano);
        paginas.innerHTML = total > 1 ? `
          <button type="button" class="btn btn--secondary btn--sm" data-pag="-1" ${r.pagina === 0 ? 'disabled' : ''}>Más recientes</button>
          <span class="text-sm text-muted">Página ${r.pagina + 1} de ${total}</span>
          <button type="button" class="btn btn--secondary btn--sm" data-pag="1" ${r.pagina + 1 >= total ? 'disabled' : ''}>Más antiguos</button>` : '';
        paginas.querySelectorAll('[data-pag]').forEach((b) => b.addEventListener('click', () => {
          f.pagina += Number(b.dataset.pag);
          consultar({ enfocar: true });
        }));
        sincronizarScrollables(raiz);
        // Al paginar, el botón pulsado desaparece con el repintado: el foco va
        // al resumen de resultados y la página sube hasta él.
        if (enfocar) { estado.focus({ preventScroll: true }); estado.scrollIntoView({ block: 'start' }); }
      };

      const form = raiz.querySelector('#f-aud');
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        clearFieldErrors(form);
        const desde = raiz.querySelector('#fa-desde');
        const hasta = raiz.querySelector('#fa-hasta');
        if (desde.value && hasta.value && desde.value > hasta.value) {
          setFieldError(hasta, '«Hasta» no puede ser anterior a «Desde».');
          hasta.focus();
          return;
        }
        Object.assign(f, {
          texto: raiz.querySelector('#fa-texto').value.trim(),
          registro: raiz.querySelector('#fa-registro').value,
          actorId: raiz.querySelector('#fa-actor').value,
          desde: desde.value, hasta: hasta.value, pagina: 0,
        });
        consultar({ enfocar: true });
      });
      raiz.querySelector('[data-limpiar]').addEventListener('click', () => {
        Object.assign(f, { tipo: '', registro: '', actorId: '', texto: '', desde: '', hasta: '', pagina: 0 });
        ir('#/admin/auditoria');
      });
      consultar();
    },
  };
}
