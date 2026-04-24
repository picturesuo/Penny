export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type PennyApiClientOptions = {
  baseUrl?: string;
  userId?: string;
  fetcher?: FetchLike;
  defaultHeaders?: HeadersInit;
};

export type ApiRequestOptions = {
  signal?: AbortSignal;
  headers?: HeadersInit;
};

export class PennyApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "PennyApiError";
    this.status = status;
    this.payload = payload;
  }
}

const DEFAULT_LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";

function resolveFetch(fetcher?: FetchLike): FetchLike {
  if (fetcher) {
    return fetcher;
  }

  if (typeof fetch === "function") {
    return fetch;
  }

  throw new Error("No fetch implementation is available.");
}

function resolveUrl(path: string, baseUrl?: string) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  if (!baseUrl) {
    return path;
  }

  return new URL(path, baseUrl).toString();
}

function mergeHeaders(...headersList: Array<HeadersInit | undefined>) {
  const headers = new Headers();

  for (const headersInit of headersList) {
    if (!headersInit) {
      continue;
    }

    new Headers(headersInit).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return headers;
}

async function readPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }

  const text = await response.text().catch(() => "");
  return text || null;
}

function readErrorMessage(payload: unknown, status: number) {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error?: unknown }).error;

    if (typeof error === "string" && error.trim()) {
      return error;
    }
  }

  return `Penny API request failed with ${status}.`;
}

export function createPennyApiClient(options: PennyApiClientOptions = {}) {
  const fetcher = resolveFetch(options.fetcher);
  const userId = options.userId ?? DEFAULT_LOCAL_USER_ID;

  async function request<T>(path: string, init: RequestInit = {}, requestOptions: ApiRequestOptions = {}): Promise<T> {
    const headers = mergeHeaders(
      {
        accept: "application/json",
        "x-user-id": userId,
      },
      options.defaultHeaders,
      init.headers,
      requestOptions.headers,
    );

    const response = await fetcher(resolveUrl(path, options.baseUrl), {
      ...init,
      headers,
      signal: requestOptions.signal ?? init.signal,
    });
    const payload = await readPayload(response);

    if (!response.ok) {
      throw new PennyApiError(readErrorMessage(payload, response.status), response.status, payload);
    }

    return payload as T;
  }

  async function get<T>(path: string, requestOptions: ApiRequestOptions = {}) {
    return request<T>(path, { method: "GET" }, requestOptions);
  }

  async function post<T>(path: string, body: unknown, requestOptions: ApiRequestOptions = {}) {
    return request<T>(
      path,
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "content-type": "application/json",
        },
      },
      requestOptions,
    );
  }

  return {
    get,
    post,
    request,
  };
}

export const defaultPennyApiClient = createPennyApiClient();
