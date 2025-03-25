# @awe/common

Shared utilities and bootstrap logic for the AWE monorepo.

## Installation
```bash
npm install
npm run build
```

## Usage
```typescript
import { runBootstrap } from '@awe/common';
import { MyModule } from './my.module';

runBootstrap(MyModule, {
  port: 3000,
  swaggerEnabled: true,
});
```

## Features
- **Environment variable loading**
- **Security** (Helmet, CORS)
- **Performance** (Compression)
- **Logging** (Morgan)
- **Swagger documentation**
- **Graceful shutdown**

## Build Instructions
```bash
cd D:/PROJECTS/AWE/AWE-SERVER/packages/common
npm run build
```
- Check the `dist/` folder for compiled files (`index.js`, `index.d.ts`, etc.).

## Integrating with the Monorepo

1. **Update the root `package.json`** to recognize the package:
   ```json
   {
     "workspaces": [
       "apps/*",
       "packages/*"
     ]
   }
   ```

2. **Link it to the apps** (e.g., `apps/auth/package.json`):
   ```json
   {
     "dependencies": {
       "@awe/common": "0.0.1"
     }
   }
   ```

3. Run `npm install` from the root directory to symlink `@awe/common`.

---

## Final Steps

1. **Lint and Format**:
   ```bash
   npm run lint
   npm run format
   ```

2. **Update App Usage**:
   Example for `apps/auth/src/main.ts`:
   ```typescript
   import { runBootstrap } from '@awe/common';
   import { AuthModule } from './auth.module';

   runBootstrap(AuthModule, {
     port: 3000,
     swaggerEnabled: true,
     beforeStart: async (app) => {
       console.log('Auth app initializing...');
     },
   });
   ```

3. **Test**:
   - Start an app:
     ```bash
     cd apps/auth
     npm run start
     ```
   - Verify Swagger at: [http://localhost:3000/api-docs](http://localhost:3000/api-docs).
