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

export const API_URL = '';
