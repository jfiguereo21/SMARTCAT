# SmartCat

Control de maquinaria de FIPEC SRL: máquinas, conduces, corte del 25, facturas y cobros.

Hecho con Next.js, Supabase y Vercel.

## Para correrlo en tu computadora

1. Copia `.env.example` como `.env.local` y pega la llave pública de Supabase.
2. `npm install`
3. `npm run dev` y abre http://localhost:3000

## Módulos

1. Máquinas (hecho)
2. Conduces (hecho)
3. Combustible como gasto (hecho)
   - Acuerdos por máquina, cliente y lugar, en pesos o dólares (hecho)
   - Operadores: app instalable en el celular, reportan horas y conduces, todo pasa por aprobación del administrador (hecho)
4. Corte del 25 y factura
5. Pago al dueño de la 430IT
6. Cobros

La base de datos está en el proyecto SmartCat de Supabase. Para entrar, crea los usuarios en
Supabase > Authentication > Users.
