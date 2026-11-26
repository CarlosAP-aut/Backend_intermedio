using System.Globalization;
using System.Text.Json;
using System.IO.Compression;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

// =========================================
// 1. CREAR LA APLICACION Y CONECTAR A MYSQL
// =========================================

var builder = WebApplication.CreateBuilder(args);

var cadenaConexion = builder.Configuration.GetConnectionString("TiendaBelleza")
    ?? throw new InvalidOperationException("Falta la cadena de conexion 'TiendaBelleza'");

builder.Services.AddDbContext<TiendaDb>(opciones =>
    opciones.UseMySql(cadenaConexion, ServerVersion.AutoDetect(cadenaConexion)));

// Cliente HTTP para consumir la API externa de Open-Meteo (clima)
builder.Services.AddHttpClient("OpenMeteo", cliente =>
{
    cliente.BaseAddress = new Uri("https://api.open-meteo.com/");
    cliente.Timeout = TimeSpan.FromSeconds(10);
});

// SOFTWARE VERDE: comprimir respuestas (Brotli/Gzip) reduce los bytes por la red
builder.Services.AddResponseCompression(o =>
{
    o.EnableForHttps = true;
    o.Providers.Add<BrotliCompressionProvider>();
    o.Providers.Add<GzipCompressionProvider>();
    o.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(["image/svg+xml"]);
});
builder.Services.Configure<BrotliCompressionProviderOptions>(o => o.Level = CompressionLevel.Optimal);
builder.Services.Configure<GzipCompressionProviderOptions>(o => o.Level = CompressionLevel.Optimal);

// SOFTWARE VERDE: cache en memoria para no repetir llamadas a la API externa del clima
builder.Services.AddMemoryCache();

// Permitimos abrir el frontend con Live Server (puerto 5500)
builder.Services.AddCors(opciones =>
    opciones.AddDefaultPolicy(politica =>
        politica.WithOrigins("http://127.0.0.1:5500", "http://localhost:5500")
                .AllowAnyHeader()
                .AllowAnyMethod()));

// Swagger: documentacion interactiva de la API en /swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(opciones =>
    opciones.SwaggerDoc("v1", new()
    {
        Title = "API Tienda de Belleza Rosa Lumina",
        Version = "v1",
        Description = "Inventario en MySQL (productos, categorias, pedidos) y clima con Open-Meteo."
    }));

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI(opciones =>
{
    opciones.SwaggerEndpoint("/swagger/v1/swagger.json", "Rosa Lumina v1");
    opciones.DocumentTitle = "Rosa Lumina · Swagger";
});

app.UseResponseCompression();
app.UseCors();
app.UseDefaultFiles();

// SOFTWARE VERDE: el navegador reutiliza imagenes por 7 dias y CSS/JS por 1 hora
// (en visitas repetidas no se vuelven a descargar)
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        var ruta = ctx.File.Name;
        var segundos = ruta.EndsWith(".webp") || ruta.EndsWith(".svg") ? 604800
                     : ruta.EndsWith(".html") ? 0 : 3600;
        ctx.Context.Response.Headers.CacheControl = segundos == 0 ? "no-cache" : $"public, max-age={segundos}";
    }
});


// =========================================
// 2. ENDPOINT DE BIENVENIDA
// =========================================

app.MapGet("/api", () => Results.Ok(new
{
    mensaje = "API de la tienda de belleza Rosa Lumina funcionando con MySQL"
}))
.WithTags("General");


// =========================================
// 3. CATEGORIAS
// =========================================

app.MapGet("/api/categorias", async (TiendaDb db) =>
{
    var categorias = await db.Categorias
        .OrderBy(c => c.Nombre)
        .Select(c => new
        {
            c.Id,
            c.Nombre,
            c.Descripcion,
            TotalProductos = db.Productos.Count(p => p.CategoriaId == c.Id)
        })
        .ToListAsync();

    return Results.Ok(categorias);
})
.WithTags("Categorias");


// =========================================
// 4. GET - CONSULTAR PRODUCTOS (con filtros)
//    /api/productos?categoriaId=2&buscar=suero
// =========================================

