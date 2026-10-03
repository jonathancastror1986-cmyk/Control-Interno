// EL FILTRO DE LAS ESPECIALIDADES, CON LA LECCIÓN DEL DAÑO ANTERIOR DENTRO
// ============================================================================
//
const fs = require('fs');
const path = require('path');

const RAIZ = 'C:/Users/mrj0t/Desktop/Proyectos Informaticos/Proyectos/control-asistencia-web/';

// ===================================================================
// EL ARCHIVO, QUE SE PARTE EN DOS Y SE COMPRUEBA A SÍ MISMO
// ===================================================================
//
// Y la clase no es por gusto. Es por el daño de la vez pasada.
//
// Un archivo con finales de línea mezclados —"tarjeta.css" tiene 53 con CR y 232 sin él— no se
// puede partir en "contenido" y "finales" sin una regla, porque si se parte mal y se vuelve a
// armar con un separador único, el archivo entero cambia de estilo y aparecen los "\r\r\n".
//
// Y la forma segura es: partir en dos arreglos DEL MISMO TAMAÑO, y que CADA operación que
// cambia uno cambie el otro. Y que la operación se compruebe.
//
// -------------------------------------------------------------------
// Y POR QUÉ SE COMPRUEBA, Y POR QUÉ DENTRO
// ------------------------------------------
//
// Porque el guion de la vez pasada insertó seis renglones en el arreglo del texto y ninguno en
// el de los finales. A partir de ahí quedaron desalineados, y el "armar" final concatenó
// "undefined" donde iban los saltos de línea: ochenta y dos veces, y la mitad del archivo.
//
// Y no lo agarró nadie, porque:
//   · el guion no se comprobaba a sí mismo
//   · "node --check" no se corría sobre el archivo que se estaba tocando
//   · y el archivo se ESCRIBÍA igual, sin error
//
// Entonces: la comprobación va DENTRO de cada operación, y si algo queda desalineado el guion
// se para antes de escribir. Un archivo a medias es peor que un archivo sin cambio.
class Archivo {
  constructor(ruta) {
    this.ruta = ruta;
    this.antes = fs.readFileSync(ruta);
    this.cr = /\r\n/.test(this.antes.toString('utf8'));
    this.nl = this.cr ? '\r\n' : '\n';

    const partes = this.antes.toString('utf8').split(/(\r\n|\n)/);
    this.lineas = [];
    this.fines = [];
    for (let i = 0; i < partes.length; i += 2) {
      this.lineas.push(partes[i]);
      this.fines.push(partes[i + 1] === undefined ? '' : partes[i + 1]);
    }

    // ---------------------------------------------------------------------
    // Y QUÉ RENGLONES SON DEL ARCHIVO, PARA PODER DECIR QUE UNO CAMBIÓ DE ESTILO
    // ---------------------------------------------------------------------
    //
    // Y esto es lo que faltaba, y la razón por la que el estilo DEL ARCHIVO no alcanza.
    //
    // El proyecto tiene archivos MEZCLADOS de verdad: "administracion.js" tiene 1.992 renglones
    // de CRLF y 6 de LF, y "documentos.js" tiene 2.260 de CRLF y 1 de LF. Esos renglones de LF
    // están así porque algo se movió de un archivo a otro, y no son un defecto.
    //
    // Con una regla de estado —"si el archivo es de CRLF, todo renglón menos el último tiene que
    // terminar en CRLF"— esos dos archivos quedan rechazados para siempre, y no se pueden editar
    // más. O sea que la regla parecía más estricta y protegía menos.
    //
    // Lo que sí se puede decir es: "un renglón que YA ERA del archivo no puede cambiar de estilo".
    // Para eso hay que saber cuáles renglones son nuevos, y eso se lleva con un arreglo al
    // lado, que se mueve con cada cambio como se mueven los otros dos.
    //
    // Y el conjunto de estilos es el que se vio AL ABRIR. Un final que no estaba en ese conjunto
    // es un final nuevo, y es exactamente lo que hay que rechazar.
    this.propio = this.lineas.map(function () { return true; });
    this.estilos = new Set(this.fines);

    this.verifica('después de partir');
  }

