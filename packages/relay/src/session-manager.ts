/// <reference lib="dom" />
/**
 * Session manager for the self-hosted relay server.
 *
 * Manages WebSocket connections per serverId and connectionId,
 * handles message forwarding between server and client sockets.
 */

import { randomUUID } from "node:crypto";
import type { WebSocket as WsWebSocket } from "ws";
import type pino from "pino";
import type { ConnectionRole, RelaySessionAttachment } from "./types.js";

interface SessionConnection {
  ws: WsWebSocket;
  attachment: RelaySessionAttachment;
  isAlive: boolean;
}

interface RelaySession {
  serverId: string;
  connections: Map<string, SessionConnection[]>; // connectionId -> sockets
  controlConnections: SessionConnection[]; // server control sockets
}

interface SessionManagerOptions {
  logger: pino.Logger;
}

const PING_INTERVAL_MS = 5_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 生成 connectionId，与 Cloudflare 版格式一致 */
function generateConnectionId(): string {
  return `conn_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export class RelaySessionManager {
  private logger: pino.Logger;
  private sessions = new Map<string, RelaySession>(); // serverId -> session
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: SessionManagerOptions) {
    this.logger = options.logger.child({ module: "session-manager" });
    this.startPingInterval();
  }

  handleConnection(
    ws: WsWebSocket,
    params: { role: ConnectionRole; serverId: string; connectionId?: string; version: "1" | "2" },
  ): void {
    const { role, serverId, version } = params;
    let { connectionId } = params;

    // 与 Cloudflare 版一致：客户端没有 connectionId 时自动分配
    if (role === "client" && !connectionId) {
      connectionId = generateConnectionId();
    }

    const session = this.getOrCreateSession(serverId);
    const attachment: RelaySessionAttachment = {
      serverId,
      role,
      version,
      connectionId: connectionId || null,
      createdAt: Date.now(),
    };

    const connection: SessionConnection = {
      ws,
      attachment,
      isAlive: true,
    };

    const connectionKey = connectionId || "control";
    this.setupWebSocket(ws, connection, session, connectionKey);

    if (role === "server" && !connectionId) {
      session.controlConnections.push(connection);

      // 发送初始 sync 消息，告知当前已有的客户端连接
      this.sendInitialSync(ws, session);
    } else {
      const connections = session.connections.get(connectionKey) || [];
      connections.push(connection);
      session.connections.set(connectionKey, connections);

      // 客户端连接时，通知 daemon 的 control 连接
      if (role === "client" && connectionId) {
        this.notifyControls(session, { type: "connected", connectionId });
      }
    }

    this.logger.info(
      {
        serverId,
        role,
        connectionId,
        version,
        totalConnections: this.getTotalConnections(session),
      },
      "session_connection_added",
    );
  }

  closeAll(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    for (const [, session] of this.sessions) {
      for (const connection of session.controlConnections) {
        try {
          connection.ws.close(1001, "Server shutting down");
        } catch {
          // ignore
        }
      }
      for (const [, connections] of session.connections) {
        for (const connection of connections) {
          try {
            connection.ws.close(1001, "Server shutting down");
          } catch {
            // ignore
          }
        }
      }
    }
  }

  private getTotalConnections(session: RelaySession): number {
    let count = session.controlConnections.length;
    for (const [, connections] of session.connections) {
      count += connections.length;
    }
    return count;
  }

  private getOrCreateSession(serverId: string): RelaySession {
    let session = this.sessions.get(serverId);
    if (!session) {
      session = {
        serverId,
        connections: new Map(),
        controlConnections: [],
      };
      this.sessions.set(serverId, session);
    }
    return session;
  }

  private listConnectedConnectionIds(session: RelaySession): string[] {
    const out = new Set<string>();
    for (const [, connections] of session.connections) {
      for (const conn of connections) {
        if (conn.attachment.role === "client" && conn.attachment.connectionId) {
          out.add(conn.attachment.connectionId);
        }
      }
    }
    return Array.from(out);
  }

  private sendInitialSync(ws: WsWebSocket, session: RelaySession): void {
    try {
      const connectionIds = this.listConnectedConnectionIds(session);
      ws.send(JSON.stringify({ type: "sync", connectionIds }));
    } catch {
      // ignore
    }
  }

  /** 通知 daemon 的所有 control 连接 */
  private notifyControls(session: RelaySession, message: unknown): void {
    const text = JSON.stringify(message);
    for (const connection of session.controlConnections) {
      try {
        connection.ws.send(text);
      } catch {
        try {
          connection.ws.close(1011, "Control send failed");
        } catch {
          // ignore
        }
      }
    }
  }

  /** 处理 daemon 发来的 JSON ping（兼容旧版 daemon） */
  private handleControlKeepalive(ws: WsWebSocket, message: string): void {
    try {
      const parsed = JSON.parse(message);
      if (isRecord(parsed) && parsed.type === "ping") {
        this.logger.info("legacy_json_ping_received");
        try {
          ws.send(JSON.stringify({ type: "pong", ts: Date.now() }));
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore non-JSON control payloads
    }
  }

  private setupWebSocket(
    ws: WsWebSocket,
    connection: SessionConnection,
    session: RelaySession,
    connectionKey: string,
  ): void {
    ws.on("ping", () => {
      try {
        ws.pong();
        connection.isAlive = true;
      } catch {
        // ignore
      }
    });

    ws.on("pong", () => {
      connection.isAlive = true;
    });

    ws.on("message", (data: Buffer | Buffer[]) => {
      // control 连接（无 connectionId）处理 JSON ping/pong
      if (!connection.attachment.connectionId) {
        if (typeof data === "string") {
          this.handleControlKeepalive(ws, data);
        } else {
          try {
            let str = "";
            if (Buffer.isBuffer(data)) {
              str = data.toString("utf8");
            } else if (Array.isArray(data) && data.length > 0 && Buffer.isBuffer(data[0])) {
              str = data[0].toString("utf8");
            }
            if (str) {
              this.handleControlKeepalive(ws, str);
            }
          } catch {
            // ignore
          }
        }
      }
      this.forwardMessage(connection, session, data);
    });

    ws.on("close", (code, reason) => {
      this.handleConnectionClose(connection, session, connectionKey, code, reason.toString());
    });

    ws.on("error", (error) => {
      this.logger.warn(
        { serverId: session.serverId, role: connection.attachment.role, err: error },
        "session_websocket_error",
      );
    });
  }

  private handleConnectionClose(
    connection: SessionConnection,
    session: RelaySession,
    connectionKey: string,
    code: number,
    reason: string,
  ): void {
    this.logger.debug(
      {
        serverId: session.serverId,
        role: connection.attachment.role,
        connectionId: connection.attachment.connectionId,
        code,
        reason,
      },
      "session_connection_closed",
    );

    // Remove from control connections
    if (connection.attachment.role === "server" && !connection.attachment.connectionId) {
      const idx = session.controlConnections.indexOf(connection);
      if (idx !== -1) {
        session.controlConnections.splice(idx, 1);
      }
    }

    // Remove from regular connections
    if (connection.attachment.connectionId) {
      const connections = session.connections.get(connectionKey);
      if (connections) {
        const idx = connections.indexOf(connection);
        if (idx !== -1) {
          connections.splice(idx, 1);
        }
        if (connections.length === 0) {
          session.connections.delete(connectionKey);
        }

        // 客户端断开时通知 daemon
        if (connection.attachment.role === "client") {
          const remaining = session.connections.get(connectionKey);
          if (!remaining || remaining.length === 0) {
            this.notifyControls(session, { type: "disconnected", connectionId: connection.attachment.connectionId });
          }
        }
      }
    }

    // Cleanup session if empty
    if (this.getTotalConnections(session) === 0) {
      this.sessions.delete(session.serverId);
      this.logger.debug({ serverId: session.serverId }, "session_cleaned_up");
    }
  }

  private forwardMessage(source: SessionConnection, session: RelaySession, data: Buffer | Buffer[]): void {
    const { role, connectionId } = source.attachment;

    if (role === "client") {
      // Client -> Server: 按 connectionId 路由到对应的 server data socket
      if (connectionId) {
        const connections = session.connections.get(connectionId);
        if (connections) {
          for (const connection of connections) {
            if (connection.attachment.role === "server") {
              try {
                connection.ws.send(data);
              } catch {
                // ignore
              }
            }
          }
        }
      }
      // 同时也转发到 control 连接（兼容无 connectionId 的场景）
      for (const connection of session.controlConnections) {
        try {
          connection.ws.send(data);
        } catch {
          // ignore
        }
      }
      return;
    }

    // Server -> Client: 按 connectionId 转发
    if (!connectionId) {
      // control 连接广播到所有客户端
      for (const [, connections] of session.connections) {
        for (const connection of connections) {
          if (connection.attachment.role === "client") {
            try {
              connection.ws.send(data);
            } catch {
              // ignore
            }
          }
        }
      }
    } else {
      // data 连接按 connectionId 转发到匹配的客户端
      const connections = session.connections.get(connectionId);
      if (connections) {
        for (const connection of connections) {
          if (connection.attachment.role === "client") {
            try {
              connection.ws.send(data);
            } catch {
              // ignore
            }
          }
        }
      }
    }
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      for (const [, session] of this.sessions) {
        this.pingAllConnections(session);
      }
    }, PING_INTERVAL_MS);

    this.pingInterval.unref();
  }

  private pingAllConnections(session: RelaySession): void {
    const allConnections: SessionConnection[] = [];

    const seen = new Set<SessionConnection>();
    for (const connection of session.controlConnections) {
      if (!seen.has(connection)) {
        seen.add(connection);
        allConnections.push(connection);
      }
    }
    for (const [, connections] of session.connections) {
      for (const connection of connections) {
        if (!seen.has(connection)) {
          seen.add(connection);
          allConnections.push(connection);
        }
      }
    }

    for (const connection of allConnections) {
      if (!connection.isAlive) {
        connection.ws.terminate();
        continue;
      }
      connection.isAlive = false;
      try {
        connection.ws.ping();
      } catch {
        try {
          connection.ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
        } catch {
          // ignore
        }
      }
    }
  }
}
