// Shared \`window.mygo\` mock for the dev-only headless checks.
//
// The bundle reaches the host only through mygo-runtime, so a mock of the
// Runtime interface drives the real frontend exactly like the desktop app:
// \`call\` routes the bound App methods, \`on\` backs both the typed events and
// the internal events (file drop, locale, preferences), and \`window\` backs the
// window controls.
//
// Usage: emit the returned script after the check's own state script, with a
// source string for the \`App.*\` handlers the check needs.

export function runtimeStub(handlersSource) {
  return `<script>
(() => {
  const handlers = ${handlersSource};
  const listeners = new Map();
  window.__mygo = {
    maximized: false,
    calls: [],
    // Test hook: fire an event as the Go side would.
    emit(name, payload) {
      for (const listener of [...(listeners.get(name) ?? [])]) listener(payload);
    },
    // Test hook: swap a handler mid-scenario (e.g. make a read fail).
    setHandler(method, handler) {
      handlers[method] = handler;
    },
  };
  window.mygo = {
    call(method, ...args) {
      window.__mygo.calls.push(method);
      const handler = handlers[method];
      if (!handler) return Promise.reject(new Error('mygo stub: unhandled ' + method));
      try {
        return Promise.resolve(handler(...args));
      } catch (err) {
        return Promise.reject(err);
      }
    },
    channel() {
      throw new Error('mygo stub: Mado binds no channels');
    },
    on(name, listener) {
      const set = listeners.get(name) ?? new Set();
      set.add(listener);
      listeners.set(name, set);
      return () => set.delete(listener);
    },
    once(name, listener) {
      const off = window.mygo.on(name, (payload) => {
        off();
        listener(payload);
      });
      return off;
    },
    platform: 'win32',
    windowId: 1,
    version: '0.7.4',
    preferences: { accent: null, reduceMotion: false, reduceTransparency: false, highContrast: false, textScale: 1 },
    locale: 'zh-CN',
    dir: 'ltr',
    window: {
      minimize() {},
      maximize() {},
      unmaximize() {},
      toggleMaximize() {},
      toggleFullScreen() {},
      isMaximized: () => Promise.resolve(window.__mygo.maximized),
      close() {},
      setTitle() {},
    },
  };
})();
</script>`;
}
