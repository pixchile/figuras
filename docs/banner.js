/**
 * ═══════════════════════════════════════════════════════════════
 *  BANNER DE ANUNCIOS — Configuración y lógica
 *  Para agregar o editar anuncios, solo modificá el array SLIDES.
 *  Las imágenes van en la carpeta /banner/ de la raíz del sitio.
 * ═══════════════════════════════════════════════════════════════
 */

const BANNER_CONFIG = {
  /** Intervalo entre slides en milisegundos */
  interval: 4000,

  /** Duración de la animación de transición en ms */
  transitionDuration: 600,

  /** Pausa el auto-slide cuando el usuario hace hover */
  pauseOnHover: true,
};

/**
 * Cada slide puede tener:
 *  - image    {string}  Nombre del archivo dentro de /banner/  (requerido)
 *  - alt      {string}  Texto alternativo para accesibilidad y SEO  (requerido)
 *  - link     {string|null}  URL o #id-de-seccion al hacer clic  (opcional)
 *  - target   {string}  "_self" (mismo tab) o "_blank" (nueva pestaña)
 *
 * Ejemplo de enlace a sección interna:  link: "#productsSection"
 * Ejemplo de enlace externo:            link: "https://web.whatsapp.com/send/?phone=56954678849&text"
 */
const SLIDES = [
  {
    image:  "banner1.webp",
    alt:    "Nuestros diseños son exclusivos. No existen en otro lugar.",
    link:   null,
    target: "_self",
  },
  {
    image:  "banner2.webp",
    alt:    "Tenemos diseños a pedido del cliente.",
    link:   null,
    target: "_self",
  },
  {
    image:  "banner3.webp",
    alt:    "Envíos a todo Chile por BlueExpres desde $3990 o gratis sobre $40.000",
    link:   null,
    target: "_self",
  },
  {
    image:  "banner4.webp",
    alt:    "¡Aprovecha los packs y paga menos!",
    link:   null,
    target: "_self",
  },
  {
    image:  "banner5.webp",
    alt:    "Contáctanos por Whatsapp +56954678849",
    // Determinamos el link según el dispositivo
    get link() {
      const phone = "56954678849";
      const message = "Hola, me gustaría obtener más información.";
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      return isMobile 
        ? `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}` // App móvil
        : `https://web.whatsapp.com/send/?phone=${phone}&text=${encodeURIComponent(message)}`; // WhatsApp Web
    },
    target: "_blank",
  },
  // ── Agregá más slides acá ──────────────────────────────────────
  // {
  //   image:  "banner4.png",
  //   alt:    "Descripción del anuncio",
  //   link:   "#productsSection",   // o una URL completa
  //   target: "_self",
  // },
];

/* ════════════════════════════════════════════════════════════════
   Lógica interna — no es necesario modificar nada de aquí abajo
   ════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  let currentSlide = 0;
  let autoTimer = null;
  let isTransitioning = false;

  /** Construye el HTML del banner e inyecta los slides */
  function buildBanner() {
    const wrapper = document.getElementById("bannerWrapper");
    if (!wrapper || SLIDES.length === 0) return;

    /* Track (contiene todos los slides uno al lado del otro) */
    const track = document.createElement("div");
    track.className = "banner-track";
    track.id = "bannerTrack";

    SLIDES.forEach(function (slide, index) {
      const item = document.createElement("div");
      item.className = "banner-slide" + (index === 0 ? " active" : "");
      item.setAttribute("aria-hidden", index !== 0 ? "true" : "false");

      const img = document.createElement("img");
      img.src     = "./banner/" + slide.image;
      img.alt     = slide.alt;
      img.width   = 1200;
      img.height  = 400;
      /* ✅ Sin lazy loading — se precarga todo junto */
      img.loading = "eager";
      img.fetchPriority = index === 0 ? "high" : "auto";
      img.decoding = "async";
      img.draggable = false;

      if (slide.link) {
        const anchor = document.createElement("a");
        anchor.href   = slide.link;
        anchor.target = slide.target || "_self";
        if (slide.target === "_blank") {
          anchor.rel = "noopener noreferrer";
        }
        anchor.setAttribute("aria-label", slide.alt);
        anchor.appendChild(img);
        item.appendChild(anchor);
      } else {
        item.appendChild(img);
      }

      track.appendChild(item);
    });

    wrapper.appendChild(track);

    /* Puntos de navegación */
    if (SLIDES.length > 1) {
      const dotsContainer = document.createElement("div");
      dotsContainer.className    = "banner-dots";
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

      /* Flechas de navegación */
      const prevBtn = document.createElement("button");
      prevBtn.className  = "banner-arrow banner-arrow-prev";
      prevBtn.innerHTML  = "&#8249;";
      prevBtn.setAttribute("aria-label", "Anuncio anterior");
      prevBtn.addEventListener("click", function () { goToSlide(currentSlide - 1); });

      const nextBtn = document.createElement("button");
      nextBtn.className  = "banner-arrow banner-arrow-next";
      nextBtn.innerHTML  = "&#8250;";
      nextBtn.setAttribute("aria-label", "Siguiente anuncio");
      nextBtn.addEventListener("click", function () { goToSlide(currentSlide + 1); });

      wrapper.appendChild(prevBtn);
      wrapper.appendChild(nextBtn);
    }

    /* Pausa en hover */
    if (BANNER_CONFIG.pauseOnHover) {
      wrapper.addEventListener("mouseenter", stopAuto);
      wrapper.addEventListener("mouseleave", startAuto);
      wrapper.addEventListener("focusin",    stopAuto);
      wrapper.addEventListener("focusout",   startAuto);
    }

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
  }

  /** Muestra el slide indicado */
  function goToSlide(index) {
    if (isTransitioning || SLIDES.length <= 1) return;

    /* Wrap circular */
    const total = SLIDES.length;
    index = ((index % total) + total) % total;

    if (index === currentSlide) return;

    isTransitioning = true;

    const slides    = document.querySelectorAll(".banner-slide");
    const dots      = document.querySelectorAll(".banner-dot");

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

    setTimeout(function () { isTransitioning = false; }, BANNER_CONFIG.transitionDuration);

    /* Reinicia el timer para que no cambie justo después de navegar */
    stopAuto();
    startAuto();
  }

  function startAuto() {
    if (SLIDES.length <= 1) return;
    stopAuto();
    autoTimer = setInterval(function () {
      goToSlide(currentSlide + 1);
    }, BANNER_CONFIG.interval);
  }

  function stopAuto() {
    clearInterval(autoTimer);
    autoTimer = null;
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
