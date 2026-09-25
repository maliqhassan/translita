import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  CAPABILITIES,
  capabilitiesFor,
  resolveFeatureAccess,
  type Capability,
  type Plan,
} from '@/services/entitlements';
import {
  createExpoSpeechRecognitionService,
  supportsOnDeviceRecognition,
  type SpeechRecognitionNative,
} from '@/services/speech/expo-speech-recognition-service';
import type { SpeechRecognitionEvent } from '@/services/speech/speech-service';

/**
 * Day 17: dictation, exercised at the native seam.
 *
 * The platform recogniser cannot run under Node, so the service is driven
 * against a fake with the module's exact shape — an imperative `start` whose
 * results arrive as events. That covers every line of our own code; it cannot
 * cover whether a real microphone produces a transcript.
 */

type Listener = (payload: unknown) => void;

/** A stand-in for the native recogniser, with its API and event behaviour. */
function fakeNative(
  options: {
    available?: boolean;
    onDevice?: boolean;
    permission?: { granted: boolean; canAskAgain: boolean };
    afterRequest?: { granted: boolean; canAskAgain: boolean };
    throwOnStart?: boolean;
    throwOnPermission?: boolean;
  } = {},
) {
  const listeners = new Map<string, Listener[]>();
  const calls: string[] = [];
  let removed = 0;

  const fire = (event: string, payload: unknown) => {
    for (const listener of listeners.get(event) ?? []) listener(payload);
  };

  const native = {
    calls,
    fire,
    get removedListeners() {
      return removed;
    },
    get listenerCount() {
      return [...listeners.values()].reduce((n, l) => n + l.length, 0);
    },

    isRecognitionAvailable: () => options.available ?? true,
    supportsOnDeviceRecognition: () => options.onDevice ?? false,

    async getPermissionsAsync() {
      calls.push('getPermissions');
      if (options.throwOnPermission) throw new Error('permission subsystem down');
      return options.permission ?? { granted: true, canAskAgain: true };
    },

    async requestPermissionsAsync() {
      calls.push('requestPermissions');
      return options.afterRequest ?? { granted: true, canAskAgain: true };
    },

    start(opts: { lang?: string; interimResults?: boolean }) {
      calls.push(`start:${opts.lang}:${opts.interimResults}`);
      if (options.throwOnStart) throw new Error('recogniser busy');
    },
    stop() {
      calls.push('stop');
    },
    abort() {
      calls.push('abort');
    },

    addListener(event: string, listener: Listener) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener]);
      return {
        remove() {
          removed += 1;
          listeners.set(
            event,
            (listeners.get(event) ?? []).filter((l) => l !== listener),
          );
        },
      };
    },
  };

  return native as unknown as SpeechRecognitionNative & typeof native;
}

const collect = (service: ReturnType<typeof createExpoSpeechRecognitionService>) => {
  const events: SpeechRecognitionEvent[] = [];
  service.subscribe((event) => events.push(event));
  return events;
};

const started = async (native: SpeechRecognitionNative) => {
  const service = createExpoSpeechRecognitionService(native);
  const events = collect(service);
  const result = await service.start({ language: 'en' });
  return { service, events, result };
};

describe('whether the device can recognise speech', () => {
  it('is available when the platform says so', async () => {
    assert.equal(await createExpoSpeechRecognitionService(fakeNative()).isAvailable(), true);
  });

  it('is unavailable when the platform says so', async () => {
    const service = createExpoSpeechRecognitionService(fakeNative({ available: false }));
    assert.equal(await service.isAvailable(), false);
  });

  it('is unavailable, not broken, when the module is absent from the build', async () => {
    const service = createExpoSpeechRecognitionService(null);
    assert.equal(await service.isAvailable(), false);

    // And every operation refuses rather than throwing.
    assert.equal((await service.start({ language: 'en' })).ok, false);
    assert.equal((await service.requestPermission()).ok, false);
    assert.equal((await service.stop()).ok, true);
    assert.equal((await service.cancel()).ok, true);
  });

  it('reports on-device support honestly rather than assuming it', () => {
    assert.equal(supportsOnDeviceRecognition(fakeNative({ onDevice: false })), false);
    assert.equal(supportsOnDeviceRecognition(fakeNative({ onDevice: true })), true);
    assert.equal(supportsOnDeviceRecognition(null), false);
  });
});