app.MapGet("/api/productos", async (int? categoriaId, string? buscar, TiendaDb db) =>
{
    var consulta = db.Productos.AsQueryable();

    if (categoriaId is not null)
        consulta = consulta.Where(p => p.CategoriaId == categoriaId);

    if (!string.IsNullOrWhiteSpace(buscar))
    {
        var texto = buscar.Trim();
        consulta = consulta.Where(p =>
            p.Nombre.Contains(texto) || p.Marca.Contains(texto) || p.Sku.Contains(texto));
    }

    var productos = await consulta
        .OrderBy(p => p.Nombre)
        .Select(p => new ProductoVista(
            p.Id, p.Sku, p.Nombre, p.Marca, p.CategoriaId, p.Categoria!.Nombre,
            p.Descripcion, p.Precio, p.Stock, p.StockMinimo, p.ImagenUrl))
        .ToListAsync();

    return Results.Ok(productos);
})
.WithTags("Productos");


// =========================================
// 5. GET - CONSULTAR UN PRODUCTO POR ID
// =========================================

app.MapGet("/api/productos/{id:int}", async (int id, TiendaDb db) =>
{
    var producto = await db.Productos
        .Where(p => p.Id == id)
        .Select(p => new ProductoVista(
            p.Id, p.Sku, p.Nombre, p.Marca, p.CategoriaId, p.Categoria!.Nombre,
            p.Descripcion, p.Precio, p.Stock, p.StockMinimo, p.ImagenUrl))
        .FirstOrDefaultAsync();

    return producto is null
        ? Results.NotFound(new { mensaje = "Producto no encontrado" })
        : Results.Ok(producto);
})
.WithTags("Productos");


// =========================================
// 6. POST - CREAR PRODUCTO
// =========================================

app.MapPost("/api/productos", async (DatosProducto datos, TiendaDb db) =>
{
    var error = await Validar(datos, db, idActual: null);
    if (error is not null)
        return Results.BadRequest(new { mensaje = error });

    var nuevo = new Producto();
    CopiarDatos(datos, nuevo);

    db.Productos.Add(nuevo);
    await db.SaveChangesAsync();   // INSERT

    return Results.Created($"/api/productos/{nuevo.Id}", new { nuevo.Id });
})
.WithTags("Productos");


// =========================================
// 7. PUT - ACTUALIZAR PRODUCTO
// =========================================

app.MapPut("/api/productos/{id:int}", async (int id, DatosProducto datos, TiendaDb db) =>
{
    var producto = await db.Productos.FindAsync(id);
    if (producto is null)
        return Results.NotFound(new { mensaje = "Producto no encontrado" });

    var error = await Validar(datos, db, idActual: id);
    if (error is not null)
        return Results.BadRequest(new { mensaje = error });

    CopiarDatos(datos, producto);
    await db.SaveChangesAsync();   // UPDATE

    return Results.Ok(new { producto.Id });
})
.WithTags("Productos");


// =========================================
// 8. DELETE - ELIMINAR PRODUCTO
// =========================================

app.MapDelete("/api/productos/{id:int}", async (int id, TiendaDb db) =>
{
    var producto = await db.Productos.FindAsync(id);
    if (producto is null)
        return Results.NotFound(new { mensaje = "Producto no encontrado" });

    // Si el producto ya aparece en pedidos, la llave foranea impide borrarlo
    var tieneVentas = await db.PedidoDetalles.AnyAsync(d => d.ProductoId == id);
    if (tieneVentas)
        return Results.Conflict(new
        {
            mensaje = "El producto tiene ventas registradas; en lugar de borrarlo, deja su stock en 0."
        });

    db.Productos.Remove(producto);
    await db.SaveChangesAsync();   // DELETE

    return Results.NoContent();
})
.WithTags("Productos");


// =========================================
// 9. RESUMEN DEL INVENTARIO
// =========================================

app.MapGet("/api/inventario/resumen", async (TiendaDb db) =>
{
    // SOFTWARE VERDE: MySQL calcula los totales en una sola consulta
    // (no traemos todas las filas a memoria)
    var r = await db.Productos
        .GroupBy(p => 1)
        .Select(g => new
        {
            totalProductos = g.Count(),
            totalUnidades = g.Sum(p => p.Stock),
            valorInventario = g.Sum(p => p.Precio * p.Stock),
            bajoStock = g.Count(p => p.Stock > 0 && p.Stock <= p.StockMinimo),
            agotados = g.Count(p => p.Stock == 0)
        })
        .FirstOrDefaultAsync();

    return Results.Ok(new
    {
        totalProductos = r?.totalProductos ?? 0,
        totalUnidades = r?.totalUnidades ?? 0,
        valorInventario = Math.Round(r?.valorInventario ?? 0m, 2),
        bajoStock = r?.bajoStock ?? 0,
        agotados = r?.agotados ?? 0,
        totalPedidos = await db.Pedidos.CountAsync()
    });
})
.WithTags("Inventario");


