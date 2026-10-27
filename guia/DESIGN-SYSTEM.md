# Design System — Portal de Desarrollo de Carrera

Fundación de diseño para convertir el PoC en un portal real. Sustituye los ocho
HTML independientes de `frontend/`, cada uno con su propia copia de la hoja de
estilos.

Este documento es la referencia normativa. Si algo aquí contradice el código, el
código está mal.

---

## 1. Estructura y orden de carga

```
portal/
├── styles/
│   ├── tokens.css              Primitivas de marca + tokens semánticos
│   ├── base.css                Reset, tipografía, fundamentos de accesibilidad
│   └── components.css          Componentes
├── lib/
│   ├── api.js                  Único punto de contacto con el backend + config de ronda
│   ├── ui.js                   Comportamiento: toasts, busy, errores, scores, escapado
│   ├── shell.js                Header y navegación, en una sola definición
│   ├── wizard.js               Wizard de evaluación compartido por los 3 formularios
│   └── session.js              Sesión de líder (transitoria — ver §7)
├── index.html                  Casa por audiencia
├── autoevaluacion.html         Employee
├── evaluar-equipo.html         Leader
├── evaluar-par.html            Peer, interno y externo
├── mi-desarrollo.html          Tablero individual + plan propio
├── dashboard-lider.html        Tablero de equipo
├── plan-desarrollo.html        Sugerencias, proyectos y seguimiento
├── catalogo-habilidades.html   CRUD del catálogo + modo líder + auditoría
├── acceso.html                 Flujo de autenticación (diseñado, sin implementar)
└── components.html             Referencia viva de componentes
```

### Correspondencia con el PoC

| PoC (`frontend/`) | Portal | Cambio de nombre |
|---|---|---|
| `index.html` | `index.html` | Reescrita: de lista plana de páginas a router por audiencia |
| `employee.html` | `autoevaluacion.html` | El nombre dice la tarea, no el rol del sistema |
| `leader.html` | `evaluar-equipo.html` | idem |
| `peer.html` | `evaluar-par.html` | idem |
| `dashboard_personal.html` | `mi-desarrollo.html` | Voz del usuario, no del sistema |
| `dashboard_lider.html` | `dashboard-lider.html` | kebab-case consistente |
| `career_path.html` | `plan-desarrollo.html` | Español, coherente con el resto |
| `gestion_skills.html` | `catalogo-habilidades.html` | idem |

`frontend/` queda intacto como referencia y rollback.

El orden de carga **no es opcional** — `base.css` y `components.css` consumen
variables definidas en `tokens.css`:

```html
<link rel="stylesheet" href="styles/tokens.css">
<link rel="stylesheet" href="styles/base.css">
<link rel="stylesheet" href="styles/components.css">
```

Los módulos JS son ES modules, así que las páginas deben servirse por HTTP.
Abrirlas con `file://` falla por CORS. Para desarrollo local:

```bash
python -m http.server 8090 --directory portal
```

---

## 2. Arquitectura de tokens — dos niveles

Es la decisión estructural más importante del sistema, y la que resuelve el
problema central del PoC.

**Nivel 1 — Primitivas de marca.** La paleta Appgate literal. Fuente de verdad.
Ningún componente las referencia directamente.

**Nivel 2 — Tokens semánticos.** Nombrados por **rol**, no por tono.
`--color-primary`, no `--medium-blue`. Los componentes usan solo estos.

### Por qué importa

El PoC declaraba `--navy`, `--medium-blue`, `--light-gray`. Eso es una lista de
colores, no un sistema. Tres consecuencias medibles:

1. **No se puede re-tematizar.** Cambiar la marca obliga a reescribir cada uso.
2. **La semántica es invisible.** Nada dice cuál es el color primario ni cuál
   significa peligro.
3. **Se filtran colores inventados.** Como la paleta no tiene rojo ni ámbar,
   aparecieron `#c0392b`, `#b8860b` y `#eafaf1` hardcodeados en cinco archivos
   para cubrir estados. Nadie los eligió; se necesitaban y no existían.

Con nivel 2, el modo oscuro, un re-branding o un ajuste de contraste son un
cambio de tokens, no una búsqueda y reemplazo global.

### Regla

> Un componente que referencia `--appgate-*` directamente es un bug.
> Si falta un rol, se agrega el token semántico; no se salta la capa.

---

## 3. Contraste — ratios verificados

La paleta de marca fue diseñada para impresión y formato grande. **Tres de sus
colores fallan WCAG AA como texto de cuerpo sobre fondo claro.** Esto no es una
opinión de diseño; son los ratios medidos.

### Fallos encontrados en el PoC

| Color | Uso en el PoC | Ratio sobre blanco | Requerido | Veredicto |
|---|---|---|---|---|
| `#8B91A9` | **Todo** el texto secundario, en los 8 archivos | 3.13:1 | 4.5:1 | ❌ |
| `#109255` | `.score.high` | 3.99:1 | 4.5:1 | ❌ |
| `#b8860b` | `.score.mid` | 3.25:1 | 4.5:1 | ❌ |

