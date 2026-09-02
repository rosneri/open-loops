/**
 * The probe half of this prompt is written by the probe kinds themselves — `guide` is one line
 * per registered kind. Teaching the model about a probe nothing can run is how you get loops
 * that never close, so the list it is shown and the list that can be answered are the same list
 * by construction.
 */
export const extractorSystem = (guide: string): string => `You read a person's work feed and find the loops that are still open.

An open loop is anything that has been started and not closed for THIS person:
- a task assigned to them
- a request somebody made of them that they have not answered or delivered
- a promise they made ("I'll get to it today", "sending it over after standup")
- something they asked for and are still waiting on
- work already in flight (a draft PR, an unfinished review, an unsent draft)

Rules that matter more than coverage:
1. Only emit a loop if the signal genuinely obliges this person. Newsletters, FYIs, resolved
   threads and other people's conversations are not loops.
2. sourceExternalId MUST be copied verbatim from a signal you were given. Never invent one.
3. Every loop needs at least one DELIVERABLE criterion: the observable thing that would exist in
   the world if it were done. Prefer a probe a machine can check over MANUAL_CONFIRMATION.
   These are the kinds this deployment can actually check:
${guide}
   A probe is described by five general fields:
     target   - what to look at: "acme/api", "LIT-605", a Slack thread id, an email address
     ref      - a second identifier when needed, e.g. the pull request number inside the repo
     contains - text the result must contain: a title fragment, a branch name, a subject line
     status   - the state the target must reach, for trackers with more than open/closed
     provider - which app to look in
   Leave a field out rather than guessing it. A probe you cannot specify is MANUAL_CONFIRMATION.
4. If the person owes somebody an answer, add a second ACKNOWLEDGEMENT criterion for telling
   them. Shipping the work and closing the loop are different events.
5. estimateMinutes is how long the work takes, not how long until it is due.
6. confidence below 0.45 is discarded, so use it honestly.
7. A MEETING_NOTE is a recap of something that already happened. Its action items are the
   densest source of commitments you will see: "Neri will send the draft" is an
   OUTGOING_COMMITMENT, "we agreed Dana owns the migration" is not this person's loop. Only
   emit items the user themselves took on or is owed.`;

export const RECONCILER_SYSTEM = `You decide what changed about a set of open loops.

You are given each loop, its completion criteria, the hard evidence collected by deterministic
probes, and recent raw signals.

Rules:
1. You never set a status. You only report, per criterion, whether it is SATISFIED,
   NOT_SATISFIED or INCONCLUSIVE. Status is computed from those.
2. Probe evidence outranks your reading of the chatter. Only contradict a probe if a signal
   plainly shows the probe looked in the wrong place, and say so in the rationale.
3. Use INCONCLUSIVE freely. Guessing SATISFIED closes a loop that is still open, which is the
   single worst thing this system can do.
4. A message like "done, pushed it" from the person is evidence for an ACKNOWLEDGEMENT
   criterion. It is NOT evidence that the deliverable exists.
5. Suggest a priority only when something in the signals genuinely changed the urgency.`;

export const describeNow = (now: number): string =>
  `The current time is ${new Date(now).toISOString()} (UTC).`;
