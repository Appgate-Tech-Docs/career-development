/* =========================================================================
   CONFIGURACIÓN DEL DESPLIEGUE — lo único que cambia entre ambientes
   =========================================================================
   API_URL: la "URL de HTTP POST" del disparador del flujo de Power Automate
   (paso 4 de guia/INSTALACION.md).

   Esta URL queda pública en GitHub Pages, y está bien que así sea: trae una
   firma que permite LLAMAR al flujo, no leer datos. Lo que protege los datos
   es la sesión que valida el script en cada petición. Si alguna vez se filtra
   y abusan de ella (por ejemplo, para gastar el límite diario), se regenera
   en el flujo y se cambia acá.

   En localhost se ignora y se usa el servidor local (npm run local). Para
   probar el flujo real desde localhost, abre la página con ?remoto.
   ========================================================================= */

export const API_URL = 'https://defaultb93e809a49c54a0fa60682b846acc3.0d.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/06/workflows/b0e558d081534ca0a9bfdb1f3f29e035/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=L8qkg0zC9I0y2Chw4xHBZ1mMciRJVIwRxLEThPwABSw';