El gris medio era el color de todos los subtítulos, labels de KPI, encabezados
de tabla y notas del portal. No era un fallo puntual: era la capa de tokens.

### Variantes derivadas

Método: mantener tono y croma en `oklch()`, reducir luminosidad hasta pasar el
umbral, y fijar el resultado como hex para que el valor sea verificable y
estable. Los hex son la fuente de verdad — `oklch()` fue la herramienta de
derivación, no el valor entregado.

| Token | Valor | Ratio sobre `#FAFBFD` | Uso |
|---|---|---|---|
| `--color-text` | `#3B4053` | 9.92:1 | Texto de cuerpo |
| `--color-text-heading` | `#081339` | 17.8:1 | Títulos |
| `--color-text-muted` | `#5E657D` | 5.58:1 | Texto secundario (reemplaza `#8B91A9`) |
| `--color-primary` | `#0072BA` | 5.10:1 | Acciones, links |
| `--color-success-text` | `#0C7343` | 5.92:1 | Texto de estado positivo |
| `--color-warning-text` | `#8A5A00` | 5.93:1 | Texto de advertencia |
| `--color-danger-text` | `#B02A20` | 6.57:1 | Texto de error |

Los colores de marca originales se conservan para **rellenos, bordes y
acentos**, donde el requisito es 3:1 y sí lo cumplen. La distinción está en el
nombre: `--color-success` rellena, `--color-success-text` escribe.

> Antes de introducir un color nuevo, calcula su ratio y anótalo. Un color sin
> ratio documentado no entra al sistema.

---

## 4. Tipografía

**IBM Plex Sans** para texto, **IBM Plex Mono** para números. Reemplaza a Arial,
que estaba en los ocho archivos.

Arial no era una decisión — era el default. Se cambió por tres razones, en orden
de peso:

1. **Cifras tabulares reales.** Este portal es tablas y KPIs. Los dígitos
   proporcionales de Arial hacen que las columnas de puntajes se desalineen
   visualmente. Plex Mono con `font-variant-numeric: tabular-nums` las alinea.
2. **Tono.** Humanista-técnico, adecuado para una empresa de seguridad
   empresarial sin leerse como landing page de startup.
3. **Licencia.** Open source, self-hostable, sin pregunta legal pendiente.

Si las guías de marca de Appgate especifican una tipografía licenciada, se
sobrescribe `--font-sans` en `tokens.css` y nada más cambia.

### Escala

Razón ~1.25, base 16px. `--text-2xs` (11px) es exclusivo para micro-labels en
mayúsculas; **nunca** para prosa. Mínimos por medio:

- Interfaz de escritorio: 14px
- Móvil: 16px para texto de cuerpo
- Objetivos táctiles: 44×44px (`--target-min`)

---

## 5. Componentes

Referencia visual navegable en `components.html`. Inventario:

| Componente | Variantes | Estados |
|---|---|---|
| `.btn` | `--primary` `--secondary` `--ghost` `--danger` `--sm` `--block` | default, hover, active, focus, disabled, busy |
| `.card` | `--flush` `--sunken` | — |
| `.callout` | `--warning` `--danger` `--success` | — |
| `.kpi` | `--accent` | — |
| `.score` | — | `data-level` = low / mid / high / none |
| `.badge` | `--neutral` `--info` `--success` `--warning` | — |
| `.table` | `.table__row--flagged`, `.table__detail` | hover, expandida |
| `.input` `.select` `.textarea` | — | default, hover, focus, disabled, error |
| `.modal` | — | abierto / cerrado (`<dialog>` nativo) |
| `.toast` | `--success` `--error` | — |
| `.state` | vacío / error | — |
| `.skeleton` | `--text` `--kpi` `--row` | — |
| `.choices` / `.choice` | `--inline` | default, hover, checked, focus |
| `.wizard__*` | — | pregunta, revisión, enviado |
| `.role-card` / `.task-link` | — | hover, focus |
| `.picker` / `.picker__item` | — | hover, checked, focus |
| `.repeater` / `.repeater__row` | — | agregar, quitar, mínimo alcanzado |
| `.plan` | `--en-curso` `--completado` | — |
| `.audit` / `.audit__row` | — | — |
| `.toolbar` | `__grow` `__check` | — |
| `.app-footer` | — | — |

### Dos módulos que eliminan duplicación

**`lib/shell.js`** — el header y la navegación existen una vez y se inyectan en
cada página. Sin build step la alternativa era pegar las mismas veinte líneas en
ocho archivos, que es exactamente el problema que esta reescritura resuelve.
Cuando llegue Astro esto se vuelve `Portal.astro` y el mismo markup se emite en
build en lugar de en runtime; la definición del nav se muda sin cambios.

