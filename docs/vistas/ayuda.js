/* =========================================================================
   AYUDA — el manual dentro del portal
   =========================================================================
   Dos manuales en la misma herramienta, a un clic desde cualquier pantalla:

   #/ayuda         Para personas y líderes. Organizado por tarea («Entrar»,
                   «Hacer tu autoevaluación»), no por pantalla, porque la duda
                   llega como «¿cómo hago X?».
   #/ayuda-admin   Para la administración: dónde quedó cada hoja del Excel
                   original (Career Development Tool V6) y qué cambió.

   Cómo está pensado (diseño instruccional y aprendizaje):
   - Organizador previo: «En 30 segundos» da el mapa antes del detalle.
   - Segmentación: una tarea por bloque, 3 o 4 pasos, y solo las tareas del
     rol que la persona elige (carga cognitiva baja).
   - Doble codificación y señalización: cada tarea con la captura real y la
     zona marcada, al lado de los pasos.
   - Práctica de recuperación: una pregunta al final de cada tarea, con la
     razón de la respuesta. Responderla bien marca la tarea como entendida:
     el progreso se gana comprobando, no haciendo clic.
   - Andamiaje que se retira: la visita guiada enseña sobre la pantalla real;
     el manual queda para cuando haga falta.
   - Lenguaje llano y una palabra por idea: «nivel» es Básico a Experto;
     «puntaje» es el número de 40 a 100.
   ========================================================================= */

import { esc, icon, sincronizarScrollables } from '../lib/ui.js';
import { CORREO_AYUDA } from '../config.js';

const IMG = (n) => `ayuda/img/${n}.jpg`;

/* ------------------------------------------------------------- contenido */

