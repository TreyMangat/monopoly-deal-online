# Migration: Render Free Tier → Fly.io

**Date**: 2026-04-11
**Reason**: Render free tier silently kills WebSocket connections after 5-15 min of low traffic. Fly.io's free/low-cost tier doesn't have this issue. See `INVESTIGATION_RECONNECT.md` for full analysis.

**Expected cost**: ~$2-3/month (Fly.io charges for always-on machines; shared-cpu-1x with 512MB is ~$3/mo)

**Risk**: Zero — Render config is preserved as fallback. Both can run simultaneously during transition.

---

## Prerequisites

- Node.js 18+ and npm installed (you already have this)
- A credit/debit card (Fly requires one even for low-cost plans)

---

## Step-by-Step

### 1. Install flyctl

```bash
# macOS
brew install flyctl

# Windows (PowerShell)
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"

# Linux
curl -L https://fly.io/install.sh | sh
```

### 2. Sign up / Log in

```bash
fly auth signup    # First time — opens browser
# OR
fly auth login     # Already have account
```

### 3. Create the Fly app (uses our fly.toml)

```bash
cd ~/Desktop/monopoly-deal-online
fly launch --no-deploy --copy-config
```

When prompted:
- App name: `monopoly-deal-online` (or pick a unique name if taken)
- Region: `sea` (Seattle) is pre-configured — confirm or change
- Don't add databases or other resources

### 4. Deploy

```bash
fly deploy
```

This builds the Docker image remotely and deploys. First deploy takes 2-3 minutes.

### 5. Test the new URL

Your app will be at: `https://monopoly-deal-online.fly.dev` (or your chosen app name)

Test checklist:
- [ ] Open the URL in a browser — landing page loads
- [ ] Create a room, join from another device/tab
- [ ] Play a full game with a bot
- [ ] Verify WebSocket stays connected for 10+ minutes without drops
- [ ] Test reconnect by toggling airplane mode briefly
- [ ] Check `/health` endpoint returns `{"status":"ok",...}`

### 6. Set up auto-deploy from GitHub

Generate a deploy token:
```bash
fly tokens create deploy -x 999999h
```

Add it to your GitHub repo:
1. Go to `github.com/TreyMangat/monopoly-deal-online/settings/secrets/actions`
2. Click "New repository secret"
3. Name: `FLY_API_TOKEN`
4. Value: paste the token from step above
5. Save

Now every push to `main` will auto-deploy via `.github/workflows/fly-deploy.yml`.

### 7. (Optional) Add a custom domain

```bash
fly certs create yourdomain.com
```

Then add a CNAME record pointing `yourdomain.com` → `monopoly-deal-online.fly.dev` in your DNS provider.

### 8. Verify auto-deploy

Push a small change (e.g., bump a comment) and check:
```bash
fly status          # Shows deployment status
fly logs --tail     # Watch server logs live
```

### 9. Update iOS client

The iOS app has a hardcoded default server URL in:
- `ios/MonopolyDeal/Views/CreateGameView.swift` line 11
- `ios/MonopolyDeal/Views/JoinGameView.swift` line 12

Change `wss://monopoly-deal-online.onrender.com/ws` to your Fly.io URL:
```swift
@State private var serverURL = "wss://monopoly-deal-online.fly.dev/ws"
```

The web client auto-detects the host via `location.host` — no changes needed.

### 10. Transition period

After 1 week of stable Fly usage:
- **Optionally** suspend the Render service in the Render dashboard (don't delete — keeps the URL reserved)
- The `render.yaml` file stays in the repo as a fallback

---

## Useful Fly commands

```bash
fly status              # App overview
fly logs --tail         # Live server logs
fly ssh console         # SSH into the running machine
fly scale show          # Current machine specs
fly scale count 1       # Ensure exactly 1 machine
fly deploy              # Manual deploy
fly restart             # Restart without redeploying
fly open                # Open app URL in browser
```

---

## Rollback to Render

If anything goes wrong:
1. The Render service is still configured via `render.yaml`
2. Push to main still triggers Render auto-deploy (if Render service is active)
3. Just reactivate the Render service in their dashboard
