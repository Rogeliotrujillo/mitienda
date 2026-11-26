-- Esquema SQL para Mi tienda (Mercado Público de Penonomé) en Supabase
-- Copia y pega este código completo en el SQL Editor de tu proyecto Supabase y presiona "Run".

create extension if not exists pgcrypto;

-- 1. Usuarios registrados en la aplicación
create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text not null,
  store_name text not null default 'Mercado Público de Penonomé',
  password_salt text not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  constraint app_users_username_len check (char_length(username) between 3 and 64),
  constraint app_users_display_name_len check (char_length(display_name) between 2 and 60),
  constraint app_users_store_name_len check (char_length(store_name) <= 80)
);

-- 2. Estado de inicialización del puesto por usuario
create table if not exists public.user_store_meta (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  initialized boolean not null default false,
  updated_at timestamptz not null default now()
);

-- 3. Productos en inventario por usuario
create table if not exists public.products (
  id text not null,
  user_id uuid not null references public.app_users(id) on delete cascade,
  name text not null,
  unit text not null,
  quantity numeric(12, 2) not null default 0 check (quantity >= 0),
  min_stock numeric(12, 2) not null default 5 check (min_stock >= 0),
  price_per_unit numeric(12, 2) not null default 0 check (price_per_unit >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists idx_products_user_id
  on public.products (user_id);

-- 4. Historial de ventas y entradas por usuario
create table if not exists public.movements (
  id text not null,
  user_id uuid not null references public.app_users(id) on delete cascade,
  type text not null check (type in ('sale', 'entry')),
  product_id text not null,
  product_name text not null,
  quantity numeric(12, 2) not null check (quantity > 0),
  unit text not null,
  amount_balboas numeric(12, 2) not null default 0 check (amount_balboas >= 0),
  timestamp timestamptz not null default now(),
  source text not null check (source in ('manual', 'voice')),
  primary key (user_id, id)
);

create index if not exists idx_movements_user_timestamp
  on public.movements (user_id, timestamp desc);

-- 5. Seguridad: activar RLS (el backend usa SUPABASE_SERVICE_ROLE_KEY en el servidor
--    y bloquea el acceso público directo desde el navegador con la llave anon).
alter table public.app_users enable row level security;
alter table public.user_store_meta enable row level security;
alter table public.products enable row level security;
alter table public.movements enable row level security;
