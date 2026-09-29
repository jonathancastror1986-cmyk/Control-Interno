

const VARIABLES_PLANTILLA = [
  {clave:'nombre',           etiqueta:'Nombre del trabajador',      de:'trabajadores.name'},
  {clave:'nombre_completo',  etiqueta:'Nombre y apellido',           de:'trabajadores.name'},
  {clave:'rut',              etiqueta:'RUT',                          de:'trabajadores.rut'},
  {clave:'codigo',           etiqueta:'Código del trabajador',        de:'trabajadores.code'},
  {clave:'especialidad',     etiqueta:'Oficio o especialidad',        de:'trabajadores.especialidad_clave'},
  {clave:'empresa',          etiqueta:'Nombre de la empresa',         de:'empresa.nombre'},
  {clave:'empresa_rut',      etiqueta:'RUT de la empresa',            de:'empresa.rut'},
  {clave:'centro',           etiqueta:'Centro de costo',              de:'centros_costo.nombre'},
  {clave:'obra',             etiqueta:'Nombre de la obra',            de:'centros_costo.nombre'},
  {clave:'fecha',            etiqueta:'Fecha de hoy',                 de:'la del sistema'},
  {clave:'fecha_ingreso',    etiqueta:'Fecha de ingreso',             de:'trabajadores.fecha_ingreso'},
  {clave:'supervisor',       etiqueta:'Nombre del supervisor',        de:'el que firma'},
  {clave:'cargo',            etiqueta:'Cargo',                        de:'trabajadores.cargo'}
];

// ------------------------------------------------------------------
// RECONOCER LAS VARIABLES
// ------------------------------------------------------------------
//
// Se arman tres patrones. Con tres en vez de uno con dos alternativas, el
// código es más legible y cada forma se puede probar sola.
//
// El nombre se normaliza antes de comparar: minúsculas, sin acentos, con
// los guiones bajos convertidos en espacio. Así [NOMBRE], [Nombre] y
// [nombre ] son la misma variable, que es como las escribe la gente.

const aliasVariables=(()=>{
  const m=new Map();
  for(const v of VARIABLES_PLANTILLA){
    const base=normalizarNombreVariable(v.clave);
    m.set(base,v.clave);
    m.set(normalizarNombreVariable(v.etiqueta),v.clave);
    // [nombre_completo] y [nombre completo] tienen que ser lo mismo.
    m.set(base.replace(/_/g,' '),v.clave);
    // "trabajador" a secas, que es como lo escribe la gente.
    if(base==='nombre')m.set('trabajador',v.clave);
    if(base==='nombre_completo'){m.set('nombre y apellido',v.clave);m.set('nombre y apellidos',v.clave);}
  }
  return m;
})();


const PATRONES_VARIABLE=[
  // {{nombre}}, con llaves dobles
  /\{\{\s*([^}]{1,60}?)\s*\}\}/g,
  // [NOMBRE], con corchetes
  /\[\s*([A-Za-zÁÉÍÓÚÑáéíóúñ_ ]{2,60}?)\s*\]/g,
  // {nombre}, con una sola llave
  /\{\s*([A-Za-zÁÉÍÓÚÑáéíóúñ_ ]{2,60}?)\s*\}/g
];

// ------------------------------------------------------------------
// CONVERTIR LAS VARIABLES
// ------------------------------------------------------------------
//
// Se buscan tres formas, que son las que la gente escribe:
//
//     {{nombre}}      con llaves dobles
//     [NOMBRE]        con corchetes y en mayúsculas
//     {nombre}        con una sola llave
//
// Y en las tres, el nombre puede ir con guion bajo o con espacio:
// [NOMBRE_TRABAJADOR] y [NOMBRE TRABAJADOR] son la misma variable.
//
// LO QUE NO SE RECONOCE, Y POR QUÉ NO SE REEMPLAZA IGUAL
//
// Un texto entre corchetes que no sea una variable conocida, como [FIRMA]
// o [SELLO], se deja escrito y se avisa.
//
// Si se reemplazara a ciegas, "el valor es [precio] y el plazo
// [dias]" se convertiría en un hueco invisible en un documento que firma
// un trabajador. Eso es peor que dejarlo escrito: se ve, se corrige, y no
// hay forma de que pase inadvertido.
// Devuelve el HTML con las variables ya en la forma interna, y la lista
// de lo que se reconoció y lo que no, para poder avisar.

