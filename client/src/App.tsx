import { useEffect, useState } from 'react';
import type { ClientMessage, ServerMessage } from '@replay/shared';
import { serverWsUrl } from './net/serverUrl';

type Status = 'connecting' | 'online' | 'offline';

// M0 placeholder: proves the page loads and the live connection works.
// The real screens arrive in M1.
export function App() {
  const [status, setStatus] = useState<Status>('connecting');
  const [pingMs, setPingMs] = useState<number | null>(null);

  useEffect(() => {
    const ws = new WebSocket(serverWsUrl());
    const send = (msg: ClientMessage) => ws.send(JSON.stringify(msg));
    let timer: number | undefined;

    ws.onopen = () => {
      setStatus('online');
      send({ t: 'ping', at: performance.now() });
      timer = window.setInterval(() => send({ t: 'ping', at: performance.now() }), 3000);
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(String(event.data)) as ServerMessage;
      if (msg.t === 'pong') setPingMs(Math.round(performance.now() - msg.at));
    };
    ws.onclose = () => setStatus('offline');

    return () => {
      window.clearInterval(timer);
      ws.close();
    };
  }, []);

  return (
    <main className="boot">
      <h1 className="boot-logo">REPLAY</h1>
      <p className="boot-status" data-status={status}>
        {status === 'online' && `SERVER ONLINE${pingMs === null ? '' : ` · ${pingMs} MS`}`}
        {status === 'connecting' && 'CONNECTING…'}
        {status === 'offline' && 'SERVER OFFLINE'}
      </p>
    </main>
  );
}
