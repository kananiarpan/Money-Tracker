/* Money Tracker — microphone capture (Web Speech API).
 * Chrome/Edge ship it as webkitSpeechRecognition (server-backed, needs to be
 * online); Safari 14.1+ legacy support; Firefox keeps it behind a flag, so
 * callers must always offer the typed quick-add fallback.
 *
 * Mic permission preflight: SpeechRecognition's own permission prompt is
 * unreliable (notably on file:// pages, where it can fail WITHOUT prompting),
 * so we request audio via getUserMedia first — that shows the standard prompt
 * — then release the stream and start recognition.
 *
 * Also exposes speak() (speechSynthesis) so guided flows can *ask* a question
 * before listening — listening begins only after the prompt finishes, so the
 * app never transcribes its own voice.
 */
window.MT = window.MT || {};

window.MTVoice = (function () {
  'use strict';

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = !!SR;

  let rec = null;
  let active = false;
  let cancelled = false;
  let micPrimed = false;  // permission already granted this page-load
  let startSeq = 0;       // stale-start guard for overlapping start() calls

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

  /* Returns 'granted' or a DOMException name ('NotAllowedError', …).
   * Once granted, subsequent calls in this page-load resolve instantly —
   * guided flows start a fresh recognition per step and must not re-prompt. */
  async function ensureMicAccess() {
    if (micPrimed) return 'granted';
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'UnsupportedError';
    const state = await micPermissionState();
    if (state === 'granted') { micPrimed = true; return 'granted'; }
    if (state === 'denied') return 'NotAllowedError';
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop()); // release — SpeechRecognition opens its own
      micPrimed = true;
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
    const my = ++startSeq;
    const stale = () => cancelled || my !== startSeq;
    opts.onState && opts.onState('requesting');

    ensureMicAccess().then((status) => {
      if (stale()) return;
      if (status !== 'granted') {
        opts.onError && opts.onError(mapMicError(status));
        return;
      }
      beginRecognition(opts, opts.lang || 'en-CA', false, my);
    }).catch(() => { if (!stale()) opts.onError && opts.onError('mic-unknown'); });
    return true;
  }

  function beginRecognition(opts, lang, langRetried, my) {
    const stale = () => cancelled || my !== startSeq;
    try { rec = new SR(); } catch (e) { opts.onError && opts.onError('unsupported'); return; }

    let finalText = '';
    rec.lang = lang;
    rec.interimResults = true;   // live transcript under the mic
    rec.continuous = false;      // one utterance = one answer; silence ends it
    rec.maxAlternatives = 1;
    // Deliberately NOT setting rec.processLocally: on Chrome 139+ that switches
    // to on-device recognition, and without the language pack installed the
    // request fails with 'language-not-supported'. Server-based is the default.

    rec.onstart = function () {
      if (stale()) return;
      active = true; opts.onState && opts.onState('listening');
    };
    rec.onresult = function (e) {
      if (stale()) return;
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
      if (stale()) return;
      // Some builds reject less-common BCP-47 tags — retry once in en-US.
      if (e.error === 'language-not-supported' && !langRetried && lang !== 'en-US') {
        beginRecognition(opts, 'en-US', true, my);
        return;
      }
      opts.onError && opts.onError(e.error || 'unknown');
    };
    rec.onend = function () {
      active = false;
      if (stale()) return;
      const t = finalText.trim();
      if (t) opts.onFinal && opts.onFinal(t);
      else opts.onError && opts.onError('no-speech');
    };

    try { rec.start(); }
    catch (e) { active = false; opts.onError && opts.onError('start-failed'); }
  }

  /* finish() ends gracefully and still delivers what was heard. */
  function finish() { if (rec && active) { try { rec.stop(); } catch (e) { /* ignore */ } } }

  /* cancel() throws the utterance away (user bailed out of the overlay).
   * Bumping startSeq also invalidates any start() still awaiting its mic
   * preflight, so a stale recognition can never come alive afterwards. */
  function cancel() {
    cancelled = true;
    startSeq++;
    if (rec && active) { try { rec.abort(); } catch (e) { /* ignore */ } }
    active = false;
    stopSpeaking();
  }

  /* Speak a prompt, then call onEnd. Never overlaps the mic: callers listen
   * from onEnd — so the recognizer can't transcribe our own question. */
  function speak(text, onEnd) {
    try {
      if (!window.speechSynthesis) { onEnd && onEnd(); return; }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.06;
      u.pitch = 1;
      let done = false;
      const finishOnce = () => { if (!done) { done = true; onEnd && onEnd(); } };
      u.onend = finishOnce;
      u.onerror = finishOnce;
      setTimeout(finishOnce, 4000); // never wedge if onend never fires
      window.speechSynthesis.speak(u);
    } catch (e) { onEnd && onEnd(); }
  }

  function stopSpeaking() {
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  }

  return {
    supported,
    start,
    finish,
    cancel,
    speak,
    stopSpeaking,
    isActive: function () { return active; },
  };
})();
