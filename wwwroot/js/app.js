// =========================================================
// ROSA LUMINA · Frontend (JavaScript sin frameworks)
// Consume la API de ASP.NET Core: /api/productos, /api/categorias,
// /api/inventario/resumen, /api/pedidos y /api/clima (Open-Meteo)
// =========================================================

// Si la pagina la sirve la API usamos ruta relativa; con Live Server apuntamos al puerto 5050
const API = window.location.port === "5500" ? "http://localhost:5050/api" : "/api";

const $ = (id) => document.getElementById(id);
const dinero = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

const estado = {
  categorias: [],
  productos: [],
  categoriaActiva: null,
  carrito: JSON.parse(localStorage.getItem("carrito") || "{}"), // { productoId: cantidad }
  borrarId: null
};

// ---------- Utilidades ----------
function escapar(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

const icono = (id, clase = "icon") => `<svg class="${clase}" aria-hidden="true"><use href="#${id}"/></svg>`;

function iconoCategoria(nombre = "") {
  const n = nombre.toLowerCase();
  if (n.includes("maquillaje")) return "i-brush";
  if (n.includes("piel")) return "i-droplet";
  if (n.includes("solar")) return "i-sun";
  if (n.includes("cabello")) return "i-wind";
  if (n.includes("fragancia")) return "i-flower";
  if (n.includes("uñas") || n.includes("unas")) return "i-sparkles";
  return "i-sparkles";
}
// Foto del producto (con el icono de la categoria como respaldo si no carga)
function foto(p, ancho, alto) {
  const respaldo = icono(iconoCategoria(p.categoria));
  if (!p.imagenUrl) return respaldo;
  return `<img src="${escapar(p.imagenUrl)}" alt="${escapar(p.nombre)}" width="${ancho}" height="${alto}"
    loading="lazy" decoding="async" onerror="this.replaceWith(document.createRange().createContextualFragment(this.dataset.respaldo))"
    data-respaldo='${respaldo}'>`;
}

const claseCategoria = (id) => (id >= 1 && id <= 6 ? `cat-${id}` : "cat-x");

function estadoStock(p) {
  if (p.stock === 0) return { clase: "tag-out", texto: "Agotado", icono: "i-x" };
  if (p.stock <= p.stockMinimo) return { clase: "tag-low", texto: `Quedan ${p.stock}`, icono: "i-alert" };
  return { clase: "tag-ok", texto: "Disponible", icono: "i-check" };
}

function aviso(texto, tipo = "ok") {
  const t = document.createElement("div");
  t.className = "toast" + (tipo === "error" ? " error" : "");
  t.innerHTML = icono(tipo === "error" ? "i-alert" : "i-check") + `<span>${escapar(texto)}</span>`;
  $("toasts").appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

async function pedir(ruta, opciones = {}) {
  const r = await fetch(API + ruta, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...opciones
  });
  if (r.status === 204) return null;
  const texto = await r.text();
  let datos = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch { datos = texto; }
  if (!r.ok) throw new Error((datos && (datos.mensaje || datos.detail)) || `Error ${r.status}`);
  return datos;
}

// ---------- Navegación por hash (#tienda / #inventario) ----------
function mostrarVista() {
  const vista = location.hash === "#inventario" ? "inventario" : "tienda";
  document.querySelectorAll(".vista").forEach(v => v.hidden = v.id !== `vista-${vista}`);
  document.querySelectorAll(".tab").forEach(t =>
    t.dataset.vista === vista ? t.setAttribute("aria-current", "page") : t.removeAttribute("aria-current"));
  if (vista === "inventario") cargarResumen();
  $("main").focus({ preventScroll: true });
}

// ---------- Carga de datos ----------
async function cargarCategorias() {
  estado.categorias = await pedir("/categorias");
  $("fCategoria").innerHTML = estado.categorias
    .map(c => `<option value="${c.id}">${escapar(c.nombre)}</option>`).join("");
  pintarFiltros();
}

async function cargarProductos() {
  try {
    estado.productos = await pedir("/productos");
    pintarCatalogo();
    pintarInventario();
    pintarCarrito();
  } catch (e) {
    $("catalogo").innerHTML = `<div class="empty">${icono("i-alert")}<p>No se pudo conectar con la API. ${escapar(e.message)}</p>
      <button class="btn btn-ghost" onclick="iniciar()">Reintentar</button></div>`;
  }
}

async function cargarResumen() {
  try {
    const r = await pedir("/inventario/resumen");
    $("resumen").innerHTML = `
      <div class="card stat"><div class="stat-label">Productos</div><div class="stat-value">${r.totalProductos}</div></div>
      <div class="card stat"><div class="stat-label">Unidades en stock</div><div class="stat-value">${r.totalUnidades.toLocaleString("es-MX")}</div></div>
      <div class="card stat"><div class="stat-label">Valor del inventario</div><div class="stat-value">${dinero.format(r.valorInventario)}</div></div>
      <div class="card stat warn"><div class="stat-label">Stock bajo</div><div class="stat-value">${r.bajoStock}</div></div>
      <div class="card stat danger"><div class="stat-label">Agotados</div><div class="stat-value">${r.agotados}</div></div>
      <div class="card stat"><div class="stat-label">Pedidos</div><div class="stat-value">${r.totalPedidos}</div></div>`;
  } catch (e) {
    $("resumen").innerHTML = "";
  }
}

// ---------- Tienda ----------
function pintarFiltros() {
  const chips = [{ id: null, nombre: "Todo" }, ...estado.categorias];
  $("filtros").innerHTML = chips.map(c =>
    `<button class="chip" data-cat="${c.id ?? ""}" aria-pressed="${estado.categoriaActiva === c.id}">${escapar(c.nombre)}</button>`
  ).join("");
}

function pintarCatalogo() {
  const texto = $("buscar").value.trim().toLowerCase();
  const lista = estado.productos.filter(p =>
    (estado.categoriaActiva === null || p.categoriaId === estado.categoriaActiva) &&
    (!texto || `${p.nombre} ${p.marca}`.toLowerCase().includes(texto)));

  $("conteoTienda").textContent = `${lista.length} producto${lista.length === 1 ? "" : "s"}`;

  if (!lista.length) {
    $("catalogo").innerHTML = `<div class="empty">${icono("i-search")}<p>No encontramos productos con ese filtro.</p></div>`;
    return;
  }

  $("catalogo").innerHTML = lista.map(p => {
    const st = estadoStock(p);
    const enCarrito = estado.carrito[p.id] || 0;
    const sinStock = p.stock - enCarrito <= 0;
    return `
      <article class="card product">
        <div class="product-media ${claseCategoria(p.categoriaId)}">
          ${foto(p, 600, 450)}
          <span class="tag ${st.clase} stock-tag">${icono(st.icono)}${st.texto}</span>
        </div>
        <div class="product-body">
          <span class="product-brand">${escapar(p.marca)}</span>
          <h3 class="product-name">${escapar(p.nombre)}</h3>
          <p class="product-desc">${escapar(p.descripcion || "")}</p>
          <div class="product-foot">
            <span class="price">${dinero.format(p.precio)}</span>
            <button class="btn btn-primary btn-sm" data-agregar="${p.id}" ${sinStock ? "disabled" : ""}
              aria-label="Agregar ${escapar(p.nombre)} al carrito">
              ${icono("i-plus")}${p.stock === 0 ? "Agotado" : "Agregar"}
            </button>
          </div>
        </div>
      </article>`;
  }).join("");
}

// ---------- Carrito ----------
function guardarCarrito() {
  localStorage.setItem("carrito", JSON.stringify(estado.carrito));
  pintarCarrito();
  pintarCatalogo();
}

function cambiarCantidad(id, delta) {
  const p = estado.productos.find(x => x.id === id);
  if (!p) return;
  const nueva = (estado.carrito[id] || 0) + delta;
  if (nueva <= 0) delete estado.carrito[id];
  else estado.carrito[id] = Math.min(nueva, p.stock);
  guardarCarrito();
}

function pintarCarrito() {
  // Quitamos del carrito productos que ya no existen
  for (const id of Object.keys(estado.carrito))
    if (!estado.productos.some(p => p.id === +id)) delete estado.carrito[id];

  const items = Object.entries(estado.carrito).map(([id, cant]) => ({
    p: estado.productos.find(x => x.id === +id), cant
  }));
  const piezas = items.reduce((s, i) => s + i.cant, 0);
  const total = items.reduce((s, i) => s + i.cant * i.p.precio, 0);

  $("carritoCuenta").hidden = piezas === 0;
  $("carritoCuenta").textContent = piezas;
  $("btnCarrito").setAttribute("aria-label", `Abrir carrito, ${piezas} producto${piezas === 1 ? "" : "s"}`);
  $("carritoTotal").textContent = dinero.format(total);
  $("btnComprar").disabled = piezas === 0;

  $("carritoItems").innerHTML = items.length ? items.map(({ p, cant }) => `
    <div class="cart-item">
      <div class="cart-thumb ${claseCategoria(p.categoriaId)}">${foto(p, 48, 48)}</div>
      <div>
        <h3>${escapar(p.nombre)}</h3>
        <small>${dinero.format(p.precio)} c/u</small>
      </div>
      <div class="qty">
        <button data-menos="${p.id}" aria-label="Quitar uno de ${escapar(p.nombre)}">${icono(cant === 1 ? "i-trash" : "i-minus")}</button>
        <span aria-label="Cantidad">${cant}</span>
        <button data-mas="${p.id}" ${cant >= p.stock ? "disabled" : ""} aria-label="Agregar uno de ${escapar(p.nombre)}">${icono("i-plus")}</button>
      </div>
    </div>`).join("")
    : `<div class="empty">${icono("i-bag")}<p>Tu carrito está vacío.</p></div>`;
}

async function comprar() {
  const items = Object.entries(estado.carrito).map(([productoId, cantidad]) => ({ productoId: +productoId, cantidad }));
  const btn = $("btnComprar");
  btn.disabled = true;
  btn.textContent = "Procesando…";
  try {
    const r = await pedir("/pedidos", { method: "POST", body: JSON.stringify({ items }) });
    estado.carrito = {};
    localStorage.removeItem("carrito");
    $("carrito").close();
    aviso(`Pedido #${r.id} confirmado por ${dinero.format(r.total)}`);
    await cargarProductos();
  } catch (e) {
    aviso(e.message, "error");
    await cargarProductos();
  } finally {
    btn.textContent = "Finalizar compra";
    pintarCarrito();
  }
}

// ---------- Inventario (CRUD) ----------
function pintarInventario() {
  const texto = $("buscarInv").value.trim().toLowerCase();
  const soloBajo = $("soloBajo").checked;
  const lista = estado.productos.filter(p =>
    (!texto || `${p.nombre} ${p.marca} ${p.sku}`.toLowerCase().includes(texto)) &&
    (!soloBajo || p.stock <= p.stockMinimo));

  $("tablaInv").innerHTML = lista.length ? lista.map(p => {
    const st = estadoStock(p);
    return `
      <tr>
        <td class="sku">${escapar(p.sku)}</td>
        <td class="cell-name"><strong>${escapar(p.nombre)}</strong><span>${escapar(p.marca)}</span></td>
        <td>${escapar(p.categoria)}</td>
        <td class="num">${dinero.format(p.precio)}</td>
        <td class="num">${p.stock}</td>
        <td><span class="tag ${st.clase}">${icono(st.icono)}${st.texto}</span></td>
        <td>
          <div class="row-actions">
            <button class="btn btn-icon" data-editar="${p.id}" aria-label="Editar ${escapar(p.nombre)}">${icono("i-pencil")}</button>
            <button class="btn btn-icon danger" data-borrar="${p.id}" aria-label="Eliminar ${escapar(p.nombre)}">${icono("i-trash")}</button>
          </div>
        </td>
      </tr>`;
  }).join("") : `<tr><td colspan="7" class="empty">No hay productos que coincidan.</td></tr>`;
}

function abrirFormulario(p = null) {
  $("formProducto").reset();
  $("formError").hidden = true;
  document.querySelectorAll("#formProducto [aria-invalid]").forEach(el => el.removeAttribute("aria-invalid"));
  $("fId").value = p?.id ?? "";
  $("tituloForm").textContent = p ? "Editar producto" : "Nuevo producto";
  $("btnGuardar").textContent = p ? "Guardar cambios" : "Crear producto";
  if (p) {
    $("fSku").value = p.sku;
    $("fCategoria").value = p.categoriaId;
    $("fNombre").value = p.nombre;
    $("fMarca").value = p.marca;
    $("fDescripcion").value = p.descripcion || "";
    $("fPrecio").value = Number(p.precio).toFixed(2);
    $("fStock").value = p.stock;
    $("fMinimo").value = p.stockMinimo;
    $("fImagen").value = p.imagenUrl || "";
  }
  $("dlgProducto").showModal();
  $("fSku").focus();
}

async function guardarProducto(evento) {
  evento.preventDefault();
  const campos = ["fSku", "fCategoria", "fNombre", "fMarca", "fPrecio", "fStock"];
  let primero = null;
  campos.forEach(id => {
    const el = $(id);
    const valido = el.checkValidity() && el.value.trim() !== "";
    el.toggleAttribute("aria-invalid", !valido);
    if (!valido) el.setAttribute("aria-invalid", "true");
    if (!valido && !primero) primero = el;
  });
  if (primero) {
    $("formError").textContent = "Revisa los campos marcados: son obligatorios y el precio debe ser mayor a 0.";
    $("formError").hidden = false;
    primero.focus();
    return;
  }

  const id = $("fId").value;
  const datos = {
    sku: $("fSku").value.trim(),
    categoriaId: +$("fCategoria").value,
    nombre: $("fNombre").value.trim(),
    marca: $("fMarca").value.trim(),
    descripcion: $("fDescripcion").value.trim(),
    precio: parseFloat($("fPrecio").value),
    stock: parseInt($("fStock").value, 10),
    stockMinimo: parseInt($("fMinimo").value || "0", 10),
    imagenUrl: $("fImagen").value.trim()
  };

  const btn = $("btnGuardar");
  btn.disabled = true;
  try {
    if (id) await pedir(`/productos/${id}`, { method: "PUT", body: JSON.stringify(datos) });
    else await pedir("/productos", { method: "POST", body: JSON.stringify(datos) });
    $("dlgProducto").close();
    aviso(id ? "Producto actualizado" : "Producto creado");
    await Promise.all([cargarProductos(), cargarResumen()]);
  } catch (e) {
    $("formError").textContent = e.message;
    $("formError").hidden = false;
  } finally {
    btn.disabled = false;
  }
}

function confirmarBorrado(id) {
  const p = estado.productos.find(x => x.id === id);
  estado.borrarId = id;
  $("confTexto").textContent = `Se eliminará "${p?.nombre}" (${p?.sku}) del inventario. Esta acción no se puede deshacer.`;
  $("dlgConfirmar").showModal();
}

async function borrarProducto() {
  try {
    await pedir(`/productos/${estado.borrarId}`, { method: "DELETE" });
    aviso("Producto eliminado");
    await Promise.all([cargarProductos(), cargarResumen()]);
  } catch (e) {
    aviso(e.message, "error");
  } finally {
    $("dlgConfirmar").close();
  }
}

// ---------- Clima (Open-Meteo a traves de /api/clima) ----------
const CLIMA = {
  0: ["Despejado", "i-sun"], 1: ["Mayormente despejado", "i-sun"], 2: ["Parcialmente nublado", "i-cloud-sun"],
  3: ["Nublado", "i-cloud"], 45: ["Niebla", "i-fog"], 48: ["Niebla con escarcha", "i-fog"],
  51: ["Llovizna ligera", "i-rain"], 53: ["Llovizna", "i-rain"], 55: ["Llovizna intensa", "i-rain"],
  61: ["Lluvia ligera", "i-rain"], 63: ["Lluvia", "i-rain"], 65: ["Lluvia intensa", "i-rain"],
  71: ["Nieve ligera", "i-snow"], 73: ["Nieve", "i-snow"], 75: ["Nieve intensa", "i-snow"],
  80: ["Chubascos", "i-rain"], 81: ["Chubascos", "i-rain"], 82: ["Chubascos fuertes", "i-rain"],
  95: ["Tormenta", "i-storm"], 96: ["Tormenta con granizo", "i-storm"], 99: ["Tormenta con granizo", "i-storm"]
};
const infoClima = (c) => CLIMA[c] || ["Variable", "i-cloud-sun"];

async function cargarClima() {
  const caja = $("clima");
  const [lat, lon] = $("ciudad").value.split(",");
  const ciudad = $("ciudad").selectedOptions[0].text;
  caja.setAttribute("aria-busy", "true");
  try {
    const c = await pedir(`/clima?lat=${lat}&lon=${lon}&ciudad=${encodeURIComponent(ciudad)}`);
    const [desc, ico] = infoClima(c.actual.codigo);
    const dias = c.pronostico.slice(1, 4).map(d => {
      const fecha = new Date(d.fecha + "T12:00:00");
      const [dDesc, dIco] = infoClima(d.codigo);
      return `<div><span>${fecha.toLocaleDateString("es-MX", { weekday: "short" })}</span>
        ${icono(dIco)}<span class="sr-only">${dDesc}</span>
        <strong>${Math.round(d.maxima)}°</strong> / ${Math.round(d.minima)}°</div>`;
    }).join("");
    const cat = estado.categorias.find(x => x.nombre === c.recomendacion.categoria);

    $("climaContenido").innerHTML = `
      <div class="weather-now">
        ${icono(ico, "icon big-icon")}
        <div>
          <div class="temp">${Math.round(c.actual.temperatura)}°C</div>
          <div class="weather-desc">${desc} · Sensación ${Math.round(c.actual.sensacion)}°</div>
        </div>
      </div>
      <ul class="weather-meta">
        <li>${icono("i-droplet")}Humedad ${c.actual.humedad}%</li>
        <li>${icono("i-wind")}Viento ${Math.round(c.actual.viento)} km/h</li>
        <li class="${c.uvMaximoHoy >= 6 ? "uv-alto" : ""}">${icono("i-sun")}UV máx. hoy ${c.uvMaximoHoy.toFixed(1)}</li>
      </ul>
      <div class="tip">
        ${icono("i-sparkles")}
        <div>
          <div>${escapar(c.recomendacion.texto)}</div>
          ${cat ? `<button class="btn btn-ghost btn-sm" data-ir-cat="${cat.id}">Ver ${escapar(cat.nombre.toLowerCase())}</button>` : ""}
        </div>
      </div>
      <div class="forecast" aria-label="Pronóstico de los próximos 3 días">${dias}</div>`;
  } catch (e) {
    $("climaContenido").innerHTML = `<div class="tip">${icono("i-alert")}
      <div>No pudimos obtener el clima. ${escapar(e.message)}
      <br><button class="btn btn-ghost btn-sm" onclick="cargarClima()">Reintentar</button></div></div>`;
  } finally {
    caja.setAttribute("aria-busy", "false");
  }
}

// ---------- Eventos ----------
function filtrarPorCategoria(id) {
  estado.categoriaActiva = id;
  pintarFiltros();
  pintarCatalogo();
}

$("filtros").addEventListener("click", e => {
  const b = e.target.closest("[data-cat]");
  if (b) filtrarPorCategoria(b.dataset.cat ? +b.dataset.cat : null);
});

$("clima").addEventListener("click", e => {
  const b = e.target.closest("[data-ir-cat]");
  if (!b) return;
  filtrarPorCategoria(+b.dataset.irCat);
  $("filtros").scrollIntoView({ behavior: "smooth", block: "center" });
});

let espera;
$("buscar").addEventListener("input", () => { clearTimeout(espera); espera = setTimeout(pintarCatalogo, 150); });
$("buscarInv").addEventListener("input", () => { clearTimeout(espera); espera = setTimeout(pintarInventario, 150); });
$("soloBajo").addEventListener("change", pintarInventario);
$("ciudad").addEventListener("change", cargarClima);

$("catalogo").addEventListener("click", e => {
  const b = e.target.closest("[data-agregar]");
  if (!b) return;
  const p = estado.productos.find(x => x.id === +b.dataset.agregar);
  cambiarCantidad(p.id, 1);
  aviso(`${p.nombre} agregado al carrito`);
});

$("carritoItems").addEventListener("click", e => {
  const mas = e.target.closest("[data-mas]");
  const menos = e.target.closest("[data-menos]");
  if (mas) cambiarCantidad(+mas.dataset.mas, 1);
  if (menos) cambiarCantidad(+menos.dataset.menos, -1);
});

$("tablaInv").addEventListener("click", e => {
  const ed = e.target.closest("[data-editar]");
  const bo = e.target.closest("[data-borrar]");
  if (ed) abrirFormulario(estado.productos.find(p => p.id === +ed.dataset.editar));
  if (bo) confirmarBorrado(+bo.dataset.borrar);
});

$("btnCarrito").addEventListener("click", () => $("carrito").showModal());
$("btnComprar").addEventListener("click", comprar);
$("btnNuevo").addEventListener("click", () => abrirFormulario());
$("formProducto").addEventListener("submit", guardarProducto);
$("btnConfirmarBorrar").addEventListener("click", borrarProducto);

// Botones "cerrar" y clic fuera del dialogo
document.querySelectorAll("dialog").forEach(d => {
  d.addEventListener("click", e => {
    if (e.target.closest("[data-cerrar]")) return d.close();
    if (e.target !== d) return;
    const r = d.getBoundingClientRect();
    const fuera = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (fuera) d.close();
  });
});

window.addEventListener("hashchange", mostrarVista);

// ---------- Inicio ----------
async function iniciar() {
  mostrarVista();
  try { await cargarCategorias(); } catch { /* el catalogo mostrara el error */ }
  await Promise.all([cargarProductos(), cargarClima()]);
}
iniciar();
