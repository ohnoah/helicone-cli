import type {
  ApiResult,
  HeliconeRequest,
  FilterNode,
  RequestQueryParams,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;

export class GatewayHeliconeClient {
  private baseUrl: string;
  private token: string;

  constructor(options: { baseUrl: string; token: string }) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown
  ): Promise<ApiResult<T>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { data: null, error: errorText };
    }

    const data = await response.json();
    if (data && typeof data === "object" && "data" in data) {
      return data as ApiResult<T>;
    }
    return { data: data as T, error: null };
  }

  async queryRequests(
    params: RequestQueryParams
  ): Promise<ApiResult<HeliconeRequest[]>> {
    const body = {
      filter: params.filter ?? "all",
      offset: params.offset ?? 0,
      limit: Math.min(params.limit ?? 25, 1000),
      sort: params.sort ?? { created_at: "desc" },
      isCached: params.isCached ?? false,
      includeInputs: params.includeInputs ?? false,
      isPartOfExperiment: params.isPartOfExperiment ?? false,
      isScored: params.isScored ?? false,
    };

    return this.request<HeliconeRequest[]>("POST", "/v1/helicone/requests/query", body);
  }

  async countRequests(filter: FilterNode = "all"): Promise<ApiResult<number>> {
    const body = {
      filter,
      isCached: false,
      includeInputs: false,
      isScored: false,
      isPartOfExperiment: false,
    };

    return this.request<number>("POST", "/v1/helicone/requests/count", body);
  }

  async getRequest(
    requestId: string,
    includeBody = false
  ): Promise<ApiResult<HeliconeRequest>> {
    const path = includeBody
      ? `/v1/helicone/requests/${requestId}?includeBody=true`
      : `/v1/helicone/requests/${requestId}`;

    return this.request<HeliconeRequest>("GET", path);
  }

  async fetchSignedBody(
    url: string
  ): Promise<{ request?: unknown; response?: unknown }> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        return {};
      }
      return await response.json();
    } catch {
      return {};
    }
  }

  async verifyAuth(): Promise<ApiResult<{ valid: boolean; message?: string }>> {
    const result = await this.queryRequests({ limit: 1 });
    if (result.error) {
      return { data: null, error: result.error };
    }
    return { data: { valid: true }, error: null };
  }

  // Unsupported operations in gateway mode
  async querySessions(): Promise<ApiResult<never>> {
    return { data: null, error: "Sessions are not supported in gateway mode" };
  }

  async getSessionsCount(): Promise<ApiResult<never>> {
    return { data: null, error: "Sessions are not supported in gateway mode" };
  }

  async queryUserMetrics(): Promise<ApiResult<never>> {
    return { data: null, error: "User metrics are not supported in gateway mode" };
  }

  async getDashboardScores(): Promise<ApiResult<never>> {
    return { data: null, error: "Dashboard scores are not supported in gateway mode" };
  }
}
