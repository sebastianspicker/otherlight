/** Exercises the Browser's hostile-input boundary for V6 dataset-only requests. */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_SCIENCE_DATASET_RESPONSE_BYTES,
  MAX_SCIENCE_DATASET_SOURCE_BYTES,
  SCIENCE_DATASET_MEDIA_TYPE,
  ScienceDatasetClient,
  type ScienceDatasetCapabilities,
  type ScienceDatasetDescriptor,
  type ScienceFetch,
} from "../../src/infrastructure/science";

const contentHash = "b".repeat(64);
const descriptor: ScienceDatasetDescriptor = {
  schemaVersion: "science-dataset-descriptor-v2",
  id: `ds-${contentHash}`,
  kind: "passband-response",
  sampleCount: 3,
  mediaType: SCIENCE_DATASET_MEDIA_TYPE,
  sourceByteSha256: "a".repeat(64),
  contentSha256: contentHash,
};

const capabilities: ScienceDatasetCapabilities = {
  schemaVersion: "science-v6",
  supportedJobKinds: [],
  datasetImports: {
    mediaType: SCIENCE_DATASET_MEDIA_TYPE,
    kinds: [
      "passband-response",
      "stellar-intensity-grid",
      "atmospheric-profile",
      "scattering-phase-function",
      "stellar-variability-psd",
    ],
    limits: {
      maxSourceBytes: MAX_SCIENCE_DATASET_SOURCE_BYTES,
      maxDatasets: 16,
      maxSamplesPerDataset: 100_000,
      maxAggregateSamples: 400_000,
      maxNormalizedBytes: 64 * 1024 * 1024,
    },
    persistence: "process-memory",
  },
};