  // -----------------------------------------------------------------
  // LA COMPROBACIÓN, QUE ESTÁ EN UN SOLO LUGAR
  // -----------------------------------------------------------------
  //
  // Y hace TRES cosas, que antes eran una sola y mal:
  //
  //   1. Que los tres arreglos midan lo mismo.
  //   2. Que NINGÚN RENGLÓN DEL MEDIO quede sin final. Un renglón sin final en el medio del
  //      archivo es un renglón pegado al siguiente, y no se ve en ningún editor.
  //   3. Que NINGÚN RENGLÓN que ya era del archivo haya cambiado de estilo.
  //
  // Y las dos últimas estaban escritas como reglas de ESTADO —"cuántos renglones no son de
  // CRLF", "el archivo es de CRLF"— y por lo mismo rechazaban once archivos del proyecto que son
  // mezclados de verdad, para siempre. Ver [orden-04].
  verifica(cuando) {
    if (this.lineas.length !== this.fines.length
      || this.lineas.length !== this.propio.length) {
      console.log('');
      console.log('  *** DESALINEADO ' + cuando + ': ' + this.lineas.length
        + ' renglones, ' + this.fines.length + ' finales y ' + this.propio.length
        + ' marcas ***');
      console.log('    NO SE ESCRIBE NADA. Se restauró desde git:');
      console.log('        git checkout -- ' + path.basename(this.ruta));
      process.exit(1);
    }

    // ---------------------------------------------------------------------
    // 2) NINGÚN RENGLÓN DEL MEDIO SIN FINAL
    // ---------------------------------------------------------------------
    //
    // Y lo que importa no es QUÉ estilo tiene el final, es que el final EXISTA. La regla vieja
    // —"en un archivo de CRLF, más de un renglón sin final CRLF es un error"— contaba como
    // "sin final" un renglón que termina en "\n" a secas, que no está pegado a nada. Y en un
    // archivo mezclado esos hay varios, y son correctos.
    //
    // El último renglón sí puede no tener final: es el que no le sigue nada.
    for (let i = 0; i < this.fines.length - 1; i++) {
      if (this.fines[i] !== '\r\n' && this.fines[i] !== '\n') {
        console.log('');
        console.log('  *** EL RENGLÓN ' + (i + 1) + ' NO TIENE FINAL DE LÍNEA ***');
        console.log('    en el medio del archivo eso lo pega con el siguiente. NO SE ESCRIBE NADA.');
        console.log('    (el último renglón sí puede no tenerlo: no le sigue nada)');
        process.exit(1);
      }
    }

    // ---------------------------------------------------------------------
    // 3) NINGÚN RENGLÓN QUE YA ERA DEL ARCHIVO CAMBIÓ DE ESTILO
    // ---------------------------------------------------------------------
    //
    // Medido con "tools/prueba-archivo-seguro.js": en un archivo de CRLF se insertó un renglón
    // —que gana un CRLF— y se convirtió otro a LF —que pierde uno—. El total queda igual, el
    // conteo no baja, y el defecto pasaba. El conteo neto lo disimula, porque una conversión y
    // una inserción se compensan.
    //
    // Y por eso esto no cuenta: sigue a cada renglón. Uno que ya era del archivo no puede
    // terminar de una forma que no terminaba antes. Y los renglones nuevos sí pueden, que es
    // lo que deja mover un bloque de un archivo a otro.
    for (let i = 0; i < this.fines.length; i++) {
      if (this.propio[i] && !this.estilos.has(this.fines[i])) {
        console.log('');
        console.log('  *** EL RENGLÓN ' + (i + 1) + ' CAMBIÓ DE ESTILO ***');
        console.log('    ya era del archivo, y ahora termina en '
          + JSON.stringify(this.fines[i]) + '. NO SE ESCRIBE NADA.');
        console.log('    los finales que tenía el archivo al abrirlo: '
          + Array.from(this.estilos).map(function (x) { return JSON.stringify(x); }).join(', '));
        process.exit(1);
      }
    }
  }

