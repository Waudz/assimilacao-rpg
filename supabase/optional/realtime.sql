-- OPCIONAL e MANUAL — NÃO faz parte das migrations.
-- Adiciona assimilacao.characters à publicação do Realtime. A publicação `supabase_realtime` é compartilhada
-- com o Rastreador D&D; este comando apenas ACRESCENTA uma tabela (não altera as existentes), mas só deve ser
-- executado por quem audita o projeto, depois de conferir a publicação atual:
--   select * from pg_publication_tables where pubname = 'supabase_realtime';
-- Sem isto o app continua funcionando: o Assimilador atualiza por consulta a cada 15 s.
alter publication supabase_realtime add table assimilacao.characters;
