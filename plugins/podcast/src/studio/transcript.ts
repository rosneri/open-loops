import { z } from 'zod';
import type { StructuredGenerator } from '@open-loops/orchestration';
import type { PodcastLength } from '../ports/podcast-generator.port.js';

/**
 * The first half of what podcastfy does: turn source material into a two-speaker script. It is
 * a prompt and a schema, which is why it can live here rather than in a Python process — the
 * model that already reads this user's signals writes the script too, so there is no new key.
 */
export const transcriptSchema = z.object({
  lines: z
    .array(
      z.object({
        speaker: z.enum(['HOST', 'GUEST']),
        text: z.string().min(1).max(1200),
      }),
    )
    .min(4)
    .max(120),
});

export type Transcript = z.infer<typeof transcriptSchema>;

/** Turn counts, chosen so "short" is genuinely short rather than a long script read quickly. */
const TURNS: Record<PodcastLength, string> = {
  short: 'about 8 to 12 turns, under three minutes read aloud',
  default: 'about 16 to 24 turns, roughly four to six minutes read aloud',
  long: 'about 30 to 44 turns, more than seven minutes read aloud',
};

const SYSTEM = `You write the script for a short daily briefing podcast with two speakers.

HOST leads: they open, move between items and close. GUEST is a sharp colleague who reacts,
asks the obvious follow-up and points out what the listener is likely avoiding.

Rules that matter more than style:
- Every fact must come from the brief. Never invent a name, a deadline, a number or an outcome.
- If the brief is thin, the episode is short. Padding it with invented context is the one
  unforgivable failure here.
- Speak to one listener, in the second person. This is their day, not a news bulletin.
- No intro music cues, no "welcome back to the show", no sponsor reads, no sign-off promising
  tomorrow's episode. Start on the substance.
- Plain spoken English. Expand abbreviations the way a person would say them out loud.
- Never read a URL aloud.`;

export const writeTranscript = async (input: {
  generator: StructuredGenerator;
  brief: string;
  length: PodcastLength;
}): Promise<Transcript> =>
  await input.generator.generate({
    name: 'podcast_transcript',
    system: SYSTEM,
    prompt: [
      `Write ${TURNS[input.length]}.`,
      '',
      'The brief for today follows. Everything you say must be grounded in it.',
      '',
      '---',
      input.brief,
      '---',
    ].join('\n'),
    schema: transcriptSchema,
    // Some variation so consecutive days do not open with the same sentence, but not so much
    // that the model starts embroidering the facts.
    temperature: 0.6,
  });
