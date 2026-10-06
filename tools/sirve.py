# ===================================================================
# EL SERVIDOR LOCAL
# ===================================================================
#
# Corre:  python tools/sirve.py
#
# Y ABRILo CON Doble CLIC en  servir.bat
#
# ---------------------------------------------------------------------
# POR QUÉ EXISTE Y NO ALCANZA CON "python -m http.server"
# ---------------------------------------------------------------------
#
# Porque ese servidor no resuelve extensiones. "/pages/app" da 404, y
# "/pages/app.html" funciona. Cada vez que se recarga la aplicacion, hay que
# acordarse de escribir ".html".
#
# Eso pasó una vez, en una sesión de prueba, y costó tiempo que no era culpa
# de nadie: el servidor no lo decía.
#
# Y ADEMAS PASA OTRA COSA
#
# "python -m http.server" no manda los tipos correctos en Windows. Y si un
# ".js" se sirve como texto plano, el navegador lo muestra en vez de
# ejecutarlo. En algunos casos eso es un error que dice "Unexpected token <
# 'doctype'" en un archivo que esta perfecto.
#
# ---------------------------------------------------------------------
# LO QUE HACE, Y NO MÁS
# ---------------------------------------------------------------------
#
#   1. "/pages/app"      -> sirve "pages/app.html"
#   2. "/"               -> sirve "index.html"
#   3. los tipos MIME correctos, sobre todo ".js" y ".css"
#   4. avisa en la consola qué está sirviendo y qué se pidió
#
# Y NO HACE: HTTPS, autenticación, ni cache. Para desarrollo alcanza, y
# cualquier cosa más es agregar una superficie de ataque sin necesidad.

import http.server
import socketserver
import os
import sys
import mimetypes

# Y LA RAÍZ DEL PROYECTO
#
# El archivo está en "tools/", así que la raíz es un nivel arriba. Si se corre
# desde otro lado, se busca el "pages" hacia arriba hasta encontrarlo.
AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)

# Y EL PUERTO
#
# El 5500 es el que se venía usando. Si está ocupado, se avisa y se elige el
# siguiente, porque si no el error es "Address already in use" y no dice qué
# lo ocupa.
PUERTO = 5500

# ---------------------------------------------------------------------
# LOS TIPOS QUE HAY QUE DECIR A mano
# ---------------------------------------------------------------------
#
# En Windows, "mimetypes" devuelve "text/plain" para un ".js" si el registro
# del sistema no tiene la entrada. Y un ".js" servido como texto plano no se
# ejecuta: el navegador lo muestra. Por eso la lista está escrita entera.
#
# Y ".mjs" va con "text/javascript" y no con "application/javascript", que es
# lo que algunos navegadores rechazan.
TIPOS = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.txt': 'text/plain; charset=utf-8',
    '.sql': 'text/plain; charset=utf-8',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
}


class Servidor(http.server.SimpleHTTPRequestHandler):
    """Lo mismo que el de la biblioteca, con tres correcciones."""

    def guess_type(self, path):
        """El tipo del archivo, de la lista de arriba primero.

        Ojo: el método se llama "guess_type" porque es el que usa la clase
        madre. Cambiar el nombre acá no cambiaría nada, y el archivo se
        serviría con el tipo por defecto, que es justo lo que se quiere evitar.
        """
        ext = os.path.splitext(path)[1].lower()
        if ext in TIPOS:
            return TIPOS[ext]
        # Y SI NO ESTÁ EN LA LISTA, PREGUNTA AL SISTEMA
        guessed, _ = mimetypes.guess_type(path)
        return guessed or 'application/octet-stream'

    def translate_path(self, path):
        """Agrega la extensión cuando falta.

        Es el arreglo del "/pages/app" que da 404. Se separa la ruta, se le
        saca la barra, y si el archivo no existe pero el ".html" sí, se sirve
        ese.
        """
        limpio = path.split('?')[0].split('#')[0]
        limpio = limpio.lstrip('/')

        # Primero: ¿existe tal cual?
        real = os.path.join(RAIZ, *limpio.split('/')) if limpio else os.path.join(RAIZ, 'index.html')
        if os.path.exists(real) and os.path.isfile(real):
            return real

        # Y SI ES UN DIRECTORIO, EL index de adentro
        if os.path.isdir(real):
            indice = os.path.join(real, 'index.html')
            if os.path.isfile(indice):
                return indice

        # Y LA MAGIA: SIN EXTENSION, PRUEBA CON ".html"
        if limpio and not os.path.splitext(limpio)[1]:
            con_html = os.path.join(RAIZ, *limpio.split('/')) + '.html'
            if os.path.isfile(con_html):
                return con_html

        # Y SI NO HAY NADA, DEVUELVE LA RUTA ORIGINAL PARA QUE DÉ 404 DE VERDAD
        return real

    def end_headers(self):
        """Agrega la cabecera de que no se cachea.

        Porque el guía de este proyecto es "recargar con ?v=N", y eso ya es
        suficiente. Si además el navegador guarda el CSS, la ?v=N no sirve de
        nada: el navegador ni la pide.
        """
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        http.server.SimpleHTTPRequestHandler.end_headers(self)

    def log_message(self, fmt, *args):
        """La consola dice qué se pidió y con qué código.

        La biblioteca escribe un renglón por cada archivo, incluso los que
        that exist. Con 23 scripts por pagina eso son 24 renglones por recarga,
        y el único que interesa es el que falla.
        """
        codigo = args[1] if len(args) > 1 else ''
        # El 200 se calla; los 404 y los errores se muestran.
        if str(codigo).startswith('2'):
            return
        sys.stderr.write('   %s  %s\n' % (codigo, args[0] if args else ''))


def puerto_libre(candidato):
    """El primer puerto libre desde el 5500 para arriba.

    Porque si el 5500 está ocupado, el error de Python es "Address already in
    use", que no dice QUÉ lo ocupa. Y en un puesto de trabajo siempre hay algo
    escuchando en el 5500.
    """
    for p in range(candidato, candidato + 20):
        with socketserver.TCPServer(('127.0.0.1', p), Servidor) as prueba:
            prueba.server_close()
            return p
    return candidato


def principal():
    if not os.path.isdir(os.path.join(RAIZ, 'pages')):
        print('  *** Esta carpeta no parece el proyecto: no hay "pages/"')
        print('      Se buscó en: ' + RAIZ)
        return 1

    global PUERTO
    PUERTO = puerto_libre(PUERTO)

    os.chdir(RAIZ)
    with socketserver.TCPServer(('127.0.0.1', PUERTO), Servidor) as httpd:
        print('')
        print('  ----------------------------------------------------')
        print('   Sirviendo: ' + RAIZ)
        print('')
        print('   La app:     http://127.0.0.1:%d/pages/app' % PUERTO)
        print('   (también sirve "/pages/app.html", sin diferencia)')
        print('')
        print('   Para parar: Ctrl+C')
        print('  ----------------------------------------------------')
        print('')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('')
            print('   Servidor parado.')
    return 0


if __name__ == '__main__':
    sys.exit(principal())