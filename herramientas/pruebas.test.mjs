/* =========================================================================
   PRUEBAS DEL MOTOR — npm run probar
   =========================================================================
   Corren el motor compilado sobre el Excel de prueba, igual que el flujo.
   Lo que más importa probar es lo que el front NO puede garantizar: que
   nadie reciba datos de un equipo que no lidera, aunque llame al flujo a mano.
   ========================================================================= */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { cargarMotor, leerLibro, fuenteSobre, entropia } from './libro.mjs';

const ejecutar = cargarMotor();
let tablas;
let fuente;
let reloj = Date.UTC(2026, 10, 10, 15, 0, 0);

before(async () => {
  tablas = await leerLibro();
  fuente = fuenteSobre(tablas);
});

function llamar(peticion, { crudo = false } = {}) {
  reloj += 61_000; // más que la espera entre códigos
  const salida = JSON.parse(ejecutar(fuente, crudo ? peticion : JSON.stringify(peticion), entropia(), reloj));
  return salida;
}

const r = (accion, datos = {}, token = undefined) => llamar({ accion, token, datos }).respuesta;

function entrarComo(correo) {
  reloj += 3_600_000; // cada ingreso en otra hora: el límite de códigos por hora no interfiere entre pruebas
  const s = llamar({ accion: 'solicitarCodigo', datos: { correo } });
  assert.ok(s.correo, `no salió correo para ${correo}`);
  const codigo = s.correo.html.match(/>(\d{6})</)[1];
  const v = r('verificarCodigo', { correo, codigo });
  assert.equal(v.ok, true, JSON.stringify(v));
  return v.token;
}

const ids = (lista) => lista.map((p) => p.id).sort();

/* ------------------------------------------------------------- ingreso */

test('un correo que no existe recibe la misma respuesta y ningún correo', () => {
  const s = llamar({ accion: 'solicitarCodigo', datos: { correo: 'nadie@example.com' } });
  assert.equal(s.correo, null);
  assert.equal(s.respuesta.ok, true);
  const real = llamar({ accion: 'solicitarCodigo', datos: { correo: 'marcela.duarte@example.com' } });
  assert.deepEqual(real.respuesta, s.respuesta, 'la respuesta no debe delatar si el correo existe');
});

test('la respuesta al navegador nunca incluye el código', () => {
  const s = llamar({ accion: 'solicitarCodigo', datos: { correo: 'ivan.restrepo@example.com' } });
  const codigo = s.correo.html.match(/>(\d{6})</)[1];
  assert.ok(!JSON.stringify(s.respuesta).includes(codigo));
});

test('código equivocado: se rechaza y se invalida tras los intentos máximos', () => {
  const correo = 'andres.villalba@example.com';
  const s = llamar({ accion: 'solicitarCodigo', datos: { correo } });
  const bueno = s.correo.html.match(/>(\d{6})</)[1];
  const malo = bueno === '111111' ? '222222' : '111111';
  for (let i = 0; i < 5; i += 1) assert.equal(r('verificarCodigo', { correo, codigo: malo }).error.codigo, 'codigo');
  assert.equal(r('verificarCodigo', { correo, codigo: bueno }).error.codigo, 'codigo', 'tras 5 intentos el código bueno ya no sirve');
});

test('un código nuevo invalida el anterior y un código no sirve dos veces', () => {
  const correo = 'tomas.bedoya@example.com';
  const viejo = llamar({ accion: 'solicitarCodigo', datos: { correo } }).correo.html.match(/>(\d{6})</)[1];
  const nuevo = llamar({ accion: 'solicitarCodigo', datos: { correo } }).correo.html.match(/>(\d{6})</)[1];
  if (viejo !== nuevo) assert.equal(r('verificarCodigo', { correo, codigo: viejo }).ok, false);
  assert.equal(r('verificarCodigo', { correo, codigo: nuevo }).ok, true);
  assert.equal(r('verificarCodigo', { correo, codigo: nuevo }).ok, false);
});

test('límite de códigos por hora', () => {
  const correo = 'lorena.cespedes@example.com';
  let enviados = 0;
  for (let i = 0; i < 8; i += 1) if (llamar({ accion: 'solicitarCodigo', datos: { correo } }).correo) enviados += 1;
  assert.equal(enviados, 5);
  reloj += 3_600_000;
});