// =========================================
// 10. POST - REGISTRAR UN PEDIDO (descuenta stock)
// =========================================

app.MapPost("/api/pedidos", async (DatosPedido datos, TiendaDb db) =>
{
    if (datos.Items is null || datos.Items.Count == 0 || datos.Items.Any(i => i.Cantidad <= 0))
        return Results.BadRequest(new { mensaje = "El pedido no tiene productos validos." });

    // Transaccion: o se guarda todo el pedido o no se guarda nada
    await using var transaccion = await db.Database.BeginTransactionAsync();

    var ids = datos.Items.Select(i => i.ProductoId).Distinct().ToList();
    var productos = await db.Productos.Where(p => ids.Contains(p.Id)).ToDictionaryAsync(p => p.Id);

    var pedido = new Pedido { Fecha = DateTime.Now };

    foreach (var item in datos.Items.GroupBy(i => i.ProductoId))
    {
        var cantidad = item.Sum(i => i.Cantidad);

        if (!productos.TryGetValue(item.Key, out var producto))
            return Results.BadRequest(new { mensaje = $"El producto {item.Key} no existe." });

        if (producto.Stock < cantidad)
            return Results.Conflict(new
            {
                mensaje = $"Solo quedan {producto.Stock} unidad(es) de \"{producto.Nombre}\"."
            });

        producto.Stock -= cantidad;
        pedido.Detalles.Add(new PedidoDetalle
        {
            ProductoId = producto.Id,
            Cantidad = cantidad,
            PrecioUnitario = producto.Precio
        });
    }

    pedido.Total = pedido.Detalles.Sum(d => d.Cantidad * d.PrecioUnitario);

    db.Pedidos.Add(pedido);
    await db.SaveChangesAsync();
    await transaccion.CommitAsync();

    return Results.Created($"/api/pedidos/{pedido.Id}", new { pedido.Id, pedido.Total });
})
.WithTags("Pedidos");


// =========================================
// 11. CLIMA - API EXTERNA OPEN-METEO
//     /api/clima?lat=25.68&lon=-100.31&ciudad=Monterrey
// =========================================

app.MapGet("/api/clima", async (double? lat, double? lon, string? ciudad,
                                IHttpClientFactory fabrica, IConfiguration config, IMemoryCache cache) =>
{
    var latitud = lat ?? config.GetValue<double>("Clima:Latitud");
    var longitud = lon ?? config.GetValue<double>("Clima:Longitud");
    var nombreCiudad = ciudad ?? config["Clima:Ciudad"] ?? "";

    // SOFTWARE VERDE: el clima cambia poco; reutilizamos la respuesta 15 minutos
    var clave = $"clima:{Math.Round(latitud, 2)}:{Math.Round(longitud, 2)}";
    if (cache.TryGetValue(clave, out object? guardado))
        return Results.Ok(guardado);

    var inv = CultureInfo.InvariantCulture;
    var url = "v1/forecast" +
              $"?latitude={latitud.ToString(inv)}&longitude={longitud.ToString(inv)}" +
              "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,uv_index" +
              "&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max" +
              "&timezone=auto&forecast_days=4";

    try
    {
        var cliente = fabrica.CreateClient("OpenMeteo");
        using var respuesta = await cliente.GetAsync(url);
        if (!respuesta.IsSuccessStatusCode)
            return Results.Problem("Open-Meteo respondio con error " + (int)respuesta.StatusCode, statusCode: 502);

        using var json = JsonDocument.Parse(await respuesta.Content.ReadAsStringAsync());
        var actual = json.RootElement.GetProperty("current");
        var diario = json.RootElement.GetProperty("daily");

        var uv = actual.TryGetProperty("uv_index", out var uvActual) && uvActual.ValueKind == JsonValueKind.Number
            ? uvActual.GetDouble()
            : diario.GetProperty("uv_index_max")[0].GetDouble();
        var humedad = actual.GetProperty("relative_humidity_2m").GetInt32();

        var pronostico = new List<object>();
        for (var i = 0; i < diario.GetProperty("time").GetArrayLength(); i++)
        {
            pronostico.Add(new
            {
                fecha = diario.GetProperty("time")[i].GetString(),
                codigo = diario.GetProperty("weather_code")[i].GetInt32(),
                maxima = diario.GetProperty("temperature_2m_max")[i].GetDouble(),
                minima = diario.GetProperty("temperature_2m_min")[i].GetDouble(),
                uvMaximo = diario.GetProperty("uv_index_max")[i].GetDouble()
            });
        }

        var resultado = new
        {
            ciudad = nombreCiudad,
            fuente = "Open-Meteo (api.open-meteo.com)",
            actual = new
            {
                temperatura = actual.GetProperty("temperature_2m").GetDouble(),
                sensacion = actual.GetProperty("apparent_temperature").GetDouble(),
                humedad,
                viento = actual.GetProperty("wind_speed_10m").GetDouble(),
                codigo = actual.GetProperty("weather_code").GetInt32(),
                uv
            },
            pronostico,
            // Usamos el UV maximo del dia (de noche el UV actual es 0)
            uvMaximoHoy = diario.GetProperty("uv_index_max")[0].GetDouble(),
            recomendacion = RecomendacionPiel(diario.GetProperty("uv_index_max")[0].GetDouble(), humedad)
        };

        cache.Set(clave, (object)resultado, TimeSpan.FromMinutes(15));
        return Results.Ok(resultado);
    }
    catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
    {
        return Results.Problem("No se pudo conectar con Open-Meteo: " + ex.Message, statusCode: 503);
    }
})
.WithTags("Clima (Open-Meteo)");


