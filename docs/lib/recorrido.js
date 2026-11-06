/* =========================================================================
   VISITA GUIADA — globos paso a paso sobre la pantalla actual
   =========================================================================
   Un globo a la vez, pegado a la parte de la pantalla que explica, con
   «Atrás», «Siguiente» y «Saltar». Corre sola la primera vez que alguien entra
   a la herramienta (en Inicio); después se repite cuando la persona quiera,
   desde Ayuda → «Visita guiada de esta pantalla».

   Por qué así (diseño instruccional):
   - Una idea por globo y como máximo 5 por pantalla (carga cognitiva).
   - Señala la parte real, no una imagen de ella (señalización y contigüidad:
     la explicación junto a lo que explica).
   - Se explica justo cuando hace falta, no en un manual previo.

   Accesible: el globo es un diálogo con nombre y descripción; el foco entra
   al globo, Tab no sale de él, Escape lo cierra y el foco vuelve a un lugar
   visible. Lo que no se explica queda atenuado pero no bloqueado para el
   mouse. Sin animación si la persona pidió menos movimiento.
   ========================================================================= */

import { esc } from './ui.js';

const MAX_PASOS = 5;

/**
 * Los pasos de cada pantalla. `sel` es lo que se señala; si no está en la
 * pantalla (por ejemplo, un bloque que solo ve un líder), ese paso se salta.
 * Un paso sin `sel` es un globo centrado. Si se señala el título de una
 * sección, se marca la sección entera.
 */
const RECORRIDOS = {
  inicio: [
    { titulo: 'Qué es esta herramienta', texto: 'Sirve para evaluar las habilidades de cada cargo y acordar planes de desarrollo. Arriba, en «Ayuda», están el manual y esta visita, cuando la necesites.' },
    { sel: '#t-auto', titulo: 'Tu autoevaluación', texto: 'Si aparece esta tarjeta, es lo primero que te toca: calificar tus habilidades. Se guarda sola mientras avanzas.' },
    { sel: '#t-eq', titulo: 'Tu equipo', texto: 'Si lideras personas, aquí ves a quién te falta evaluar. «Evaluar» abre su formulario.' },
    { sel: '#t-pares', titulo: 'Te pidieron evaluar', texto: 'Compañeros que te asignaron. Califica solo lo que has visto.' },
    { sel: '#t-mio', titulo: 'Tu resultado', texto: 'Tu nivel y lo que te falta, cuando ya haya evaluaciones. «Ver Mi desarrollo» abre el detalle.' },
    { sel: '#t-admin', titulo: 'Administración', texto: 'Lo que falta en la ronda. Cada cifra lleva a donde se corrige.' },
  ],
  'mi-desarrollo': [
    { sel: '#t-estado', titulo: 'Dónde estás hoy', texto: 'Tu puntaje (de 40 a 100), tu nivel y cuántas habilidades están en el nivel que tu cargo espera.' },
    { sel: '#t-avisos', titulo: 'Resultado parcial', texto: 'Si falta la evaluación de alguien, el puntaje vale, pero puede cambiar cuando llegue.' },
    { sel: '#t-prio', titulo: 'Lo que te falta', texto: 'Las habilidades por debajo de lo que tu cargo espera, de la más importante a la menos.' },
    { sel: '#t-plan', titulo: 'Tu plan', texto: 'Cuando tu líder proponga un plan, lo abres desde aquí.' },
    { sel: '#t-miradas', titulo: 'Cómo te ven', texto: 'Tu autoevaluación, la de tu líder y la de tus pares, lado a lado. Donde se separan, vale la pena conversarlo.' },
  ],
  evaluar: [
    { sel: '.wizard__progress', titulo: 'Tu avance', texto: 'Cuántas preguntas llevas. Se guarda en este navegador mientras avanzas.' },
    { sel: '.wizard fieldset.choices', titulo: 'Elige por la descripción', texto: 'Cada nivel trae lo que significa. Elige el que mejor describe lo que se hace hoy, no lo que se espera del cargo.' },
    { sel: '#wizard-next', titulo: 'Siguiente', texto: 'Al final verás todas tus respuestas juntas para revisarlas antes de enviar.' },
  ],
  equipo: [
    { sel: '#t-res', titulo: 'Tu equipo de un vistazo', texto: 'Cuántas evaluaciones te faltan, quién cumple su nivel y quién tiene algo por mejorar.' },
    { sel: '.avisos-plegados', titulo: 'Avisos', texto: 'Qué números todavía son parciales. Ábrelo antes de sacar conclusiones.' },
    { sel: '#t-per', titulo: 'Persona por persona', texto: 'Primero quien más lejos está de su nivel. El nombre abre su detalle; «Evaluar» abre su formulario.' },
    { sel: '#t-matriz', titulo: 'Matriz de talento', texto: 'Ubica a cada persona según sus funciones y sus habilidades, con una recomendación por casilla.' },
  ],
  persona: [
    { sel: '.page-header--acciones .btn-group', titulo: 'Qué hacer con esta persona', texto: 'Evaluarla y escribir su plan. Las acciones están arriba para no tener que buscarlas.' },
    { sel: '.pager', titulo: 'Siguiente persona', texto: 'Pasa a la anterior o la siguiente de tu equipo sin volver a la lista.' },
    { sel: '#t-prio', titulo: 'Lo que le falta', texto: 'Lo que está por debajo del nivel que su cargo espera. Es la base del plan.' },
    { sel: '#t-sim', titulo: 'Simulador', texto: 'Cambia un nivel para ver cómo se movería el resultado. No guarda nada.' },
  ],
  plan: [
    { sel: '#t-planes', titulo: 'Planes propuestos', texto: 'Los planes que ya existen. Se pueden imprimir o descargar para la conversación.' },
    { sel: '#t-form', titulo: 'Escribir el plan', texto: 'El borrador ya trae lo que le falta a la persona. Complétalo con ella: proyecto, mentoría, formación y una meta que se pueda medir.' },
  ],
  organizacion: [
    { sel: '#org-area', titulo: 'Elige un área', texto: 'Todo lo de abajo se recalcula para el área que elijas.' },
    { sel: '#t-org-matriz', titulo: 'Matriz de la organización', texto: 'Cada nombre abre su detalle. Si una casilla tiene muchas personas, la lista completa está en «Ver como tabla».' },
  ],
  admin: [
    { sel: '.subnav', titulo: 'Secciones de administración', texto: 'Personas, equipos, cargos, catálogo, pares, ronda y auditoría.' },
    { sel: 'main .table-wrap, main .cargos, main .card', titulo: 'Cada cambio queda registrado', texto: 'Al guardar puedes escribir el motivo. Todo queda en Auditoría: quién, cuándo, antes y después.' },
    { sel: '#btn-ayuda', titulo: 'Del Excel al portal', texto: 'En Ayuda está el manual de administración: dónde quedó cada hoja del Excel.' },
  ],
};