test('sin sesión no hay datos', () => {
  assert.equal(r('inicio', {}, 'x'.repeat(48)).error.codigo, 'sesion');
  assert.equal(r('inicio').error.codigo, 'sesion');
});

test('la petición envuelta en $content base64 (como puede llegar del flujo) se entiende', () => {
  const t = entrarComo('mateo.sanchez@example.com');
  const json = JSON.stringify({ accion: 'inicio', token: t });
  const envuelto = JSON.stringify({ '$content-type': 'text/plain', '$content': Buffer.from(json, 'utf8').toString('base64') });
  assert.equal(llamar(envuelto, { crudo: true }).respuesta.ok, true);
});

/* --------------------------------------------------------------- alcance */

test('una líder ve a sus reportes directos y a nadie de otro equipo', () => {
  const t = entrarComo('rocio.tamayo@example.com');
  const d = r('inicio', {}, t);
  const reportes = d.personas.filter((p) => p.relacion === 'reporte');
  assert.deepEqual(ids(reportes),
    ['andres-villalba', 'ivan-restrepo', 'lorena-cespedes', 'marcela-duarte', 'paula-salgado', 'tomas-bedoya']);
  // Claudia y Ximena reportan a Paula, que reporta a Rocío: fuera del alcance.
  const todas = ids(d.personas);
  for (const ajena of ['claudia-ferrer', 'ximena-robledo', 'sergio-maldonado', 'diego-castano']) {
    assert.ok(!todas.includes(ajena), `${ajena} no debería llegar`);
    assert.ok(!d.evaluaciones.filas.some((e) => e[0] === ajena), `evaluaciones de ${ajena} no deberían llegar`);
  }
  assert.ok(d.usuario.roles.includes('lider'));
  assert.ok(!d.usuario.roles.includes('admin'));
  assert.equal(d.administracion, undefined);
});

test('nadie ve quién lo evaluó como par, ni los correos de otros', () => {
  const t = entrarComo('marcela.duarte@example.com');
  const d = r('inicio', {}, t);
  const ajenas = d.evaluaciones.filas.filter((e) => e[4] !== 'yo');
  assert.ok(ajenas.length > 0);
  assert.ok(ajenas.every((e) => e[4] === ''), 'el evaluador ajeno debe llegar vacío');
  assert.ok(d.personas.filter((p) => p.id !== 'marcela-duarte').every((p) => p.correo === undefined));
});

test('a un par solo le llegan sus propias respuestas sobre la persona que evalúa', () => {
  const t = entrarComo('camilo.estrada@example.com');
  const d = r('inicio', {}, t);
  const rocio = d.evaluaciones.filas.filter((e) => e[0] === 'rocio-tamayo');
  assert.ok(rocio.length > 0);
  assert.ok(rocio.every((e) => e[4] === 'yo'));
});

test('no se puede evaluar a alguien fuera del alcance, aunque se pida a mano', () => {
  const t = entrarComo('rocio.tamayo@example.com');
  const e = r('guardarEvaluacion', { evaluadoId: 'claudia-ferrer', respuestas: { f159: 4 } }, t);
  assert.equal(e.error.codigo, 'permiso');
});

test('el rol sale de la relación, no de la petición; reenviar no duplica', () => {
  const t = entrarComo('rocio.tamayo@example.com');
  const d = r('inicio', {}, t);
  const cargo = d.cargos.find((c) => c.id === d.personas.find((p) => p.id === 'marcela-duarte').cargo_id);
  const resp = Object.fromEntries(cargo.habilidades.map((h) => [h.skill_id, 3]));
  const antes = tablas.Evaluaciones.valores.length;
  const g = r('guardarEvaluacion', { evaluadoId: 'marcela-duarte', rol: 'Employee', respuestas: resp }, t);
  assert.equal(g.rol, 'Leader');
  const despues = tablas.Evaluaciones.valores.length;
  r('guardarEvaluacion', { evaluadoId: 'marcela-duarte', respuestas: resp }, t);
  assert.equal(tablas.Evaluaciones.valores.length, despues, 'reenviar no agrega filas');
  assert.ok(despues >= antes);
});

test('puntajes fuera de rango y habilidades ajenas al cargo se rechazan', () => {
  const t = entrarComo('rocio.tamayo@example.com');
  assert.equal(r('guardarEvaluacion', { evaluadoId: 'marcela-duarte', respuestas: { f159: 9 } }, t).error.codigo, 'datos');
  assert.equal(r('guardarEvaluacion', { evaluadoId: 'marcela-duarte', respuestas: { 'no-existe': 3 } }, t).error.codigo, 'datos');
});

