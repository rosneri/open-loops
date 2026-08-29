import type { Logger } from '@open-loops/kernel';
import type {
  GeneratedPodcast,
  PodcastGenerator,
  PodcastRequest,
} from '@open-loops/podcast';

const API = 'https://api.elevenlabs.io/v1';

/**
 * ElevenLabs Studio's podcast endpoint: hand it prose, it writes a two-host conversation and
 * records it. Chosen over running podcastfy ourselves because podcastfy is Python and needs
 * ffmpeg, and this API is bundled to a single Node file for a serverless function — there is
 * nowhere for a Python process to live. The port it implements keeps that reversible.
 *
 * Generation is asynchronous: the POST returns a project, the project converts, and the audio
 * arrives as a snapshot. So this polls.
 */
export interface ElevenLabsConfig {
  readonly apiKey: string | undefined;
  readonly modelId: string;
  readonly hostVoiceId: string;
  readonly guestVoiceId: string;
  /** How long to wait for a conversion before giving up and letting the day fail loudly. */
  readonly timeoutMs: number;
  readonly pollIntervalMs: number;
}

export class ElevenLabsPodcastGenerator implements PodcastGenerator {
  public constructor(
    private readonly config: ElevenLabsConfig,
    private readonly logger: Logger,
  ) {}

  public isConfigured(): boolean {
    return (this.config.apiKey ?? '').length > 0;
  }

  public async generate(request: PodcastRequest): Promise<GeneratedPodcast> {
    if (!this.isConfigured()) {
      throw new Error('ELEVENLABS_API_KEY is not set, so no podcast can be generated.');
    }

    const projectId = await this.createPodcast(request);
    this.logger.info('podcast project created', { projectId });

    const snapshotId = await this.awaitSnapshot(projectId);
    const audio = await this.downloadSnapshot(projectId, snapshotId);

    return { audio, contentType: 'audio/mpeg', externalRef: projectId };
  }

  private async createPodcast(request: PodcastRequest): Promise<string> {
    const body = {
      model_id: this.config.modelId,
      mode: {
        type: 'conversation',
        conversation: {
          host_voice_id: request.hostVoiceId ?? this.config.hostVoiceId,
          guest_voice_id: request.guestVoiceId ?? this.config.guestVoiceId,
        },
      },
      source: { type: 'text', text: request.brief },
      duration_scale: request.length,
      language: request.language,
      // The brief is a status report, not an article: saying so is what keeps the hosts from
      // inventing a narrative around it.
      instructions_prompt:
        'This is a personal daily standup for one listener. Speak to them directly, keep it ' +
        'concrete, name the specific items, and do not invent facts that are not in the source.',
    };

    const payload = await this.send<{ project?: { project_id?: string }; project_id?: string }>(
      'POST',
      '/studio/podcasts',
      body,
    );
    const projectId = payload.project?.project_id ?? payload.project_id;
    if (projectId === undefined) throw new Error('ElevenLabs returned no project id.');
    return projectId;
  }

  /**
   * Polls until a snapshot exists. A project reports its own state, but the snapshot list is
   * the thing that actually has to be non-empty before there is audio to fetch, so that is
   * what decides — a state of `default` with no snapshot is still not done.
   */
  private async awaitSnapshot(projectId: string): Promise<string> {
    const deadline = Date.now() + this.config.timeoutMs;

    while (Date.now() < deadline) {
      const snapshots = await this.send<{ snapshots?: readonly { project_snapshot_id?: string }[] }>(
        'GET',
        `/studio/projects/${projectId}/snapshots`,
      );
      const latest = snapshots.snapshots?.at(-1)?.project_snapshot_id;
      if (latest !== undefined) return latest;

      const project = await this.send<{ state?: string }>('GET', `/studio/projects/${projectId}`);
      if (project.state === 'failed') throw new Error('ElevenLabs failed to convert the project.');

      await sleep(this.config.pollIntervalMs);
    }

    throw new Error(
      `ElevenLabs did not finish within ${String(Math.round(this.config.timeoutMs / 1000))}s.`,
    );
  }

  private async downloadSnapshot(projectId: string, snapshotId: string): Promise<Uint8Array> {
    const response = await fetch(
      `${API}/studio/projects/${projectId}/snapshots/${snapshotId}/stream`,
      { method: 'POST', headers: this.headers() },
    );
    if (!response.ok) {
      throw new Error(`ElevenLabs audio download failed: ${String(response.status)}.`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  private async send<TResult>(method: string, path: string, body?: unknown): Promise<TResult> {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: {
        ...this.headers(),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `ElevenLabs ${method} ${path} → ${String(response.status)}: ${detail.slice(0, 300)}`,
      );
    }
    return (await response.json()) as TResult;
  }

  private headers(): Record<string, string> {
    return { 'xi-api-key': this.config.apiKey ?? '' };
  }
}

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};
