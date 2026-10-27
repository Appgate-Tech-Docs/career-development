/* =========================================================================
   API — la única puerta hacia el flujo de Power Automate
   =========================================================================
   Una sola URL y una sola forma de petición: { accion, token, datos }. El
   flujo ejecuta el Office Script (servidor/motor.ts) y responde con
   { ok, ... } o { ok: false, error: { codigo, mensaje } }.

   POR QUÉ text/plain
   ------------------
   Un POST con Content-Type application/json obliga al navegador a preguntar
   antes (OPTIONS, la consulta previa de CORS), y el disparador HTTP de Power
   Automate no la atiende. Con text/plain y sin encabezados propios la
   petición es "simple" y va directo. Por eso también el token viaja en el
   cuerpo y no en un encabezado Authorization.
   ========================================================================= */

import { API_URL } from '../config.js';

const LLAVE = 'cdp.sesion';
let memoria = null;   // copia por si sessionStorage está bloqueado (modo privado estricto)

export function tokenGuardado() {
  try {
    const s = JSON.parse(sessionStorage.getItem(LLAVE) ?? 'null');
    if (s?.token && s.expira > Date.now()) return s.token;
  } catch { /* sin almacenamiento */ }
  return memoria && memoria.expira > Date.now() ? memoria.token : null;
}

export function guardarToken(token, expira) {
  memoria = { token, expira };
  try { sessionStorage.setItem(LLAVE, JSON.stringify(memoria)); } catch { /* queda en memoria */ }
}

export function olvidarToken() {
  memoria = null;
  try { sessionStorage.removeItem(LLAVE); } catch { /* nada que borrar */ }
}

/** En el servidor local de desarrollo la API está en el mismo origen. */
function urlApi() {
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (local && !new URLSearchParams(location.search).has('remoto')) return '/api';
  return API_URL;
}

export class ErrorApi extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.codigo = codigo;
  }
}

/**
 * Llama a una acción. Lanza ErrorApi con el código del motor; los códigos que
 * importan a la carcasa son 'sesion' (volver a entrar) y 'red'.
 */
export async function llamar(accion, datos = {}, { conToken = true } = {}) {
  const url = urlApi();
  if (!url) {
    throw new ErrorApi('configuracion',
      'Falta la dirección del flujo en config.js. Mientras no esté, el portal solo funciona con el servidor local.');
  }
  const cuerpo = { accion, datos };
  if (conToken) cuerpo.token = tokenGuardado();

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(cuerpo),
      cache: 'no-store',
      credentials: 'omit',
    });
  } catch {
    throw new ErrorApi('red', 'No hay conexión con el servidor. Revisa tu red e inténtalo de nuevo.');
  }

  let r;
  try { r = await res.json(); } catch { r = null; }
  if (!res.ok || !r) {
    // Power Automate responde 429 cuando se pasa del límite de ejecuciones.
    if (res.status === 429) throw new ErrorApi('ocupado', 'El servidor está atendiendo muchas solicitudes. Espera un minuto y vuelve a intentarlo.');
    throw new ErrorApi('servidor', `El servidor respondió con un error (${res.status}). Inténtalo de nuevo en un momento.`);
  }
  if (!r.ok) {
    const e = r.error ?? { codigo: 'servidor', mensaje: 'Error desconocido.' };
    if (e.codigo === 'sesion') {
      olvidarToken();
      document.dispatchEvent(new CustomEvent('cdp:sesion-terminada'));
    }
    throw new ErrorApi(e.codigo, e.mensaje);
  }
  return r;
}
