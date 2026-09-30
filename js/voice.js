/* Money Tracker — microphone capture (Web Speech API).
 * Chrome/Edge ship it as webkitSpeechRecognition (server-backed, needs to be
 * online); Safari 14.1+ legacy support; Firefox keeps it behind a flag, so
 * callers must always offer the typed quick-add fallback.
 *
 * Mic permission preflight: SpeechRecognition's own permission prompt is
 * unreliable (notably on file:// pages, where it can fail WITHOUT prompting),
 * so we request audio via getUserMedia first — that shows the standard prompt
 * — then release the stream and start recognition.
 */
window.MT = window.MT || {};

window.MTVoice = (function () {
  'use strict';

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!SR;

  let rec = null;
  let active = false;
  let cancelled = false;

  async function micPermissionState() {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const p = await navigator.permissions.query({ name: 'microphone' });
        if (p.state === 'granted') return 'granted';
        if (p.state === 'denied') return 'denied';
      }
    } catch (e) { /* permissions API missing or partial — fall through */ }
    return 'prompt';
  }

  /* Returns 'granted' or a DOMException name ('NotAllowedError', …). */
  async function ensureMicAccess() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'UnsupportedError';
    const state = await micPermissionState();
    if (state === 'granted') return 'granted';
    if (state === 'denied') return 'NotAllowedError';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop()); // release — SpeechRecognition opens its own
      return 'granted';
    } catch (e) {
      return (e && e.name) || 'UnknownError';
    }
  }

  function mapMicError(name) {
    switch (name) {
      case 'NotAllowedError':
      case 'SecurityError': return 'not-allowed';
      case 'NotFoundError':
      case 'OverconstrainedError': return 'audio-capture';
      case 'NotReadableError': return 'mic-busy';
      case 'UnsupportedError': return 'unsupported';
      default: return 'mic-unknown';
    }
  }

  function start(opts) {
    opts = opts || {};
    if (!supported) { opts.onError && opts.onError('unsupported'); return false; }
    if (active) cancel();
    cancelled = false;
    opts.onState && opts.onState('requesting');

    ensureMicAccess().then((status) => {
      if (cancelled) return;
      if (status !== 'granted') {
        opts.onError && opts.onError(mapMicError(status));
        return;
      }
      beginRecognition(opts, opts.lang || 'en-CA', false);
    }).catch(() => { if (!cancelled) opts.onError && opts.onError('mic-unknown'); });
    return true;
  }

  function beginRecognition(opts, lang, langRetried) {
    try { rec = new SR(); } catch (e) { opts.onError && opts.onError('unsupported'); return; }

    let finalText = '';
    rec.lang = lang;
    rec.interimResults = true;   // live transcript under the mic
    rec.continuous = false;      // one utterance = one entry; silence ends it
    rec.maxAlternatives = 1;
    // Deliberately NOT setting rec.processLocally: on Chrome 139+ that switches
    // to on-device recognition, and without the language pack installed the
    // request fails with 'language-not-supported'. Server-based is the default.

    rec.onstart = function () { active = true; opts.onState && opts.onState('listening'); };
    rec.onresult = function (e) {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      opts.onInterim && opts.onInterim(interim);
    };
    rec.onerror = function (e) {
      active = false;
      if (cancelled) return;
      // Some builds reject less-common BCP-47 tags — retry once in en-US.
      if (e.error === 'language-not-supported' && !langRetried && lang !== 'en-US') {
        beginRecognition(opts, 'en-US', true);
        return;
      }
      opts.onError && opts.onError(e.error || 'unknown');
    };
    rec.onend = function () {
      active = false;
      if (cancelled) return;
      const t = finalText.trim();
      if (t) opts.onFinal && opts.onFinal(t);
      else opts.onError && opts.onError('no-speech');
    };

    try { rec.start(); }
    catch (e) { active = false; opts.onError && opts.onError('start-failed'); }
  }

  /* finish() ends gracefully and still delivers what was heard. */
  function finish() { if (rec && active) { try { rec.stop(); } catch (e) { /* ignore */ } } }

  /* cancel() throws the utterance away (user bailed out of the overlay). */
  function cancel() {
    cancelled = true;
    if (rec && active) { try { rec.abort(); } catch (e) { /* ignore */ } }
    active = false;
  }

  return {
    supported,
    start,
    finish,
    cancel,
    isActive: function () { return active; },
  };
})();
