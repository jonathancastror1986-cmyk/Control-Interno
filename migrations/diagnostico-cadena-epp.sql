-- ===================================================================
-- ¿QUÉ POLÍTICAS TIENEN LAS SEIS TABLAS DE LA CADENA, AHORA MISMO?
-- ===================================================================
--
-- ---------------------------------------------------------------------
-- POR QUÉ ESTE DIAGNÓSTICO ES MÁS ANCHO QUE EL DE "epp_entregas"
-- ---------------------------------------------------------------------
--
-- Porque la 072 toca DOS tablas y porque hay que ver el estado de las SEIS de la cadena, no el de
-- una. El detalle importa: las cabeceras de las entregas pueden estar cerradas y el detalle
-- abierto, y eso no se ve si se mira una tabla por vez.
--
-- Lo que se está buscando, en orden de gravedad:
--
--   *** SIN POLÍTICAS   con el RLS prendido y sin políticas, la tabla NO LA LEE NADIE. Ni un
--                       administrador. Es lo que dejó la segunda corrida de la 071, y es el peor
--                       estado posible porque no da error.
--
--   *** ABIERTA        la política dice "exists (select 1 from perfiles p where p.id = auth.uid()
--                       and p.activo)". Eso no menciona ninguna empresa: la cumple cualquier
--                       usuario activo, de cualquier empresa.
--
--   LISTO              la política llama a "puede_ver_trabajador" o a "puede_ver_entrega" y trae
--                       "with check".
--
-- ---------------------------------------------------------------------
-- POR QUÉ ESTO NO SE PUEDE PROBAR CON LA LLAVE ANÓNIMA
-- ---------------------------------------------------------------------
--
-- Porque con la llave anónima "auth.uid()" es null, y
-- "exists (select 1 from perfiles p where p.id = null …)" es falso. O sea que la llave anónima
-- devuelve CERO FILAS tanto si la política está como si no.
--
-- La prueba de datos tiene que ser con la sesión de un usuario de verdad, y eso se hace desde la
-- aplicación. Este diagnóstico dice si la política está puesta, que es otra cosa y también
-- necesaria.

-- ===================================================================
-- 1) EL VEREDICTO, UNA FILA POR TABLA
-- ===================================================================

select t.tabla,
       (select count(*) from pg_policies p
         where p.schemaname='public' and p.tablename = t.tabla) as cuantas,
       case
         when (select count(*) from pg_policies p
                where p.schemaname='public' and p.tablename = t.tabla) = 0
           then '*** SIN POLÍTICAS: no la lee nadie, ni un administrador ***'
         when (select count(*) from pg_policies p
                where p.schemaname='public' and p.tablename = t.tabla
                  and (p.qual like '%puede_ver_trabajador%'
                       or p.qual like '%puede_ver_entrega%')) = 0
           then '*** ABIERTA A CUALQUIER USUARIO ACTIVO ***'
         when (select count(*) from pg_policies p
                where p.schemaname='public' and p.tablename = t.tabla) > 1
           then '*** MÁS DE UNA: las políticas se suman con "o" ***'
         when exists (select 1 from pg_policies p
                       where p.schemaname='public' and p.tablename = t.tabla
                         and p.with_check is null)
           then '*** SIN "with check": se puede escribir en una empresa ajena ***'
         else 'LISTO'
       end as veredicto,
       (select bool_or(c.relrowsecurity) from pg_class c
         where c.relname = t.tabla) as rls_prendido
  from (values ('trabajadores'),
               ('asistencia'),
               ('marcajes'),
               ('tarjetas'),
               ('herramientas_asignaciones'),
               ('epp_entregas'),
               ('epp_entrega_items')) as t(tabla)
 order by t.tabla;

-- ===================================================================
-- 2) EL DETALLE, QUE VA SIEMPRE DESPUÉS DEL VEREDICTO
-- ===================================================================

