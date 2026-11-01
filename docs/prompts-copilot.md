# Prompts para Copilot — Control Interno (versión detallada, lista para programar)

> Análisis hecho por el asistente (no por Copilot): cada prompt ya dice **dónde está el código, qué hace y qué cambiar**. Copilot solo tiene que programar, sin gastar tokens en explorar.

Pegá el **Contexto base** al inicio de cada conversación y después el prompt de la tarea.

---

## Contexto base (pegar siempre)

```
Trabajas en el repo `control-asistencia-web`: sitio estático SIN build (HTML + JavaScript vanilla, sin módulos; todos los scripts comparten el ámbito global, así que un `const`/`let` de nivel superior repetido entre archivos rompe la página).

Reglas del repo:
1. La regla de negocio vive en la BASE (RLS, triggers, funciones `security definer`), no en el navegador. El navegador solo oculta botones.
2. Migraciones en `migrations/NNN_*.sql`, numeradas. La última aplicada es la 094 (renombrar subcontrato→externo). La siguiente es 095. NUNCA edites una migración ya aplicada: creá la siguiente.
3. Archivos con fin de línea CRLF y con tildes (es-CL): no rompas.
4. Trabajá en la rama `test`; NO hagas commit ni push.
5. Comentarios y respuestas en español.
6. Antes de dar por terminado: `node tools/corre-los-guardianes.js` y debe salir "los 39 guardianes en verde".
7. NO corras `tools/sirve.js` / `sirve.py` / `servir.bat` (levantan un servidor y se cuelgan).
8. Funciones globales ya existentes (no redefinir): escHtml, mismoId, empresaData, workers, attendance, empresas, misEmpresas, veTodasLasEmpresas, puede, puedeEditarTarjaDirectamente, isFeriado, daysInMonth, hoyLocal, attToDb, dbToAtt, loadAttendanceFromDB, refreshAttendanceMatrix, medirAsistenciaDiariaPara.
```

---

## Prompt 1 — Renombrar "subcontrato" → "externo" ✅ YA HECHO

La migración `migrations/094_renombrar_subcontrato_a_externo.sql` ya existe y el código ya usa "externo" en todos los archivos (js/app.js, css/base.css, pages/app.html, views/soporte/soporte.js, views/administracion/documentos.js, views/administracion/administracion.js). Los guardianes están en verde. **No queda nada por hacer.**

---

## Prompt 2 — PDF de entrega EPP/herramienta sin firma (imprimir + firma del bodega + respaldo)

### Objetivo
Cuando una entrega de EPP o de kit queda SIN firma del trabajador, el PDF debe:
(a) ofrecer la opción de IMPRIMIR el papel,
(b) dejar impresa una LÍNEA con los datos del PREPARADOR (quién entrega, cargo, fecha),
(c) integrar en el PDF la FIRMA del encargado de bodega, tomada de su perfil,
para que el trabajador firme a lápiz sobre el papel impreso y luego se suba el respaldo escaneado/fotografiado.

### Archivos y funciones existentes

- `views/soporte/soporte.js`:
  - `buildEppPdf(entrega, items, sigDataUrl)` (línea ~1292): arma el PDF con jsPDF. Actualmente si `sigDataUrl` es null escribe "Entrega registrada sin firma." (línea ~1379-1382) y `y+=14`.
  - `saveEpp()` (línea ~1407): guarda la entrega en `epp_entregas` (firma_url, firma_at, pdf_url) y sube firma+PDF al bucket `epp-respaldos`.
  - `uploadToBucket(path, blob, contentType)` (línea ~1388).
- `js/app.js`:
  - `entregarKitItems()` (línea ~3469): misma lógica para entrega desde kit, usa `buildEppPdf(entrega, items, firma)`.
- `views/bodega/bodega.js`: patrón de firmas de papel (`montarFirmaPapel`, `firmaComoDatos`, `htmlFirmas` con `.firma-bloque`, `.firma-caja`, `.firma-linea`, `.firma-pie`).
- `css/styles.css`: `.firmas`, `.firma-bloque`, `.firma-caja`, `.firma-linea`, `.firma-pie`.
- `migrations/001_schema.sql`: tabla `perfiles` tiene columnas `id, nombre, rol, activo, created_at` — **NO tiene columna de firma**.

### Cambios exactos a hacer

1. **Migración 095** — agregar columna de firma al perfil:
   ```sql
   alter table perfiles add column if not exists firma_url text;
   comment on column perfiles.firma_url is 'Firma del usuario (data URL o path en bucket), usada en los PDF de entrega de EPP.';
   ```

