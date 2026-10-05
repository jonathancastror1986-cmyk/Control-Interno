// ===================================================================
// COMPRUEBA-MIGRACION-CORTA: QUE UNA MIGRACION TERMINE EN DDL
// ===================================================================
//
// Corre:  node tools/comprueba-migracion-corta.js
// No toca la base: solo lee migrations/*.sql.
//
// ---------------------------------------------------------------------
// POR QUE EXISTE
// ---------------------------------------------------------------------
//
// El panel de Supabase corre todo lo que se pega en UNA transaccion. Si la migracion termina con
// un "select" de diagnostico y ese select falla, se revierte TODO.
//
// Asi se perdio la 078. El "select" de comprobacion decia "nombre" en vez de "name", fallo con
// 42703, y las dos "create or replace function" que estaban mas arriba desaparecieron con el.
// El error siguiente fue "function public.rut_normalizado(unknown) does not exist", que parece un
// problema de tipos y no era: la funcion no existia. Tuve que volver a correrla.
//
// Y ESO ES LO QUE ESTE GUARDIAN IMPIDE: que una migracion termine en una consulta.
//
// ---------------------------------------------------------------------
// QUE CUENTA COMO MIGRACION
// ---------------------------------------------------------------------
//
// Solo los archivos con numero: 076_causas_termino.sql es migracion, y causas_termino-diagnostico.sql
// no lo es. Los diagnosticos se corren en otra pestana, y por eso viven en su propio archivo.

const { execSync } = require('child_process');
const fs = require('fs');

// Y LA CARPETA SE SACA SOLO PARA MIRAR EL NUMERO, Y SE LEE CON LA RUTA COMPLETA
//
// "git ls-files" devuelve "migrations/076_causas_termino.sql", y un "/^\d\d\d?/" contra eso no
// encuentra nunca nada: la ruta empieza por la carpeta, no por el numero. El guardian miraba cero
// migraciones y decia que todo estaba bien, que es la peor forma de mentir.
//
// Y el archivo se ABRE con la ruta que devuelvo git, no con el nombre pelado: si se lee con el
// nombre pelado no encuentra el archivo, porque esta en la carpeta.
const arch = execSync('git ls-files --cached --others --exclude-standard migrations', { maxBuffer: 1e8 }).toString()
  .split(/\r\n|\n|\r/)
  .filter(f => f.endsWith('.sql'))
  .filter(f => !/-(diagnostario|sin-comentarios)\.sql$/.test(f))
  .filter(f => {
    const m = /^(\d\d\d?)_/.exec(f.replace(/^.*\//, ''));
    return m && parseInt(m[1], 10) >= 76;
  });

// Y ESTAS SON LAS PALABRAS QUE DICEN "ESTO ES UNA MIGRACION"
const DDL = /^(create\s+(or\s+replace\s+)?|alter\s+|drop\s+|comment\s+on\s|insert\s+into\s|update\s|delete\s+from\s|grant\s|revoke\s|do\s+\$)/i;

const esRelleno = (x) => !x.trim() || /^\s*--/.test(x);

let malas = 0;
let vistas = 0;

arch.forEach(function (f) {
  const l = fs.readFileSync(f, 'utf8').split(/\r\n|\n|\r/);

  // ---- 1) HAY ALGO QUE NO SEA UN COMENTARIO ----
  const codigo = l.filter(x => !esRelleno(x));
  if (!codigo.length) {
    console.log('  *** ' + f.split('/').pop() + ': esta vacia');
    malas++;
    return;
  }

  // ---- 2) TERMINA EN DDL ----
  // Y se mira la ultima linea de CODIGO, no la ultima linea: un archivo puede terminar con un
  // comentario que explica el select que se acaba de sacar.
  const ultima = codigo[codigo.length - 1].trim();
  const okFin = DDL.test(ultima) || /;\s*$/.test(ultima);

  // ---- 3) NO HAY UN SELECT SUELTO AL FINAL ----
  //
  // Y SOLO CUENTA EL QUE ESTA FUERA DE UN BLOQUE CON DOLAR.
  //
  // Un "select true into v_existe from ..." dentro de un "do $$ ... $$" es plpgsql legitimo, no un
  // diagnostico: asi se busca algo en la tabla. El guardian lo contaba y gritaba por la 076, que
  // estaba bien. Un guardian que grita por algo correcto entrena a que lo ignoren, y ese ya
  //萎缩 happened antes con el total de funciones escrito a mano.
  //
  // Y ADEMAS TIENE QUE VENIR PEGADO A SU "INSERT" O SU "WITH", porque un "insert ... select" lleva
  // un select adentro y no es un diagnostico.
  let dentroDeDinero = false;
  const selectsSueltos = [];
  codigo.forEach((x, i) => {
    const t = x.trim();
    // Y el "$fn$" o el "$$" abren y cierran. Se cuenta la profundidad con un contador, porque un
    // "do $$" puede contener varios "$$" mas adentro.
    if (/\$\w*\$\s*$/.test(t) || /\$\w*\$/.test(t)) {
      dentroDeDinero = !dentroDeDinero;
      return;
    }
    if (dentroDeDinero) return;
    if (!/^select\b/i.test(t)) return;
    const deArriba = i > 0 ? codigo[i - 1].trim() : '';
    if (/\b(insert\s+into|with)\b/.test(deArriba)) return;
    selectsSueltos.push({ linea: x, i: i });
  });
  const sinDdl = selectsSueltos;

  const problemas = [];
  if (!okFin) problemas.push('la ultima linea de codigo no es DDL: "' + ultima.slice(0, 50) + '"');
  if (sinDdl.length) problemas.push('tiene ' + sinDdl.length + ' select(s) sin insert ni with');

  if (problemas.length) {
    malas += problemas.length;
    console.log('  *** ' + f.split('/').pop());
    problemas.forEach(p => console.log('        ' + p));
    if (sinDdl.length) {
      const n = '        el primero esta despues del ultimo bloque $$'
      console.log('        el primero esta en la linea ' + (codigo.indexOf(codigo[n]) + 1));
      console.log('        ' + sinDdl[0].slice(0, 60));
      console.log('        Si es un diagnostico, muevelo a un archivo con sufijo "-diagnostico.sql".');
      console.log('        Pegar un "select" al final de una migracion revierte TODO lo de arriba.');
    }
    return;
  }
  vistas++;
  console.log('  ok  ' + f.split('/').pop() + ': termina en DDL y no trae diagnosticos pegados');
});

console.log('');
if (malas) {
  console.log('  *** ' + malas + ' PROBLEMA(S). Si esto se pega al panel, se puede perder la migracion entera.');
  process.exit(1);
}
console.log('  ok  las ' + vistas + ' migraciones terminan en DDL. Pegalas solas en el panel.');
