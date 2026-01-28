/**
 * Metrics commands for viewing aggregate statistics
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import Table from "cli-table3";
import { createHeliconeClient } from "../lib/client-factory.js";
import { buildFilter, parseDate } from "../lib/client.js";
import { getMode } from "../lib/config.js";
import type { OutputFormat } from "../lib/types.js";

function addGatewayOptions(command: Command): Command {
  return command
    .option("--mode <mode>", "Connection mode (raw or gateway)")
    .option("--gateway-url <url>", "Gateway base URL")
    .option("--gateway-token <token>", "Gateway token");
}

function getSampleLimit(mode: "raw" | "gateway"): number {
  return mode === "gateway" ? 200 : 1000;
}

export function createMetricsCommand(): Command {
  const metrics = new Command("metrics").description(
    "View aggregate metrics and statistics"
  );

  // ============================================================================
  // helicone metrics summary
  // ============================================================================
  const summary = metrics
    .command("summary")
    .description("Show summary metrics for a time period")
    .option(
      "--since <date>",
      "Start date (ISO format or relative like 7d, 24h)",
      "7d"
    )
    .option("--until <date>", "End date (ISO format or relative)")
    .option("--model <model>", "Filter by model name")
    .option("-f, --format <format>", "Output format: table, json", "table")
    .option("--api-key <key>", "Helicone API key")
    .option("--region <region>", "API region (us or eu)")
    .action(async (options) => {
      try {
        const client = createHeliconeClient(options);

        const startDate = options.since
          ? parseDate(options.since)
          : parseDate("7d");
        const endDate = options.until ? parseDate(options.until) : new Date();

        const filter = buildFilter({
          model: options.model,
          startDate,
          endDate,
        });

        const mode = getMode(options.mode);
        const sampleLimit = getSampleLimit(mode);

        const spinner = ora("Fetching metrics...").start();

        // Fetch request count and get sample for aggregation
        const [countResult, sampleResult] = await Promise.all([
          client.countRequests(filter),
          client.queryRequests({
            filter,
            limit: sampleLimit, // Sample for metrics
            sort: { created_at: "desc" },
          }),
        ]);

        if (countResult.error || sampleResult.error) {
          spinner.fail(
            chalk.red(`Error: ${countResult.error || sampleResult.error}`)
          );
          process.exit(1);
        }

        spinner.stop();

        const requests = sampleResult.data || [];
        // Use count from API if available, otherwise fallback to sample size
        // (the count endpoint sometimes returns 0 incorrectly)
        const totalRequests = (countResult.data && countResult.data > 0)
          ? countResult.data
          : requests.length;

        // Calculate metrics from sample
        let totalTokens = 0;
        let totalCost = 0;
        let totalLatency = 0;
        let successCount = 0;
        let errorCount = 0;
        const modelCounts: Record<string, number> = {};
        const providerCounts: Record<string, number> = {};

        for (const req of requests) {
          // API returns total_tokens as string, so parse it
          const tokens = typeof req.total_tokens === "string"
            ? parseInt(req.total_tokens, 10)
            : req.total_tokens;
          totalTokens += tokens || 0;
          totalCost += req.cost || 0;
          totalLatency += req.delay_ms || 0;

          if (req.response_status >= 200 && req.response_status < 300) {
            successCount++;
          } else if (req.response_status >= 400) {
            errorCount++;
          }

          const model = req.model || "unknown";
          modelCounts[model] = (modelCounts[model] || 0) + 1;

          const provider = req.provider || "unknown";
          providerCounts[provider] = (providerCounts[provider] || 0) + 1;
        }

        const sampleSize = requests.length;
        const avgLatency = sampleSize > 0 ? totalLatency / sampleSize : 0;
        const avgTokens = sampleSize > 0 ? totalTokens / sampleSize : 0;
        const avgCost = sampleSize > 0 ? totalCost / sampleSize : 0;
        const errorRate = sampleSize > 0 ? (errorCount / sampleSize) * 100 : 0;

        // Extrapolate totals if sample is smaller than total
        const scaleFactor = totalRequests > sampleSize ? totalRequests / sampleSize : 1;
        const estimatedTotalCost = totalCost * scaleFactor;
        const estimatedTotalTokens = totalTokens * scaleFactor;

        // Format output
        if (options.format === "json") {
          const output = {
            timeRange: {
              start: startDate.toISOString(),
              end: endDate.toISOString(),
            },
            totalRequests,
            sampleSize,
            estimatedTotalCost,
            estimatedTotalTokens,
            averageLatencyMs: avgLatency,
            averageTokensPerRequest: avgTokens,
            averageCostPerRequest: avgCost,
            errorRate,
            successCount,
            errorCount,
            modelDistribution: modelCounts,
            providerDistribution: providerCounts,
          };
          console.log(JSON.stringify(output, null, 2));
        } else {
          // Table format
          console.log(chalk.bold("\n📊 Metrics Summary\n"));
          console.log(
            chalk.dim(
              `Time range: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`
            )
          );
          if (options.model) {
            console.log(chalk.dim(`Model filter: ${options.model}`));
          }
          console.log();

          const summaryTable = new Table({
            style: { head: [], border: [] },
          });

          // Format numbers safely (avoid Infinity/NaN display issues)
          const formatNumber = (n: number) =>
            Number.isFinite(n) ? n.toLocaleString() : "N/A";
          const formatFixed = (n: number, digits: number) =>
            Number.isFinite(n) ? n.toFixed(digits) : "N/A";

          summaryTable.push(
            [chalk.bold("Total Requests"), formatNumber(totalRequests)],
            [
              chalk.bold("Estimated Total Cost"),
              `$${formatFixed(estimatedTotalCost, 2)}`,
            ],
            [
              chalk.bold("Estimated Total Tokens"),
              formatNumber(Math.round(estimatedTotalTokens)),
            ],
            [chalk.bold("Avg Latency"), `${formatFixed(avgLatency, 0)}ms`],
            [chalk.bold("Avg Tokens/Request"), formatFixed(avgTokens, 0)],
            [chalk.bold("Avg Cost/Request"), `$${formatFixed(avgCost, 4)}`],
            [
              chalk.bold("Error Rate"),
              errorRate > 5
                ? chalk.red(`${errorRate.toFixed(1)}%`)
                : chalk.green(`${errorRate.toFixed(1)}%`),
            ]
          );

          console.log(summaryTable.toString());

          // Top models
          const topModels = Object.entries(modelCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

          if (topModels.length > 0) {
            console.log(chalk.bold("\n📈 Top Models:\n"));
            for (const [model, count] of topModels) {
              const pct = ((count / sampleSize) * 100).toFixed(1);
              console.log(`  ${chalk.cyan(model.padEnd(30))} ${count} (${pct}%)`);
            }
          }

          // Top providers
          const topProviders = Object.entries(providerCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

          if (topProviders.length > 0) {
            console.log(chalk.bold("\n🏢 Providers:\n"));
            for (const [provider, count] of topProviders) {
              const pct = ((count / sampleSize) * 100).toFixed(1);
              console.log(`  ${chalk.cyan(provider.padEnd(20))} ${count} (${pct}%)`);
            }
          }

          if (sampleSize < totalRequests) {
            console.log(
              chalk.dim(
                `\n* Metrics based on sample of ${sampleSize.toLocaleString()} requests`
              )
            );
          }
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
        process.exit(1);
      }
    });
  addGatewayOptions(summary);

  // ============================================================================
  // helicone metrics cost
  // ============================================================================
  const cost = metrics
    .command("cost")
    .description("Show cost breakdown")
    .option("--since <date>", "Start date", "30d")
    .option("--until <date>", "End date")
    .option("--by <grouping>", "Group by: model, provider, day, user", "model")
    .option("-n, --limit <number>", "Limit results (for user grouping)", "50")
    .option("-f, --format <format>", "Output format: table, json", "table")
    .option("--api-key <key>", "Helicone API key")
    .option("--region <region>", "API region (us or eu)")
    .action(async (options) => {
      try {
        const client = createHeliconeClient(options);

        const startDate = options.since
          ? parseDate(options.since)
          : parseDate("30d");
        const endDate = options.until ? parseDate(options.until) : new Date();

        const mode = getMode(options.mode);
        const sampleLimit = getSampleLimit(mode);

        const grouping = options.by || "model";

        // Use dedicated user metrics endpoint for user grouping
        if (grouping === "user") {
          const spinner = ora("Fetching user metrics...").start();

          const result = await client.queryUserMetrics({
            filter: "all",
            limit: parseInt(options.limit, 10) || 50,
            timeFilter: {
              startTimeUnixSeconds: Math.floor(startDate.getTime() / 1000),
              endTimeUnixSeconds: Math.floor(endDate.getTime() / 1000),
            },
          });

          if (result.error) {
            spinner.fail(chalk.red(`Error: ${result.error}`));
            process.exit(1);
          }

          spinner.stop();

          const users = result.data?.users || [];

          // Sort by cost descending
          const sorted = [...users].sort((a, b) => b.cost - a.cost);
          const totalCost = sorted.reduce((sum, u) => sum + u.cost, 0);
          const totalRequests = sorted.reduce((sum, u) => sum + u.total_requests, 0);

          if (options.format === "json") {
            const output = {
              grouping: "user",
              timeRange: {
                start: startDate.toISOString(),
                end: endDate.toISOString(),
              },
              totalCost,
              totalRequests,
              users: sorted.map((u) => ({
                user_id: u.user_id,
                cost: u.cost,
                requests: u.total_requests,
                prompt_tokens: u.total_prompt_tokens,
                completion_tokens: u.total_completion_tokens,
                first_active: u.first_active,
                last_active: u.last_active,
              })),
            };
            console.log(JSON.stringify(output, null, 2));
          } else {
            console.log(chalk.bold(`\n💰 Cost Breakdown (by user)\n`));
            console.log(
              chalk.dim(
                `Time range: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`
              )
            );
            console.log();

            const table = new Table({
              head: [
                chalk.bold("User"),
                chalk.bold("Cost"),
                chalk.bold("Requests"),
                chalk.bold("Prompt Tokens"),
                chalk.bold("Completion Tokens"),
                chalk.bold("%"),
              ],
              style: { head: [], border: [] },
            });

            for (const user of sorted) {
              const pct = totalCost > 0 ? (user.cost / totalCost) * 100 : 0;
              table.push([
                chalk.cyan(user.user_id),
                `$${user.cost.toFixed(4)}`,
                user.total_requests.toLocaleString(),
                user.total_prompt_tokens.toLocaleString(),
                user.total_completion_tokens.toLocaleString(),
                `${pct.toFixed(1)}%`,
              ]);
            }

            console.log(table.toString());
            console.log(
              chalk.bold(
                `\nTotal: $${totalCost.toFixed(2)} across ${totalRequests.toLocaleString()} requests from ${sorted.length} users`
              )
            );
          }

          return;
        }

        // Original logic for model/provider/day grouping
        const filter = buildFilter({ startDate, endDate });

        const spinner = ora("Calculating costs...").start();

        // Fetch requests for cost calculation
        const result = await client.queryRequests({
          filter,
          limit: sampleLimit,
          sort: { created_at: "desc" },
        });

        if (result.error) {
          spinner.fail(chalk.red(`Error: ${result.error}`));
          process.exit(1);
        }

        spinner.stop();

        const requests = result.data || [];

        // Group costs
        const groups: Record<string, { cost: number; count: number; tokens: number }> = {};

        for (const req of requests) {
          let key: string;
          if (grouping === "model") {
            key = req.model || "unknown";
          } else if (grouping === "provider") {
            key = req.provider || "unknown";
          } else if (grouping === "day") {
            key = new Date(req.request_created_at).toISOString().split("T")[0];
          } else {
            key = "all";
          }

          if (!groups[key]) {
            groups[key] = { cost: 0, count: 0, tokens: 0 };
          }
          groups[key].cost += req.cost || 0;
          groups[key].count += 1;
          // API returns total_tokens as string
          const tokens = typeof req.total_tokens === "string"
            ? parseInt(req.total_tokens, 10)
            : req.total_tokens;
          groups[key].tokens += tokens || 0;
        }

        // Sort by cost
        const sorted = Object.entries(groups).sort((a, b) => b[1].cost - a[1].cost);
        const totalCost = sorted.reduce((sum, [, g]) => sum + g.cost, 0);

        if (options.format === "json") {
          const output = {
            grouping,
            timeRange: {
              start: startDate.toISOString(),
              end: endDate.toISOString(),
            },
            totalCost,
            groups: Object.fromEntries(sorted),
          };
          console.log(JSON.stringify(output, null, 2));
        } else {
          console.log(chalk.bold(`\n💰 Cost Breakdown (by ${grouping})\n`));
          console.log(
            chalk.dim(
              `Time range: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`
            )
          );
          console.log();

          const table = new Table({
            head: [
              chalk.bold(grouping),
              chalk.bold("Cost"),
              chalk.bold("Requests"),
              chalk.bold("Tokens"),
              chalk.bold("%"),
            ],
            style: { head: [], border: [] },
          });

          for (const [key, data] of sorted) {
            const pct = totalCost > 0 ? (data.cost / totalCost) * 100 : 0;
            table.push([
              chalk.cyan(key),
              `$${data.cost.toFixed(4)}`,
              data.count.toLocaleString(),
              data.tokens.toLocaleString(),
              `${pct.toFixed(1)}%`,
            ]);
          }

          console.log(table.toString());
          console.log(chalk.bold(`\nTotal: $${totalCost.toFixed(4)}`));

          if (requests.length === 1000) {
            console.log(
              chalk.dim("\n* Based on sample of 1,000 most recent requests")
            );
          }
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
        process.exit(1);
      }
    });
  addGatewayOptions(cost);

  // ============================================================================
  // helicone metrics errors
  // ============================================================================
  const errors = metrics
    .command("errors")
    .description("Show error statistics")
    .option("--since <date>", "Start date", "7d")
    .option("--until <date>", "End date")
    .option("-f, --format <format>", "Output format: table, json", "table")
    .option("--api-key <key>", "Helicone API key")
    .option("--region <region>", "API region (us or eu)")
    .action(async (options) => {
      try {
        const client = createHeliconeClient(options);

        const startDate = options.since
          ? parseDate(options.since)
          : parseDate("7d");
        const endDate = options.until ? parseDate(options.until) : new Date();

        const filter = buildFilter({ startDate, endDate });

        const spinner = ora("Analyzing errors...").start();

        const result = await client.queryRequests({
          filter,
          limit: sampleLimit,
          sort: { created_at: "desc" },
        });

        if (result.error) {
          spinner.fail(chalk.red(`Error: ${result.error}`));
          process.exit(1);
        }

        spinner.stop();

        const requests = result.data || [];

        // Group by status code
        const statusCounts: Record<number, number> = {};
        const errorsByModel: Record<string, number> = {};
        let totalErrors = 0;

        for (const req of requests) {
          const status = req.response_status;
          statusCounts[status] = (statusCounts[status] || 0) + 1;

          if (status >= 400) {
            totalErrors++;
            const model = req.model || "unknown";
            errorsByModel[model] = (errorsByModel[model] || 0) + 1;
          }
        }

        const errorRate = requests.length > 0
          ? (totalErrors / requests.length) * 100
          : 0;

        if (options.format === "json") {
          console.log(
            JSON.stringify(
              {
                totalRequests: requests.length,
                totalErrors,
                errorRate,
                statusCounts,
                errorsByModel,
              },
              null,
              2
            )
          );
        } else {
          console.log(chalk.bold("\n🚨 Error Analysis\n"));

          const errorRateColor = errorRate > 5 ? chalk.red : chalk.green;
          console.log(
            `Error Rate: ${errorRateColor(`${errorRate.toFixed(1)}%`)} ` +
              `(${totalErrors} of ${requests.length} requests)\n`
          );

          // Status code breakdown
          console.log(chalk.bold("Status Codes:"));
          const sortedStatuses = Object.entries(statusCounts)
            .map(([s, c]) => [parseInt(s), c] as [number, number])
            .sort((a, b) => b[1] - a[1]);

          for (const [status, count] of sortedStatuses) {
            const pct = ((count / requests.length) * 100).toFixed(1);
            let statusColor = chalk.white;
            if (status >= 200 && status < 300) statusColor = chalk.green;
            else if (status >= 400 && status < 500) statusColor = chalk.yellow;
            else if (status >= 500) statusColor = chalk.red;

            console.log(`  ${statusColor(status.toString().padEnd(5))} ${count} (${pct}%)`);
          }

          // Errors by model
          if (Object.keys(errorsByModel).length > 0) {
            console.log(chalk.bold("\nErrors by Model:"));
            const sortedModels = Object.entries(errorsByModel).sort(
              (a, b) => b[1] - a[1]
            );
            for (const [model, count] of sortedModels.slice(0, 10)) {
              console.log(`  ${chalk.cyan(model.padEnd(30))} ${count}`);
            }
          }
        }
      } catch (error) {
        console.error(chalk.red(`Error: ${(error as Error).message}`));
        process.exit(1);
      }
    });
  addGatewayOptions(errors);

  return metrics;
}