2. **`buildEppPdf`** — cambiar firma a `buildEppPdf(entrega, items, sigDataUrl, bodegaSigDataUrl, preparador)`:
   - Agregar parámetro `bodegaSigDataUrl` (data URL de la firma del bodega) y `preparador` ({nombre, cargo, fecha}).
   - Después de la tabla de elementos y antes de la firma del trabajador, dibujar un bloque "Firma del encargado de bodega":
     - Si `bodegaSigDataUrl`: `doc.addImage(bodegaSigDataUrl,'PNG',14,y+4,70,32)` + línea + pie con `preparador.nombre · preparador.cargo · preparador.fecha`.
     - Si no: línea en blanco + pie "Encargado de bodega (sin firma en perfil)".
   - En el bloque del trabajador:
     - Si `sigDataUrl`: renderizar imagen + línea + pie (como hoy).
     - Si NO `sigDataUrl`: escribir "Entrega registrada sin firma en pantalla. Firmar a lápiz sobre el papel impreso." + línea en blanco para firma manual + pie "Firma del trabajador (a lápiz)".

3. **Obtener firma del bodega desde su perfil**:
   - Al guardar la entrega, leer `window.supabaseClient.from('perfiles').select('firma_url').eq('id', auth.uid()).single()` y pasar el data URL a `buildEppPdf`.
   - Si el perfil no tiene firma, pasar null (el bloque queda con línea en blanco).

4. **Botón "Imprimir"**:
   - En el detalle de la entrega (historial EPP) y en el mensaje de éxito de `saveEpp`/`entregarKitItems`, agregar un botón "Imprimir PDF" que llame a `imprimirEntregaPdf(pdfUrl)`:
     ```js
     async function imprimirEntregaPdf(path){
       const {data}=await window.supabaseClient.storage.from('epp-respaldos').download(path);
       const url=URL.createObjectURL(data);
       const w=window.open(url);
       w.onload=()=>{w.print();};
     }
     ```

5. **Subir respaldo firmado**:
   - En el detalle de la entrega (cuando `firma_url` es null), mostrar un `<input type="file" accept="image/*,application/pdf">` + botón "Subir respaldo firmado".
   - Al subir: `uploadToBucket(`${carpeta}/respaldo_firmado_${fecha}.pdf`, blob, contentType)` y actualizar la entrega con `respaldo_firmado_url`.

6. Actualizar las llamadas a `buildEppPdf` en `saveEpp()` y `entregarKitItems()` para pasar los nuevos parámetros.

7. Correr `node tools/corre-los-guardianes.js`.

---

## Prompt 3 — Subida masiva de asistencia desde planilla

### Objetivo
Cargar asistencia masiva desde un archivo CSV/Excel en la pestaña "Cargar planilla" de Asistencia.

### Archivos y funciones existentes

- `js/app.js`: `importarTrabajadoresDesdeCsv()` (línea ~1960) — patrón de lectura CSV con SheetJS (`xlsx` cargada en `pages/app.html` línea 21).
- `views/administracion/administracion.js`: `renderMatrix()`, `saveAttendanceState(code, iso, state, hora, opciones)`, `attToDb()` en `js/nucleo.js`.
- `pages/app.html`: pestaña "Cargar planilla" (`data-attendance-tab="excel"`), área de carga.
- `attendance` (array global), `workers` (array global).

### Cambios exactos a hacer

