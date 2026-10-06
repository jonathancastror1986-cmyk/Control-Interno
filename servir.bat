@echo off
REM ===================================================================
REM  ABRIR EL SERVIDOR LOCAL CON DOBLE CLIC
REM ===================================================================
REM
REM Para que "/pages/app" funcione sin tener que escribir ".html" cada vez.
REM
REM Y POR QUE HAY UN BAT Y NO SOLO EL PYTHON
REM
REM Porque doble clic. Con el BAT se abre una ventana, se ve qué está pasando
REM y se para con Ctrl+C cerrando esa ventana. Con un atajo en el escritorio
REM queda a un clic de siempre.
REM
REM Y NO CIERRA LA VENTANA AL TERMINAR
REM
REM El "pause" del final es a proposito: si el servidor se cae por un error, la
REM ventana muestra el error y queda quieta. Sin el, se cerraria y no se vería
REM nada.

cd /d "%~dp0.."

echo.
echo   Iniciando el servidor local...
echo.
python tools\sirve.py

echo.
echo   El servidor se detuvo. Presiona una tecla para cerrar.
pause >nul