-- =====================================================================
-- Sobra Zero · Squad Lilás
-- Migration 20260106000000_admin_enum.sql — valor 'admin' no enum
-- ---------------------------------------------------------------------
-- Arquivo separado DE PROPÓSITO: o Postgres (erro 55P04) não deixa usar
-- um rótulo novo de enum na mesma transação em que ele foi criado.
-- Este arquivo commita o rótulo; o próximo (…0001) usa.
-- =====================================================================

alter type public.user_type add value if not exists 'admin';

comment on type public.user_type is
  'Perfil do usuário. admin flutua entre os 3 papéis via linhas de vínculo nas 3 tabelas de detalhe.';
