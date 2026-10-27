/* =========================================================================
   ENTRAR — correo, y después un código de un solo uso
   =========================================================================
   Sin contraseñas: el código llega al correo corporativo, así que entrar
   prueba que la persona controla ese buzón. Lo envía el flujo de Power
   Automate; el script decide si corresponde y nunca le devuelve el código al
   navegador.

   El primer paso responde lo mismo exista o no el correo. Decir "ese correo
   no está registrado" convertiría esta pantalla en una forma de averiguar
   quién trabaja en la empresa.
   ========================================================================= */

import { esc, icon, setFieldError, clearFieldErrors, withBusy } from '../lib/ui.js';
import { pedirCodigo, confirmarCodigo } from '../lib/almacen.js';
import { tokenGuardado } from '../lib/api.js';
import { ir } from '../lib/ruteo.js';

const LLAVE_CORREO = 'cdp.ultimo-correo';
const ESPERA_REENVIO = 60;   // segundos; el servidor exige lo mismo (codigo_espera_segundos)

function recordado() {
  try { return localStorage.getItem(LLAVE_CORREO) ?? ''; } catch { return ''; }
}

/** Si la sesión había vencido a mitad de algo, se vuelve ahí. */
function destinoTrasEntrar() {
  try {
    const d = sessionStorage.getItem('cdp.volver-a');
    sessionStorage.removeItem('cdp.volver-a');
    if (d && d.startsWith('#/') && d !== '#/entrar') return d;
  } catch { /* al inicio */ }
  return '#/';
}

