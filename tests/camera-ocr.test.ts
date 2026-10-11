import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import { createMlKitOcrService, type OcrNative } from '@/services/ocr/mlkit-ocr-service';

/**
 * Camera OCR, exercised at the native seam.
 *
 * ML Kit cannot run under Node, so the service is driven against a fake with
 * the module's exact shape. That covers every line of our own code; it cannot
 * cover whether a camera opens or whether real text is recognised.
 */

type Block = { text: string; x: number; y: number; width: number; height: number };

function fakeNative(
  options: { text?: string; blocks?: Block[]; fail?: { code: string; message?: string } } = {},
) {
  const calls: string[] = [];

  const native = {
    calls,
    async recognize(uri: string) {
      calls.push(uri);
      if (options.fail) throw options.fail;
      return {
        text: options.text ?? 'Salida de emergencia',
        blocks: options.blocks ?? [
          { text: 'Salida de emergencia', x: 0.1, y: 0.2, width: 0.5, height: 0.05 },
        ],
      };
    },
  };

  return native as unknown as OcrNative & { calls: string[] };
}

const service = (native: OcrNative | null) => createMlKitOcrService({ native });

describe('whether the device can recognise text', () => {
  it('is available when the native module is compiled in', async () => {
    assert.equal(await service(fakeNative()).isAvailable(), true);
  });

  it('is unavailable, not broken, without the native module', async () => {
    const ocr = service(null);
    assert.equal(await ocr.isAvailable(), false);

    // And recognising refuses rather than throwing or inventing text.
    const result = await ocr.recognize({ imageUri: 'file:///photo.jpg' });
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.code, 'service_unavailable');
  });

  it('does not claim live per-frame recognition it cannot do', async () => {
    assert.equal(await service(fakeNative()).supportsLiveRecognition(), false);
  });

  it('does nothing at all until asked', () => {
    const native = fakeNative();
    service(native);

    assert.deepEqual(native.calls, [], 'constructing must not touch the camera or recogniser');
  });
});

describe('reading a capture', () => {
  it('passes the captured file to the recogniser', async () => {
    const native = fakeNative();
    await service(native).recognize({ imageUri: 'file:///tmp/capture.jpg' });

    assert.deepEqual(native.calls, ['file:///tmp/capture.jpg']);
  });

  it('returns the recognised text', async () => {
    const result = await service(fakeNative({ text: 'Ausgang' })).recognize({
      imageUri: 'file:///a.jpg',
    });

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.value.fullText, 'Ausgang');
  });

  it('keeps block boxes as fractions of the image', async () => {
    const result = await service(
      fakeNative({ blocks: [{ text: 'Ausgang', x: 0.25, y: 0.5, width: 0.4, height: 0.1 }] }),
    ).recognize({ imageUri: 'file:///a.jpg' });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    const block = result.value.blocks[0];
    assert.deepEqual(block?.box, { x: 0.25, y: 0.5, width: 0.4, height: 0.1 });
    assert.equal(block?.text, 'Ausgang');
    assert.ok(block?.id, 'every block is identifiable for an overlay');
  });

  it('invents no confidence, because ML Kit reports none', async () => {
    const result = await service(fakeNative()).recognize({ imageUri: 'file:///a.jpg' });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    for (const block of result.value.blocks) {
      assert.equal(block.confidence, undefined);
    }
  });

  it('invents no detected language', async () => {
    // A per-block tag from ML Kit does not map onto our catalogue, and
    // guessing would silently override the language the user chose.
    const result = await service(fakeNative()).recognize({ imageUri: 'file:///a.jpg' });

    assert.equal(result.ok && result.value.detectedLanguage, undefined);
  });

  it('reports an image with no text as a plain outcome, not a success', async () => {
    // An empty success would blank whatever the user had already typed.
    const result = await service(fakeNative({ text: '   ', blocks: [] })).recognize({
      imageUri: 'file:///blank.jpg',
    });

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.code, 'invalid_request');
    assert.match(!result.ok ? result.error.message : '', /no text/i);
  });

  it('refuses an empty image path without calling the recogniser', async () => {
    const native = fakeNative();
    const result = await service(native).recognize({ imageUri: '' });

    assert.equal(!result.ok && result.error.code, 'invalid_request');
    assert.deepEqual(native.calls, []);
  });

  it('maps an unreadable file to an actionable error', async () => {
    const result = await service(
      fakeNative({ fail: { code: 'ocr_image_unreadable', message: 'ENOENT /tmp/x.jpg' } }),
    ).recognize({ imageUri: 'file:///gone.jpg' });

    assert.equal(!result.ok && result.error.code, 'invalid_request');
  });

  it('maps a recogniser failure without leaking its message', async () => {
    const result = await service(
      fakeNative({ fail: { code: 'ocr_failed', message: 'failed on text: my account number' } }),
    ).recognize({ imageUri: 'file:///a.jpg' });

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.code, 'unknown');
    assert.equal(
      !result.ok && result.error.message.includes('my account number'),
      false,
      'a native message can quote what was read',
    );
  });

  it('maps a missing context to a service failure', async () => {
    const result = await service(fakeNative({ fail: { code: 'ocr_unavailable' } })).recognize({
      imageUri: 'file:///a.jpg',
    });

    assert.equal(!result.ok && result.error.code, 'service_unavailable');
  });
});

