/* =========================================================================
   RUTEO — navegación interna del portal
   =========================================================================
   Rutas por hash y no por historia limpia: el portal se publica como archivos
   estáticos, y con rutas reales cada recarga en `/equipo` daría 404 porque no
   hay servidor que reescriba. Con hash funciona igual en cualquier hosting.

   Cada vista devuelve HTML y recibe un contexto ya resuelto (sesión y params),
   así que ninguna vista consulta la sesión por su cuenta ni decide si el
   usuario tiene permiso: eso se resuelve una sola vez, acá.
   ========================================================================= */

const rutas = [];
let contenedor = null;
let antes = null;
let despues = null;
let actual = null;

/**
 * Registra una vista.
 * @param {string} patron   '#/evaluar/:id' — los `:nombre` se vuelven params
 * @param {object} opciones {rol} exige uno de esos roles; {publica} no exige sesión
 */
export function ruta(patron, vista, opciones = {}) {
  const partes = patron.replace(/^#\/?/, '').split('/').filter(Boolean);
  rutas.push({ patron, partes, vista, ...opciones });
}

export function configurar({ montarEn, alEntrar, alSalir }) {
  contenedor = montarEn;
  antes = alEntrar;
  despues = alSalir;
}

function emparejar(hash) {
  const partes = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  for (const r of rutas) {
    if (r.partes.length !== partes.length) continue;
    const params = {};
    let calza = true;
    for (let i = 0; i < r.partes.length; i += 1) {
      const patron = r.partes[i];
      if (patron.startsWith(':')) params[patron.slice(1)] = decodeURIComponent(partes[i]);
      else if (patron !== partes[i]) { calza = false; break; }
    }
    if (calza) return { ...r, params };
  }
  return null;
}

export const rutaActual = () => actual;

export function ir(hash, { reemplazar = false } = {}) {
  if (location.hash === hash) { resolver(); return; }
  if (reemplazar) history.replaceState(null, '', hash);
  else location.hash = hash;
  if (reemplazar) resolver();
}

/**
 * Selector estable de un elemento: su id o su primer atributo data-*. Sirve
 * para volver a encontrar "el mismo" control después de un repintado, cuando
 * el nodo original ya no existe.
 */
export function selectorDe(el) {
  if (!el || el === document.body) return null;
  if (el.id) return `#${CSS.escape(el.id)}`;
  const data = [...el.attributes].find((a) => a.name.startsWith('data-'));
  return data ? `[${data.name}="${CSS.escape(data.value)}"]` : null;
}

/**
 * Pinta la ruta actual.
 *
 * `conservar`: repintado tras guardar algo, no una navegación. Sin esqueleto,
 * sin volver arriba y con el foco en el mismo control que lo tenía. Sin esto,
 * cada guardado de administración saltaba al inicio de la página y dejaba el
 * foco en <body>: quien navega con teclado perdía su lugar en cada cambio.
 */
export async function resolver({ conservar = false, enfocar = null } = {}) {
  const hash = location.hash || '#/';
  const encontrada = emparejar(hash) ?? emparejar('#/404');
  if (!encontrada) {
    contenedor.innerHTML = '<p>Ruta no encontrada.</p>';
    return;
  }

  const contexto = antes ? antes(encontrada) : {};
  // `antes` puede redirigir (por ejemplo, a la pantalla de entrada). Cuando lo
  // hace devuelve `{redirigir}` y no se monta nada: el cambio de hash vuelve a
  // entrar acá con la ruta correcta.
  if (contexto?.redirigir) { ir(contexto.redirigir, { reemplazar: true }); return; }

  actual = encontrada;
  if (actual.limpiar) actual.limpiar();

  const scroll = window.scrollY;
  const foco = enfocar ?? (conservar ? selectorDe(document.activeElement) : null);
  if (!conservar) contenedor.innerHTML = '<div class="skeleton skeleton--kpi" aria-hidden="true"></div>';
  try {
    const salida = await encontrada.vista({ ...contexto, params: encontrada.params });
    if (typeof salida === 'string') contenedor.innerHTML = salida;
    else if (salida?.html !== undefined) {
      contenedor.innerHTML = salida.html;
      salida.montado?.(contenedor);
      actual.limpiar = salida.limpiar ?? null;
    }
  } catch (error) {
    console.error(error);
    contenedor.innerHTML = `<div class="callout callout--error" role="alert">
      <span>No se pudo abrir esta pantalla. ${escapar(error.message ?? '')}</span></div>`;
  }

  if (conservar) {
    window.scrollTo({ top: scroll, behavior: 'instant' });
    const destino = foco ? contenedor.querySelector(foco) : null;
    if (destino && !document.querySelector('dialog[open]')) destino.focus({ preventScroll: true });
  } else {
    // El foco va al contenido: sin esto, quien navega con teclado o lector de
    // pantalla se queda en el enlace del menú y no sabe que la pantalla cambió.
    // Salvo que la vista ya lo haya puesto en un campo (el ingreso lo hace).
    if (!contenedor.contains(document.activeElement) || document.activeElement === contenedor) {
      contenedor.focus({ preventScroll: true });
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  // El título de la pestaña dice dónde se está (WCAG 2.4.2).
  const h1 = contenedor.querySelector('h1')?.textContent.trim();
  document.title = h1 ? `${h1} · Desarrollo de Carrera` : 'Desarrollo de Carrera';
  despues?.(actual);
}

export function iniciarRuteo() {
  window.addEventListener('hashchange', resolver);
  resolver();
}

const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