test('las acciones de administración se niegan a quien no es admin', () => {
  const t = entrarComo('rocio.tamayo@example.com');
  const a = r('admin.actualizar', { entidad: 'persona', id: 'claudia-ferrer', cambios: { nombre: 'X' } }, t);
  assert.equal(a.error.codigo, 'permiso');
  assert.equal(r('admin.auditoria', {}, t).error.codigo, 'permiso');
});

/* -------------------------------------------- administración y auditoría */

test('líder interino: la directora ve el equipo de Paula mientras está asignada', () => {
  const admin = entrarComo('fabian.otero@example.com');
  const g = entrarComo('gabriela.montoya@example.com');
  const antes = ids(r('inicio', {}, g).personas.filter((p) => p.relacion === 'reporte'));
  assert.ok(!antes.includes('claudia-ferrer'));

  const a = r('admin.actualizar', {
    entidad: 'equipo', id: 'eq-paula-salgado', cambios: { lider_interino_id: 'gabriela-montoya' }, motivo: 'Paula de licencia',
  }, admin);
  assert.equal(a.cambios, 1);
  const durante = ids(r('inicio', {}, g).personas.filter((p) => p.relacion === 'reporte'));
  assert.ok(durante.includes('claudia-ferrer') && durante.includes('ximena-robledo'));

  r('admin.actualizar', { entidad: 'equipo', id: 'eq-paula-salgado', cambios: { lider_interino_id: '' } }, admin);
  const despues = ids(r('inicio', {}, g).personas.filter((p) => p.relacion === 'reporte'));
  assert.ok(!despues.includes('claudia-ferrer'));

  const aud = r('admin.auditoria', { filtros: { equipoId: 'eq-paula-salgado' } }, admin);
  const acciones = aud.filas.map((f) => f.accion);
  assert.ok(acciones.includes('asignar-interino') && acciones.includes('quitar-interino'));
  const asignacion = aud.filas.find((f) => f.accion === 'asignar-interino');
  assert.equal(asignacion.actor_nombre, 'Fabián Otero');
  assert.equal(asignacion.detalle, 'Paula de licencia');
  assert.equal(asignacion.despues, 'gabriela-montoya');
});

test('ocultar a una persona la saca del tablero de su líder; renombrar queda auditado', () => {
  const admin = entrarComo('fabian.otero@example.com');
  const rocio = entrarComo('rocio.tamayo@example.com');
  r('admin.actualizar', { entidad: 'persona', id: 'ivan-restrepo', cambios: { oculto: true } }, admin);
  assert.ok(!ids(r('inicio', {}, rocio).personas).includes('ivan-restrepo'));
  r('admin.actualizar', { entidad: 'persona', id: 'ivan-restrepo', cambios: { oculto: false, nombre: 'Iván Restrepo Gil' } }, admin);
  const d = r('inicio', {}, rocio);
  assert.equal(d.personas.find((p) => p.id === 'ivan-restrepo').nombre, 'Iván Restrepo Gil');
  const aud = r('admin.auditoria', { filtros: { entidadId: 'ivan-restrepo' } }, admin);
  assert.deepEqual(aud.filas.map((f) => f.accion).slice(0, 3), ['renombrar', 'mostrar', 'ocultar']);
  assert.equal(aud.filas[0].antes, 'Iván Restrepo');
});

test('desactivar a alguien corta su sesión abierta', () => {
  const admin = entrarComo('fabian.otero@example.com');
  const t = entrarComo('daniela.rincon@example.com');
  assert.equal(r('inicio', {}, t).ok, true);
  r('admin.actualizar', { entidad: 'persona', id: 'daniela-rincon', cambios: { activo: false } }, admin);
  assert.equal(r('inicio', {}, t).error.codigo, 'sesion');
  r('admin.actualizar', { entidad: 'persona', id: 'daniela-rincon', cambios: { activo: true } }, admin);
});