/** Qué visita corresponde a una ruta. */
export function claveDe(hash) {
  const h = hash || '#/';
  if (h === '#/' || h === '') return 'inicio';
  if (h.startsWith('#/mi-desarrollo')) return 'mi-desarrollo';
  if (h.startsWith('#/autoevaluacion') || h.startsWith('#/evaluar/')) return 'evaluar';
  if (h.startsWith('#/equipo')) return 'equipo';
  if (h.startsWith('#/persona/')) return 'persona';
  if (h.startsWith('#/plan/')) return 'plan';
  if (h.startsWith('#/organizacion')) return 'organizacion';
  if (h.startsWith('#/admin/')) return 'admin';
  return null;
}

export const hayRecorrido = (hash) => Boolean(RECORRIDOS[claveDe(hash)]);

const LLAVE = (usuario) => `cdp.recorrido-visto.${usuario}`;
export function yaVioRecorrido(usuario) {
  try { return localStorage.getItem(LLAVE(usuario)) === '1'; } catch { return true; }
}
function marcarVisto(usuario) {
  try { localStorage.setItem(LLAVE(usuario), '1'); } catch { /* se ofrecerá de nuevo */ }
}

let activo = null;

/** Cierra la visita en curso. Al cambiar de pantalla no se devuelve el foco: lo pone el ruteo. */
export function cerrarRecorrido({ devolverFoco = false } = {}) { activo?.cerrar({ devolverFoco }); }

const enPantalla = (el) => el && el.isConnected && el.getClientRects().length > 0;

/**
 * Inicia la visita de la pantalla actual. Devuelve false si no hay pasos
 * visibles. `usuario` la marca como vista al terminarla o saltarla.
 */
