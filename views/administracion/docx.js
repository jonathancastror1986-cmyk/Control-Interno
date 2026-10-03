/*
  EL .DOCX DE ENTRADA, RELLENADO, Y DE VUELTA
  ============================================

  -------------------------------------------------------------------
  QUÉ HACE Y POR QUÉ ESTÁ EN EL NAVEGADOR Y NO EN UN SERVIDOR
  -------------------------------------------------------------------

  El flujo de contratos hoy convierte el ".docx" a HTML, lo rellena, y arma el PDF con jsPDF.
  Eso funciona, y lo que sale SE PARECE al documento. Pero el archivo de Word no vuelve, y
  con él se van las cosas que solo Word sabe hacer: las tablas que se parten entre páginas,
  los encabezados que se repiten, la orientación del papel, los márgenes exactos.

  La alternativa obvia es un motor en el servidor —"docxtemplater" en Node, o
  "python-docx-template"— y se descartó por medición, no por gusto:

    · el proyecto no tiene "node_modules", ni "requirements.txt", ni build
    · se publica estático, en GitHub Pages
    · el único runtime de servidor son cinco Edge Functions en Deno, que no se pueden
      ni compilar ni probar en la máquina donde se trabaja

  O sea que un motor en el servidor sería código que no se puede probar antes de subirlo.

  Y la vía que sí funciona es la del navegador, por una razón que no es de gusto: el
  ".docx" es un ZIP con archivos XML adentro, y abrir un ZIP y volverlo a armar son dos
  operaciones que hace "fflate", que pesa 32 KB y se baja de CDN —el mismo camino que ya
  usan jsPDF, html2canvas, JsBarcode y las otras cinco librerías del proyecto—.

  Y el resultado es que el ".docx" vuelve con su formato, sin servidor nuevo, sin despliegue
  nuevo, y probado en el navegador antes de subir nada.

  -------------------------------------------------------------------
  EL PROBLEMA QUE HACE FALTA RESOLVER, Y QUE NO ES EL QUE UNO SUPONE
  -------------------------------------------------------------------

  La suposición natural es que dentro del archivo está escrito:

      <w:t>{{nombre}}</w:t>

  Y no está. Word no guarda una frase en un solo pedazo: la parte en muchos, por las marcas
  de revisión interna y por dónde estaba el corrector de ortografía cuando se escribió. Un
  ".docx" hecho con Word contiene esto:

      <w:r><w:t>{{nombre_completo</w:t></w:r>
      <w:r><w:t>}}</w:t></w:r>

  Y buscar "{{nombre_completo}}" en el XML crudo NO lo encuentra. Sin error: el documento sale
  con las llaves adentro y con un campo en blanco, y el único síntoma es que el papel está
  mal.

  Está medido en "tools/pruebas/docx-ida-y-vuelve.html", punto 1.

  -------------------------------------------------------------------
  LA FORMA QUE SÍ FUNCIONA, Y SON TRES PASOS
  --------------------------------------------

  UNO — pegar todos los "<w:t>" de un párrafo, en orden, en un solo texto. Ahí la variable
  aparece entera, porque los pedazos vuelven a estar juntos.

  DOS — buscar la variable en ese texto pegado, y anotar en qué pedazo y en qué posición
  empieza y termina. Sin esa anotación no hay forma de volver a escribir el dato en el
  lugar correcto.

  TRES — volver a armar el párrafo: el valor va en el PRIMER "<w:t>" de la variable, y los
  "<w:t>" intermedios y el último se quedan con lo que sobraba de cada uno.

  Y los "<w:t>" vacíos NO se borran: se quedan vacíos. Word necesita el "<w:r>" y el "<w:t>"
  para que el formato del párrafo no se desarme, y si faltan, el documento abre raro.

  Y el atributo "xml:space=\"preserve\"" se conserva, porque sin él Word junta las palabras
  pegadas y "Juan" y "Pérez" salen como "JuanPérez".

  -------------------------------------------------------------------
  Y LOS REEMPLAZOS VAN DE ATRÁS PARA ADELANTE
  -------------------------------------------

  Y esto no se ve, y es lo que hace que la mitad de las variables no salgan.

  Si se reemplaza de adelante para atrás, escribir un texto más largo que el que estaba
  mueve todo lo que viene después, y las posiciones ya medidas dejan de estar donde
  estaban. El documento sale con un dato puesto y los demás corridos.

  Con los índices justos, de atrás para adelante, no se mueve nada de lo que ya se escribió.

  -------------------------------------------------------------------
  Y POR QUÉ NO SE CRUZAN PÁRRAFOS
  -------------------------------

  Porque un "<w:r>" de Word SIEMPRE está dentro de un párrafo. Una variable partida entre
  dos párrafos ya no es una variable: es texto roto, y pegarla sería inventar contenido
  donde el autor no lo puso.

  Y eso que no se rellena NO SE ESCONDE: la función devuelve cuántas llaves quedaron sin
  cerrar, y un papel con una adentro tiene que rechazarse antes de imprimirse. Un papel con
  "{{rut" a medio escribir es peor que uno sin nombre: el primero parece generado y el
  segundo se nota.

  -------------------------------------------------------------------
  LAS DOS FORMAS DE VARIABLE, Y POR QUÉ LAS DOS
  ----------------------------------------------

      "{{nombre}}"     la base revisa con esta —"campos_de_plantilla"—
      "[[NOMBRE]]"     el navegador rellena con esta

  Y el documento tiene que estar en las dos, porque uno revisa y el otro llena. La
  migración 060 existe por esto, y está escrito en el propio archivo que una plantilla
  escrita solo con "{{}}" pasa revisión y nunca se completa, sin ningún error.

  -------------------------------------------------------------------
  LO QUE NO HACE
  --------------

  · No toca los estilos. Los copia byte por byte. Por eso el formato sobrevive, y también
    por eso un ".docx" sin estilos abre en blanco y eso no se nota hasta que lo abre alguien.

  · No cruza párrafos, y lo dice.

  · No sube nada a la base. Solo arma el archivo. Lo que se guarda es una decisión de otra
    pantalla.
*/

