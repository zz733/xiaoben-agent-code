# Paseo 自托管 Relay 服务器部署指南

## 概述

本指南帮助你在自己的服务器上部署 Paseo Relay 服务器，替代 Cloudflare 托管版本。

**服务器信息：**

- 目标服务器：`root@weixin.52iptv.net`
- 默认端口：`8080`
- 协议：支持 v1 和 v2 relay 协议

---

## 一、快速部署（推荐）

### 1. 一键部署脚本

在项目根目录执行：

```bash
cd packages/relay
chmod +x deploy.sh
./deploy.sh root@weixin.52iptv.net
```

脚本会自动完成：

- ✅ 编译 relay 服务器代码
- ✅ 打包并上传到服务器
- ✅ 安装 systemd 服务
- ✅ 启动并验证服务

### 2. 验证部署

```bash
# 检查服务状态
ssh root@weixin.52iptv.net "systemctl status paseo-relay"

# 健康检查
curl http://weixin.52iptv.net:8080/health

# 查看日志
ssh root@weixin.52iptv.net "journalctl -u paseo-relay -f"
```

---

## 二、手动部署

如果自动脚本失败，可以手动部署：

### 1. 服务器环境准备

```bash
# SSH 登录服务器
ssh root@weixin.52iptv.net

# 安装 Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 验证安装
node --version  # 应该显示 v20.x.x 或更高
npm --version
```

### 2. 本地编译

```bash
cd packages/relay

# 安装依赖
npm install

# 编译
npm run build
```

### 3. 上传到服务器

```bash
# 创建远程目录
ssh root@weixin.52iptv.net "mkdir -p /opt/paseo-relay"

# 上传编译文件
scp -r dist/ package.json relay-config.json root@weixin.52iptv.net:/opt/paseo-relay/

# 上传服务文件
scp paseo-relay.service root@weixin.52iptv.net:/etc/systemd/system/
```

### 4. 服务器安装

```bash
ssh root@weixin.52iptv.net

# 安装依赖
cd /opt/paseo-relay
npm install --production

# 启用并启动服务
systemctl daemon-reload
systemctl enable paseo-relay
systemctl start paseo-relay

# 检查状态
systemctl status paseo-relay
```

---

## 三、配置 Nginx 反向代理（可选）

如果你想要域名和 HTTPS 支持：

### 1. 安装 Nginx

```bash
ssh root@weixin.52iptv.net
apt-get install -y nginx
```

### 2. 配置反向代理

```bash
# 上传配置文件
scp nginx-relay.conf root@weixin.52iptv.net:/etc/nginx/sites-available/paseo-relay

# 编辑配置文件，修改域名
ssh root@weixin.52iptv.net
nano /etc/nginx/sites-available/paseo-relay
# 修改 server_name 为你的域名

# 启用站点
ln -s /etc/nginx/sites-available/paseo-relay /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### 3. 配置 SSL（Let's Encrypt）

```bash
# 安装 certbot
apt-get install -y certbot python3-certbot-nginx

# 获取证书
certbot --nginx -d relay.yourdomain.com
```

---

## 四、配置 Daemon 使用自定义 Relay

部署完成后，配置本地 daemon 连接到你的 relay：

### 方式 1：环境变量

```bash
export PASEO_RELAY_ENDPOINT="weixin.52iptv.net:8080"
export PASEO_RELAY_USE_TLS="false"
```

### 方式 2：配置文件

编辑 `$PASEO_HOME/config.json`：

```json
{
  "relay": {
    "enabled": true,
    "endpoint": "weixin.52iptv.net:8080",
    "useTls": false
  }
}
```

### 方式 3：CLI 命令

```bash
paseo daemon set-config --relay.endpoint "weixin.52iptv.net:8080" --relay.useTls false
```

---

## 五、常用运维命令

### 服务管理

```bash
# 查看状态
ssh root@weixin.52iptv.net "systemctl status paseo-relay"

# 重启服务
ssh root@weixin.52iptv.net "systemctl restart paseo-relay"

# 停止服务
ssh root@weixin.52iptv.net "systemctl stop paseo-relay"

# 查看日志
ssh root@weixin.52iptv.net "journalctl -u paseo-relay -f"

# 查看最近 100 行日志
ssh root@weixin.52iptv.net "journalctl -u paseo-relay -n 100 --no-pager"
```

### 健康检查

```bash
# HTTP 健康检查
curl http://weixin.52iptv.net:8080/health

# 使用 jq 格式化
curl -s http://weixin.52iptv.net:8080/health | jq .
```

### 性能监控

```bash
# 查看进程资源使用
ssh root@weixin.52iptv.net "ps aux | grep relay-server"

# 查看网络连接
ssh root@weixin.52iptv.net "netstat -an | grep 8080 | wc -l"

