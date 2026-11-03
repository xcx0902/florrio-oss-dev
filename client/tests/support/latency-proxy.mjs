import net from 'node:net';
/** An ordered TCP byte-stream delay proxy. It never selects/drops WebSocket
 * messages; a stall delays later bytes behind earlier ones in each direction. */
export async function startLatencyProxy(port, { rttMs = 0, jitterMs = 0 } = {}) {
  const sockets = new Set(),
    timers = new Set();
  let serial = 0,
    holdUntil = 0;
  const stats = {
    rttMs,
    jitterMs,
    forwardedBytes: 0,
    peakQueuedBytes: 0,
    connections: 0,
    stalls: 0,
    interruptions: 0,
  };
  let queuedBytes = 0;
  const server = net.createServer((client) => {
    const upstream = net.connect({ host: '127.0.0.1', port });
    stats.connections++;
    sockets.add(client);
    sockets.add(upstream);
    client.setNoDelay(true);
    upstream.setNoDelay(true);
    const cleanups = [];
    let closed = false;
    const close = () => {
      if (closed) {
        return;
      }
      closed = true;
      for (const cleanup of cleanups) {
        cleanup();
      }
      client.destroy();
      upstream.destroy();
      sockets.delete(client);
      sockets.delete(upstream);
    };
    client.on('error', close);
    upstream.on('error', close);
    client.on('close', close);
    upstream.on('close', close);
    for (const [from, to] of [
      [client, upstream],
      [upstream, client],
    ]) {
      let lastDelivery = 0,
        timer;
      const queue = [];
      const schedule = () => {
        if (timer !== undefined || !queue.length || closed) {
          return;
        }
        timer = setTimeout(drain, Math.max(1, queue[0].at - Date.now()));
        timers.add(timer);
      };
      const drain = () => {
        timers.delete(timer);
        timer = undefined;
        // One timer drains one ordered queue. Independent per-chunk timers can
        // fire out of order even when their computed absolute deadlines match.
        while (queue.length && queue[0].at <= Date.now()) {
          const { bytes } = queue.shift();
          queuedBytes -= bytes.length;
          if (!to.destroyed) {
            to.write(bytes);
            stats.forwardedBytes += bytes.length;
          }
        }
        schedule();
      };
      cleanups.push(() => {
        clearTimeout(timer);
        timers.delete(timer);
        timer = undefined;
        for (const { bytes } of queue) {
          queuedBytes -= bytes.length;
        }
        queue.length = 0;
      });
      from.on('data', (bytes) => {
        if (closed) {
          return;
        }
        const jitter = jitterMs ? (((++serial * 17) % 21) / 20 - 0.5) * jitterMs : 0;
        const at = Math.max(Date.now() + Math.max(0, rttMs / 2 + jitter), lastDelivery, holdUntil);
        lastDelivery = at;
        queuedBytes += bytes.length;
        stats.peakQueuedBytes = Math.max(stats.peakQueuedBytes, queuedBytes);
        queue.push({ at, bytes });
        if (queuedBytes > 4 * 1024 * 1024) {
          close();
          return;
        }
        schedule();
      });
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    port: server.address().port,
    stats,
    stall(ms) {
      holdUntil = Date.now() + ms;
      stats.stalls++;
    },
    interrupt() {
      stats.interruptions++;
      for (const socket of sockets) {
        socket.destroy();
      }
    },
    async close() {
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.clear();
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
