// ===================================================================
// PRUEBA-HORA-EXCEL-ZONA
// ===================================================================
// EL MISMO CÓDIGO, EN UNA ZONA HORARIA QUE SE LE PASA POR EL ENTORNO
//
// ---------------------------------------------------------------------
// Y POR QUÉ ES UN ARCHIVO APARTE
// ---------------------------------------------------------------------
//
// Porque "process.env.TZ" se lee UNA VEZ, cuando arranca el proceso de Node, y en
// Windows cambiarlo por dentro del programa no hace nada: la zona ya quedó fijada.
//
// La única forma de probar de verdad que la hora no depende de la máquina es
// correr el mismo código en procesos distintos, cada uno con su "TZ".
//
// Y NO ES LO MISMO QUE FIJAR LA ZONA A MANO DENTRO DEL CÓDIGO
//
// Se podría llamar a "process.env.TZ" antes de usar las fechas, pero en Windows no
// siempre alcanza, y además el código que estamos probando NO debe fijar la zona:
// tiene que dar lo mismo en la que le toque. Fijarla en la prueba taparía el
// problema en vez de medirlo.

const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..');
const zona = process.argv[2] || 'America/Santiago';

const src = fs.readFileSync(path.join(RAIZ, 'views/administracion/documentos.js'), 'utf8');
const i = src.indexOf('function horaDesdeValor(');
const j = src.indexOf('// Busca un encabezado sin importar tildes');
if (i < 0 || j < 0) {
  console.log('*** no se encontró horaDesdeValor');
  process.exit(1);
}
const horaDesdeValor = new Function(src.slice(i, j) + '\nreturn horaDesdeValor;')();

// Y LOS MISMOS DOS VALORES DEL ARCHIVO REAL: el número y el Date de SheetJS
const frac = 0.31883101851851853;
const comoDate = new Date(Date.UTC(1899, 11, 30) + Math.round(frac * 86400000));

process.stdout.write(JSON.stringify({
  zona: zona,
  offset: new Date().getTimezoneOffset(),
  conNumero: horaDesdeValor(frac, '2026-10-08'),
  conDate: horaDesdeValor(comoDate, '2026-10-08'),
}) + '\n');