**`lib/wizard.js`** — un solo wizard para los tres formularios de evaluación.
El PoC tenía `employee.html`, `leader.html` y `peer.html` con **tres copias** del
mismo wizard de ~200 líneas, diferenciadas solo en quién selecciona a quién, qué
habilidades se preguntan, y el string de rol que se envía. Cada corrección de
accesibilidad había que hacerla tres veces — o, como pasó en realidad, ninguna.
Parametrizar las diferencias colapsa ~700 líneas duplicadas.

El cambio importante que eso habilitó: las cuatro opciones de nivel eran `<div>`
con handler de click, inalcanzables por teclado y que no anuncian nada. Ahora son
un **grupo de radios real dentro de un `<fieldset>`**, así que la navegación por
flechas, la selección con Espacio y la semántica de grupo vienen de la
plataforma. El selector de modalidad de pares tenía el mismo defecto y usa ahora
el mismo componente.

### Reglas que el sistema se impone

1. **Ningún valor en píxeles fuera del set de tokens.** `padding: var(--space-sm)`,
   nunca `padding: 17px`.
2. **`border-left: Npx solid` no es un tratamiento de card.** Está reservado
   para `.callout`, donde el color del borde comunica algo real. El patrón
   `border-radius: 12px; border-left: 4px solid` es el default de plantilla SaaS
   y el PoC lo usaba para `.metric-item` y `.nota`.
3. **Todo elemento interactivo trae default, hover, active, focus y disabled.**
4. **Nada comunica estado solo con color.** Ver §6.
5. **El anillo de foco nunca se elimina.** `outline: none` sin sustituto es el
   fallo de accesibilidad más común, y el PoC lo tenía en las ocho páginas por
   omisión: no había ningún estilo de foco.

---

## 5b. Arquitectura de la información — entrada por audiencia

El `index.html` del PoC listaba las ocho páginas en una rejilla plana, con un
diagrama de arquitectura y un glosario. La misma vista para todos, organizada por
**cómo se construyó el sistema** en lugar de por **qué vino a hacer cada
persona**: un colaborador tenía que leer siete tarjetas sobre tableros y
administración de catálogo para encontrar el único formulario que le tocaba.

La casa nueva hace una sola pregunta: *¿qué vienes a hacer?*

| Audiencia | Tamaño | Tareas |
|---|---|---|
| **Colaborador** | Todos (55) | Autoevaluarse · ver sus resultados y su plan |
| **Líder** | 26 | Evaluar a sus reportes · tablero de equipo · crear y seguir planes |
| **Par** | Todos | Evaluar a un compañero de su área |
| **RH** | Pocos | Catálogo de habilidades · historial de auditoría |
| **Evaluador externo** | Eventual | Solo hard skills, por enlace directo |

Decisiones que esto implica:

- **Los roles son autodeclarados.** El portal no tiene autenticación (§7), así
  que la casa es una **señalización, no una frontera de permisos**, y no debe
  pretender lo contrario. Cuando la autenticación llegue, esta página puede
  filtrar por rol real; hasta entonces muestra todo y lo dice.
- **Los formularios de evaluación no están en la navegación.** Son
  dirigidos por ronda, no destinos cotidianos, y cuál necesitas depende de tu
  rol. La casa enruta; el nav lleva a los cuatro destinos permanentes.
- **El evaluador externo no recibe navegación.** Llega por enlace, llena un
  formulario y se va. Ofrecerle "Mi desarrollo" sería confuso y además engañoso
  sobre su acceso. `renderShell({ minimal: true })` existe para esto.
- **El glosario de métricas quedó colapsado.** Es contenido de consulta, no de
  ruta. Ocupaba cinco bloques a ancho completo en la casa del PoC.

## 5c. Modelo de evaluación — el Excel es la línea base

El PoC migró 3 de las 10 hojas del Excel origen: se trajo el **catálogo** de
habilidades y dejó afuera las dos hojas que definen **cómo se usa** ese catálogo.

| Hoja | Qué define | Estado |
|---|---|---|
| `MasterTable` | Qué habilidades aplican a cada **cargo** y con qué **nivel esperado** | Migrada — `lib/modelo.js` + `data/framework.json` |
| `ESCALA` | Pesos por evaluador, valor de cada nivel, bandas | Migrada — `lib/modelo.js` |
| `Assessment` / `Reports` / `Planning` | Formulario, reportería, plan estructurado | Pendiente (alcance nuevo, §13) |

### El framework no se copia a Airtable

`scripts/extract_framework.py` lo extrae del Excel a `portal/data/framework.json`,
y el portal lo lee de ahí. El Excel sigue siendo la fuente de verdad: cuando RRHH
agrega un cargo o cambia un nivel esperado, se vuelve a correr el extractor y
listo — sin migración, sin workflows nuevos, sin dos copias desincronizándose.

Airtable solo necesita `Personas.Cargo` (`scripts/add_cargo_field.py`), porque
eso sí es dato operativo que cambia con promociones.

### Dos modos, y la diferencia es 58% del formulario

`buildPreguntas()` en `lib/wizard.js`:

