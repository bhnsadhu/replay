import { CLIP_MS, ROUNDS_PER_GAME, type MixId, type ServerMessage } from '@replay/shared';
import { Game } from './game';

const ME = 'me';

/** Single-player game: the shared round engine with exactly one player and no TV. */
export class SoloGame {
  private readonly game: Game;

  constructor(mix: MixId, send: (msg: ServerMessage) => void) {
    send({ t: 'solo:preparing', mix });
    this.game = new Game(
      { mix, rounds: ROUNDS_PER_GAME, clipMs: CLIP_MS },
      {
        playerIds: () => [ME],
        activePlayerIds: () => [ME],
        initialsOf: () => 'YOU',
        send: (build) => {
          const msg = build(ME);
          if (msg) send(msg);
        },
        onFinished: () => undefined,
        onFailed: (message) => send({ t: 'error', code: 'music_unavailable', message }),
      },
    );
  }

  start(): Promise<void> {
    return this.game.start();
  }

  guess(roundId: string, choice: Parameters<Game['guess']>[2], elapsedMs: number): void {
    this.game.guess(ME, roundId, choice, elapsedMs);
  }

  dispose(): void {
    this.game.dispose();
  }
}