// `rol`: 'todos' o 'lider'. `requiere`: qué hace falta para ofrecer «Ir a
// hacerlo» (un cargo, liderar). `img`: una captura por tarea, con la zona
// señalada en % [x, y, ancho, alto] y un texto alternativo que dice qué marca.
// `aviso.peligro`: solo para lo que hace perder trabajo o tiempo.
const TAREAS = [
  {
    id: 'entrar', rol: 'todos', minutos: 1,
    titulo: 'Entrar', para: 'Abrir la herramienta con tu correo, sin contraseña.',
    pasos: [
      'Escribe tu correo de la empresa y elige <b>Enviar código</b>.',
      'Abre tu correo: te llega un código de 6 números. Escríbelo y elige <b>Entrar</b>.',
      'Tu sesión dura 8 horas. Si vence, pides otro código y sigues donde estabas.',
    ],
    img: 'entrar', marca: [33, 34, 33, 26], alt: 'Pantalla de ingreso. Marcados: el campo del código y el botón Entrar.',
    aviso: { texto: 'El código vale 10 minutos. Si no llega, revisa la carpeta de correo no deseado.', peligro: true },
    pregunta: {
      texto: 'El código no llegó. ¿Qué haces primero?',
      opciones: [
        { t: 'Pido varios códigos seguidos.', ok: false, por: 'Cada código nuevo anula el anterior, y hay un límite por hora. Primero revisa el correo no deseado.' },
        { t: 'Reviso la carpeta de correo no deseado.', ok: true, por: 'Es lo más común. Si tampoco está ahí, pide otro después de un minuto.' },
      ],
    },
  },
  {
    id: 'autoevaluacion', rol: 'todos', minutos: 10, ruta: '#/autoevaluacion', requiere: 'cargo',
    titulo: 'Hacer tu autoevaluación', para: 'Calificar tus propias habilidades. Es lo primero que te toca en cada ronda.',
    pasos: [
      'En <b>Inicio</b>, elige <b>Empezar mi autoevaluación</b>.',
      'Verás una habilidad a la vez. Lee las cuatro descripciones y elige la que mejor cuenta <b>lo que haces hoy</b>.',
      'Elige <b>Siguiente</b>. Se guarda solo: puedes cerrar y seguir después.',
      'Al final revisas todo junto y eliges <b>Enviar</b>.',
    ],
    img: 'autoevaluacion', marca: [25, 58, 49, 42], alt: 'Una pregunta de la autoevaluación. Marcadas: las cuatro descripciones de nivel para elegir.',
    aviso: { texto: 'Lo que no enviaste se guarda solo en este computador y este navegador. No uses «Salir» a la mitad: borra lo no enviado.', peligro: true },
    pregunta: {
      texto: '¿Cómo eliges el nivel de una habilidad?',
      opciones: [
        { t: 'Por la descripción que mejor cuenta lo que hago hoy.', ok: true, por: 'Exacto. El nivel que tu cargo espera ya está en el sistema y se compara después.' },
        { t: 'Por el nivel que creo que espera mi cargo.', ok: false, por: 'Eso ya lo sabe el sistema. Si eliges por lo esperado, tu resultado no muestra dónde puedes crecer.' },
      ],
    },
  },
  {
    id: 'resultado', rol: 'todos', minutos: 3, ruta: '#/mi-desarrollo', requiere: 'cargo',
    titulo: 'Ver tu resultado', para: 'Saber en qué nivel estás y qué te falta para el nivel de tu cargo.',
    pasos: [
      'Abre <b>Mi desarrollo</b> en el menú.',
      'Arriba ves tu <b>puntaje</b> (de 40 a 100), tu nivel y cuántas habilidades están en el nivel que tu cargo espera.',
      'Debajo, lo que te falta: las habilidades por debajo de lo esperado, de la más importante a la menos.',
      'Más abajo, cómo te ves tú, cómo te ve tu líder y cómo te ven tus pares.',
    ],
    img: 'mi-desarrollo', marca: [1, 31, 98, 27], alt: 'Mi desarrollo. Marcado: el puntaje, el nivel y cuántas habilidades están en el nivel esperado.',
    aviso: { texto: 'Si dice «parcial», falta la evaluación de alguien. El puntaje vale, pero puede cambiar.' },
    pregunta: {
      texto: 'Tienes 70 de 100 y 3 de 18 habilidades en el nivel de tu cargo. ¿Qué concluyes?',
      opciones: [
        { t: 'Que estoy bien, porque 70 es alto.', ok: false, por: 'El puntaje por sí solo no dice si cumples tu cargo. Por eso siempre aparece junto a cuántas habilidades están en nivel.' },
        { t: 'Que tengo 15 habilidades por trabajar, aunque 70 parezca alto.', ok: true, por: 'Eso es. El puntaje por sí solo no dice si cumples tu cargo: mira siempre las dos cifras juntas.' },
      ],
    },
  },
  {
    id: 'plan', rol: 'todos', minutos: 2, ruta: '#/mi-desarrollo', requiere: 'cargo',
    titulo: 'Ver tu plan de desarrollo', para: 'Leer el plan que te propone tu líder y llevarlo a tu conversación.',
    pasos: [
      'En <b>Mi desarrollo</b>, busca <b>Tu plan de desarrollo</b> y elige <b>Ver mi plan</b>.',
      'Ahí están el objetivo, lo que se propone y las habilidades que trabaja.',
      'Puedes imprimirlo o guardarlo como PDF para tu conversación.',
    ],
    img: 'plan-colab', marca: [1, 55, 96, 36], alt: 'Mi plan de desarrollo. Marcado: el plan con su objetivo, lo propuesto y las habilidades.',
    aviso: { texto: 'El seguimiento del plan no ocurre aquí: lo acuerdas con tu líder.' },
    pregunta: {
      texto: '¿Dónde se hace el seguimiento del plan?',
      opciones: [
        { t: 'Con mi líder, fuera de la herramienta.', ok: true, por: 'Así es. La herramienta propone el plan; el seguimiento lo acuerdan ustedes.' },
        { t: 'En la herramienta, que mide el avance.', ok: false, por: 'La herramienta no mide el avance del plan: solo lo propone y lo deja listo para llevar.' },
      ],
    },
  },
  {
    id: 'par', rol: 'todos', minutos: 10,
    titulo: 'Evaluar a un compañero', para: 'Si te lo pidieron: calificar a un compañero con lo que has visto trabajando con él o ella.',
    pasos: [
      'En <b>Inicio</b>, busca <b>Te pidieron evaluar como par</b> y elige <b>Evaluar</b>.',
      'Funciona igual que tu autoevaluación: una habilidad a la vez, eligiendo por la descripción.',
      'Tu nombre no se muestra: la persona no sabe qué compañero la calificó.',
    ],
    aviso: { texto: 'Califica solo lo que has visto. Si no has podido observar una habilidad, elige el nivel que puedas respaldar con algo concreto.' },
    pregunta: {
      texto: 'No has visto a tu compañero usar una habilidad. ¿Qué haces?',
      opciones: [
        { t: 'Pongo el nivel más alto para no perjudicarlo.', ok: false, por: 'Un nivel inflado esconde lo que la persona puede mejorar, y su plan sale peor.' },
        { t: 'Elijo el nivel que puedo respaldar con algo que sí vi.', ok: true, por: `Bien. Si de verdad no tienes nada que respaldar, escribe a ${CORREO_AYUDA}.` },
      ],
    },
  },
  {
    id: 'evaluar-equipo', rol: 'lider', minutos: 10, ruta: '#/', requiere: 'lider',
    titulo: 'Evaluar a tu equipo', para: 'Calificar a cada persona que lideras directamente.',
    pasos: [
      'En <b>Inicio</b>, en <b>Tu equipo</b>, ves a cada persona con su estado: <b>Sin empezar</b>, <b>En borrador</b> o <b>Enviada</b>.',
      'Elige <b>Evaluar</b> junto a una persona y responde como en tu autoevaluación.',
      'Al enviar, el botón te ofrece la siguiente persona. Sigue hasta que todas digan <b>Enviada</b>.',
    ],
    img: 'inicio-lider', marca: [1, 17, 98, 59], alt: 'Inicio de un líder. Marcada: la lista de su equipo con el estado de cada evaluación.',
    aviso: { texto: 'Califica lo que has visto, no lo que esperarías de su cargo. Puedes corregir y reenviar mientras la ronda esté abierta.' },
    pregunta: {
      texto: 'Enviaste una evaluación y te equivocaste en una respuesta. ¿Qué haces?',
      opciones: [
        { t: 'Nada: una vez enviada no se puede cambiar.', ok: false, por: 'Sí se puede: «Revisar» la abre con tus respuestas y la reenvías.' },
        { t: 'La abro de nuevo, corrijo y la reenvío.', ok: true, por: 'Eso es. La nueva versión reemplaza a la anterior mientras la ronda esté abierta.' },
      ],
    },
  },
  {
    id: 'tablero', rol: 'lider', minutos: 3, ruta: '#/equipo', requiere: 'lider',
    titulo: 'Ver cómo está tu equipo', para: 'Saber de un vistazo dónde está cada persona frente a lo que su cargo espera.',
    pasos: [
      'Abre <b>Mi equipo</b> en el menú.',
      'Arriba, el resumen: tus evaluaciones enviadas, quién cumple su nivel y quién tiene algo por mejorar.',
      'En <b>Persona por persona</b>, primero aparece quien más lejos está de su nivel. «Qué falta» dice si falta alguna evaluación.',
      'El nombre de cada persona abre su detalle.',
    ],
    img: 'equipo', marca: [1, 21, 98, 55], alt: 'Mi equipo. Marcada: la tabla con cada persona, su nivel, lo que le falta y tu evaluación.',
    aviso: { texto: 'Si ves «Avisos», ábrelo antes de sacar conclusiones: dice qué números todavía son parciales.' },
    pregunta: {
      texto: '¿Quién aparece primero en la lista?',
      opciones: [
        { t: 'Quien tiene el puntaje más bajo.', ok: false, por: 'No: el puntaje por sí solo engaña. Primero va quien tiene más habilidades por debajo de lo esperado.' },
        { t: 'Quien más lejos está del nivel que espera su cargo.', ok: true, por: 'Correcto. Ordenar por puntaje pondría arriba a alguien junior que cumple todo.' },
      ],
    },
  },
  {
    id: 'persona', rol: 'lider', minutos: 4, ruta: '#/equipo', requiere: 'lider',
    titulo: 'Preparar la conversación con alguien', para: 'Revisar a una persona de tu equipo antes de hablar con ella.',
    pasos: [
      'Desde <b>Mi equipo</b>, elige su nombre. Arriba están las acciones: evaluarla y su plan. Con las flechas pasas a la siguiente persona.',
      'Mira lo que le falta y la tabla <b>Habilidad por habilidad</b>: ahí ves dónde tu calificación y la suya no coinciden.',
      'El <b>simulador</b>, al final, cambia un nivel para ver cómo se movería el resultado. No guarda nada.',
    ],
    img: 'persona', marca: [1, 12, 98, 24], alt: 'Detalle de una persona. Marcadas: las acciones Revisar mi evaluación y Plan de desarrollo, y las flechas a la persona anterior y siguiente.',
    aviso: { texto: 'Las diferencias grandes entre tu calificación y la de la persona son el mejor punto de partida para conversar.' },
    pregunta: {
      texto: '¿El simulador cambia la evaluación real?',
      opciones: [
        { t: 'No, solo muestra qué pasaría. No se guarda nada.', ok: true, por: 'Exacto. Al salir de la pantalla vuelve a los datos reales.' },
        { t: 'Sí, es otra forma de corregir la evaluación.', ok: false, por: 'No. Para corregir, abre la evaluación y reenvíala.' },
      ],
    },
  },
  {
    id: 'escribir-plan', rol: 'lider', minutos: 8, ruta: '#/equipo', requiere: 'lider',
    titulo: 'Escribir un plan de desarrollo', para: 'Dejar por escrito qué va a trabajar la persona y cómo.',
    pasos: [
      'En el detalle de la persona, elige <b>Plan de desarrollo</b>.',
      'El borrador ya trae lo que le falta. Para cada habilidad completa: un proyecto o experiencia, mentoría, formación y una meta que se pueda medir.',
      'Elige <b>Guardar</b>. La persona lo verá en su <b>Mi desarrollo</b>.',
    ],
    img: 'plan-lider', marca: [2, 62, 96, 30], alt: 'Formulario del plan. Marcado: el plan propuesto con el borrador por habilidad.',
    aviso: { texto: 'Escríbelo con la persona, no para ella: un plan acordado se cumple más.' },
    pregunta: {
      texto: '¿Qué tiene un buen plan?',
      opciones: [
        { t: 'Una lista de cursos.', ok: false, por: 'Los cursos ayudan, pero sin práctica real ni una meta que se pueda medir rara vez cierran lo que falta.' },
        { t: 'Lo que falta, una acción concreta y una meta que se pueda medir.', ok: true, por: 'Eso es: qué se trabaja, cómo y cómo sabremos que se logró.' },
      ],
    },
  },
];

