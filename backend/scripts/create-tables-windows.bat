@echo off
echo ===============================================
echo ContaGest-VE - Crear tablas en Supabase
echo ===============================================
echo.
if not exist ".env" (
  echo ERROR: No existe backend\.env
  echo Copia .env.example como .env y coloca tu password de Supabase.
  exit /b 1
)
echo Instalando dependencias...
call npm install
if errorlevel 1 exit /b 1

echo Verificando variables y conexion...
call npm run db:doctor
if errorlevel 1 exit /b 1

echo Validando schema Prisma...
call npx prisma validate
if errorlevel 1 exit /b 1

echo Generando cliente Prisma...
call npx prisma generate
if errorlevel 1 exit /b 1

echo Creando tablas con migraciones...
call npx prisma migrate deploy
if errorlevel 1 exit /b 1

echo Cargando datos iniciales...
call npx prisma db seed
if errorlevel 1 exit /b 1

echo Aplicando RLS...
call npm run db:rls
if errorlevel 1 exit /b 1

echo.
echo LISTO: tablas creadas en Supabase.
echo Ahora ejecuta: npm run dev