- **Por cargo** — el `Cargo` de la persona existe en el framework: se preguntan
  solo sus 18-26 habilidades, cada una con nivel esperado. Medido: QA Architect
  pasa de **62 a 26 preguntas (−58%)**.
- **Por departamento (respaldo)** — sin cargo o cargo no definido: todas las
  habilidades activas del departamento, 45-62 preguntas, sin nivel esperado.

El respaldo es deliberado: solo 8 cargos están definidos, de 3 de las 12 áreas.
Se puede llenar `Cargo` persona por persona y cada una pasa al formulario corto
en cuanto lo tenga. No hay día de corte.

### El cálculo, verificado contra el libro

`lib/modelo.js` reproduce los números del Excel **exactamente**. Contra el
ejemplo trabajado del propio libro (QA Architect):

| | Portal | Excel |
|---|---|---|
| Funciones | 85 | 85 |
| Soft skills | 96.25 | 96.25 |
| Hard skills | 92.5 | 92.5 |
| **Total general** | **91.25 → Expert** | **91.25 → Expert** |

Escalas, todas leídas de `ESCALA` y no fijadas en código:

- **Peso por evaluador** — Líder 0.35 · Par 0.35 · Empleado 0.30
- **Valor por nivel** — Basic 40 · Intermediate 70 · Advanced 90 · Expert 100
  (no es lineal: Basic→Intermediate son 30 puntos, Advanced→Expert son 10)
- **Bandas del total** — Basic 0-40 · Intermediate 41-70 · Advanced 71-90 · Expert 91-100
- **Concepto del puntaje 1-5** — Critical · Low · Satisfactory · Outstanding · Excellent

### Brechas de verdad

Una brecha es **real vs esperado**, no "el promedio más bajo".

El PoC ordenaba por promedio absoluto, lo que marca a un junior que rinde
exactamente a su nivel esperado como su propia prioridad número uno, y puede
esconder a un senior por debajo de lo esperado si su número absoluto es alto.
`brechaHabilidad()` devuelve `supera` / `cumple` / `brecha-leve` /
`brecha-critica` / `sin-referencia`, y `ordenarPorPrioridad()` deja al final lo
que cumple. `sin-referencia` no es lo mismo que `cumple`: no se puede priorizar
lo que no se sabe.

### DIVERGENCIA 1 — evaluadores ausentes

El Excel trata una celda vacía como 0. Una habilidad calificada 4 y 4 por
empleado y líder, sin par, da **2.6** y cae en banda "Low" (verificado en la fila
de ejemplo del libro). Durante una ronda en curso, donde las evaluaciones de
pares llegan tarde, eso hace que todo el mundo se vea en crisis por un dato que
falta.

`puntajePonderado()` **redistribuye** los pesos entre los evaluadores presentes,
así que 4 y 4 sin par da **4.0**, y devuelve `evaluadoresFaltantes` para que la
interfaz diga que el dato está incompleto en lugar de fingir que no.
`{ redistribuir: false }` reproduce el número exacto del Excel.

### DIVERGENCIA 2 — pesos por categoría declarados pero no aplicados

`ESCALA` declara Funciones 0.50 · Soft 0.25 · Hard 0.25 en las celdas J12:K14.
**Ninguna fórmula del libro los referencia** — se verificó buscando en las diez
hojas. El total general es `AVERAGE(S10:U10)`, un promedio simple.

Por defecto se replica lo que el libro **hace**, no lo que **declara**.
`totalGeneral(..., { ponderado: true })` aplica los pesos declarados.

**Esto necesita decisión de RRHH y no es cosmético:** para QA Architect el total
pasa de **91.25 "Expert"** a **89.69 "Advanced"**. Los pesos cambian el nivel de
la persona.

### Lo que el instrumento captura y el portal todavía no

El Excel registra **dos cosas por habilidad**: un **nivel** (dropdown
Basic/Intermediate/Advanced/Expert) y **tres puntajes 1-5** (Employee, Leader,
Peer). Alimentan cosas distintas — el nivel arma el perfil observado, los
puntajes 1-5 dan el valor ponderado y su concepto cualitativo.

El portal captura solo el nivel y lo usa como puntaje, conflacionando ambos.
Separarlos es un cambio de esquema en `Evaluaciones` y está en §13.

**Decisión de diseño:** el nivel esperado **no** se le muestra a quien evalúa.
Mostrarlo ancla la respuesta hacia lo esperado, que es justo el sesgo que una
evaluación 360° intenta evitar. Se usa después, para calcular la brecha.

### Huecos del origen que RRHH debe cerrar

El extractor los reporta en cada corrida:

- **5 hard skills** asignadas a HR Business Partner que **no existen en el
  catálogo**. Ese cargo hoy resuelve 13 de 18 habilidades y queda sin ninguna
  hard skill. Hay que escribirles sus 4 niveles.
- **2 filas duplicadas** en el catálogo (Engineering: `Databases (SQL/NoSQL)`,
  `Web Development (Frontend/Backend)`).
- **19 nombres de función sin limpiar**, algunos con salto de línea inicial. El
  join los tolera normalizando, pero se muestran como están.
