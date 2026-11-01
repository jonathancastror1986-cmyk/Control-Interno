# Crea el libro excel\Checklist_diario.xlsm con el Dashboard, las hojas de
# datos y el modulo VBA. Las hojas se arman desde aca: correr macros por
# automatizacion esfragil (un error de VBA deja un cuadro de dialogocolgado).
param([switch]$Ejemplo)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot
$bas = Join-Path $raiz "excel\ChecklistDiario.bas"
$salida = Join-Path $raiz "excel\Checklist_diario.xlsm"

function RGBv([int]$r, [int]$g, [int]$b) { return $r + $g * 256 + $b * 65536 }

$AZUL = RGBv 31 78 121
$BLANCO = RGBv 255 255 255
$GRIS_TXT = RGBv 89 89 89
$GRIS_CAJON = RGBv 242 242 242
$AMARILLO_TIT = RGBv 255 217 102
$VERDE_TIT = RGBv 198 239 206
$NARANJA = RGBv 252 213 180
$VERDE_S = RGBv 226 240 217
$AZUL_C = RGBv 221 235 247
$AMARILLO = RGBv 255 235 156
$VIOLETA = RGBv 228 223 236
$GRIS = RGBv 217 217 217
$ROJO = 192

if (Test-Path $salida) { Remove-Item $salida -Force }

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

function Encabezado($hoja, $titulos, $anchoTotal) {
    $i = 1
    foreach ($t in $titulos) { $hoja.Cells.Item(1, $i) = $t; $i++ }
    $r = $hoja.Range("A1:" + $anchoTotal + "1")
    $r.Font.Bold = $true
    $r.Font.Color = $BLANCO
    $r.Interior.Color = $AZUL
    $r.HorizontalAlignment = -4108
    $r.VerticalAlignment = -4108
    $r.WrapText = $true
    $hoja.Rows.Item(1).RowHeight = 30
}

function Anchos($hoja, $anchos) {
    $i = 1
    foreach ($a in $anchos) { $hoja.Columns.Item($i).ColumnWidth = $a; $i++ }
}

function ListaValidacion($hoja, $rango, $opciones) {
    $r = $hoja.Range($rango)
    try { $r.Validation.Delete() } catch {}
    $r.Validation.Add(3, 1, 1, $opciones) | Out-Null    # xlValidateList
}

# Boton de la hoja (forma redondeada). Al hacer clic corre la macro.
function Boton($hoja, $fila, $texto, $macro, $color, $col = 8, $ancho = 165, $alto = 20) {
    $izq = $hoja.Columns.Item($col).Left
    $arr = $hoja.Rows.Item($fila).Top
    $sh = $hoja.Shapes.AddShape(5, $izq, $arr, $ancho, $alto)   # 5 = redondeado
    $sh.Name = "btn_" + ($macro -replace '\W', '')
    $sh.Fill.ForeColor.RGB = $color
    $sh.Line.Visible = 0
    $sh.Shadow.Visible = 0
    $sh.TextFrame.Characters().Text = $texto
    $sh.TextFrame.Characters().Font.Size = 9
    $sh.TextFrame.Characters().Font.Bold = $true
    $sh.OnAction = $macro
}

# Indicador del tablero: dos columnas de ancho, titulo arriba y cifra abajo.
# $columna y $siguiente son letras ("A" y "B", "C" y "D"...).
function Indicador($hoja, $columna, $siguiente, $titulo, $formula) {
    $c1 = $hoja.Range($columna + "4")
    $hoja.Range($columna + "4:" + $siguiente + "4").Merge() | Out-Null
    $c1.Value = $titulo
    $c1.Font.Bold = $true
    $c1.Font.Size = 10
    $c1.Interior.Color = $AZUL
    $c1.Font.Color = $BLANCO
    $c1.HorizontalAlignment = -4108
    $c2 = $hoja.Range($columna + "5")
    $hoja.Range($columna + "5:" + $siguiente + "6").Merge() | Out-Null
    $c2.Formula = $formula
    $c2.Font.Size = 26
    $c2.Font.Bold = $true
    $c2.HorizontalAlignment = -4108
    $c2.VerticalAlignment = -4108
    $c2.Interior.Color = $GRIS_CAJON
    $hoja.Rows.Item(5).RowHeight = 34
}

