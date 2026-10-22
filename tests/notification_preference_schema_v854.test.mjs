import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const schema=readFileSync(new URL('../backend/prisma/schema.prisma',import.meta.url),'utf8');
const sql=readFileSync(new URL('../backend/prisma/migrations/20261022194000_issue_854_notification_preferences/migration.sql',import.meta.url),'utf8');
test('#854 server-owned self consent is in-app only; external provider consent not accepted',()=>{
  assert.match(sql,/"channel"='in_app'/);
  assert.match(sql,/authenticated-self-service/);
  assert.match(sql,/notification_pref_consent CHECK/);
});
test('#854 preference tenant FK, consent and quiet-hours constraints are explicit',()=>{
  assert.match(schema,/model NotificationChannelPreference \{/);
  assert.match(schema,/user\s+UserProfile @relation\(fields: \[tenantId, userId\]/);
  assert.match(sql,/"NotificationChannelPreference_tenantId_userId_channel_key" UNIQUE/);
  assert.match(sql,/FORCE ROW LEVEL SECURITY/);
  assert.match(sql,/notification_pref_quiet_hours CHECK/);
});
