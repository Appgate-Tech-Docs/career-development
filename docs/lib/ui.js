/**
 * UI primitives — Career Development Portal
 *
 * The behavioural half of the design system. Components in components.css
 * describe how things look; these functions are how they act, so that a
 * loading state or a field error is identical on every page instead of being
 * reinvented per file.
 */

import { conceptoEs } from './modelo.js';

/* -------------------------------------------------------------------------
   Escaping

   The PoC built every table row with template literals interpolating values
   straight from the API — persona names, skill names, area names, framework
   titles. Framework titles and skill names are user-editable, so that path
   turns stored text into executed markup. Anything interpolated into an HTML
   string must go through esc().
   ------------------------------------------------------------------------- */

const ESCAPE_MAP = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  // Backtick, equals and slash are escaped too. They are not needed for a
  // correctly double-quoted attribute, but they close the unquoted-attribute
  // class of holes — `esc('x onmouseover=alert(1)')` previously returned the
  // payload verbatim, so a single missing pair of quotes anywhere downstream
  // became an injection point.
  '`': '&#96;', '=': '&#61;', '/': '&#47;',
};

/** Escape a value for interpolation into HTML text or a quoted attribute. */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"'`=/]/g, (ch) => ESCAPE_MAP[ch]);
}

/** Escape a value for use as part of an id or CSS selector. */
export function slug(value) {
  return String(value ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

/* -------------------------------------------------------------------------
   Icons — inline SVG from a consistent set (Feather-derived, 24×24, 2px
   stroke). Kept in one place so no page hand-rolls a path, and so decorative
   icons reliably carry aria-hidden.
   ------------------------------------------------------------------------- */

const ICON_PATHS = {
  chevronRight: '<path d="M9 18l6-6-6-6"/>',
  check:        '<path d="M20 6L9 17l-5-5"/>',
  alert:        '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
  star:         '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>',
  inbox:        '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/>',
  lock:         '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>',
  users:        '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>',
  close:        '<path d="M18 6L6 18M6 6l12 12"/>',
  user:         '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  clipboard:    '<path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
  barChart:     '<path d="M18 20V10M12 20V4M6 20v-6"/>',
  target:       '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  settings:     '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  externalLink: '<path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/>',
  calendar:     '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  arrowDown:    '<path d="M12 5v14M19 12l-7 7-7-7"/>',
  arrowUp:      '<path d="M12 19V5M5 12l7-7 7 7"/>',
  arrowRight:   '<path d="M5 12h14M12 5l7 7-7 7"/>',
  minus:        '<path d="M5 12h14"/>',
  help:         '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  // Feather "info". El de alerta es el mismo círculo con la marca arriba: se
  // lee como advertencia y no corresponde en un aviso neutro.
  info:         '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  scale:        '<path d="M12 3v18M5 7h14"/><path d="M5 7l-3 6h6zM19 7l-3 6h6z"/>',
};

/* -------------------------------------------------------------------------
   Brechas — real vs esperado

   La severidad NO se comunica solo con color: cada estado lleva su propio
   glifo y su propio texto. En escala de grises, en modo de alto contraste o
   para alguien con daltonismo, el glifo y la palabra siguen ahí.
   ------------------------------------------------------------------------- */

export const SEVERIDAD = {
  'supera':          { glifo: 'arrowUp',   clase: 'gap--supera',   texto: 'Supera' },
  'cumple':          { glifo: 'check',     clase: 'gap--cumple',   texto: 'En nivel' },
  'brecha-leve':     { glifo: 'arrowDown', clase: 'gap--leve',     texto: 'Un nivel abajo' },
  'brecha-critica':  { glifo: 'alert',     clase: 'gap--critica',  texto: 'Dos o más abajo' },
  'sin-referencia':  { glifo: 'help',      clase: 'gap--sin-ref',  texto: 'Sin referencia' },
  'sin-evaluar':     { glifo: 'minus',     clase: 'gap--sin-ref',  texto: 'Sin evaluar' },
};

/**
 * Indicador de brecha. Devuelve '' cuando no hay severidad, para que la interfaz
 * siga funcionando contra un backend que todavía no manda estos campos.
 *
 * @param {object} opts.esperado   nivel esperado, para el texto accesible
 * @param {number} opts.escalones  distancia en niveles (negativo = por debajo)
 */
export function gapHtml(severidad, { esperado = null, escalones = null } = {}) {
  const def = SEVERIDAD[severidad];
  if (!def) return '';

  // La lectura completa en palabras: el glifo y el color son apoyo.
  const lectura = severidad === 'sin-referencia'
    ? 'sin nivel esperado con el que comparar'
    : severidad === 'sin-evaluar'
      ? 'sin evaluaciones registradas'
      : `${def.texto.toLowerCase()}${esperado ? `, se espera ${esperado}` : ''}${
          escalones ? ` (${Math.abs(escalones)} ${Math.abs(escalones) === 1 ? 'nivel' : 'niveles'})` : ''}`;

  return `<span class="gap ${def.clase}">
    ${icon(def.glifo, { className: 'gap__icon' })}
    <span aria-hidden="true">${esc(def.texto)}</span>
    <span class="sr-only">${esc(lectura)}</span>
  </span>`;
}

/**
 * Estado de una evaluación (de estadoEvaluacion en almacen.js) como etiqueta.
 * Texto siempre presente: el color solo acompaña.
 */
export function estadoTareaHtml({ estado, respondidas = 0 }, total = null) {
  if (estado === 'enviada') return '<span class="badge badge--success">Enviada</span>';
  if (estado === 'borrador') {
    return `<span class="badge badge--info">En borrador${total ? ` · ${respondidas} de ${total}` : ''}</span>`;
  }
  return '<span class="badge badge--warning">Sin empezar</span>';
}

/**
 * Total + cumplimiento, siempre juntos.
 *
 * Verificado con datos reales: alguien en 44.88 puede cumplir 18 de 18 y alguien
 * en 70.00 cumplir 3 de 18. El número solo invita a la conclusión contraria, así
 * que este componente no permite mostrar uno sin el otro.
 */
export function totalConCumplimiento({ total, nivel, cumplimiento, margen = null, vecina = null, evaluadas = null, sinEvaluar = 0 }) {
  const num = total === null || total === undefined ? '—' : Number(total).toFixed(1);
  const cerca = margen !== null && margen !== undefined && vecina && margen <= 3;
  // «Sin nivel esperado» y «nadie evaluó todavía» se veían igual: al abrir la
  // ronda todo el mundo parecía no tener brechas.
  const sinDatos = evaluadas === 0;

  return `<div class="score-total">
    <div class="score-total__cifra">
      <span class="score-total__num numeric">${esc(num)}</span>
      ${num !== '—' ? '<span class="score-total__escala">de 100</span>' : ''}
      ${nivel ? `<span class="badge badge--neutral">${esc(nivel)}</span>` : ''}
    </div>
    ${sinDatos
      ? '<p class="score-total__cumple">Todavía no hay evaluaciones en esta ronda: el resultado aparece cuando llegue la primera.</p>'
      : cumplimiento
        ? `<p class="score-total__cumple">
             <b class="numeric">${cumplimiento.cumple} de ${cumplimiento.total}</b>
             habilidades en su nivel esperado${sinEvaluar
               ? ` · <span class="texto-aviso">${sinEvaluar} ${sinEvaluar === 1 ? 'sin evaluar' : 'sin evaluar todavía'}</span>` : ''}
           </p>`
        : '<p class="score-total__cumple">El cargo no define un nivel esperado: no hay brechas que medir.</p>'}
    ${cerca
      ? `<p class="score-total__umbral">
           ${icon('alert')}
           <span>${Number(margen) < 0.05
             ? `Justo en el borde con ${esc(vecina)}`
             : `A ${Number(margen).toFixed(1)} ${Number(margen).toFixed(1) === '1.0' ? 'punto' : 'puntos'} de ${esc(vecina)}`}.
           Un solo cambio de criterio puede moverlo, así que mira el número y no solo el nivel.</span>
         </p>`
      : ''}
  </div>`;
}

function resaltarNombre(mensaje, persona) {
  const texto = esc(mensaje ?? '');
  if (!persona) return texto;
  const nombre = esc(persona);
  const i = texto.indexOf(nombre);
  if (i === -1) return texto;
  return `${texto.slice(0, i)}<b>${nombre}</b>${texto.slice(i + nombre.length)}`;
}

/**
 * Lista de avisos del tablero. Cada uno es una fila con severidad e icono.
 * `avisos` viene del backend con el mensaje ya redactado.
 */
export function avisosHtml(avisos) {
  if (!avisos?.length) return '';
  const orden = { alta: 0, media: 1, baja: 2 };
  const glifo = { alta: 'alert', media: 'alert', baja: 'help' };

  return `<ul class="avisos">
    ${[...avisos]
      .sort((a, b) => (orden[a.severidad] ?? 9) - (orden[b.severidad] ?? 9))
      .map((a) => `<li class="aviso aviso--${esc(a.severidad)}">
        ${icon(glifo[a.severidad] ?? 'alert', { className: 'aviso__icon' })}
        <span>${resaltarNombre(a.mensaje, a.persona)}</span>
      </li>`).join('')}
  </ul>`;
}

/**
 * Inline SVG icon.
 * Decorative by default (aria-hidden). Pass a `label` only when the icon is
 * the sole carrier of meaning — an icon beside its own text label must stay
 * hidden, or screen readers announce the same thing twice.
 */
export function icon(name, { className = '', label = null, size = null } = {}) {
  const path = ICON_PATHS[name];
  if (!path) return '';
  // Coerced to a number rather than interpolated raw: `size` reaching an
  // unquoted SVG attribute is the shape that becomes an injection hole the
  // first time an API value is passed through it.
  const px = size === null ? null : Number(size);
  const dims = Number.isFinite(px) && px > 0
    ? `width="${px}" height="${px}"`
    : 'width="1em" height="1em"';
  const a11y = label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true" focusable="false"';
  return `<svg ${dims} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" class="${esc(className)}" ${a11y}>${path}</svg>`;
}

/* -------------------------------------------------------------------------
   Score rendering
   ------------------------------------------------------------------------- */

export const SCORE_MAX = 5;

/** Threshold bands. Kept here so every page agrees on what "low" means. */
export function scoreLevel(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'none';
  if (value < 3) return 'low';
  if (value < 4) return 'mid';
  return 'high';
}


/**
 * Score as three redundant signals: the numeral, a segmented meter (shape and
 * position), and color — in that order of priority. The sr-only span carries
 * the whole reading as words.
 *
 * Replaces the PoC's colored-number-only treatment, which conveyed the band
 * exclusively through hue.
 */
export function scoreHtml(value, { label = '' } = {}) {
  const level = scoreLevel(value);
  const filled = level === 'none' ? 0 : Math.round(value);
  const shown = level === 'none' ? '—' : Number(value).toFixed(1);

  const segments = Array.from({ length: SCORE_MAX }, (_, i) =>
    `<span class="score__seg${i < filled ? ' is-on' : ''}"></span>`).join('');

  // La lectura en palabras es la valoración cualitativa del instrumento (hoja
  // ESCALA de V6), no un "bajo / medio / alto" propio: esa escala de tres venía
  // del prototipo y no existía en ningún documento de RRHH.
  const concepto = level === 'none' ? null : conceptoEs(value);
  const reading = level === 'none'
    ? `${label ? label + ': ' : ''}sin datos`
    : `${label ? label + ': ' : ''}${shown} de ${SCORE_MAX}${concepto ? `, ${concepto}` : ''}`;

  // The numeral is aria-hidden alongside the meter: the .sr-only span is the
  // complete reading, so exposing both made every cell announce twice
  // ("3.4 — Promedio general de X: 3.4 de 5, nivel medio"), 24 times over on
  // the team table alone.
  return `<span class="score" data-level="${level}">
    <span class="score__value" aria-hidden="true">${esc(shown)}</span>
    <span class="score__meter" aria-hidden="true">${segments}</span>
    ${concepto ? `<span class="score__concepto" aria-hidden="true">${esc(concepto)}</span>` : ''}
    <span class="sr-only">${esc(reading)}</span>
  </span>`;
}

/* -------------------------------------------------------------------------
   Busy state

   A button that stays enabled during an async call can be double-submitted,
   which in this portal means duplicate mentorships and duplicate commitments.
   setBusy locks it and announces the wait.
   ------------------------------------------------------------------------- */

export function setBusy(button, busy) {
  if (!button) return;
  if (busy) {
    // Re-entry guard: a second overlapping call would record prevDisabled as
    // "true" (the state the first call just set), and releasing the outer call
    // would then restore disabled=true permanently — no way back but a reload.
    if (button.dataset.prevDisabled !== undefined) return;
    button.dataset.prevDisabled = String(button.disabled);
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
  } else {
    button.disabled = button.dataset.prevDisabled === 'true';
    button.removeAttribute('aria-busy');
    delete button.dataset.prevDisabled;
  }
}

/** Región sr-only donde se anuncia la espera ("Enviando…"). Una para toda la página. */
function regionOcupado() {
  let r = document.getElementById('estado-ocupado');
  if (!r) {
    r = document.createElement('p');
    r.id = 'estado-ocupado';
    r.className = 'sr-only';
    r.setAttribute('role', 'status');
    document.body.appendChild(r);
  }
  return r;
}

/**
 * Wrap an async action so the button is locked for its duration, always released.
 *
 * `label` se anuncia a lectores de pantalla mientras dura la espera: con un
 * servidor que tarda segundos, un botón que solo se deshabilita es silencio.
 * Deshabilitar el botón enfocado manda el foco a <body>; al terminar, si nadie
 * lo movió, vuelve al botón.
 */
export async function withBusy(button, fn, { label = null } = {}) {
  const teniaFoco = document.activeElement === button;
  // Con una etiqueta, el botón la muestra mientras espera («Guardando…»): el
  // giro solo no dice qué está pasando durante los 5 a 10 segundos de una
  // escritura. Sin etiqueta conserva su texto, que ya describe la acción.
  // Un botón de solo ícono (quitar un chip) no tiene dónde mostrar texto.
  const conTexto = (b) => { const c = b.cloneNode(true); c.querySelectorAll('.sr-only').forEach((x) => x.remove()); return c.textContent.trim() !== ''; };
  const original = label && button && conTexto(button) ? button.innerHTML : null;
  setBusy(button, true);
  if (original !== null) button.textContent = label;
  const region = regionOcupado();
  region.textContent = label ?? 'Procesando…';
  try {
    return await fn();
  } finally {
    region.textContent = '';
    if (original !== null && button?.isConnected) button.innerHTML = original;
    if (teniaFoco && button?.isConnected && (document.activeElement === document.body || !document.activeElement)) {
      queueMicrotask(() => button.focus());
    }
    setBusy(button, false);
  }
}

/* -------------------------------------------------------------------------
   Toasts

   Replaces alert(), which blocks the main thread, cannot be styled, and gives
   a screen-reader user no context about which action it refers to.
   ------------------------------------------------------------------------- */

/**
 * Two SIBLING live regions, never nested.
 *
 * A role="alert" child inside an aria-live="polite" parent is governed by the
 * parent, so the assertive intent is swallowed and a failed save gets queued
 * politely behind whatever is already speaking — the user can act on stale
 * state believing the write succeeded. Routing by variant into two separate
 * regions is the only way to get both politeness levels.
 *
 * Both regions are created empty and returned; the caller appends on a later
 * frame (see toast()). Assistive tech must observe a live region BEFORE its
 * content mutates, so a region injected and filled in the same task reliably
 * fails to announce its first message in NVDA, JAWS and VoiceOver.
 */
function toastRegions() {
  let wrap = document.querySelector('.toast-region');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-region';

    const polite = document.createElement('div');
    polite.dataset.live = 'polite';
    polite.setAttribute('role', 'status');
    polite.setAttribute('aria-live', 'polite');

    const assertive = document.createElement('div');
    assertive.dataset.live = 'assertive';
    assertive.setAttribute('role', 'alert');
    assertive.setAttribute('aria-live', 'assertive');

    wrap.append(polite, assertive);
    document.body.append(wrap);
  }
  return {
    polite: wrap.querySelector('[data-live="polite"]'),
    assertive: wrap.querySelector('[data-live="assertive"]'),
    wrap,
  };
}

/** Beyond this many visible toasts, the oldest is dropped. */
const TOAST_MAX = 3;

/**
 * @param {'success'|'error'|'info'} variant
 * Errors persist until dismissed — auto-dismissing a failure the user may not
 * have looked at yet loses the only report of it. Because they persist, they
 * MUST be dismissible, or two failures pin permanent cards over the bottom of
 * the viewport until a reload.
 */
export function toast(message, variant = 'info', { timeout = null } = {}) {
  const regions = toastRegions();
  const region = variant === 'error' ? regions.assertive : regions.polite;

  const el = document.createElement('div');
  el.className = `toast toast--${variant}`;

  const glyph = variant === 'success' ? 'check' : variant === 'error' ? 'alert' : 'inbox';
  const ms = timeout ?? (variant === 'error' ? 0 : 4000);

  el.innerHTML = `${icon(glyph, { className: 'toast__icon' })}
    <span class="toast__text">${esc(message)}</span>
    ${ms > 0 ? '' : `<button type="button" class="toast__close" aria-label="Descartar mensaje">
        ${icon('close')}
      </button>`}`;

  el.querySelector('.toast__close')?.addEventListener('click', () => el.remove());

  // Deferred by one macrotask, NOT by requestAnimationFrame.
  //
  // rAF callbacks do not run while the page is not compositing — a background
  // tab, a minimised window, a hidden pane. Deferring on rAF therefore swallows
  // the toast entirely and silently in exactly the situations where a queued
  // notification matters most. setTimeout always fires, and still lets the live
  // region be observed before it mutates.
  setTimeout(() => {
    region.append(el);

    const visible = regions.wrap.querySelectorAll('.toast');
    for (let i = 0; i < visible.length - TOAST_MAX; i += 1) visible[i].remove();
  }, 0);

  if (ms > 0) setTimeout(() => el.remove(), ms);
  return el;
}

/* -------------------------------------------------------------------------
   Field errors

   Message sits next to the field, is tied to it with aria-describedby, and
   marks the control aria-invalid. The PoC used alert() for all validation,
   which never associated the complaint with the input it was about.
   ------------------------------------------------------------------------- */

/** Monotonic, so two id-less controls sharing a `name` cannot collide. */
let errorSeq = 0;

export function setFieldError(control, message) {
  if (!control) return;
  const field = control.closest('.field') ?? control.parentElement;
  if (!field) return;

  let errorEl = field.querySelector('.field__error');
  if (!errorEl) {
    errorEl = document.createElement('p');
    errorEl.className = 'field__error';
    // Derived from the control's own id when it has one. Falling back to
    // slug(name) produced duplicate ids for two <input name="pin"> without
    // ids — both controls then pointed at the same element, so the second
    // field announced the first field's error.
    if (!control.id) control.id = `field-${++errorSeq}`;
    errorEl.id = `${control.id}-error`;
    field.append(errorEl);
  }

  // The error is APPENDED to aria-describedby, not substituted for it.
  // Overwriting wholesale silently dropped any hint the field already had —
  // and hints on this portal carry information that exists nowhere else, such
  // as the warning that framework content is published to the whole team.
  const described = (control.getAttribute('aria-describedby') || '')
    .split(/\s+/).filter((token) => token && token !== errorEl.id);

  if (message) {
    field.classList.add('field--error');
    errorEl.innerHTML = `${icon('alert')}<span>${esc(message)}</span>`;
    control.setAttribute('aria-invalid', 'true');
    control.setAttribute('aria-describedby', [...described, errorEl.id].join(' '));
  } else {
    field.classList.remove('field--error');
    errorEl.textContent = '';
    control.removeAttribute('aria-invalid');
    if (described.length) control.setAttribute('aria-describedby', described.join(' '));
    else control.removeAttribute('aria-describedby');
  }
}

export function clearFieldErrors(root = document) {
  // Routed through setFieldError so the describedby bookkeeping stays in one
  // place and hints survive the clear.
  root.querySelectorAll('.field--error [aria-invalid]').forEach((control) =>
    setFieldError(control, null));

  // Any field left marked without an invalid control (e.g. markup-authored).
  root.querySelectorAll('.field--error').forEach((field) => {
    field.classList.remove('field--error');
    const err = field.querySelector('.field__error');
    if (err) err.textContent = '';
  });
}

/**
 * Validate required controls, mark all failures at once, focus the first.
 * Reporting every problem in one pass beats one-at-a-time alerts.
 * @returns {boolean} true when every control passed
 */
export function validateRequired(controls) {
  let firstBad = null;
  for (const [control, message] of controls) {
    const empty = !control || !String(control.value ?? '').trim();
    setFieldError(control, empty ? message : null);
    if (empty && !firstBad) firstBad = control;
  }
  if (firstBad) firstBad.focus();
  return !firstBad;
}

/* -------------------------------------------------------------------------
   States
   ------------------------------------------------------------------------- */

export function emptyState({ title, body = '', glyph = 'inbox' }) {
  return `<div class="state">
    ${icon(glyph, { className: 'state__icon', size: 32 })}
    <p class="state__title">${esc(title)}</p>
    ${body ? `<p class="state__body">${esc(body)}</p>` : ''}
  </div>`;
}

export function errorState({ title = 'No se pudieron cargar los datos', body = '', retryLabel = 'Reintentar' }) {
  return `<div class="state">
    ${icon('alert', { className: 'state__icon', size: 32 })}
    <p class="state__title">${esc(title)}</p>
    ${body ? `<p class="state__body">${esc(body)}</p>` : ''}
    <button type="button" class="btn btn--secondary btn--sm" data-retry>${esc(retryLabel)}</button>
  </div>`;
}

/** Skeleton rows sized to the content they stand in for, so the layout does
 *  not jump when the real data lands. */
export function skeletonRows(count, height = '2.5rem') {
  // Height is validated against a length pattern rather than interpolated into
  // style="" as-is. Nothing passes an API value here today, but an unguarded
  // value inside a style attribute is the one interpolation esc() cannot make
  // safe, so the guard belongs at the boundary.
  const safe = /^\d+(\.\d+)?(px|rem|em)$/.test(String(height)) ? height : '2.5rem';
  const n = Math.max(0, Math.min(50, Number(count) || 0));
  return Array.from({ length: n },
    () => `<div class="skeleton skeleton--row" style="height:${safe}"></div>`).join('');
}

/* -------------------------------------------------------------------------
   Scrollable regions

   A horizontally scrollable box must be keyboard-reachable — otherwise a
   keyboard-only user on a narrow window simply cannot see the right-hand
   columns. But the tab stop must exist only WHILE it overflows: a permanent
   tabindex on a box that fits its content is a stop that does nothing and
   announces nothing.

   Centralised here because it was previously implemented on one page and
   commented as done in components.css, while three other overflowing tables —
   including the wizard's own review step — had no tabindex at all.
   ------------------------------------------------------------------------- */

const SCROLLABLE = '.table-wrap';

export function sincronizarScrollables(root = document) {
  root.querySelectorAll(SCROLLABLE).forEach((wrap) => {
    // Un contenedor dentro de una sección oculta mide 0 en todo. Medir ahí y
    // concluir "no desborda" es lo que dejaba la tabla sin tabindex: las páginas
    // llenan el <tbody> antes de revelar la sección, así que el cálculo caía
    // siempre en el caso 0. No se toca hasta que exista layout.
    if (wrap.clientWidth === 0) return;

    // +1 absorbs sub-pixel rounding, which otherwise reports a phantom 1px
    // overflow on fractional layouts.
    if (wrap.scrollWidth > wrap.clientWidth + 1 || wrap.scrollHeight > wrap.clientHeight + 1) {
      wrap.setAttribute('tabindex', '0');
      // A focusable region needs a name. Derive it from the table's own caption
      // rather than inventing one, so it matches what the user sees.
      if (!wrap.getAttribute('aria-label') && !wrap.getAttribute('aria-labelledby')) {
        const caption = wrap.querySelector('caption')?.textContent.trim();
        wrap.setAttribute('role', 'region');
        wrap.setAttribute('aria-label', caption
          ? `${caption.replace(/\.$/, '')}, desplazable`
          : 'Tabla desplazable');
      }
    } else {
      wrap.removeAttribute('tabindex');
    }
  });
}

/**
 * Keep every scrollable region in `root` in sync as the viewport changes.
 * Pages that replace table contents must also call sincronizarScrollables()
 * directly — swapping a tbody changes the CONTENT width without changing the
 * wrapper's own box, which a ResizeObserver does not report.
 */
export function observarScrollables(root = document) {
  sincronizarScrollables(root);

  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => sincronizarScrollables(root));
    root.querySelectorAll(SCROLLABLE).forEach((wrap) => ro.observe(wrap));
    return ro;
  }
  window.addEventListener('resize', () => sincronizarScrollables(root));
  return null;
}

