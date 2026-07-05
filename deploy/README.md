# Deploying quantumchess.ninja

Target shape (built for a viral burst without babysitting):

- Frontend: S3 + CloudFront at `quantumchess.ninja`. Bot/local games run
  100% in the browser, so a traffic spike only ever hits the CDN.
- API: ONE small instance (t4g.small class) at `api.quantumchess.ninja`
  running the FastAPI relay behind Caddy (auto-HTTPS). Only online 1v1
  play touches it. In-memory state -> exactly one instance, no more.
- CloudFront routes `/api/*` to the API origin, so the frontend keeps its
  relative URLs and there is no CORS anywhere.
- Supabase (accounts) and SES (auth email) are managed separately.

## One-time provisioning (AWS console or CLI)

1. ACM certificate (region us-east-1, required by CloudFront) for
   `quantumchess.ninja` + `www.quantumchess.ninja`, DNS-validated via
   Route 53 (one click, since the zone is in the same account).
2. S3 bucket (private) for the site, e.g. `quantumchess-ninja-site`.
3. CloudFront distribution:
   - Default origin: the S3 bucket with Origin Access Control.
   - Second origin: `api.quantumchess.ninja` (HTTPS).
   - Behavior `/api/*` -> API origin: caching disabled
     (CachingDisabled managed policy), all HTTP methods, forward all
     headers/cookies/query (AllViewer origin request policy). WebSockets
     pass through automatically.
   - Default root object `index.html`; custom error response mapping
     403/404 -> `/index.html` 200 (SPA routing).
   - Alternate domain names: `quantumchess.ninja`, `www.quantumchess.ninja`
     with the ACM cert.
4. EC2 instance (t4g.small, Ubuntu 24.04, 20GB) with an Elastic IP and a
   security group allowing 80/443 (and 22 from your IP):
   ```bash
   sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
   sudo usermod -aG docker ubuntu && newgrp docker
   git clone https://github.com/jaspertaylor-projects/quantumchess.git
   cd quantumchess/deploy/api
   docker compose -f docker-compose.prod.yml up -d --build
   ```
5. Route 53 records in the quantumchess.ninja zone:
   - `A` (alias) apex -> CloudFront distribution
   - `A` (alias) `www` -> CloudFront distribution
   - `A` `api` -> the Elastic IP
   (Create the `api` record BEFORE starting Caddy so Let's Encrypt can
   validate.)

## Each frontend release

```bash
QC_CF_DISTRIBUTION_ID=EXXXXXXXXXXXXX ./deploy/deploy-frontend.sh
```

## Each backend release

```bash
ssh ubuntu@api.quantumchess.ninja \
  'cd quantumchess && git pull && cd deploy/api && docker compose -f docker-compose.prod.yml up -d --build'
```

## Capacity notes (the honest math)

- 10K games/day vs bots = zero backend load. CloudFront absorbs the spike.
- If ALL 10K were online 1v1: peak of a few hundred concurrent WebSockets,
  tiny JSON payloads. One 2GB box handles thousands. The bottleneck you'd
  actually hit first is Supabase auth email throughput -> custom SMTP (SES)
  before launch, already on the TODO list.
- Do NOT scale the API horizontally without adding shared state (Redis);
  the relay keeps rooms in process memory.
