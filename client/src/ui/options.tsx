// The options screen (PLAN.md §3, screen 9): sound, reduce effects, change initials, leave,
// plus the host's in-game controls (PLAN.md §5). Opened from the gear in the phone top row.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { setPrefs, usePrefs } from '../prefs';
import { InitialsPicker, Toggle } from './controls';
import { GearIcon, Scanlines, StatusLine } from './frames';
import { OpenOptions } from './optionsContext';

export interface OptionsConfig {
  /** Top-left context, e.g. "WXQK" or "PUBLIC". */
  context: string;
  initials?: {
    value: string;
    /** Why initials can't change right now (e.g. mid-game), or null when they can. */
    lockedReason: string | null;
    onSave: (initials: string) => void;
  };
  host?: {
    paused: boolean;
    onPause: (paused: boolean) => void;
    onSkip: () => void;
    onEnd: () => void;
  };
  leave?: { label: string; onLeave: () => void };
}

/** Wraps a game screen so its gear opens the options sheet. `floatingGear` adds a corner gear for TV/desktop layouts. */
export function OptionsHost({ config, floatingGear = false, children }: { config: OptionsConfig; floatingGear?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <OpenOptions.Provider value={() => setOpen(true)}>
      {children}
      {floatingGear && !open && (
        <button type="button" className="icon-button options-fab" aria-label="Options" onClick={() => setOpen(true)}>
          <GearIcon />
        </button>
      )}
      {open && <OptionsSheet config={config} onClose={() => setOpen(false)} />}
    </OpenOptions.Provider>
  );
}

/** A button that needs a second press within 3 s, for things that can't be undone. */
function PressTwice({ label, confirm, onConfirm, className }: { label: string; confirm: string; onConfirm: () => void; className: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 3000);
    return () => window.clearTimeout(timer);
  }, [armed]);
  return (
    <button type="button" className={armed ? `${className} options__danger--armed` : className} onClick={() => (armed ? onConfirm() : setArmed(true))}>
      {armed ? confirm : label}
    </button>
  );
}

function OptionsSheet({ config, onClose }: { config: OptionsConfig; onClose: () => void }) {
  const prefs = usePrefs();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(config.initials?.value ?? 'AAA');
  const [saved, setSaved] = useState(false);

  // A dialog: focus moves in, Escape closes, focus returns to the gear afterwards.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    sheetRef.current?.querySelector<HTMLElement>('button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      before?.focus?.();
    };
  }, [onClose]);

  const { initials, host, leave } = config;
  const initialsChanged = initials !== undefined && draft !== initials.value;

  return (
    <div className="options-backdrop">
      <div className="phone options" role="dialog" aria-modal="true" aria-labelledby="options-title" ref={sheetRef}>
        <Scanlines />
        <div className="phone-top">
          <span>{config.context}</span>
          <span className="phone-top__right">
            <span className="phone-top__status" id="options-title">
              ❚❚ OPTIONS
            </span>
            <button type="button" className="icon-button" aria-label="Close options" onClick={onClose}>
              ✕
            </button>
          </span>
        </div>

        {host && (
          <section className="options__group" aria-label="Host controls">
            <span className="menu-list__legend display">HOST</span>
            <button
              type="button"
              className="primary-button display"
              onClick={() => {
                host.onPause(!host.paused);
                onClose();
              }}
            >
              {host.paused ? '▶ RESUME' : '❚❚ PAUSE'}
            </button>
            <div className="options__row">
              <button
                type="button"
                className="secondary-button display options__small"
                disabled={host.paused}
                onClick={() => {
                  host.onSkip();
                  onClose();
                }}
              >
                ▶▶ SKIP SONG
              </button>
              <PressTwice label="■ END GAME" confirm="SURE? TAP AGAIN" onConfirm={() => {
                  host.onEnd();
                  onClose();
                }}
                className="secondary-button display options__small options__danger" />
            </div>
          </section>
        )}

        <section className="options__group" aria-label="This device">
          <Toggle label="SOUND" sub="Music and effects on this device" on={prefs.sound} onToggle={() => setPrefs({ sound: !prefs.sound })} />
          <Toggle
            label="REDUCE EFFECTS"
            sub="No scanlines, glow or glitches"
            on={!prefs.effects}
            onToggle={() => setPrefs({ effects: !prefs.effects })}
          />
        </section>

        {initials && (
          <section className="options__group" aria-label="Your initials">
            <span className="menu-list__legend display">CHANGE INITIALS</span>
            {initials.lockedReason ? (
              <p className="options__initials display">{initials.value}</p>
            ) : (
              <InitialsPicker
                value={draft}
                onChange={(v) => {
                  setDraft(v);
                  setSaved(false);
                }}
              />
            )}
            {initials.lockedReason ? (
              <p className="options__note">{initials.lockedReason}</p>
            ) : (
              <button
                type="button"
                className="secondary-button display options__small"
                disabled={!initialsChanged}
                onClick={() => {
                  initials.onSave(draft);
                  setSaved(true);
                }}
              >
                {saved && !initialsChanged ? 'SAVED' : 'SAVE INITIALS'}
              </button>
            )}
          </section>
        )}

        <div className="push-bottom options__group">
          {leave && (
            <PressTwice label={leave.label} confirm="PRESS AGAIN TO LEAVE" onConfirm={leave.onLeave} className="secondary-button display options__small options__danger" />
          )}
          <button type="button" className="primary-button display" onClick={onClose}>
            {leave ? 'BACK TO GAME' : 'DONE'}
          </button>
        </div>
        {leave && <StatusLine>{host?.paused ? 'GAME PAUSED' : 'THE GAME KEEPS RUNNING'}</StatusLine>}
      </div>
    </div>
  );
}
