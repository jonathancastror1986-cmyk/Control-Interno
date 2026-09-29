-- ===================================================================
-- 039 - QUE EL ROL "reloj" EXISTA Y SE PUEDA ASIGNAR
-- ===================================================================
--
-- QUE PASÓ
-- --------
-- La migración 033 (kiosco) inserta el rol "reloj" en el catálogo:
--
--   insert into roles_sistema (rol, nombre, descripcion, orden)
--   values ('reloj', 'Reloj', 'Solo marca...', 9);
--
-- Y en la base ese rol NO está. Pero las funciones de la 033 sí están:
-- generar_pin_reloj y verificar_pin_reloj aparecen como "BIEN" en el
-- diagnóstico.
--
-- O sea que la 033 se aplicó, pero la parte del catálogo de roles no.
-- Casi siempre pasa lo mismo: la migración se pega en el editor de
-- Supabase por trozos, y el trozo con los roles se queda sin correr, o
-- se corrió antes de que existiera la tabla.
--
-- POR QUÉ IMPORTA, Y MÁS DE LO QUE PARECE
-- ---------------------------------------
-- El rol reloj es lo que permite tener la cuenta del aparato. Sin la
-- fila en el catálogo, no se puede crear esa cuenta en Administración, y
-- el reloj no tiene con quién marcar.
--
-- Y hay un segundo problema más difícil de ver: la 037 mete "reloj" en
-- roles_validos_array(), que es lo que permite ASIGNAR el rol. Eso sí
-- está. Pero sin la fila, la 037 no habría podido correr bien, y el
-- resultado es un estado a medias que el diagnóstico no sabía marcar.
--
-- ESTA MIGRACIÓN ES IDEMPOTENTE
-- -----------------------------
-- Se puede correr las veces que haga falta. Cada insercion lleva su
-- "on conflict", y cada actualizacion repite los mismos valores. No
-- rompe nada que ya este bien, y deja bien lo que este mal.
--
--
-- LO QUE NO SE HACE
-- -----------------
-- No se agrega ningun permiso nuevo. El permiso "relojes.marcaje" ya
-- existe: sale como "BIEN" en el diagnóstico. Y la 033 se encargo de
-- quitarle al rol reloj los permisos que no debe tener, para que un reloj
-- no vea fichas ni planillas. Eso se vuelve a hacer igual, porque si
-- alguien le dio permisos a mano, hay que volver a quitarlos.

-- ------------------------------------------------------------------
-- 1) LA FILA DEL ROL EN EL CATÁLOGO
-- ------------------------------------------------------------------
-- Se hace con un select del valor anterior, y no con "on conflict do
-- nothing", porque si la fila existe pero quedo a medio camino (con el
-- nombre vacio, por ejemplo), "do nothing" la deja como esta. Con el
-- select, siempre queda con los valores correctos.
insert into public.roles_sistema (rol, nombre, descripcion, orden)
values ('reloj', 'Reloj', 'Solo marca. No ve fichas, ni planillas, ni reportes', 9)
on conflict (rol) do update
   set nombre      = excluded.nombre,
       descripcion = excluded.descripcion,
       orden       = excluded.orden;

comment on column public.roles_sistema.rol is
  'Identificador del rol. El rol reloj existe para que el aparato tenga una cuenta propia: una cuenta de persona marcaria por el trabajador equivocado.';

-- ------------------------------------------------------------------
-- 2) QUE SE PUEDA ASIGNAR
-- ------------------------------------------------------------------
-- roles_validos_array() es lo que decide qué roles puede tener alguien.
-- Si "reloj" no está en la lista, la columna perfiles.rol la rechaza con
-- un error 23514, y la cuenta no se puede crear.
--
-- Se vuelve a aplicar la 037 por si quedó a medias. Es idempotente: si
-- ya estaba, no cambia nada.
create or replace function public.roles_validos_array()
returns text[]
language sql
stable
as $$
  select array[
    'admin','sistema','soporte','tecnica','porteria',
    'supervisores','rrhh','prevencion','asistente_social',
    'bodega','contratacion','reloj'
  ];
$$;

comment on function public.roles_validos_array() is
  'Los roles que puede tener un perfil. El reloj va en la lista: es el unico rol que no es una persona, es un aparato, y por eso no puede entrar por el formulario normal.';

