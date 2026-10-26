/**
 * 诊断钩子：只在 debug.html 里加载，用来观察本地单机版启动时到底做了什么。
 *
 * 关注两件事：
 *   1. 是否成功 new Worker("sp_server.js") —— 本地服务端有没有拉起来
 *   2. 有没有任何指向外部域名的请求 —— 离线镜像是否真的干净
 *
 * 打开页面后，在控制台执行 window.__florrProbe 查看汇总。
 */
(function () {
  var probe = { workers: [], sockets: [], xhr: [], fetch: [], errors: [] };
  window.__florrProbe = probe;

  function log() {
    try {
      var args = [].slice.call(arguments).map(function (a) {
        try { return typeof a === 'string' ? a : JSON.stringify(a); } catch (e) { return String(a); }
      });
      console.log.apply(console, ['[florr-probe]'].concat(args));
    } catch (e) { /* ignore */ }
  }

  var NativeWorker = window.Worker;
  if (NativeWorker) {
    window.Worker = function (u, o) {
      log('new Worker', String(u));
      probe.workers.push(String(u));
      try {
        return o !== undefined ? new NativeWorker(u, o) : new NativeWorker(u);
      } catch (e) {
        probe.errors.push('Worker: ' + e);
        throw e;
      }
    };
    window.Worker.prototype = NativeWorker.prototype;
  }

  var NativeWS = window.WebSocket;
  if (NativeWS) {
    window.WebSocket = function (u, p) {
      log('new WebSocket', String(u));
      probe.sockets.push(String(u));
      return p !== undefined ? new NativeWS(u, p) : new NativeWS(u);
    };
    window.WebSocket.prototype = NativeWS.prototype;
    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k, i) {
      window.WebSocket[k] = i;
    });
  }

  var NativeXHR = window.XMLHttpRequest;
  if (NativeXHR) {
    var nativeOpen = NativeXHR.prototype.open;
    NativeXHR.prototype.open = function (method, url) {
      log('XHR', method, String(url));
      probe.xhr.push(method + ' ' + url);
      return nativeOpen.apply(this, arguments);
    };
  }

  var nativeFetch = window.fetch;
  if (nativeFetch) {
    window.fetch = function (input, init) {
      var u = typeof input === 'string' ? input : (input && input.url);
      log('fetch', String(u));
      probe.fetch.push(String(u));
      return nativeFetch.apply(this, arguments);
    };
  }

  window.addEventListener('error', function (e) {
    log('error', e.message, e.filename + ':' + e.lineno);
    probe.errors.push(String(e.message));
  });
  window.addEventListener('unhandledrejection', function (e) {
    log('unhandledrejection', String(e.reason));
    probe.errors.push('rejection: ' + e.reason);
  });

  // 启动完成后做个自检
  setTimeout(function () {
    var external = probe.fetch.concat(probe.xhr).filter(function (u) {
      return /^https?:\/\//.test(u) && u.indexOf(location.origin) !== 0;
    });
    window.__florrProbe.summary = {
      hostname: location.hostname,
      workerSpawned: probe.workers.indexOf('sp_server.js') !== -1,
      externalRequests: external,
      offlineClean: external.length === 0 && probe.sockets.length === 0,
    };
    console.log('[florr-probe] 自检结果:', window.__florrProbe.summary);
  }, 12000);

  log('hooks installed');
})();
