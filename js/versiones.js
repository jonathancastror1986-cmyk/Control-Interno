// ===================================================================
// LA VERSIÓN, ESCRITA DENTRO DE LA APLICACIÓN
// ===================================================================
//
// ESTE NÚMERO SE COMPARA CON EL "?v=" QUE PIDEN LOS SCRIPTS
//
// ---------------------------------------------------------------------
// POR QUÉ HACE FALTA
// ---------------------------------------------------------------------
//
// Porque hace varios turnos que el problema es el mismo y se ve distinto: "no
// carga", "no guarda", "sigue igual". Y en todos los casos lo que pasaba es que el
// navegador estaba con una versión anterior.
//
// Y la forma de verificarlo era: recargar y esperar que la pantalla cambiara. Si
// cambiaba, funcionó. Y si no cambiaba, no había forma de saber si era caché, o si
// era que el arreglo no servía.
//
// ---------------------------------------------------------------------
// Y POR QUÉ ESTÁ EN UN ARCHIVO Y NO EN EL "index"
// ---------------------------------------------------------------------
//
// Porque el "index" es HTML plano: el navegador no resuelve nada adentro. Si se
// escribiera "v${VERSION}" ahí, salía literally esa cadena.
//
// Y NO SE ESCRIBE A MANO
//
// La escribe "tools/sube-la-version.js", en el mismo momento en que sube el "?v="
// de los enlaces. Si alguien cambia uno y no el otro, el guardián
// "comprueba-la-version.js" lo dice. Es la regla del proyecto: un número que
// aparece en dos lugares tiene que haber un guardián que los compare.

const VERSION_APP = '123';