/* -------------------------------------------------------------------------
   Modal helpers over native <dialog>
   ------------------------------------------------------------------------- */

/**
 * Open a <dialog> modally and focus its first meaningful control.
 * showModal() supplies the focus trap, Escape handling, inert background and
 * backdrop that the PoC's div overlay lacked.
 */
export function openModal(dialog, { focus = null } = {}) {
  if (!dialog) return;
  dialog.showModal();
  const target = focus ?? dialog.querySelector('input, select, textarea, button:not([data-close])');
  target?.focus();
}

export function closeModal(dialog) {
  if (dialog?.open) dialog.close();
}

/** Wire [data-close] buttons and backdrop clicks. Escape is already native. */
export function bindModal(dialog) {
  if (!dialog) return;
  dialog.querySelectorAll('[data-close]').forEach((btn) =>
    btn.addEventListener('click', () => closeModal(dialog)));

  // A click landing on the dialog element itself is a backdrop click; clicks
  // on children bubble from inside the box and must not close it.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeModal(dialog);
  });
}

/**
 * Confirmación con la consecuencia por escrito. Resuelve true o false.
 *
 * El botón que destruye dice qué destruye («Eliminar el plan», no «Aceptar») y
 * va en rojo; el foco arranca en la opción segura, así un Enter apurado no
 * borra nada.
 */