describe('privacy of what was scanned', () => {
  it('never logs the image or the recognised text', () => {
    const source = readFileSync('src/services/ocr/mlkit-ocr-service.ts', 'utf8');

    // The property is that no *value* reaches a log call: each one takes a
    // single fixed string, with no interpolation and no extra argument.
    // Matching on words like "text" would flag the safe message itself.
    const logCalls = source.match(/log\.(?:warn|error|info|debug)\([^)]*\)/g) ?? [];
    assert.ok(logCalls.length > 0, 'the service does log, or this test proves nothing');

    for (const call of logCalls) {
      assert.equal(call.includes('${'), false, `interpolated log: ${call}`);
      assert.match(
        call,
        /^log\.(?:warn|error|info|debug)\('[^']*'\)$/,
        `a log call may only take a fixed string: ${call}`,
      );
    }
  });

  it('never logs from the hook or the camera sheet', () => {
    for (const path of [
      'src/features/translation/hooks/use-camera-ocr.ts',
      'src/features/camera/components/text-scanner.tsx',
    ]) {
      assert.equal(/console\.|log\./.test(readFileSync(path, 'utf8')), false, path);
    }
  });

  it('sends the capture nowhere', () => {
    const source = readFileSync('src/services/ocr/mlkit-ocr-service.ts', 'utf8');
    for (const word of ['fetch(', 'upload', 'analytics', 'telemetry', 'http']) {
      assert.equal(source.toLowerCase().includes(word), false, word);
    }
  });

  it('carries no credential of any kind', () => {
    const source = readFileSync('src/services/ocr/mlkit-ocr-service.ts', 'utf8');
    for (const word of ['apikey', 'api_key', 'secret', 'token', 'authorization']) {
      assert.equal(source.toLowerCase().includes(word), false, word);
    }
  });
});

