# Authentication

Set up API keys to interact with Polymarket's CLOB API.

## Creating Credentials

```typescript
import { createCredentials, unwrapCredentials } from "@polybot/sdk";

const credentials = createCredentials({
	apiKey: "pk_xxx...",
	secret: "sk_xxx...",
	passphrase: "your-passphrase",
});

// Credentials are opaque and redact secrets when logged
// Output: [REDACTED]

// To access the underlying keys
const keys = unwrapCredentials(credentials);
// keys.apiKey, keys.secret, keys.passphrase
```

## Environment Variables

Store your credentials securely in `.env`:

```bash
# .env
POLYBOT_API_KEY=pk_xxx
POLYBOT_SECRET=sk_xxx
POLYBOT_PASSPHRASE=your-passphrase
```

## Loading from Environment

```typescript
import { createCredentials } from "@polybot/sdk";

const credentials = createCredentials({
	apiKey: process.env.POLYBOT_API_KEY!,
	secret: process.env.POLYBOT_SECRET!,
	passphrase: process.env.POLYBOT_PASSPHRASE!,
});
```

## Security Best Practices

- **Never commit secrets** — Add `.env` to `.gitignore`
- **Use secrets management** — Consider HashiCorp Vault, AWS Secrets Manager, or similar
- **Rotate keys regularly** — Generate new keys periodically
- **Use minimal permissions** — Only grant necessary access levels

## API Key Setup on Polymarket

1. Go to [Polymarket](https://polymarket.com)
2. Navigate to Settings → API Keys
3. Create a new API key with required permissions
4. Copy the key and secret (they won't be shown again)

## What's Next?

- [Configuration](/getting-started/configuration) — Full SDK configuration
- [Paper Trading](/getting-started/paper-trading) — Test without real funds
