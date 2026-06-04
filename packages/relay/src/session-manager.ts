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
  pendingFrames: Map<string, Array<Buffer>>; // connectionId -> 缓存的消息（等 server data socket 连接后发送）
}

interface SessionManagerOptions {
  logger: pino.Logger;
}

const PING_INTERVAL_MS = 30_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** 安全地将 Buffer/Buffer[] 转为字符串 */
function bufferToString(data: Buffer | Buffer[] | string): string | null {
  if (typeof data === "string") return data;
  if (Buffer.isBuffer(data)) return data.toString("utf8");
  if (Array.isArray(data) && data.length > 0 && Buffer.isBuffer(data[0])) {
    return Buffer.concat(data).toString("utf8");
  }
  return null;
}

/** 安全地解析 JSON，失败返回 null */
function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
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
      // 关闭旧的 server control 连接（与 Cloudflare 版一致：只保留一个 control 连接）
      for (const oldConn of session.controlConnections) {
        try {
          oldConn.ws.close(1008, "Replaced by new connection");
        } catch {
          // ignore
        }
      }
      session.controlConnections.length = 0;

      session.controlConnections.push(connection);

      // 发送初始 sync 消息，告知当前已有的客户端连接
      this.sendInitialSync(ws, session);
    } else {
      // 关闭同 connectionId 的旧 server data socket（与 Cloudflare 版一致）
      if (role === "server" && connectionId) {
        const existing = session.connections.get(connectionKey);
        if (existing) {
          for (const oldConn of existing) {
            if (oldConn.attachment.role === "server") {
              try {
                oldConn.ws.close(1008, "Replaced by new connection");
              } catch {
                // ignore
              }
            }
          }
        }
      }

      const connections = session.connections.get(connectionKey) || [];
      connections.push(connection);
      session.connections.set(connectionKey, connections);

      // 客户端连接时，只有当该 connectionId 还没有 server 连接时，才通知 daemon
      if (role === "client" && connectionId) {
        const existingConnections = session.connections.get(connectionKey) || [];
        const hasServerConnection = existingConnections.some((c) => c.attachment.role === "server");
        if (!hasServerConnection) {
          this.notifyControls(session, { type: "connected", connectionId });
        }
      }

      // server data socket 连接时，刷新该 connectionId 的缓存消息
      if (role === "server" && connectionId) {
        this.flushFrames(session, connectionId, ws);
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
        pendingFrames: new Map(),
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

  /** 缓存 client 消息，等 server data socket 连接后发送 */
  private bufferFrame(session: RelaySession, connectionId: string, data: Buffer | Buffer[]): void {
    const existing = session.pendingFrames.get(connectionId) ?? [];
    // 将 Buffer/Buffer[] 转为可存储的格式
    if (Buffer.isBuffer(data)) {
      existing.push(data);
    } else if (Array.isArray(data)) {
      for (const part of data) {
        if (Buffer.isBuffer(part)) {
          existing.push(part);
        }
      }
    }
    // 防止内存无限增长
    if (existing.length > 200) {
      existing.splice(0, existing.length - 200);
    }
    session.pendingFrames.set(connectionId, existing);
  }

  /** server data socket 连接后，发送该 connectionId 的缓存消息 */
  private flushFrames(session: RelaySession, connectionId: string, ws: WsWebSocket): void {
    const frames = session.pendingFrames.get(connectionId);
    if (!frames || frames.length === 0) return;
    session.pendingFrames.delete(connectionId);
    for (let i = 0; i < frames.length; i++) {
      try {
        ws.send(frames[i]);
      } catch {
        // 发送失败，重新缓存当前帧及剩余帧
        this.bufferFrame(session, connectionId, frames.slice(i));
        break;
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
      if (!connection.attachment.connectionId) {
        const text = bufferToString(data);
        if (text) {
          const parsed = tryParseJson(text);
          if (isRecord(parsed)) {
            if (parsed.type === "pong") {
              connection.isAlive = true;
              return;
            }
            if (parsed.type === "ping") {
              this.handleControlKeepalive(ws, text);
              return;
            }
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

        // 客户端断开时通知 daemon，关闭对应的 server data socket，并清理缓存消息
        if (connection.attachment.role === "client") {
          const remaining = session.connections.get(connectionKey);
          const remainingClients = remaining?.filter((c) => c.attachment.role === "client") ?? [];
          if (remainingClients.length === 0) {
            this.notifyControls(session, { type: "disconnected", connectionId: connection.attachment.connectionId });
            session.pendingFrames.delete(connectionKey);
            // 关闭对应的 server data socket，让 daemon 端也断开
            const serverRemaining = remaining?.filter((c) => c.attachment.role === "server") ?? [];
            for (const serverConn of serverRemaining) {
              try {
                serverConn.ws.close(1001, "Client disconnected");
              } catch {
                // ignore
              }
            }
          }
        }

        // server data socket 断开时，关闭对应的 client 连接，让 App 端重连
        if (connection.attachment.role === "server") {
          const remaining = session.connections.get(connectionKey);
          const clientConnections = remaining?.filter((c) => c.attachment.role === "client") ?? [];
          for (const clientConn of clientConnections) {
            try {
              clientConn.ws.close(1012, "Server disconnected");
            } catch {
              // ignore
            }
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
      if (connectionId) {
        const connections = session.connections.get(connectionId);
        const serverConnections = connections?.filter((c) => c.attachment.role === "server");
        if (serverConnections && serverConnections.length > 0) {
          for (const connection of serverConnections) {
            try {
              connection.ws.send(data);
            } catch {
              // ignore
            }
          }
        } else {
          this.bufferFrame(session, connectionId, data);
        }
      }
      return;
    }

    // Server -> Client
    if (!connectionId) {
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
    // 只对 server control 连接做 isAlive 检测和 JSON ping：
    // - control 连接（无 connectionId）处理 JSON ping/pong
    // - data socket（有 connectionId）被 E2EE 层包裹，无法处理明文 JSON ping
    // - client 连接（App）也使用 E2EE，无法处理明文 JSON ping
    // - data/client 连接断开由 WebSocket close 事件处理
    for (const connection of session.controlConnections) {
      if (!connection.isAlive) {
        connection.ws.terminate();
        continue;
      }
      connection.isAlive = false;
      try {
        connection.ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
      } catch {
        // ignore
      }
    }
  }
}