const FAQ = [
  ['Empecé mi autoevaluación en otro computador y aquí no aparece.', 'Lo que no enviaste se guarda solo en el navegador donde lo hiciste. Termínala allá, o empiézala de nuevo aquí.'],
  ['La herramienta me sacó y me pide el código otra vez.', 'La sesión dura 8 horas. Pide un código nuevo: te devolvemos a donde estabas y lo que no enviaste sigue guardado.'],
  ['Mi resultado dice «parcial».', 'Falta la evaluación de alguien. Cuando llegue, el puntaje se actualiza solo.'],
  ['No veo a una persona de mi equipo.', 'Solo ves a quienes te reportan directamente. Si falta alguien, escribe a Personas para revisar a qué equipo pertenece.'],
  ['La ronda está cerrada y me faltó enviar.', 'Ya no se puede enviar desde la herramienta. Escribe a Personas.'],
  ['¿Por qué hay dos números, de 1 a 5 y de 40 a 100?', 'Cada habilidad se califica de 1 a 5. El puntaje total junta todas en una escala de 40 (Básico) a 100 (Experto).'],
];

const GLOSARIO = [
  ['Ronda', 'El periodo en que se hacen las evaluaciones, por ejemplo «Piloto 2026». Cuando se cierra, ya no se puede enviar nada.'],
  ['Nivel', 'Básico, Intermedio, Avanzado o Experto. Cada habilidad trae lo que significa cada nivel.'],
  ['Nivel esperado', 'El nivel que tu cargo pide en cada habilidad. Lo define Personas para cada cargo.'],
  ['Puntaje', 'Un número de 40 a 100 que junta todas tus calificaciones. Siempre va junto a cuántas habilidades están en el nivel esperado.'],
  ['Lo que te falta', 'Las habilidades que hoy están por debajo del nivel esperado: «un nivel abajo» o «dos o más abajo».'],
  ['Par', 'Un compañero que te evalúa, o a quien te pidieron evaluar. Su nombre no se muestra.'],
  ['Parcial', 'Falta la evaluación de alguien. El puntaje vale, pero puede cambiar.'],
  ['Matriz de talento', 'Una cuadrícula de 9 casillas que cruza tus funciones con tus habilidades, con una recomendación por casilla.'],
];

/* ------------------------------------------------------------- utilidades */

const ROLES = ['colaborador', 'lider'];
const leer = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin memoria */ } };

function captura(nombre, marca, alt) {
  return `
    <figure class="ayuda-captura">
      <span class="ayuda-captura__marco">
        <img src="${IMG(nombre)}" alt="${esc(alt)}" loading="lazy" width="800" height="506">
        ${marca ? `<span class="ayuda-captura__marca" aria-hidden="true"
          style="left:${marca[0]}%;top:${marca[1]}%;width:${marca[2]}%;height:${marca[3]}%"></span>` : ''}
      </span>
    </figure>`;
}

function pregunta(id, q) {
  return `
    <fieldset class="ayuda-quiz" data-quiz="${id}">
      <legend>Comprueba: ${esc(q.texto)}</legend>
      ${q.opciones.map((o, i) => `
        <label class="ayuda-quiz__opcion">
          <input type="radio" name="q-${id}" value="${i}">
          <span>${esc(o.t)}</span>
        </label>`).join('')}
      <p class="ayuda-quiz__respuesta" role="status"></p>
    </fieldset>`;
}

/** Al responder: la razón, siempre; y si es correcta, `alAcertar`. */
function conectarPreguntas(raiz, preguntas, alAcertar = () => {}) {
  raiz.querySelectorAll('[data-quiz]').forEach((f) => {
    f.addEventListener('change', (e) => {
      const id = f.dataset.quiz;
      const o = preguntas[id].opciones[Number(e.target.value)];
      const r = f.querySelector('.ayuda-quiz__respuesta');
      r.className = `ayuda-quiz__respuesta ${o.ok ? 'ayuda-quiz__respuesta--ok' : 'ayuda-quiz__respuesta--no'}`;
      r.innerHTML = `${icon(o.ok ? 'check' : 'alert')}<span><b>${o.ok ? 'Bien.' : 'Casi.'}</b> ${esc(o.por)}</span>`;
      if (o.ok) alAcertar(id);
    });
  });
}

/* ======================================================== manual de uso */

