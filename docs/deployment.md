# Deployment

## Local Development

```bash
# Start Juno local environment
juno dev

# Deploy to local satellite
juno deploy --local
```

## Production Deployment

1. **Create Juno Satellite** at <https://console.juno.build>

2. **Update juno.config.ts**

```typescript
export default defineConfig({
  satellite: {
    ids: {
      production: "your-production-satellite-id",
    },
    source: "dist",
    predeploy: ["bun run build"],
  },
});
```

1. **Set environment variables**

```bash
# .env.production
VITE_SATELLITE_ID=your-production-satellite-id
VITE_IC_HOST=https://ic0.app
```

1. **Deploy**

```bash
bun run build
juno deploy
```
