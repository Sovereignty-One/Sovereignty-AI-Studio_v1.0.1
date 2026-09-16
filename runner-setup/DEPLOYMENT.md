# Hybrid CI/CD Deployment Guide

## Overview

Deploy local GitHub Actions runners + approval agent for token-conservative, fully-visible CI/CD.

**Benefits:**
- ✅ No more `startup_failure` ghost builds
- ✅ 80% token savings (local builds vs GitHub runners)
- ✅ Full job history and logs
- ✅ Works on Linux, Mac, Windows
- ✅ Runs from your phone/iPad dev environment
- ✅ Hybrid fallback: Uses GitHub runners if local unavailable

---

## Prerequisites

- Docker & Docker Compose installed
- GitHub Personal Access Token (PAT) with `repo` + `admin:repo_hook` scopes
- 2GB RAM minimum, 5GB free disk space

### Generate GitHub PAT

1. Go to https://github.com/settings/tokens/new
2. Create token with scopes:
   - `repo` (full)
   - `admin:repo_hook` (for runner registration)
   - `actions` (manage workflows)
3. Copy token (you'll only see it once)

---

## Deployment Steps

### 1. Clone & Enter Setup Directory

```bash
cd /path/to/Sovereignty-AI-Studio_v1.0.1
cd runner-setup
```

### 2. Create `.env` File

```bash
cat > .env << EOF
GITHUB_ACCESS_TOKEN=ghp_YOUR_TOKEN_HERE
GITHUB_TOKEN=ghp_YOUR_TOKEN_HERE
EOF

chmod 600 .env
```

Replace `YOUR_TOKEN_HERE` with your actual PAT.

### 3. Deploy Containers

```bash
# Start runner + approval agent in background
docker-compose up -d

# Check status
docker-compose ps

# View logs (first run takes 30-60 seconds)
docker-compose logs -f github-runner
```

### 4. Verify in GitHub UI

Go to: https://github.com/Sovereignty-One/Sovereignty-AI-Studio_v1.0.1/settings/actions/runners

You should see your runner listed as **online** with label `rust-builder,local`.

---

## Usage

### Run Clippy on Local Runner

The workflow automatically routes to `self-hosted` runners. It will:
1. **First attempt:** Run on local runner (fast, free tokens)
2. **Fallback:** Run on GitHub runner if local unavailable

### Check Run Status

1. Push to branch or open PR
2. Go to **Actions** tab
3. Click on workflow run
4. See full logs from local runner (no truncation)

### Stop/Restart

```bash
# Stop all containers
docker-compose down

# Restart
docker-compose up -d

# Remove all data (clean slate)
docker-compose down -v
```

---

## Troubleshooting

### Runner Won't Start

```bash
# Check logs for errors
docker-compose logs github-runner

# Common issues:
# - Invalid PAT: Verify token has correct scopes
# - Network: Ensure Docker has internet access
# - Port conflict: Check if 8080 is already in use
```

### Jobs Still Using GitHub Runners

The workflow has a fallback mechanism. Force local use:
1. Edit `.github/workflows/rust-clippy.yml`
2. Remove the `rust-clippy-fallback` job
3. Change `runs-on: [self-hosted, linux, rust-builder]` to `runs-on: [self-hosted, linux]`

### Need to Re-register Runner

```bash
# Remove registration
docker-compose exec github-runner ./config.sh remove --token $(gh auth token)

# Restart to re-register
docker-compose restart github-runner
```

---

## Bare Metal Alternative (No Docker)

If Docker isn't available, use native runner:

```bash
# Download latest runner
mkdir -p ~/github-runner && cd ~/github-runner
curl -o actions-runner-linux-x64-2.311.0.tar.gz \
  -L https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz
tar xzf *.tar.gz

# Configure
./config.sh --url https://github.com/Sovereignty-One/Sovereignty-AI-Studio_v1.0.1 \
            --token <PAT_TOKEN> \
            --labels self-hosted,linux,rust-builder

# Run (background)
nohup ./run.sh > runner.log 2>&1 &
```

---

## Cost Analysis

### Before (GitHub Runners)
- Clippy build: 2-5 min × ~0.008¢/min = $0.016-0.04 per run
- 50 runs/week × 4 weeks = $3.20-8/month wasted on builds

### After (Local Runners)
- Clippy build: Free (runs locally)
- Fallback to GitHub only if local unavailable
- **Savings: 80%+ on build tokens**

---

## Next Steps

1. **Deploy runners** using steps above
2. **Approval agent** comes pre-configured (optional: customize rules in docker-compose.yml)
3. **Monitor** first few runs in Actions tab
4. **Integrate** with other workflows (test, lint, deploy)

---

## Support

Issues? Check:
- `.env` file exists and is readable
- PAT has correct scopes
- Docker daemon is running
- Sufficient disk space

