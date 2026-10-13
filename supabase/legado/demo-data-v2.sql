-- Dados opcionais para teste. Execute depois de schema.sql.
insert into public.animals (number, sex, breed, coat, birth_date, weight, lot, origin, status, notes)
values
  ('142', 'macho', 'Nelore', 'branco', '2025-05-12', 412, 'Curral 2', 'Nascido na fazenda', 'observacao', 'Leve dificuldade ao caminhar.'),
  ('087', 'femea', 'Cruzamento', 'pintado', '2025-03-22', 386, 'Lote Norte', 'Comprado', 'doente', 'Menor apetite observado pela manhã.'),
  ('214', 'macho', 'Nelore', 'branco acinzentado', '2025-09-02', 338, 'Curral 1', 'Nascido na fazenda', 'normal', null),
  ('031', 'macho', 'Nelore', 'branco', '2024-11-18', 478, 'Lote Sul', 'Comprado', 'normal', null)
on conflict (number) do nothing;