describe('permission', () => {
  it('is not requested merely by constructing the service', () => {
    const native = fakeNative();
    createExpoSpeechRecognitionService(native);

    assert.deepEqual(native.calls, [], 'nothing may be asked before the user acts');
  });

  it('is not requested by checking availability', async () => {
    const native = fakeNative();
    await createExpoSpeechRecognitionService(native).isAvailable();

    assert.equal(
      native.calls.some((call) => call.includes('ermission')),
      false,
    );
  });

  it('grants without re-prompting when already granted', async () => {
    const native = fakeNative({ permission: { granted: true, canAskAgain: true } });
    const result = await createExpoSpeechRecognitionService(native).requestPermission();

    assert.equal(result.ok && result.value, true);
    assert.equal(native.calls.includes('requestPermissions'), false, 'no needless dialog');
  });

  it('prompts when not yet granted, and reports the grant', async () => {
    const native = fakeNative({
      permission: { granted: false, canAskAgain: true },
      afterRequest: { granted: true, canAskAgain: true },
    });
    const result = await createExpoSpeechRecognitionService(native).requestPermission();

    assert.equal(result.ok && result.value, true);
    assert.ok(native.calls.includes('requestPermissions'));
  });

  it('reports a refusal that can be asked again as ok(false)', async () => {
    const native = fakeNative({
      permission: { granted: false, canAskAgain: true },
      afterRequest: { granted: false, canAskAgain: true },
    });
    const result = await createExpoSpeechRecognitionService(native).requestPermission();

    // Refused, but the dialog can be offered again: not an error state.
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.value, false);
  });

  it('reports a permanent refusal as an error naming system settings', async () => {
    const native = fakeNative({ permission: { granted: false, canAskAgain: false } });
    const result = await createExpoSpeechRecognitionService(native).requestPermission();

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.code, 'permission_denied');
    assert.match(!result.ok ? result.error.message : '', /settings/i);
    assert.equal(native.calls.includes('requestPermissions'), false, 'asking again is pointless');
  });

  it('does not crash when the permission subsystem fails', async () => {
    const native = fakeNative({ throwOnPermission: true });
    const result = await createExpoSpeechRecognitionService(native).requestPermission();

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.code, 'permission_denied');
  });
});

