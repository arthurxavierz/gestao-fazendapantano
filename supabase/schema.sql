-- Fazenda Pântano · banco do rebanho (versão da planilha v11)
-- Execute este arquivo inteiro no Supabase em SQL Editor > New query.
-- É idempotente: pode rodar de novo sem apagar nada. Depois, rode
-- supabase/rebanho-planilha.sql uma vez para carregar os 402 animais.
--
-- As regras de negócio estão descritas em docs/REGRAS-DA-PLANILHA.md.
-- As tabelas da versão anterior (animals, breeding_attempts...) não são
-- tocadas; o schema antigo está em supabase/legado/schema-v2.sql.

create extension if not exists "pgcrypto";

-- ============================================================
-- Contas
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  -- 'operador' lança no rebanho. 'administrador' também gerencia as contas.
  role text not null default 'operador' check (role in ('administrador', 'operador')),
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists email text;

-- Toda conta nova entra como operador.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email, 'operador')
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- security definer: consulta profiles dentro das políticas da própria profiles.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'administrador');
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.protect_last_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'administrador' and new.role <> 'administrador' then
    if (select count(*) from public.profiles where role = 'administrador') <= 1 then
      raise exception 'É preciso manter pelo menos um administrador no sistema.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_protect_last_admin on public.profiles;
create trigger profiles_protect_last_admin before update on public.profiles
for each row execute procedure public.protect_last_admin();

alter table public.profiles enable row level security;
drop policy if exists "profiles_read_self_or_admin" on public.profiles;
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_read_self_or_admin" on public.profiles
for select to authenticated using (auth.uid() = id or public.is_admin());
create policy "profiles_admin_update" on public.profiles
for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Autoria gravada pela sessão, nunca pelo navegador.
create or replace function public.rebanho_autoria()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by = auth.uid();
  else
    new.created_by = old.created_by;
  end if;
  return new;
end;
$$;

