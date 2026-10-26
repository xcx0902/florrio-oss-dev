/** Temporary R03 probe: one fresh player entity with sparse fields. */
const packet = Uint8Array.from('010136222d2e7cf42d93c4314d6944db724000000000020000110000000003010401170000c842030000c8420100000000000000000000'.match(/../g).map(v => parseInt(v, 16)));
self.onmessage = event => {
  const { funcName, callbackId } = event.data;
  if (funcName === 'sp_server_flush') {
    const copy = packet.slice();
    self.postMessage({ callbackId, finalResponse: false, data: copy }, [copy.buffer]);
  }
  self.postMessage({ callbackId, finalResponse: true, data: 0 });
};
