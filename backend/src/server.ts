import { createApp } from './app.js';
import { env } from './config/env.js';
import { warnIfRuntimeDatabaseUrlLooksWrong } from './config/dbRuntimeGuard.js';

warnIfRuntimeDatabaseUrlLooksWrong();
const app = createApp();
app.listen(env.PORT, () => {
  console.log(`ContaGest-VE API v10.1 running on http://localhost:${env.PORT}`);
});
