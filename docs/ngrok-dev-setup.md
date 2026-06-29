# ngrok 联调 Palmetto + Vercel

## 前提

- Palmetto Docker 已运行：`curl http://localhost:8888/health` 返回 healthy  
  > **Windows 注意：** 端口 `8000` 常在系统保留段 `7974-8073` 内，请用 **8888** 映射：`docker run -p 8888:8000 palmetto`
- ngrok 已安装：`winget install ngrok.ngrok`
- Vercel 项目已部署 `analyze-step-features` API

## 一次性：注册 ngrok

1. 打开 https://dashboard.ngrok.com/signup 注册
2. 复制 Authtoken：https://dashboard.ngrok.com/get-started/your-authtoken
3. PowerShell 执行（只需一次）：

```powershell
ngrok config add-authtoken 你的token
```

4. **若提示版本过旧**（需要 ≥ 3.20.0），执行：

```powershell
ngrok update
ngrok version   # 应显示 3.20+，例如 3.39.x
```

> winget 安装的 3.3.1 过旧，`ngrok update` 会自动升到最新版。

## 每次联调（两个窗口）

### 窗口 A — Palmetto（若未运行）

```powershell
docker ps   # 确认已有容器映射 8000
# 若无:
cd E:\Palmetto
docker run -d --name palmetto-dev -p 8888:8000 palmetto
```

### 窗口 B — ngrok 隧道

```powershell
cd "E:\1\+小批量定制化服务\shopify\1\theme_export__rt08kw-se-myshopify-com-horizon__02SEP2025-0602pm"
.\scripts\ngrok-dev.ps1
```

复制输出中的公网地址，例如：`https://a1b2c3d4.ngrok-free.app`

## 配置 Vercel

1. Vercel 项目 → **Settings** → **Environment Variables**
2. 新增或更新：

| Name | Value |
|---|---|
| `PALMETTO_SERVICE_URL` | `https://a1b2c3d4.ngrok-free.app` |

3. **Deployments** → 最新部署 → **Redeploy**（环境变量变更必须 Redeploy）

## 验证联调

```powershell
.\scripts\test-ngrok-palmetto.ps1 -NgrokUrl "https://a1b2c3d4.ngrok-free.app"
```

成功标志：

- 步骤 1–2：ngrok 直连 Palmetto OK
- 步骤 3：Vercel `analyze-step-features` GET 返回 `success: true`

## Shopify 端到端

1. 将更新后的 `assets/model-uploader.js` 部署到 Shopify 主题
2. 确保 `window.QUOTES_API_BASE` 指向 Vercel API
3. 上传 `.stp` 并提交询价
4. 在 Draft Order 的 customAttributes 中应看到：`孔数量`、`型腔数量`、`加工特征状态` 等

## 注意事项

- ngrok 免费版 URL **每次重启会变**，需更新 Vercel 并 Redeploy
- 联调期间 **电脑不能休眠**，Palmetto + ngrok 窗口保持打开
- 分析使用 Shopify CDN `fileUrl`，不经过 Base64，避免 413

## 相关文件

| 文件 | 说明 |
|---|---|
| `scripts/ngrok-dev.ps1` | 启动 ngrok |
| `scripts/test-ngrok-palmetto.ps1` | 联调自检 |
| `api/analyze-step-features.js` | Vercel 代理 |
| `assets/model-uploader.js` | 提交询价时调用特征分析 |