export function confirmar({ titulo, cuerpo = '', aceptar, cancelar = 'Cancelar', peligro = false }) {
  return new Promise((resolve) => {
    const d = document.createElement('dialog');
    d.className = 'modal';
    d.setAttribute('aria-labelledby', 'confirmar-titulo');
    if (cuerpo) d.setAttribute('aria-describedby', 'confirmar-cuerpo');
    d.innerHTML = `
      <div class="modal__body">
        <h2 class="modal__title" id="confirmar-titulo">${esc(titulo)}</h2>
        ${cuerpo ? `<p class="modal__lede" id="confirmar-cuerpo">${esc(cuerpo)}</p>` : ''}
        <div class="modal__actions">
          <button type="button" class="btn btn--secondary" data-no>${esc(cancelar)}</button>
          <button type="button" class="btn ${peligro ? 'btn--danger' : 'btn--primary'}" data-si>${esc(aceptar)}</button>
        </div>
      </div>`;
    const volver = document.activeElement;
    let respuesta = false;
    d.querySelector('[data-si]').addEventListener('click', () => { respuesta = true; d.close(); });
    d.querySelector('[data-no]').addEventListener('click', () => d.close());
    d.addEventListener('close', () => {
      d.remove();
      if (volver?.isConnected) volver.focus();
      resolve(respuesta);
    });
    document.body.appendChild(d);
    d.showModal();
    d.querySelector('[data-no]').focus();
  });
}

