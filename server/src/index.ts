import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { AUDIO_PATH, WS_PATH, parseClientMessage, type ServerMessage } from '@replay/shared';
import { config, isOriginAllowed } from './config';
import { serveClip } from './audio';
import { SoloGame } from './solo';
import { handleRoomMessage, type Session } from './rooms';

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

wss.on('connection', (ws) => {
  const session: Session = {
    id: randomBytes(6).toString('base64url'),
    send: (msg: ServerMessage) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    },
    room: null,
    role: null,
    playerId: null,
  };

  let solo: SoloGame | null = null;
  const endSolo = () => {
    solo?.dispose();
    solo = null;
  };

  session.send({ t: 'welcome', serverTime: Date.now() });

  ws.on('message', (data) => {
    const msg = parseClientMessage(data.toString());
    if (!msg) {
      session.send({ t: 'error', code: 'bad_message', message: 'Message was not understood.' });
      return;
    }
    if (handleRoomMessage(session, msg)) return;

    switch (msg.t) {
      case 'ping':
        session.send({ t: 'pong', at: msg.at, serverTime: Date.now() });
        break;
      case 'echo':
        session.send({ t: 'echo', text: msg.text });
        break;
      case 'solo:start':
        endSolo();
        session.room?.remove(session);
        solo = new SoloGame(msg.mix, session.send);
        void solo.start();
        break;
      case 'solo:quit':
        endSolo();
        break;
      case 'guess':
        if (solo) solo.guess(msg.roundId, msg.choice, msg.elapsedMs);
        else session.send({ t: 'error', code: 'not_in_game', message: 'Start a game first.' });
        break;
    }
  });

  ws.on('close', () => {
    endSolo();
    session.room?.remove(session);
  });
});

httpServer.listen(config.port, () => {
  console.log(`[replay] server listening on :${config.port} (${config.isProduction ? 'production' : 'development'})`);
});
