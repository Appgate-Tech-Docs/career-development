/* =========================================================================
   ORGANIZACIÓN — lo que Personas necesita para escalar
   =========================================================================
   El reporte del Excel es individual: responde "¿cómo está esta persona?".
   Con el modelo en toda la compañía, la pregunta de Personas es otra: dónde
   está el talento, en qué niveles se concentra y en qué conviene formar
   primero. Esta pantalla responde eso con las mismas cuentas del resto del
   portal — mismos pesos, misma matriz —, así que los números cuadran con lo
   que ve cada líder.

   Un solo filtro, arriba, que afecta a todo lo de abajo: si cada gráfica
   tuviera el suyo, dos cifras de la misma pantalla podrían referirse a grupos
   distintos sin que se note.
   ========================================================================= */

import { esc, avisosHtml, emptyState, sincronizarScrollables } from '../lib/ui.js';
import {
  personasEvaluadas, areasConCargos, perfil, cargos, avisosEquipo,
  distribucionPorNivel, brechasPorHabilidad, matrizDeGrupo, NIVEL_ES,
} from '../lib/almacen.js';
import {
  graficaDistribucion, graficaBrechas, graficaMatriz, conectarGraficas,
} from '../lib/graficas.js';

// El área elegida sobrevive a abrir un perfil y volver: antes se reiniciaba a
// «Todas» cada vez.
let areaRecordada = '';

export function vistaOrganizacion() {
  let area = areasConCargos().includes(areaRecordada) ? areaRecordada : '';

  const estado = () => {
    const n = personasEvaluadas(area || null).length;
    return `${area || 'Todas las áreas'} · ${n} ${n === 1 ? 'persona evaluada' : 'personas evaluadas'}.`;
  };

  const contenido = () => {
    const pfs = personasEvaluadas(area || null).map((p) => perfil(p.id));
    if (!pfs.length) {
      return emptyState({ title: area ? 'No hay personas evaluadas en esta área' : 'Todavía no hay personas evaluadas' });
    }
    const conRef = pfs.filter((pf) => pf.cumplimiento);
    const enNivel = conRef.filter((pf) => pf.cumplimiento.cumple === pf.cumplimiento.total).length;
    const conBrecha = pfs.filter((pf) => pf.prioridades.length).length;
    const incompletas = pfs.filter((pf) => pf.evaluadores_faltantes.length).length;
    const brechas = brechasPorHabilidad(pfs);
    const avisos = avisosEquipo(pfs).filter((a) => a.severidad === 'alta');

    return `
      ${avisos.length ? `
        <section class="section" aria-labelledby="t-org-av">
          <div class="section__head"><h2 class="section__title" id="t-org-av">Antes de leer los números</h2></div>
          ${avisosHtml(avisos)}
        </section>` : ''}

      <section class="section" aria-labelledby="t-org-res">
        <div class="section__head"><h2 class="section__title" id="t-org-res">Resumen</h2></div>
        <div class="kpi-grid">
          <div class="kpi">
            <span class="kpi__value">${pfs.length}</span>
            <span class="kpi__label">Personas evaluadas</span>
          </div>
          <div class="kpi">
            <span class="kpi__value">${enNivel}/${conRef.length}</span>
            <span class="kpi__label">Cumplen todo su nivel esperado</span>
          </div>
          <div class="kpi kpi--accent">
            <span class="kpi__value">${conBrecha}</span>
            <span class="kpi__label">${conBrecha === 1 ? 'Persona con alguna brecha' : 'Personas con alguna brecha'}</span>
          </div>
          <div class="kpi">
            <span class="kpi__value">${incompletas}</span>
            <span class="kpi__label">${incompletas === 1 ? 'Evaluación incompleta' : 'Evaluaciones incompletas'}</span>
          </div>
        </div>
      </section>

      <section class="section" aria-labelledby="t-org-matriz">
        <div class="section__head"><h2 class="section__title" id="t-org-matriz">Matriz de talento</h2></div>
        ${graficaMatriz(matrizDeGrupo(pfs), {
          id: 'g-matriz-org',
          titulo: area ? `Matriz de talento · ${area}` : 'Matriz de talento de la organización',
          etiquetadoPor: 't-org-matriz',
          // Cada nombre abre su perfil; con cientos de personas, una celda no
          // puede listar a todas: las demás quedan en la tabla equivalente.
          enlazar: (pf) => `#/persona/${pf.persona.id}`,
          maxNombres: 8,
        })}
      </section>

      <!-- Las brechas van solas y a todo el ancho: para Personas es la pregunta
           que decide el presupuesto de formación, no un anexo de la distribución. -->
      <section class="section" aria-labelledby="t-org-brechas">
        <div class="section__head"><h2 class="section__title" id="t-org-brechas">En qué formar primero</h2></div>
        ${brechas.length ? graficaBrechas(brechas, { id: 'g-brechas-org', limite: 10, etiquetadoPor: 't-org-brechas' })
          : emptyState({ title: 'Nadie está por debajo del nivel que espera su cargo', glyph: 'check' })}
      </section>

      <section class="section" aria-labelledby="t-org-dist">
        <div class="section__head"><h2 class="section__title" id="t-org-dist">Personas por nivel</h2></div>
        ${graficaDistribucion(distribucionPorNivel(pfs), { id: 'g-dist-org', etiquetadoPor: 't-org-dist' })}
      </section>

      ${area ? '' : tablaPorArea()}
    `;
  };

  return {
    html: `
      <div class="page-header">
        <h1 class="page-header__title">Organización</h1>
        <p class="page-header__lede">
          Dónde está el talento, en qué niveles se concentra y en qué conviene formar
          primero. Mismas cuentas que ve cada líder en su tablero.
        </p>
      </div>

      <div class="toolbar">
        <div class="field field-row field--sin-margen">
          <label class="field__label" for="org-area">Área</label>
          <select class="select" id="org-area">
            <option value="">Todas las áreas</option>
            ${areasConCargos().map((a) => `<option value="${esc(a)}" ${a === area ? 'selected' : ''}>${esc(a)}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- Una línea de estado, no el contenedor entero: con aria-live en todo,
           cambiar el filtro hacía que el lector de pantalla leyera la página. -->
      <p class="section__note" id="org-estado" role="status">${esc(estado())}</p>
      <div id="org-contenido">${contenido()}</div>
    `,
    montado(raiz) {
      const zona = raiz.querySelector('#org-contenido');
      const pintar = () => {
        raiz.querySelector('#org-estado').textContent = estado();
        zona.innerHTML = contenido();
        conectarGraficas(zona);
        sincronizarScrollables(zona);
      };
      raiz.querySelector('#org-area').addEventListener('change', (e) => {
        area = e.target.value;
        areaRecordada = area;
        pintar();
      });
      conectarGraficas(zona);
      sincronizarScrollables(raiz);
    },
  };
}