- **9 de 12 áreas sin cargos definidos** en MasterTable.

## 6. No comunicar con color solamente

Aproximadamente el 8% de los hombres tiene alguna forma de daltonismo. El color
también desaparece en escala de grises, en impresión y en modo de alto
contraste de Windows.

### El componente `.score`

El PoC pintaba el número de rojo, ámbar o verde. Ese era el único indicador de
banda. El reemplazo lleva tres señales redundantes, en este orden de prioridad:

1. **El numeral.** `3.4` — legible sin ninguna otra pista.
2. **Un medidor segmentado.** Cuenta de segmentos llenos: forma y posición,
   independientes del color.
3. **Color.** Última, no única.

Más un `.sr-only` con la lectura completa en palabras:
`"Promedio general de Cristian Beltran: 3.4 de 5, nivel medio"`. El medidor
lleva `aria-hidden` para que un lector de pantalla anuncie el dato una sola vez.

### Otros casos

- **Links:** subrayados por defecto. Un link distinguido solo por color falla
  WCAG 1.4.1.
- **Página actual en el nav:** `aria-current="page"` + cambio de peso + barra
  inferior, no solo color.
- **Fila destacada (top performer):** el tinte de fondo es apoyo; la señal real
  es la insignia con icono.
- **Campos con error:** borde rojo **más** icono **más** mensaje asociado por
  `aria-describedby` **más** `aria-invalid`.
- **Campos obligatorios:** marcados con la palabra "(obligatorio)", no con un
  asterisco de color.

---

## 7. Autenticación

> **Estado: diseñada, no implementada.** `acceso.html` es el artefacto de
> diseño. Ninguna credencial se verifica ahí.

### Lo que hay hoy (heredado del PoC)

- PINs de líder guardados en Airtable como **texto plano** (`Personas.Lider_PIN`).
- El PIN vive en el cliente y se reenvía en cada llamada mutante.
- Cualquier script en la página — incluida una dependencia de CDN comprometida —
  puede leerlo del almacenamiento.
- Sin límite de intentos: un PIN de 4 dígitos se rompe por fuerza bruta trivialmente.

**Esto no es una frontera de seguridad. Es una compuerta de UI.** Adecuado para
un PoC interno; no para un portal con datos de evaluación de desempeño de 55
personas.

### Corregido en `lib/session.js`, porque era gratis

- Las sesiones caducan (8 horas). Antes no caducaban nunca.
- El PIN vive en `sessionStorage`, así muere al cerrar la pestaña en vez de
  persistir indefinidamente en una máquina compartida.
- Todo acceso pasa por una función, así que el cambio a auth real toca un archivo.

### Objetivo

Enlace de acceso de un solo uso enviado al correo corporativo (diseñado en
`acceso.html`), que emite un token de vida corta en una cookie `httpOnly`,
`Secure`, `SameSite=Strict`. El servidor valida en cada petición. Sin
credenciales en el cliente.

Estados ya diseñados: inicial, enviando, enlace enviado, correo inválido,
dominio no permitido, demasiados intentos, sesión caducada, servicio caído.

### Pasos de migración

1. Decidir el proveedor de base de datos (pendiente).
2. Eliminar `Personas.Lider_PIN`. No migrar el valor.
3. Endpoint de solicitud de enlace: recibe correo, valida dominio, aplica límite
   de intentos, envía token de un uso con caducidad de 15 minutos.
4. Endpoint de canje: valida el token, emite la cookie de sesión, invalida el token.
5. Los workflows de n8n leen la identidad de la cookie en vez del PIN del payload.
6. Reemplazar el `simulate()` de `acceso.html` por las peticiones reales.
7. Reducir `lib/session.js` a lectura de estado; el secreto ya no está en el cliente.

---

## 8. Modo oscuro

Deliberadamente **no** implementado. La arquitectura de tokens lo convierte en
un intercambio: redefinir solo los valores `--color-*` de nivel 2, sin tocar
nivel 1 ni ningún componente.

Está sin implementar en lugar de a medias porque cada par de colores oscuros
necesita su propia verificación de contraste, y un tema oscuro sin verificar es
peor que no tenerlo.

Procedimiento cuando se aborde:

```css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* solo tokens de nivel 2 */ }
}
:root[data-theme="dark"] { /* los mismos, para el toggle explícito */ }
```

Verificar cada par de texto/fondo antes de dar el tema por terminado, y
documentar los ratios en §3.

---

## 9. Migración a Astro

Node no está instalado en el entorno actual, así que la fundación se construyó
sin build step. Es intencionalmente portable:

| Archivo actual | Destino en Astro | Cambio |
|---|---|---|
| `styles/*.css` | `src/styles/*.css` | Ninguno |
| `lib/*.js` | `src/lib/*.js` | Ninguno |
| `<header>` + `<nav>` de cada página | `src/layouts/Portal.astro` | Se extrae una vez |
| Bloques de componentes | `src/components/*.astro` | Marcado 1:1 |
| `dashboard-lider.html` | `src/pages/dashboard-lider.astro` | Envolver en el layout |

