# Desarrollo de Carrera

Herramienta de evaluación por cargo y planes de desarrollo. Recolecta las evaluaciones (autoevaluación, líder y pares) y evalúa a cada persona frente a lo que su cargo espera. El seguimiento de los planes ocurre fuera.

**Versión 0:** arquitectura completa con datos inventados, lista para cargar los reales.

```
 Navegador ──► GitHub Pages (docs/)              solo código, sin datos de nadie
     │
     └─ POST ──► Power Automate (un flujo)
                    ├─ Ejecutar script ──► CDP-Datos.xlsx en OneDrive
                    │                      (Office Script: servidor/motor.ts)
                    └─ Enviar correo  ──► código de ingreso
```

## Cómo se protege la información

- **El front no tiene datos.** Todo llega del flujo después de entrar, y solo lo que esa persona puede ver.
- **Ingreso sin contraseñas.** La persona escribe su correo corporativo y recibe un código de 6 dígitos que vale unos minutos, sirve una sola vez y se bloquea tras 5 intentos. Al entrar abre una sesión de 8 horas.
- **El alcance lo decide el servidor.** Cada petición se resuelve a partir de la sesión, nunca de lo que dice la petición:
  - Un líder recibe a sus reportes directos y a nadie más, ni siquiera llamando al flujo a mano.
  - A un par solo le llegan sus propias respuestas.
  - Nadie ve quién lo evaluó como par.
- **Administración auditada.** Cada cambio queda en la hoja `Auditoria`: quién, cuándo, sobre qué registro, el valor anterior, el nuevo y el motivo.
- **Ocultar no borra.** Desde la herramienta nada se elimina.
- **Líder interino.** Cubre una vacante o una ausencia: mientras está asignado ve y evalúa al equipo, y al quitarlo el acceso vuelve al titular.

La regla de visibilidad vive en una sola función, `equiposQueLidera` en `servidor/motor.ts`. Si mañana un líder debe ver también el equipo extendido, se cambia ahí y el resto de la arquitectura no se toca.

## Estructura

| Carpeta | Qué hay |
|---|---|
| `docs/` | El sitio que publica GitHub Pages. `config.js` tiene la URL del flujo. |
| `servidor/motor.ts` | Toda la lógica del servidor. Se pega tal cual como Office Script. |
| `excel/CDP-Datos-prueba.xlsx` | El almacenamiento, con 20 personas inventadas en 5 equipos. |
| `herramientas/` | Generador del Excel, servidor local y pruebas. |
| `guia/INSTALACION.md` | Paso a paso: Excel, script, flujo, Pages y paso a datos reales. |
| `guia/DESIGN-SYSTEM.md` | El sistema de diseño del front. |

## Desarrollo local

Requiere Node 20 o posterior.

```bash
npm install
```

```bash
npm run local
```

Abre http://localhost:8130. El servidor local hace lo mismo que el flujo, con el mismo `motor.ts` sobre el mismo Excel. Los códigos de ingreso aparecen en la consola. Para entrar, usa cualquier correo de la hoja `Personas`:

- `rocio.tamayo@example.com`: líder de Support
- `fabian.otero@example.com`: administrador
- `marcela.duarte@example.com`: colaboradora
- `gabriela.montoya@example.com`: directora; prueba el caso del líder interino

```bash
npm run probar
```

Corre las pruebas del motor: alcance de cada rol, códigos, sesiones, administración y auditoría. Corren sobre el Excel de prueba.

## Cambiar la lógica del servidor

1. Edita `servidor/motor.ts`.
2. Corre `npm run probar`. Compila con las mismas reglas estrictas de Office Scripts y prueba.
3. Pega el archivo en el script `CDP-Motor` de Excel (paso 2 de la guía).
