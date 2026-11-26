# Rosa Lumina · Tienda de belleza

[![Software verde: 0.16 g CO2e por visita](wwwroot/img/distintivo-verde.svg)](docs/REVISION-VERDE.md)

Proyecto final de Backend Intermedio: tienda de productos de belleza con inventario en **MySQL**,
API en **ASP.NET Core (Minimal API + EF Core / Pomelo)** y una sección de clima con la API pública de **Open-Meteo**.

## Cómo ejecutarlo

1. Crear la base de datos (borra y recrea `tienda_belleza` con datos de ejemplo):
   ```powershell
   & "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" -u root -p --default-character-set=utf8mb4 -e "source database/tienda_belleza.sql"
   ```
2. Revisar la cadena de conexión en `appsettings.json` (usuario/contraseña de MySQL).
3. Ejecutar:
   ```powershell
   dotnet run --launch-profile http
   ```

| Qué | URL |
|---|---|
| Tienda (frontend) | http://localhost:5050/ |
| Inventario | http://localhost:5050/#inventario |
| Swagger | http://localhost:5050/swagger |
| Huella de carbono | http://localhost:5050/sostenibilidad.html |
| API | http://localhost:5050/api |

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/categorias` | Categorías con número de productos |
| GET | `/api/productos?categoriaId=&buscar=` | Lista de productos con filtros |
| GET | `/api/productos/{id}` | Un producto |
| POST | `/api/productos` | Crear producto (valida SKU único, precio > 0, stock ≥ 0) |
| PUT | `/api/productos/{id}` | Actualizar producto |
| DELETE | `/api/productos/{id}` | Eliminar (409 si ya tiene ventas) |
| GET | `/api/inventario/resumen` | Totales, valor del inventario, stock bajo y agotados |
| POST | `/api/pedidos` | Registrar compra; descuenta stock dentro de una transacción |
| GET | `/api/clima?lat=&lon=&ciudad=` | Clima actual + pronóstico (Open-Meteo) y recomendación para la piel |

## Base de datos

`categorias` 1—N `productos`; `pedidos` 1—N `pedido_detalle` N—1 `productos`.
Las marcas y productos son inventados.

## Software verde (huella de carbono)

El proyecto se revisó con la skill `revision-verde`
([Ingeniero-Software-Verde-CLAUDE](https://github.com/Interdato-SostenibilidadDigital/Ingeniero-Software-Verde-CLAUDE))
y se estimó su huella con el modelo Sustainable Web Design v3.
La primera visita bajó de 1,086 KB a 601 KB, es decir de **0.28 a 0.155 g CO₂e por visita (−45%)**.
Reporte completo: [docs/REVISION-VERDE.md](docs/REVISION-VERDE.md).

Cambios aplicados: imágenes WebP a su tamaño real, compresión Brotli/Gzip, caché del navegador,
caché de 15 minutos para el clima, totales del inventario calculados en MySQL y modo oscuro.

Fotos de productos: [Unsplash](https://unsplash.com) (licencia gratuita).
