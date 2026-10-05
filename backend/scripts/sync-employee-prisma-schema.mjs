import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, '../prisma/schema.prisma');
let schema = readFileSync(schemaPath, 'utf8');

const fieldsBefore = `  idNumber    String
  fullName    String
  position    String
  salary      Decimal @default(0) @db.Decimal(18,2)
  active      Boolean @default(true)`;

const fieldsAfter = `  idNumber    String
  fullName    String
  position    String
  department  String?
  hiredAt     DateTime?
  salary      Decimal @default(0) @db.Decimal(18,2)
  active      Boolean @default(true)`;

if (!schema.includes('department  String?')) {
  if (!schema.includes(fieldsBefore)) {
    throw new Error('No se encontró el bloque Employee esperado para sincronizar department/hiredAt.');
  }
  schema = schema.replace(fieldsBefore, fieldsAfter);
}

if (!schema.includes('@@index([tenantId, department])')) {
  const indexBefore = `  @@unique([tenantId, idNumber])
}

model PayrollPeriod`;
  const indexAfter = `  @@unique([tenantId, idNumber])
  @@index([tenantId, department])
  @@index([tenantId, hiredAt])
}

model PayrollPeriod`;
  if (!schema.includes(indexBefore)) {
    throw new Error('No se encontró el cierre del modelo Employee para agregar índices.');
  }
  schema = schema.replace(indexBefore, indexAfter);
}

const pricingModels = `

// #856 canonical commercial pricing projection. Database triggers add stronger
// cross-tenant/history invariants that Prisma relations alone cannot express.
model PriceBook {
  id            String   @id
  tenantId      String
  code          String
  name          String
  currency      String
  priceMode     String   @default("fixed")
  status        String   @default("active")
  priority      Int      @default(100)
  locationScope String   @default("global")
  isSystem      Boolean  @default(false)
  version       Int      @default(1)
  createdBy     String?
  updatedBy     String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @default(now())

  @@unique([tenantId, code])
  @@unique([tenantId, id])
  @@index([tenantId, status, currency, priority])
}

model PriceBookLocation {
  tenantId          String
  priceBookId       String
  businessLocationId String
  createdAt         DateTime @default(now())

  @@id([priceBookId, businessLocationId])
  @@index([tenantId, businessLocationId])
}

model PriceEntry {
  id            String   @id
  tenantId      String
  priceBookId   String
  targetType    String
  targetId      String
  amount        Decimal  @db.Decimal(18,2)
  effectiveFrom DateTime @default(now())
  effectiveTo   DateTime?
  status        String   @default("active")
  version       Int      @default(1)
  createdBy     String?
  createdAt     DateTime @default(now())

  @@index([tenantId, targetType, targetId, status, effectiveFrom])
  @@index([priceBookId, targetType, targetId, effectiveFrom])
}

model SalesLinePriceSnapshot {
  salesInvoiceLineId String   @id
  tenantId           String
  priceBookId        String
  priceEntryId       String
  priceBookVersion   Int
  priceEntryVersion  Int
  priceMode          String
  sourceAmount       Decimal  @db.Decimal(18,2)
  sourceCurrency     String
  finalUnitPrice     Decimal  @db.Decimal(18,2)
  documentCurrency   String
  fxRate             Decimal? @db.Decimal(18,4)
  fxRateDate         DateTime?
  fxRateSource       String?
  businessLocationId String?
  resolvedAt         DateTime @default(now())

  @@index([tenantId, priceBookId, resolvedAt])
}
`;

if (!schema.includes('model PriceBook {')) {
  schema = `${schema.trimEnd()}${pricingModels}\n`;
}

writeFileSync(schemaPath, schema);
console.log('Prisma sincronizado: Employee + #856 Price Book authority.');