export function vistaAyuda({ sesion, params }) {
  const yo = sesion?.persona;
  const llave = `cdp.ayuda.${yo?.id ?? 'visita'}`;
  const esLider = Boolean(yo?.roles.includes('lider'));
  const guardado = leer(llave, {});
  let rol = ROLES.includes(guardado.rol) ? guardado.rol : (esLider ? 'lider' : 'colaborador');
  const hechas = new Set(Array.isArray(guardado.hechas) ? guardado.hechas : []);
  const persistir = () => guardar(llave, { rol, hechas: [...hechas] });
  const preguntas = Object.fromEntries(TAREAS.map((t) => [t.id, t.pregunta]));

  const visibles = () => TAREAS.filter((t) => t.rol === 'todos' || rol === 'lider');
  // «Ir a hacerlo» solo si esa pantalla le corresponde a quien lee.
  const puedeIr = (t) => yo && t.ruta && (t.requiere === 'lider' ? esLider : t.requiere === 'cargo' ? Boolean(yo.cargo_id) : true);

  const tarjeta = (t, n) => {
    const hecha = hechas.has(t.id);
    return `
      <details class="ayuda-tarea${hecha ? ' ayuda-tarea--hecha' : ''}" id="tarea-${t.id}">
        <summary class="ayuda-tarea__cabeza">
          <span class="ayuda-tarea__num" aria-hidden="true">${hecha ? icon('check') : n}</span>
          <span class="ayuda-tarea__titulos">
            <h3 class="ayuda-tarea__titulo">${esc(t.titulo)}<span class="sr-only ayuda-tarea__estado">${hecha ? ' (entendida)' : ''}</span></h3>
            <span class="ayuda-tarea__para">${esc(t.para)}</span>
          </span>
          <span class="ayuda-tarea__tiempo">tarda unos ${t.minutos} min</span>
          ${icon('chevronRight', { className: 'ayuda-tarea__flecha' })}
        </summary>
        <div class="ayuda-tarea__cuerpo${t.img ? ' ayuda-tarea__cuerpo--con-imagen' : ''}">
          <div class="ayuda-tarea__texto">
            <ol class="ayuda-pasos">${t.pasos.map((p) => `<li>${p}</li>`).join('')}</ol>
            <p class="callout${t.aviso.peligro ? ' callout--warning' : ''} ayuda-aviso">${icon(t.aviso.peligro ? 'alert' : 'info')}<span>${esc(t.aviso.texto)}</span></p>
            ${pregunta(t.id, t.pregunta)}
            ${puedeIr(t) ? `<a class="btn btn--secondary btn--sm" href="${t.ruta}" data-ir="${t.ruta}">Ir a hacerlo, con visita guiada</a>` : ''}
          </div>
          ${t.img ? captura(t.img, t.marca, t.alt) : ''}
        </div>
      </details>`;
  };

  const notaRol = () => (rol === 'lider'
    ? 'Como líder también te evalúan: ves tus tareas y las de tu equipo.'
    : 'Lo que necesitas para evaluarte, ver tu resultado y tu plan.');

  const textoAvance = () => {
    const v = visibles(); const n = v.filter((t) => hechas.has(t.id)).length;
    return { n, total: v.length };
  };

  return {
    html: `
      <div class="page-header ayuda-cabecera">
        <h1 class="page-header__title">Cómo usar Desarrollo de Carrera</h1>
        <p class="ayuda-cabecera__lede">Abre solo la tarea que necesitas: cada una se lee en un minuto.</p>
        <div class="ayuda-rol" role="radiogroup" aria-labelledby="ayuda-rol-etiqueta">
          <span id="ayuda-rol-etiqueta" class="ayuda-rol__etiqueta">Ver las tareas de</span>
          ${ROLES.map((r) => `<button type="button" role="radio" aria-checked="${r === rol}" tabindex="${r === rol ? 0 : -1}" data-rol="${r}">${r === 'lider' ? 'Líder' : 'Colaborador o colaboradora'}</button>`).join('')}
        </div>
      </div>

      <section class="section" aria-labelledby="t-30s">
        <div class="section__head"><h2 class="section__title" id="t-30s">En 30 segundos</h2></div>
        <ol class="ayuda-ciclo">
          <li class="ayuda-ciclo__paso">${icon('clipboard')}<b>1. Te evalúan</b><span>Tú, tu líder y algunos compañeros califican tus habilidades.</span></li>
          <li class="ayuda-ciclo__paso">${icon('barChart')}<b>2. Ves tu resultado</b><span>Tu nivel y lo que te falta frente a lo que tu cargo espera.</span></li>
          <li class="ayuda-ciclo__paso">${icon('target')}<b>3. Acuerdas un plan</b><span>Tu líder propone un plan y lo conversan juntos.</span></li>
        </ol>
      </section>

      <section class="section" aria-labelledby="t-tareas">
        <div class="section__head"><h2 class="section__title" id="t-tareas">Paso a paso</h2></div>
        <p class="ayuda-nota" id="ayuda-rol-nota" aria-live="polite">${notaRol()}</p>
        <p class="ayuda-progreso" id="ayuda-progreso" aria-live="polite"></p>
        <div id="ayuda-tareas">${visibles().map((t, i) => tarjeta(t, i + 1)).join('')}</div>
      </section>

      <section class="section" aria-labelledby="t-faq">
        <div class="section__head"><h2 class="section__title" id="t-faq">Si te trabas</h2></div>
        <div class="ayuda-faq">
          ${FAQ.map(([p, r]) => `<details class="ayuda-faq__item"><summary>${esc(p)}${icon('chevronRight', { className: 'ayuda-faq__flecha' })}</summary><p>${esc(r)}</p></details>`).join('')}
        </div>
        <p class="ayuda-nota">¿Otra duda? Escribe a Personas (Recursos Humanos): <a href="mailto:${esc(CORREO_AYUDA)}">${esc(CORREO_AYUDA)}</a>.</p>
      </section>

      <section class="section" aria-labelledby="t-glosario">
        <div class="section__head"><h2 class="section__title" id="t-glosario">Palabras que vas a ver</h2></div>
        <dl class="ayuda-glosario">
          ${GLOSARIO.map(([p, d]) => `<div class="ayuda-glosario__item"><dt>${esc(p)}</dt><dd>${esc(d)}</dd></div>`).join('')}
        </dl>
      </section>`,

    montado(raiz) {
      const zona = raiz.querySelector('#ayuda-tareas');
      const avance = raiz.querySelector('#ayuda-progreso');

      // El progreso aparece cuando hay algo que contar: «0 de 9» al entrar se
      // leía como tarea pendiente.
      const pintarAvance = () => {
        const { n, total } = textoAvance();
        avance.textContent = n ? `Ya entendiste ${n} de ${total} tareas.` : '';
      };

      // Acertar marca la tarea en su lugar: sin repintar la lista, que cerraba
      // las otras tarjetas y borraba las respuestas.
      const marcar = (id) => {
        if (hechas.has(id)) return;
        hechas.add(id); persistir();
        const d = zona.querySelector(`#tarea-${CSS.escape(id)}`);
        d?.classList.add('ayuda-tarea--hecha');
        const num = d?.querySelector('.ayuda-tarea__num');
        if (num) num.innerHTML = icon('check');
        const estado = d?.querySelector('.ayuda-tarea__estado');
        if (estado) estado.textContent = ' (entendida)';
        pintarAvance();
      };

      const conectar = () => {
        conectarPreguntas(zona, preguntas, marcar);
        // «Ir a hacerlo»: la visita de esa pantalla arranca al llegar. Con
        // Ctrl o clic central se abre en otra pestaña: ahí no se deja pedida.
        zona.querySelectorAll('[data-ir]').forEach((a) => a.addEventListener('click', (e) => {
          if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
          try { sessionStorage.setItem('cdp.recorrido-pendiente', a.dataset.ir); } catch { /* sin visita */ }
        }));
      };

      const elegirRol = (b) => {
        rol = b.dataset.rol; persistir();
        raiz.querySelectorAll('[data-rol]').forEach((x) => {
          const si = x === b; x.setAttribute('aria-checked', String(si)); x.tabIndex = si ? 0 : -1;
        });
        raiz.querySelector('#ayuda-rol-nota').textContent = notaRol();
        zona.innerHTML = visibles().map((t, i) => tarjeta(t, i + 1)).join('');
        conectar();
        pintarAvance();
      };
      raiz.querySelectorAll('[data-rol]').forEach((b) => b.addEventListener('click', () => elegirRol(b)));
      // Patrón de grupo de opciones: flechas en las cuatro direcciones.
      raiz.querySelector('.ayuda-rol').addEventListener('keydown', (e) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault();
        const otro = raiz.querySelector('[data-rol][aria-checked="false"]');
        elegirRol(otro); otro.focus();
      });

      conectar();
      pintarAvance();

      if (params?.seccion) {
        const d = raiz.querySelector(`#tarea-${CSS.escape(params.seccion)}`);
        if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); d.querySelector('summary').focus({ preventScroll: true }); }
      }
    },
  };
}