1. **Crear `importarAsistenciaDesdePlanilla()`** en `views/administracion/administracion.js`:
   ```js
   async function importarAsistenciaDesdePlanilla(){
     const input=document.getElementById('planillaAsistenciaFile');
     if(!input||!input.files.length){alert('Seleccioná un archivo.');return;}
     const file=input.files[0];
     const data=await file.arrayBuffer();
     const wb=XLSX.read(data);
     const ws=wb.Sheets[wb.SheetNames[0]];
     const rows=XLSX.utils.sheet_to_json(ws,{defval:''});
     // columnas esperadas: codigo, fecha, estado, hora (opcional)
     const validos=[], errores=[];
     rows.forEach((r,i)=>{
       const code=String(r.codigo||r.code||'').trim();
       const fecha=normalizarFecha(r.fecha||r.date);
       const estado=String(r.estado||r.state||'').trim().toUpperCase();
       const hora=String(r.hora||r.time||'').trim();
       const w=workers.find(x=>x.code===code);
       if(!w){errores.push({fila:i+2,motivo:'Código no existe'});return;}
       if(!fecha||!/^\d{4}-\d{2}-\d{2}$/.test(fecha)){errores.push({fila:i+2,motivo:'Fecha inválida'});return;}
       if(!['X','F','P','L','A','PP','V','LL',''].includes(estado)){errores.push({fila:i+2,motivo:'Estado inválido'});return;}
       validos.push({code,fecha,estado,hora});
     });
     // mostrar resumen
     const msg=document.getElementById('planillaAsistenciaMsg');
     msg.innerHTML=`Válidas: ${validos.length} · Con error: ${errores.length}` + (errores.length?`<br>`+errores.map(e=>`Fila ${e.fila}: ${e.motivo}`).join('<br>'):'');
     if(!validos.length||!confirm(`¿Importar ${validos.length} registro(s)?`))return;
     // insertar
     for(const v of validos){
       await saveAttendanceState(v.code, v.fecha, v.estado, v.hora, {sinAuditoria:true});
     }
     await loadAttendanceFromDB();
     refreshAttendanceMatrix();
     msg.textContent=`Importados ${validos.length} registro(s).`;
   }
   ```

2. **`normalizarFecha(fecha)`** helper: aceptar `dd-mm-aaaa`, `dd/mm/aaaa`, `aaaa-mm-dd`.

3. **Botón "Descargar plantilla modelo"**: generar un CSV con encabezados `codigo,fecha,estado,hora` y una fila de ejemplo, descargable via Blob.

4. **HTML en `pages/app.html`** (pestaña "Cargar planilla"): agregar `<input type="file" id="planillaAsistenciaFile" accept=".csv,.xlsx,.xls">`, botón "Importar asistencia", botón "Descargar plantilla modelo", y `<div id="planillaAsistenciaMsg"></div>`.

5. Correr guardianes.

---

## Prompt 4 — Justificación masiva de no marcajes (día de lluvia)

### Objetivo
En la tarja mensual, cuando hay un día de lluvia (estado LL), el supervisor quiere justificar VARIOS trabajadores a la vez SIN escribir el mismo motivo 10 veces.

### Archivos y funciones existentes

- `views/administracion/administracion.js`:
  - `saveAttendanceState(code, iso, state, hora, opciones)` — ya permite estado LL sin motivo (exigirMotivo).
  - `pedirMotivoCambio(opciones)` — abre el cuadro de motivo.
  - `editAttendanceCell(td)` — edita celda por celda.
  - `buildMatrixHtml(y, m, lista, modo)` — celdas tienen `data-code` y `data-date`.
  - `puedeEditarTarjaDirectamente()`, `puede('tarja.solicitar_cambio')`.

### Cambios exactos a hacer

1. **Agregar botón "Justificar varios (lluvia)"** en el bloque `tarjaBotones` de `pages/app.html` (junto a "Generar tarja").

2. **Crear `justificarVariosLluvia()`** en `views/administracion/administracion.js`:
   ```js
   function justificarVariosLluvia(){
     // activar modo selección múltiple: marcar celdas con clic
     const area=document.getElementById('matrixArea');
     if(!area)return;
     area.classList.add('modo-seleccion-multiple');
     // agregar checkbox visual a cada celda
     area.querySelectorAll('td.attendance-cell').forEach(td=>{
       td.addEventListener('click', toggleSeleccionCelda, {once:false});
     });
     // mostrar barra de acciones
     mostrarBarraJustificacionMasiva();
   }
   ```

3. **Crear `mostrarBarraJustificacionMasiva()`**: barra flotante con "Aplicar LL a seleccionados", "Cancelar", y un textarea para el motivo único.

4. **Crear `aplicarJustificacionMasiva()`**:
   ```js
   async function aplicarJustificacionMasiva(){
     const seleccionadas=[...document.querySelectorAll('td.attendance-cell.seleccionada')];
     if(!seleccionadas.length){alert('Seleccioná al menos una celda.');return;}
     const motivo=document.getElementById('motivoMasivo').value.trim();
     if(!motivoEsValido(motivo)&&!confirm('Sin motivo válido. ¿Continuar?'))return;
     const puedeEditar=puedeEditarTarjaDirectamente();
     for(const td of seleccionadas){
       const code=decodeURIComponent(td.dataset.code);
       const iso=td.dataset.date;
       if(puedeEditar){
         await saveAttendanceState(code, iso, 'LL', '', {motivo, origen:'masivo_lluvia'});
       }else{
         // solicitar cambio
         await solicitarCambioAsistencia(code, iso, 'LL', motivo);
       }
     }
     await loadAttendanceFromDB();
     refreshAttendanceMatrix();
     cancelarJustificacionMasiva();
   }
   ```

