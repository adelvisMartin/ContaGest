/* AUTO-GENERATED FROM #652 BY #850. DO NOT EDIT. */
export type GeneratedRequestOptions = { method: string; body?: unknown; headers?: Record<string, string> };
export type GeneratedTransport = { request<T>(path: string, options?: GeneratedRequestOptions): Promise<T> };
export type ProblemDetails = { ok: false; type: string; title: string; status: number; detail: string; instance?: string; code: string; message: string; correlationId: string; requestId?: string; details?: unknown };

export function createGeneratedApiClient(transport: GeneratedTransport) {
  return {
    async createApiV1Clients(params: Record<string, unknown> = {}) {
      let path = "/api/v1/clients";
      const body = params.body;
      return transport.request<unknown>(path, { method:"POST", body });
    },
    async deleteApiV1ClientsById(params: Record<string, unknown> = {}) {
      let path = "/api/v1/clients/{id}";
      if (params["id"] == null) throw new Error("API_CLIENT_PATH_REQUIRED:deleteApiV1ClientsById:id");
      path = path.replace("{id}", encodeURIComponent(String(params["id"])));
      return transport.request<unknown>(path, { method:"DELETE" });
    },
    async getApiV1Clients(params: Record<string, unknown> = {}) {
      let path = "/api/v1/clients";
      return transport.request<unknown>(path, { method:"GET" });
    },
    async getApiV1ClientsById(params: Record<string, unknown> = {}) {
      let path = "/api/v1/clients/{id}";
      if (params["id"] == null) throw new Error("API_CLIENT_PATH_REQUIRED:getApiV1ClientsById:id");
      path = path.replace("{id}", encodeURIComponent(String(params["id"])));
      return transport.request<unknown>(path, { method:"GET" });
    },
    async replaceApiV1ClientsById(params: Record<string, unknown> = {}) {
      let path = "/api/v1/clients/{id}";
      if (params["id"] == null) throw new Error("API_CLIENT_PATH_REQUIRED:replaceApiV1ClientsById:id");
      path = path.replace("{id}", encodeURIComponent(String(params["id"])));
      const body = params.body;
      return transport.request<unknown>(path, { method:"PUT", body });
    }
  };
}