test('validaciones: correo duplicado, líder miembro de su propio equipo, desactivarse a sí mismo', () => {
  const admin = entrarComo('fabian.otero@example.com');
  assert.equal(r('admin.actualizar', { entidad: 'persona', id: 'mateo-sanchez', cambios: { correo: 'laura.pineda@example.com' } }, admin).error.codigo, 'datos');
  assert.equal(r('admin.actualizar', { entidad: 'equipo', id: 'eq-rocio-tamayo', cambios: { lider_id: 'marcela-duarte' } }, admin).error.codigo, 'datos');
  assert.equal(r('admin.actualizar', { entidad: 'persona', id: 'fabian-otero', cambios: { activo: false } }, admin).error.codigo, 'datos');
  assert.equal(r('admin.actualizar', { entidad: 'persona', id: 'mateo-sanchez', cambios: { salario: 1 } }, admin).error.codigo, 'datos');
});

test('crear persona y equipo, mover a la persona: el nuevo líder la ve', () => {
  const admin = entrarComo('fabian.otero@example.com');
  const eq = r('admin.crear', { entidad: 'equipo', valores: { nombre: 'QA Automatización', area: 'Engineering', lider_id: 'julian-arboleda' } }, admin);
  assert.equal(eq.ok, true);
  const p = r('admin.crear', { entidad: 'persona', valores: { nombre: 'Sofía Prueba', correo: 'sofia.prueba@example.com', cargo_id: 'qa-ic1', equipo_id: eq.id, area: 'Engineering' } }, admin);
  assert.equal(p.ok, true);
  const julian = entrarComo('julian.arboleda@example.com');
  assert.ok(ids(r('inicio', {}, julian).personas.filter((x) => x.relacion === 'reporte')).includes(p.id));
  const sofia = entrarComo('sofia.prueba@example.com');
  assert.ok(r('inicio', {}, sofia).usuario.roles.includes('colaborador'));
});

test('anular la evaluación de un evaluador la saca del cálculo y queda auditado', () => {
  const admin = entrarComo('fabian.otero@example.com');
  const d = r('inicio', {}, admin);
  const deLorena = d.evaluaciones.filas.filter((e) => e[0] === 'lorena-cespedes' && e[2] === 'Peer');
  const evaluador = deLorena[0][4];
  const a = r('admin.anularEvaluacion', { evaluadoId: 'lorena-cespedes', evaluadorId: evaluador, rol: 'Peer', motivo: 'par mal asignado' }, admin);
  assert.ok(a.cambios > 0);
  const d2 = r('inicio', {}, admin);
  assert.ok(!d2.evaluaciones.filas.some((e) => e[0] === 'lorena-cespedes' && e[2] === 'Peer' && e[4] === evaluador));
});

test('ocultar una habilidad la saca de los cargos para todos menos el admin', () => {
  const admin = entrarComo('fabian.otero@example.com');
  const t = entrarComo('rocio.tamayo@example.com');
  const cargo = r('inicio', {}, t).cargos.find((c) => c.habilidades.length);
  const sid = cargo.habilidades[0].skill_id;
  r('admin.actualizar', { entidad: 'habilidad', id: sid, cambios: { oculto: true } }, admin);
  const c2 = r('inicio', {}, t).cargos.find((c) => c.id === cargo.id);
  assert.ok(!c2.habilidades.some((h) => h.skill_id === sid));
  const cAdmin = r('inicio', {}, admin).cargos.find((c) => c.id === cargo.id);
  assert.ok(cAdmin.habilidades_todas.some((h) => h.skill_id === sid));
  r('admin.actualizar', { entidad: 'habilidad', id: sid, cambios: { oculto: false } }, admin);
});

test('ronda cerrada: no se aceptan evaluaciones', () => {
  const admin = entrarComo('fabian.otero@example.com');
  r('admin.actualizar', { entidad: 'config', id: 'ronda_abierta', cambios: { valor: false } }, admin);
  const t = entrarComo('rocio.tamayo@example.com');
  assert.equal(r('guardarEvaluacion', { evaluadoId: 'marcela-duarte', respuestas: { f159: 3 } }, t).error.codigo, 'ronda');
  r('admin.actualizar', { entidad: 'config', id: 'ronda_abierta', cambios: { valor: true } }, admin);
});

test('planes: el líder crea y borra (oculta) el plan de un reporte; otro líder no puede', () => {
  const t = entrarComo('rocio.tamayo@example.com');
  const p = r('guardarPlan', { personaId: 'marcela-duarte', titulo: 'Crecer a L2', objetivo: 'x', propuesta: 'y', skillIds: ['f159'] }, t);
  assert.equal(p.ok, true);
  const camilo = entrarComo('camilo.estrada@example.com');
  assert.equal(r('borrarPlan', { id: p.plan.id }, camilo).error.codigo, 'permiso');
  assert.equal(r('borrarPlan', { id: p.plan.id }, t).ok, true);
  assert.ok(!r('inicio', {}, t).planes.some((x) => x.id === p.plan.id));
});