5. **CSS** en `views/asistencia/asistencia.css`: estilos para `.modo-seleccion-multiple td.attendance-cell` (cursor pointer, hover highlight) y `.seleccionada` (fondo resaltado).

6. Correr guardianes.

---

## Prompt 5 — Vista por cargo + resumen diario y mensual

### Objetivo
Ampliar la vista por cargo (ya existe como matriz) y agregar resumen diario y mensual.

### Archivos y funciones existentes

- `views/administracion/administracion.js`:
  - `renderReportePorCargo()` (línea ~1704): ya arma la matriz (filas = cargos, columnas = supervisores, valor = conteo). Ya respeta filtros de empresa y tipo.
  - `resumenDeEstadosDelMes(w, y, m)` (línea ~1597): devuelve `{conF, conPermiso, vacios, laborables, estados}`.
  - `medirAsistenciaDiariaPara(equipo, supCode, fecha)`: mide asistencia de un equipo en una fecha.
  - `attendance` (global), `workers` (global).
- `pages/app.html`: panel de asistencia, pestaña "Tarja mensual", botón "Ver por cargo" (línea 1256), contenedor `#cargoReporte` (línea 1259).

### Cambios exactos a hacer

1. **Ampliar `renderReportePorCargo()`** para mostrar conteo de estados por cargo:
   - Para cada cargo, calcular cuántos trabajadores tienen X, F, P, L, A, PP, V, LL en el mes (usando `resumenDeEstadosDelMes` o filtrando `attendance` por code+mes).
   - Agregar una fila de resumen por cargo con los totales de cada estado.
   - Usar `w.cargo || w.spec || 'Sin cargo'` para el cargo real.

2. **Crear `renderResumenDiario(fecha)`**:
   ```js
   function renderResumenDiario(fecha){
     const box=document.getElementById('cargoReporte'); // o un nuevo contenedor
     if(!box)return;
     const iso=fecha||hoyLocal();
     const base=workers.filter(w=>veTodasLasEmpresas()||misEmpresas.includes(w.empresa_id));
     const porTipo={interno:{X:0,F:0,P:0,L:0,A:0,PP:0,V:0,LL:0,sinMarca:0},externo:{X:0,F:0,P:0,L:0,A:0,PP:0,V:0,LL:0,sinMarca:0}};
     base.forEach(w=>{
       const rec=attendance.find(a=>a.code===w.code&&a.date===iso);
       const tipo=w.tipo_trabajador==='interno'?'interno':'externo';
       if(!rec||!rec.estado){porTipo[tipo].sinMarca++;return;}
       if(porTipo[tipo][rec.estado]!==undefined)porTipo[tipo][rec.estado]++;
     });
     // renderizar tabla con filas por tipo y columnas por estado
   }
   ```

3. **Crear `renderResumenMensual(y, m)`**:
   - Para cada tipo (interno/externo), calcular totales del mes: días trabajados, días efectivos, faltas, permisos.
   - Usar `resumenDeEstadosDelMes` por trabajador y sumar.

4. **HTML en `pages/app.html`**: agregar botones "Resumen diario" y "Resumen mensual" en el bloque `tarjaBotones`.

5. Correr guardianes.

---

## Prompt 6 — Vista por cargo + resumen diario y mensual (incluyendo subcontrato)

> Nota: este prompt es equivalente al Prompt 5 pero enfatiza la separación interno/externo por empresa. Si ya hiciste el Prompt 5, este es redundante. Usá uno u otro.

---

## Prompt 7 — Resumen mensual tipo tarja (días como columnas + hover con detalle)

### Objetivo
Matriz con filas = grupos (Internos + cada empresa externa por separado), columnas = días del mes, celda = presentes (X), tooltip al hover con desglose completo.

### Archivos y funciones existentes

- `views/administracion/administracion.js`:
  - `buildMatrixHtml(y, m, lista, modo)` (línea ~1495): patrón de tabla con días como columnas.
  - `isFeriado(y, m, d)`, `daysInMonth(y, m)`, `escHtml()`.
  - `attendance` (global), `workers` (global), `empresas` (global).
- `views/asistencia/asistencia.css`: estilos de `.tarjaDia`, `.overflow`, etc.