# 查看 WebSocket 连接数
ssh root@weixin.52iptv.net "ss -tnp | grep 8080"
```

---

## 六、故障排查

### 服务无法启动

```bash
# 查看详细错误
ssh root@weixin.52iptv.net "journalctl -u paseo-relay -n 50 --no-pager"

# 手动运行查看错误
ssh root@weixin.52iptv.net
cd /opt/paseo-relay
node dist/bin/relay-server.js --port 8080 --log-level debug
```

### 端口被占用

```bash
# 查看占用端口的进程
ssh root@weixin.52iptv.net "lsof -i :8080"

# 修改端口
ssh root@weixin.52iptv.net
nano /etc/systemd/system/paseo-relay.service
# 修改 ExecStart 行的 --port 参数
systemctl daemon-reload
systemctl restart paseo-relay
```

### WebSocket 连接失败

```bash
# 检查防火墙
ssh root@weixin.52iptv.net "ufw status"

# 开放端口（如果使用 ufw）
ssh root@weixin.52iptv.net "ufw allow 8080/tcp"

# 测试 WebSocket 连接
npm install -g wscat
wscat -c "ws://weixin.52iptv.net:8080/ws?role=server&serverId=test&v=2"
```

---

## 七、安全建议

### 1. 防火墙配置

```bash
# 只允许必要的端口
ssh root@weixin.52iptv.net
ufw allow 22/tcp    # SSH
ufw allow 8080/tcp  # Relay
ufw enable
```

### 2. 使用 HTTPS（推荐）

通过 Nginx 反向代理 + Let's Encrypt 配置 HTTPS，参见第三节。

### 3. 限制连接数

编辑 `relay-config.json`：

```json
{
  "maxConnectionsPerServer": 50
}
```

### 4. 日志轮转

创建 `/etc/logrotate.d/paseo-relay`：

```
/var/log/paseo-relay/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0640 root root
}
```

---

## 八、文件结构

```
packages/relay/
├── src/
│   ├── self-hosted-server.ts      # 自托管服务器主入口
│   ├── session-manager.ts         # 会话管理和消息转发
│   ├── logger.ts                  # 日志配置
│   ├── bin/
│   │   └── relay-server.ts        # CLI 启动脚本
│   ├── cloudflare-adapter.ts      # Cloudflare 版本（保留）
│   └── ...                        # 其他加密库文件
├── dist/                          # 编译输出
├── package.json
├── relay-config.json              # 服务器配置文件
├── paseo-relay.service            # systemd 服务文件
├── nginx-relay.conf               # Nginx 反向代理配置
├── deploy.sh                      # 一键部署脚本
└── DEPLOYMENT.md                  # 本文档
```

---

## 九、架构说明

### 自托管 vs Cloudflare

| 特性     | 自托管           | Cloudflare         |
| -------- | ---------------- | ------------------ |
| 部署位置 | 你的服务器       | Cloudflare Workers |
| 成本     | 服务器成本       | 免费额度内免费     |
| 控制     | 完全控制         | 受限于 CF 平台     |
| 扩展性   | 需要手动扩展     | 自动扩展           |
| 延迟     | 取决于服务器位置 | 全球 CDN 边缘      |

### 工作原理

```
┌─────────────┐                    ┌──────────────────┐                    ┌─────────────┐
│   Daemon    │                    │  Relay Server    │                    │  Client     │
│  (本地机器)  │                    │ (你的服务器)      │                    │  (手机 App)  │
└──────┬──────┘                    └────────┬─────────┘                    └──────┬──────┘
       │                                    │                                     │
       │  1. outbound WS (control)          │                                     │
       │───────────────────────────────────>│                                     │
       │                                    │                                     │
       │  2. outbound WS (data per conn)    │                                     │
       │───────────────────────────────────>│                                     │
       │                                    │                                     │
       │                                    │  3. inbound WS (client)             │
       │                                    │<────────────────────────────────────│
       │                                    │                                     │
       │  4. E2EE 握手 (e2ee_hello/ready)   │                                     │
       │<─────────────────────────────────────────────────────────────────────────│
       │                                    │                                     │
       │  5. 加密消息双向转发               │                                     │
       │<═══════════════════════════════════│<════════════════════════════════════│
```

**关键点：**

- Relay 服务器只转发字节流，**无法解密**任何消息
- 所有消息使用 E2E 加密（Curve25519 + XSalsa20-Poly1305）
- 即使服务器被攻破，攻击者也无法读取或篡改消息内容

---

## 十、更新 relay 服务器

当代码更新后，重新运行部署脚本：

```bash
cd packages/relay
./deploy.sh root@weixin.52iptv.net
```

脚本会自动：

- 备份旧版本
- 上传新版本
- 重启服务
- 验证健康状态

---

## 支持

如有问题，请检查：

1. 服务器日志：`journalctl -u paseo-relay -f`
2. Daemon 日志：`$PASEO_HOME/daemon.log`
3. 网络连接：`curl http://weixin.52iptv.net:8080/health`