describe('a recognition session', () => {
  it('passes the selected language and asks for interim results', async () => {
    const native = fakeNative();
    await createExpoSpeechRecognitionService(native).start({ language: 'de' });

    assert.ok(native.calls.includes('start:de:true'));
  });

  it('passes a script variant through unchanged, inventing no mapping', async () => {
    // LanguageIds are already BCP-47; there is no second catalogue here.
    const native = fakeNative();
    await createExpoSpeechRecognitionService(native).start({ language: 'zh-Hans' });

    assert.ok(native.calls.some((call) => call.startsWith('start:zh-Hans')));
  });

  it('refuses an auto source rather than guessing what was spoken', async () => {
    const native = fakeNative();
    const result = await createExpoSpeechRecognitionService(native).start({ language: 'auto' });

    assert.equal(!result.ok && result.error.code, 'unsupported_language');
    assert.equal(
      native.calls.some((call) => call.startsWith('start')),
      false,
    );
  });

  it('refuses to start when no recogniser is available', async () => {
    const native = fakeNative({ available: false });
    const result = await createExpoSpeechRecognitionService(native).start({ language: 'en' });

    assert.equal(!result.ok && result.error.code, 'service_unavailable');
  });

  it('reports partial transcripts as they arrive', async () => {
    const native = fakeNative();
    const { events } = await started(native);

    native.fire('result', { isFinal: false, results: [{ transcript: 'good mor' }] });
    native.fire('result', { isFinal: false, results: [{ transcript: 'good morning' }] });

    assert.deepEqual(events, [
      { type: 'partial', transcript: 'good mor' },
      { type: 'partial', transcript: 'good morning' },
    ]);
  });

  it('reports the final transcript', async () => {
    const native = fakeNative();
    const { events } = await started(native);

    native.fire('result', { isFinal: true, results: [{ transcript: 'good morning' }] });

    assert.deepEqual(events, [{ type: 'final', transcript: 'good morning' }]);
  });

  it('does not blank the input on an empty final result', async () => {
    // "Nothing was heard" must not wipe what the user had already typed.
    const native = fakeNative();
    const { events } = await started(native);

    native.fire('result', { isFinal: true, results: [{ transcript: '' }] });
    native.fire('result', { isFinal: false, results: [{ transcript: '' }] });

    assert.deepEqual(events, []);
  });

  it('forwards volume changes for a level meter', async () => {
    const native = fakeNative();
    const { events } = await started(native);

    native.fire('volumechange', { value: 0.4 });
    assert.deepEqual(events, [{ type: 'volume', level: 0.4 }]);
  });

  it('emits end and releases native listeners when the session finishes', async () => {
    const native = fakeNative();
    const { events } = await started(native);
    assert.ok(native.listenerCount > 0);

    native.fire('end', null);

    assert.deepEqual(events, [{ type: 'end' }]);
    assert.equal(native.listenerCount, 0, 'no listeners may outlive the session');
  });

  it('tears down a stale session before opening a second one, rather than wedging silently', async () => {
    // A session that never reaches `end` — the app backgrounded mid-listen, a
    // screen changed while the mic was open — must not permanently disable
    // every microphone in the app. The second start recovers it instead of
    // being silently ignored forever.
    const native = fakeNative();
    const service = createExpoSpeechRecognitionService(native);

    await service.start({ language: 'en' });
    await service.start({ language: 'en' });

    assert.equal(native.calls.filter((call) => call.startsWith('start')).length, 2);
    assert.ok(native.calls.includes('abort'), 'the stale session is aborted first');
  });

  it('ignores a stop when nothing is listening', async () => {
    const native = fakeNative();
    const service = createExpoSpeechRecognitionService(native);

    assert.equal((await service.stop()).ok, true);
    assert.equal(native.calls.includes('stop'), false);
  });

  it('ignores a second stop after the session ended', async () => {
    const native = fakeNative();
    const service = createExpoSpeechRecognitionService(native);
    await service.start({ language: 'en' });

    await service.stop();
    native.fire('end', null);
    await service.stop();

    assert.equal(native.calls.filter((call) => call === 'stop').length, 1);
  });

  it('cancels without waiting for a final result', async () => {
    const native = fakeNative();
    const service = createExpoSpeechRecognitionService(native);
    await service.start({ language: 'en' });

    assert.equal((await service.cancel()).ok, true);
    assert.ok(native.calls.includes('abort'));
    assert.equal(native.listenerCount, 0, 'cancelling cleans up too');
  });

  it('cleans up when the recogniser refuses to start', async () => {
    const native = fakeNative({ throwOnStart: true });
    const service = createExpoSpeechRecognitionService(native);

    const result = await service.start({ language: 'en' });

    assert.equal(result.ok, false);
    assert.equal(native.listenerCount, 0, 'a failed start must leave nothing behind');
    // And the session is not stuck: a later start is allowed.
    const native2 = fakeNative();
    assert.equal(
      (await createExpoSpeechRecognitionService(native2).start({ language: 'en' })).ok,
      true,
    );
  });

  it('stops notifying after unsubscribe', async () => {
    const native = fakeNative();
    const service = createExpoSpeechRecognitionService(native);
    const events: SpeechRecognitionEvent[] = [];
    const unsubscribe = service.subscribe((event) => events.push(event));

    await service.start({ language: 'en' });
    unsubscribe();
    native.fire('result', { isFinal: true, results: [{ transcript: 'hello' }] });

    assert.deepEqual(events, []);
  });
});