### El argumento más fuerte para migrar: nombres con hash

Durante la verificación apareció un problema que Astro resuelve de raíz.

Los módulos ES y las hojas de estilo se sirven en rutas **fijas**
(`/lib/ui.js`, `/styles/components.css`). Cuando una de ellas cambia, un
navegador que ya la tenía en caché puede seguir usando la versión vieja — y si
una página nueva importa un símbolo que el módulo viejo no exporta, **el import
falla y la página entera queda inerte**. No degradada: inerte, porque un módulo
que no carga no ejecuta nada.

Esto se reprodujo de forma medida: el servidor devolvía los archivos corregidos
mientras el navegador seguía con `ui.js` sin los exports nuevos, y la página no
hacía nada. La verificación solo pudo completarse levantando el sitio en otro
puerto, es decir en un origen con caché vacío.

En GitHub Pages el riesgo es real: sirve `ETag` con `Cache-Control: max-age=600`,
así que durante los diez minutos siguientes a un despliegue un usuario puede
recibir un HTML nuevo con módulos viejos. La ventana es corta, pero el modo de
falla es total.

Astro emite los assets con **hash en el nombre** (`ui.a1b2c3.js`), así que un
archivo nuevo es una URL nueva y esta clase de problema desaparece por completo.
Mientras la migración no exista, tras cada despliegue conviene forzar recarga
dura y avisar de que el primer minuto puede requerirla.

Pasos:

1. Instalar Node 20+.
2. `npm create astro@latest` en `portal/`, plantilla mínima.
3. Mover `styles/` y `lib/` a `src/` sin editarlos.
4. Extraer el shell (header, nav, skip link, `<head>`) a `src/layouts/Portal.astro`.
   Esto elimina la última duplicación que queda.
5. Convertir cada página a `.astro` envolviéndola en el layout.
6. `output: 'static'` y desplegar `dist/` a GitHub Pages. Sigue costando $0.

El paso 4 es el que justifica la migración: hoy el shell hay que repetirlo a
mano en cada archivo HTML.

---

## 10. Patrones de estado

El PoC renderizaba una tabla vacía cuando una consulta no devolvía nada. Una
superficie en blanco es indistinguible de una superficie rota.

| Situación | Patrón | Helper |
|---|---|---|
| Cargando | Skeleton del tamaño del contenido real, para que el layout no salte | `skeletonRows()` |
| Sin datos | Icono + título + explicación de qué haría que aparezcan datos | `emptyState()` |
| Error de carga | Icono + mensaje según el modo de fallo + botón de reintento | `errorState()` |
| Error de validación | Mensaje junto al campo, asociado por `aria-describedby` | `setFieldError()` |
| Acción en curso | Botón bloqueado con `aria-busy` | `withBusy()` |
| Resultado de acción | Toast; los errores no se auto-descartan | `toast()` |

`ApiError.userMessage` traduce cada modo de fallo (timeout, sin conexión, HTTP,
payload ilegible, error de negocio) a un mensaje que un usuario de RH puede
accionar. Nunca se muestra un stack trace.

### Sin `alert()`

El PoC usaba `alert()` para toda la validación. Bloquea el hilo principal, no se
puede estilizar, y no asocia el reclamo con el campo que lo provocó.
`validateRequired()` marca todos los fallos a la vez y enfoca el primero.

---

## 11. Seguridad de plantillas

`lib/ui.js` exporta `esc()`. **Todo valor interpolado en una cadena HTML debe
pasar por ahí.**

El PoC construía cada fila de tabla con template literals inyectando
directamente nombres de persona, nombres de habilidad, nombres de área y títulos
de framework. Los títulos de framework y los nombres de habilidad son editables
por el usuario, así que ese camino convierte texto almacenado en marcado
ejecutado.

- `esc(value)` para texto y atributos entre comillas.
- `slug(value)` para valores que terminan en un `id` o un selector CSS.

---

## 12. Verificación

La fundación pasó por una auditoría adversarial de accesibilidad con mediciones
reales en navegador (no lectura de código): 24 hallazgos — 5 bloqueadores, 10 de
calidad, 9 de pulido. **Los 24 están corregidos y re-verificados.**

### Los bloqueadores que importaba encontrar

| # | Defecto | Consecuencia real |
|---|---|---|
| B1 | El anillo de foco del skip link medía **1.00:1** — el mismo color que su propio fondo | La primerísima parada de Tab de cada página no tenía indicador visible |
| B2 | `slug()` colapsa caracteres: `"R&D"` y `"R D"` → ambos `R_D` | Ids duplicados cruzaban los editores de framework: guardar el segundo POSTeaba el texto del **primero** bajo el nombre del segundo. Corrupción silenciosa de datos |
| B3 | Colapsar un panel dejaba el foco dentro del subárbol oculto | El siguiente Tab reiniciaba desde el tope del documento; el lector de pantalla no anunciaba nada |
| B4 | El numeral del score no llevaba `aria-hidden` | Cada puntaje se anunciaba dos veces — 24 lecturas duplicadas solo en la tabla del equipo |
| B5 | El formulario de mentoría heredaba el ancho intrínseco de la tabla (613px en 375px) | En móvil el selector "Tema" quedaba fuera de pantalla. Fallo WCAG 1.4.10 Reflow |

