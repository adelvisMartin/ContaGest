#!/usr/bin/env bash
set -euo pipefail

echo "==============================================="
echo "ContaGest-VE - Crear tablas en Supabase"
echo "==============================================="

if [ ! -f ".env" ]; then
  echo "ERROR: No existe backend/.env"
  echo "Copia .env.example como .env y coloca tu password de Supabase."
  exit 1
fi

echo "Instalando dependencias fijadas..."
npm install

echo "Verificando variables y conexión..."
npm run db:doctor

echo "Validando schema Prisma..."
npx prisma validate

echo "Generando cliente Prisma..."
npx prisma generate

echo "Creando tablas con migraciones..."
npx prisma migrate deploy

echo "Cargando datos iniciales..."
npx prisma db seed

echo "Aplicando RLS..."
npm run db:rls

echo "LISTO: tablas creadas en Supabase."
echo "Ahora ejecuta: npm run dev"