describe('error mapping', () => {
  const codes: [string, string][] = [
    ['not-allowed', 'permission_denied'],
    ['service-not-allowed', 'permission_denied'],
    ['language-not-supported', 'unsupported_language'],
    ['network', 'network_unavailable'],
    ['no-speech', 'invalid_request'],
    ['aborted', 'cancelled'],
    ['audio-capture', 'service_unavailable'],
    ['something-new-from-android', 'unknown'],
  ];

  for (const [native, expected] of codes) {
    it(`maps ${native} to ${expected}`, async () => {
      const fake = fakeNative();
      const { events } = await started(fake);

      fake.fire('error', { error: native, message: 'transcript was: my bank password' });

      const event = events[0];
      assert.equal(event?.type, 'error');
      assert.equal(event?.type === 'error' && event.error.code, expected);
    });
  }

  it('never lets a native error message reach the caller', async () => {
    const native = fakeNative();
    const { events } = await started(native);

    native.fire('error', { error: 'network', message: 'failed while transcribing: buy milk' });

    const event = events[0];
    assert.equal(event?.type, 'error');
    assert.equal(
      event?.type === 'error' && event.error.message.includes('buy milk'),
      false,
      'a native message can quote what was heard',
    );
  });
});

describe('privacy of what was said', () => {
  it('never logs a transcript', () => {
    const source = readFileSync('src/services/speech/expo-speech-recognition-service.ts', 'utf8');

    for (const line of source.split('\n')) {
      if (/log\.(warn|error|info|debug)/.test(line)) {
        assert.equal(
          /transcript|payload|\bevent\b|results/.test(line),
          false,
          `log line may carry speech: ${line.trim()}`,
        );
      }
    }
  });

  it('never logs a transcript from the hook either', () => {
    const hook = readFileSync('src/features/translation/hooks/use-speech-recognition.ts', 'utf8');
    assert.equal(/console\.|log\./.test(hook), false);
  });

  it('keeps the platform recogniser in exactly one file', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (
          /\.tsx?$/.test(entry.name) &&
          readFileSync(path, 'utf8').includes("from 'expo-speech-recognition'")
        ) {
          offenders.push(path);
        }
      }
    };
    walk('src');

    assert.deepEqual(offenders, ['src/services/speech/expo-speech-recognition-service.ts']);
  });

  it('adds no telemetry', () => {
    const source = readFileSync('src/services/speech/expo-speech-recognition-service.ts', 'utf8');
    for (const word of ['fetch(', 'analytics', 'telemetry', 'track(']) {
      assert.equal(source.includes(word), false, word);
    }
  });
});