/* -------------------------------------------------------------------------
   Chart defaults — so charts inherit the design system instead of Chart.js's
   own palette and font.
   ------------------------------------------------------------------------- */

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function applyChartDefaults(Chart) {
  if (!Chart) return;
  Chart.defaults.font.family = cssVar('--font-sans') || 'system-ui, sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.color = cssVar('--color-text-muted');
  Chart.defaults.borderColor = cssVar('--color-chart-grid');
  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.maintainAspectRatio = false;

  // Honour the OS motion preference — Chart.js animates by default. The CSS
  // side is handled by the @media block in base.css, but Chart.js animates on
  // canvas, which CSS cannot reach.
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  // The library's own default is captured, not reconstructed. Assigning
  // `undefined` to restore it does NOT work — Chart.js iterates this object
  // internally and throws "Cannot convert undefined or null to object" on the
  // next render.
  const baseAnimation = Chart.defaults.animation;
  const applyMotion = (reduce) => {
    Chart.defaults.animation = reduce ? false : baseAnimation;
  };
  applyMotion(motionQuery.matches);
  // Listened to, not just read once: toggling the OS setting mid-session left
  // charts animating until a reload.
  motionQuery.addEventListener('change', (event) => applyMotion(event.matches));
}

export const chartPalette = () =>
  [1, 2, 3, 4, 5, 6].map((n) => cssVar(`--color-chart-${n}`));