describe('the architecture holds', () => {
  it('keeps expo-camera in exactly one file', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (
          /\.tsx?$/.test(entry.name) &&
          readFileSync(path, 'utf8').includes(`from 'expo-camera'`)
        ) {
          offenders.push(path);
        }
      }
    };
    walk('src');

    assert.deepEqual(offenders, ['src/features/camera/components/text-scanner.tsx']);
  });

  it('keeps the native recogniser behind the service', () => {
    // No feature file may reach for the OCR native module directly.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name) && readFileSync(path, 'utf8').includes('TranseeOcr')) {
          offenders.push(path);
        }
      }
    };
    walk('src');

    assert.deepEqual(offenders, ['src/services/service-registry.ts']);
  });

  it('is bound in the registry', () => {
    const registry = readFileSync('src/services/service-registry.ts', 'utf8');

    assert.match(registry, /ocr: ocrRecognizer/);
    assert.match(registry, /createMlKitOcrService\(\{ native: TranseeOcr \}\)/);
  });

  it('reaches the composer through the controller only', () => {
    const composer = readFileSync(
      'src/features/translation/components/translation-composer.tsx',
      'utf8',
    );

    assert.match(composer, /scan\.open/);
    assert.equal(composer.includes('expo-camera'), false);
    assert.equal(composer.includes('services.ocr'), false);
  });

  it('keeps the camera control when recognition is unavailable, and says why on a tap', () => {
    // Hiding it made scanning look removed wherever the recogniser was
    // missing — in Expo Go, always. The control stays; the hook explains.
    const composer = readFileSync(
      'src/features/translation/components/translation-composer.tsx',
      'utf8',
    );
    assert.equal(/scan\.status !== 'unavailable'/.test(composer), false);
    assert.match(
      readFileSync('src/features/translation/hooks/use-camera-ocr.ts', 'utf8'),
      /UNAVAILABLE_INPUT_MESSAGES\.scan/,
    );
  });

  it('writes scanned text into the translation input, tagged as scanned', () => {
    const screen = readFileSync('src/features/translation/screens/translate-screen.tsx', 'utf8');

    // Day 19 routed this through a named setter so history can record that the
    // text came from the camera. It still lands in the same draft.
    assert.match(screen, /useCameraOcr\(setScanned\)/);
    assert.match(
      screen,
      /setScanned = useCallback\(\(text: string\) => setInput\(text, 'camera'\)/,
    );
  });

  it('does not translate automatically after a scan', () => {
    const hook = readFileSync('src/features/translation/hooks/use-camera-ocr.ts', 'utf8');

    // The hook hands text to its caller and stops there.
    assert.equal(hook.includes('translate('), false);
    assert.equal(hook.includes('services.translation'), false);
  });

  it('is gated on the shipped-capability flag', () => {
    const hook = readFileSync('src/features/translation/hooks/use-camera-ocr.ts', 'utf8');
    assert.match(hook, /FEATURES\.cameraOcr/);
  });

  it('asks for the camera only from the sheet the user opened', () => {
    const scanner = readFileSync('src/features/camera/components/text-scanner.tsx', 'utf8');

    // The permission hook lives in the sheet, which only mounts on a tap.
    assert.match(scanner, /useCameraPermissions/);

    // Nothing else in the app may request it.
    const screen = readFileSync('src/features/translation/screens/translate-screen.tsx', 'utf8');
    assert.equal(screen.includes('requestPermission'), false);
    assert.equal(screen.includes('useCameraPermissions'), false);
  });

  it('distinguishes a refusal that can be retried from one that cannot', () => {
    const scanner = readFileSync('src/features/camera/components/text-scanner.tsx', 'utf8');

    assert.match(scanner, /canAskAgain/);
    assert.match(scanner, /system settings/i);
  });

  it('registers the recogniser as a second native module, not a fork', () => {
    const config = JSON.parse(
      readFileSync('modules/transee-mlkit/expo-module.config.json', 'utf8'),
    );

    assert.deepEqual(config.android.modules, [
      'expo.modules.transeemlkit.TranseeMlKitModule',
      'expo.modules.transeemlkit.TranseeOcrModule',
    ]);
  });

  it('declares the bundled Latin recogniser, so scanning needs no download', () => {
    const gradle = readFileSync('modules/transee-mlkit/android/build.gradle', 'utf8');

    assert.match(gradle, /com\.google\.mlkit:text-recognition:16\.0\.1/);
    // The unbundled play-services variant would need a runtime download.
    assert.equal(gradle.includes('play-services-mlkit-text-recognition'), false);
  });
});