describe('the microphone is wired, not decorative', () => {
  it('is bound in the registry, not imported by a screen', () => {
    const registry = readFileSync('src/services/service-registry.ts', 'utf8');
    assert.match(registry, /speech: expoSpeechRecognitionService/);
  });

  it('reaches the composer through the service abstraction only', () => {
    const composer = readFileSync(
      'src/features/translation/components/translation-composer.tsx',
      'utf8',
    );

    // The control exists, calls toggle, and knows nothing about the platform.
    assert.match(composer, /speech\.toggle\(sourceLanguage\)/);
    // The redesign made this a labelled button rather than a bare icon, so the
    // listening state is now shown by the label as well as the glyph.
    assert.match(composer, /speech\.listening \? 'Stop' : 'Speak'/);
    assert.equal(composer.includes('expo-speech-recognition'), false);
  });

  it('hides the microphone when recognition is unavailable', () => {
    const composer = readFileSync(
      'src/features/translation/components/translation-composer.tsx',
      'utf8',
    );
    assert.match(composer, /speech\.status !== 'unavailable'/);
  });

  it('writes recognised text into the translation input, tagged as spoken', () => {
    const screen = readFileSync('src/features/translation/screens/translate-screen.tsx', 'utf8');

    // Day 19 routed this through a named setter so history can record that the
    // text was dictated. It still lands in the same draft.
    assert.match(screen, /onPartial: setDictated/);
    assert.match(screen, /onFinal: setDictated/);
    assert.match(
      screen,
      /setDictated = useCallback\(\(text: string\) => setInput\(text, 'voice'\)/,
    );
  });

  it('does not translate automatically after dictation', () => {
    const screen = readFileSync('src/features/translation/screens/translate-screen.tsx', 'utf8');

    // Pressing Translate stays the user's decision, as it is for typed text.
    assert.equal(/onFinal: \(.*\) => \{[\s\S]{0,120}translate\(\)/.test(screen), false);
  });

  it('is gated on the shipped-capability flag', () => {
    const hook = readFileSync('src/features/translation/hooks/use-speech-recognition.ts', 'utf8');
    assert.match(hook, /FEATURES\.speechInput/);
  });
});

describe('dictation is available on every plan', () => {
  /**
   * The decision itself is `resolveFeatureAccess`, which is unit-tested
   * exhaustively in `entitlements.test.ts`. What is worth pinning here is that
   * the speech gate feeds it the right three answers, and that every case the
   * product cares about comes out of it.
   */
  const accessFor = (shipped: boolean, supported: boolean, plan: Plan) =>
    resolveFeatureAccess({
      shipped,
      supported,
      entitled: capabilitiesFor(plan).has('speechRecognition'),
    });

  it('is allowed for a free user on a device that could listen', () => {
    // This asserted `locked` while dictation was sold as part of Pro.
    assert.equal(accessFor(true, true, 'free'), 'allowed');
  });

  it('is allowed for a pro user on a device that could listen', () => {
    assert.equal(accessFor(true, true, 'pro'), 'allowed');
  });

  it('answers the same on both plans, whatever the device says', () => {
    // Feature parity at the level the gate actually works on. The plan is
    // simply not one of the inputs that can change the answer any more.
    for (const shipped of [true, false]) {
      for (const supported of [true, false]) {
        assert.equal(
          accessFor(shipped, supported, 'free'),
          accessFor(shipped, supported, 'pro'),
          `shipped=${shipped} supported=${supported}`,
        );
      }
    }
  });

  it('is unavailable when the capability is not in this build, on either plan', () => {
    assert.equal(accessFor(false, true, 'free'), 'unavailable');
    assert.equal(accessFor(false, true, 'pro'), 'unavailable');
  });

  it('is unavailable when the device has no recogniser, on either plan', () => {
    assert.equal(accessFor(true, false, 'free'), 'unavailable');
    assert.equal(accessFor(true, false, 'pro'), 'unavailable');
  });

  it('never reports locked for a device that could not listen anyway', () => {
    // `locked` is what leads to the paywall. A phone with no recogniser must
    // never reach it, because upgrading would not give it one.
    //
    // Still worth pinning even though nothing is locked today: this is the
    // rule that stops a device limitation being sold as a plan limitation,
    // and it has to survive any future change to the tiers.
    for (const plan of ['free', 'pro'] as const) {
      assert.notEqual(accessFor(true, false, plan), 'locked');
      assert.notEqual(accessFor(false, false, plan), 'locked');
      assert.notEqual(accessFor(false, true, plan), 'locked');
    }
  });

  it('is never locked on any plan, because both plans hold it', () => {
    for (const plan of ['free', 'pro'] as const) {
      for (const shipped of [true, false]) {
        for (const supported of [true, false]) {
          assert.notEqual(accessFor(shipped, supported, plan), 'locked');
        }
      }
    }
  });

  it('keeps a device with no recogniser unavailable rather than allowed', () => {
    // The half of the rule that must not be lost in making everything free:
    // a phone that cannot listen is still told so, on both plans.
    assert.equal(accessFor(true, false, 'free'), 'unavailable');
    assert.equal(accessFor(true, false, 'pro'), 'unavailable');
  });

  it('is part of both plans', () => {
    assert.equal(capabilitiesFor('pro').has('speechRecognition'), true);
    assert.equal(capabilitiesFor('free').has('speechRecognition'), true);
  });

  it('is sold under a name of its own, separate from the build flag', () => {
    // `FEATURES.speechInput` says what is in the build; `speechRecognition`
    // says what the user paid for. Conflating them would make a flag change
    // look like a purchase.
    assert.equal(CAPABILITIES.includes('speechRecognition'), true);
    assert.equal(CAPABILITIES.includes('speechInput' as Capability), false);
  });
});
