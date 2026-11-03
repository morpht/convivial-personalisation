/**
 * @file
 * Initializes Convivial Personalisation and connects the consent controls.
 */
(function (window, once, Drupal, settings, ConvivialPersonalisation) {
  'use strict';

  Drupal.behaviors.convivialPersonalisation = {
    attach: function (context) {
      if (!settings || !settings.config) {
        return;
      }
      once('convivial-personalisation', 'html', context).forEach(function () {
        const config = {
          ...settings.config,
          privacy: {
            ...settings.config.privacy,
            cookies: false,
            respect_gpc: true,
          },
          // Analytics remain disabled for this integration.
          analytics: {
            ...settings.config.analytics,
            events: false,
          },
        };
        const engine = new ConvivialPersonalisation(config, settings.site);
        function personalisationConsent(event) {
          const consent = window.CookieConsent;
          if (!consent || !consent.validConsent()) {
            return;
          }
          const wasPersonalised = engine.personalised;
          engine.consent(
            consent.acceptedCategory('convivial_personalisation')
              ? 'granted'
              : 'denied',
          );
          if (event && (!wasPersonalised || !engine.personalised)) {
            // Recollect once, keeping temporary values available on opt-out.
            if (engine.personalised) {
              engine.erase();
            }
            engine.collect();
          }
        }
        window.addEventListener('cc:onConsent', personalisationConsent);
        window.addEventListener('cc:onChange', personalisationConsent);
        personalisationConsent();
        engine.collect();
      });
    },
  };
})(
  window,
  once,
  Drupal,
  drupalSettings.convivialPersonalisation,
  window.ConvivialPersonalisation.default,
);