select tablename,
       policyname,
       cmd,
       coalesce(qual, '(sin condición)')      as usando,
       coalesce(with_check, '(sin condición)') as al_escribir
  from pg_policies
 where schemaname='public'
   and tablename in ('herramientas_asignaciones','epp_entrega_items',
                     'epp_entregas','asistencia','marcajes','tarjetas')
 order by tablename, policyname;

-- Y el RLS prendido de las siete, que es lo que hace que todo esto sirva de algo.

select relname as tabla,
       relrowsecurity as rls_prendido,
       relforcerowsecurity as rls_forzado
  from pg_class
 where relname in ('trabajadores','asistencia','marcajes','tarjetas',
                   'herramientas_asignaciones','epp_entregas','epp_entrega_items')
 order by relname;

-- ===================================================================
-- 3) LA FUNCIÓN DEL SEGUNDO SALTO
-- ===================================================================

-- "puede_ver_entrega" es lo que hace que "epp_entrega_items" se pueda acotar: esa tabla no tiene
-- "code", hay que sacarlo de "epp_entregas".
--
-- Y se la prueba con null a propósito: si con null da ERROR en vez de false, la función se creó
-- mal y la política que la usa va a fallar en tiempo de consulta, que es cuando alguien la está
-- usando.

select case
  when not exists (select 1 from pg_proc p
                    join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname='public' and p.proname='puede_ver_entrega') then
    '*** NO EXISTE. Si la 072 se corrió a medias, "epp_entrega_items" tiene una política que llama a una función inexistente, y cada consulta a esa tabla falla. ***'
  when (select public.puede_ver_entrega(null, null)) then
    '*** CON NULL DA VERDADERO. La función tiene un agujero: sin usuario devolvería que sí. ***'
  else 'ok  la función existe y con null responde falso, que es lo correcto.'
end as veredicto_de_la_funcion;

-- Y qué dicen las dos funciones de un trabajador, con null de usuario. Las dos tienen que dar
-- falso: sin usuario no se ve nada.

select 'puede_ver_trabajador' as funcion,
       coalesce((select public.puede_ver_trabajador('cualquier', null))::text, '(null)') as con_usuario_null
union all
select 'puede_ver_entrega', coalesce((select public.puede_ver_entrega(null, null))::text, '(null)');

-- ===================================================================
-- LO QUE HAY QUE HACER CON CADA RESPUESTA
-- ===================================================================
--
-- Todas las filas "LISTO" y ningún "*** SIN POLÍTICAS": correr la 072 de nuevo, que es
-- RE-EJECUTABLE. Deja todo bien y no rompe nada de lo que ya estaba.
--
-- "SIN POLÍTICAS" en alguna: correr la 072 igual. El "do" del principio pasa porque las funciones
-- ya existen, los "drop" no encuentran nada que borrar, y los "create" crean las políticas.
--
-- "ABIERTA A CUALQUIER USUARIO ACTIVO": es el estado de HOY en "herramientas_asignaciones" y en
-- "epp_entrega_items", si la 072 todavía no se corrió. Después de correrla tienen que decir
-- "LISTO".
--
-- "MÁS DE UNA": hay una política vieja que sigue puesta, y las políticas se suman con "o". O sea
-- que la vieja sigue abriendo lo que la nueva cierra. Hay que borrarla a mano:
--
--     drop policy if exists "asignaciones rw" on public.herramientas_asignaciones;
--     drop policy if exists "epp items rw" on public.epp_entrega_items;
--
-- "SIN WITH CHECK": la política está puesta pero no controla la escritura. Se puede insertar una
-- fila en una empresa propia que después queda en la ajena, y esa fila es invisible para el que
-- la escribió. La 072 lo trae; si falta, la 072 se corrió a medias.
--
-- Y el detalle del punto 2 sirve para lo mismo a ojo: si "usando" trae
-- "exists (select 1 from perfiles p …)" sin mencionar "puede_ver_trabajador" ni
-- "puede_ver_entrega", es la VIEJA.