-- ------------------------------------------------------------------
-- 3) EL PERMISO QUE NECESITA, Y SOLO ESE
-- ------------------------------------------------------------------
-- El permiso se asegura primero, porque roles_permisos tiene llave
-- foránea contra permisos: si el permiso no existe, el insert del rol
-- falla.
insert into public.permisos (clave, descripcion, categoria, orden)
values ('relojes.marcaje', 'Registrar marcajes desde la pantalla del reloj', 'relojes', 4)
on conflict (clave) do update
   set descripcion = excluded.descripcion,
       categoria  = excluded.categoria;

insert into public.roles_permisos (rol, permiso)
values ('reloj', 'relojes.marcaje')
on conflict do nothing;

-- ------------------------------------------------------------------
-- 4) Y QUE NO TENGA LOS PERMISOS QUE NO DEBE
-- ------------------------------------------------------------------
-- Un reloj no necesita ver fichas, ni planillas, ni reportes, ni
-- administrar usuarios. Si el rol quedó con alguno de esos, cualquiera
-- que este en la portería con el aparato puede abrir la lista completa
-- de los trabajadores de la obra.
--
-- Se borran en cada corrida. Es lo que hace la 033, y se repite acá
-- para que un permiso dado a mano se vuelva a quitar.
delete from public.roles_permisos
 where rol = 'reloj'
   and permiso in (
     'tarja.ver','tarja.editar','tarja.marcaje','tarja.excel','tarja.exportar',
     'tarja.justificar','asistencia.auditar',
     'trabajadores.ver','trabajadores.editar','trabajadores.tarjeta',
     'sistema.usuarios','sistema.permisos','sistema.empresa',
     'porteria.ver','contratacion.ver','contratacion.editar','contratacion.firmar'
   );

-- ------------------------------------------------------------------
-- 5) DIAGNÓSTICO
-- ------------------------------------------------------------------
-- Dice las tres cosas por separado, porque fallan por motivos distintos:
-- que el rol esté en el catálogo, que se pueda asignar, y que tenga el
-- permiso de marcar.
--
create or replace function public.diagnostico_rol_reloj()
returns table (
  problema text,
  detalle  text
)
language sql
stable
as $$
  select 'falta la fila del rol en el catálogo',
         'La migración 033 no dejó la fila. Sin esto no se puede crear la cuenta del reloj.'
  where not exists (select 1 from public.roles_sistema where rol = 'reloj')

  union all

  select 'el rol existe pero no se puede asignar',
         'Está en el catálogo pero no en roles_validos_array(). Apliqué la 037 o la 039.'
  where exists (select 1 from public.roles_sistema where rol = 'reloj')
    and not ('reloj' = any (public.roles_validos_array()))

  union all

  select 'el rol no tiene el permiso de marcar',
         'Se puede crear la cuenta, pero el reloj no puede registrar nada.'
  where exists (select 1 from public.roles_sistema where rol = 'reloj')
    and not exists (
      select 1 from public.roles_permisos rp
       where rp.rol = 'reloj' and rp.permiso = 'relojes.marcaje'
    )

  union all

  select 'el rol tiene permisos que no le tocan',
         'Un reloj puede ver fichas o planillas. Mirá cuáles sobran en roles_permisos.'
  where exists (
    select 1 from public.roles_permisos rp
     where rp.rol = 'reloj'
       and rp.permiso in (
         'tarja.ver','trabajadores.ver','sistema.usuarios','porteria.ver',
         'contratacion.ver','asistencia.auditar'
       )
  );
$$;

comment on function public.diagnostico_rol_reloj() is
  'Las tres cosas que tienen que estar para que el reloj pueda marcar, por separado. Si no devuelve filas, las tres están bien.';

-- ------------------------------------------------------------------
-- LO QUE QUEDABA ANTES, PARA VOLVER ATRÁS
-- ------------------------------------------------------------------
-- Para deshacer SOLO lo de esta migración:
--
--   delete from public.roles_permisos where rol = 'reloj';
--   delete from public.roles_sistema   where rol = 'reloj';
--
-- Y volver la 037: volver a correr 037_rol_reloj_asignable.sql, que
-- quita "reloj" de roles_validos_array().