### Cambios exactos a hacer

1. **Crear `renderResumenMensualTarja(y, m)`**:
   ```js
   function renderResumenMensualTarja(y, m){
     const box=document.getElementById('cargoReporte');
     if(!box)return;
     const nd=daysInMonth(y,m);
     // agrupar trabajadores por grupo
     const grupos={};
     workers.forEach(w=>{
       const key=w.tipo_trabajador==='interno'?'__interno__':w.empresa_id;
       const label=w.tipo_trabajador==='interno'?'Internos':(empresas.find(e=>mismoId(e.id,w.empresa_id))||{}).nombre||'Empresa '+w.empresa_id;
       if(!grupos[key])grupos[key]={label, codes:[]};
       grupos[key].codes.push(w.code);
     });
     const claves=Object.keys(grupos);
     let html='<div class="overflow"><table>';
     // encabezado de días
     html+='<tr><th>Grupo</th>';
     for(let d=1;d<=nd;d++)html+=`<th class="tarjaDia" title="${isFeriado(y,m,d)?'Feriado':''}">${d}</th>`;
     html+='<th>Total</th></tr>';
     claves.forEach(key=>{
       const g=grupos[key];
       html+=`<tr><td><b>${escHtml(g.label)}</b></td>`;
       let total=0;
       for(let d=1;d<=nd;d++){
         const iso=`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
         const presentes=g.codes.filter(c=>attendance.some(a=>a.code===c&&a.date===iso&&a.estado==='X')).length;
         const faltas=g.codes.filter(c=>attendance.some(a=>a.code===c&&a.date===iso&&a.estado==='F')).length;
         const permisos=g.codes.filter(c=>attendance.some(a=>a.code===c&&a.date===iso&&['P','L','A','PP','V'].includes(a.estado))).length;
         const lluvia=g.codes.filter(c=>attendance.some(a=>a.code===c&&a.date===iso&&a.estado==='LL')).length;
         const sinMarca=g.codes.length-presentes-faltas-permisos-lluvia;
         const tooltip=`Presentes: ${presentes} · Faltas: ${faltas} · Permisos: ${permisos} · Lluvia: ${lluvia} · Sin marca: ${sinMarca}`;
         const cls=presentes===0?'celda-cero':'';
         html+=`<td class="${cls}" title="${tooltip}">${presentes}</td>`;
         total+=presentes;
       }
       html+=`<td><b>${total}</b></td></tr>`;
     });
     html+='</table></div>';
     box.innerHTML=html;
   }
   ```

2. **CSS** en `views/asistencia/asistencia.css`:
   ```css
   .celda-cero{background:var(--panel-soft, #f0f0f0);color:var(--muted);}
   ```

3. **HTML en `pages/app.html`**: agregar botón "Resumen mensual (tarja)" en el bloque `tarjaBotones`.

4. Correr guardianes.

---

## Prompt 8 — MAESTRO (todas las tareas pendientes en secuencia)

```
Sos un asistente de código en el repo `control-asistencia-web`. Trabajá en la rama `test`, NO hagas commit ni push. Comentarios y respuestas en español. Antes de cada tarea y al final, corré `node tools/corre-los-guardianes.js` y dejá los 39 en verde. NO corras `tools/sirve.js`/`sirve.py`/`servir.bat`. Archivos CRLF + tildes. Migraciones numeradas (la última aplicada es la 094; la siguiente es 095, 096, ...). NUNCA edites migraciones ya aplicadas.

Realizá en orden estas tareas (ver prompts detallados 2 a 7 en docs/prompts-copilot.md):

TAREA 2 — PDF de entrega EPP/herramienta sin firma (migración 095 + buildEppPdf + botón Imprimir + subir respaldo).
TAREA 3 — Subida masiva de asistencia (importarAsistenciaDesdePlanilla + plantilla CSV).
TAREA 4 — Justificación masiva de no marcajes (lluvia) (botón + selección múltiple + motivo único).
TAREA 5 — Vista por cargo + resumen diario y mensual (ampliar renderReportePorCargo + renderResumenDiario + renderResumenMensual).
TAREA 6 — (Redundante con 5; saltear si ya se hizo.)
TAREA 7 — Resumen mensual tipo tarja (renderResumenMensualTarja + tooltip + CSS).

Después de TODAS las tareas: corré `node tools/corre-los-guardianes.js` y dejá los 39 en verde. Reportá qué archivos se modificaron y qué migraciones se crearon.
```
