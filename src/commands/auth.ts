/**
 * Auth commands for managing Helicone credentials
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import {
  storeApiKey,
  storeGatewayCredentials,
  clearCredentials,
  clearGatewayCredentials,
  hasStoredCredentials,
  getConfigPath,
  getApiKey,
  getRegion,
  getGatewayUrl,
  getGatewayToken,
  getMode,
} from "../lib/config.js";
import { HeliconeClient } from "../lib/client.js";

export function createAuthCommand(): Command {
  const auth = new Command("auth").description("Manage authentication");

  // ============================================================================
  // helicone auth login
  // ============================================================================
  auth
    .command("login")
    .description("Store API key for authentication")
    .option("--api-key <key>", "Helicone API key")
    .option("--region <region>", "API region (us or eu)", "us")
    .action(async (options) => {
      let apiKey = options.apiKey;

      // If no API key provided, check environment
      if (!apiKey) {
        apiKey = process.env.HELICONE_API_KEY;
      }

      // If still no API key, prompt for it
      if (!apiKey) {
        // Dynamic import for enquirer (ESM compatibility)
        const { default: Enquirer } = await import("enquirer");
        const enquirer = new Enquirer();

        const response = await enquirer.prompt<{ apiKey: string }>({
          type: "password",
          name: "apiKey",
          message: "Enter your Helicone API key:",
        });
        apiKey = response.apiKey;
      }

      if (!apiKey) {
        console.error(chalk.red("Error: No API key provided"));
        process.exit(1);
      }

      // Validate region
      const region = options.region === "eu" ? "eu" : "us";

      // Verify the API key works
      const spinner = ora("Verifying API key...").start();

      const client = new HeliconeClient({ apiKey, region });
      const result = await client.verifyAuth();

      if (result.error) {
        spinner.fail(chalk.red(`Authentication failed: ${result.error}`));
        const otherRegion = region === "us" ? "eu" : "us";
        console.log(
          chalk.yellow(
            `\nCurrent region: ${region.toUpperCase()}. Did you mean to use --region ${otherRegion}?`
          )
        );
        process.exit(1);
      }

      // Store credentials
      storeApiKey(apiKey, region);
      spinner.succeed(chalk.green("Logged in successfully"));

      console.log(chalk.dim(`Credentials stored in ${getConfigPath()}`));
      console.log(chalk.dim(`Region: ${region.toUpperCase()}`));
    });

  // ============================================================================
  // helicone auth logout
  // ============================================================================
  auth
    .command("logout")
    .description("Remove stored credentials")
    .action(() => {
      if (!hasStoredCredentials()) {
        console.log(chalk.yellow("No stored credentials found"));
        return;
      }

      clearCredentials();
      console.log(chalk.green("Logged out successfully"));
      console.log(chalk.dim(`Credentials removed from ${getConfigPath()}`));
    });

  // ============================================================================
  // helicone auth gateway
  // ============================================================================
  auth
    .command("gateway")
    .description("Store gateway credentials for gateway mode")
    .option("--gateway-url <url>", "Gateway base URL")
    .option("--gateway-token <token>", "Gateway token")
    .option("--mode <mode>", "Default mode (raw or gateway)", "gateway")
    .action(async (options) => {
      let gatewayUrl = options.gatewayUrl || getGatewayUrl();
      let gatewayToken = options.gatewayToken || getGatewayToken();

      if (!gatewayUrl) {
        const { default: Enquirer } = await import("enquirer");
        const enquirer = new Enquirer();
        const response = await enquirer.prompt<{ gatewayUrl: string }>({
          type: "input",
          name: "gatewayUrl",
          message: "Enter your Gateway URL:",
        });
        gatewayUrl = response.gatewayUrl;
      }

      if (!gatewayToken) {
        const { default: Enquirer } = await import("enquirer");
        const enquirer = new Enquirer();
        const response = await enquirer.prompt<{ gatewayToken: string }>({
          type: "password",
          name: "gatewayToken",
          message: "Enter your Gateway token:",
        });
        gatewayToken = response.gatewayToken;
      }

      if (!gatewayUrl || !gatewayToken) {
        console.error(chalk.red("Error: Gateway URL and token are required"));
        process.exit(1);
      }

      const mode = options.mode === "raw" ? "raw" : "gateway";
      storeGatewayCredentials(gatewayUrl, gatewayToken, mode);
      console.log(chalk.green("Gateway credentials saved"));
      console.log(chalk.dim(`Gateway URL: ${gatewayUrl}`));
      console.log(chalk.dim(`Default mode: ${mode}`));
      console.log(chalk.dim(`Config: ${getConfigPath()}`));
    });

  // ============================================================================
  // helicone auth gateway-logout
  // ============================================================================
  auth
    .command("gateway-logout")
    .description("Remove stored gateway credentials")
    .action(() => {
      const url = getGatewayUrl();
      const token = getGatewayToken();
      if (!url && !token) {
        console.log(chalk.yellow("No stored gateway credentials found"));
        return;
      }
      clearGatewayCredentials();
      console.log(chalk.green("Gateway credentials removed"));
      console.log(chalk.dim(`Config: ${getConfigPath()}`));
    });

  // ============================================================================
  // helicone auth status
  // ============================================================================
  auth
    .command("status")
    .description("Show current authentication status")
    .action(async () => {
      const apiKey = getApiKey();
      const region = getRegion();
      const mode = getMode();
      const gatewayUrl = getGatewayUrl();
      const gatewayToken = getGatewayToken();

      console.log(chalk.bold("\nAuthentication Status\n"));

      // Check for API key sources
      const hasApiKey =
        !!process.env.HELICONE_API_KEY || hasStoredCredentials();
      const hasGateway = !!gatewayUrl && !!gatewayToken;

      if (process.env.HELICONE_API_KEY) {
        console.log(
          chalk.green("✓"),
          "API Key:",
          chalk.dim("(from HELICONE_API_KEY environment variable)")
        );
      } else if (hasStoredCredentials()) {
        console.log(
          chalk.green("✓"),
          "API Key:",
          chalk.dim(`(from ${getConfigPath()})`)
        );
      } else {
        console.log(chalk.red("✗"), "API Key:", chalk.red("Not configured"));
        if (!hasGateway || mode !== "gateway") {
          console.log(
            chalk.dim(
              "\n  Run 'helicone auth login' or set HELICONE_API_KEY environment variable"
            )
          );
          return;
        }
      }

      console.log("  Region:", chalk.cyan(region.toUpperCase()));

      console.log("  Mode:", chalk.cyan(mode.toUpperCase()));
      if (gatewayUrl) {
        console.log(chalk.green("✓"), "Gateway URL:", chalk.dim(gatewayUrl));
      }
      if (gatewayToken) {
        console.log(
          chalk.green("✓"),
          "Gateway Token:",
          chalk.dim("(stored)")
        );
      }

      // Verify the key works
      if (apiKey) {
        const spinner = ora("Verifying credentials...").start();

        const client = new HeliconeClient({ apiKey, region });
        const result = await client.verifyAuth();

        if (result.error) {
          spinner.fail(chalk.red(`Invalid credentials: ${result.error}`));
        } else {
          spinner.succeed(chalk.green("Credentials verified"));
        }
      }
    });

  // ============================================================================
  // helicone auth whoami
  // ============================================================================
  auth
    .command("whoami")
    .description("Show current API key info (masked)")
    .action(() => {
      const apiKey = getApiKey();
      const region = getRegion();

      if (!apiKey) {
        console.log(chalk.red("Not logged in"));
        return;
      }

      // Mask API key, show first 4 and last 4 characters
      const masked =
        apiKey.length > 8
          ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`
          : "****";

      console.log(chalk.bold("Current Configuration:"));
      console.log(`  API Key: ${masked}`);
      console.log(`  Region:  ${region.toUpperCase()}`);
    });

  return auth;
}