function normalizarNombreVariable(s){
  return String(s||'')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')   // saca los acentos
    .replace(/[\s-]+/g,' ')            // guiones y espacios son lo mismo
    .trim();
}
function escaparParaHTML(s){
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}
function textoAHtml(texto){
  const lineas=String(texto).replace(/\r\n?/g,'\n').split('\n');
  const out=[];
  let enLista=false;
  let enTabla=false;
  let celdaAbierta=false;
  const cerrarLista=()=>{if(enLista){out.push('</ul>');enLista=false;}};
  const cerrarCelda=()=>{if(celdaAbierta){out.push('</td>');celdaAbierta=false;}};
  const cerrarTabla=()=>{cerrarCelda();if(enTabla){out.push('</tbody></table>');enTabla=false;}};

  for(const cruda of lineas){
    const linea=cruda.replace(/\s+$/,'');
    const sinEspacios=linea.trim();
    if(linea.indexOf('\t')>=0&&sinEspacios){
      if(!enTabla){out.push('<table class="docx-tabla"><tbody>');enTabla=true;}
      for(const celda of linea.split('\t')){
        if(celda.trim()==='')continue;
        cerrarCelda();
        const limpia=escaparParaHTML(celda.trim())
          .replace(/^<(?:p|span|div)\b[^>]*>/i,'')
          .replace(/<\/(?:p|span|div)>$/i,'');
        out.push('<td>'+limpia+'</td>');
        celdaAbierta=true;
      }
      continue;
    }
    cerrarTabla();
    if(!sinEspacios){cerrarLista();continue;}
    if(/^<\/?(ul|ol|li)\b/i.test(sinEspacios)){
      if(/^<li/i.test(sinEspacios)){
        if(!enLista){out.push('<ul>');enLista=true;}
        out.push('<li>'+escaparParaHTML(sinEspacios.replace(/^<\/?li[^>]*>/i,'').replace(/<\/li>$/i,''))+'</li>');
        continue;
      }
      cerrarLista();
      out.push(sinEspacios);
      continue;
    }
    const vineta=sinEspacios.match(/^(?:[-\u2022*]\s+|\d+[.)]\s+)/);
    if(vineta){
      if(!enLista){out.push('<ul>');enLista=true;}
      out.push('<li>'+escaparParaHTML(sinEspacios.slice(vineta[0].length))+'</li>');
      continue;
    }
    if(TAG_PERMITIDA.test(sinEspacios)){cerrarLista();out.push(sinEspacios);continue;}
    const conHtml=lineaConHtmlDeWord(sinEspacios);
    if(conHtml!==escaparParaHTML(sinEspacios)){cerrarLista();out.push(conHtml);continue;}
    cerrarLista();
    out.push('<p>'+escaparParaHTML(sinEspacios)+'</p>');
  }
  cerrarLista();
  cerrarTabla();
  return out.join('\n');
}
function convertirVariablesDePlantilla(texto){
  const html=[];
  const encontradas=[];
  const desconocidas=[];
  let i=0;
  while(i<texto.length){
    // Se busca en los tres patrones por turno sobre el texto entero, y
    // se toma el que empieza antes. Si se hicieran por separado, un
    // {{nombre}} dentro de un tramo con corchetes se pisarían.
    let mejor=null;
    for(const re of PATRONES_VARIABLE){
      re.lastIndex=i;
      const m=re.exec(texto);
      if(m&&(!mejor||m.index<mejor.m.index))mejor={m};
    }
    if(!mejor){
      html.push(escaparParaHTML(texto.slice(i)));
      break;
    }
    if(mejor.m.index>i)html.push(escaparParaHTML(texto.slice(i,mejor.m.index)));
    const crudo=mejor.m[1];
    const clave=aliasVariables.get(normalizarNombreVariable(crudo));
    if(clave){
      html.push('{{'+clave+'}}');
      if(!encontradas.includes(clave))encontradas.push(clave);
    }else{
      html.push(escaparParaHTML(mejor.m[0]));
      if(!desconocidas.includes(crudo))desconocidas.push(crudo);
    }
    i=mejor.m.index+mejor.m[0].length;
  }
  return {html:html.join(''),encontradas,desconocidas};
}
module.exports={
  normalizarNombreVariable,convertirVariablesDePlantilla,textoAHtml,
  escaparParaHTML,VARIABLES_PLANTILLA,PATRONES_VARIABLE
};
