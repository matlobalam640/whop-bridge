(function ($) {
  'use strict';

  function pickBridgeData(resp) {
    if (!resp || !resp.success || !resp.data) return null;

    var d = resp.data;
    var b = d.bridge_response || {};

    if (b.success) {
      return {
        plan_id: b.plan_id || d.plan_id,
        session_id: b.session_id || d.session_id,
        checkout_url: b.checkout_url || d.checkout_url,
        return_url: d.return_url || b.embed && b.embed.return_url,
      };
    }

    return {
      plan_id: d.plan_id,
      session_id: d.session_id,
      checkout_url: d.checkout_url,
      return_url: d.return_url,
    };
  }

  function findHosts() {
    var selectors = [
      '#whop-embedded-checkout',
      '.whopy-checkout-container',
      '.whopy-checkout-wrapper',
      '.whop-checkout-embed',
      '[data-whop-checkout-plan-id]',
      '.payment_method_whopy_card iframe',
      '.payment_method_whop_card iframe',
    ];

    var hosts = [];
    selectors.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        if (hosts.indexOf(el) === -1) hosts.push(el);
      });
    });

    // Parent of broken Whop 404 iframe
    document.querySelectorAll('iframe').forEach(function (iframe) {
      var src = iframe.getAttribute('src') || '';
      if (src.indexOf('whop.com') !== -1 && hosts.indexOf(iframe.parentElement) === -1) {
        if (iframe.parentElement) hosts.push(iframe.parentElement);
      }
    });

    return hosts;
  }

  function loadWhopLoader(callback) {
    if (window.wco) {
      callback();
      return;
    }
    var existing = document.querySelector('script[src*="whop.com/static/checkout/loader"]');
    if (existing) {
      existing.addEventListener('load', callback);
      setTimeout(callback, 500);
      return;
    }
    var s = document.createElement('script');
    s.src = 'https://js.whop.com/static/checkout/loader.js';
    s.async = true;
    s.defer = true;
    s.onload = callback;
    document.head.appendChild(s);
  }

  function applyAttributes(data) {
    findHosts().forEach(function (host) {
      host.setAttribute('data-whop-checkout-plan-id', data.plan_id);
      host.setAttribute('data-whop-checkout-session', data.session_id);
      if (data.return_url) {
        host.setAttribute('data-whop-checkout-return-url', data.return_url);
      }
      host.removeAttribute('data-whop-checkout-hide-price');
    });
  }

  /** Most reliable: iframe with full checkout_url (?session=ch_...) */
  function applyIframeCheckout(data) {
    if (!data.checkout_url) return false;

    var hosts = findHosts();
    if (!hosts.length) return false;

    hosts.forEach(function (host) {
      host.innerHTML = '';
      var iframe = document.createElement('iframe');
      iframe.src = data.checkout_url;
      iframe.title = 'Whop Checkout';
      iframe.setAttribute(
        'allow',
        'payment *; publickey-credentials-get *; publickey-credentials-create *'
      );
      iframe.style.cssText =
        'width:100%;min-height:560px;border:0;border-radius:8px;display:block;';
      host.appendChild(iframe);
    });

    return true;
  }

  function remountWhopEmbed(data) {
    applyAttributes(data);

    loadWhopLoader(function () {
      if (!window.wco || typeof window.wco.mount !== 'function') return;

      findHosts().forEach(function (host) {
        if (!host.id) {
          host.id = 'whop-embed-' + Math.random().toString(36).slice(2, 9);
        }
        try {
          window.wco.mount(host.id);
        } catch (e) {
          /* ignore */
        }
      });
    });
  }

  function applyWhopSession(resp) {
    var data = pickBridgeData(resp);
    if (!data || !data.plan_id || !data.session_id) {
      console.warn('[whop-embed-fix] Missing plan_id or session_id', data);
      return;
    }

    if (!data.checkout_url && data.plan_id && data.session_id) {
      data.checkout_url =
        'https://whop.com/checkout/' +
        data.plan_id +
        '/?session=' +
        encodeURIComponent(data.session_id);
    }

    // Prefer iframe — works even when Whopy mounted plan-only embed first
    if (applyIframeCheckout(data)) {
      return;
    }

    remountWhopEmbed(data);
  }

  function watchAjax() {
    $(document).ajaxSuccess(function (_event, xhr, settings) {
      var url = (settings && settings.url) || '';
      if (url.indexOf('whopy_create_plan') === -1) return;

      var run = function () {
        applyWhopSession(xhr.responseJSON);
      };

      run();
      setTimeout(run, 100);
      setTimeout(run, 500);
      setTimeout(run, 1500);
    });
  }

  watchAjax();
})(jQuery);