try {
    $libro = $excel.Workbooks.Add()

    # ============================================================== Menu
    $menu = $libro.Worksheets.Item(1)
    $menu.Name = "Menu"
    $menu.Cells.Font.Name = "Calibri"
    $menu.Columns.Item(1).ColumnWidth = 34
    $menu.Columns.Item(2).ColumnWidth = 4
    $menu.Rows.RowHeight = 19

    $menu.Range("A1").Value = "CHECKLIST DIARIO"
    $menu.Range("A1").Font.Size = 24
    $menu.Range("A1").Font.Bold = $true
    $menu.Range("A1").Font.Color = $AZUL
    $menu.Range("A2").Value = "Grupos, tareas fijas, unicas, futuras, importancia, historial y pendientes."
    $menu.Range("A2").Font.Color = $GRIS_TXT

    $secciones = @(
        @{ titulo = "1. Armar la base"; color = $AZUL_C; items = @(
            @("Crear plantilla", "CrearPlantilla"),
            @("Cargar ejemplo", "CargarEjemplo"),
            @("Agregar grupo", "AgregarGrupo"),
            @("Agregar tarea fija", "AgregarTareaFija"),
            @("Copiar tarea como unica", "CopiarTareaComoUnica"),
            @("Agregar tarea futura", "AgregarTareaFutura"),
            @("Ver tareas futuras", "VerTareasFuturas"),
            @("Tarea solo del dia", "AgregarTareaDelDia"),
            @("Limpiar tareas inactivas", "LimpiarTareasInactivas")
        )},
        @{ titulo = "2. El dia"; color = $VERDE_S; items = @(
            @("Crear checklist de HOY", "CrearChecklistDeHoy"),
            @("Crear checklist de una fecha", "CrearChecklistDiario"),
            @("Crear los ultimos 7 dias", "CrearChecklistSemana")
        )},
        @{ titulo = "3. Orden del dia"; color = $AMARILLO; items = @(
            @("Ordenar por importancia", "OrdenarPorImportancia"),
            @("Subir una tarea", "SubirTarea"),
            @("Bajar una tarea", "BajarTarea"),
            @("Priorizar una tarea", "PriorizarTarea"),
            @("Aplicar MI orden", "AplicarMiOrden"),
            @("Tomar el orden actual", "TomarOrdenActual")
        )},
        @{ titulo = "4. Marcar"; color = $NARANJA; items = @(
            @("Marcar una tarea", "MarcarTarea"),
            @("Marcar No aplica", "MarcarNoAplica"),
            @("Marcar grupo completo", "MarcarGrupoCompleto"),
            @("Resumen del dia", "ResumenDelDia"),
            @("Pintar todo de nuevo", "PintarTodo")
        )},
        @{ titulo = "5. Pendientes e historial"; color = $VIOLETA; items = @(
            @("Ver pendientes", "VerPendientes"),
            @("Resolver pendiente", "ResolverPendiente"),
            @("Mover pendiente a hoy", "MoverPendienteAHoy"),
            @("Consultar historial", "ConsultarHistorial"),
            @("Cerrar dia", "CerrarDia")
        )},
        @{ titulo = "6. Tablero y hojas"; color = $GRIS; items = @(
            @("Actualizar tablero", "ActualizarTablero"),
            @("Ver Dashboard", "IrATablero"),
            @("Ver Checklist", "IrAChecklist"),
            @("Ver Tareas", "IrATareas"),
            @("Ver Historial", "IrAHistorial")
        )}
    )

    $fila = 4
    foreach ($sec in $secciones) {
        $menu.Range("A" + $fila).Value = $sec.titulo
        $menu.Range("A" + $fila).Font.Bold = $true
        $menu.Range("A" + $fila).Font.Size = 12
        $menu.Range("A" + $fila).Font.Color = $BLANCO
        $menu.Range("A" + $fila + ":A" + $fila).Interior.Color = $AZUL
        $fila++
        foreach ($it in $sec.items) {
            $menu.Range("A" + ($fila - 1) + ":A" + $fila).Interior.Color = $sec.color
            Boton $menu $fila $it[0] $it[1] $sec.color 1 250 20
            $fila++
        }
        $fila++
    }
    $menu.Range("A" + ($fila - 1) + ":A" + ($fila + 1)).Interior.Color = RGBv 255 255 255
    $menu.Range("A" + $fila).Value = "Nota: la columna Importancia da el orden por defecto;"
    $menu.Range("A" + ($fila + 1)).Value = "con SubirTarea o la columna OrdenDia lo cambias."
    $menu.Range("A" + $fila + ":A" + ($fila + 1)).Font.Italic = $true

    # ============================================================== Grupos
    $g = $libro.Worksheets.Add([Type]::Missing, $menu)
    $g.Name = "Grupos"
    Encabezado $g @("ID", "Grupo", "Descripcion", "Activo", "Color") "E"
    Anchos $g @(8, 32, 44, 10, 12)
    ListaValidacion $g "D2:D200" "Si,No"

    # ============================================================== Tareas
    $t = $libro.Worksheets.Add([Type]::Missing, $g)
    $t.Name = "Tareas"
    Encabezado $t @("ID", "Grupo", "Tarea", "Orden", "Activa", "Responsable", "Importancia", "Unica", "FechaUnica") "I"
    Anchos $t @(8, 26, 46, 8, 9, 18, 12, 9, 14)
    $t.Range("I2:I500").NumberFormat = "dd-mm-yyyy"
    ListaValidacion $t "E2:E500" "Si,No"
    ListaValidacion $t "G2:G500" "Alta,Media,Baja"
    ListaValidacion $t "H2:H500" "Si,No"
    $r = $t.Range("G2:G500")
    $r.FormatConditions.Delete()
    $r.FormatConditions.Add(1, 3, "=""Alta""") | Out-Null
    $r.FormatConditions.Item(1).Font.Color = $ROJO
    $r.FormatConditions.Item(1).Font.Bold = $true
    $r = $t.Range("H2:H500")
    $r.FormatConditions.Delete()
    $r.FormatConditions.Add(1, 3, "=""Si""") | Out-Null
    $r.FormatConditions.Item(1).Interior.Color = $VIOLETA

    # ============================================================= Checklist
    $c = $libro.Worksheets.Add([Type]::Missing, $t)
    $c.Name = "Checklist"
    Encabezado $c @("Fecha", "ID Tarea", "Grupo", "Tarea", "Estado", "Responsable", "Hora", "Observacion", "Importancia", "Nivel", "OrdenDia") "K"
    Anchos $c @(12, 8, 24, 42, 13, 18, 9, 32, 12, 7, 10)
    $c.Range("A2:A5000").NumberFormat = "dd-mm-yyyy"
    $c.Range("G2:G5000").NumberFormat = "hh:mm"
    $c.Range("J2:K5000").HorizontalAlignment = -4108
    ListaValidacion $c "E2:E5000" "Pendiente,Hecho,No aplica"
    ListaValidacion $c "I2:I5000" "Alta,Media,Baja"
    $r = $c.Range("E2:E5000")
    $r.FormatConditions.Delete()
    $r.FormatConditions.Add(1, 3, "=""Hecho""") | Out-Null
    $r.FormatConditions.Item(1).Interior.Color = RGBv 198 239 206
    $r.FormatConditions.Item(1).Font.Color = RGBv 0 97 0
    $r.FormatConditions.Add(1, 3, "=""No aplica""") | Out-Null
    $r.FormatConditions.Item(2).Interior.Color = $GRIS
    $r.FormatConditions.Item(2).Font.Italic = $true
    $r.FormatConditions.Add(1, 3, "=""Pendiente""") | Out-Null
    $r.FormatConditions.Item(3).Interior.Color = RGBv 255 235 156
    $r = $c.Range("I2:I5000")
    $r.FormatConditions.Delete()
    $r.FormatConditions.Add(1, 3, "=""Alta""") | Out-Null
    $r.FormatConditions.Item(1).Font.Color = $ROJO
    $r.FormatConditions.Item(1).Font.Bold = $true
    $r = $c.Range("K2:K5000")
    $r.FormatConditions.Delete()
    $r.FormatConditions.Add(1, 3, "=1") | Out-Null
    $r.FormatConditions.Item(1).Font.Bold = $true

    # ========================================================= HistorialDia
    $h = $libro.Worksheets.Add([Type]::Missing, $c)
    $h.Name = "HistorialDia"
    Encabezado $h @("Fecha", "ID Tarea", "Grupo", "Tarea", "Estado", "Responsable", "Hora", "Observacion", "Importancia", "OrdenDia", "Guardado") "K"
    Anchos $h @(12, 8, 24, 42, 13, 18, 9, 32, 12, 10, 18)
    $h.Range("A2:A9000").NumberFormat = "dd-mm-yyyy"
    $h.Range("G2:G9000").NumberFormat = "hh:mm"
    $h.Range("K2:K9000").NumberFormat = "dd-mm-yyyy hh:mm"

    # =========================================================== Pendientes
    $p = $libro.Worksheets.Add([Type]::Missing, $h)
    $p.Name = "Pendientes"
    Encabezado $p @("Fecha", "Grupo", "Tarea", "Importancia", "Dias Atraso", "Estado", "Observacion", "Fila Checklist") "H"
    Anchos $p @(12, 24, 42, 12, 13, 13, 32, 15)
    $p.Range("A2:A9000").NumberFormat = "dd-mm-yyyy"
    $r = $p.Range("E2:E9000")
    $r.FormatConditions.Delete()
    $r.FormatConditions.Add(1, 7, "=3") | Out-Null
    $r.FormatConditions.Item(1).Interior.Color = $NARANJA
    $r.FormatConditions.Add(1, 1, "=1", "=2") | Out-Null
    $r.FormatConditions.Item(2).Interior.Color = $AMARILLO_TIT
    $r = $p.Range("D2:D9000")
    $r.FormatConditions.Delete()
    $r.FormatConditions.Add(1, 3, "=""Alta""") | Out-Null
    $r.FormatConditions.Item(1).Font.Bold = $true
    $r.FormatConditions.Item(1).Font.Color = $ROJO

    # ============================================================ Dashboard
    $d = $libro.Worksheets.Add([Type]::Missing, $p)
    $d.Name = "Dashboard"
    $d.Cells.Font.Name = "Calibri"
    Anchos $d @(12, 22, 38, 13, 13, 15, 3, 16, 16, 16)
    $d.Rows.RowHeight = 18

    $d.Range("A1").Value = "CHECKLIST DIARIO"
    $d.Range("A1").Font.Size = 24
    $d.Range("A1").Font.Bold = $true
    $d.Range("A1").Font.Color = $AZUL
    $d.Range("A2").Value = "Panel de control"
    $d.Range("A2").Font.Size = 12
    $d.Range("A2").Font.Color = $GRIS_TXT
    $d.Range("F2").Value = "Hoy:"
    $d.Range("F2").Font.Bold = $true
    $d.Range("G2").Formula = "=TEXT(TODAY(),""dd-mm-yyyy"")"

    Indicador $d "A" "B" "TAREAS DE HOY" "=SUMPRODUCT((Checklist!`$A`$2:`$A`$5000=TODAY())*1)"
    Indicador $d "C" "D" "HECHAS" "=SUMPRODUCT((Checklist!`$A`$2:`$A`$5000=TODAY())*(Checklist!`$E`$2:`$E`$5000=""Hecho""))"
    Indicador $d "E" "F" "PENDIENTES HOY" "=SUMPRODUCT((Checklist!`$A`$2:`$A`$5000=TODAY())*(Checklist!`$E`$2:`$E`$5000=""Pendiente""))"
    Indicador $d "H" "I" "NO APLICA" "=SUMPRODUCT((Checklist!`$A`$2:`$A`$5000=TODAY())*(Checklist!`$E`$2:`$E`$5000=""No aplica""))"
    Indicador $d "J" "K" "AVANCE" "=IFERROR(C5/(A5-H5),0)"
    $d.Range("J5").NumberFormat = "0%"

    $d.Range("A8:F8").Merge() | Out-Null
    $d.Range("A8").Value = "PENDIENTES DE DIAS ANTERIORES"
    $d.Range("A8").Font.Bold = $true
    $d.Range("A8").Font.Size = 12
    $d.Range("A8").Interior.Color = $AMARILLO_TIT
    $d.Range("A10:A21").NumberFormat = "dd-mm-yyyy"

    $d.Range("A23:E23").Merge() | Out-Null
    $d.Range("A23").Value = "TAREAS DE HOY (EN SU ORDEN)"
    $d.Range("A23").Font.Bold = $true
    $d.Range("A23").Font.Size = 12
    $d.Range("A23").Interior.Color = $VERDE_TIT

    foreach ($bloque in @(
            @{ r = 9;  c = "A:F"; tit = @("Fecha", "Grupo", "Tarea", "Importancia", "Dias atraso", "Estado") },
            @{ r = 24; c = "A:E"; tit = @("#", "Grupo", "Tarea", "Importancia", "Estado") }
        )) {
        $ini = $bloque.c.Split(":")[0]
        $fin = $bloque.c.Split(":")[1]
        $rg = $d.Range($ini + [string]$bloque.r + ":" + $fin + [string]$bloque.r)
        $i = 1
        foreach ($tit in $bloque.tit) { $rg.Cells.Item(1, $i) = $tit; $i++ }
        $rg.Font.Bold = $true
        $rg.Font.Color = $BLANCO
        $rg.Interior.Color = $AZUL
        $rg.HorizontalAlignment = -4108
        $rg.WrapText = $true
        $d.Rows.Item($bloque.r).RowHeight = 24
    }

    $d.Range("H8:J8").Merge() | Out-Null
    $d.Range("H8").Value = "ACCIONES RAPIDAS"
    $d.Range("H8").Font.Bold = $true
    $d.Range("H8").Font.Color = $BLANCO
    $d.Range("H8").Interior.Color = $AZUL
    $d.Range("H8").HorizontalAlignment = -4108

    $botones = @(
        @("Crear checklist de HOY", "CrearChecklistDeHoy", $VERDE_S),
        @("Actualizar tablero", "ActualizarTablero", $AZUL_C),
        @("Marcar una tarea", "MarcarTarea", $AMARILLO),
        @("Marcar No aplica", "MarcarNoAplica", $AMARILLO),
        @("Marcar grupo completo", "MarcarGrupoCompleto", $AMARILLO),
        @("Ver pendientes", "VerPendientes", $NARANJA),
        @("Resolver pendiente", "ResolverPendiente", $NARANJA),
        @("Mover pendiente a hoy", "MoverPendienteAHoy", $NARANJA),
        @("Agregar tarea fija", "AgregarTareaFija", $VERDE_S),
        @("Agregar tarea futura", "AgregarTareaFutura", $VERDE_S),
        @("Ver tareas futuras", "VerTareasFuturas", $VERDE_S),
        @("Ordenar por importancia", "OrdenarPorImportancia", $AZUL_C),
        @("Ver Checklist", "IrAChecklist", $GRIS),
        @("Ver Tareas", "IrATareas", $GRIS),
        @("Ver Historial", "IrAHistorial", $GRIS),
        @("Ver Menu completo", "IrAMenu", $GRIS)
    )
    $f = 9
    foreach ($b in $botones) {
        Boton $d $f $b[0] $b[1] $b[2] 8 165 20
        $f++
    }

    $d.Range("A44").Value = "Ultima actualizacion:"
    $d.Range("A44").Font.Italic = $true
    $d.Range("D44").Formula = "=NOW()"
    $d.Range("D44").NumberFormat = "dd-mm-yyyy hh:mm"
    $d.Range("D44").Font.Italic = $true
    $d.Range("A46").Value = "Los numeros de arriba se actualizan solos. Las dos tablas se"
    $d.Range("A47").Value = "llenan con el boton Actualizar tablero."
    $d.Range("A46:A47").Font.Italic = $true
    $d.Range("A46:A47").Font.Color = $GRIS_TXT

    # Panel inmovil en las hojas de datos.
    foreach ($h2 in @($g, $t, $c, $h, $p)) {
        $h2.Activate()
        $h2.Range("A2").Select() | Out-Null
        $excel.ActiveWindow.FreezePanes = $false
        $excel.ActiveWindow.FreezePanes = $true
    }

    # ======================================================== Modulo VBA
    $codigo = Get-Content $bas -Raw
    $codigo = $codigo -replace "(?m)^Attribute VB_Name.*\r?\n", ""
    $modulo = $libro.VBProject.VBComponents.Add(1)
    $modulo.Name = "ChecklistDiario"
    $modulo.CodeModule.AddFromString($codigo)
    Write-Host ("Modulo VBA cargado: " + $modulo.CodeModule.CountOfLines + " lineas")

    # El Dashboard queda primera hoja y es la que se ve al abrir.
    $d.Move($libro.Worksheets.Item(1))
    $d.Activate()
    $d.Range("A1").Select() | Out-Null
    $libro.SaveAs($salida, 52)      # xlOpenXMLWorkbookMacroEnabled
    $libro.Close($false)
    Write-Host ("Guardado: " + $salida)
}
finally {
    $excel.Quit()
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
}