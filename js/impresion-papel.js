
// ------------------------------------------------------------------
// EL CONTENEDOR DE IMPRESIÓN
// ------------------------------------------------------------------
// Y POR QUÉ SE CREA EN VEZ DE REUSAR "pantallaTotal"
//
// Porque "pantallaTotal" está en "position: fixed; left: -10000px". Es una caja
// escondida para armar el documento sin que se vea mientras se prepara, y está
// bien que lo esté.
//
// Pero al imprimir, un elemento fijo se posiciona respecto de la VENTANA, y al
// imprimir la ventana ES la hoja. Con "-10000px" el papel queda diez mil píxeles
// a la izquierda de la hoja, que es fuera. Por eso salía en blanco.
//
// La salida es un contenedor NUEVO, hijo directo de "<body>", sin position y sin
// desplazamiento. Y el papel se muda ahí con "appendChild", que lo saca del
// lugar viejo.
//
// Y SE DEVUELVE AL TERMINAR
//
// Porque si se deja, el papel queda colgado del "<body>" y la aplicación se ve
// con el documento pegado abajo de todo.
function crearContenedorImpresion(){
  let c=document.getElementById('impresionContrato');
  if(!c){
    c=document.createElement('div');
    c.id='impresionContrato';
    // Y EL "aria-hidden", PORQUE ESTE CONTENEDOR NO ES DE LA PANTALLA
    //
    // Es una copia del papel que existe solo para imprimir. Un lector de
    // pantalla lo leería dos veces si no se marca, y una vez como contenido
    // normal y otra como documento.
    c.setAttribute('aria-hidden','true');
  }
  return c;
}
function imprimirPapel(html){
  const c=crearContenedorImpresion();
  const papel=document.querySelector('.hoja-papel');
  const donde=papel?papel.parentElement:null;

  // Y EL PAPEL SE MUDA, NO SE COPIA
  //
  // Si se copiara el HTML con "innerHTML", el contenido quedaría con la posición
  // fija que hereda del contenedor viejo, y saldría fuera de la hoja.
  c.innerHTML=html;
  document.body.appendChild(c);
  // Y EL CONTENEDOR NUEVO SE PONE AL FINAL DEL CUERPO
  //
  // "appendChild" lo saca del lugar viejo y lo pone acá. Es lo mismo que hace
  // "appendChild" con un elemento que ya estaba en el DOM: lo mueve.
  if(papel&&donde)donde.appendChild(c);

  document.body.classList.add('imprimiendo-contrato');
  const devolver=function(){
    document.body.classList.remove('imprimiendo-contrato');
    if(c.parentElement)c.parentElement.removeChild(c);
  };
  window.addEventListener('afterprint',devolver,{once:true});
  // El plan B: si el navegador no dispara "afterprint", se saca igual. Sin esto, el
  // papel queda colgado del "<body>" y la aplicación se ve con el documento abajo.
  setTimeout(devolver,3000);
  window.print();
}