/** Una fila por área, para comparar sin cambiar el filtro. */
function tablaPorArea() {
  const filas = areasConCargos().map((a) => {
    const pfs = personasEvaluadas(a).map((p) => perfil(p.id));
    const conTotal = pfs.filter((pf) => pf.perfil_total !== null);
    const prom = conTotal.length
      ? conTotal.reduce((s, pf) => s + pf.perfil_total, 0) / conTotal.length : null;
    const conRef = pfs.filter((pf) => pf.cumplimiento);
    const enNivel = conRef.filter((pf) => pf.cumplimiento.cumple === pf.cumplimiento.total).length;
    const nCargos = cargos().filter((c) => c.area === a).length;
    const banda = prom === null ? null
      : prom <= 40 ? 'Basic' : prom <= 70 ? 'Intermediate' : prom <= 90 ? 'Advanced' : 'Expert';
    return { a, n: pfs.length, nCargos, prom, banda, enNivel, conRef: conRef.length };
  });

  return `
    <section class="section" aria-labelledby="t-org-areas">
      <div class="section__head"><h2 class="section__title" id="t-org-areas">Por área</h2></div>
      <p class="section__note">
        Solo las áreas con cargos definidos en la matriz del instrumento. Las demás
        tienen catálogo de habilidades pero todavía no tienen cargos, y sin cargo no
        hay nivel esperado contra el cual evaluar.
      </p>
      <div class="table-wrap">
        <table class="table">
          <caption class="sr-only">Personas, cargos, puntaje promedio y cumplimiento por área.</caption>
          <thead><tr>
            <th scope="col">Área</th><th scope="col">Cargos</th><th scope="col">Personas</th>
            <th scope="col">Puntaje promedio</th><th scope="col">Cumplen todo su nivel</th>
          </tr></thead>
          <tbody>${filas.map((f) => `
            <tr>
              <th scope="row" class="wizard__fila-habilidad">${esc(f.a)}</th>
              <td class="numeric">${f.nCargos}</td>
              <td class="numeric">${f.n}</td>
              <td class="numeric">${f.prom === null ? '—' : f.prom.toFixed(1)}
                <span class="text-xs text-muted">${f.banda ? esc(NIVEL_ES[f.banda]) : ''}</span></td>
              <td class="numeric">${f.enNivel}/${f.conRef}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>`;
}
