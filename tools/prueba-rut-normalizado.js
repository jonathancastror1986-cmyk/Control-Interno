// PRUEBA DEL NORMALIZADOR DE RUT  Y POR QUE ESTA EN EL REPO  -------------------------------------------------  Porque la 078 trae la misma logica en SQL y en JavaScript, y las dos tienen que decir lo mismo. La primera version de las dos quitaba el guion al limpiar, y por eso los once RUT con K del archivo no cruzaban con nadie: sin error y sin aviso. Esta prueba es la que lo agarro ANTES de que el usuario pegara la migracion, y la unica forma de que siga agarrandolo es que siga en el repo.
function digito(cuerpo) {
  if (!/^[0-9]+$/.test(cuerpo)) return null;
  let suma = 0, peso = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * peso;
    peso++;
    if ( peso > 7) peso = 2;
  }
  let d = 11 - (suma % 11);
  if (d === 11) d = 0;
  if (d === 10) return 'K';
  return String(d);
}

// ---- Y EL ARREGLO: EL GUION SE CONSERVA ----
//
// La version anterior quitaba TODO lo que no fuera alfanumerico, y eso se llevaba
// el guion. Con el guion borrado, "11285312-K" quedaba "11285312K", no habia forma
// de separar el cuerpo del digito, y el RUT volvia nulo. Esos son los 11 RUTs "chicos"
// del archivo, y ninguno habria cruzado con su ficha.
function normaliza(rut) {
  const s = String(rut == null ? '' : rut).toUpperCase().replace(/[^0-9A-Z-]/g, '');
  if (!s) return null;
  let cuerpo, dv = null;
  const p = s.indexOf('-');
  if (p > 0) {
    cuerpo = s.slice(0, p);
    dv = s.slice(p + 1);
  } else {
    // Y SIN GUION: el cuerpo son los digitos del principio, y una K pegada al final
    // es el digito, no parte del cuerpo.
    const m = /^(\d+)(K)?$/.exec(s);
    if (!m) return null;
    cuerpo = m[1];
    if (m[2]) dv = 'K';
  }
  if (!/^[0-9]+$/.test(cuerpo)) return null;
  return cuerpo + '-' + (dv === 'K' ? 'K' : (/^[0-9]$/.test(dv) ? dv : digito(cuerpo)));
}

// ---- LAS CUATRO FORMAS DE ESCRIBIR UN RUT CON K ----
const FORMAS = [
  ['11.285.312-K', '11285312-K'],
  ['11285312-K',   '11285312-K'],
  ['11285312k',    '11285312-K'],
  [' 11285312-K ', '11285312-K'],
  ['11.285.312-K ', '11285312-K'],
  ['11285312',     '11285312-K'],
];
// Y UNO CON DIGITO NUMERICO, PARA VER QUE NO SE TOCA
const CON_NUMERO = [
  ['13.467.772-4', '13467772-4'],
  ['13467772',     '13467772-4'],
];

console.log('=== 1) LAS FORMAS DEL MISMO RUT CON K ===');
let malas = 0;
FORMAS.forEach(function (f) {
  const r = normaliza(f[0]);
  const ok = r === f[1];
  if (!ok) malas++;
  console.log('  ' + (ok ? 'ok  ' : '*** ') + JSON.stringify(f[0]).padEnd(16) + ' -> ' + r);
});

console.log('');
console.log('=== 2) Y UNO CON DIGITO NUMERICO, QUE NO DEBE CAMBIAR ===');
CON_NUMERO.forEach(function (f) {
  const r = normaliza(f[0]);
  const ok = r === f[1];
  if (!ok) malas++;
  console.log('  ' + (ok ? 'ok  ' : '*** ') + JSON.stringify(f[0]).padEnd(16) + ' -> ' + r);
});

console.log('');
console.log('=== 3) LOS RUTS REALES DEL ARCHIVO ===');
// Y SOLO RUTS QUE ESTAN EN EL ARCHIVO, NO INVENTADOS: un RUT inventado con el
// digito equivocado hace fallar la prueba y uno cree que el algoritmo esta malo.
const RUTS = ['13467772-4','11285312-K','10265616-4','18974484-6','11852957-K','16850377-6',
              '16419496-5','12393023-1','8634743-1','16700183-1','16723819-K','18606064-4',
              '19219354-0','18087661-8','22146418-4'];
RUTS.forEach(function (r) {
  const n = normaliza(r);
  const pos = r.indexOf('-');
  const calc = digito(r.replace(/-.*/, ''));
  const ok = n === r;   // el archivo ya viene en la forma normalizada
  if (!ok) malas++;
  console.log('  ' + (ok ? 'ok  ' : '*** ') + r.padEnd(15) + ' calc=' + String(calc).padEnd(8) + ' -> ' + n);
});

console.log('');
console.log('=== 4) LOS TRES FINALES DEL MODULO 11 ===');
const vistos = {};
for (let c = 0; c < 60000; c++) {
  const cuerpo = String(1000000 + c);
  const d = digito(cuerpo);
  if (!vistos[d]) vistos[d] = cuerpo + ' -> ' + cuerpo + '-' + d;
}
['0','9','K'].forEach(function (k) {
  const ok = !!vistos[k];
  if (!ok) malas++;
  console.log('  ' + (ok ? 'ok  ' : '*** ') + 'final ' + k + ': ' + (vistos[k] || 'NO SE ENCONTRO'));
});

console.log('');
console.log('=== 5) LO QUE NO DEBE CRUZAR CON NINGUNO ===');
[['abc', 'letras'], ['', 'vacio'], [null, 'nulo'], ['-K', 'solo digito'],
 ['K', 'solo letra'], ['12345678-', 'cuerpo sin digito']].forEach(function (c) {
  const r = normaliza(c[0]);
  const ok = r === null || (c[0] === '12345678-' && /^12345678-\d$/.test(String(r)));
  if (!ok) malas++;
  console.log('  ' + (ok ? 'ok  ' : '*** ') + JSON.stringify(c[0]).padEnd(14) + ' -> ' + r + '   (' + c[1] + ')');
});

console.log('');
if (malas) { console.log('  *** ' + malas + ' FALLA(N). NO SE APLICA.'); process.exit(1); }
console.log('  ok  el algoritmo sirve: los K del archivo SI cruzan.');
