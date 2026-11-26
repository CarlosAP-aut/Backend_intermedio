// =========================================================
// TEMA CLARO / OSCURO
// Se carga en <head> (antes de pintar) para evitar un parpadeo.
// Por defecto sigue al sistema; si el usuario elige, se recuerda.
// =========================================================
(function () {
  const raiz = document.documentElement;
  const sistema = window.matchMedia("(prefers-color-scheme: dark)");
  const guardado = () => localStorage.getItem("tema"); // "light" | "dark" | null

  function aplicar(tema) {
    raiz.dataset.theme = tema;
    const boton = document.getElementById("btnTema");
    if (boton) {
      const oscuro = tema === "dark";
      boton.setAttribute("aria-pressed", String(oscuro));
      boton.setAttribute("aria-label", oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro");
      boton.title = boton.getAttribute("aria-label");
    }
  }

  aplicar(guardado() || (sistema.matches ? "dark" : "light"));

  // Si el usuario no ha elegido, seguimos los cambios del sistema
  sistema.addEventListener("change", e => { if (!guardado()) aplicar(e.matches ? "dark" : "light"); });

  document.addEventListener("DOMContentLoaded", () => {
    aplicar(raiz.dataset.theme);
    document.getElementById("btnTema")?.addEventListener("click", () => {
      const nuevo = raiz.dataset.theme === "dark" ? "light" : "dark";
      localStorage.setItem("tema", nuevo);
      aplicar(nuevo);
    });
  });
})();
