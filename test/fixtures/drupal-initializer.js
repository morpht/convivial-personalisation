/**
 * @file
 * Convivial Profiler library init.
 *
 * Copyright Morpht Pty. Ltd. 2020.
 * This code must be licensed.
 */

(function ($, window, once, Drupal, config, ConvivialProfiler) {
  'use strict';

  Drupal.behaviors.convivialProfiler = {
    attach: function (context, settings) {
      if (!config || !config.config) {
        return;
      }
      once('convivial-profiler', 'html', context).forEach(function (element) {
        // Retire v1 identifiers without copying them to the new profile.
        try {
          window.localStorage.removeItem('convivial_profiler');
          window.localStorage.removeItem('ConvivialProfilerClientId');
          window.localStorage.removeItem('RecombeeUserId');
        } catch (error) {
          // The engine supports browsers where storage is unavailable.
        }
        [
          'ConvivialProfilerClientId',
          'ConvivialProfilerCookieConsent',
          'RecombeeUserId',
          'RecombeeCookieConsent',
        ].forEach(function (name) {
          document.cookie = name + '=;path=/;Max-Age=0;SameSite=Lax';
        });

        // Keep cookies and analytics disabled for this integration.
        config.event_tracking = false;
        config.config.privacy = {
          ...config.config.privacy,
          cookies: false,
          respect_gpc: true,
        };
        config.config.analytics = { ...config.config.analytics, events: false };
        window.convivialProfiler = new ConvivialProfiler(
          config.config,
          config.site,
        );
        function personalisationConsent(event) {
          const profiler = window.convivialProfiler;
          const consent = window.CookieConsent;
          if (!consent || !consent.validConsent()) {
            return;
          }
          const wasPersonalised = profiler.personalised;
          profiler.consent(
            consent.acceptedCategory('convivial_personalisation')
              ? 'granted'
              : 'denied',
          );
          if (event && (!wasPersonalised || !profiler.personalised)) {
            // Recollect the current page once, keeping temp available on opt-out.
            if (profiler.personalised) {
              profiler.erase();
            }
            profiler.collect();
          }
        }
        window.addEventListener('cc:onConsent', personalisationConsent);
        window.addEventListener('cc:onChange', personalisationConsent);
        // The consent UI may have loaded before this behaviour attached.
        personalisationConsent();
        window.convivialProfiler.collect();
        $(once('cp-trackable', context)).on(
          'click',
          '.cp_trackable a.btn',
          function (event) {
            if (config.event_tracking) {
              event.preventDefault();
              window.dataLayer = window.dataLayer || [];
              window.dataLayer.push({
                event: 'convivialProfiler.event',
                category: $(this)
                  .parents('.cp_trackable')
                  .first()
                  .attr('data-cp-category'),
                action: 'click',
                label: $(this)
                  .parents('.cp_trackable')
                  .first()
                  .attr('data-cp-label'),
                eventCallback: function () {
                  window.location = event.target.href;
                },
              });
            }
          },
        );
      });
    },
  };
})(
  jQuery,
  window,
  once,
  Drupal,
  drupalSettings.convivialProfiler,
  window.ConvivialPersonalisation.default,
);
