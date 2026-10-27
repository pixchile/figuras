/**
 * ═══════════════════════════════════════════════════════════════
 *  BANNER DE ANUNCIOS — Configuración y lógica
 *  Para agregar o editar anuncios, solo modificá el array SLIDES.
 *  Las imágenes van en la carpeta /banner/ de la raíz del sitio.
 * ═══════════════════════════════════════════════════════════════
 */

const BANNER_CONFIG = {
  /** Intervalo entre slides en milisegundos */
  interval: 6000,

  /** Duración de la animación de transición en ms */
  transitionDuration: 600,

  /** Pausa el auto-slide cuando el usuario hace hover */
  pauseOnHover: true,
};

/**
 * Cada slide acepta:
 *  - image    {string}  Archivo dentro de /banner/                      (requerido)
 *  - tone     {string}  "dark" | "light"  → color del texto y del velo
 *  - align    {string}  "left" | "right"  → lado donde se apoya el texto
 *  - eyebrow  {string}  Antetítulo corto en mayúsculas
 *  - title    {string}  Titular principal
 *  - subtitle {string}  Línea de apoyo
 *  - cta      {object}  { label, href }  → botón opcional
 *
 * Las imágenes deben venir SIN texto. El texto real lo pone este script,
 * así se adapta a móvil y sigue siendo legible para buscadores.
 */
const SLIDES = [
  {
    image:    "banner.webp",
    tone:     "dark",
    align:    "left",
    eyebrow:  "Hecho a mano",
    title:    "Diseños exclusivos",
    subtitle: "Figuras armables que no vas a encontrar en otro lugar.",
    cta:      { label: "Ver catálogo", href: "#catalogo" },
  },
  {
    image:    "banner2.webp",
    tone:     "light",
    align:    "left",
    eyebrow:  "A pedido",
    title:    "¿No ves tu figura?",
    subtitle: "Cuéntanos cuál quieres y la diseñamos para ti.",
    cta:      { label: "Hablemos por WhatsApp", href: "https://wa.me/56954678849" },
  },
  // ── Agregá más slides acá ──────────────────────────────────────
  // {
  //   image:    "banner3.webp",
  //   tone:     "dark",
  //   align:    "right",
  //   eyebrow:  "Envíos",
  //   title:    "A todo Chile",
  //   subtitle: "BlueExpress, gratis sobre $40.000.",
  //   cta:      { label: "Ver catálogo", href: "#catalogo" },
  // },
];

