## Node.js Development Standards

Reference: https://nodejs.org/docs/latest/api/documentation.html

### Core Modules Used in This Project

- **http/https**: underlying transport (via Express 5)
- **crypto**: session secret generation, password hashing support
- **path**: file path resolution (use `node:path` prefix import)
- **fs/promises**: async file I/O where needed
- **url**: ESM-compatible `import.meta.url` / `import.meta.dirname`
- **events**: EventEmitter patterns for server internals

### Import Style

Always use the `node:` protocol prefix for built-in modules:

```typescript
import path from "node:path";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
```

This project uses ESM (`"type": "module"` in package.json). CommonJS require() is not available.

### Async Patterns

- Prefer async/await over callbacks or raw Promises.
- Use `node:fs/promises` instead of the callback-based `node:fs` API.
- Never block the event loop with synchronous I/O in request handlers.

### Error Handling

- Wrap async route handlers in try/catch or use Express 5's native async error propagation.
- Pass errors to `next(err)` for centralized error middleware.
- Use structured error objects (include `status` and `message` fields).

### Security (Node.js layer)

- SESSION_SECRET must be loaded from environment, never hardcoded.
- Use `node:crypto` `randomBytes` for any token generation.
- Set `NODE_ENV=production` in production; this enables secure cookie flags.

### Process Management

- Read config from `process.env` via dotenv at startup.
- Listen on `process.env.PORT ?? 5000`; cPanel injects PORT automatically.
- Gracefully handle SIGTERM: close HTTP server before exiting.
