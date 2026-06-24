# Garage object storage (new-raxel)

Garage holds the canonical ledger journal files. The app treats local disk
(`DATA_DIR`) as an ephemeral cache.

## Deploy (Coolify, single node)

1. New Coolify service from image `dxflrs/garage:v1.0.1` (pin a tag).
2. Persistent volumes:
   - `/var/lib/garage/data`
   - `/var/lib/garage/meta`
3. Mount `deploy/garage/garage.toml` at `/etc/garage.toml` (fill secrets first:
   `openssl rand -hex 32` for `rpc_secret` and `admin_token`).
4. Expose **only** the S3 API port `3900` on Coolify's internal network to the
   app container. Do NOT publish it publicly (consistent with the locked-down
   admin-ports posture on this box).

## One-time provisioning (run in the Garage container)

```bash
# Assign the single node to the layout (replication factor 1).
NODE_ID=$(garage node id -q | cut -d@ -f1)
garage layout assign "$NODE_ID" -z dc1 -c 50G
garage layout apply --version 1

# Bucket + application key.
garage bucket create ledger
garage key create ledger-app           # prints Key ID + Secret — copy them
garage bucket allow --read --write ledger --key ledger-app
```

## App configuration

Set on the app (Coolify env):

```
STORAGE_BACKEND=s3
S3_ENDPOINT=http://<garage-internal-host>:3900
S3_REGION=garage
S3_BUCKET=ledger
S3_ACCESS_KEY_ID=<Key ID from `garage key create`>
S3_SECRET_ACCESS_KEY=<Secret from `garage key create`>
S3_FORCE_PATH_STYLE=true
```

## Smoke test

After deploy, sign in and add a transaction. Verify the object exists:

```bash
garage bucket info ledger        # object count > 0
```