// =========================================
// 12. INICIAR EL SERVIDOR
// =========================================

app.Run();


// =========================================
// 13. FUNCIONES DE APOYO
// =========================================

static async Task<string?> Validar(DatosProducto d, TiendaDb db, int? idActual)
{
    if (string.IsNullOrWhiteSpace(d.Sku)) return "El SKU es obligatorio.";
    if (string.IsNullOrWhiteSpace(d.Nombre)) return "El nombre es obligatorio.";
    if (string.IsNullOrWhiteSpace(d.Marca)) return "La marca es obligatoria.";
    if (d.Precio <= 0) return "El precio debe ser mayor a 0.";
    if (d.Stock < 0) return "El stock no puede ser negativo.";
    if (d.StockMinimo < 0) return "El stock minimo no puede ser negativo.";
    if (!await db.Categorias.AnyAsync(c => c.Id == d.CategoriaId)) return "La categoria no existe.";

    var sku = d.Sku.Trim().ToUpperInvariant();
    if (await db.Productos.AnyAsync(p => p.Sku == sku && p.Id != idActual))
        return $"Ya existe un producto con el SKU {sku}.";

    return null;
}

static void CopiarDatos(DatosProducto d, Producto p)
{
    p.Sku = d.Sku.Trim().ToUpperInvariant();
    p.Nombre = d.Nombre.Trim();
    p.Marca = d.Marca.Trim();
    p.CategoriaId = d.CategoriaId;
    p.Descripcion = string.IsNullOrWhiteSpace(d.Descripcion) ? null : d.Descripcion.Trim();
    p.Precio = d.Precio;
    p.Stock = d.Stock;
    p.StockMinimo = d.StockMinimo;
    p.ImagenUrl = string.IsNullOrWhiteSpace(d.ImagenUrl) ? null : d.ImagenUrl.Trim();
}

// Relaciona el clima con el cuidado de la piel (y con categorias de la tienda)
static object RecomendacionPiel(double uv, int humedad)
{
    if (uv >= 6)
        return new { texto = $"Hoy el índice UV llega a {uv:0.#} (alto). Usa protector FPS 50 y reaplica cada 2 horas.", categoria = "Protección solar" };
    if (uv >= 3)
        return new { texto = $"Hoy el índice UV llega a {uv:0.#} (moderado). No olvides tu protector solar.", categoria = "Protección solar" };
    if (humedad < 35)
        return new { texto = $"Ambiente seco ({humedad}% de humedad). Refuerza la hidratacion de tu piel.", categoria = "Cuidado de la piel" };
    if (humedad > 75)
        return new { texto = $"Mucha humedad ({humedad}%). Controla el frizz y prefiere texturas ligeras.", categoria = "Cabello" };
    return new { texto = "Clima templado: ideal para tu rutina de siempre.", categoria = "Maquillaje" };
}


// =========================================
// 14. CONTEXTO DE BASE DE DATOS
// =========================================

