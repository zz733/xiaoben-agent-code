#!/usr/bin/env node
/// <reference lib="dom" />
/**
 * Entry point for the self-hosted relay server.
 *
 * Usage:
 *   node dist/bin/relay-server.js
 *   # or with options
 *   PASEO_RELAY_PORT=8080 PASEO_RELAY_HOST=0.0.0.0 node dist/bin/relay-server.js
 *   # or with CLI args
 *   node dist/bin/relay-server.js --port 8080 --host 0.0.0.0 --log-level debug
 */

import { createSelfHostedRelay } from "../self-hosted-server.js";
import { createLogger } from "../logger.js";

interface CLIOptions {
  port: number;
  host: string;
  logLevel: string;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    port: parseInt(process.env.PASEO_RELAY_PORT ?? "8080", 10),
    host: process.env.PASEO_RELAY_HOST ?? "0.0.0.0",
    logLevel: process.env.PASEO_RELAY_LOG_LEVEL ?? "info",
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--port":
      case "-p":
        options.port = parseInt(args[++i], 10);
        break;
      case "--host":
      case "-h":
        options.host = args[++i];
        break;
      case "--log-level":
      case "-l":
        options.logLevel = args[++i];
        break;
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown option: ${args[i]}`);
        printHelp();
        process.exit(1);
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Paseo Self-Hosted Relay Server

Usage:
  node relay-server.js [options]

Options:
  -p, --port <number>       Port to listen on (default: 8080 or PASEO_RELAY_PORT)
  -h, --host <string>       Host to bind to (default: 0.0.0.0 or PASEO_RELAY_HOST)
  -l, --log-level <string>  Log level: trace, debug, info, warn, error (default: info)
  --help                    Show this help message

Environment Variables:
  PASEO_RELAY_PORT          Port to listen on
  PASEO_RELAY_HOST          Host to bind to
  PASEO_RELAY_LOG_LEVEL     Log level

Examples:
  node relay-server.js
  node relay-server.js --port 8080 --host 0.0.0.0
  PASEO_RELAY_PORT=443 PASEO_RELAY_LOG_LEVEL=debug node relay-server.js
`);
}

async function main(): Promise<void> {
  const options = parseArgs();
  const logger = createLogger({ level: options.logLevel });

  logger.info(
    { port: options.port, host: options.host, logLevel: options.logLevel },
    "starting_relay_server",
  );

  const relay = createSelfHostedRelay({
    port: options.port,
    host: options.host,
    logger,
  });

  try {
    await relay.start();
    logger.info("relay_server_ready");
  } catch (error) {
    logger.error({ err: error }, "relay_start_failed");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
