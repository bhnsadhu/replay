import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { AUDIO_PATH, WS_PATH, parseClientMessage, type ServerMessage } from '@replay/shared';
import { config, isOriginAllowed } from './config';
import { serveClip } from './audio';
import { SoloGame } from './solo';

const httpServer = createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;

  if (path === '/health') {
    res.writeHead(200, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify({ ok: true, serverTime: Date.now() }));
    return;
  }

  if (path.startsWith(`${AUDIO_PATH}/`) && (req.method === 'GET' || req.method === 'HEAD')) {
    serveClip(path.slice(AUDIO_PATH.length + 1), req, res);
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('Not found');
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

httpServer.on('upgrade', (req, socket, head) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (path !== WS_PATH || !isOriginAllowed(req.headers.origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

wss.on('connection', (ws) => {
  let solo: SoloGame | null = null;
  const endSolo = () => {
    solo?.dispose();
    solo = null;
  };

  send(ws, { t: 'welcome', serverTime: Date.now() });

  ws.on('message', (data) => {
    const msg = parseClientMessage(data.toString());
    if (!msg) {
      send(ws, { t: 'error', code: 'bad_message', message: 'Message was not understood.' });
      return;
    }
    switch (msg.t) {
      case 'ping':
        send(ws, { t: 'pong', at: msg.at, serverTime: Date.now() });
        break;
      case 'echo':
        send(ws, { t: 'echo', text: msg.text });
        break;
      case 'solo:start':
        endSolo();
        solo = new SoloGame(msg.mix, (m) => send(ws, m));
        void solo.start();
        break;
      case 'solo:quit':
        endSolo();
        break;
      case 'guess':
        if (solo) solo.guess(msg);
        else send(ws, { t: 'error', code: 'not_in_game', message: 'Start a game first.' });
        break;
    }
  });

  ws.on('close', endSolo);
});

httpServer.listen(config.port, () => {
  console.log(`[replay] server listening on :${config.port} (${config.isProduction ? 'production' : 'development'})`);
});