export function iniciarRecorrido({ hash = location.hash, usuario = null, volverA = null } = {}) {
  cerrarRecorrido();
  const buscar = (sel) => (sel ? [...document.querySelectorAll(sel)].find(enPantalla) : null);
  const pasos = (RECORRIDOS[claveDe(hash)] ?? []).filter((p) => !p.sel || buscar(p.sel)).slice(0, MAX_PASOS);
  if (!pasos.length) return false;

  const origen = volverA ?? document.activeElement;
  const marco = document.createElement('div');
  marco.className = 'recorrido__marco';
  marco.setAttribute('aria-hidden', 'true');
  const globo = document.createElement('div');
  globo.className = 'recorrido';
  globo.setAttribute('role', 'dialog');
  globo.setAttribute('aria-modal', 'true');
  globo.setAttribute('aria-labelledby', 'recorrido-paso recorrido-titulo');
  globo.setAttribute('aria-describedby', 'recorrido-texto');
  globo.tabIndex = -1;
  // Fuera de la pantalla hasta que se ubica: sin destello en una esquina.
  globo.style.top = '-9999px';
  document.body.append(marco, globo);

  let i = 0;
  let objetivo = null;
  let cuadro = 0;

  const objetivoDe = (p) => {
    const el = buscar(p.sel);
    return el?.matches('h2, .section__title') ? (el.closest('section') ?? el) : el;
  };

  const ubicar = () => {
    // Si la pantalla se repintó debajo (el asistente cambia de pregunta), se
    // vuelve a buscar el objetivo.
    if (pasos[i].sel && !enPantalla(objetivo)) objetivo = objetivoDe(pasos[i]);
    const g = globo.getBoundingClientRect();
    const margen = 12;
    if (!objetivo) {
      marco.classList.add('recorrido__marco--vacio');
      Object.assign(marco.style, { top: `${innerHeight / 2}px`, left: `${innerWidth / 2}px`, width: '0px', height: '0px' });
      globo.style.top = `${Math.max(margen, (innerHeight - g.height) / 2)}px`;
      globo.style.left = `${Math.max(margen, (innerWidth - g.width) / 2)}px`;
      return;
    }
    const r = objetivo.getBoundingClientRect();
    marco.classList.remove('recorrido__marco--vacio');
    Object.assign(marco.style, {
      top: `${r.top - 6}px`, left: `${r.left - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px`,
    });
    // Debajo si cabe; si no, arriba; si el objetivo es más alto que la
    // pantalla, el globo va abajo de todo para no taparlo de arriba.
    let top = r.bottom + margen;
    if (top + g.height > innerHeight - margen) top = r.top - g.height - margen;
    if (top < margen) top = innerHeight - g.height - margen;
    const left = Math.min(innerWidth - g.width - margen, Math.max(margen, r.left));
    globo.style.top = `${Math.max(margen, top)}px`;
    globo.style.left = `${left}px`;
  };

  // Una sola actualización por cuadro al desplazar. El marco no se anima: con
  // la página desplazándose, la animación lo dejaba corrido del objetivo.
  const alDesplazar = () => {
    cancelAnimationFrame(cuadro);
    cuadro = requestAnimationFrame(ubicar);
  };

  const pintar = () => {
    const p = pasos[i];
    const ultimo = i === pasos.length - 1;
    objetivo = objetivoDe(p);
    globo.innerHTML = `
      <p class="recorrido__paso" id="recorrido-paso">Paso ${i + 1} de ${pasos.length}</p>
      <h2 class="recorrido__titulo" id="recorrido-titulo">${esc(p.titulo)}</h2>
      <p class="recorrido__texto" id="recorrido-texto">${esc(p.texto)}</p>
      <div class="recorrido__acciones">
        ${ultimo ? '<span></span>' : '<button type="button" class="btn btn--ghost" data-saltar>Saltar</button>'}
        <span class="recorrido__nav">
          ${i > 0 ? '<button type="button" class="btn btn--secondary" data-atras>Atrás</button>' : ''}
          ${ultimo ? '<button type="button" class="btn btn--primary" data-fin>Entendido</button>'
            : '<button type="button" class="btn btn--primary" data-siguiente>Siguiente</button>'}
        </span>
      </div>`;
    if (objetivo) {
      const reducir = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const alto = objetivo.getBoundingClientRect().height > innerHeight * 0.6;
      objetivo.scrollIntoView({ block: alto ? 'start' : 'center', behavior: reducir ? 'auto' : 'smooth' });
    }
    ubicar();
    requestAnimationFrame(ubicar);
    setTimeout(ubicar, 350);
    // El foco va al globo: el lector anuncia «Paso N de M», el título y el texto.
    globo.focus({ preventScroll: true });
  };

  const cerrar = ({ devolverFoco = true } = {}) => {
    cancelAnimationFrame(cuadro);
    globo.remove(); marco.remove();
    removeEventListener('resize', alDesplazar);
    removeEventListener('scroll', alDesplazar, true);
    document.removeEventListener('keydown', teclas, true);
    if (usuario) marcarVisto(usuario);
    activo = null;
    if (devolverFoco) {
      const destino = enPantalla(origen) ? origen : document.getElementById('btn-ayuda') ?? document.getElementById('contenido');
      destino?.focus({ preventScroll: true });
    }
  };

  // Tab da la vuelta dentro del globo, y Escape lo cierra salvo que haya un
  // diálogo encima (una confirmación), que se cierra primero.
  function teclas(e) {
    if (document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') { e.preventDefault(); cerrar(); return; }
    if (e.key !== 'Tab') return;
    const botones = [...globo.querySelectorAll('button')];
    if (!botones.length) return;
    const primero = botones[0]; const ultimo = botones[botones.length - 1];
    if (!globo.contains(document.activeElement)) { e.preventDefault(); primero.focus(); return; }
    if (e.shiftKey && (document.activeElement === primero || document.activeElement === globo)) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
  }

  globo.addEventListener('click', (e) => {
    if (e.target.closest('[data-siguiente]')) { i += 1; pintar(); }
    else if (e.target.closest('[data-atras]')) { i -= 1; pintar(); }
    else if (e.target.closest('[data-saltar],[data-fin]')) cerrar();
  });
  addEventListener('resize', alDesplazar);
  addEventListener('scroll', alDesplazar, true);
  document.addEventListener('keydown', teclas, true);

  activo = { cerrar };
  pintar();
  return true;
}