const secureHeaders = {
  "content-type": "application/json",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

const json = (payload: unknown, status = 200, headers: HeadersInit = secureHeaders): Response =>
  new Response(JSON.stringify(payload), { status, headers });

function validFile(type: string = SCIENCE_DATASET_MEDIA_TYPE): File {
  return new File(['{"schemaVersion":"science-dataset-v2","kind":"passband-response"}'], "passband.json", {
    type,
  });
}

afterEach(() => vi.unstubAllEnvs());

describe("V6 dataset-only client", () => {
  it("uses only dataset routes, exact upload media type, and redirect rejection", async () => {
    const requests: Array<{ path: string; init: RequestInit | undefined }> = [];
    const fetchImpl = vi.fn<ScienceFetch>(async (input, init) => {
      requests.push({ path: new URL(input.toString()).pathname, init });
      const path = new URL(input.toString()).pathname;
      if (path === "/v2/capabilities") return json(capabilities);
      if (init?.method === "GET" && path === "/v2/datasets") return json({ datasets: [descriptor] });
      return json(descriptor, init?.method === "POST" ? 201 : 200);
    });
    const client = new ScienceDatasetClient({ fetchImpl });

    await expect(client.getCapabilities()).resolves.toEqual(capabilities);
    await expect(client.importDataset(validFile())).resolves.toEqual(descriptor);
    await expect(client.listDatasets()).resolves.toEqual({ datasets: [descriptor] });
    await expect(client.getDataset(descriptor.id)).resolves.toEqual(descriptor);
    await expect(client.deleteDataset(descriptor.id)).resolves.toEqual(descriptor);

    expect(requests.map(({ path }) => path)).toEqual([
      "/v2/capabilities",
      "/v2/datasets",
      "/v2/datasets",
      `/v2/datasets/${descriptor.id}`,
      `/v2/datasets/${descriptor.id}`,
    ]);
    for (const { init } of requests) {
      expect(init?.redirect).toBe("error");
      expect(init?.cache).toBe("no-store");
      expect(init?.credentials).toBe("omit");
    }
    expect(requests[1]?.init?.headers).toEqual({
      accept: "application/json",
      "content-type": SCIENCE_DATASET_MEDIA_TYPE,
    });
  });

  it("admits ordinary JSON files but prechecks incompatible types and size", async () => {
    const fetchImpl = vi.fn<ScienceFetch>();
    const client = new ScienceDatasetClient({ fetchImpl });

    fetchImpl.mockResolvedValueOnce(json(descriptor, 201));
    await expect(client.importDataset(validFile("application/json"))).resolves.toEqual(descriptor);
    fetchImpl.mockResolvedValueOnce(json(descriptor, 201));
    await expect(client.importDataset(validFile(""))).resolves.toEqual(descriptor);
    await expect(client.importDataset(validFile("text/plain"))).rejects.toThrow(/\.json file/);
    const wrongExtension = new File(["{}"], "passband.txt", { type: "application/json" });
    await expect(client.importDataset(wrongExtension)).rejects.toThrow(/\.json file/);
    const oversized = new File([new Uint8Array(MAX_SCIENCE_DATASET_SOURCE_BYTES + 1)], "large.json", {
      type: SCIENCE_DATASET_MEDIA_TYPE,
    });
    await expect(client.importDataset(oversized)).rejects.toThrow(/size/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("rejects redirects, response metadata omissions, and oversized JSON before parsing", async () => {
    const redirectClient = new ScienceDatasetClient({
      fetchImpl: async (_input, init) => {
        expect(init?.redirect).toBe("error");
        throw new TypeError("redirect blocked");
      },
    });
    await expect(redirectClient.getCapabilities()).rejects.toThrow(/request failed/);

    const wrongType = new ScienceDatasetClient({
      fetchImpl: async () => json(capabilities, 200, { ...secureHeaders, "content-type": "text/html" }),
    });
    await expect(wrongType.getCapabilities()).rejects.toThrow(/exact application\/json/);

    const cacheable = new ScienceDatasetClient({
      fetchImpl: async () =>
        json(capabilities, 200, {
          "content-type": "application/json",
          "x-content-type-options": "nosniff",
        }),
    });
    await expect(cacheable.getCapabilities()).rejects.toThrow(/no-store/);

    const sniffable = new ScienceDatasetClient({
      fetchImpl: async () => json(capabilities, 200, { ...secureHeaders, "x-content-type-options": "" }),
    });
    await expect(sniffable.getCapabilities()).rejects.toThrow(/X-Content-Type-Options/);

    const oversized = new ScienceDatasetClient({
      fetchImpl: async () =>
        json(capabilities, 200, {
          ...secureHeaders,
          "content-length": String(MAX_SCIENCE_DATASET_RESPONSE_BYTES + 1),
        }),
    });
    await expect(oversized.getCapabilities()).rejects.toThrow(/size limit/);
  });

  it("fails closed for hostile descriptors and unavailable V2 jobs", async () => {
    const malformedId = new ScienceDatasetClient({
      fetchImpl: async () => json({ ...descriptor, id: `ds-${"c".repeat(64)}` }),
    });
    await expect(malformedId.getDataset(descriptor.id)).rejects.toThrow(/invalid contract/);

    const extraField = new ScienceDatasetClient({
      fetchImpl: async () => json({ ...descriptor, jobId: "must-not-exist" }),
    });
    await expect(extraField.getDataset(descriptor.id)).rejects.toThrow(/invalid contract/);

    const overSampleLimit = new ScienceDatasetClient({
      fetchImpl: async () => json({ ...descriptor, sampleCount: 100_001 }),
    });
    await expect(overSampleLimit.getDataset(descriptor.id)).rejects.toThrow(/invalid contract/);

    const advertisedJob = new ScienceDatasetClient({
      fetchImpl: async () => json({ ...capabilities, supportedJobKinds: ["forward"] }),
    });
    await expect(advertisedJob.getCapabilities()).rejects.toThrow(/invalid contract/);
  });

  it("cannot be constructed in the GitHub Pages runtime", () => {
    vi.stubEnv("MODE", "github-pages");
    expect(() => new ScienceDatasetClient({ fetchImpl: async () => json(capabilities) })).toThrow(
      /GitHub Pages/,
    );
  });
});
