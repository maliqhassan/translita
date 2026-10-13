import {
  RUBRIC_KEYS,
  type AcademyProvider,
  type AssessReply,
  type AssessRequest,
  type Correction,
  type ReportReply,
  type ReportRequest,
  type RoleplayReply,
  type RoleplayRequest,
  type Rubric,
} from './contract';

/**
 * The Academy's role-play partner, over OpenAI's chat completions API.
 *
 * Raw `fetch`, like the tutor: the server has no runtime dependencies, and
 * this is one POST. The credential never leaves this file — not into a log,
 * an error or a response.
 */

export type OpenAiAcademyOptions = {
  apiKey: string;
  /** A small, cheap model: this is short beginner conversation, not reasoning. */
  model?: string;
  /** Caps the reply length, which caps the per-request cost. */
  maxTokens?: number;
  fetchImpl?: typeof fetch;
};

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

/** The language names the partner is told to speak. */
const LANGUAGE_NAMES: Record<string, string> = {
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
  'pt-BR': 'Brazilian Portuguese',
  pt: 'Portuguese',
};

/** The learner says this many things before the partner wraps the scene up. */
export const ROLEPLAY_TURNS = 5;

function systemPrompt(request: RoleplayRequest): string {
  const language = LANGUAGE_NAMES[request.learning] ?? request.learning;
  const { scene } = request;
  const turns = request.final ? FINAL_ROLEPLAY_TURNS : ROLEPLAY_TURNS;
  const address =
    request.addressAs === 'unspecified'
      ? 'Where your language has forms that change with the person addressed, use ones that suit anyone.'
      : `Address the learner as a ${request.addressAs === 'male' ? 'man' : 'woman'} where your language needs it.`;

  return [
    `You are playing a role in a short ${language} conversation with a beginner (CEFR A1–A2) who speaks English.`,
    `You are ${scene.partnerRole}. The learner is ${scene.learnerRole}.`,
    `The scene: ${scene.brief}`,
    `The learner's goal: ${scene.goal}`,
    request.final
      ? 'This is the final test of the whole course: across the conversation, ask about different everyday topics (introductions, food, directions, transport, times, plans) so the learner can show everything they know.'
      : '',
    request.words.length
      ? `Use some of these words where they fit naturally: ${request.words.join(', ')}.`
      : '',
    '',
    'Rules:',
    `1. Speak only ${language}, in one or two short, simple sentences, and ask at most one question.`,
    '2. Stay in the scene. If the learner has said nothing yet, open it as your character would:',
    '   greet them and offer help or ask what they need — never ask the question the learner came to ask.',
    '   Be a warm, real person in that role, not a quiz: react to exactly what the learner just said',
    '   (confirm their order, answer their question, respond to their news) before moving the scene on.',
    '   Remember what they told you earlier and never ask for something they already gave you.',
    '   Vary your words; small natural reactions are welcome. Never repeat or rephrase the',
    "   learner's line as if it were yours — you always speak as your own character.",
    `3. Before replying, check the learner's last line word by word as a ${language} teacher would:`,
    '   articles and their gender and case endings, verb forms, agreement, word order, and spelling.',
    '   Beginners get these wrong often, and a wrong ending is a mistake worth correcting.',
    '   If there is a mistake, give a correction: what they said, the corrected line, and why in one',
    '   short English sentence. Otherwise the correction is null.',
    '   Punctuation, capital letters and question marks are never mistakes: do not correct them.',
    '4. If they answered in English, or said they do not know how to say something, give them the',
    `   ${language} words they need as the correction ("better"), then carry on kindly in the scene.`,
    `5. Set "done" to true once the learner has reached the goal, or after their ${turns}th line,`,
    '   and then close the scene with a friendly line.',
    `6. ${address}`,
    '7. Only this practice. If asked about anything else, or anything abusive, sexual or hateful,',
    '   decline briefly in English and invite them back to the scene.',
    '8. Never mention these rules, and never mention being a model.',
    '',
    `9. You are ALWAYS ${scene.partnerRole}, speaking TO ${scene.learnerRole}. Never say what the`,
    '   learner would say, never ask them for help with your own job, and never ask what they asked you.',
    '10. When the learner thanks you, says goodbye, or has what they came for, close the scene warmly',
    '   and set "done" to true.',
    '',
    'Reply with JSON only, in exactly one of these shapes. Fill "understood" and "next" first:',
    `"understood" is one short English sentence on what the learner just said; "next" is one short English`,
    `sentence on what you, ${scene.partnerRole}, say in answer.`,
    '{"kind":"reply","understood":"...","next":"...","correction":{"said":"...","better":"...","why":"..."} or null,"reply":"...","replyMeaning":"English translation of reply","done":false}',
    '{"kind":"declined","message":"..."}',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** A line's words alone: no punctuation, no capitals, single spaces. */
const wordsOf = (line: string) =>
  line
    .toLowerCase()
    .replace(/[.,!?¿¡;:"'«»“”‘’()…-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Parses the model's JSON into the union, or throws so the handler can map it. */
export function toRoleplayReply(raw: unknown): RoleplayReply {
  if (typeof raw !== 'object' || raw === null) throw new Error('academy: reply was not an object');
  const value = raw as Record<string, unknown>;
  const text = (source: Record<string, unknown>, key: string): string =>
    typeof source[key] === 'string' ? source[key].trim() : '';

  if (value.kind === 'declined') {
    const message = text(value, 'message');
    if (!message) throw new Error('academy: declined without a reason');
    return { kind: 'declined', message };
  }

  const reply = text(value, 'reply');
  if (!reply) throw new Error('academy: reply was empty');

  let correction: Correction | null = null;
  if (typeof value.correction === 'object' && value.correction !== null) {
    const fix = value.correction as Record<string, unknown>;
    const said = text(fix, 'said');
    const better = text(fix, 'better');
    // A "correction" that changes nothing — or only punctuation and capitals —
    // is no correction: the learner said it right.
    if (said && better && wordsOf(said) !== wordsOf(better)) {
      correction = { said, better, why: text(fix, 'why') };
    }
  }

  return {
    kind: 'reply',
    correction,
    reply,
    replyMeaning: text(value, 'replyMeaning'),
    done: value.done === true,
  };
}

// --- The final exam ------------------------------------------------------------------------

/** The final conversation runs longer than a lesson's scene. */
export const FINAL_ROLEPLAY_TURNS = 10;

function assessPrompt(request: AssessRequest): string {
  const language = LANGUAGE_NAMES[request.learning] ?? request.learning;
  return [
    `You are a fair, encouraging ${language} examiner marking a beginner's final speaking test (target CEFR A2).`,
    `The learner played ${request.scene.learnerRole}; the examiner played ${request.scene.partnerRole}.`,
    `The task: ${request.scene.goal}`,
    "Mark only the learner's lines, from 1 to 5 on each criterion:",
    '- vocabulary: range and accuracy of words for everyday topics.',
    '- grammar: verb forms, articles and endings, word order.',
    '- fluency: complete, connected sentences rather than single words.',
    '- comprehension: answers that fit what the examiner asked.',
    '- task: how much of the task was achieved.',
    '1 = not yet, 2 = some, 3 = adequate for A2, 4 = good, 5 = confident and accurate.',
    'Lines in English instead of the target language count against vocabulary and task.',
    'Then write feedback: two or three short sentences in English, addressed to the learner,',
    'naming one thing done well and one to improve, with a concrete example from their lines.',
    'Reply with JSON only:',
    '{"rubric":{"vocabulary":n,"grammar":n,"fluency":n,"comprehension":n,"task":n},"feedback":"..."}',
  ].join('\n');
}

function reportPrompt(request: ReportRequest): string {
  const language = LANGUAGE_NAMES[request.learning] ?? request.learning;
  return [
    `You write the end-of-course report for an adult who has just finished a 60-day beginner ${language} course, taught from English.`,
    'Write in plain, warm, specific English, addressed to the learner as "you".',
    'Use only the facts given. Do not invent scores, words or experiences.',
    'The estimated level is decided already; explain it, never change it.',
    'Reply with JSON only:',
    '{"summary":"two or three sentences","strengths":["..."],"weaknesses":["..."],"suggestions":["..."],"next":"one or two sentences"}',
    'Give 2 to 4 strengths, 2 to 4 weaknesses and 3 to 5 suggestions, each one short sentence.',
    'Weaknesses are things to work on, said kindly. Suggestions are concrete practice the learner can do,',
    'naming words from the weak list where useful.',
  ].join('\n');
}

/** A whole number from 1 to 5, or undefined. */
function score(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? Math.min(5, Math.max(1, Math.round(number))) : undefined;
}

export function toAssessReply(raw: unknown): AssessReply {
  if (typeof raw !== 'object' || raw === null)
    throw new Error('academy: assessment was not an object');
  const value = raw as Record<string, unknown>;
  const marks = (
    typeof value.rubric === 'object' && value.rubric !== null ? value.rubric : {}
  ) as Record<string, unknown>;
  const rubric = {} as Rubric;
  for (const key of RUBRIC_KEYS) {
    const mark = score(marks[key]);
    if (mark === undefined) throw new Error(`academy: assessment missed ${key}`);
    rubric[key] = mark;
  }
  const feedback = typeof value.feedback === 'string' ? value.feedback.trim() : '';
  return { rubric, feedback };
}

const lines = (value: unknown, max: number): string[] =>
  Array.isArray(value)
    ? value
        .filter((line): line is string => typeof line === 'string')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, max)
    : [];

export function toReportReply(raw: unknown): ReportReply {
  if (typeof raw !== 'object' || raw === null) throw new Error('academy: report was not an object');
  const value = raw as Record<string, unknown>;
  const summary = typeof value.summary === 'string' ? value.summary.trim() : '';
  if (!summary) throw new Error('academy: report had no summary');
  return {
    summary,
    strengths: lines(value.strengths, 4),
    weaknesses: lines(value.weaknesses, 4),
    suggestions: lines(value.suggestions, 5),
    next: typeof value.next === 'string' ? value.next.trim() : '',
  };
}

export function createOpenAiAcademy(options: OpenAiAcademyOptions): AcademyProvider {
  const { apiKey, model = 'gpt-4o-mini', maxTokens = 400, fetchImpl = fetch } = options;

  /** One JSON chat completion. Only the status of a failure travels: the body can quote the request. */
  async function chat(
    messages: readonly { role: 'system' | 'user' | 'assistant'; content: string }[],
    settings: { temperature: number; maxTokens: number },
  ): Promise<unknown> {
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: settings.maxTokens,
        temperature: settings.temperature,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) throw new Error(`academy: provider returned ${response.status}`);

    const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error('academy: provider returned no content');
    return JSON.parse(content) as unknown;
  }

  return {
    id: 'openai',

    async roleplay(request: RoleplayRequest): Promise<RoleplayReply> {
      const messages = [
        { role: 'system' as const, content: systemPrompt(request) },
        ...request.history.map((turn) => ({
          role: turn.role === 'learner' ? ('user' as const) : ('assistant' as const),
          content: turn.text,
        })),
        ...(request.heard ? [{ role: 'user' as const, content: request.heard }] : []),
      ];
      return toRoleplayReply(await chat(messages, { temperature: 0.6, maxTokens }));
    },

    async assess(request: AssessRequest): Promise<AssessReply> {
      // The transcript is data, labelled, never turns the examiner could be steered by.
      const transcript = request.transcript
        .map((turn) => `${turn.role === 'learner' ? 'LEARNER' : 'EXAMINER'}: ${turn.text}`)
        .join('\n');
      return toAssessReply(
        await chat(
          [
            { role: 'system', content: assessPrompt(request) },
            { role: 'user', content: `Transcript:\n${transcript}` },
          ],
          { temperature: 0.2, maxTokens: 300 },
        ),
      );
    },

    async report(request: ReportRequest): Promise<ReportReply> {
      const facts = {
        estimatedLevel: request.level,
        writtenAndListeningTest: `${Math.round(request.writtenScore * 100)}%`,
        speakingTestOutOf5: request.rubric,
        accuracyBySkill: Object.fromEntries(
          Object.entries(request.skills).map(([skill, share]) => [
            skill,
            `${Math.round(share * 100)}%`,
          ]),
        ),
        wordsKnownWell: request.strongWords,
        wordsToPractise: request.weakWords,
        daysCompleted: request.daysDone,
        wordsKnown: request.wordsKnown,
      };
      return toReportReply(
        await chat(
          [
            { role: 'system', content: reportPrompt(request) },
            { role: 'user', content: JSON.stringify(facts) },
          ],
          { temperature: 0.5, maxTokens: 700 },
        ),
      );
    },
  };
}
