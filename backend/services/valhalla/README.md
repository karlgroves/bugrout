# bugrout-valhalla

Remote Valhalla HTTP routing service for the BugRout mobile app. Tiles are baked
into the Docker image at build time — change the region by updating `PBF_URL`
and `REGION_NAME` in `fly.toml` and redeploying.

## Deploy

```bash
cd backend/services/valhalla
flyctl launch --no-deploy --copy-config --name bugrout-valhalla  # first time only
flyctl deploy
```

Health check: `curl https://bugrout-valhalla.fly.dev/status`

## Swap regions

1. Pick a PBF from <https://download.geofabrik.de/north-america/us/>
2. Update `[build.args]` in `fly.toml`
3. `flyctl deploy` — the builder downloads and recompiles tiles

Larger regions (California, Texas) need `memory = "2048mb"` or more.