/* ================================================ manual de administración */

const REPORTS = [
  ['PROFILE (cargo, nombre, nivel, puntaje)', 'Tarjeta «Estado actual»: puntaje de 40 a 100, nivel y cuántas habilidades están en el nivel esperado.', 'mi-desarrollo'],
  ['Gráfica de radar (Employee, Leader, Peer por categoría)', '«Cómo te ve cada evaluador»: los tres puntos por categoría, con el valor escrito. El radar engañaba con el área; aquí se comparan directo.', 'adm-miradas'],
  ['Gráfica de barras del resultado por categoría', '«Cada categoría contra lo que el cargo espera»: la barra de hoy y la marca de lo esperado, con los cortes de nivel.', 'adm-categorias'],
  ['Gráfica de barras del resultado por evaluador', 'Integrada en «Cómo te ve cada evaluador» y en la tabla «Habilidad por habilidad».', 'adm-miradas'],
  ['Summary (Required, Employee, Leader, Peer, Result)', 'Tabla «Habilidad por habilidad» y la lista de lo que falta, de lo más profundo a lo más leve.', 'adm-tabla'],
  ['PROFILE OF LEVEL y Escala (0-40, 41-70, 71-90, 91-100)', 'Los cortes aparecen en la gráfica de categorías, y el nivel junto al puntaje.', 'adm-categorias'],
  ['Categorize talent (matriz de 9, etiqueta y recomendación)', 'Matriz de talento: de cada persona (con su casilla y recomendación), de cada equipo y de la organización.', 'adm-matriz'],
  ['DISC, Roadmap y Request Profile', 'No se migraron: no tenían datos conectados al cálculo.', null],
];

const REGLAS = [
  ['Pesos de cada evaluador', 'Líder 35 %, par 35 %, empleado 30 %', 'Igual', false],
  ['Valor de cada nivel', 'Basic 40, Intermediate 70, Advanced 90, Expert 100', 'Igual', false],
  ['Rangos del puntaje', '0-40, 41-70, 71-90, 91-100', 'Igual', false],
  ['Conceptos por puntaje', 'Critical, Low, Satisfactory, Outstanding, Excellent…', 'Igual, en español', false],
  ['Matriz de 9 casillas', 'Cortes en 3 y 4; etiquetas y recomendaciones', 'Igual', false],
  ['Pesos por categoría', 'Escritos (50 / 25 / 25), pero ninguna fórmula los usaba', 'Se aplican: funciones 50 %, hard skills 25 %, soft skills 25 %', true],
  ['Evaluador que falta', 'La celda vacía contaba como 0 y hundía el resultado', 'Su peso se reparte entre quienes evaluaron, y se avisa «parcial»', true],
];

const PREGUNTAS_ADMIN = {
  mastertable: {
    texto: 'Quieres cambiar el nivel que un cargo espera en una habilidad. ¿Dónde lo haces?',
    opciones: [
      { t: 'En Administración › Catálogo.', ok: false, por: 'El Catálogo es lo que significa cada nivel (las hojas Functions y Skills). Lo que espera cada cargo estaba en MasterTable, hoy Cargos.' },
      { t: 'En Administración › Cargos.', ok: true, por: 'Eso es. Y lo que pongas ahí define las preguntas de cada persona de ese cargo.' },
    ],
  },
  escala: {
    texto: 'A una persona le falta la evaluación de un par. ¿Cómo se calcula ahora?',
    opciones: [
      { t: 'El peso del par se reparte entre quienes evaluaron, y se marca «parcial».', ok: true, por: 'Correcto. En el Excel esa celda contaba como 0 y hundía el resultado.' },
      { t: 'Igual que en el Excel: el par cuenta como 0.', ok: false, por: 'Ese era el Excel. Ahora el peso se reparte y se avisa que es parcial.' },
    ],
  },
};

