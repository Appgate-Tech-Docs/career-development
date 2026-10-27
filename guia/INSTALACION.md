# Instalación: Excel en OneDrive, flujo de Power Automate y GitHub Pages

Tiempo estimado: 45 minutos la primera vez. Hace falta:

- Una cuenta de Microsoft 365 con Power Automate **Premium** (el disparador HTTP lo es).
- Un buzón desde el cual salen los códigos de ingreso. Lo ideal es un buzón compartido, por ejemplo `desarrollo-carrera@…`, para que los correos no salgan a nombre de una persona.
- Permiso de administración sobre el repositorio `Appgate-Tech-Docs/career-development` para activar Pages.

La cuenta dueña del flujo debería ser una cuenta de servicio o de equipo, no la de una persona. Si esa persona se va de la empresa, el flujo deja de funcionar.

---

## 1. Subir el Excel a OneDrive

1. Toma `excel/CDP-Datos-prueba.xlsx` del repositorio.
2. Súbelo al OneDrive de la cuenta dueña del flujo, por ejemplo en `/CDP/CDP-Datos.xlsx`.
3. **No lo compartas con nadie que no deba ver todo.** El archivo tiene las evaluaciones de todas las personas, y las hojas `Sesiones` y `Codigos` permiten entrar como cualquiera. Quien tenga el archivo tiene acceso total.

El libro tiene una hoja por tabla, y cada hoja tiene una tabla de Excel con su mismo nombre. No cambies los nombres de las hojas, de las tablas ni de los encabezados: el script los busca por nombre.

## 2. Crear el Office Script

1. Abre `CDP-Datos.xlsx` en Excel para la web.
2. Ve a la pestaña **Automatizar** y elige **Nuevo script**.
3. Borra el contenido de ejemplo y pega **todo** el archivo `servidor/motor.ts`.
4. Guárdalo con el nombre **`CDP-Motor`**.

No lo ejecutes desde Excel: el script espera los parámetros que le pasa el flujo, y sin ellos responde un error.

Cada vez que cambie `servidor/motor.ts` en el repositorio, hay que repetir el paso 3 sobre el mismo script.

## 3. Crear el flujo

En Power Automate, crea un **Flujo de nube instantáneo** y elige como disparador **Cuando se recibe una solicitud HTTP** (*When an HTTP request is received*). Luego arma estos pasos:

### 3.1 Disparador: Cuando se recibe una solicitud HTTP

- **Quién puede desencadenar el flujo:** *Cualquiera* (*Anyone*). El front no puede presentar credenciales de Microsoft. Por eso la seguridad está en la sesión que valida el script en cada petición.
- **Método:** `POST`.
- **Esquema JSON del cuerpo:** déjalo vacío. El front envía texto, no JSON tipado.
- **No actives el Control de simultaneidad** en la Configuración del disparador. Power Automate no lo permite en un flujo que tiene una acción Respuesta y no deja guardar (`InvalidConcurrencyConfiguration`). Si ya lo activaste y no se puede apagar, elimina el disparador y vuelve a crearlo; las expresiones `triggerBody()` siguen funcionando.

  Sin ese control, dos peticiones pueden ejecutar el script al mismo tiempo. El script lo tolera: nunca borra ni reordena filas, agrega al final, y al modificar escribe solo las celdas que cambiaron. Así una ejecución no pisa lo que la otra cambió en otra columna. El único choque posible es que dos administradores cambien el mismo campo del mismo registro en el mismo segundo, y en ese caso queda el último, con los dos cambios en la auditoría.

### 3.2 Acción: Excel Online (Business) → Ejecutar script

- **Ubicación:** OneDrive para la Empresa.
- **Biblioteca de documentos:** OneDrive.
- **Archivo:** `/CDP/CDP-Datos.xlsx`.
- **Script:** `CDP-Motor`.
- **peticion:** la expresión `string(triggerBody())`
- **entropia:** la expresión `concat(guid(), guid(), guid())`

  El script usa la entropía para generar los códigos y los tokens de sesión. Sin ella, el ingreso no funciona.

- En **Configuración** de esta acción, activa **Salidas seguras** (*Secure outputs*). Sin eso, el historial de ejecuciones del flujo muestra los códigos de ingreso y los tokens de sesión.

### 3.3 Acción: Redactar (Compose), con el nombre `Salida`

- **Entradas:** `json(outputs('Ejecutar_script')?['body/result'])`

  Si la acción del paso 3.2 quedó con otro nombre, ajusta `Ejecutar_script` en la expresión.

### 3.4 Condición: ¿hay correo que enviar?

- La condición es `outputs('Salida')?['correo']` **no es igual a** `null`. Escribe `null` como expresión, no como texto.
- **En la rama Sí**, agrega la acción Office 365 Outlook → **Enviar un correo electrónico desde un buzón compartido (V2)**, o **Enviar un correo electrónico (V2)** si no hay buzón compartido:
  - **Para:** `outputs('Salida')?['correo']?['para']`
  - **Asunto:** `outputs('Salida')?['correo']?['asunto']`
  - **Cuerpo:** `outputs('Salida')?['correo']?['html']`
  - Activa **Entradas seguras** en esta acción.
- La rama No queda vacía.

### 3.5 Acción: Respuesta (Response)

Va después de la condición.

- **Código de estado:** `200`
- **Encabezados:**
  - `Content-Type`: `application/json`
  - `Access-Control-Allow-Origin`: `https://appgate-tech-docs.github.io`