test('persona y rol de administración se guardan juntos: si algo falla, no se guarda nada', () => {
  const admin = entrarComo('fabian.otero@example.com');
  const antes = tablas.Auditoria.valores.length;
  const malo = r('admin.actualizar', { entidad: 'persona', id: 'laura-pineda', cambios: { nombre: 'Laura P.', admin: true, correo: 'diego.castano@example.com' } }, admin);
  assert.equal(malo.error.codigo, 'datos');
  assert.equal(tablas.Auditoria.valores.length, antes, 'un error no deja escrituras a medias');
  const bueno = r('admin.actualizar', { entidad: 'persona', id: 'laura-pineda', cambios: { nombre: 'Laura P.', admin: true } }, admin);
  assert.equal(bueno.cambios, 2);
  assert.ok(r('inicio', {}, admin).personas.find((p) => p.id === 'laura-pineda').admin);
  r('admin.actualizar', { entidad: 'persona', id: 'laura-pineda', cambios: { nombre: 'Laura Pineda', admin: false } }, admin);
});

test('niveles esperados en lote, en una sola ejecución', () => {
  const admin = entrarComo('fabian.otero@example.com');
  const c = r('inicio', {}, admin).cargos.find((x) => x.id === 'qa-ic1');
  const [a, b] = c.habilidades;
  const lote = r('admin.cargoHabilidad', { cargoId: 'qa-ic1', cambios: [{ skillId: a.skill_id, nivel: 'Expert' }, { skillId: b.skill_id, nivel: '' }] }, admin);
  assert.equal(lote.cambios, 2);
  const c2 = r('inicio', {}, admin).cargos.find((x) => x.id === 'qa-ic1');
  assert.equal(c2.habilidades.find((h) => h.skill_id === a.skill_id).nivel_esperado, 'Expert');
  assert.ok(!c2.habilidades.some((h) => h.skill_id === b.skill_id));
  r('admin.cargoHabilidad', { cargoId: 'qa-ic1', cambios: [{ skillId: a.skill_id, nivel: a.nivel_esperado }, { skillId: b.skill_id, nivel: b.nivel_esperado }] }, admin);
});

test('salir invalida el token', () => {
  const t = entrarComo('natalia.ospina@example.com');
  assert.equal(r('salir', {}, t).ok, true);
  assert.equal(r('inicio', {}, t).error.codigo, 'sesion');
});

/* ------------------------------------------------------ ejecuciones cruzadas */

test('dos ejecuciones cruzadas sobre la misma fila no se pisan columnas distintas', () => {
  // El flujo no serializa las peticiones. Se simula la peor intercalación: A
  // lee el libro, B lee, escribe y termina, y después A escribe con lo que leyó.
  const admin = entrarComo('fabian.otero@example.com');
  const foto = Object.fromEntries(Object.entries(tablas).map(([n, t]) => [n, { columnas: [...t.columnas], valores: t.valores.map((f) => [...f]) }]));
  const fuenteVieja = { ...fuente, leer: (n) => ({ columnas: [...foto[n].columnas], valores: foto[n].valores.map((f) => [...f]) }) };

  reloj += 1000;
  const b = JSON.parse(ejecutar(fuente, JSON.stringify({ accion: 'admin.actualizar', token: admin, datos: { entidad: 'persona', id: 'marcela-duarte', cambios: { nombre: 'Marcela Duarte B' } } }), entropia(), reloj));
  assert.equal(b.respuesta.ok, true, JSON.stringify(b.respuesta));
  reloj += 1000;
  const a = JSON.parse(ejecutar(fuenteVieja, JSON.stringify({ accion: 'admin.actualizar', token: admin, datos: { entidad: 'persona', id: 'marcela-duarte', cambios: { area: 'Área A' } } }), entropia(), reloj));
  assert.equal(a.respuesta.ok, true, JSON.stringify(a.respuesta));

  const t = tablas.Personas;
  const fila = t.valores.find((f) => f[t.columnas.indexOf('id')] === 'marcela-duarte');
  assert.equal(fila[t.columnas.indexOf('nombre')], 'Marcela Duarte B', 'A pisó el nombre que cambió B');
  assert.equal(fila[t.columnas.indexOf('area')], 'Área A');
});
