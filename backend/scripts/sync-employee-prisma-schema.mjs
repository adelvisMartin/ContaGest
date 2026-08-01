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

writeFileSync(schemaPath, schema);
console.log('Prisma Employee sincronizado: department, hiredAt e índices tenant-scoped.');