public class TiendaDb(DbContextOptions<TiendaDb> opciones) : DbContext(opciones)
{
    public DbSet<Categoria> Categorias => Set<Categoria>();
    public DbSet<Producto> Productos => Set<Producto>();
    public DbSet<Pedido> Pedidos => Set<Pedido>();
    public DbSet<PedidoDetalle> PedidoDetalles => Set<PedidoDetalle>();

    protected override void OnModelCreating(ModelBuilder mb)
    {
        mb.Entity<Categoria>(e =>
        {
            e.ToTable("categorias");
            e.Property(c => c.Id).HasColumnName("id");
            e.Property(c => c.Nombre).HasColumnName("nombre");
            e.Property(c => c.Descripcion).HasColumnName("descripcion");
        });

        mb.Entity<Producto>(e =>
        {
            e.ToTable("productos");
            e.Property(p => p.Id).HasColumnName("id");
            e.Property(p => p.Sku).HasColumnName("sku");
            e.Property(p => p.Nombre).HasColumnName("nombre");
            e.Property(p => p.Marca).HasColumnName("marca");
            e.Property(p => p.CategoriaId).HasColumnName("categoria_id");
            e.Property(p => p.Descripcion).HasColumnName("descripcion");
            e.Property(p => p.Precio).HasColumnName("precio").HasPrecision(10, 2);
            e.Property(p => p.Stock).HasColumnName("stock");
            e.Property(p => p.StockMinimo).HasColumnName("stock_minimo");
            e.Property(p => p.ImagenUrl).HasColumnName("imagen_url");
            e.HasOne(p => p.Categoria).WithMany().HasForeignKey(p => p.CategoriaId);
        });

        mb.Entity<Pedido>(e =>
        {
            e.ToTable("pedidos");
            e.Property(p => p.Id).HasColumnName("id");
            e.Property(p => p.Fecha).HasColumnName("fecha");
            e.Property(p => p.Total).HasColumnName("total").HasPrecision(10, 2);
            e.HasMany(p => p.Detalles).WithOne().HasForeignKey(d => d.PedidoId);
        });

        mb.Entity<PedidoDetalle>(e =>
        {
            e.ToTable("pedido_detalle");
            e.Property(d => d.Id).HasColumnName("id");
            e.Property(d => d.PedidoId).HasColumnName("pedido_id");
            e.Property(d => d.ProductoId).HasColumnName("producto_id");
            e.Property(d => d.Cantidad).HasColumnName("cantidad");
            e.Property(d => d.PrecioUnitario).HasColumnName("precio_unitario").HasPrecision(10, 2);
        });
    }
}


// =========================================
// 15. MODELOS DE DATOS
// =========================================

public class Categoria
{
    public int Id { get; set; }
    public string Nombre { get; set; } = "";
    public string? Descripcion { get; set; }
}

public class Producto
{
    public int Id { get; set; }
    public string Sku { get; set; } = "";
    public string Nombre { get; set; } = "";
    public string Marca { get; set; } = "";
    public int CategoriaId { get; set; }
    public Categoria? Categoria { get; set; }
    public string? Descripcion { get; set; }
    public decimal Precio { get; set; }
    public int Stock { get; set; }
    public int StockMinimo { get; set; }
    public string? ImagenUrl { get; set; }
}

public class Pedido
{
    public int Id { get; set; }
    public DateTime Fecha { get; set; }
    public decimal Total { get; set; }
    public List<PedidoDetalle> Detalles { get; set; } = [];
}

public class PedidoDetalle
{
    public int Id { get; set; }
    public int PedidoId { get; set; }
    public int ProductoId { get; set; }
    public int Cantidad { get; set; }
    public decimal PrecioUnitario { get; set; }
}

// Lo que devuelve la API al consultar productos
public record ProductoVista(
    int Id, string Sku, string Nombre, string Marca, int CategoriaId, string Categoria,
    string? Descripcion, decimal Precio, int Stock, int StockMinimo, string? ImagenUrl);

// Lo que envia el cliente para crear/editar
public class DatosProducto
{
    public string Sku { get; set; } = "";
    public string Nombre { get; set; } = "";
    public string Marca { get; set; } = "";
    public int CategoriaId { get; set; }
    public string? Descripcion { get; set; }
    public decimal Precio { get; set; }
    public int Stock { get; set; }
    public int StockMinimo { get; set; } = 5;
    public string? ImagenUrl { get; set; }
}

public class DatosPedido
{
    public List<ItemPedido> Items { get; set; } = [];
}

public class ItemPedido
{
    public int ProductoId { get; set; }
    public int Cantidad { get; set; }
}
