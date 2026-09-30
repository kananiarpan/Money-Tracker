/* Money Tracker — boot. Load order: store → parser → voice → ui → app. */
(function () {
  'use strict';

  function boot() {
    window.MTStore.load();
    window.MTUI.init();

    window.addEventListener('hashchange', () => {
      const v = (location.hash || '').replace('#', '');
      if (v) window.MTUI.setView(v);
    });

    /* Global shortcut: press "v" to start voice entry (outside inputs). */
    document.addEventListener('keydown', (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      if (e.key === 'v' || e.key === 'V') {
        const fab = document.getElementById('fab');
        if (fab) fab.click();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