const HOJAS = [
  {
    id: 'assessment', hoja: 'Assessment', oculta: false, img: 'autoevaluacion',
    antes: 'Una sola hoja donde se escribían, para una persona, los puntajes del empleado, del líder y del par en cada habilidad, con el resultado al lado.',
    ahora: 'Cada evaluador llena su propio formulario desde su cuenta: la persona, su líder y sus pares. Una habilidad a la vez, con lo que significa cada nivel.',
    donde: [['Formulario de evaluación', '#/autoevaluacion'], ['Tabla «Habilidad por habilidad» de Mi desarrollo', '#/mi-desarrollo']],
    dato: 'Hoja Evaluaciones: una fila por respuesta (quién evalúa, a quién, qué habilidad, qué puntaje).',
    cambio: 'Nadie escribe por otro. Las calificaciones de cada evaluador se juntan solas.',
  },
  {
    id: 'reports', hoja: 'Reports', oculta: false, img: null,
    antes: 'El reporte de una persona: encabezado con cargo, nivel y puntaje; tres gráficas; el resumen por habilidad; la escala; y la matriz «Categorize talent».',
    ahora: 'Se arma solo, al instante, en Mi desarrollo (lo que ve la persona) y en el detalle de cada persona (lo que ven su líder y la administración). Elige cada parte abajo.',
    donde: [['Mi desarrollo', '#/mi-desarrollo'], ['Organización', '#/organizacion']],
    dato: 'No se guarda: se calcula cada vez con las evaluaciones y las reglas del modelo.',
    cambio: 'Ya no hay que escribir el número de identificación: se elige el nombre de la persona.',
    extra: 'reports',
  },
  {
    id: 'planning', hoja: 'Planning', oculta: false, img: 'plan-lider',
    antes: 'El plan en cinco dimensiones por categoría: proyectos o experiencia, mentoría o coaching, formación o certificación, metas de cumplimiento y recomendaciones.',
    ahora: 'El plan de cada persona lo escribe su líder. El borrador ya trae lo que le falta y propone las cinco dimensiones para cada habilidad. La persona lo ve en Mi desarrollo.',
    donde: [['Plan de desarrollo (desde el detalle de una persona)', '#/organizacion']],
    dato: 'Hoja Planes: título, objetivo, propuesta y habilidades que trabaja.',
    cambio: 'Las dimensiones son una guía dentro del texto, no columnas fijas. El seguimiento sigue fuera de la herramienta.',
  },
  {
    id: 'catalogo', hoja: 'Functions · Hard Skills · Soft Skills', oculta: true, img: 'adm-catalogo',
    antes: 'Tres hojas con el catálogo: cada función o habilidad con su departamento, su descripción y lo que significa cada nivel (Basic a Expert).',
    ahora: 'Un solo catálogo con las tres categorías. Se busca, se filtra por categoría y departamento, se edita y se desactiva sin borrar.',
    donde: [['Administración › Catálogo', '#/admin/catalogo']],
    dato: 'Hoja Habilidades: una fila por habilidad, con sus cuatro descripciones de nivel.',
    cambio: 'Si falta la descripción de un nivel, el catálogo lo marca («Falta Avanzado»). Cada cambio queda en Auditoría.',
  },
  {
    id: 'listas', hoja: 'LIST FUNCTIONS · LIST HARD SKILLS', oculta: true, img: 'adm-catalogo',
    antes: 'Listas por departamento que alimentaban los desplegables del Excel.',
    ahora: 'Ya no hacen falta: el departamento es un dato de cada habilidad y el catálogo filtra por él.',
    donde: [['Administración › Catálogo (filtro Departamento)', '#/admin/catalogo']],
    dato: 'Columna «departamento» de la hoja Habilidades.',
    cambio: 'Una lista menos que mantener al día.',
  },
  {
    id: 'mastertable', hoja: 'MasterTable', oculta: true, img: 'adm-cargos',
    antes: 'Qué funciones y habilidades tiene cada cargo, y en qué nivel se esperan.',
    ahora: 'Cada cargo con sus habilidades y el nivel esperado de cada una. Se cambian varios niveles y se guardan juntos, con una confirmación que los lista.',
    donde: [['Administración › Cargos', '#/admin/cargos']],
    dato: 'Hojas Cargos y CargoHabilidades.',
    cambio: 'Define las preguntas de cada persona: el formulario trae exactamente las habilidades de su cargo.',
    extra: 'pregunta',
  },
  {
    id: 'escala', hoja: 'ESCALA', oculta: true, img: null,
    antes: 'Las reglas del cálculo: pesos de cada evaluador, valor de cada nivel, rangos, conceptos y la tabla de la matriz.',
    ahora: 'Las mismas reglas, aplicadas en cada cálculo. No se editan en pantalla, para que nadie cambie el modelo sin querer.',
    donde: [['Se ven aplicadas en Mi desarrollo', '#/mi-desarrollo']],
    dato: 'Hoja Modelo del Excel de datos.',
    cambio: 'Dos ajustes, marcados en la tabla: los pesos por categoría ahora se aplican, y quien no evaluó no cuenta como 0.',
    extra: 'reglas',
  },
];

const NUEVO = [
  ['lock', 'Ingreso con código', 'Cada persona entra con su correo y un código. Sin contraseñas.'],
  ['users', 'Cada uno ve lo suyo', 'La persona ve su resultado; el líder, a su equipo directo; la administración, todo.'],
  ['calendar', 'Rondas', 'Se abre, se cierra y se empieza una ronda nueva sin perder la anterior.'],
  ['userCheck', 'Pares asignados', 'La administración decide quién evalúa a quién como par.'],
  ['user', 'Líder interino', 'Si un líder se va, otro cubre su equipo mientras llega el reemplazo.'],
  ['eyeOff', 'Ocultar sin borrar', 'Personas, equipos, cargos y habilidades se ocultan y se recuperan.'],
  ['clock', 'Auditoría', 'Cada cambio con quién, cuándo, antes, después y motivo.'],
];

const TAREAS_ADMIN = [
  ['Agregar o corregir una persona', 'Administración › Personas → «Agregar persona» o «Editar». El cargo y el equipo definen qué se le pregunta y quién la evalúa.', '#/admin/personas'],
  ['Cambiar los niveles de un cargo', 'Administración › Cargos → abre el cargo, cambia los niveles y elige «Guardar cambios». Se confirman todos juntos.', '#/admin/cargos'],
  ['Asignar pares', 'Administración › Pares y evaluaciones → elige a la persona y a quien la evalúa. «Solo quienes no tienen pares» muestra lo pendiente.', '#/admin/pares'],
  ['Cubrir a un líder que se fue', 'Administración › Equipos → «Editar» el equipo → elige el líder interino. Al quitarlo, el acceso vuelve al titular.', '#/admin/equipos'],
  ['Cerrar la ronda', 'Administración › Ronda y ajustes → «Cerrar la ronda». Antes te dice cuántas evaluaciones faltan.', '#/admin/ronda'],
  ['Empezar una ronda nueva', 'Administración › Ronda y ajustes → «Empezar una ronda nueva». Las evaluaciones anteriores quedan en el Excel.', '#/admin/ronda'],
  ['Saber quién cambió algo', 'Administración › Auditoría, o «Historial» en la fila de una persona, equipo o cargo.', '#/admin/auditoria'],
];

