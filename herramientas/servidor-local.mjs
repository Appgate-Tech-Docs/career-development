/* =========================================================================
   SERVIDOR LOCAL — el flujo de Power Automate, imitado para desarrollar
   =========================================================================
   npm run local   →   http://localhost:8130

   Hace lo mismo que el flujo, en el mismo orden:
     1. recibe el POST de /api,
     2. ejecuta el motor (servidor/motor.ts compilado) sobre el libro,
     3. si el motor pide enviar un correo, lo "envía": acá lo imprime en la
        consola y lo deja en /dev/buzon para que se pueda leer el código,
     4. responde al navegador SOLO con `respuesta`.

   Los datos viven en memoria y parten del Excel de prueba. Con --guardar se
   conservan entre reinicios en excel/local/estado.json (no se versiona).
   NADA de esto se publica: GitHub Pages solo sirve la carpeta docs/.
   ========================================================================= */

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cargarMotor, leerLibro, fuenteSobre, entropia } from './libro.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(RAIZ, 'docs');
const ESTADO = join(RAIZ, 'excel', 'local', 'estado.json');
const PUERTO = Number(process.env.PORT || 8130);
const GUARDAR = process.argv.includes('--guardar');

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

const ejecutar = cargarMotor();
const tablas = GUARDAR && existsSync(ESTADO) ? JSON.parse(await readFile(ESTADO, 'utf8')) : await leerLibro();
const fuente = fuenteSobre(tablas);
const buzon = [];

async function api(cuerpo) {
  const salida = JSON.parse(ejecutar(fuente, cuerpo, entropia(), Date.now()));
  if (salida.correo) {
    buzon.unshift({ ...salida.correo, ts: Date.now() });
    buzon.length = Math.min(buzon.length, 20);
    const codigo = salida.correo.html.match(/>(\d{6})</)?.[1];
    console.log(`\n  ✉  Correo a ${salida.correo.para} — código ${codigo ?? '(ver /dev/buzon)'}\n`);
  }
  if (GUARDAR) {
    await mkdir(dirname(ESTADO), { recursive: true });
    await writeFile(ESTADO, JSON.stringify(tablas));
  }
  return salida.respuesta;
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PUERTO}`);
  try {
    if (url.pathname === '/api' && req.method === 'POST') {
      let cuerpo = '';
      for await (const parte of req) cuerpo += parte;
      const r = await api(cuerpo);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(r));
      return;
    }
    if (url.pathname === '/dev/buzon') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(buzon));
      return;
    }
    let ruta = normalize(join(DOCS, decodeURIComponent(url.pathname)));
    if (!ruta.startsWith(DOCS)) { res.writeHead(403); res.end(); return; }
    if (url.pathname.endsWith('/')) ruta = join(ruta, 'index.html');
    const contenido = await readFile(ruta);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(ruta)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(contenido);
  } catch (e) {
    const noExiste = e.code === 'ENOENT';
    res.writeHead(noExiste ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(noExiste ? 'No encontrado' : String(e.stack || e));
  }
});

servidor.listen(PUERTO, () => {
  console.log(`\n  Desarrollo de Carrera — servidor local`);
  console.log(`  http://localhost:${PUERTO}`);
  console.log(`  Datos: ${GUARDAR ? 'se guardan en excel/local/estado.json' : 'en memoria; se reinician al cerrar (usa --guardar para conservarlos)'}`);
  console.log('  Los códigos de ingreso aparecen acá y en /dev/buzon.\n');
});
