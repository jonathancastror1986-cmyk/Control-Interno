-- ===================================================================
-- DIAGNÓSTICO: QUÉ MIGRACIONES NO ESTÁN APLICADAS
-- ===================================================================

-- Corre esto ENTERO. No cambia NADA: solo mira y te dice qué falta.

-- ---------------------------------------------------------------------
-- POR QUÉ ESTE DIAGNÓSTICO Y NO UN "SELECT" POR MIGRACIÓN
-- ---------------------------------------------------------------------

-- Porque no existe una tabla de "migraciones aplicadas" en este proyecto. Y no se va a agregar
-- una: sería un registro que puede mentir. Si alguien creó una tabla a mano, el registro diría que
-- la migración no se aplicó, y al re-correrla fallaría.

-- El estado real lo dice la base, mirando los objetos. Una migración se considera aplicada si
-- la tabla que crea existe.

-- ---------------------------------------------------------------------
-- Y POR QUÉ LA TABLA Y NO LA COLUMNA
-- ---------------------------------------------------------------------

-- Porque hay migraciones que solo agregan columnas a tablas que ya existían. Para esas no hay
-- tabla que mirar, y se usa la tabla a la que le agregan: si esa tabla existe pero la columna no,
-- la migración no corrió.

-- Y una migración que ya corrió y después quedó a medias, con la tabla creada y el resto sin,
-- aparece como aplicada. Eso se ve en la columna "nota" del reporte del final.

-- ===================================================================
-- 1) LAS MIGRACIONES NUMERADAS Y SU ANCLA
-- ===================================================================

-- Y LA LISTA ESTA ESCRITA A MANO, NO SE ARMA CON SQL

-- Un "values" se puede escribir en el archivo, pero no se puede leer de los archivos .sql desde
-- la base. Las migraciones viven en el repositorio y la base no las ve. Entonces la lista se
-- escribe acá, y si se agrega una migracion hay que sumar una fila.

-- Y ESO PARECE TRABAJO, PERO ES LO CONTRARIO: son 80 lineas contra andar adivinando

