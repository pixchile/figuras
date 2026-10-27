@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================
echo   Publicar catalogo en GitHub Pages
echo ============================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] No se encontro Node.js en el PATH.
    goto :fatal
)

where git >nul 2>&1
if errorlevel 1 (
    echo [ERROR] No se encontro Git en el PATH.
    goto :fatal
)

echo [1/3] Exportando sitio estatico...
node export.js
if errorlevel 1 (
    echo [ERROR] Fallo export.js. No se sube nada.
    goto :fatal
)

if not exist "docs\products.json" (
    echo [ERROR] No se genero docs\products.json.
    goto :fatal
)

echo.
echo [2/3] Preparando commit...
git add .
git diff --cached --quiet
if not errorlevel 1 goto :nothing

set "MSG=%~1"
if not "%MSG%"=="" goto :commit
set "MSG=Actualizar catalogo"
:commit
echo      Mensaje: %MSG%
git commit -m "%MSG%"
if errorlevel 1 (
    echo [ERROR] Fallo el commit.
    goto :fatal
)
goto :push

:nothing
echo      Sin cambios en el contenido: no hay commit nuevo.

:push
echo.
echo [3/3] Subiendo a GitHub...
git push
if errorlevel 1 (
    echo.
    echo [ERROR] Fallo el push. Revisa tu conexion/credenciales
    echo         o ejecuta: git pull --rebase
    goto :fatal
)

echo.
echo Listo. GitHub Pages se actualiza en ~1 minuto:
echo   https://pixchile.github.io/figuras/
echo.
pause
exit /b 0

:fatal
echo.
pause
exit /b 1