- **Cuerpo:** `outputs('Salida')?['respuesta']`

**Importante:** el cuerpo es solo `respuesta`, nunca toda la `Salida`. La `Salida` trae el código de ingreso, y si se devuelve al navegador, cualquiera puede entrar como cualquier persona.

### 3.6 Respuesta de error

Agrega una segunda acción **Respuesta**, en paralelo a la anterior, configurada para ejecutarse solo si **Ejecutar script** falla o agota el tiempo. En *Configurar ejecución después de* marca *ha fallado* y *ha agotado el tiempo de espera*.

- **Código de estado:** `200`
- **Encabezados:** los mismos dos del paso 3.5.
- **Cuerpo:**

  ```json
  {"ok": false, "error": {"codigo": "servidor", "mensaje": "El servidor no pudo procesar la solicitud. Inténtalo de nuevo en un momento."}}
  ```

### 3.7 Guardar y copiar la URL

Guarda el flujo. El disparador muestra la **URL de HTTP POST**: cópiala.

## 4. Conectar el front

1. En el repositorio, abre `docs/config.js` y pega la URL:

   ```js
   export const API_URL = 'https://prod-00.westus.logic.azure.com:443/workflows/…';
   ```

2. Haz commit y push a `main`.

La URL queda visible en el sitio público, y eso está previsto: permite llamar al flujo, no leer datos. Si alguien abusa de ella, por ejemplo para gastar el límite diario, regenérala en el disparador y actualiza `config.js`.

## 5. Publicar en GitHub Pages

1. En GitHub, abre **Settings → Pages** del repositorio.
2. En **Source**, elige *Deploy from a branch*.
3. Selecciona la rama `main` y la carpeta `/docs`, y guarda.
4. En uno o dos minutos el sitio queda en `https://appgate-tech-docs.github.io/career-development/`.

Si la organización usa otro dominio para Pages, corrige el encabezado `Access-Control-Allow-Origin` del paso 3.5 con el origen exacto: esquema y dominio, sin la ruta.

## 6. Probar con los datos inventados

Los correos del Excel de prueba son `@example.com`, un dominio reservado que no entrega correo. Para entrar como alguien:

1. En la hoja `Personas`, cambia el `correo` de las personas con las que quieras probar por un buzón real. Sirve el tuyo con alias, si tu correo los acepta:
   - `tu.nombre+lider@empresa.com` para Rocío Tamayo (líder de Support)
   - `tu.nombre+admin@empresa.com` para Fabián Otero (administrador)
   - `tu.nombre+colaborador@empresa.com` para Marcela Duarte
2. Abre el sitio, escribe ese correo y usa el código que llega.

Qué conviene comprobar:

| Prueba | Resultado esperado |
|---|---|
| Entrar como Rocío y abrir **Mi equipo** | Ve a sus 6 reportes directos. No ve a Claudia ni a Ximena, que reportan a Paula. |
| Entrar como Fabián → Administración → Equipos → asignar a Gabriela como interina del equipo de Paula | Gabriela, al volver a entrar, ve a Claudia y Ximena. La auditoría registra el cambio con fecha y motivo. |
| Desactivar a alguien que tiene la sesión abierta | Su siguiente acción lo devuelve a la pantalla de ingreso. |
| Pedir un código con un correo que no existe | La pantalla dice lo mismo que con uno que existe, y no llega nada. |

## 7. Pasar a los datos reales

1. Haz una copia del libro de prueba y vacía las filas de todas las hojas. Deja los encabezados y la tabla. Las hojas `Config` y `Modelo` se conservan.
2. Carga las hojas `Habilidades`, `Cargos`, `CargoHabilidades`, `Equipos`, `Personas` y `Administradores`.
   - Los `id` deben ser estables: no cambian cuando alguien cambia de nombre.
   - Los correos deben ser los corporativos.
3. En `Config`, define `ronda_id`, `ronda_nombre`, las fechas y `ronda_abierta`.
4. Asigna los pares, ya sea en la hoja `Pares` o desde Administración → Pares y evaluaciones.
5. Apunta la acción **Ejecutar script** al libro nuevo.

`herramientas/generar_excel.py` documenta, al principio del archivo, cada convención que el script espera.

## Límites a conocer

- **Ejecuciones de Office Scripts.** Según la documentación de Microsoft, Power Automate permite 1.600 ejecuciones al día por usuario dueño del flujo.
  - Cada persona gasta unas cuatro al entrar y hacer su evaluación: pedir código, verificarlo, cargar y enviar.
  - Cada cambio de administración gasta dos: guardar y recargar.
  - Si se llega al límite, una opción es repartir el tráfico en dos flujos con dueños distintos.
- **Tiempo de respuesta.** Cada petición tarda entre 2 y 10 segundos, según el tamaño del libro. Si Excel está ocupado con otra ejecución, la acción reintenta sola; si aun así falla, el front muestra el error de la Respuesta de error y la persona puede reintentar.
- **Tamaño.** Cada petición lee las tablas completas. Con miles de evaluaciones por ronda conviene archivar las rondas cerradas en otro libro.
- **Excel abierto.** Si alguien edita el libro a mano mientras el flujo escribe, puede haber conflictos. Las ediciones manuales conviene hacerlas fuera del horario de uso. Mejor aún, hacerlas desde Administración, que además deja auditoría.
