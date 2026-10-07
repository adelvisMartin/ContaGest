import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg, { type Client as PgClient } from 'pg';
import { isEphemeralDatabase } from '../backend/scripts/prisma-deploy-safe.mjs';

const { Client } = pg;
const rawUrl = String(process.env.DATABASE_URL || '').trim();

async function expectPgError(client: PgClient, sql: string, params: unknown[], pattern: RegExp) {
  await client.query('SAVEPOINT pricing_expected_error');
  try {
    await client.query(sql, params);
    assert.fail(`Expected PostgreSQL error ${pattern}`);
  } catch (error: any) {
    await client.query('ROLLBACK TO SAVEPOINT pricing_expected_error');
    assert.match(String(error?.message || error), pattern);
  } finally {
    await client.query('RELEASE SAVEPOINT pricing_expected_error');
  }
}

test('#856 PostgreSQL authority preserves legacy compatibility, tenant isolation and immutable finalized snapshots', { skip: !rawUrl }, async () => {
  assert.ok(isEphemeralDatabase(rawUrl), `UNSAFE_PRODUCTION_COMMAND:${new URL(rawUrl).pathname.replace(/^\//, '')}`);

  const client = new Client({ connectionString: rawUrl });
  await client.connect();
  await client.query('BEGIN');
  try {
    const tenantA = randomUUID();
    const tenantB = randomUUID();
    const productA = randomUUID();
    const productB = randomUUID();
    const run = randomUUID().slice(0, 8).toUpperCase();

    await client.query(
      'INSERT INTO "Tenant" ("id","rif","name") VALUES ($1,$2,$3),($4,$5,$6)',
      [tenantA,`J-V856-A-${run}`,`V856 A ${run}`,tenantB,`J-V856-B-${run}`,`V856 B ${run}`],
    );
    await client.query(
      'INSERT INTO "Product" ("id","tenantId","sku","name","price") VALUES ($1,$2,$3,$4,$5),($6,$7,$8,$9,$10)',
      [productA,tenantA,`V856-A-${run}`,'Producto A','11.50',productB,tenantB,`V856-B-${run}`,'Producto B','9.00'],
    );

    const legacy = await client.query(
      'SELECT b."code",e."amount"::text AS amount FROM "PriceEntry" e JOIN "PriceBook" b ON b."id"=e."priceBookId" WHERE e."tenantId"=$1 AND e."targetId"=$2 AND e."status"=\'active\'',
      [tenantA,productA],
    );
    assert.ok(legacy.rows.some((row) => row.code === 'LEGACY_PRODUCT' && row.amount === '11.50'));

    const bookA = randomUUID();
    const entryA = randomUUID();
    await client.query(
      'INSERT INTO "PriceBook" ("id","tenantId","code","name","currency","priceMode","priority","locationScope") VALUES ($1,$2,$3,$4,\'VES\',\'fixed\',500,\'global\')',
      [bookA,tenantA,`V856-${run}`,'Precio QA'],
    );
    await client.query(
      'INSERT INTO "PriceEntry" ("id","tenantId","priceBookId","targetType","targetId","amount","effectiveFrom") VALUES ($1,$2,$3,\'product\',$4,$5,TIMESTAMP \'2000-01-01 00:00:00\')',
      [entryA,tenantA,bookA,productA,'20.00'],
    );

    await expectPgError(
      client,
      'INSERT INTO "PriceEntry" ("id","tenantId","priceBookId","targetType","targetId","amount","effectiveFrom") VALUES ($1,$2,$3,\'product\',$4,$5,TIMESTAMP \'2000-01-01 00:00:00\')',
      [randomUUID(),tenantA,bookA,productB,'20.00'],
      /PRICE_PRODUCT_TENANT_MISMATCH/,
    );

    const issuedInvoice = randomUUID();
    const issuedLine = randomUUID();
    await client.query(
      'INSERT INTO "SalesInvoice" ("id","tenantId","number","fiscalPeriod","currency","exchangeRate","status") VALUES ($1,$2,$3,\'2099-01\',\'VES\',1,\'issued\')',
      [issuedInvoice,tenantA,`V856-I-${run}`],
    );
    await client.query(
      'INSERT INTO "SalesInvoiceLine" ("id","invoiceId","productId","description","quantity","unitPrice","taxRate","total") VALUES ($1,$2,$3,$4,1,$5,0,$5)',
      [issuedLine,issuedInvoice,productA,'Producto A','20.00'],
    );
    const snapshot = await client.query(
      'SELECT "priceBookId","priceEntryId","sourceAmount"::text AS "sourceAmount","finalUnitPrice"::text AS "finalUnitPrice","documentCurrency" FROM "SalesLinePriceSnapshot" WHERE "salesInvoiceLineId"=$1',
      [issuedLine],
    );
    assert.deepEqual(snapshot.rows[0],{
      priceBookId:bookA,
      priceEntryId:entryA,
      sourceAmount:'20.00',
      finalUnitPrice:'20.00',
      documentCurrency:'VES',
    });

    await expectPgError(client,'UPDATE "PriceEntry" SET "amount"=21.00 WHERE "id"=$1',[entryA],/USED_PRICE_ENTRY_IMMUTABLE/);

    const draftInvoice = randomUUID();
    const draftLine = randomUUID();
    await client.query(
      'INSERT INTO "SalesInvoice" ("id","tenantId","number","fiscalPeriod","currency","exchangeRate","status") VALUES ($1,$2,$3,\'2099-01\',\'VES\',1,\'draft\')',
      [draftInvoice,tenantA,`V856-D-${run}`],
    );
    await client.query(
      'INSERT INTO "SalesInvoiceLine" ("id","invoiceId","productId","description","quantity","unitPrice","taxRate","total") VALUES ($1,$2,$3,$4,1,$5,0,$5)',
      [draftLine,draftInvoice,productA,'Producto A draft','20.00'],
    );
    const draftSnapshots = await client.query(
      'SELECT count(*)::int AS count FROM "SalesLinePriceSnapshot" WHERE "salesInvoiceLineId"=$1',
      [draftLine],
    );
    assert.equal(draftSnapshots.rows[0].count,0,'draft lines must not become immutable historical snapshots');
    await client.query('DELETE FROM "SalesInvoice" WHERE "id"=$1',[draftInvoice]);

    const competingBook = randomUUID();
    await client.query(
      'INSERT INTO "PriceBook" ("id","tenantId","code","name","currency","priceMode","priority","locationScope") VALUES ($1,$2,$3,$4,\'VES\',\'fixed\',500,\'global\')',
      [competingBook,tenantA,`V856-TIE-${run}`,'Precio QA empate'],
    );
    await client.query(
      'INSERT INTO "PriceEntry" ("id","tenantId","priceBookId","targetType","targetId","amount","effectiveFrom") VALUES ($1,$2,$3,\'product\',$4,$5,TIMESTAMP \'2000-01-01 00:00:00\')',
      [randomUUID(),tenantA,competingBook,productA,'20.00'],
    );
    const ambiguousInvoice = randomUUID();
    await client.query(
      'INSERT INTO "SalesInvoice" ("id","tenantId","number","fiscalPeriod","currency","exchangeRate","status") VALUES ($1,$2,$3,\'2099-01\',\'VES\',1,\'issued\')',
      [ambiguousInvoice,tenantA,`V856-Amb-${run}`],
    );
    await expectPgError(
      client,
      'INSERT INTO "SalesInvoiceLine" ("id","invoiceId","productId","description","quantity","unitPrice","taxRate","total") VALUES ($1,$2,$3,$4,1,$5,0,$5)',
      [randomUUID(),ambiguousInvoice,productA,'Producto ambiguo','20.00'],
      /PRICE_AUTHORITY_AMBIGUOUS/,
    );
  } finally {
    await client.query('ROLLBACK').catch(()=>undefined);
    await client.end();
  }
});
