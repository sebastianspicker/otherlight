/** Implements the strict loopback-only V6 dataset client; this family deliberately has no job API. */
import { isGitHubPagesRuntime } from "../../application/deployment";
import { ScienceBackendError, type ScienceFetch } from "./client";
import {
  MAX_SCIENCE_DATASET_RESPONSE_BYTES,
  MAX_SCIENCE_DATASET_SOURCE_BYTES,
  SCIENCE_DATASET_MEDIA_TYPE,
  type ScienceDatasetCapabilities,
  type ScienceDatasetDescriptor,
  type ScienceDatasetList,
} from "./datasetTypes";
import {
  assertScienceDatasetCapabilities,
  assertScienceDatasetDescriptor,
  assertScienceDatasetList,
} from "./datasetValidation";
import { ScienceValidationError } from "./validation";

const DEFAULT_BASE_URL = "http://127.0.0.1:8765";
const JSON_MEDIA_TYPE = "application/json";

export type ScienceDatasetClientOptions = {
  baseUrl?: string;
  fetchImpl?: ScienceFetch;
};

/** Dataset-only client for the additive V6 `/v2` API. */
export class ScienceDatasetClient {
  readonly baseUrl: string;
  private readonly base: URL;
  private readonly fetchImpl: ScienceFetch;

  constructor(options: ScienceDatasetClientOptions = {}) {
    if (isGitHubPagesRuntime()) {
      throw new ScienceBackendError("V6 dataset client is unavailable in GitHub Pages mode.");
    }
    this.base = normalizeLocalBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.baseUrl = this.base.href.replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getCapabilities(signal?: AbortSignal): Promise<ScienceDatasetCapabilities> {
    return this.request("v2/capabilities", { method: "GET", signal }, validateCapabilities, [200]);
  }

  async importDataset(file: File, signal?: AbortSignal): Promise<ScienceDatasetDescriptor> {
    assertDatasetFile(file);
    return this.request(
      "v2/datasets",
      {
        method: "POST",
        signal,
        headers: {
          accept: JSON_MEDIA_TYPE,
          "content-type": SCIENCE_DATASET_MEDIA_TYPE,
        },
        body: file,
      },
      validateDescriptor,
      [200, 201],
    );
  }

  async listDatasets(signal?: AbortSignal): Promise<ScienceDatasetList> {
    return this.request("v2/datasets", { method: "GET", signal }, validateList, [200]);
  }

  async getDataset(datasetId: string, signal?: AbortSignal): Promise<ScienceDatasetDescriptor> {
    return this.request(
      `v2/datasets/${encodeDatasetId(datasetId)}`,
      { method: "GET", signal },
      validateDescriptor,
      [200],
    );
  }

  async deleteDataset(datasetId: string, signal?: AbortSignal): Promise<ScienceDatasetDescriptor> {
    return this.request(
      `v2/datasets/${encodeDatasetId(datasetId)}`,
      { method: "DELETE", signal },
      validateDescriptor,
      [200],
    );
  }

  private async request<T>(
    path: string,
    init: RequestInit,
    validator: (value: unknown) => T,
    expectedStatuses: readonly number[],
  ): Promise<T> {
    if (init.signal?.aborted) throw abortError();
    let response: Response;
    try {
      const fetchImpl = this.fetchImpl;
      response = await fetchImpl(new URL(path, this.base), {
        ...init,
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
      });
    } catch (error) {
      if (init.signal?.aborted) throw abortError();
      throw new ScienceBackendError("V6 dataset backend request failed.", { cause: error });
    }
    assertResponseHeaders(response);
    const payload = await readBoundedJson(response);
    if (!expectedStatuses.includes(response.status)) {
      const detail = isBackendErrorPayload(payload) ? payload : undefined;
      throw new ScienceBackendError(
        detail?.message ?? `V6 dataset backend returned HTTP ${response.status}.`,
        {
          status: response.status,
          code: detail?.code,
        },
      );
    }
    try {
      return validator(payload);
    } catch (error) {
      if (error instanceof ScienceValidationError) {
        throw new ScienceBackendError(`V6 dataset backend returned an invalid contract: ${error.message}`, {
          cause: error,
        });
      }
      throw error;
    }
  }
}

export function createScienceDatasetClient(options?: ScienceDatasetClientOptions): ScienceDatasetClient {
  return new ScienceDatasetClient(options);
}

function normalizeLocalBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ScienceBackendError("V6 dataset backend URL must be a valid local HTTP URL.");
  }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new ScienceBackendError("V6 dataset backend URL must use HTTP on a loopback host.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ScienceBackendError("V6 dataset backend URL must not include credentials, query, or fragment.");
  }
  return new URL(url.pathname.endsWith("/") ? url.href : `${url.href}/`);
}