-- ============================================================
-- Rebanho (abas Geral, Machos e Fêmeas)
-- ============================================================
create table if not exists public.rebanho_animais (
  id uuid primary key default gen_random_uuid(),
  brinco text not null,
  sexo text check (sexo in ('M', 'F')),
  nascimento date,
  faixa text check (faixa in ('0 a 12', '13 a 24', '25 a 36', 'Acima de 36')),
  raca text,
  cor text,
  no_ima boolean,
  observacoes text,
  conferencia text,
  foto_url text,
  ordem integer,
  ciclo integer not null default 1 check (ciclo >= 1),
  avaliacao text,
  data_avaliacao date,
  peso numeric(8,2) check (peso is null or peso >= 0),
  saida text check (saida in ('Venda', 'Morte', 'Descarte')),
  data_saida date,
  bezerro_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
-- Brinco único entre os ativos: quem saiu libera o número para reutilizar.
create unique index if not exists rebanho_animais_brinco_ativo on public.rebanho_animais (lower(brinco)) where saida is null;
create index if not exists rebanho_animais_ordem on public.rebanho_animais (ordem);

-- Protocolos de IATF: até 3 por ciclo.
create table if not exists public.rebanho_protocolos (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references public.rebanho_animais(id) on delete cascade,
  ciclo integer not null check (ciclo >= 1),
  numero integer not null check (numero between 1 and 3),
  apta text check (apta in ('S', 'N')),
  motivo text,
  data_protocolo date,
  data_confirmacao date,
  resultado text check (resultado in ('Prenha', 'Vazia')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (animal_id, ciclo, numero)
);

-- Ciclos encerrados pelo parto (aba Protocolos anteriores).
create table if not exists public.rebanho_ciclos (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references public.rebanho_animais(id) on delete cascade,
  ciclo integer not null,
  data_parto date,
  bezerro_codigo text,
  encerrado_em date not null default current_date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.rebanho_bezerros (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  mae_id uuid not null references public.rebanho_animais(id) on delete cascade,
  nascimento date,
  sexo text check (sexo in ('M', 'F')),
  situacao text not null default 'Mamando'
    check (situacao in ('Mamando', 'Ficou na fazenda', 'Vendido', 'Morto', 'Descarte', 'Incorporado ao rebanho')),
  data_destino date,
  brinco_definitivo text,
  observacoes text,
  incorporado_em date,
  animal_id uuid references public.rebanho_animais(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.rebanho_animais drop constraint if exists rebanho_animais_bezerro_fk;
alter table public.rebanho_animais add constraint rebanho_animais_bezerro_fk
  foreign key (bezerro_id) references public.rebanho_bezerros(id) on delete set null;

-- Histórico de manejos (aba Manejos).
create table if not exists public.rebanho_manejos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  animal_id uuid references public.rebanho_animais(id) on delete cascade,
  bezerro_id uuid references public.rebanho_bezerros(id) on delete cascade,
  manejo text not null,
  produtos text,
  observacao text,
  status text not null default 'Feito' check (status in ('Feito', 'Pendente', 'Feito depois')),
  feito_em date,
  lote_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check ((animal_id is null) <> (bezerro_id is null))
);
create index if not exists rebanho_manejos_animal on public.rebanho_manejos (animal_id);
create index if not exists rebanho_manejos_bezerro on public.rebanho_manejos (bezerro_id);
create index if not exists rebanho_manejos_pendentes on public.rebanho_manejos (status) where status = 'Pendente';

-- Números de brinco liberados por saídas (aba Números disponíveis).
create table if not exists public.rebanho_numeros (
  id uuid primary key default gen_random_uuid(),
  numero text not null,
  animal_id uuid references public.rebanho_animais(id) on delete set null,
  liberado_em date not null default current_date,
  registro_antigo text,
  situacao text not null default 'Disponível' check (situacao in ('Disponível', 'Reutilizado', 'Baixa desfeita')),
  motivo text,
  reutilizado_em date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Consolidados do IMA digitados para comparação.
create table if not exists public.rebanho_ima (
  id uuid primary key default gen_random_uuid(),
  data_relatorio date,
  contagem jsonb not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Linhas lançadas do quadro de campo.
create table if not exists public.rebanho_quadro (
  id uuid primary key default gen_random_uuid(),
  data date,
  brinco text not null,
  codigo text not null,
  detalhe text,
  resultado text not null,
  ok boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Autoria e permissões
-- ============================================================
-- Toda a equipe autenticada lança no rebanho, como na planilha. Contas e
-- papéis continuam restritos ao administrador (tabela profiles).
do $$
declare t text;
begin
  foreach t in array array['rebanho_animais', 'rebanho_protocolos', 'rebanho_ciclos', 'rebanho_bezerros',
                           'rebanho_manejos', 'rebanho_numeros', 'rebanho_ima', 'rebanho_quadro']
  loop
    execute format('drop trigger if exists %1$s_autoria on public.%1$s', t);
    execute format('create trigger %1$s_autoria before insert or update on public.%1$s for each row execute procedure public.rebanho_autoria()', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('drop policy if exists "%1$s_equipe" on public.%1$s', t);
    execute format('create policy "%1$s_equipe" on public.%1$s for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ============================================================
-- Fotos
-- ============================================================
insert into storage.buckets (id, name, public)
values ('animal-photos', 'animal-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "animal_photos_public_read" on storage.objects;
drop policy if exists "animal_photos_authenticated_insert" on storage.objects;
drop policy if exists "animal_photos_authenticated_update" on storage.objects;
drop policy if exists "animal_photos_authenticated_delete" on storage.objects;
create policy "animal_photos_public_read" on storage.objects for select to public using (bucket_id = 'animal-photos');
create policy "animal_photos_authenticated_insert" on storage.objects for insert to authenticated with check (bucket_id = 'animal-photos');
create policy "animal_photos_authenticated_update" on storage.objects for update to authenticated using (bucket_id = 'animal-photos') with check (bucket_id = 'animal-photos');
create policy "animal_photos_authenticated_delete" on storage.objects for delete to authenticated using (bucket_id = 'animal-photos');

-- ============================================================
-- Primeiro administrador
-- ============================================================
-- Crie o usuário em Authentication > Users e rode UMA VEZ, trocando o e-mail:
--
--   update public.profiles set role = 'administrador' where email = 'seu-email@exemplo.com';