const COMPLEJIDAD = [
  ['Entrar', 'Baja', 'El código va a correo no deseado; vence a los 10 minutos.'],
  ['Autoevaluación', 'Media', 'Son 20 a 40 preguntas. Lo no enviado vive en un solo navegador. «Salir» a la mitad lo borra.'],
  ['Evaluar a un compañero', 'Media', 'No hay opción «no lo he visto»: se pide elegir lo que se pueda respaldar.'],
  ['Leer el resultado', 'Media', 'Dos números (1 a 5 por habilidad, 40 a 100 el puntaje). «Parcial» genera dudas.'],
  ['Líder: evaluar al equipo', 'Media', 'Un formulario por persona. Inicio muestra el estado de cada una.'],
  ['Líder: escribir el plan', 'Media', 'La hoja en blanco: el borrador ya trae lo que falta y las cinco dimensiones.'],
  ['Administración', 'Alta', 'Muchas pantallas; los cambios de cargo y de ronda afectan a mucha gente. Todo pide confirmación y queda en Auditoría.'],
];

const enIngles = (t) => `<span lang="en">${esc(t)}</span>`;

function panelReports(sel) {
  return `
    <div class="reports">
      <ul class="reports__lista">
        ${REPORTS.map(([antes, ahora], i) => `
          <li><button type="button" class="reports__item" data-rep="${i}" ${i === sel ? 'aria-current="true"' : ''}>
            <span class="reports__antes">${i === sel ? icon('check', { className: 'reports__marca' }) : ''}${enIngles(antes)}</span>
            <span class="reports__ahora">${esc(ahora)}</span>
          </button></li>`).join('')}
      </ul>
      <div class="reports__vista" id="rep-vista">${vistaReports(sel)}</div>
    </div>`;
}

function vistaReports(i) {
  const [antes, , img] = REPORTS[i];
  return img
    ? `<p class="reports__titulo">Ahora: ${esc(REPORTS[i][1].split(':')[0])}</p>${captura(img, null, `En el portal: ${antes}`)}`
    : '<p class="ayuda-sin-captura">No se migró: no tenía datos conectados al cálculo.</p>';
}

