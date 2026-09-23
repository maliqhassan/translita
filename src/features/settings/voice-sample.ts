import { baseLanguageTag } from '@/services';

/**
 * What a voice says when it is auditioned.
 *
 * A sentence in the voice's own language, because the point of a preview is to
 * hear how this voice sounds reading that language — English words in a German
 * voice tell you almost nothing about how it will read a German translation.
 *
 * Deliberately a small table rather than a translation framework. These are
 * nine short strings that exist only to be spoken; they are never displayed,
 * never composed with anything, and never grow into UI copy. Pulling in i18n
 * machinery for them would be a large dependency serving one sentence.
 *
 * Keyed by base language tag, so `de-AT` and `de` both find the German line.
 * Anything not listed falls back to English — a voice will still read it, and
 * hearing the wrong words in the right voice is more useful than silence.
 */
const SAMPLES: Readonly<Record<string, string>> = {
  en: 'Hello! This is a preview of this voice.',
  de: 'Hallo! Dies ist eine Hörprobe dieser Stimme.',
  fr: 'Bonjour ! Voici un aperçu de cette voix.',
  es: '¡Hola! Esta es una muestra de esta voz.',
  it: 'Ciao! Questa è un’anteprima di questa voce.',
  pt: 'Olá! Esta é uma amostra desta voz.',
  nl: 'Hallo! Dit is een voorbeeld van deze stem.',
  ru: 'Здравствуйте! Это образец этого голоса.',
  tr: 'Merhaba! Bu, bu sesin bir önizlemesidir.',
  pl: 'Cześć! To jest próbka tego głosu.',
  ja: 'こんにちは。これはこの音声のサンプルです。',
  ko: '안녕하세요. 이 음성의 미리 듣기입니다.',
  zh: '你好！这是这个语音的试听。',
  ar: 'مرحبًا! هذه عينة من هذا الصوت.',
  hi: 'नमस्ते! यह इस आवाज़ का नमूना है।',
};

const FALLBACK = SAMPLES.en ?? 'Hello! This is a preview of this voice.';

/** The sentence to audition a voice with, in that voice's own language. */
export function voiceSample(language: string): string {
  return SAMPLES[baseLanguageTag(language)] ?? FALLBACK;
}
