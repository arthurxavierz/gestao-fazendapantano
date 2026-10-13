-- Fazenda Pântano
-- Execute este arquivo no Supabase em SQL Editor > New query.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  -- 'operador' cuida do rebanho. 'administrador' faz o mesmo e ainda enxerga
  -- quem registrou cada informação, além de definir o papel das outras contas.
  role text not null default 'operador' check (role in ('administrador', 'operador')),
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;

create table if not exists public.animals (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  name text,
  photo_url text,
  sex text not null default 'nao_informado' check (sex in ('macho', 'femea', 'nao_informado')),
  breed text,
  -- Aparência da pelagem (branco, pintado, vermelho...). A IA acerta bem este campo;
  -- a raça em si continua sendo confirmada por uma pessoa.
  coat text,
  birth_date date,
  birth_date_approximate boolean not null default false,
  weight numeric(10,2),
  lot text,
  origin text,
  status text not null default 'normal' check (status in ('normal', 'observacao', 'doente', 'morto', 'vendido')),
  notes text,
  -- O que a IA sugeriu a partir da foto e quais sugestões o usuário aceitou.
  -- Serve para medir o acerto da leitura ao longo do tempo. Nunca é usado como
  -- fonte da verdade: os campos acima só recebem valor após confirmação humana.
  ai_analysis jsonb,
  -- Autoria. Preenchida por gatilho no banco, nunca pelo navegador.
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Garante as colunas novas em bancos criados antes destas versões.
-- O script pode ser executado quantas vezes for necessário.
alter table public.animals add column if not exists coat text;
alter table public.animals add column if not exists ai_analysis jsonb;
alter table public.animals add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.animals add column if not exists updated_by uuid references public.profiles(id) on delete set null;

create index if not exists animals_number_idx on public.animals(number);
create index if not exists animals_status_idx on public.animals(status);
create index if not exists animals_lot_idx on public.animals(lot);

create table if not exists public.occurrences (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references public.animals(id) on delete cascade,
  type text not null check (type in ('observacao', 'doenca', 'morte', 'recuperado', 'outro')),
  note text not null,
  photo_url text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists occurrences_animal_idx on public.occurrences(animal_id);
create index if not exists occurrences_created_at_idx on public.occurrences(created_at desc);

create table if not exists public.counts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  mode text not null check (mode in ('individual', 'quantity')),
  expected_total integer,
  total_counted integer not null default 0 check (total_counted >= 0),
  animal_numbers jsonb not null default '[]'::jsonb,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists counts_created_at_idx on public.counts(created_at desc);
create index if not exists animals_created_by_idx on public.animals(created_by);
create index if not exists occurrences_created_by_idx on public.occurrences(created_by);
create index if not exists counts_created_by_idx on public.counts(created_by);

-- Bancos criados antes desta versão apontavam a autoria para auth.users.
-- Reapontar para profiles permite listar o nome de quem registrou.
alter table public.occurrences drop constraint if exists occurrences_created_by_fkey;
alter table public.occurrences add constraint occurrences_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

alter table public.counts drop constraint if exists counts_created_by_fkey;
alter table public.counts add constraint counts_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

-- Toda conta nova entra como operador. A promoção a administrador é feita
-- depois, pela tela de Administração ou pelo SQL Editor.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.email,
    'operador'
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists animals_set_updated_at on public.animals;
create trigger animals_set_updated_at
before update on public.animals
for each row execute procedure public.set_updated_at();

-- ============================================================
-- Autoria dos registros
-- ============================================================
-- Quem registrou é determinado pela sessão autenticada, e não por um campo
-- enviado pelo navegador. Assim a rastreabilidade não pode ser forjada.
create or replace function public.set_actor()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    new.created_by = auth.uid();
  end if;
  if TG_TABLE_NAME = 'animals' then
    new.updated_by = auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists animals_set_actor on public.animals;
create trigger animals_set_actor
before insert or update on public.animals
for each row execute procedure public.set_actor();

drop trigger if exists occurrences_set_actor on public.occurrences;
create trigger occurrences_set_actor
before insert on public.occurrences
for each row execute procedure public.set_actor();

drop trigger if exists counts_set_actor on public.counts;
create trigger counts_set_actor
before insert on public.counts
for each row execute procedure public.set_actor();

-- ============================================================
-- Papel do usuário
-- ============================================================
-- security definer é obrigatório aqui: a função consulta profiles e é usada
-- dentro das políticas da própria tabela profiles. Sem isso haveria recursão.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'administrador'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- Impede que a fazenda fique sem nenhum administrador.
create or replace function public.protect_last_admin()
returns trigger
language plpgsql
security definer set search_path = public
as $$
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
create trigger profiles_protect_last_admin
before update on public.profiles
for each row execute procedure public.protect_last_admin();

alter table public.profiles enable row level security;
alter table public.animals enable row level security;
alter table public.occurrences enable row level security;
alter table public.counts enable row level security;

-- ============================================================
-- Políticas de acesso
-- ============================================================
-- Regra do sistema:
--   Operador      -> rebanho completo: consultar, cadastrar, editar, excluir,
--                    registrar ocorrências e contagens, gerar documentos.
--   Administrador -> tudo do operador, mais a lista de contas e a identificação
--                    de quem registrou cada informação.
--
-- A restrição de rastreabilidade não é apenas visual. O operador só enxerga a
-- própria linha em profiles, então nem consultando a API diretamente ele
-- consegue transformar um created_by em nome de pessoa.

drop policy if exists "profiles_read_own" on public.profiles;
drop policy if exists "profiles_read_self_or_admin" on public.profiles;
drop policy if exists "profiles_admin_update" on public.profiles;
drop policy if exists "animals_authenticated_all" on public.animals;
drop policy if exists "occurrences_authenticated_all" on public.occurrences;
drop policy if exists "counts_authenticated_all" on public.counts;

-- O operador lê somente a própria conta. O administrador lê a equipe inteira.
create policy "profiles_read_self_or_admin" on public.profiles
for select to authenticated using (auth.uid() = id or public.is_admin());

-- Somente administrador altera papéis. Não existe política de update para o
-- operador, justamente para que ninguém consiga se promover sozinho.
create policy "profiles_admin_update" on public.profiles
for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Rebanho e registros do dia a dia: liberados para toda a equipe autenticada.
create policy "animals_authenticated_all" on public.animals
for all to authenticated using (true) with check (true);

create policy "occurrences_authenticated_all" on public.occurrences
for all to authenticated using (true) with check (true);

create policy "counts_authenticated_all" on public.counts
for all to authenticated using (true) with check (true);

-- ============================================================
-- Primeiro administrador
-- ============================================================
-- Toda conta nasce como operador, inclusive a sua. Depois de criar o usuário
-- em Authentication > Users, rode a linha abaixo UMA VEZ trocando o e-mail.
-- A partir daí, os demais papéis podem ser definidos pela tela de Administração.
--
--   update public.profiles set role = 'administrador'
--   where email = 'seu-email@fazenda.com.br';

-- Cria o bucket público para fotos, caso ainda não exista.
insert into storage.buckets (id, name, public)
values ('animal-photos', 'animal-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "animal_photos_public_read" on storage.objects;
drop policy if exists "animal_photos_authenticated_insert" on storage.objects;
drop policy if exists "animal_photos_authenticated_update" on storage.objects;
drop policy if exists "animal_photos_authenticated_delete" on storage.objects;

create policy "animal_photos_public_read" on storage.objects
for select to public using (bucket_id = 'animal-photos');

create policy "animal_photos_authenticated_insert" on storage.objects
for insert to authenticated with check (bucket_id = 'animal-photos');

create policy "animal_photos_authenticated_update" on storage.objects
for update to authenticated using (bucket_id = 'animal-photos') with check (bucket_id = 'animal-photos');

create policy "animal_photos_authenticated_delete" on storage.objects
for delete to authenticated using (bucket_id = 'animal-photos');

-- ============================================================
-- Versão 2: reprodução, manejo sanitário, pesagens e compras
-- ============================================================
-- Tudo abaixo é idempotente: pode ser executado sobre um banco que já está em
-- produção. Nenhum dado existente é apagado; os animais antigos continuam
-- válidos e ganham colunas novas vazias.

-- Situações novas: 'descarte' (separado para abate) e 'abatido'.
alter table public.animals drop constraint if exists animals_status_check;
alter table public.animals add constraint animals_status_check
  check (status in ('normal', 'observacao', 'doente', 'descarte', 'morto', 'vendido', 'abatido'));

alter table public.occurrences drop constraint if exists occurrences_type_check;
alter table public.occurrences add constraint occurrences_type_check
  check (type in ('observacao', 'doenca', 'morte', 'recuperado', 'descarte', 'outro'));

-- Compras: todo animal comprado aponta para o lote em que chegou.
create table if not exists public.purchase_batches (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  supplier text,
  purchase_date date not null,
  quantity integer check (quantity is null or quantity >= 0),
  total_value numeric(14,2),
  avg_weight numeric(10,2),
  gta text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Origem e genealogia do animal.
alter table public.animals add column if not exists category text;
alter table public.animals add column if not exists origin_type text not null default 'nao_informado';
alter table public.animals add column if not exists mother_id uuid references public.animals(id) on delete set null;
alter table public.animals add column if not exists sire text;
alter table public.animals add column if not exists purchase_batch_id uuid references public.purchase_batches(id) on delete set null;
alter table public.animals add column if not exists entry_date date;
alter table public.animals add column if not exists exit_date date;
alter table public.animals add column if not exists exit_reason text;

alter table public.animals drop constraint if exists animals_category_check;
alter table public.animals add constraint animals_category_check
  check (category is null or category in ('bezerro', 'bezerra', 'garrote', 'novilha', 'vaca', 'touro', 'boi'));
alter table public.animals drop constraint if exists animals_origin_type_check;
alter table public.animals add constraint animals_origin_type_check
  check (origin_type in ('nascido', 'comprado', 'nao_informado'));

-- Cadastros antigos tinham a origem só em texto. Converte o que der.
update public.animals set origin_type = 'nascido'
  where origin_type = 'nao_informado' and origin ilike '%nasc%';
update public.animals set origin_type = 'comprado'
  where origin_type = 'nao_informado' and origin ilike '%compr%';

create index if not exists animals_mother_idx on public.animals(mother_id);
create index if not exists animals_batch_idx on public.animals(purchase_batch_id);

-- Modelos de protocolo reprodutivo (IATF, repasse com touro...).
create table if not exists public.repro_protocols (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  method text not null default 'iatf' check (method in ('iatf', 'ia', 'monta', 'te')),
  -- Lista de passos: [{ "day": 0, "title": "...", "kind": "aplicacao" }, ...]
  steps jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Cada tentativa de prenhez de uma matriz. A sequência de tentativas sem
-- sucesso é o que leva ao descarte, conforme a regra em farm_settings.
create table if not exists public.breeding_attempts (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references public.animals(id) on delete cascade,
  method text not null default 'iatf' check (method in ('iatf', 'ia', 'monta', 'te')),
  protocol_id uuid references public.repro_protocols(id) on delete set null,
  protocol_name text,
  -- Cópia dos passos no início, para o histórico não mudar se o modelo for editado.
  steps jsonb not null default '[]'::jsonb,
  steps_done jsonb not null default '[]'::jsonb,
  start_date date not null,
  insemination_date date,
  sire text,
  technician text,
  diagnosis_date date,
  result text not null default 'pendente' check (result in ('pendente', 'prenhe', 'vazia', 'aborto', 'parida')),
  expected_calving_date date,
  calving_date date,
  calf_id uuid references public.animals(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists breeding_attempts_animal_idx on public.breeding_attempts(animal_id);
create index if not exists breeding_attempts_result_idx on public.breeding_attempts(result);

-- Vacinas, vermífugos, medicamentos. Aplicação em lote = uma linha por animal.
create table if not exists public.health_events (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references public.animals(id) on delete cascade,
  kind text not null check (kind in ('vacina', 'vermifugo', 'carrapaticida', 'medicamento', 'exame', 'outro')),
  product text not null,
  dose text,
  applied_at date not null,
  next_due_date date,
  -- Fim da carência: o animal não deve ir para abate antes desta data.
  withdrawal_until date,
  product_batch text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists health_events_animal_idx on public.health_events(animal_id);
create index if not exists health_events_next_due_idx on public.health_events(next_due_date);

create table if not exists public.weighings (
  id uuid primary key default gen_random_uuid(),
  animal_id uuid not null references public.animals(id) on delete cascade,
  weighed_at date not null,
  weight numeric(10,2) not null check (weight > 0),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists weighings_animal_idx on public.weighings(animal_id, weighed_at);

-- Regras da fazenda. Uma única linha (id = 1).
create table if not exists public.farm_settings (
  id integer primary key default 1 check (id = 1),
  max_breeding_attempts integer not null default 4 check (max_breeding_attempts between 1 and 10),
  gestation_days integer not null default 290 check (gestation_days between 250 and 320),
  diagnosis_days integer not null default 30 check (diagnosis_days between 20 and 120),
  min_breeding_age_months integer not null default 14 check (min_breeding_age_months between 8 and 36),
  updated_at timestamptz not null default now()
);

insert into public.farm_settings (id) values (1) on conflict (id) do nothing;

-- Autoria por gatilho, como nas tabelas originais.
drop trigger if exists purchase_batches_set_actor on public.purchase_batches;
create trigger purchase_batches_set_actor before insert on public.purchase_batches
for each row execute procedure public.set_actor();

drop trigger if exists repro_protocols_set_actor on public.repro_protocols;
create trigger repro_protocols_set_actor before insert on public.repro_protocols
for each row execute procedure public.set_actor();

drop trigger if exists breeding_attempts_set_actor on public.breeding_attempts;
create trigger breeding_attempts_set_actor before insert on public.breeding_attempts
for each row execute procedure public.set_actor();

drop trigger if exists health_events_set_actor on public.health_events;
create trigger health_events_set_actor before insert on public.health_events
for each row execute procedure public.set_actor();

drop trigger if exists weighings_set_actor on public.weighings;
create trigger weighings_set_actor before insert on public.weighings
for each row execute procedure public.set_actor();

drop trigger if exists farm_settings_set_updated_at on public.farm_settings;
create trigger farm_settings_set_updated_at before update on public.farm_settings
for each row execute procedure public.set_updated_at();

alter table public.purchase_batches enable row level security;
alter table public.repro_protocols enable row level security;
alter table public.breeding_attempts enable row level security;
alter table public.health_events enable row level security;
alter table public.weighings enable row level security;
alter table public.farm_settings enable row level security;

-- Manejo do dia a dia: liberado para toda a equipe autenticada.
drop policy if exists "purchase_batches_authenticated_all" on public.purchase_batches;
create policy "purchase_batches_authenticated_all" on public.purchase_batches
for all to authenticated using (true) with check (true);

drop policy if exists "repro_protocols_authenticated_all" on public.repro_protocols;
create policy "repro_protocols_authenticated_all" on public.repro_protocols
for all to authenticated using (true) with check (true);

drop policy if exists "breeding_attempts_authenticated_all" on public.breeding_attempts;
create policy "breeding_attempts_authenticated_all" on public.breeding_attempts
for all to authenticated using (true) with check (true);

drop policy if exists "health_events_authenticated_all" on public.health_events;
create policy "health_events_authenticated_all" on public.health_events
for all to authenticated using (true) with check (true);

drop policy if exists "weighings_authenticated_all" on public.weighings;
create policy "weighings_authenticated_all" on public.weighings
for all to authenticated using (true) with check (true);

-- As regras da fazenda todos leem, mas só o administrador altera.
drop policy if exists "farm_settings_read" on public.farm_settings;
create policy "farm_settings_read" on public.farm_settings
for select to authenticated using (true);

drop policy if exists "farm_settings_admin_write" on public.farm_settings;
create policy "farm_settings_admin_write" on public.farm_settings
for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Protocolos iniciais, só se a tabela estiver vazia. Ajuste com o veterinário.
insert into public.repro_protocols (name, description, method, steps)
select * from (values
  (
    'IATF 3 manejos (D0 · D8 · D10)',
    'Protocolo padrão com implante de progesterona. Ajuste produtos e doses com o veterinário.',
    'iatf',
    '[{"day":0,"kind":"aplicacao","title":"Implante de progesterona + Benzoato de estradiol"},{"day":8,"kind":"retirada","title":"Retirada do implante + PGF2α + eCG + Cipionato"},{"day":10,"kind":"inseminacao","title":"Inseminação em tempo fixo"},{"day":40,"kind":"diagnostico","title":"Diagnóstico de gestação"}]'::jsonb
  ),
  (
    'IATF 4 manejos (D0 · D7 · D9 · D11)',
    'Variação com prostaglandina antecipada, comum em novilhas.',
    'iatf',
    '[{"day":0,"kind":"aplicacao","title":"Implante de progesterona + Benzoato de estradiol"},{"day":7,"kind":"aplicacao","title":"Aplicação de PGF2α"},{"day":9,"kind":"retirada","title":"Retirada do implante + eCG + Cipionato de estradiol"},{"day":11,"kind":"inseminacao","title":"Inseminação em tempo fixo"},{"day":41,"kind":"diagnostico","title":"Diagnóstico de gestação"}]'::jsonb
  ),
  (
    'Repasse com touro',
    'Monta natural para as vazias depois da IATF.',
    'monta',
    '[{"day":0,"kind":"inseminacao","title":"Entrada do touro no lote"},{"day":60,"kind":"retirada","title":"Retirada do touro"},{"day":90,"kind":"diagnostico","title":"Diagnóstico de gestação"}]'::jsonb
  )
) as seed(name, description, method, steps)
where not exists (select 1 from public.repro_protocols);
