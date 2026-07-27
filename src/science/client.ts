/**
 * Implements the validated loopback-only V5 client, including bounded polling,
 * abort propagation, and normalization of untrusted service errors.
 */
import type { CapabilityManifest, ScienceJobRequest, ScienceJobResult, ScienceJobStatus } from "./types";
import {
  ScienceValidationError,
  assertCapabilityManifest,
  assertScienceJobRequest,
  assertScienceJobResult,
  assertScienceJobStatus,
} from "./validation";

export class ScienceBackendError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, options: { status?: number; code?: string; cause?: unknown } = {}) {
    super(message);
    this.name = "ScienceBackendError";
    this.status = options.status;
    this.code = options.code;
  }
}

export type ScienceFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ScienceBackendClientOptions = {
  baseUrl?: string;
  fetchImpl?: ScienceFetch;
};

export type PollScienceJobOptions = {
  signal?: AbortSignal;
  intervalMs?: number;
  maxAttempts?: number;
};

const DEFAULT_BASE_URL = "http://127.0.0.1:8765";

function normalizeLocalBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ScienceBackendError("V5 backend URL must be a valid local HTTP URL.");
  }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new ScienceBackendError("V5 backend URL must use HTTP on a loopback host.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ScienceBackendError("V5 backend URL must not include credentials, query, or fragment.");
  }
  return new URL(url.pathname.endsWith("/") ? url.href : `${url.href}/`);
}

function abortError(): DOMException {
  return new DOMException("The V5 backend request was aborted.", "AbortError");
}

function assertPollOption(value: number | undefined, path: string, minimum: number): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new ScienceBackendError(`${path} must be an integer >= ${minimum}.`);
  }
  return value;
}

/**
 * Local-only HTTP client for the V5 science backend; loopback HTTP URLs are enforced at construction.
 * It validates every request and response so untrusted backend payloads cannot enter browser state unchecked.
 */
export class ScienceBackendClient {
  readonly baseUrl: string;
  private readonly base: URL;
  private readonly fetchImpl: ScienceFetch;
  private capabilities?: CapabilityManifest;

  constructor(options: ScienceBackendClientOptions = {}) {
    this.base = normalizeLocalBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.baseUrl = this.base.href.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getCapabilities(signal?: AbortSignal): Promise<CapabilityManifest> {
    const capabilities = await this.request(
      "v1/capabilities",
      { method: "GET", signal },
      validateCapabilityManifest,
    );
    this.capabilities = capabilities;
    return capabilities;
  }

  async submitJob(request: ScienceJobRequest, signal?: AbortSignal): Promise<ScienceJobStatus> {
    assertScienceJobRequest(request);
    this.assertSupportedRequest(request);
    return this.request(
      "v1/jobs",
      {
        method: "POST",
        signal,
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(request),
      },
      validateScienceJobStatus,
    );
  }

  async getJob(jobId: string, signal?: AbortSignal): Promise<ScienceJobStatus> {
    return this.request(
      `v1/jobs/${encodePathSegment(jobId)}`,
      { method: "GET", signal },
      validateScienceJobStatus,
    );
  }

  async cancelJob(jobId: string, signal?: AbortSignal): Promise<ScienceJobStatus> {
    return this.request(
      `v1/jobs/${encodePathSegment(jobId)}`,
      { method: "DELETE", signal },
      validateScienceJobStatus,
    );
  }

  async getResult(jobId: string, signal?: AbortSignal): Promise<ScienceJobResult> {
    return this.request(
      `v1/jobs/${encodePathSegment(jobId)}/result`,
      { method: "GET", signal },
      validateScienceJobResult,
    );
  }

  /**
   * Polls a local job until terminal state, abort, or the bounded attempt limit.
   * Exhaustion is an explicit error rather than an unbounded background request loop.
   */
  async pollJob(jobId: string, options: PollScienceJobOptions = {}): Promise<ScienceJobStatus> {
    const intervalMs = assertPollOption(options.intervalMs, "intervalMs", 0) ?? 250;
    const maxAttempts = assertPollOption(options.maxAttempts, "maxAttempts", 1) ?? 240;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (options.signal?.aborted) throw abortError();
      const status = await this.getJob(jobId, options.signal);
      if (status.state === "succeeded" || status.state === "failed" || status.state === "cancelled")
        return status;
      if (attempt + 1 < maxAttempts) await delay(intervalMs, options.signal);
    }
    throw new ScienceBackendError(
      `V5 job '${jobId}' did not reach a terminal state after ${maxAttempts} attempts.`,
    );
  }

  private async request<T>(path: string, init: RequestInit, validator: (value: unknown) => T): Promise<T> {
    if (init.signal?.aborted) throw abortError();
    let response: Response;
    try {
      const fetchImpl = this.fetchImpl;
      response = await fetchImpl(new URL(path, this.base), init);
    } catch (error) {
      if (init.signal?.aborted) throw abortError();
      throw new ScienceBackendError("V5 backend request failed.", { cause: error });
    }
    const payload = await readJson(response);
    if (!response.ok) {
      const detail = isBackendErrorPayload(payload) ? payload : undefined;
      throw new ScienceBackendError(detail?.message ?? `V5 backend returned HTTP ${response.status}.`, {
        status: response.status,
        code: detail?.code,
      });
    }
    try {
      return validator(payload);
    } catch (error) {
      if (error instanceof ScienceValidationError) {
        throw new ScienceBackendError(`V5 backend returned an invalid contract: ${error.message}`, {
          cause: error,
        });
      }
      throw error;
    }
  }

  private assertSupportedRequest(request: ScienceJobRequest): void {
    const capabilities = this.capabilities;
    if (!capabilities) {
      throw new ScienceBackendError("V5 capabilities must be fetched and validated before submitting a job.");
    }
    if (!capabilities.supportedJobKinds.includes(request.kind)) {
      throw new ScienceBackendError(`V5 backend does not support '${request.kind}' jobs.`);
    }
    if (request.kind === "forward") {
      for (const output of request.outputs) {
        if (!capabilities.supportedOutputs.includes(output)) {
          throw new ScienceBackendError(`V5 backend does not support '${output}' output.`);
        }
      }
      return;
    }
    if (!capabilities.supportedSamplers.includes(request.sampler)) {
      throw new ScienceBackendError(`V5 backend does not support the '${request.sampler}' sampler.`);
    }
  }
}

function encodePathSegment(value: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ScienceBackendError("V5 job id must be a non-empty string.");
  }
  return encodeURIComponent(value);
}

function isBackendErrorPayload(value: unknown): value is { code?: string; message: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.message === "string" && (record.code === undefined || typeof record.code === "string");
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch (error) {
    throw new ScienceBackendError("V5 backend returned invalid JSON.", {
      status: response.status,
      cause: error,
    });
  }
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      clearTimeout(timeout);
      cleanup();
      reject(abortError());
    };
    const cleanup = (): void => signal?.removeEventListener("abort", abort);
    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export function createScienceBackendClient(options?: ScienceBackendClientOptions): ScienceBackendClient {
  return new ScienceBackendClient(options);
}

function validateCapabilityManifest(value: unknown): CapabilityManifest {
  assertCapabilityManifest(value);
  return value;
}

function validateScienceJobStatus(value: unknown): ScienceJobStatus {
  assertScienceJobStatus(value);
  return value;
}

function validateScienceJobResult(value: unknown): ScienceJobResult {
  assertScienceJobResult(value);
  return value;
}