with migraciones(numero, archivo, ancla, tipo, columna) as (
  values
    (1, '001_schema.sql', 'perfiles', 'tabla', ''),
    (2, '002_usuarios.sql', 'handle_new_user', 'funcion', ''),
    (3, '003_fecha_ingreso.sql', 'trabajadores', 'columna', 'fecha_ingreso'),
    (4, '004_dia_lluvia.sql', '', 'sin ancla', ''),
    (5, '005_indicaciones_trabajadores.sql', 'trabajadores', 'columna', 'indicaciones_sociales'),
    (6, '006_tipo_trabajador.sql', 'trabajadores', 'columna', 'tipo_trabajador'),
    (7, '007_tarjetas.sql', 'tarjetas', 'tabla', ''),
    (8, '008_epp_firma.sql', 'epp_catalogo', 'tabla', ''),
    (9, '009_qr_inventario.sql', 'inventario_qr', 'tabla', ''),
    (10, '010_tipo_talla.sql', 'epp_catalogo', 'columna', 'tipo_talla'),
    (11, '011_especialidades.sql', 'epp_especialidades', 'tabla', ''),
    (12, '012_kits_multiples.sql', 'epp_kits', 'tabla', ''),
    (13, '013_roles_permisos.sql', 'roles_sistema', 'tabla', ''),
    (14, '014_multi_empresa.sql', 'perfil_empresas', 'tabla', ''),
    (15, '015_perfil_trabajador.sql', 'perfiles', 'columna', 'trabajador_code'),
    (16, '016_permisos_coherentes.sql', 'es_usuario_activo', 'funcion', ''),
    (17, '017_marcajes_diarios.sql', 'marcajes', 'tabla', ''),
    (18, '018_tarjetas_bloqueo.sql', 'tarjetas', 'columna', 'motivo_bloqueo'),
    (19, '019_invitaciones_perfiles.sql', 'invitaciones', 'tabla', ''),
    (20, '020_rut_importacion_marcajes.sql', 'marcajes_importaciones', 'tabla', ''),
    (21, '021_altas_cuentas.sql', 'cuentas_altas', 'tabla', ''),
    (22, '022_columna_existe.sql', 'columna_existe', 'funcion', ''),
    (23, '023_registro_avisos.sql', 'accesos_sistema', 'tabla', ''),
    (24, '024_permisos_escritura.sql', 'es_usuario_activo', 'funcion', ''),
    (25, '025_roles_invalidos.sql', 'roles_validos_array', 'funcion', ''),
    (26, '026_respaldo_reloj.sql', 'avisos_ingreso', 'columna', 'destino'),
    (27, '027_permisos_vistas.sql', 'diagnostico_vistas_por_rol', 'funcion', ''),
    (28, '028_auditoria_asistencia.sql', 'asistencia_auditoria', 'tabla', ''),
    (29, '029_desvinculacion_articulo.sql', 'desvinculaciones', 'tabla', ''),
    (30, '030_relojes_totem.sql', 'centros_costo', 'tabla', ''),
    (31, '031_kit_contratacion.sql', 'plantillas_contratacion', 'tabla', ''),
    (32, '032_logo_firmas_variables.sql', 'plantillas_contratacion', 'columna', 'mostrar_logo'),
    (33, '033_reloj_kiosco.sql', 'relojes', 'columna', 'hash_pin'),
    (34, '034_colacion_empresa.sql', 'empresa', 'columna', 'colacion_inicio'),
    (35, '035_marcajes_offline_csv.sql', 'importaciones_offline', 'tabla', ''),
    (36, '036_comprobar_token_reloj.sql', 'comprobar_token_reloj', 'funcion', ''),
    (37, '037_rol_reloj_asignable.sql', 'roles_validos_array', 'funcion', ''),
    (38, '038_clave_temporal.sql', 'perfiles', 'columna', 'estado_clave'),
    (39, '039_rol_reloj_en_catalogo.sql', 'roles_validos_array', 'funcion', ''),
    (40, '040_registro_porteria.sql', 'visitas', 'tabla', ''),
    (41, '041_registro_porteria_personal.sql', 'porteria_registros', 'tabla', ''),
    (42, '042_ingreso_grupo_vehiculo.sql', 'porteria_grupos', 'tabla', ''),
    (43, '043_proveedores_productos_guias.sql', 'proveedores', 'tabla', ''),
    (44, '044_guias_permisos_funciones.sql', 'proveedores_de_producto', 'funcion', ''),
    (45, '045_ubicacion_entrega.sql', 'epp_entregas', 'columna', 'pasillo'),
    (46, '046_ingresos_pendientes.sql', 'ingresos_pendientes', 'tabla', ''),
    (47, '047_amonestaciones.sql', 'trabajador_amonestaciones', 'tabla', ''),
    (48, '048_permisos_ingresos_amonestaciones.sql', 'diagnostico_permisos_ingresos_amonestaciones', 'funcion', ''),
    (49, '049_expedientes.sql', 'documentos_catalogo', 'tabla', ''),
    (50, '050_especialidades_empresa.sql', 'empresa_especialidades', 'tabla', ''),
    (51, '051_grupos_cargos.sql', 'epp_grupos', 'tabla', ''),
    (52, '052_horarios_marcaje.sql', 'reloj_horarios', 'tabla', ''),
    (53, '053_turnos_colacion.sql', 'empresa_turnos', 'tabla', ''),
    (54, '054_pedir_ingreso_empresa_id.sql', 'pedir_ingreso', 'funcion', ''),
    (55, '055_crear_cargos.sql', 'gestionar_cargo', 'funcion', ''),
    (56, '056_nombres_trabajador.sql', 'trabajadores', 'columna', 'nombres'),
    (57, '057_afp_trabajador.sql', 'trabajadores', 'columna', 'afp_codigo'),
    (58, '058_plantillas.sql', 'plantillas', 'tabla', ''),
    (59, '059_campos_empresa.sql', 'plantilla_campos', 'tabla', ''),
    (60, '060_plantillas_tres_sintaxis.sql', 'campos_de_plantilla', 'funcion', ''),
    (61, '061_aprobacion_plantilla.sql', 'plantillas_contratacion', 'columna', 'requiere_aprobacion'),
    (62, '062_modo_firma.sql', 'plantillas_contratacion', 'columna', 'modo_firma'),
    (63, '063_autorizacion_firma.sql', 'firma_autorizaciones', 'tabla', ''),
    (64, '064_centro_costo_trabajador.sql', 'trabajadores', 'columna', 'centro_costo_id'),
    (65, '065_afp_salud.sql', 'afp', 'tabla', ''),
    (66, '066_clave_AFP_y_centros.sql', 'afp', 'columna', 'clave_letras'),
    (67, '067_aislar_por_empresa.sql', 'puede_ver_trabajador', 'funcion', ''),
    (68, '068_bucket_epp_respaldos.sql', '', 'sin ancla', ''),
    (69, '069_sueldo_base.sql', 'sueldo_base_historial', 'tabla', ''),
    (70, '070_oficina_carga_sueldo.sql', '', 'sin ancla', ''),
    (71, '071_epp_entregas.sql', '', 'sin ancla', ''),
    (72, '072_las_dos_que_quedaban.sql', 'puede_ver_entrega', 'funcion', ''),
    (73, '073_corta_el_acceso_total.sql', '', 'sin ancla', ''),
    (74, '074_las_dos_acceso_total.sql', '', 'sin ancla', ''),
    (75, '075_categoria_de_plantilla.sql', 'plantillas', 'columna', 'categoria'),
    (76, '076_causas_termino.sql', 'causas_termino', 'tabla', ''),
    (77, '077_remuneraciones.sql', 'remuneraciones', 'tabla', ''),
    (78, '078_normaliza_rut.sql', 'rut_digito_verificador', 'funcion', ''),
    (79, '079_firmas_documento.sql', 'firmas_documento', 'tabla', ''),
    (80, '080_categoria_kit_contratacion.sql', 'plantillas_contratacion', 'columna', 'categoria')
)
select m.numero,
       m.archivo,
       m.tipo,
       case when m.ancla = '' then '(sin ancla)'
            when m.tipo = 'tabla' then
              case when exists (select 1 from pg_class c
                               join pg_namespace ns on ns.oid = c.relnamespace
                             where c.relname = m.ancla and ns.nspname = 'public'
                               and c.relkind = 'r')
                then 'ok' else 'FALTA' end
            when m.tipo = 'columna' then
              case when exists (select 1 from pg_class c
                               join pg_namespace ns on ns.oid = c.relnamespace
                             where c.relname = m.ancla and ns.nspname = 'public'
                               and c.relkind = 'r')
                then case when exists (select 1 from information_schema.columns
                                       where table_schema = 'public' and table_name = m.ancla
                                         and column_name = m.columna)
                      then 'ok' else 'FALTA (la tabla esta, la columna no)' end
                else 'FALTA (la tabla no esta)' end
            else
              case when exists (select 1 from pg_proc p
                               join pg_namespace ns on ns.oid = p.pronamespace
                             where p.proname = m.ancla and ns.nspname = 'public')
                then 'ok' else 'FALTA' end
       end as estado
  from migraciones m
 order by m.numero;

-- Y LA COLUMNA QUE FALTA SE DICE "m.columna" ARRIBA, Y SE DEFINE ABAJO

-- Se agrega al "with" para no repetir la busqueda de la tabla. Y sin esa columna, el "case"
-- del tipo columna daria error.

-- -- Y LA LISTA CORTA: SOLO LAS QUE FALTAN, QUE ES LO QUE HAY QUE CORRER
select m.numero, m.archivo, m.tipo, m.ancla
  from migraciones m
 where case when m.ancla = '' then false
            when m.tipo = 'tabla' then
              not exists (select 1 from pg_class c
                             join pg_namespace ns on ns.oid = c.relnamespace
                           where c.relname = m.ancla and ns.nspname = 'public'
                             and c.relkind = 'r')
            when m.tipo = 'columna' then
              not exists (select 1 from information_schema.columns
                            where table_schema = 'public' and table_name = m.ancla
                              and column_name = m.columna)
            else
              not exists (select 1 from pg_proc p
                             join pg_namespace ns on ns.oid = p.pronamespace
                           where p.proname = m.ancla and ns.nspname = 'public')
       end
 order by m.numero;