### Dos regresiones que yo mismo introduje al corregir

Vale documentarlas porque son trampas reutilizables:

1. **`Chart.defaults.animation = undefined` no restaura el default.** Chart.js
   itera ese objeto y lanza `Cannot convert undefined or null to object` en el
   siguiente render. Hay que capturar el valor original y reasignarlo.
2. **`requestAnimationFrame` no se ejecuta si la página no está compositando.**
   Lo usé para diferir el append de los toasts, y en una pestaña de fondo, una
   ventana minimizada o un panel oculto eso se traga la notificación completa y
   en silencio — exactamente cuando más importa. `setTimeout(…, 0)` siempre se
   dispara y cumple el mismo requisito de orden.

Ninguna de las dos se habría detectado leyendo el código.

### Contraste — 38 pares medidos

Todos calculados en página vía `getComputedStyle` más luminancia relativa WCAG,
componiendo el alfa contra el fondo ancestro resuelto. Todos pasan tras las
correcciones. Los que fallaban:

| Par | Antes | Después |
|---|---|---|
| Anillo de foco vs relleno de `.skip-link` | 1.00:1 | ring blanco, 5.10:1 |
| Anillo de foco vs relleno de `.btn--danger` | 1.18:1 | ring blanco |
| `.score__seg.is-on` medio vs superficie | 2.95:1 | 5.93:1 |
| `.score__seg` vacío vs superficie | 1.46:1 | delineado, 5.78:1 |
| `.score__seg` vacío vs fila destacada | 1.30:1 | delineado, 5.78:1 |

Los segmentos vacíos pasaron de relleno claro a **delineado**: a 1.27–1.46:1 la
pista de referencia era invisible, así que "3 de 5 llenos" no se podía contar —
y contar es justamente para lo que existe el medidor.

### Objetivos táctiles a 375px

Los 7 elementos medidos ahora son de 44px de alto. Los que fallaban: el
`<summary>` del gráfico (**19px**, y es la única vía a los datos del gráfico en
un teléfono), los botones `.btn--sm` (32px, y son la acción primaria de los
flujos de mentoría y framework), los links de nav (36px), el brand (28px), el
skip link (38px) y `.row-toggle` (43px, uno corto).

### Verificado funcionando

Orden de tabulación completo con 20 pulsaciones reales; acoplamiento
`aria-expanded` ↔ `hidden`; cero ids duplicados; `<dialog>` con trampa de foco
real (el fondo rechazó `focus()`) y retorno de foco al cerrar; un solo `h1` sin
niveles saltados; landmarks sin duplicar; todos los controles con label que
resuelve; sin scroll horizontal de página a 375/768/1280; degradación por área
del framework; cero rejections no capturadas; encabezados sticky sujetos
(medido: header 0px de movimiento mientras las filas se movían −150px).

### Segunda auditoría — las ocho páginas migradas

Segunda ronda adversarial tras la migración: **17 hallazgos, todos corregidos y
re-verificados** (2 bloqueadores, 7 de calidad, 8 de pulido).

Los dos bloqueadores, ambos comprobados en ejecución:

| # | Defecto | Consecuencia real |
|---|---|---|
| 1 | `leerEntregables()` terminaba en `.filter(e => e.titulo && e.fecha_compromiso)` | Un entregable con título pero sin fecha **se borraba del payload** y el usuario recibía un toast verde de éxito. Un líder podía escribir cuatro entregables, saltarse un selector de fecha, y quedar con tres — sin aviso y sin forma de recuperarlo |
| 2 | `Math.max(0, findIndex(...))` en el reanudado del wizard | Un borrador **completo** reabría en la pregunta 1. La única ruta al botón de enviar era volver a pasar por las 56 preguntas |

El resto, en orden de gravedad: contenedores scrollables inalcanzables por
teclado en tres páginas —incluida la tabla de revisión del wizard, justo donde se
confirman las respuestas antes de enviar— mientras un comentario en el CSS
afirmaba que ya estaba resuelto (ahora es la utilidad compartida
`observarScrollables()`); un `<label for>` apuntando a un `<div>`; la región viva
del catálogo anclada en "Cargando" para siempre en la ruta sin PIN; el progreso
del wizard pasando de 100% por contar respuestas de habilidades desactivadas; el
progreso sin actualizarse al responder, solo al navegar; el foco perdido tras
confirmar una activación en una tabla de 226 filas; y el botón de quitar
entregable cayendo a una tercera fila en móvil.

Dos correcciones propias reencuadradas en lugar de aplicadas:

