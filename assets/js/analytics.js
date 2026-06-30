/* ============================================================
   ANALYTICS — preencha os IDs e o rastreamento liga sozinho.
   Enquanto estiver com 'XXXX', nada é carregado (modo inerte),
   então o site não quebra nem envia dados antes da hora.

   - GA4:  crie em https://analytics.google.com  → ID "G-XXXXXXXXXX"
   - Pixel: crie em https://business.facebook.com → ID numérico
   ============================================================ */
const GA4_ID = 'G-XXXXXXXXXX';
const META_PIXEL_ID = 'XXXXXXXXXXXXXXX';

// Google Analytics 4
if (GA4_ID && !GA4_ID.includes('XXXX')) {
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  gtag('config', GA4_ID);
}

// Meta (Facebook/Instagram) Pixel — essencial para o tráfego pago
if (META_PIXEL_ID && !META_PIXEL_ID.includes('XXXX')) {
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
    n.queue = []; t = b.createElement(e); t.async = !0;
    t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', META_PIXEL_ID);
  fbq('track', 'PageView');
}
