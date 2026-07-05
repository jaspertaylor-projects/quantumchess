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

## One-time provisioning — first-timer walkthrough

Every step, in order. Total time ~1 hour, mostly waiting for AWS.
Everything happens at https://console.aws.amazon.com (sign in first).
Where a button label differs slightly from below, it's the closest one —
AWS renames things constantly, but the shape of each screen is stable.

Costs when done: EC2 ~$12-15/mo. Everything else is pennies (S3 storage,
Route 53 $0.50/zone/mo; CloudFront and ACM are effectively free at this
scale).

### Phase 0 — before you start (2 min)

- [X] Keep the repo PRIVATE (it's the product). The server gets read-only
      access via a deploy key, created in Phase 2 step 13a.
- [X] In the AWS console, note the region selector (top right). For
      everything EXCEPT the certificate, pick one region and stay in it —
      `us-east-1 (N. Virginia)` for everything is the simplest choice.

### Phase 1 — the certificate (5 min + a few min of waiting)

1. Console search bar (top) -> type `ACM` -> "Certificate Manager".
2. **Region check: top-right must say N. Virginia (us-east-1).**
   CloudFront only accepts certificates from us-east-1. This is the #1
   first-deploy gotcha.
3. Click **Request** -> "Request a public certificate" -> Next.
4. Fully qualified domain names — add BOTH:
   - `quantumchess.ninja`
   - `www.quantumchess.ninja`
5. Validation method: **DNS validation** (default). Click Request.
6. Open the new certificate (status "Pending validation") and click the
   **Create records in Route 53** button -> Create records. (This works
   because the domain's DNS zone is in this same account.)
7. Wait a few minutes; status flips to **Issued**. You can continue with
   Phase 2 while it validates.

### Phase 2 — the API server (20 min)

1. Search bar -> `EC2`. Click **Launch instance**.
2. Name: `qc-api`.
3. OS image: **Ubuntu**, "Ubuntu Server 24.04 LTS". Just below the image
   picker, set Architecture to **64-bit (Arm)** — required because t4g is
   an Arm (Graviton) instance. Gotcha #2.
4. Instance type: **t4g.small**.
5. Key pair: **Create new key pair** -> name `qc-api-key`, type ED25519,
   format `.pem` -> Create. The file downloads; you need it to SSH in.
   Move it somewhere safe and run: `chmod 400 ~/Downloads/qc-api-key.pem`
6. Network settings -> Edit:
   - "Allow SSH traffic from" -> **My IP**
   - Check **Allow HTTPS traffic from the internet**
   - Check **Allow HTTP traffic from the internet**
7. Storage: 20 GiB gp3.
8. Launch instance.
9. Give it a permanent IP: left sidebar -> **Elastic IPs** ->
   Allocate Elastic IP address -> Allocate. Then select it -> Actions ->
   **Associate Elastic IP address** -> pick the `qc-api` instance ->
   Associate. Write down this IP.
10. DNS for the API — do this BEFORE starting the server so its
    certificate can issue: search bar -> `Route 53` -> Hosted zones ->
    `quantumchess.ninja` -> **Create record**:
    - Record name: `api`
    - Type: A
    - Value: the Elastic IP
    - Create records.
11. SSH in (from your machine):
    ```bash
    ssh -i ~/Downloads/qc-api-key.pem ubuntu@api.quantumchess.ninja
    ```
    (If DNS hasn't propagated yet, use the Elastic IP instead of the
    hostname. Type `yes` at the fingerprint prompt.)
12. On the server, paste this whole block:
    ```bash
    sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
    sudo usermod -aG docker ubuntu
    exit
    ```
13. SSH back in (the group change needs a fresh login).

    13a. Give the box read-only repo access with a deploy key. On the
    SERVER:
    ```bash
    ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 -C "qc-api deploy key"
    cat ~/.ssh/id_ed25519.pub
    ```
    Copy the printed line. Then on GitHub: repo ->
    **Settings -> Deploy keys -> Add deploy key** -> title `qc-api`,
    paste the key, leave "Allow write access" UNCHECKED -> Add key.

    13b. Clone and start (back on the server):
    ```bash
    git clone git@github.com:jaspertaylor-projects/quantumchess.git
    # type "yes" at the github.com fingerprint prompt
    cd quantumchess/deploy/api
    docker compose -f docker-compose.prod.yml up -d --build
    ```
14. Verify from your own machine (Caddy needs ~30s to fetch its
    certificate the first time):
    ```bash
    curl -I https://api.quantumchess.ninja
    ```
    Any HTTP response (200/404/405) with no TLS error = the API box is
    live with valid HTTPS.

### Phase 3 — the site bucket (5 min)

1. Search bar -> `S3` -> **Create bucket**.
2. Bucket name: `quantumchess-ninja-site` (bucket names are global; if
   taken, add a suffix and remember it).
3. Leave EVERYTHING else at defaults — especially keep
   "Block all public access" CHECKED. CloudFront will read the bucket
   privately; the bucket itself is never public. Create bucket.

### Phase 4 — CloudFront (15 min)

1. Search bar -> `CloudFront` -> **Create distribution**.
2. Origin:
   - Origin domain: click the field and pick your bucket from the
     dropdown (`quantumchess-ninja-site.s3...`).
   - Origin access: **Origin access control settings (recommended)** ->
     Create new OAC -> Create. (After the distribution is created,
     CloudFront shows a banner prompting you to copy/apply the bucket
     policy — click **Copy policy** then the "Go to S3 bucket
     permissions" link, and paste it under Bucket policy -> Save. If the
     console offers to update the policy automatically, accept.)
   - If a wizard asks about WAF: "Do not enable security protections"
     (saves money; you can add later).
3. Default cache behavior: "Redirect HTTP to HTTPS". Leave the rest.
4. Settings section (still in the wizard, or edit under the General tab
   afterwards):
   - Alternate domain names (CNAMEs): add `quantumchess.ninja` and
     `www.quantumchess.ninja`.
   - Custom SSL certificate: pick the ACM certificate from Phase 1.
   - Default root object: `index.html`
5. Create distribution. It deploys for 5-15 minutes; meanwhile do the
   next three edits from the distribution's detail page:
6. **Origins tab** -> Create origin:
   - Origin domain: `api.quantumchess.ninja`
   - Protocol: HTTPS only. Create.
7. **Behaviors tab** -> Create behavior:
   - Path pattern: `/api/*`
   - Origin: the `api.quantumchess.ninja` origin
   - Viewer protocol policy: Redirect HTTP to HTTPS
   - Allowed HTTP methods: **GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE**
   - Cache policy: **CachingDisabled**
   - Origin request policy: **AllViewer**
   - Create. (WebSockets pass through automatically.)
8. **Error pages tab** -> Create custom error response, TWICE:
   - HTTP error code 403 -> Customize error response: Yes ->
     Response page path `/index.html`, HTTP response code 200.
   - Same again for 404.
   (This makes the single-page app load on any URL.)
9. Copy the **Distribution ID** (looks like `E2ABCDEF123456`) and the
   distribution domain (`dxxxx.cloudfront.net`) from the General tab.

### Phase 5 — point the domain at CloudFront (3 min)

Route 53 -> Hosted zones -> quantumchess.ninja -> Create record, TWICE:
1. Apex: leave Record name empty, type A, toggle **Alias** ON ->
   "Alias to CloudFront distribution" -> pick yours -> Create.
2. `www`: Record name `www`, type A, Alias ON -> same distribution.

### Phase 6 — deploy the frontend (10 min)

1. Create deploy credentials: search bar -> `IAM` -> Users ->
   **Create user** -> name `qc-deployer` -> (no console access) -> Next ->
   **Attach policies directly** -> check `AmazonS3FullAccess` and
   `CloudFrontFullAccess` -> Create user. Open the user -> Security
   credentials tab -> **Create access key** -> "Command Line Interface" ->
   create, and keep the page open (you need both values once).
2. On your dev machine, install the AWS CLI:
   ```bash
   curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
   cd /tmp && unzip -q awscliv2.zip && sudo ./aws/install
   aws --version
   ```
3. Configure it:
   ```bash
   aws configure
   # Access key ID:      (from step 1)
   # Secret access key:  (from step 1)
   # Default region:     us-east-1
   # Output format:      json
   ```
4. First deploy, from the repo root:
   ```bash
   QC_CF_DISTRIBUTION_ID=E3G9M8CYMWWNUF ./deploy/deploy-frontend.sh
   ```
   (If you used a different bucket name: also set QC_S3_BUCKET=<name>.)
5. Open **https://quantumchess.ninja** — you should be looking at your
   game, on the internet, with a padlock. Play a bot game. Open the
   console. Say hi to chess.com.

### If something doesn't work

- Site shows AccessDenied XML -> the S3 bucket policy from Phase 4 step 2
  didn't get applied; redo the Copy policy -> bucket permissions dance.
- Site loads but /api calls fail -> check the Behaviors tab order
  (`/api/*` must sit above `Default (*)`), and that
  `curl -I https://api.quantumchess.ninja` works directly.
- `api.quantumchess.ninja` TLS errors -> Caddy couldn't validate; confirm
  the Route 53 `api` A record points at the Elastic IP, then on the box:
  `docker compose -f docker-compose.prod.yml logs caddy`.
- Changed something and don't see it -> CloudFront caches; the deploy
  script invalidates `/index.html` automatically, but give it a minute.

## Each frontend release

```bash
QC_CF_DISTRIBUTION_ID=E3G9M8CYMWWNUF ./deploy/deploy-frontend.sh
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
