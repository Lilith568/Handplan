/**
 * Small synthesized cues. No audio files: each cue is one or two soft sine
 * tones, so the app stays tiny and starts instantly.
 */

type Cue = 'pick' | 'drop' | 'refuse' | 'done' | 'timeup' | 'start';

const CUES: Record<Cue, Array<[frequency: number, at: number, length: number]>> = {
  pick: [[660, 0, 0.06]],
  drop: [[440, 0, 0.09]],
  refuse: [
    [196, 0, 0.12],
    [174, 0.13, 0.16],
  ],
  start: [
    [523, 0, 0.1],
    [784, 0.1, 0.18],
  ],
  done: [
    [659, 0, 0.12],
    [880, 0.11, 0.14],
    [1175, 0.23, 0.3],
  ],
  timeup: [
    [880, 0, 0.25],
    [880, 0.4, 0.25],
    [880, 0.8, 0.45],
  ],
};

let context: AudioContext | undefined;

/** Call from a user gesture so the browser allows audio. */
export function unlockAudio(): void {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') {
      void context.resume();
    }
  } catch {
    context = undefined;
  }
}

export function play(cue: Cue): void {
  if (!context || context.state !== 'running') {
    return;
  }
  const now = context.currentTime;
  for (const [frequency, at, length] of CUES[cue]) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, now + at);
    gain.gain.linearRampToValueAtTime(0.16, now + at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + at + length);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(now + at);
    oscillator.stop(now + at + length + 0.02);
  }
}
