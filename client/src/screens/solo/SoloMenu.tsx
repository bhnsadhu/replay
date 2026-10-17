import { useState } from 'react';
import { MIXES, type MixId } from '@replay/shared';
import { Logo, Phone, PhoneTopRow, StatusLine } from '../../ui/frames';
import { useConnection } from '../../net/useConnection';

interface SoloMenuProps {
  loading: boolean;
  initialMix?: MixId;
  onStart: (mix: MixId) => void;
}

export function SoloMenu({ loading, initialMix = 'throwbacks', onStart }: SoloMenuProps) {
  const [mix, setMix] = useState<MixId>(initialMix);
  const { status, warmingUp } = useConnection();
  const online = status === 'online';

  return (
    <Phone>
      <PhoneTopRow context="SOLO" status="stop" />
      <div className="menu-hero">
        <Logo size="phone" />
        <span className="menu-hero__coin display">INSERT COIN</span>
      </div>

      <fieldset className="menu-list">
        <legend className="menu-list__legend display">PICK A MIX</legend>
        {MIXES.map((m) => (
          <button
            key={m.id}
            type="button"
            className={m.id === mix ? 'menu-item menu-item--on' : 'menu-item'}
            aria-pressed={m.id === mix}
            onClick={() => setMix(m.id)}
          >
            <span className="menu-item__cursor display" aria-hidden="true">
              ▶
            </span>
            <span className="display">{m.label}</span>
          </button>
        ))}
      </fieldset>

      <button type="button" className="primary-button display" disabled={!online || loading} onClick={() => onStart(mix)}>
        {loading ? 'LOADING SONGS…' : 'PRESS START'}
      </button>

      <StatusLine tone={online ? 'good' : warmingUp ? 'time' : 'dim'}>
        {online ? '10 ROUNDS · FREE PLAY' : warmingUp ? 'WARMING UP THE CABINET…' : 'CONNECTING…'}
      </StatusLine>
    </Phone>
  );
}
