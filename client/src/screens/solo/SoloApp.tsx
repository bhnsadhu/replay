import { useIsPhone, useNow, secondsUntil } from '../../game/clock';
import { useSoloGame } from '../../game/useSoloGame';
import { Phone, PhoneTopRow, StatusLine } from '../../ui/frames';
import { RoundPhone } from '../RoundPhone';
import { pad2 } from '../format';
import { SoloMenu } from './SoloMenu';
import { SoloRoundDesktop } from './SoloRoundDesktop';
import { SoloRevealDesktop, SoloRevealPhone } from './SoloReveal';
import { SoloOver } from './SoloOver';

/** Single-player mode (M2). Phones get phone layouts; bigger screens get the TV layout. */
export function SoloApp() {
  const { state, start, pick, quit } = useSoloGame();
  const isPhone = useIsPhone();
  const now = useNow(200);

  switch (state.phase) {
    case 'menu':
      return <SoloMenu loading={false} onStart={start} />;

    case 'preparing':
      return <SoloMenu loading initialMix={state.mix} onStart={start} />;

    case 'round': {
      const clipSeconds = state.round.durationMs / 1000;
      const endAt = state.localStartAt + state.round.durationMs;
      const secondsLeft = now < state.localStartAt ? clipSeconds : secondsUntil(endAt, now, clipSeconds);
      const progress = Math.min(1, Math.max(0, (now - state.localStartAt) / state.round.durationMs));
      if (isPhone) {
        return (
          <RoundPhone
            context={`SOLO · RND ${pad2(state.round.index)}`}
            player={{ label: 'SOLO', initials: 'YOU', score: state.score, streak: state.streak }}
            options={state.round.options}
            picked={state.picked}
            secondsLeft={secondsLeft}
            clipSeconds={clipSeconds}
            onPick={pick}
          />
        );
      }
      return (
        <SoloRoundDesktop
          round={state.round}
          picked={state.picked}
          secondsLeft={secondsLeft}
          progress={progress}
          score={state.score}
          streak={state.streak}
          onPick={pick}
        />
      );
    }

    case 'reveal': {
      const secondsToNext = state.localNextAt === null ? 0 : secondsUntil(state.localNextAt, now, 5);
      const props = { round: state.round, reveal: state.reveal, streakBefore: state.streakBefore, secondsToNext };
      return isPhone ? <SoloRevealPhone {...props} /> : <SoloRevealDesktop {...props} />;
    }

    case 'over':
      return <SoloOver over={state.over} mix={state.mix} onReplay={() => start(state.mix)} onMenu={quit} />;

    case 'error':
      return (
        <Phone>
          <PhoneTopRow context="SOLO" status="stop" />
          <div className="error-box">
            <p className="error-box__title display">TAPE JAMMED</p>
            <p>{state.message}</p>
          </div>
          <button type="button" className="primary-button display" onClick={quit}>
            BACK TO MENU
          </button>
          <StatusLine>INSERT COIN</StatusLine>
        </Phone>
      );
  }
}