function tablaReglas() {
  return `
    <div class="table-wrap">
      <table class="table">
        <caption class="sr-only">Cada regla del cálculo en el Excel y en el portal.</caption>
        <thead><tr><th scope="col">Regla</th><th scope="col">En el Excel</th><th scope="col">En el portal</th></tr></thead>
        <tbody>
          ${REGLAS.map(([r, a, b, cambio]) => `<tr${cambio ? ' class="table__row--atencion"' : ''}>
            <th scope="row" class="table__rowhead">${esc(r)}</th><td>${enIngles(a)}</td>
            <td>${cambio ? `<span class="badge badge--warning">Cambió</span> ${esc(b)}` : `<span class="text-muted">${esc(b)}</span>`}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function panelHoja(h) {
  return `
    <div class="mapa__flujo">
      <div class="mapa__lado mapa__lado--antes">
        <p class="mapa__etiqueta">En el Excel</p>
        <p>${esc(h.antes)}</p>
      </div>
      <span class="mapa__flecha" aria-hidden="true">${icon('arrowRight')}</span>
      <div class="mapa__lado mapa__lado--ahora">
        <p class="mapa__etiqueta">En el portal</p>
        <p>${esc(h.ahora)}</p>
        <ul class="mapa__donde">${h.donde.map(([t, r]) => `<li><a href="${r}">${esc(t)} ${icon('arrowRight')}</a></li>`).join('')}</ul>
      </div>
    </div>
    <div class="mapa__cuerpo${h.img ? ' mapa__cuerpo--con-imagen' : ''}">
      <dl class="mapa__detalle">
        <div><dt>Qué cambió</dt><dd>${esc(h.cambio)}</dd></div>
        <div><dt>Dónde vive el dato ahora</dt><dd>${esc(h.dato)}</dd></div>
      </dl>
      ${h.img ? captura(h.img, null, `En el portal: ${h.hoja}`) : ''}
    </div>
    ${h.extra === 'reports' ? panelReports(0) : ''}
    ${h.extra === 'reglas' ? `${tablaReglas()}${pregunta('escala', PREGUNTAS_ADMIN.escala)}` : ''}
    ${h.extra === 'pregunta' ? pregunta('mastertable', PREGUNTAS_ADMIN.mastertable) : ''}`;
}

const SECCIONES_ADMIN = [
  ['t-ideas', 'Lo que cambió'], ['t-tareas-adm', 'Tareas de administración'], ['t-mapa', 'Hoja por hoja'],
  ['t-nuevo', 'Lo que el Excel no tenía'], ['t-complejidad', 'Dónde se traba la gente'],
];

export function vistaAyudaAdmin({ params }) {
  const inicial = HOJAS.find((h) => h.id === params?.seccion) ?? HOJAS[0];

  return {
    html: `
      <div class="page-header ayuda-cabecera">
        <h1 class="page-header__title">Manual de administración: del Excel al portal</h1>
        <p class="ayuda-cabecera__lede">Dónde quedó cada hoja del Career Development Tool V6, qué cambió y cómo se hacen las tareas del día a día.</p>
        <nav class="ayuda-indice" aria-label="En esta página">
          <ul>${SECCIONES_ADMIN.map(([id, t]) => `<li><button type="button" class="ayuda-indice__enlace" data-saltar-a="${id}">${esc(t)}</button></li>`).join('')}</ul>
        </nav>
      </div>

      <section class="section" aria-labelledby="t-ideas">
        <div class="section__head"><h2 class="section__title" id="t-ideas" tabindex="-1">Lo que cambió, en tres ideas</h2></div>
        <ol class="ayuda-ciclo">
          <li class="ayuda-ciclo__paso">${icon('users')}<b>Cada uno llena lo suyo</b><span>Antes una persona escribía las calificaciones de todos. Ahora cada evaluador entra y envía su parte.</span></li>
          <li class="ayuda-ciclo__paso">${icon('barChart')}<b>El reporte se arma solo</b><span>Lo que hacía la hoja Reports se calcula al instante para cada persona, equipo y área.</span></li>
          <li class="ayuda-ciclo__paso">${icon('database')}<b>El Excel sigue, como almacén</b><span>Los datos viven en el Excel de OneDrive; el portal es la forma de verlos y cambiarlos. Nadie edita el Excel a mano.</span></li>
        </ol>
      </section>

      <section class="section" aria-labelledby="t-tareas-adm">
        <div class="section__head"><h2 class="section__title" id="t-tareas-adm" tabindex="-1">Tareas de administración</h2></div>
        <div class="ayuda-faq">
          ${TAREAS_ADMIN.map(([t, d, r]) => `
            <details class="ayuda-faq__item"><summary>${esc(t)}${icon('chevronRight', { className: 'ayuda-faq__flecha' })}</summary>
              <p>${esc(d)} <a href="${r}">Ir ahí</a></p></details>`).join('')}
        </div>
      </section>

      <section class="section" aria-labelledby="t-mapa">
        <div class="section__head"><h2 class="section__title" id="t-mapa" tabindex="-1">Hoja por hoja</h2></div>
        <p class="ayuda-nota">Elige una hoja, como en el Excel. Las que estaban ocultas lo dicen.</p>
        <div class="mapa">
          <div class="mapa__pestanas" role="tablist" aria-label="Hojas del Excel">
            ${HOJAS.map((h) => `
              <button type="button" role="tab" class="mapa__pestana" id="pest-${h.id}"
                      aria-selected="${h.id === inicial.id}" aria-controls="mapa-panel" tabindex="${h.id === inicial.id ? 0 : -1}"
                      data-hoja="${h.id}">${enIngles(h.hoja)}${h.oculta ? '<span class="mapa__oculta">oculta</span>' : ''}</button>`).join('')}
          </div>
          <div class="mapa__panel" role="tabpanel" id="mapa-panel" aria-labelledby="pest-${inicial.id}" tabindex="0">${panelHoja(inicial)}</div>
        </div>
      </section>

      <section class="section" aria-labelledby="t-nuevo">
        <div class="section__head"><h2 class="section__title" id="t-nuevo" tabindex="-1">Lo que el Excel no tenía</h2></div>
        <ul class="ayuda-nuevo">
          ${NUEVO.map(([ic, t, d]) => `<li class="ayuda-nuevo__item">${icon(ic)}<span><b>${esc(t)}.</b> ${esc(d)}</span></li>`).join('')}
        </ul>
      </section>

      <section class="section" aria-labelledby="t-complejidad">
        <div class="section__head"><h2 class="section__title" id="t-complejidad" tabindex="-1">Dónde se traba la gente</h2></div>
        <p class="ayuda-nota">Para acompañar a las personas en la primera ronda. Cada punto está explicado en el <a href="#/ayuda">Manual de uso</a>.</p>
        <div class="table-wrap">
          <table class="table">
            <caption class="sr-only">Esfuerzo de cada tarea y dónde suelen aparecer dudas.</caption>
            <thead><tr><th scope="col">Tarea</th><th scope="col">Esfuerzo</th><th scope="col">Dónde aparecen dudas</th></tr></thead>
            <tbody>${COMPLEJIDAD.map(([t, c, d]) => `<tr><th scope="row" class="table__rowhead">${esc(t)}</th>
              <td>${c === 'Alta' ? `<b>${c}</b>` : c}</td><td>${esc(d)}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </section>`,

    montado(raiz) {
      const panel = raiz.querySelector('#mapa-panel');
      const pestanas = [...raiz.querySelectorAll('[role="tab"]')];
      const preguntas = PREGUNTAS_ADMIN;

      const conectarPanel = () => {
        conectarPreguntas(panel, preguntas);
        panel.querySelectorAll('[data-rep]').forEach((b) => b.addEventListener('click', () => {
          const i = Number(b.dataset.rep);
          panel.querySelectorAll('[data-rep]').forEach((x) => {
            const si = x === b;
            if (si) x.setAttribute('aria-current', 'true'); else x.removeAttribute('aria-current');
            x.querySelector('.reports__marca')?.remove();
            if (si) x.querySelector('.reports__antes').insertAdjacentHTML('afterbegin', icon('check', { className: 'reports__marca' }));
          });
          const vista = panel.querySelector('#rep-vista');
          vista.innerHTML = vistaReports(i);
          // En angosto la vista queda debajo de la lista: se lleva a la vista.
          if (matchMedia('(max-width: 48rem)').matches) vista.scrollIntoView({ block: 'nearest' });
        }));
        sincronizarScrollables(panel);
      };

      const elegir = (b, foco = false) => {
        pestanas.forEach((x) => { const si = x === b; x.setAttribute('aria-selected', String(si)); x.tabIndex = si ? 0 : -1; });
        panel.setAttribute('aria-labelledby', b.id);
        panel.innerHTML = panelHoja(HOJAS.find((h) => h.id === b.dataset.hoja));
        conectarPanel();
        if (foco) b.focus();
      };
      pestanas.forEach((b) => b.addEventListener('click', () => elegir(b)));
      raiz.querySelector('[role="tablist"]').addEventListener('keydown', (e) => {
        const i = pestanas.indexOf(document.activeElement);
        if (i < 0) return;
        const j = e.key === 'ArrowRight' ? (i + 1) % pestanas.length : e.key === 'ArrowLeft' ? (i - 1 + pestanas.length) % pestanas.length
          : e.key === 'Home' ? 0 : e.key === 'End' ? pestanas.length - 1 : null;
        if (j === null) return;
        e.preventDefault(); elegir(pestanas[j], true);
      });

      // Índice de la página: botones y no enlaces con #, que el ruteo leería
      // como otra pantalla.
      raiz.querySelectorAll('[data-saltar-a]').forEach((b) => b.addEventListener('click', () => {
        const destino = raiz.querySelector(`#${b.dataset.saltarA}`);
        destino?.scrollIntoView({ block: 'start' });
        destino?.focus({ preventScroll: true });
      }));

      conectarPanel();
      sincronizarScrollables(raiz);
      if (params?.seccion) {
        raiz.querySelector('.mapa').scrollIntoView({ block: 'start' });
        raiz.querySelector(`#pest-${inicial.id}`)?.focus({ preventScroll: true });
      }
    },
  };
}