  indice(que) {
    const i = this.lineas.findIndex((x) => x.indexOf(que) >= 0);
    if (i < 0) {
      console.log('');
      console.log('  *** NO SE ENCONTRÓ: ' + que + ' ***');
      console.log('    NO SE ESCRIBE NADA.');
      process.exit(1);
    }
    return i;
  }

  // Y reemplaza un renglón entero, y solo uno.
  //
  // Y "reemplazaVarios" es el primo que SÍ acepta varios renglones. Existe porque la otra
  // forma —"reemplaza(i, texto.join('\n'))"— mete N renglones dentro de UN elemento del
  // arreglo.
  //
  // Y el arreglo sigue midiendo lo mismo, así que la comprobación de tamaño no lo ve. Pero al
  // armar el archivo salen N renglones con "\n" adentro, en un archivo que es de CRLF: el
  // resultado son N renglones que pasaron a ser solo-LF, y la comprobación de finales de línea
  // lo dice con un número exacto —"0 -> 17"— que es el tamaño del bloque.
  //
  // O sea que el síntoma apuntaba justo al tamaño de lo que se había metido mal. Y eso es lo
  // que hay que mirar primero cuando un número sale raro: ¿coincide con algo que sé que puse?
  reemplaza(i, texto) {
    if (typeof i !== 'number' || i < 0 || i >= this.lineas.length) {
      console.log('  *** ÍNDICE FUERA DE RANGO: ' + i + ' ***');
      process.exit(1);
    }
    this.lineas[i] = texto;
    this.verifica('después de reemplazar L' + (i + 1));
  }

  // Y el primo: un renglón por N renglones, cada uno con su final.
  //
  // Y NO acepta un texto con "\n" adentro, y avisa si se lo pasan. Porque eso es exactamente
  // el error, y es mejor quejarlo en el momento que descubrirlo cuatro pasos después.
  reemplazaVarios(i, renglones) {
    if (typeof i !== 'number' || i < 0 || i >= this.lineas.length) {
      console.log('  *** ÍNDICE FUERA DE RANGO: ' + i + ' ***');
      process.exit(1);
    }
    renglones.forEach(function (x, k) {
      if (typeof x !== 'string') {
        console.log('  *** EL RENGLÓN ' + (k + 1) + ' NO ES TEXTO ***');
        process.exit(1);
      }
      if (x.indexOf('\n') >= 0) {
        console.log('  *** EL RENGLÓN ' + (k + 1) + ' TRAE UN "\\n" ADENTRO ***');
        console.log('      ' + JSON.stringify(x.slice(0, 60)));
        console.log('    Un renglón del arreglo es UN renglón del archivo. Para varios,');
        console.log('    pásalos como arreglo: "reemplazaVarios(i, [a, b, c])".');
        process.exit(1);
      }
    });

    const fin = this.fines[i] || this.fines[i - 1] || this.nl;
    this.lineas.splice(i, 1, ...renglones);
    this.fines.splice(i, 1, ...renglones.map(function () { return fin; }));
    // Y los renglones que entran son NUEVOS: no tienen por qué heredar el estilo del que
    // reemplazan. Y es lo que deja cambiar el estilo en las líneas de abajo, que es justo lo que
    // se quiere cuando se mueve un bloque de un archivo a otro.
    this.propio.splice(i, 1, ...renglones.map(function () { return false; }));
    this.verifica('después de reemplazar L' + (i + 1) + ' con ' + renglones.length);
  }

