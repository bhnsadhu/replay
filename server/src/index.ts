import { createServer, type IncomingMessage } from 'node:http';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { AUDIO_PATH, WS_PATH, parseClientMessage, type ServerMessage } from '@replay/shared';
import { config, isOriginAllowed } from './config';
import { serveClip } from './audio';
import { SoloGame } from './solo';
import { handleRoomMessage, type Session } from './rooms';
import { publicRoom } from './public';
import { warmMixes } from './music/mixes';
import { LIMITS, TokenBucket, audioLimiter, clientIp, closeConnection, connectLimiter, openConnection, tryLimiter } from './limits';

const httpServer = createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;

  if (path === '/health') {
    res.writeHead(200, {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    });
    // ipSource says which header the rate limits key on (never the IP itself).
    res.end(JSON.stringify({ ok: true, serverTime: Date.now(), ipSource: clientIp(req).source }));
    return;
  }

  if (path.startsWith(`${AUDIO_PATH}/`) && (req.method === 'GET' || req.method === 'HEAD')) {
    if (!audioLimiter.take(clientIp(req).ip)) {
      res.writeHead(429, { 'content-type': 'text/plain', 'retry-after': '5' });
      res.end('Too many requests');
      return;
    }
    serveClip(path.slice(AUDIO_PATH.length + 1), req, res);
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('Not found');
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });

// Heartbeat: clients ping every few seconds. Through the hosting proxy a vanished phone isn't
// noticed for 10-20 s, so the server drops any connection that has gone quiet itself.
const SILENCE_LIMIT_MS = 12_000;
const lastHeard = new WeakMap<WebSocket, number>();
setInterval(() => {
  const now = Date.now();
  for (const ws of wss.clients) {
    if (now - (lastHeard.get(ws) ?? now) > SILENCE_LIMIT_MS) ws.terminate();
  }
}, 4000).unref();

httpServer.on('upgrade', (req, socket, head) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (path !== WS_PATH || !isOriginAllowed(req.headers.origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  if (!connectLimiter.take(clientIp(req).ip)) {
    socket.write('HTTP/1.1 429 Too Many Requests\r\nRetry-After: 10\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

/** Messages that cost a lookup or a Deezer fetch, or guess at room codes: limited per IP. */
const TRIES = new Set(['room:create', 'room:join', 'room:resume', 'public:join', 'public:resume', 'solo:start']);

wss.on('connection', (ws, req: IncomingMessage) => {
  const { ip } = clientIp(req);
  if (!openConnection(ip)) {
    ws.close(1013, 'Too many connections');
    return;
  }
  const messages = new TokenBucket(LIMITS.messageBurst, LIMITS.messageEveryMs);
  let drops = 0;
  let warnedAt = 0;
  const limited = (message: string) => {
    if (Date.now() - warnedAt < 2000) return;
    warnedAt = Date.now();
    session.send({ t: 'error', code: 'rate_limited', message });
  };

  const session: Session = {
    id: randomBytes(6).toString('base64url'),
    send: (msg: ServerMessage) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    },
    room: null,
    role: null,
    playerId: null,
    inPublic: false,
  };

  let solo: SoloGame | null = null;
  const endSolo = () => {
    solo?.dispose();
    solo = null;
  };

  session.send({ t: 'welcome', serverTime: Date.now() });

  lastHeard.set(ws, Date.now());
  ws.on('message', (data) => {
    lastHeard.set(ws, Date.now());
    if (!messages.take()) {
      if (++drops > LIMITS.dropsBeforeClose) ws.close(1008, 'Too many messages');
      else limited('Slow down a little.');
      return;
    }
    const msg = parseClientMessage(data.toString());
    if (!msg) {
      session.send({ t: 'error', code: 'bad_message', message: 'Message was not understood.' });
      return;
    }
    if (TRIES.has(msg.t) && !tryLimiter.take(ip)) {
      limited('Too many tries from this network. Wait a minute, then try again.');
      return;
    }
    // One place at a time: joining a room, the public room or solo leaves the others.
    switch (msg.t) {
      case 'public:join':
        endSolo();
        session.room?.remove(session);
        publicRoom.join(session, msg.initials);
        return;
      case 'public:leave':
        publicRoom.leave(session);
        return;
      case 'public:away':
        publicRoom.away(session);
        return;
      case 'public:resume':
        endSolo();
        session.room?.remove(session);
        if (!publicRoom.resume(session, msg.token)) {
          session.send({ t: 'error', code: 'resume_failed', message: 'That seat is gone. Press start to join again.' });
        }
        return;
      case 'public:initials':
        publicRoom.setInitials(session, msg.initials);
        return;
      case 'public:stats':
        session.send({ t: 'public:stats', ...publicRoom.stats() });
        return;
      case 'guess':
        if (session.inPublic) return publicRoom.guess(session, msg.roundId, msg.choice, msg.elapsedMs);
        break;
      case 'room:create':
      case 'room:join':
      case 'room:resume':
        endSolo();
        publicRoom.leave(session);
        break;
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
        publicRoom.leave(session);
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
    closeConnection(ip);
    // A dropped connection keeps the seat for a minute (PLAN.md §5); leaving on purpose is room:leave.
    endSolo();
    session.room?.away(session);
    publicRoom.away(session);
  });
});

httpServer.listen(config.port, () => {
  console.log(`[replay] server listening on :${config.port} (${config.isProduction ? 'production' : 'development'})`);
  warmMixes();
});
