# Revisión de software verde · Rosa Lumina

![Software verde: 0.16 g CO2e por visita](../wwwroot/img/distintivo-verde.svg)

- **Fecha:** 23 de noviembre de 2026
- **Método:** skill `revision-verde` del repositorio
  [Interdato-SostenibilidadDigital/Ingeniero-Software-Verde-CLAUDE](https://github.com/Interdato-SostenibilidadDigital/Ingeniero-Software-Verde-CLAUDE)
  (lista de comprobación de 6 categorías, severidades 🔴/🟡/🟢/✅ y fórmula SCI).
- **Estimación de carbono:** modelo *Sustainable Web Design* v3 (el mismo que usa Website Carbon).
- **Alcance:** tienda web (`wwwroot`), API ASP.NET Core (`Program.cs`) y consultas a MySQL.
  La categoría *Cargas de IA y ML* se omite porque el sistema no tiene componentes de IA.

> El distintivo es un sello interno del proyecto que resume esta revisión.
> No es una certificación emitida por un tercero.

## Unidad funcional y límite del sistema

- **Unidad funcional (R):** una visita a la tienda (primera carga de `/`).
- **Límite:** bytes transferidos al navegador (HTML, CSS, JS, fuentes, imágenes y API) y trabajo del servidor por visita.
- **SCI = ((E × I) + M) / R.** Aquí E × I se estima con el modelo SWD v3 a partir de los bytes transferidos.
  El carbono incorporado del hardware (M) no se mide.

### Fórmula usada (SWD v3)

```
energía (kWh) = GB transferidos × 0.81 kWh/GB × (0.75 + 0.25 × 0.02)
CO2e (g)      = energía × 442 gCO2e/kWh   (intensidad promedio mundial)
```

El factor `0.75 + 0.25 × 0.02` supone que el 75% son visitas nuevas y el 25% son visitas recurrentes que solo descargan el 2% de los datos.

## Medición (antes y después)

Primera visita, página completa (todas las imágenes cargadas), con compresión Brotli si está disponible.

| Recurso | Antes | Después |
|---|---:|---:|
| HTML | 13.9 KB | 4.4 KB |
| CSS | 20.1 KB | 6.1 KB |
| JavaScript | 20.1 KB | 7.1 KB |
| API (categorías, productos, clima) | 8.2 KB | 2.5 KB |
| Fuentes (CSS + woff2) | 101.5 KB | 80.6 KB |
| Imágenes (26 fotos) | 922.2 KB | 500.7 KB |
| **Total** | **1,086 KB** | **601 KB (−45%)** |
| Primera pantalla (sin desplazarse) | — | 389 KB |
| **CO₂e por visita** | **0.28 g** | **0.155 g** |
| CO₂e por 10,000 visitas | 2.8 kg | 1.55 kg |

Otras mediciones:

- `/api/clima`: 253 ms con llamada a Open-Meteo y 3 ms al responder desde la caché.
- Visitas repetidas: las imágenes y el SVG quedan en la caché del navegador por 7 días, y CSS/JS por 1 hora.

## Hallazgos

### [Eficiencia de red] Las imágenes eran el 85% del peso de la página
Severidad: 🔴 Alta · **Corregido**
Evidencia: 26 fotos JPEG de 600×450 px que sumaban 922 KB; las tarjetas las muestran a unos 280 px.
Problema: se descargaban más píxeles y bytes de los necesarios en cada visita.
Sugerencia: WebP al tamaño real (480×360, calidad 60) y `loading="lazy"` con `width`/`height`.
Medición: 922 KB → 501 KB (−46%). La primera pantalla solo carga 16 de las 26 fotos.
Compromisos: un poco menos de nitidez en pantallas de alta densidad.

### [Eficiencia de red] Respuestas sin compresión
Severidad: 🟡 Media · **Corregido**
Evidencia: HTML, CSS, JS y JSON se enviaban sin comprimir.
Problema: el texto se comprime fácilmente; sin compresión viajaba de 3 a 4 veces más grande.
Sugerencia: `AddResponseCompression` con Brotli y Gzip.
Medición: `app.js` 20.5 KB → 6.5 KB; `styles.css` 20.1 KB → 5.3 KB.
Compromisos: un poco de CPU del servidor para comprimir.

### [Eficiencia de red] Sin caché del navegador para archivos estáticos
Severidad: 🟡 Media · **Corregido**
Evidencia: `UseStaticFiles()` sin encabezados `Cache-Control`.
Problema: en visitas repetidas el navegador podía volver a descargar las fotos.
Sugerencia: `Cache-Control: public, max-age=604800` para imágenes, `max-age=3600` para CSS/JS y `no-cache` para HTML.
Medición: en una visita repetida, las fotos no se vuelven a descargar.
Compromisos: si cambia una foto con el mismo nombre, algunos navegadores tardarán hasta 7 días en verla.

### [Cómputo y almacenamiento] El clima se pedía a Open-Meteo en cada visita
Severidad: 🟡 Media · **Corregido**
Evidencia: `/api/clima` hacía una llamada HTTP externa por cada carga de página.
Problema: trabajo y tráfico repetido para un dato que cambia poco.
Sugerencia: `IMemoryCache` de 15 minutos por coordenadas.
Medición: 253 ms → 3 ms y una sola llamada externa cada 15 minutos por ciudad.
Compromisos: el clima puede tener hasta 15 minutos de retraso.

### [Cómputo y almacenamiento] El resumen del inventario traía todas las filas
Severidad: 🟢 Baja · **Corregido**
Evidencia: `/api/inventario/resumen` cargaba todos los productos en memoria para sumarlos.
Problema: con un catálogo grande, se transfieren y procesan filas innecesarias.
Sugerencia: calcular `COUNT` y `SUM` en MySQL con una sola consulta (`GroupBy` en EF Core).
Medición: una consulta agregada en lugar de N filas.
Compromisos: ninguno relevante.

### [Eficiencia de red] Fuentes web externas
Severidad: 🟢 Baja · **Mejorado parcialmente**
Evidencia: Google Fonts (Inter y Playfair Display) suman unos 81 KB, el 14% del total.
Problema: son descargas de otro dominio en la primera visita.
Sugerencia: se redujeron los pesos pedidos (CSS de 14.8 KB → 9.1 KB). Pendiente: alojar solo el subconjunto latino localmente o usar fuentes del sistema.
Medición: comparar los KB de fuentes después del cambio.
Compromisos: con fuentes del sistema se pierde parte de la identidad visual.

### [Eficiencia energética] Sin modo oscuro
Severidad: 🟢 Baja · **Corregido**
Evidencia: la interfaz solo tenía tema claro.
Problema: en pantallas OLED un tema oscuro consume menos energía.
Sugerencia: modo oscuro que sigue `prefers-color-scheme` y tiene un botón para cambiarlo, con tokens de color y contraste AA verificado (texto 14.5:1, botón primario 6.8:1).
Medición: agrega 1.9 KB a la primera visita (un script de 0.6 KB y algo más de CSS). El ahorro de energía en OLED no se mide sin pruebas en dispositivos reales.
Compromisos: una petición más y el mantenimiento de dos paletas.

### [Nube e infraestructura] Región de despliegue
Severidad: 🟢 Baja · **Pendiente (al publicar)**
Evidencia: hoy se ejecuta en local.
Problema: la intensidad de carbono depende de la red eléctrica de la región donde se aloje.
Sugerencia: al publicar, elegir una región con energía baja en carbono y apagar entornos que no se usen.
Medición: gCO₂e/kWh de la región elegida.
Compromisos: la latencia para usuarios en México.

### ✅ Ya es sostenible
- Una sola petición de productos; el filtrado y la búsqueda se hacen en el navegador (sin llamadas extra por cada tecla).
- Sin *polling* ni recargas automáticas.
- JavaScript sin frameworks (6.5 KB comprimido).
- Imágenes con dimensiones fijas, así que la página no se reacomoda al cargar (sin CLS).
- Respeta `prefers-reduced-motion`.
- Íconos SVG en línea (sin descargas de librerías de íconos).

## Resumen

- **Hallazgos:** 🔴 1 · 🟡 3 · 🟢 4 · ✅ 6 prácticas ya sostenibles.
- **Corregidos:** 6 de 8. Peso de la primera visita **−45%**, de 1,086 KB a 601 KB.
- **Cambio de mayor prioridad:** optimizar las imágenes.
- **Incertidumbres:** el modelo SWD estima con promedios mundiales de energía por GB e intensidad de la red. No mide el consumo real del servidor ni el carbono incorporado (M).
- **¿Vale la pena una línea base SCI completa?** Solo si se publica con tráfico real. Entonces convendría medir la energía del servidor y usar la intensidad de carbono de la región elegida.

## Créditos

Fotos de productos: [Unsplash](https://unsplash.com) (Licencia Unsplash, uso gratuito).
Las marcas y productos de la tienda son inventados.
