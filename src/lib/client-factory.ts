import { HeliconeClient } from "./client.js";
import { GatewayHeliconeClient } from "./gateway-client.js";
import { getAuthContext, getGatewayToken, getGatewayUrl, getMode } from "./config.js";
import type { GlobalOptions } from "./types.js";

export type HeliconeClientLike = HeliconeClient | GatewayHeliconeClient;

export function createHeliconeClient(options: GlobalOptions): HeliconeClientLike {
  const mode = getMode(options.mode);

  if (mode === "gateway") {
    const baseUrl = getGatewayUrl(options.gatewayUrl);
    const token = getGatewayToken(options.gatewayToken);
    if (!baseUrl) {
      throw new Error(
        "Gateway URL not configured. Set --gateway-url, GATEWAY_URL, or store in config."
      );
    }
    if (!token) {
      throw new Error(
        "Gateway token not configured. Set --gateway-token, GATEWAY_TOKEN, or store in config."
      );
    }
    return new GatewayHeliconeClient({ baseUrl, token });
  }

  const auth = getAuthContext(options.apiKey, options.region);
  return new HeliconeClient(auth);
}