/* ════════════════════════════════════════════════════════════════
   Lógica interna — no es necesario modificar nada de aquí abajo
   ════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const PAUSE_ICON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"></rect><rect x="14" y="5" width="4" height="14" rx="1"></rect></svg>';
  const PLAY_ICON  = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>';

  let currentSlide = 0;
  let autoTimer = null;
  let isTransitioning = false;
  let userPaused = false;

  function getWrapper() {
    return document.getElementById("bannerWrapper");
  }

  /** Reinicia la barra de progreso del slide actual */
  function restartProgress() {
    const bar = document.querySelector(".banner-progress span");
    if (!bar) return;
    bar.style.animation = "none";
    void bar.offsetWidth;
    bar.style.animation = "";
  }

  /** Actualiza contador y progreso */
  function updateChrome(index) {
    const counter = document.getElementById("bannerCounter");
    if (counter) {
      counter.textContent = (index + 1) + " / " + SLIDES.length;
    }
    restartProgress();
  }

  function updatePauseButton() {
    const btn = document.querySelector(".banner-pause");
    if (!btn) return;
    btn.innerHTML = userPaused ? PLAY_ICON : PAUSE_ICON;
    btn.setAttribute("aria-label", userPaused ? "Reanudar anuncios" : "Pausar anuncios");
    btn.title = userPaused ? "Reanudar anuncios" : "Pausar anuncios";
  }

  /** Construye el contenido de texto de un slide */
  function buildContent(slide) {
    const content = document.createElement("div");
    content.className = "banner-content";

    if (slide.eyebrow) {
      const eyebrow = document.createElement("p");
      eyebrow.className = "banner-eyebrow";
      eyebrow.textContent = slide.eyebrow;
      content.appendChild(eyebrow);
    }

    const title = document.createElement("p");
    title.className = "banner-title";
    title.textContent = slide.title;
    content.appendChild(title);

    if (slide.subtitle) {
      const subtitle = document.createElement("p");
      subtitle.className = "banner-subtitle";
      subtitle.textContent = slide.subtitle;
      content.appendChild(subtitle);
    }

    if (slide.cta && slide.cta.href) {
      const cta = document.createElement("a");
      cta.className = "banner-cta";
      cta.href = slide.cta.href;
      cta.textContent = slide.cta.label || "Ver más";
      if (/^https?:/i.test(slide.cta.href)) {
        cta.target = "_blank";
        cta.rel = "noopener noreferrer";
      }
      content.appendChild(cta);
    }

    return content;
  }

  /** Construye el HTML del banner e inyecta los slides */
  function buildBanner() {
    const wrapper = getWrapper();
    if (!wrapper || SLIDES.length === 0) return;

    wrapper.style.setProperty("--banner-duration", BANNER_CONFIG.interval + "ms");
    wrapper.setAttribute("role", "region");
    wrapper.setAttribute("aria-label", "Anuncios y ofertas");

    /* Track (contiene todos los slides uno al lado del otro) */
    const track = document.createElement("div");
    track.className = "banner-track";
    track.id = "bannerTrack";

    SLIDES.forEach(function (slide, index) {
      const item = document.createElement("div");
      item.className = "banner-slide" + (index === 0 ? " active" : "");
      item.setAttribute("aria-hidden", index !== 0 ? "true" : "false");
      item.dataset.tone = slide.tone || "dark";
      item.dataset.align = slide.align || "left";

      const img = document.createElement("img");
      img.src = "./banner/" + slide.image;
      img.alt = slide.title ? "" : (slide.alt || "");
      img.width = 2400;
      img.height = 800;
      /* ✅ Sin lazy loading — se precarga todo junto */
      img.loading = "eager";
      img.fetchPriority = index === 0 ? "high" : "auto";
      img.decoding = "async";
      img.draggable = false;
      item.appendChild(img);

      if (slide.title) {
        const scrim = document.createElement("div");
        scrim.className = "banner-scrim";
        scrim.setAttribute("aria-hidden", "true");
        item.appendChild(scrim);
        item.appendChild(buildContent(slide));
      }

      track.appendChild(item);
    });

    wrapper.appendChild(track);

    /* Puntos de navegación, flechas, contador y progreso */
    if (SLIDES.length > 1) {
      const dotsContainer = document.createElement("div");
      dotsContainer.className = "banner-dots";
      dotsContainer.setAttribute("role", "tablist");
      dotsContainer.setAttribute("aria-label", "Navegación de anuncios");

      SLIDES.forEach(function (_, index) {
        const dot = document.createElement("button");
        dot.className = "banner-dot" + (index === 0 ? " active" : "");
        dot.setAttribute("role", "tab");
        dot.setAttribute("aria-selected", index === 0 ? "true" : "false");
        dot.setAttribute("aria-label", "Anuncio " + (index + 1));
        dot.addEventListener("click", function () { goToSlide(index); });
        dotsContainer.appendChild(dot);
      });

      wrapper.appendChild(dotsContainer);

      const prevBtn = document.createElement("button");
      prevBtn.className = "banner-arrow banner-arrow-prev";
      prevBtn.innerHTML = "&#8249;";
      prevBtn.setAttribute("aria-label", "Anuncio anterior");
      prevBtn.addEventListener("click", function () { goToSlide(currentSlide - 1); });

      const nextBtn = document.createElement("button");
      nextBtn.className = "banner-arrow banner-arrow-next";
      nextBtn.innerHTML = "&#8250;";
      nextBtn.setAttribute("aria-label", "Siguiente anuncio");
      nextBtn.addEventListener("click", function () { goToSlide(currentSlide + 1); });

      wrapper.appendChild(prevBtn);
      wrapper.appendChild(nextBtn);

      const counter = document.createElement("div");
      counter.className = "banner-counter";
      counter.id = "bannerCounter";
      counter.textContent = "1 / " + SLIDES.length;
      wrapper.appendChild(counter);

      if (!reduceMotion) {
        const pauseBtn = document.createElement("button");
        pauseBtn.type = "button";
        pauseBtn.className = "banner-pause";
        pauseBtn.innerHTML = PAUSE_ICON;
        pauseBtn.setAttribute("aria-label", "Pausar anuncios");
        pauseBtn.title = "Pausar anuncios";
        pauseBtn.addEventListener("click", function () {
          userPaused = !userPaused;
          updatePauseButton();
          if (userPaused) stopAuto();
          else startAuto();
        });
        wrapper.appendChild(pauseBtn);
      }

      const progress = document.createElement("div");
      progress.className = "banner-progress";
      progress.setAttribute("aria-hidden", "true");
      progress.appendChild(document.createElement("span"));
      wrapper.appendChild(progress);
    }

    /* Pausa en hover */
    if (BANNER_CONFIG.pauseOnHover) {
      wrapper.addEventListener("mouseenter", stopAuto);
      wrapper.addEventListener("mouseleave", startAuto);
      wrapper.addEventListener("focusin", stopAuto);
      wrapper.addEventListener("focusout", startAuto);
    }

    /* Navegación con teclado */
    wrapper.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft")  { e.preventDefault(); goToSlide(currentSlide - 1); }
      if (e.key === "ArrowRight") { e.preventDefault(); goToSlide(currentSlide + 1); }
    });

    /* Soporte táctil (swipe) */
    let touchStartX = 0;
    wrapper.addEventListener("touchstart", function (e) {
      touchStartX = e.changedTouches[0].clientX;
    }, { passive: true });
    wrapper.addEventListener("touchend", function (e) {
      const delta = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(delta) > 40) {
        goToSlide(delta < 0 ? currentSlide + 1 : currentSlide - 1);
      }
    }, { passive: true });

    /* Pausa cuando la pestaña no está visible */
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stopAuto();
      else startAuto();
    });
  }

  /** Muestra el slide indicado */
  function goToSlide(index) {
    if (isTransitioning || SLIDES.length <= 1) return;

    /* Wrap circular */
    const total = SLIDES.length;
    index = ((index % total) + total) % total;

    if (index === currentSlide) return;

    isTransitioning = true;

    const slides = document.querySelectorAll(".banner-slide");
    const dots   = document.querySelectorAll(".banner-dot");

    slides[currentSlide].classList.remove("active");
    slides[currentSlide].setAttribute("aria-hidden", "true");
    if (dots[currentSlide]) {
      dots[currentSlide].classList.remove("active");
      dots[currentSlide].setAttribute("aria-selected", "false");
    }

    currentSlide = index;

    slides[currentSlide].classList.add("active");
    slides[currentSlide].setAttribute("aria-hidden", "false");
    if (dots[currentSlide]) {
      dots[currentSlide].classList.add("active");
      dots[currentSlide].setAttribute("aria-selected", "true");
    }

    updateChrome(currentSlide);

    setTimeout(function () { isTransitioning = false; }, BANNER_CONFIG.transitionDuration);

    /* Reinicia el timer para que no cambie justo después de navegar */
    stopAuto();
    startAuto();
  }

  function clearTimer() {
    clearInterval(autoTimer);
    autoTimer = null;
  }

  function startAuto() {
    const wrapper = getWrapper();
    if (!wrapper) return;

    if (SLIDES.length <= 1 || reduceMotion || userPaused || document.hidden) {
      wrapper.classList.add("is-paused");
      clearTimer();
      return;
    }

    wrapper.classList.remove("is-paused");
    clearTimer();
    restartProgress();
    autoTimer = setInterval(function () {
      goToSlide(currentSlide + 1);
    }, BANNER_CONFIG.interval);
  }

  function stopAuto() {
    const wrapper = getWrapper();
    if (wrapper) wrapper.classList.add("is-paused");
    clearTimer();
  }

  /** Punto de entrada */
  function init() {
    buildBanner();
    startAuto();
  }

  /* Ejecuta cuando el DOM esté listo */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
