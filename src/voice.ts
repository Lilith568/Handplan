/**
 * Voice capture for adding a task without leaving the headset.
 *
 * Uses the browser's speech recognition when it exists. Where it does not, the
 * caller is told so and the flat page's text field stays the way to add tasks.
 */

export type VoiceState = 'idle' | 'listening' | 'unsupported';

interface RecognitionResultEvent {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | undefined {
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
}

export class VoiceCapture {
  state: VoiceState = recognitionConstructor() ? 'idle' : 'unsupported';
  private active: Recognition | undefined;

  /**
   * Listen for one phrase. `onText` receives the transcript; `onEnd` always
   * fires once, with a reason when nothing usable was heard.
   */
  listen(onText: (text: string) => void, onEnd: (problem?: string) => void): void {
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      this.state = 'unsupported';
      onEnd('unsupported');
      return;
    }
    if (this.active) {
      this.cancel();
      return;
    }
    let heard = false;
    let problem: string | undefined;
    let recognition: Recognition;
    try {
      recognition = new Constructor();
      recognition.lang = navigator.language || 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onresult = (event) => {
        const text = event.results[0]?.[0]?.transcript?.trim();
        if (text) {
          heard = true;
          onText(text);
        }
      };
      recognition.onerror = (event) => {
        problem = event.error ?? 'error';
      };
      recognition.onend = () => {
        this.active = undefined;
        this.state = 'idle';
        onEnd(heard ? undefined : (problem ?? 'no-speech'));
      };
      recognition.start();
    } catch {
      this.active = undefined;
      this.state = 'idle';
      onEnd('error');
      return;
    }
    this.active = recognition;
    this.state = 'listening';
  }

  cancel(): void {
    try {
      this.active?.abort();
    } catch {
      // Already stopped.
    }
  }
}