- **Borradores de evaluadores externos** se siguen indexando por el nombre
  escrito. Se normalizó (trim, minúsculas, espacios colapsados) para que
  "Consultor " y "consultor" resuelvan al mismo borrador, pero dos personas
  distintas que escriban el mismo nombre y evalúen a la misma persona lo
  comparten. **Limitación aceptada:** no hay identidad sobre la que indexar hasta
  que exista autenticación (§7), y la alternativa —una clave aleatoria por
  sesión— haría imposible retomar un formulario largo, que es la falla peor.
- **El toast de "faltan respuestas"** es defensivo: el botón Siguiente permanece
  deshabilitado hasta responder, así que llegar a revisión con huecos es
  inalcanzable por la interfaz. Se corrigió la gramática y ahora dice **cuál**
  pregunta falta, pero sigue siendo código que no debería ejecutarse.

### Pendiente de una pasada manual

El harness de verificación no puede sintetizar todo. Falta confirmar a mano:

- **Enter y Espacio** en `.row-toggle` y el toggle de mentoría, y **Escape** en
  el `<dialog>`. El harness entrega `keydown`/`keyup` pero no sintetiza el
  `click` resultante. Las precondiciones sí se verificaron: son `<button>`
  reales, sin `preventDefault`, y **cero** handlers de teclado en el documento
  que puedan interceptar la activación.
- **Apariencia del anillo de foco.** El panel del navegador no estaba
  compositando, así que `:focus-visible` nunca computó. Los ratios son
  deterministas (cascada + tokens medidos), pero nadie ha *visto* el anillo.
- **`prefers-reduced-motion: reduce`** — sin emulación disponible.
- **Insignia de top performer y banda de score baja** con datos reales: ningún
  miembro del equipo de prueba cae en esas condiciones hoy.

## 13. Pendiente

### De esta fase

- [x] Migrar las ocho páginas al sistema.
- [x] Eliminar la duplicación del shell — resuelta con `lib/shell.js` sin
      esperar a Astro.
- [x] Sacar `RONDA_ID` de los tres archivos que lo tenían hardcodeado; vive en
      `RONDA_ACTIVA` en `api.js`.
- [ ] Instalar Node y ejecutar la migración a Astro (§9). Ya no es urgente: la
      duplicación de shell y de wizard está resuelta. Queda como mejora de
      tooling, no como deuda estructural.
- [ ] Reconciliar el repositorio: esta carpeta no es un repo git, y el HANDOFF
      dice que el frontend se publicó desde `docs/`. Hay que localizar el repo
      real antes de desplegar.
- [x] **Decidido:** el estado de los entregables lo actualiza **solo el líder**,
      al revisar el nivel de completitud. `mi-desarrollo.html` se queda en modo
      lectura y así debe permanecer — no es una limitación pendiente de resolver,
      es la política. La página lo dice explícitamente para que un colaborador no
      se pregunte por qué no puede tocarlo.
- [ ] **En revisión con RRHH:** la longitud del cuestionario. Medido sobre datos
      reales: **45 a 62 preguntas** por perfil, mediana **55**, y **8 721
      respuestas** por ronda completa (cada persona se evalúa tres veces).

      El hallazgo que importa para esa conversación: las **35 soft skills son
      idénticas en los 8 perfiles** y son entre el **56% y el 78%** de cada
      cuestionario. Las partes específicas del rol ya son comparativamente
      pequeñas (4 a 20 cada una). Recortar el bloque compartido es una decisión,
      no ocho, y ninguna otra palanca se le acerca: bajarlo de 35 a 12 lleva la
      mediana de 55 a 32 y las respuestas de 8 721 a 4 995 (−43%).

      Contrapeso a tener presente: las soft skills son el único bloque comparable
      entre áreas. Recortar mucho gana tiempo y pierde la lectura transversal, así
      que la pregunta no es solo cuántas quitar sino cuáles se necesitan
      comparables.

      Dos hallazgos secundarios: HR tiene 20 funciones del rol, el doble de la
      mediana; y cuatro perfiles (Malware, Legal, Finance, IT) tienen habilidades
      definidas sin nadie asignado — no alargan ningún cuestionario, pero sí el
      catálogo que RRHH mantiene.

      Si se recorta, el único punto de cambio es `buildPreguntas()` en
      `lib/wizard.js`, o directamente el campo `Activo` del catálogo desde
      `catalogo-habilidades.html` — desactivar no borra histórico.

### Heredado del PoC (ver `HANDOFF.md` §11)

- [ ] Autenticación real (§7). Bloqueada por la decisión de base de datos.
- [ ] Importar a n8n los workflows nuevos. `/framework-equipo` todavía no
      existe, por eso el editor de framework del piloto muestra "No se pudo
      cargar" — la degradación por área es intencional.
- [ ] Re-ejecutar `compute_dashboards.py` para poblar `es_top_performer`,
      `percentil`, `nivel`. Sin eso no aparecen las insignias de top performer.
- [ ] `RONDA_ID` hardcodeado en tres archivos. Al migrarlos, debe salir a
      configuración, no repetirse.
