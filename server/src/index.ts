import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { WS_PATH, parseClientMessage, type ServerMessage } from '@replay/shared';
import { config, isOriginAllowed } from './config';

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify({ ok: true, serverTime: Date.now() }));
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
  ws.send(JSON.stringify(msg));
}

wss.on('connection', (ws) => {
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
    }
  });
});

httpServer.listen(config.port, () => {
  console.log(`[replay] server listening on :${config.port} (${config.isProduction ? 'production' : 'development'})`);
});
