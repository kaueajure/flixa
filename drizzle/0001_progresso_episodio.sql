-- Progresso de séries: temporada/episódio assistidos
ALTER TABLE `progresso_reproducao`
  ADD COLUMN `temporada` INT NULL AFTER `posicao_segundos`,
  ADD COLUMN `episodio` INT NULL AFTER `temporada`;
