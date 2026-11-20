/**
 * Entry point of the browser half.
 *
 * 0.7.0 split the single ~2500-line bundle into one entry plus four sibling
 * chunks, all loaded through the module loader's package-local chunk
 * mechanism:
 *
 *   client.shared.js    keys, dictionaries, storage, formatting, quota maths
 *   client.css.js       the ~130 rules, injected once into the document head
 *   client.panel.js     the model seat (trigger + dropdown + subagent row)
 *   client.settings.js  seat wiring (owner props, crash boundary) + settings tab
 *
 * `client.panel.js` and `client.settings.js` reach `client.shared.js` with a
 * plain synchronous require(), so the shared chunk is always awaited first and
 * the settings chunk always after the panel chunk it imports.
 */
window.__ModuleLoader__.load({
  id: 'dsh-model-panel',
  factory(require) {
    'use strict';
    var module = { exports: {} };
    var exports = module.exports;

    /**
     * Bump on every change to any client.*.js chunk.
     *
     * The host serves a chunk at `/plugins/<id>/<file>?rev=<rev>`, and `rev` is
     * a hash of THIS file's (mtime, ctime, size) — never of the chunk. A chunk
     * answer also carries `max-age=31536000, immutable`, so a stale copy would
     * outlive the release. Changing this string changes the size of client.js,
     * which changes the revision, which invalidates every chunk URL with it.
     */
    const CHUNK_REV = '0.7.7';

    const NS = 'model-panel';
    const SLOT = 'conversation.input.model';
    const PRIORITY = -5;
    const STYLE_ID = 'dsh-model-panel-styles';

    const SHARED = 'dsh-model-panel/client.shared.js';

    let loaded = null;

    /** Load every chunk in dependency order; one attempt per session. */
    function loadChunks() {
      if (loaded) return loaded;
      loaded = (async () => {
        await require.async('./client.shared.js');
        const panel = await require.async('./client.panel.js');
        const [settings, css] = await Promise.all([
          require.async('./client.settings.js'),
          require.async('./client.css.js'),
        ]);
        return {
          shared: require(SHARED),
          ModelPanel: panel.ModelPanel,
          settings: settings,
          css: css.CSS,
        };
      })();
      return loaded;
    }

    /**
     * Put the stylesheet in the document head and keep it current across a hot
     * reload: the element is keyed by id, so a second apply replaces its text
     * instead of stacking a second copy.
     */
    function mountStyles(css) {
      if (typeof document === 'undefined' || !css) return;
      const host = document.head || document.documentElement;
      if (!host) return;
      let node = document.getElementById(STYLE_ID);
      if (!node) {
        node = document.createElement('style');
        node.id = STYLE_ID;
        host.appendChild(node);
      }
      if (node.textContent !== css) node.textContent = css;
    }

    async function apply(ctx) {
      const chunks = await loadChunks();
      const { shared, settings } = chunks;
      mountStyles(chunks.css);

      const { zh, en } = shared;
      let locale = null;
      try {
        locale = (typeof ctx.get === 'function' && ctx.get('locale')) || ctx.locale;
        if (locale && typeof locale.register === 'function') {
          locale.register(NS, { zh, en });
          if (typeof locale.bind === 'function') locale.bind(NS);
        }
      } catch (e) {
        /* locale optional */
      }

      /** Translator for surfaces the host does not bind (the settings tab). */
      const localT = (key) => {
        let active = '';
        try {
          if (locale && typeof locale.getLocale === 'function') active = String(locale.getLocale() || '');
          else if (locale && typeof locale.getSnapshot === 'function') {
            const snap = locale.getSnapshot();
            active = String((snap && snap.active) || '');
          }
        } catch (e) {
          active = '';
        }
        if (!active) {
          try {
            active = String(document.documentElement.lang || navigator.language || '');
          } catch (e) {
            active = '';
          }
        }
        const dict = /^en/i.test(active) ? en : zh;
        return dict[key] !== undefined ? dict[key] : key;
      };

      ctx.inject(['slots', 'modelDirectories'], (scope) => {
        const slots =
          (scope && typeof scope.get === 'function' && scope.get('slots')) || (scope && scope.slots);
        if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') return;

        try {
          slots.inject(SLOT, () =>
            slots.register(
              {
                name: SLOT,
                label: 'dsh-model-panel',
                priority: PRIORITY,
                locale: NS,
                inject: (sessionId) => settings.ownerProps(scope, sessionId),
              },
              settings.SeatBoundary
            )
          );
        } catch (e) {
          console.warn('[dsh-model-panel] failed to register model seat:', e);
        }

        // Settings -> Plugins -> Balance display. One localized page for the
        // vendors whose usage only a console cookie can read.
        try {
          slots.inject('settings.plugins.tab', () =>
            slots.register(
              {
                name: 'settings.plugins.tab',
                id: 'dsh-model-panel',
                order: 55,
                label: () => localT('setTitle'),
                locale: NS,
                inject: () => ({ t: localT }),
              },
              settings.CookieUsageTab
            )
          );
        } catch (e) {
          console.warn('[dsh-model-panel] failed to register settings tab:', e);
        }
      });
    }

    const inject = ['slots', 'locale', 'sessions'];

    exports.apply = apply;
    exports.inject = inject;
    exports.CHUNK_REV = CHUNK_REV;
    return module.exports;
  },
});