// -------------------------------------------------------------------
// LAS TRES EXPRESIONES REGULARES, Y CADA UNA CON SU MOTIVO
// -------------------------------------------------------------------
//
// Y van con barras invertidas a propósito, aunque elsewhere este proyecto usa
// "String.fromCharCode" para no arriesgar el escape. La diferencia es que ahí el problema
// eran las BARRAS del archivo al transmitirse, y acá el problema son las barras del
// REGEX: una expresión regular necesita barras, y no hay forma de escribirla sin ellas.
const RE_PARRAFO = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
const RE_TEXTO = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
const RE_ABRE_TEXTO = /^<w:t(?:\s[^>]*)?>/;

// Y las variables, en las dos formas. La "i" y la "g" juntas, porque una plantilla puede
// repetir el mismo dato veinte veces.
const RE_VARIABLE = /\[\[([A-Z0-9_]+)\]\]|\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

// -------------------------------------------------------------------
// EL ESCAPE DEL XML, QUE SI FALLA ROMPE EL ARCHIVO ENTERO
// -------------------------------------------------------------------
//
// Y va ANTES que nada, porque un "&" de una empresa que se llama "A&B" vuelve inválido el
// XML, y Word responde "el archivo está dañado" sin decir dónde.
//
// Y el orden importa: el ampersand primero. Si se cambiaran "<" y ">" primero, el "&lt;"
// que se acaba de escribir se convertiría en "&lt;lt;" y el texto saldría con las
// entidades adentro, que es el síntoma clásico de un escape mal hecho.
const escapar = function (s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

// Y el inverso, para LEER lo que hay en el archivo antes de buscar variables.
const desescapar = function (s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(Number(n)); })
    .replace(/&amp;/g, '&');
};

// Y el texto de "FALTA", que es lo que aparece donde no hay dato. Va entre corchetes y en
// mayúscula porque se tiene que VER de una pasada, y porque es lo que una persona tiene
// que poder reportar por teléfono: "me salió un [falta]".
const MARCA_FALTA = '[falta]';