  // Y QUITA UN RANGO, Y DESPUÉS DE ESO LOS ÍNDICES DE ARRIBA CAMBIARON
  // ----------------------------------------------------------------------------
  //
  // Y esto está aparte de "quita" porque es una trampa que ya pasó: si se quitan N
  // renglones del medio, TODO lo que estaba más abajo cambia de número, y un guion que se
  // guardó los índices del principio se los aplica al archivo ya movido.
  //
  // Y la solución de este caso es la que hay que tener en la cabeza: después de un cambio que
  // mueve el archivo, se vuelve a MEDIR. Un índice guardado es una apuesta; un índice medido
  // después del cambio es una medición.
  quitaRango(desde, hasta) {
    if (desde < 0 || hasta >= this.lineas.length || hasta < desde) {
      console.log('  *** RANGO MAL: L' + (desde + 1) + ' a L' + (hasta + 1) + ' ***');
      process.exit(1);
    }
    const n = hasta - desde + 1;
    this.lineas.splice(desde, n);
    this.fines.splice(desde, n);
    this.propio.splice(desde, n);
    this.verifica('después de quitar L' + (desde + 1) + ' a L' + (hasta + 1));
    return n;
  }

  // Y REEMPLAZA UN RANGO ENTERO POR N RENGLONES. Que es lo que hacía falta y no existía.
  //
  // "reemplazaVarios(i, [a, b, c])" reemplaza UN renglón —el de la posición "i"— por tres. El
  // guion que envolvía los comentarios en HTML la usó así, sobre un bloque de SIETE renglones, y
  // por lo metió SIETE arriba sin quitar los SIETE de abajo. El bloque quedó duplicado, el
  // archivo tenía 63 "<!--" contra 60 "-->", y el comentario del "fflate" volvió a quedar
  // abierto, que era el defecto de partida.
  //
  // O sea que el nombre de la función prometía una cosa y hacía otra, y el nombre es lo primero
  // que se lee. Por eso está esta: el rango se dice explícito, y el rango se quita entero.
  reemplazaRango(desde, hasta, renglones) {
    if (desde < 0 || hasta >= this.lineas.length || hasta < desde) {
      console.log('  *** RANGO MAL: L' + (desde + 1) + ' a L' + (hasta + 1) + ' ***');
      process.exit(1);
    }
    renglones.forEach(function (x, k) {
      if (typeof x !== 'string' || x.indexOf('\n') >= 0) {
        console.log('  *** EL RENGLÓN ' + (k + 1) + ' NO ES UN RENGLÓN ***');
        console.log('    Un renglón del arreglo es UN renglón del archivo, sin "\\n" adentro.');
        process.exit(1);
      }
    });

    const n = hasta - desde + 1;
    const fin = this.fines[desde] || this.fines[desde - 1] || this.nl;

    this.lineas.splice(desde, n, ...renglones);
    this.fines.splice(desde, n, ...renglones.map(function () { return fin; }));
    this.propio.splice(desde, n, ...renglones.map(function () { return false; }));
    this.verifica('después de reemplazar L' + (desde + 1) + ' a L' + (hasta + 1)
      + ' con ' + renglones.length);
  }

  // Y INSERTA, Y LOS DOS ARREGLOS JUNTOS. Esa es toda la lección.
  inserta(i, renglones) {
    // Y el final que se usa es el del renglón donde se inserta. Si se inserta al final del
    // archivo, se usa el del último renglón, que sí tiene final.
    const fin = i < this.fines.length ? this.fines[i]
      : (this.fines.length ? this.fines[this.fines.length - 1] : this.nl);
    this.lineas.splice(i, 0, ...renglones);
    this.fines.splice(i, 0, ...renglones.map(function () { return fin; }));
    // Y los renglones insertados son NUEVOS, así que su final no se compara con nada: heredan el
    // de donde se insertaron, y con eso basta.
    this.propio.splice(i, 0, ...renglones.map(function () { return false; }));
    this.verifica('después de insertar en L' + (i + 1));
  }

