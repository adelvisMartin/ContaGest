# ContaGest ERP

Proyecto web ERP/CRM para operación, ventas, inventario, POS, fiscal, bancos, nómina, contabilidad y reportes.

## Estructura

```txt
frontend/   Aplicación web Vite
backend/    API Node/TypeScript + Prisma
supabase/   SQL base para Supabase
```

## Variables de entorno

Copia los archivos de ejemplo y completa tus claves reales localmente o en el proveedor de despliegue:

```bash
cp frontend/.env.example frontend/.env
cp backend/.env.example backend/.env
```

Nunca subas `.env` a GitHub.

## Local

Backend:

```bash
cd backend
npm install
npx prisma generate
npm run seed
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

URLs locales:

```txt
Frontend: http://localhost:8080
Backend:  http://localhost:3030/api/v1
```

## Usuario administrador local

```txt
RIF: 00000000
Correo: admin@erp.local
Contraseña: Adm1n$2026
```

Cambia esta contraseña antes de usar el sistema en producción.

## Despliegue recomendado

- Frontend: Vercel.
- Backend: Render, Railway, Fly.io o VPS Node.
- Base de datos: Supabase PostgreSQL.

Este paquete no incluye `.env`, reportes QA, capturas renderizadas, agentes ni documentación interna de desarrollo.
