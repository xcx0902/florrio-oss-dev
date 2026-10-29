/**
 * Canvas2D command trace for parity replays.
 *
 * Installed before the game scripts run. Every drawing context created through
 * `HTMLCanvasElement.prototype.getContext('2d')` or `OffscreenCanvas` is wrapped
 * so the sequence of Canvas2D commands, style assignments and Path2D geometry can
 * be exported as stable JSON.
 *
 * Frames are delimited by requestAnimationFrame callbacks. The driver can reset
 * the recorder after boot and capture only a fixed frame window, which keeps
 * golden files small while still digesting every frame in the window.
 */
export function installCanvasTrace(options = {}) {
  const state = {
    version: 1,
    startedAt: 0,
    frame: -1,
    frames: [],
    ops: [],
    contexts: [],
    paths: [],
    gradients: [],
    images: [],
    frameDigests: [],
    recording: true,
    captureFrames: options.captureFrames ?? 3,
    maxOps: options.maxOps ?? 4000000,
    digest: '00000000',
    totalOps: 0,
  };
  const contextIds = new WeakMap();
  const canvasIds = new WeakMap();
  const pathIds = new WeakMap();
  const gradientIds = new WeakMap();
  const imageIds = new WeakMap();
  let nextContext = 0;
  let nextCanvas = 0;
  let nextPath = 0;
  let nextGradient = 0;
  let nextImage = 0;

  function fnv(bytes) {
    let hash = 2166136261;
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619) >>> 0;
    return hash.toString(16).padStart(8, '0');
  }
  function hashString(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
    return hash.toString(16).padStart(8, '0');
  }
  function normalizeNumber(value) {
    if (!Number.isFinite(value)) return String(value);
    if (Number.isInteger(value)) return value;
    return Math.round(value * 1e6) / 1e6;
  }
  function canvasDescriptor(canvas) {
    if (!canvas) return null;
    let id = canvasIds.get(canvas);
    if (id === undefined) {
      id = nextCanvas++;
      canvasIds.set(canvas, id);
    }
    const name = canvas.id || canvas.getAttribute?.('class') || (canvas instanceof OffscreenCanvas ? 'offscreen' : 'canvas');
    return { kind: 'canvas', id, name, width: canvas.width, height: canvas.height };
  }
  function pathDescriptor(path) {
    if (!path) return null;
    let id = pathIds.get(path);
    if (id === undefined) {
      id = nextPath++;
      pathIds.set(path, id);
      state.paths.push({ id, ops: [] });
    }
    return { kind: 'path', id };
  }
  function gradientDescriptor(gradient) {
    if (!gradient) return null;
    let id = gradientIds.get(gradient);
    if (id === undefined) {
      id = nextGradient++;
      gradientIds.set(gradient, id);
      state.gradients.push({ id, kind: gradient.__parityKind || 'gradient', stops: [] });
    }
    return { kind: 'gradient', id };
  }
  function imageDescriptor(image) {
    if (!image) return null;
    if (image instanceof HTMLCanvasElement || image instanceof OffscreenCanvas) return canvasDescriptor(image);
    let id = imageIds.get(image);
    if (id === undefined) {
      id = nextImage++;
      imageIds.set(image, id);
      const src = typeof image.src === 'string' ? image.src : '';
      const short = src.startsWith('data:') ? 'data:' + hashString(src) : src.slice(-120);
      state.images.push({ id, src: short, width: image.naturalWidth || image.width || 0, height: image.naturalHeight || image.height || 0 });
    }
    return { kind: 'image', id };
  }
  function normalize(value, depth = 0) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return normalizeNumber(value);
    if (typeof value === 'string' || typeof value === 'boolean') return value;
    if (value instanceof Path2D) return pathDescriptor(value);
    if (typeof CanvasGradient !== 'undefined' && value instanceof CanvasGradient) return gradientDescriptor(value);
    if (typeof CanvasPattern !== 'undefined' && value instanceof CanvasPattern) return { kind: 'pattern' };
    if (typeof HTMLCanvasElement !== 'undefined' && value instanceof HTMLCanvasElement) return canvasDescriptor(value);
    if (typeof OffscreenCanvas !== 'undefined' && value instanceof OffscreenCanvas) return canvasDescriptor(value);
    if (typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap) return { kind: 'bitmap', width: value.width, height: value.height };
    if (typeof HTMLImageElement !== 'undefined' && value instanceof HTMLImageElement) return imageDescriptor(value);
    if (Array.isArray(value)) return depth < 4 ? value.map(item => normalize(item, depth + 1)) : { kind: 'array', length: value.length };
    if (typeof value === 'object') {
      if (typeof value.byteLength === 'number' && typeof value.BYTES_PER_ELEMENT === 'number') {
        return { kind: 'typed-array', name: value.constructor?.name, length: value.length, hash: fnv(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
      }
      return { kind: 'object' };
    }
    return { kind: typeof value };
  }

  function record(contextId, op, args) {
    if (!state.recording) return;
    state.totalOps++;
    if (state.ops.length >= state.maxOps) return;
    state.ops.push([contextId, op, args.map(value => normalize(value))]);
  }

  const methodNames = [
    'save', 'restore', 'reset', 'setTransform', 'resetTransform', 'transform', 'translate', 'rotate', 'scale',
    'beginPath', 'closePath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect',
    'fill', 'stroke', 'clip', 'isPointInPath',
    'fillRect', 'strokeRect', 'clearRect',
    'fillText', 'strokeText', 'measureText',
    'drawImage', 'putImageData', 'setLineDash', 'getLineDash',
    'createLinearGradient', 'createRadialGradient', 'createConicGradient', 'createPattern',
  ];
  const propertyNames = [
    'fillStyle', 'strokeStyle', 'globalAlpha', 'globalCompositeOperation', 'lineWidth', 'lineCap', 'lineJoin', 'miterLimit',
    'lineDashOffset', 'font', 'textAlign', 'textBaseline', 'direction', 'imageSmoothingEnabled', 'imageSmoothingQuality',
    'shadowBlur', 'shadowColor', 'shadowOffsetX', 'shadowOffsetY', 'filter',
  ];

  function wrapContext(ctx, canvas) {
    if (!ctx || contextIds.has(ctx)) return ctx;
    const id = nextContext++;
    contextIds.set(ctx, id);
    state.contexts.push({ id, ...canvasDescriptor(canvas), type: '2d' });
    const proto = Object.getPrototypeOf(ctx);
    for (const name of methodNames) {
      const original = proto[name];
      if (typeof original !== 'function') continue;
      Object.defineProperty(ctx, name, {
        configurable: true,
        value: function (...args) {
          const result = Reflect.apply(original, this, args);
          if (name === 'measureText') record(id, name, [args[0], result?.width ?? 0]);
          else if (name === 'createLinearGradient' || name === 'createRadialGradient' || name === 'createConicGradient') {
            if (result) {
              const descriptor = gradientDescriptor(result);
              state.gradients[descriptor.id].kind = name;
              state.gradients[descriptor.id].args = args.map(value => normalize(value));
            }
            record(id, name, args);
          } else record(id, name, args);
          return result;
        },
      });
    }
    for (const name of propertyNames) {
      const descriptor = Object.getOwnPropertyDescriptor(proto, name);
      if (!descriptor || !descriptor.set) continue;
      Object.defineProperty(ctx, name, {
        configurable: true,
        enumerable: true,
        get() { return descriptor.get.call(this); },
        set(value) {
          if (name === 'fillStyle' || name === 'strokeStyle') {
            if (typeof CanvasGradient !== 'undefined' && value instanceof CanvasGradient) record(id, '=' + name, [gradientDescriptor(value)]);
            else if (typeof CanvasPattern !== 'undefined' && value instanceof CanvasPattern) record(id, '=' + name, [{ kind: 'pattern' }]);
            else record(id, '=' + name, [String(value)]);
          } else record(id, '=' + name, [value]);
          descriptor.set.call(this, value);
        },
      });
    }
    return ctx;
  }

  const gradientProto = typeof CanvasGradient !== 'undefined' ? CanvasGradient.prototype : null;
  if (gradientProto && !gradientProto.__parityWrapped) {
    const originalAdd = gradientProto.addColorStop;
    Object.defineProperty(gradientProto, 'addColorStop', {
      configurable: true,
      value: function (offset, color) {
        const descriptor = gradientDescriptor(this);
        state.gradients[descriptor.id].stops.push([normalizeNumber(offset), String(color)]);
        record(-1, 'addColorStop', [descriptor, offset, String(color)]);
        return originalAdd.call(this, offset, color);
      },
    });
    Object.defineProperty(gradientProto, '__parityWrapped', { value: true });
  }

  const canvasProto = HTMLCanvasElement.prototype;
  const nativeGetContext = canvasProto.getContext;
  canvasProto.getContext = function (type, ...rest) {
    const context = Reflect.apply(nativeGetContext, this, [type, ...rest]);
    if (type === '2d' && context) wrapContext(context, this);
    return context;
  };
  if (typeof OffscreenCanvas !== 'undefined') {
    const nativeOffscreen = OffscreenCanvas.prototype.getContext;
    OffscreenCanvas.prototype.getContext = function (type, ...rest) {
      const context = Reflect.apply(nativeOffscreen, this, [type, ...rest]);
      if (type === '2d' && context) wrapContext(context, this);
      return context;
    };
  }

  const pathProto = typeof Path2D !== 'undefined' ? Path2D.prototype : null;
  if (pathProto) {
    for (const name of ['moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect', 'closePath', 'addPath']) {
      const original = pathProto[name];
      if (typeof original !== 'function') continue;
      Object.defineProperty(pathProto, name, {
        configurable: true,
        value: function (...args) {
          const descriptor = pathDescriptor(this);
          state.paths[descriptor.id].ops.push([name, ...args.map(value => normalize(value))]);
          return Reflect.apply(original, this, args);
        },
      });
    }
  }

  const nativeRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => nativeRaf(timestamp => {
    state.frame++;
    state.startedAt = timestamp;
    const before = state.ops.length;
    try { callback(timestamp); } finally {
      const frameOps = state.ops.slice(before);
      const digest = hashString(JSON.stringify(frameOps));
      state.frameDigests.push({ frame: state.frame, time: normalizeNumber(timestamp), digest, ops: frameOps.length });
      // Keep the LAST `captureFrames` frames: the driver screenshots the final
      // frame of the window, so an early-frame buffer would describe a different
      // camera/state than the PNG saved next to the trace.
      state.frames.push({ frame: state.frame, time: normalizeNumber(timestamp), ops: frameOps });
      const limit = state.captureFrames === 0 ? Infinity : Math.max(1, state.captureFrames);
      while (state.frames.length > limit) state.frames.shift();
      state.digest = hashString(state.digest + digest);
    }
  });

  window.__canvasTrace = {
    state,
    reset(options = {}) {
      state.frame = -1;
      state.frames.length = 0;
      state.ops.length = 0;
      state.frameDigests.length = 0;
      state.totalOps = 0;
      state.digest = '00000000';
      state.recording = true;
      state.captureFrames = options.captureFrames ?? state.captureFrames;
    },
    pause() { state.recording = false; },
    resume() { state.recording = true; },
    export(options = {}) {
      const includeAll = options.includeAll === true;
      return {
        version: state.version,
        scenario: options.scenario ?? null,
        viewport: options.viewport ?? null,
        epoch: options.epoch ?? null,
        frameMs: options.frameMs ?? null,
        contexts: state.contexts,
        paths: state.paths,
        gradients: state.gradients,
        images: state.images,
        frameDigests: state.frameDigests,
        frames: includeAll ? state.frames : state.frames.slice(-Math.max(1, options.frames ?? 3)),
        totalOps: state.totalOps,
        digest: state.digest,
      };
    },
    summary() {
      return {
        frame: state.frame,
        frames: state.frameDigests.length,
        ops: state.totalOps,
        digest: state.digest,
        contexts: state.contexts.length,
        paths: state.paths.length,
        gradients: state.gradients.length,
      };
    },
  };
  return window.__canvasTrace;
}