const DOCX_PLANTILLA = (function () {
  'use strict';

  // -----------------------------------------------------------------
  // EL NÚCLEO: COMPLETAR EL XML
  // -----------------------------------------------------------------
  //
  // Y devuelve DOS cosas y no una: el XML y los campos que quedaron sin completar. Y
  // devuelve las dos porque el que llama tiene que poder decidir si deja descargar un papel
  // con un "[falta]" adentro, y eso no se puede saber si solo le devuelven el texto.
  function completarXml(xml, datos) {
    const d = datos || {};
    const faltan = new Set();
    let tocadas = 0;

    const salida = String(xml).replace(RE_PARRAFO, function (parrafo) {
      // 1) los "<w:t>" del párrafo, con dónde están
      const trozos = [];
      let m;
      RE_TEXTO.lastIndex = 0;
      while ((m = RE_TEXTO.exec(parrafo)) !== null) {
        trozos.push({ ini: m.index, fin: RE_TEXTO.lastIndex, texto: desescapar(m[1]) });
      }
      if (!trozos.length) return parrafo;

      // 2) el mapa: cada posición del texto pegado -> qué "<w:t>" y qué caracter de ese
      //    "<w:t>". Sin esto no hay forma de volver a escribir el dato donde iba.
      const mapa = [];
      trozos.forEach(function (t, i) {
        for (let k = 0; k < t.texto.length; k++) mapa.push({ t: i, off: k });
      });

      const entero = trozos.map(function (t) { return t.texto; }).join('');
      if (!entero) return parrafo;

      // 3) dónde está cada variable, en el texto pegado
      const hallazgos = [];
      let q;
      RE_VARIABLE.lastIndex = 0;
      while ((q = RE_VARIABLE.exec(entero)) !== null) {
        const clave = String(q[1] || q[2] || '').toLowerCase();
        const existe = Object.prototype.hasOwnProperty.call(d, clave);
        if (!existe) faltan.add(clave);
        hallazgos.push({
          ini: q.index,
          fin: q.index + q[0].length,
          valor: existe ? escapar(d[clave]) : MARCA_FALTA,
        });
      }
      if (!hallazgos.length) return parrafo;

      // Y se van detrás del valor, y con esto se pierde todo lo que ya se escribió. Por eso
      // van de atrás para adelante.
      const textos = trozos.map(function (t) { return t.texto; });
      hallazgos.sort(function (a, b) { return b.ini - a.ini; }).forEach(function (h) {
        const desde = mapa[h.ini];
        const hasta = mapa[h.fin - 1];
        if (!desde || !hasta) return;
        tocadas++;

        if (desde.t === hasta.t) {
          // El caso fácil: la variable estaba entera en un "<w:t>".
          textos[desde.t] = textos[desde.t].slice(0, desde.off)
            + h.valor + textos[desde.t].slice(hasta.off + 1);
          return;
        }
        // El difícil: cruzaba varios "<w:t>". El valor va en el primero, el resto se vacía.
        textos[desde.t] = textos[desde.t].slice(0, desde.off) + h.valor;
        for (let i = desde.t + 1; i < hasta.t; i++) textos[i] = '';
        textos[hasta.t] = textos[hasta.t].slice(hasta.off + 1);
      });

      // Y se rearma el párrafo, también de atrás para adelante, por lo mismo.
      let armado = parrafo;
      for (let i = trozos.length - 1; i >= 0; i--) {
        const t = trozos[i];
        const original = parrafo.slice(t.ini, t.fin);
        const abre = (original.match(RE_ABRE_TEXTO) || ['<w:t>'])[0];
        armado = armado.slice(0, t.ini) + abre + escapar(textos[i]) + '</w:t>' + armado.slice(t.fin);
      }
      return armado;
    });

    return {
      xml: salida,
      faltan: [...faltan],
      tocadas: tocadas,
    };
  }

  // -----------------------------------------------------------------
  // EL ARCHIVO ENTERO: ABRIR, RELLENAR, VOLVER A ARMAR
  // -----------------------------------------------------------------
  //
  // Y solo se toca "word/document.xml". Los otros XML —los estilos, la numeración, las
  // fuentes— se copian byte por byte. Y es por eso que el formato sobrevive.
  //
  // Y el nivel de compresión es 0, sin comprimir, a propósito. Un ".docx" es un ZIP, y el
  // ZIP sin comprimir es un ZIP válido: lo abre Word igual. Y comprimir más no vale nada
  // acá, porque un contrato pesa pocos kilobytes y comprimirlo cuesta tiempo de cada
  // generación.
  //
  // Y lo que NO hace: no sube nada a la base, no guarda nada, y no avisa si el archivo que
  // leLOBALS no era un ".docx". Eso lo tiene que mirar el que llama, y por eso hay
  // "esDocx" aparte.
  function completar(bytes, datos) {
    const f = window.fflate;
    if (!f) throw new Error('falta "fflate", que hace falta para abrir el archivo');

    const partes = f.unzipSync(bytes);
    if (!partes['word/document.xml']) {
      throw new Error('esto no es un .docx: no tiene "word/document.xml"');
    }

    const r = completarXml(f.strFromU8(partes['word/document.xml']), datos);
    partes['word/document.xml'] = f.strToU8(r.xml);

    return {
      bytes: f.zipSync(partes, { level: 0 }),
      faltan: r.faltan,
      tocadas: r.tocadas,
    };
  }

  // -----------------------------------------------------------------
  // LAS TRES COSAS QUE EL QUE LLAMA NECESITA PREGUNTARLE AL ARCHIVO
  // -----------------------------------------------------------------
  //
  // Y el texto plano está porque la vista previa necesita leerlo sin tener que abrir el
  // ZIP: son tres llamadas que hacen falta antes de decidir si se puede descargar.
  function textoPlano(bytes) {
    const f = window.fflate;
    if (!f) throw new Error('falta "fflate"');
    const partes = f.unzipSync(bytes);
    if (!partes['word/document.xml']) return '';
    return planoDe(f.strFromU8(partes['word/document.xml']));
  }

  function planoDe(xml) {
    const out = [];
    let m;
    RE_TEXTO.lastIndex = 0;
    while ((m = RE_TEXTO.exec(String(xml))) !== null) out.push(desescapar(m[1]));
    return out.join('');
  }

  // Y las variables que TIENE el archivo, que es distinto de las que se rellenaron: es lo
  // que hay que revisar al subir una plantilla, para avisar "este papel pide un dato que
  // no existe en la ficha".
  function variablesDe(bytes) {
    const f = window.fflate;
    if (!f) return [];
    const partes = f.unzipSync(bytes);
    if (!partes['word/document.xml']) return [];
    return variablesDeXml(f.strFromU8(partes['word/document.xml']));
  }

  function variablesDeXml(xml) {
    // Y no se busca en el XML crudo sino en el texto pegado, por lo mismo que al rellenar:
    // en el crudo la variable está partida y no se encuentra.
    const plano = planoDe(xml);
    const out = new Set();
    let q;
    RE_VARIABLE.lastIndex = 0;
    while ((q = RE_VARIABLE.exec(plano)) !== null) {
      out.add(String(q[1] || q[2] || '').toLowerCase());
    }
    return [...out];
  }

  // -----------------------------------------------------------------
  // Y SI LO QUE SUBIÓ ES UN .DOCX DE VERDAD
  // -----------------------------------------------------------------
  // Y se mira la firma del archivo, que son los dos primeros bytes: "PK". Un ZIP empieza
  // así, y un ".docx" es un ZIP. Un ".doc" viejo, o un PDF, o un texto, no.
  //
  // Y esto está porque el error de subir el archivo equivocado NO da ningún aviso útil: el
  // ZIP revienta con un mensaje que dice de números.
  function esDocx(bytes) {
    return !!bytes && bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4B;
  }

  return {
    completar: completar,
    completarXml: completarXml,
    textoPlano: textoPlano,
    planoDe: planoDe,
    variablesDe: variablesDe,
    variablesDeXml: variablesDeXml,
    esDocx: esDocx,
    MARCA_FALTA: MARCA_FALTA,
  };
})();

// Y se deja en "window" porque el proyecto es de "<script>" clásicos y no hay módulos.
// Y el nombre va con prefijo porque "completar" a secas se pisaría con cualquier otro.
window.DOCX_PLANTILLA = DOCX_PLANTILLA;