  quita(i) {
    if (i < 0 || i >= this.lineas.length) {
      console.log('  *** ÍNDICE FUERA DE RANGO: ' + i + ' ***');
      process.exit(1);
    }
    this.lineas.splice(i, 1);
    this.fines.splice(i, 1);
    this.propio.splice(i, 1);
    this.verifica('después de quitar L' + (i + 1));
  }

  // Y el cuerpo de una función, medido por profundidad de llaves. Y con el largo ORIGINAL
  // guardado, porque si se cambia el bloque y después se calcula el corte con el largo nuevo,
  // el corte se pasa y se come la función que sigue. Ya pasó dos veces.
  cuerpoDe(nombre) {
    const i = this.indice('function ' + nombre);
    let nivel = 0;
    let empezada = false;
    for (let k = i; k < this.lineas.length; k++) {
      for (const c of this.lineas[k]) {
        if (c === '{') { nivel++; empezada = true; }
        else if (c === '}') nivel--;
      }
      if (empezada && nivel === 0) return { desde: i, hasta: k, largo: k - i + 1 };
    }
    console.log('  *** EL CUERPO DE "' + nombre + '" NO CIERRA ***');
    process.exit(1);
    return null;
  }

  // Y reemplaza un cuerpo entero.
  //
  // Y los dos arreglos se cortan en el MISMO lugar: "cuerpo.hasta + 1".
  //
  // La primera versión cortaba "lineas" en "cuerpo.hasta + 1" y "fines" en
  // "cuerpo.desde + original.length". Son el mismo número —porque "original.length" es
  // "hasta - desde + 1"— así que parecía correcto, y los dos arreglos quedaban con una
  // diferencia de "original.length" renglones.
  //
  // Y el autocomprobador lo dijo: "5348 renglones y 5331 finales".
  reemplazaCuerpo(cuerpo, nuevos) {
    const original = this.lineas.slice(cuerpo.desde, cuerpo.hasta + 1);
    const arr = nuevos.slice();
    const delta = arr.length - original.length;

    this.lineas = this.lineas.slice(0, cuerpo.desde)
      .concat(arr, this.lineas.slice(cuerpo.hasta + 1));

    // Y los finales: los de antes, los DEL CUERPO NUEVO ENTERO, y los de después.
    //
    // Y son "arr.length" y NO la diferencia. La diferencia —"delta"— es lo que hay de más o
    // de menos, pero el cuerpo viejo Entero se quita: los 17 finales que tenía salen con él, y
    // hay que poner los 19 nuevos. Con "delta" —que era 2— quedaban 17 de menos, y el
    // autocomprobador lo decía: "5348 renglones y 5331 finales". Que es exactamente 17.
    const fin = this.fines[cuerpo.desde] || this.fines[cuerpo.desde - 1] || this.nl;
    this.fines = this.fines.slice(0, cuerpo.desde)
      .concat(new Array(arr.length).fill(fin))
      .concat(this.fines.slice(cuerpo.hasta + 1));

    void delta;
    this.verifica('después de reemplazar el cuerpo');
  }

  arma() {
    let s = '';
    for (let k = 0; k < this.lineas.length; k++) {
      // Y AQUÍ ESTÁ EL DEFECTO QUE SE ATRAPA SOLO:
      //
      // Si los dos arreglos estuvieran desalineados, "this.fines[k]" sería "undefined" y el
      // += escribiría el TEXTO "undefined" en el archivo. Con la comprobación dentro de cada
      // operación eso ya no puede llegar acá.
      if (this.lineas[k] === undefined || this.fines[k] === undefined) {
        console.log('  *** EN "arma" HAY UN HUECO EN EL RENGLÓN ' + (k + 1) + ' ***');
        process.exit(1);
      }
      s += this.lineas[k] + this.fines[k];
    }
    return s;
  }