export function vistaEntrar() {
  let correo = recordado();
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  let vencida = false;
  try { vencida = sessionStorage.getItem('cdp.sesion-vencida') === '1'; sessionStorage.removeItem('cdp.sesion-vencida'); } catch { /* sin aviso */ }

  const pasoCorreo = () => `
    <form class="entrar__form" id="f-correo" novalidate>
      <div class="field">
        <label class="field__label" for="correo">Correo de la empresa</label>
        <input class="input" id="correo" name="correo" type="email" autocomplete="username email"
               inputmode="email" spellcheck="false" required value="${esc(correo)}"
               aria-describedby="correo-ayuda">
        <p class="field__hint" id="correo-ayuda">Te enviamos un código de 6 dígitos para entrar. Sin contraseñas.</p>
        <p class="field__error" id="correo-error" role="alert"></p>
      </div>
      <button type="submit" class="btn btn--primary btn--block">Enviar código</button>
    </form>`;

  const pasoCodigo = () => `
    <form class="entrar__form" id="f-codigo" novalidate>
      <div class="field">
        <label class="field__label" for="codigo">Código de ingreso</label>
        <input class="input input--codigo" id="codigo" name="codigo" type="text" required
               inputmode="numeric" autocomplete="one-time-code" maxlength="9"
               aria-describedby="codigo-ayuda">
        <p class="field__hint" id="codigo-ayuda">
          Si <b>${esc(correo)}</b> está registrado, el código ya va en camino.
          Vale 10 minutos y sirve una sola vez.
        </p>
        <p class="field__error" id="codigo-error" role="alert"></p>
      </div>
      <button type="submit" class="btn btn--primary btn--block">Entrar</button>
      <div class="entrar__secundarias">
        <button type="button" class="btn btn--ghost btn--sm" id="reenviar" disabled aria-describedby="reenviar-espera">Reenviar código</button>
        <button type="button" class="btn btn--ghost btn--sm" id="otro-correo">Usar otro correo</button>
      </div>
      <p class="field__hint" id="reenviar-espera" aria-live="off"></p>
      <p class="field__hint">¿No llega? Revisa la carpeta de correo no deseado. Si sigue sin llegar,
        avisa al equipo de Personas.</p>
      ${local ? `
        <p class="callout callout--warning entrar__dev">${icon('info')}
          <span>Servidor local: el código aparece en la consola de <code>npm run local</code> y en <code>/dev/buzon</code>.</span>
        </p>` : ''}
    </form>`;

  return {
    html: `
      <div class="entrar">
        <div class="page-header">
          <h1 class="page-header__title">Entrar</h1>
          <p class="page-header__lede">Evaluación por cargo y planes de desarrollo.</p>
        </div>
        ${vencida ? `
          <p class="callout entrar__aviso">${icon('info')}
            <span>Tu sesión terminó por tiempo. Vuelve a entrar y te llevamos a donde estabas:
            las respuestas que no enviaste siguen guardadas en este navegador.</span>
          </p>` : ''}
        <div class="card" id="paso">${pasoCorreo()}</div>
        <p class="sr-only" role="status" id="entrar-estado"></p>
      </div>
    `,
    montado(raiz) {
      const zona = raiz.querySelector('#paso');
      const estado = raiz.querySelector('#entrar-estado');
      let reloj = null;
      let puedeReenviar = false;

      const montarCorreo = () => {
        clearInterval(reloj);
        zona.innerHTML = pasoCorreo();
        const f = zona.querySelector('#f-correo');
        const campo = f.querySelector('#correo');
        campo.focus();
        f.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          clearFieldErrors(f);
          const valor = campo.value.trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor)) {
            setFieldError(campo, 'Escribe un correo completo, por ejemplo nombre@empresa.com.');
            campo.focus();
            return;
          }
          try {
            await withBusy(f.querySelector('[type=submit]'), () => pedirCodigo(valor), { label: 'Enviando el código…' });
          } catch (e) {
            setFieldError(campo, e.message);
            campo.focus();
            return;
          }
          correo = valor;
          try { localStorage.setItem(LLAVE_CORREO, valor); } catch { /* no se recuerda */ }
          montarCodigo();
          // El aviso va en una región que ya existía: una región viva creada
          // con el texto puesto no se anuncia.
          estado.textContent = `Código enviado a ${valor} si está registrado. Escríbelo para entrar.`;
        });
      };

      const contarReenvio = (f) => {
        const boton = f.querySelector('#reenviar');
        const aviso = f.querySelector('#reenviar-espera');
        let quedan = ESPERA_REENVIO;
        puedeReenviar = false;
        boton.disabled = true;
        clearInterval(reloj);
        const pintar = () => { aviso.textContent = quedan > 0 ? `Puedes pedir otro en ${quedan} s.` : ''; };
        pintar();
        reloj = setInterval(() => {
          quedan -= 1;
          pintar();
          if (quedan <= 0) { clearInterval(reloj); puedeReenviar = true; boton.disabled = false; }
        }, 1000);
      };

      const montarCodigo = () => {
        zona.innerHTML = pasoCodigo();
        const f = zona.querySelector('#f-codigo');
        const campo = f.querySelector('#codigo');
        const otro = f.querySelector('#otro-correo');
        const reenviar = f.querySelector('#reenviar');
        campo.focus();
        contarReenvio(f);

        // Se acepta pegado con espacios o guiones ("123 456"): se limpian al escribir.
        campo.addEventListener('input', () => {
          const limpio = campo.value.replace(/\D/g, '').slice(0, 6);
          if (limpio !== campo.value) campo.value = limpio;
        });

        otro.addEventListener('click', montarCorreo);

        reenviar.addEventListener('click', async () => {
          clearFieldErrors(f);
          try {
            await withBusy(reenviar, () => pedirCodigo(correo), { label: 'Enviando otro código…' });
            estado.textContent = 'Te enviamos otro código. El anterior ya no sirve.';
            contarReenvio(f);
            campo.focus();
          } catch (e) {
            setFieldError(campo, e.message);
          }
        });

        f.addEventListener('submit', async (ev) => {
          ev.preventDefault();
          clearFieldErrors(f);
          const valor = campo.value.replace(/\D/g, '');
          if (valor.length !== 6) {
            setFieldError(campo, 'El código tiene 6 dígitos.');
            campo.focus();
            return;
          }
          otro.disabled = true;
          reenviar.disabled = true;
          try {
            await withBusy(f.querySelector('[type=submit]'), () => confirmarCodigo(correo, valor), { label: 'Entrando…' });
            clearInterval(reloj);
            ir(destinoTrasEntrar());
          } catch (e) {
            // El código ya se gastó y la sesión existe, pero la carga falló
            // (red, límite): reintentar el código diría "no válido". Se recarga
            // la página, y la carcasa ofrece reintentar con la sesión puesta.
            if (tokenGuardado()) { location.reload(); return; }
            otro.disabled = false;
            reenviar.disabled = !puedeReenviar;
            setFieldError(campo, e.message);
            campo.focus();
            campo.select();
          }
        });
      };

      montarCorreo();
    },
    limpiar: () => {},
  };
}
