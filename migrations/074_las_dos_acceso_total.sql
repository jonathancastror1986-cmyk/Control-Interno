-- ===================================================================
-- 074  LAS DOS "acceso_total" QUE QUEDAN
-- ===================================================================
--
-- Hermana de la 073: ésa quitó "acceso_total_trabajadores", y ésta quita las otras dos de la misma
-- familia, que se crearon a mano y que ninguna migración borró.
--
-- Corre esto ENTERO en el editor SQL de Supabase. El panel que queda abierto es el último, y el
-- último es el que dice qué pasó.
--
-- ---------------------------------------------------------------------
-- LO QUE SE SABE, MEDIDO
-- ---------------------------------------------------------------------
--
--   asistencia     117 filas visibles con la llave anónima
--   trabajadores     1 fila visible con la llave anónima  (era 47 antes de la 073)
--   epp_entregas     0
--   marcajes         0
--   tarjetas         0
--
-- Y el listado de políticas da los nombres:
--
--   asistencia   acceso_total_asistencia | asistencia por empresa
--   perfiles     acceso_total_perfiles | perfiles read | perfiles write
--
-- ---------------------------------------------------------------------
-- Y POR QUÉ "acceso_total_asistencia" ES LA DE LAS 117
-- ---------------------------------------------------------------------
--
-- Porque su nombre es de la familia, y la 073 demostró que la familia anda mal: "acceso_total_
-- trabajadores" también era una de ésas, no la creó ninguna migración, y quitarla bajó la tabla de
-- 47 filas a 1. Eso es una prueba, no una analogía: se quitó una de la familia y se midió el
-- efecto.
--
-- Y con varias políticas, PostgreSQL las suma con OR entre las permisivas. O sea que una sola que
-- pase sin preguntar deja pasar la fila, y por muy acotada que esté la otra que está al lado. Las
-- 117 no vienen de que "asistencia por empresa" esté mal: vienen de que hay una segunda que no
-- pregunta nada.
--
-- ---------------------------------------------------------------------
-- Y POR QUÉ "acceso_total_perfiles" TAMBIÉN, AUNQUE NO SE HAYA MEDIDO
-- ---------------------------------------------------------------------
--
-- Porque es la misma familia y el mismo nombre, y la 073 no la tocó. "perfiles" es la tabla de
-- dónde sale el usuario de cada sesión, así que dejar abierto quién es quién en el sistema no es un
-- detalle: es el primer escalón de cualquier otro agujero.
--
-- ---------------------------------------------------------------------
-- Y POR QUÉ NO SE INVENTA UNA POLÍTICA NUEVA
-- ---------------------------------------------------------------------
--
-- Porque no hace falta, y hacerlas a ciegas es peor que no hacerlas. Las dos políticas buenas ya
-- existen y son correctas --"acceso_total_X" no las anula, las desarma: las suma con OR y la que
-- no pregunta gana. Borrando la que no pregunta, la buena vuelve a ser la que decide.
--
-- Y si después de esta migración alguien no ve lo que ve, el problema no es que falte una
-- política: es que las dos buenas no funcionan. Y eso se ve en el diagnóstico, no se arregla
-- adivinando.
--
-- ---------------------------------------------------------------------
-- Y POR QUÉ ABORTA SI NO ESTÁN LAS BUENAS
-- ---------------------------------------------------------------------
--
-- Porque sin políticas, con el RLS prendido, no lee nadie: ni un usuario, ni un administrador.
-- Cerrar una tabla dejándola sin abrir por otro lado es peor que dejarla abierta, y es un error
-- que se descubre cuando alguien intenta trabajar. Esto va primero, antes de borrar nada.

do $$
declare
  v_asistencia int;
  v_perfiles_rd int;
  v_perfiles_wr int;
begin
  select count(*) into v_asistencia from pg_policies
   where schemaname = 'public' and tablename = 'asistencia'
     and policyname = 'asistencia por empresa';
  select count(*) into v_perfiles_rd from pg_policies
   where schemaname = 'public' and tablename = 'perfiles'
     and policyname = 'perfiles read';
  select count(*) into v_perfiles_wr from pg_policies
   where schemaname = 'public' and tablename = 'perfiles'
     and policyname = 'perfiles write';

  if v_asistencia = 0 then
    raise exception
      'Falta "asistencia por empresa" (=%). Si se borra "acceso_total_asistencia" sin ella, "asistencia" queda SIN políticas y no la lee nadie. Revisar a mano. Se va a abortar.', v_asistencia;
  end if;
  if v_perfiles_rd = 0 or v_perfiles_wr = 0 then
    raise exception
      'Falta la política correcta de "perfiles" (read=% write=%). Si se borra "acceso_total_perfiles" sin ellas, "perfiles" queda SIN políticas y no la lee nadie. Revisar a mano. Se va a abortar.', v_perfiles_rd, v_perfiles_wr;
  end if;
end $$;


-- ===================================================================
-- 1) LAS QUE ABREN TODO
-- ===================================================================

drop policy if exists "acceso_total_asistencia" on public.asistencia;
drop policy if exists "acceso_total_perfiles"   on public.perfiles;


-- ===================================================================
-- 2) QUE EL RLS SIGA PRENDIDO
-- ===================================================================
--
-- Y esto no sobra: "acceso_total_asistencia" se creó a mano y no está en ninguna migración, así que
-- tampoco hay registro de si dejé el RLS como estaba. Un "alter table" acá es idempotente.
alter table public.asistencia enable row level security;
alter table public.perfiles   enable row level security;


comment on policy "asistencia por empresa" on public.asistencia is
  'Acota la asistencia por empresa. Estaba anulada por "acceso_total_asistencia", creada a mano y que '
  'ninguna migración borraba: con varias políticas permisivas se suman con OR, así que la que decía '
  '"usando (true)" dejaba pasar las 117 filas. Ver [rls-09].';

comment on policy "perfiles read" on public.perfiles is
  'Lee el perfil del usuario de la sesión. Estaba anulada por "acceso_total_perfiles", misma familia y '
  'mismo defecto que en "asistencia". Ver [rls-09].';


-- ===================================================================
-- 3) QUÉ PASÓ, EN UN PANEL
-- ===================================================================
--
-- Y esto va AL FINAL, y es un SELECT, porque el editor de Supabase muestra un panel por sentencia y
-- sólo deja abierto el último. Si esto fuera un "alter table", el panel diría "Success. No rows
-- returned" y no se sabría si las políticas se borraron o no.
--
-- Y el veredicto se lee en la columna "estado", que es lo que hay que mirar.

select t.tabla,
       case
         when exists (select 1 from pg_policies p
                       where p.schemaname = 'public' and p.tablename = t.tabla
                         and p.policyname like 'acceso_total%')
              then '*** TODAVIA HAY UNA acceso_total ***'
         else 'ninguna acceso_total'
       end                                        as acceso_total,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = t.tabla)  as politicas,
       c.relrowsecurity                             as rls,
       case
         when not c.relrowsecurity                 then '*** RLS APAGADO ***'
         when exists (select 1 from pg_policies p
                       where p.schemaname = 'public' and p.tablename = t.tabla
                         and p.qual is null)
              then '*** QUEDA UNA SIN CONDICION ***'
         else 'cerrada'
       end                                        as estado
  from unnest(array['asistencia', 'perfiles']) as t(tabla)
  join pg_class c on c.relname = t.tabla
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
 order by t.tabla;