  escribe() {
    // Y ESTA COMPROBACIÓN, ANTES QUE NADA.
    //
    // Porque "escribe()" no miraba los finales por sí mismo: los miraba el constructor y los
    // métodos de edición, y si alguien cambia "fines" a mano —que es lo que hace la prueba— la
    // comprobación se quedaba en el pasado. Escribió el archivo sin volver a mirar.
    this.verifica('antes de escribir');

    const salida = this.arma();
    const d = Buffer.from(salida, 'utf8');

    // Y los finales otra vez, sobre el texto ARMADO. Que es donde se ve el "\r\r\n".
    const cr = (b) => { let n = 0; for (let i = 0; i < b.length; i++) if (b[i] === 13) n++; return n; };
    const sueltos = (t) => (t.match(/\r(?!\n)/g) || []).length;
    const AntesSueltos = sueltos(this.antes.toString('utf8'));

    // Y un "\r" suelto se COMPARA, no se prohíbe.
    //
    // Y esto no es aflojar la comprobación: es que "js/app.js" YA TIENE UNO, en el carácter
    // 143.437, donde debería haber un salto de línea:
    //
    //     ...(d=>s.code===x.w.supervisor_code):null;\r      return `<tr class="justFila"...
    //
    // O sea un "\r" seguido de espacios. El parser lo toma como fin de sentencia, así que el
    // archivo funciona, y no se ve en ningún editor. Pero es un carácter de control perdido
    // en medio del código, y la próxima que compare el archivo con un equivalente va a ver
    // una diferencia que nadie sabe de dónde salió.
    //
    // Y la comprobación tiene que decir eso y seguir: si prohibiera cualquier "\r" suelto,
    // no se podría tocar NADA de este archivo hasta arreglarlo primero —y arreglarlo es un
    // cambio propio, que se hace con su propia medición.
    if (sueltos(salida) > AntesSueltos) {
      console.log('  *** SE METIERON ' + (sueltos(salida) - AntesSueltos)
        + ' "\\r" SUELTO(S). NO SE ESCRIBE ***');
      console.log('    el archivo ya tenía ' + antesSueltos + ', y quedan ' + sueltos(salida) + '.');
      process.exit(1);
    }
    if (AntesSueltos) {
      console.log('    ojo  el archivo YA tenía ' + AntesSueltos
        + ' "\\r" suelto(s), y siguen ahí. No se agrega ninguno.');
    }
    if (/\r\r\n/.test(salida)) {
      console.log('  *** SALIÓ UN "\\r\\r\\n". NO SE ESCRIBE ***');
      process.exit(1);
    }
    // Y EL NÚMERO DE CR SE COMPRUEBA AL REVÉS DE LO QUE SE PENSÓ.
    //
    // La idea era "los CR tienen que ser los mismos". Y eso es falso en cuanto se INSERTA: cada
    // renglón nuevo de un archivo de CRLF agrega un CR, y el conteo sube. Faltaba 51.
    //
    // Lo que importa no es cuántos hay, sino que NINGUNO se haya convertido. Y un "\r" que se
    // vuelve "\n" es un renglón que cambió de estilo, y eso sí se nota: el archivo queda
    // mitad y mitad.
    //
    // ---------------------------------------------------------------------
    // Y LA SEGUNDA FORMA DE ESCRIBIRLO ESTABA MAL, Y ESTOBÓ UN TURNO ENTERO
    // ---------------------------------------------------------------------
    //
    // Se contaba una cosa distinta: los renglones SIN CR —los de LF puro—. Y si ese número
    // subía, se decía que "un renglón que era de CRLF pasó a ser de LF".
    //
    // El razonamiento parece bueno y no lo es: que el número de los LF puros suba no dice NADA
    // sobre los CRLF, porque también sube cuando se insertan renglones en un archivo que es de
    // LF PURO. Y en ese caso no se perdió ningún CR: no había ninguno que perder.
    //
    // O sea que el chequeo era más estricto que lo que parecía y no protegía lo que decía
    // proteger. Consecuencia medida: "documentacion.txt" tiene 0 CRLF y 5.532 LF puros, así que
    // CUALQUIER inserción de un renglón lo hacía fallar. Por eso no se pudo sacar una sección que
    // estaba en el lugar equivocado: el editor se negaba a escribir, y el guardián no distinguía
    // entre "cambiaste el estilo de un renglón" y "agregaste un renglón".
    //
    // Un guardián que bloquea la corrección se vuelve el obstacleio de la corrección. Ver
    // [orden-04].
    //
    // Lo que SÍ se mide es lo que se quería medir: cuántos finales hay de CRLF, y que no
    // DISMINUYAN. En un archivo de CRLF, cada renglón perdido es un "\r" que se volvió "\n", y
    // el archivo queda mitad y mitad. En un archivo de LF puro el número es 0 antes y 0 después,
    // y el chequeo no dice nada, que es lo correcto.
    //
    // Y para que el chequeo no sea una palabra: "tools/prueba-archivo-seguro.js" arma un archivo
    // de CRLF a propósito, le quita un CR, y comprueba que el editor se niegue. Y después
    // inserta un renglón en un archivo de LF puro y comprueba que lo acepte.
    const crlf = (b) => {
      let n = 0;
      for (let i = 1; i < b.length; i++) if (b[i] === 10 && b[i - 1] === 13) n++;
      return n;
    };
    const antesCRLF = crlf(this.antes);
    const ahoraCRLF = crlf(d);
    if (ahoraCRLF < antesCRLF) {
      console.log('  *** ' + (antesCRLF - ahoraCRLF)
        + ' RENGLONES QUE ERAN CRLF PASARON A SER SOLO LF ***');
      console.log('    ' + antesCRLF + ' -> ' + ahoraCRLF + '. NO SE ESCRIBE.');
      process.exit(1);
    }
    if (antesCRLF === 0) {
      console.log('    ojo  este archivo es de LF puro (' + ahoraCRLF
        + ' CRLF), así que el estilo de renglón no se puede perder: no hay.');
    }
    void cr;

    // Y el más importante: que el archivo PARSEE. Antes de escribir, no después.
    // Y el temporal tiene que TERMINAR en ".js".
    //
    // Porque "node --check" no adivina el formato: con un archivo que se llama "app.js.revisa"
    // responde "ERR_UNKNOWN_FILE_EXTENSION" y no revisa nada. O sea que la comprobación
    // parecía estar corriendo y en realidad no miró el archivo.
    //
    // Y eso es peor que no comprobar: sale un error que dice "no parsea" sobre un archivo que
    // está perfectamente bien, y el que lo ve piensa que rompió algo.
    const temporal = this.ruta + (/\.js$/.test(this.ruta) ? '.revisa.js' : '.revisa');
    fs.writeFileSync(temporal, d);
    let parseo = true;
    let porQue = '';
    if (/\.js$/.test(this.ruta)) {
      try {
        require('child_process').execFileSync('node', ['--check', temporal], {
          encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (e) {
        parseo = false;
        porQue = ((e.stdout || '') + (e.stderr || '')).split('\n')
          .filter((x) => x.trim()).slice(0, 3).join(' | ');
      }
    }
    fs.unlinkSync(temporal);

    if (!parseo) {
      console.log('');
      console.log('  *** EL ARCHIVO RESULTANTE NO PARSEA ***');
      console.log('    ' + porQue.slice(0, 140));
      console.log('');
      console.log('    NO SE ESCRIBE NADA. El archivo de verdad queda como estaba, y el');
      console.log('    temporal se borró.');
      process.exit(1);
    }

    fs.writeFileSync(this.ruta, d);
    console.log('    ok  escrito, y parsea ANTES de escribir: ' + path.basename(this.ruta));
  }
}

module.exports = { Archivo: Archivo };