/// <reference lib="dom" />
/**
 * Self-hosted relay server for Paseo.
 *
 * This is a Node.js WebSocket server that replaces the Cloudflare Durable Objects
 * implementation. It handles the same relay logic:
 * - Routes WebSocket connections by serverId and connectionId
 * - Bridges server/client sockets bidirectionally
 * - Supports v1 and v2 relay protocols
 * - Maintains connection state in memory
 *
 * Usage:
 *   node dist/self-hosted-server.js --port 8080
 *   # or with custom config
 *   PASEO_RELAY_PORT=8080 node dist/self-hosted-server.js
 */

import { createServer } from "node:http";
import type { IncomingMessage, Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket as WsWebSocket } from "ws";
import type pino from "pino";
import { createLogger } from "./logger.js";
import { RelaySessionManager } from "./session-manager.js";

export interface SelfHostedRelayOptions {
  port: number;
  host?: string;
  logger?: pino.Logger;
  /** Health check endpoint path (default: "/health") */
  healthPath?: string;
}

interface ParsedRelayParams {
  role: "server" | "client";
  serverId: string;
  connectionId?: string;
  version: "1" | "2";
}

function parseRelayParams(url: string): ParsedRelayParams | null {
  try {
    const parsed = new URL(url, "http://localhost");
    const role = parsed.searchParams.get("role");
    const serverId = parsed.searchParams.get("serverId");
    const connectionId = parsed.searchParams.get("connectionId");
    const versionRaw = parsed.searchParams.get("v");

    if (!role || (role !== "server" && role !== "client")) return null;
    if (!serverId) return null;

    const version = versionRaw === "1" || versionRaw === "2" ? versionRaw : "1";

    return {
      role,
      serverId,
      connectionId: connectionId || undefined,
      version,
    };
  } catch {
    return null;
  }
}

export function createSelfHostedRelay(options: SelfHostedRelayOptions) {
  const { port, host = "0.0.0.0" } = options;
  const logger = options.logger ?? createLogger();
  const healthPath = options.healthPath ?? "/health";

  const sessionManager = new RelaySessionManager({ logger });

  const httpServer: HttpServer = createServer((req, res) => {
    if (req.url === healthPath || req.url?.startsWith(`${healthPath}?`)) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: 10 * 1024 * 1024, // 10MB
  });

  wss.on("connection", (ws: WsWebSocket, req: IncomingMessage, params: ParsedRelayParams) => {
    const { role, serverId, connectionId, version } = params;

    logger.info(
      { role, serverId, connectionId, version, remoteAddress: req.socket.remoteAddress },
      "relay_connection_accepted",
    );

    sessionManager.handleConnection(ws, { role, serverId, connectionId, version });
  });

  httpServer.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = req.url ?? "";
    const params = parseRelayParams(url);

    if (!params) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, params);
    });
  });

  httpServer.on("error", (error) => {
    logger.error({ err: error }, "relay_http_error");
  });

  wss.on("error", (error) => {
    logger.error({ err: error }, "relay_ws_error");
  });

  const start = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      httpServer.listen(port, host, () => {
        logger.info({ host, port }, "relay_server_started");
        resolve();
      });

      httpServer.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE") {
          logger.error({ host, port }, "relay_address_in_use");
          reject(new Error(`Port ${port} is already in use`));
        } else {
          reject(error);
        }
      });
    });
  };

  const stop = (): Promise<void> => {
    return new Promise((resolve) => {
      logger.info("relay_server_stopping");
      sessionManager.closeAll();
      wss.close(() => {
        httpServer.close(() => {
          logger.info("relay_server_stopped");
          resolve();
        });
      });
    });
  };

  // Graceful shutdown
  const shutdownSignals = ["SIGTERM", "SIGINT"] as const;
  for (const signal of shutdownSignals) {
    process.on(signal, async () => {
      logger.info({ signal }, "relay_shutdown_signal_received");
      await stop();
      process.exit(0);
    });
  }

  return { start, stop, httpServer, wss, sessionManager };
}

export type SelfHostedRelay = ReturnType<typeof createSelfHostedRelay>;