function assertDatasetFile(file: File): void {
  if (!(file instanceof Blob)) {
    throw new ScienceBackendError("V6 dataset import requires a browser File.");
  }
  const localMediaTypes = new Set(["", "application/json", SCIENCE_DATASET_MEDIA_TYPE]);
  if (!file.name.toLowerCase().endsWith(".json") || !localMediaTypes.has(file.type.toLowerCase())) {
    throw new ScienceBackendError(
      "V6 dataset import requires a .json file with a JSON-compatible local media type.",
    );
  }
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_SCIENCE_DATASET_SOURCE_BYTES) {
    throw new ScienceBackendError(
      `V6 dataset file size must be between 1 and ${MAX_SCIENCE_DATASET_SOURCE_BYTES} bytes.`,
    );
  }
}

function encodeDatasetId(value: string): string {
  if (typeof value !== "string" || !/^ds-[0-9a-f]{64}$/.test(value)) {
    throw new ScienceBackendError("V6 dataset id must be ds- followed by a lowercase SHA-256 hash.");
  }
  return encodeURIComponent(value);
}

function assertResponseHeaders(response: Response): void {
  if (response.headers.get("content-type") !== JSON_MEDIA_TYPE) {
    throw new ScienceBackendError(
      "V6 dataset backend response must use exact application/json content type.",
      {
        status: response.status,
      },
    );
  }
  if (response.headers.get("cache-control") !== "no-store") {
    throw new ScienceBackendError("V6 dataset backend response must be no-store.", {
      status: response.status,
    });
  }
  if (response.headers.get("x-content-type-options") !== "nosniff") {
    throw new ScienceBackendError("V6 dataset backend response must set X-Content-Type-Options: nosniff.", {
      status: response.status,
    });
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^[0-9]+$/.test(declaredLength) || Number(declaredLength) > MAX_SCIENCE_DATASET_RESPONSE_BYTES) {
      throw new ScienceBackendError("V6 dataset backend response exceeds the JSON size limit.", {
        status: response.status,
      });
    }
  }
  const bytes = await readBoundedBody(response);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new ScienceBackendError("V6 dataset backend returned invalid UTF-8 JSON.", {
      status: response.status,
      cause: error,
    });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ScienceBackendError("V6 dataset backend returned invalid JSON.", {
      status: response.status,
      cause: error,
    });
  }
}

async function readBoundedBody(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > MAX_SCIENCE_DATASET_RESPONSE_BYTES) {
        await reader.cancel();
        throw new ScienceBackendError("V6 dataset backend response exceeds the JSON size limit.", {
          status: response.status,
        });
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

function abortError(): DOMException {
  return new DOMException("The V6 dataset backend request was aborted.", "AbortError");
}

function isBackendErrorPayload(value: unknown): value is { code?: string; message: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.message === "string" && (record.code === undefined || typeof record.code === "string");
}

function validateCapabilities(value: unknown): ScienceDatasetCapabilities {
  assertScienceDatasetCapabilities(value);
  return value;
}

function validateDescriptor(value: unknown): ScienceDatasetDescriptor {
  assertScienceDatasetDescriptor(value);
  return value;
}

function validateList(value: unknown): ScienceDatasetList {
  assertScienceDatasetList(value);
  return value;
}
