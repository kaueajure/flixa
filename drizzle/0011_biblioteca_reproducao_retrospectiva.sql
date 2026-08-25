ALTER TABLE `lista_titulos`
  ADD COLUMN `estado` ENUM('quero_assistir','assistindo','concluido','abandonado') NOT NULL DEFAULT 'quero_assistir' AFTER `dados_json`,
  ADD COLUMN `favorito` TINYINT NOT NULL DEFAULT 0 AFTER `estado`,
  ADD COLUMN `nao_e_para_mim` TINYINT NOT NULL DEFAULT 0 AFTER `favorito`,
  ADD COLUMN `atualizado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `criado_em`;

ALTER TABLE `progresso_reproducao`
  ADD COLUMN `estado_reproducao` ENUM('aberto','reproduzindo','pausado','concluido') NOT NULL DEFAULT 'aberto' AFTER `episodio`,
  ADD COLUMN `fonte_progresso` ENUM('real','estimado') NOT NULL DEFAULT 'estimado' AFTER `estado_reproducao`,
  ADD COLUMN `duracao_segundos` INT NULL AFTER `fonte_progresso`,
  ADD COLUMN `iniciado_em` DATETIME NULL AFTER `duracao_segundos`,
  ADD COLUMN `concluido_em` DATETIME NULL AFTER `iniciado_em`;

CREATE TABLE IF NOT EXISTS `lista_colecoes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `usuario_id` INT NOT NULL,
  `nome` VARCHAR(60) NOT NULL,
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `lista_colecoes_usuario_nome_unico` (`usuario_id`,`nome`),
  KEY `lista_colecoes_usuario_idx` (`usuario_id`),
  CONSTRAINT `lista_colecoes_usuario_fk` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `lista_colecao_itens` (
  `colecao_id` INT NOT NULL,
  `titulo_id` INT NOT NULL,
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `lista_colecao_item_unico` (`colecao_id`,`titulo_id`),
  KEY `lista_colecao_itens_titulo_idx` (`titulo_id`),
  CONSTRAINT `lista_colecao_itens_colecao_fk` FOREIGN KEY (`colecao_id`) REFERENCES `lista_colecoes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `lista_colecao_itens_titulo_fk` FOREIGN KEY (`titulo_id`) REFERENCES `lista_titulos` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `episodios_assistidos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `usuario_id` INT NOT NULL,
  `chave_titulo` VARCHAR(64) NOT NULL,
  `temporada` INT NOT NULL,
  `episodio` INT NOT NULL,
  `assistido_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `episodios_usuario_titulo_unico` (`usuario_id`,`chave_titulo`,`temporada`,`episodio`),
  KEY `episodios_usuario_idx` (`usuario_id`,`chave_titulo`),
  CONSTRAINT `episodios_usuario_fk` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `sessoes_visualizacao` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `usuario_id` INT NOT NULL,
  `sessao_chave` VARCHAR(80) NOT NULL,
  `chave_titulo` VARCHAR(64) NOT NULL,
  `titulo` VARCHAR(255) NOT NULL,
  `tipo` ENUM('filme','serie') NOT NULL,
  `ano` INT NULL,
  `generos_json` JSON NULL,
  `segundos_assistidos` INT NOT NULL DEFAULT 0,
  `fonte_progresso` ENUM('real','estimado') NOT NULL DEFAULT 'estimado',
  `concluido` TINYINT NOT NULL DEFAULT 0,
  `iniciado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sessoes_visualizacao_chave_unica` (`usuario_id`,`sessao_chave`),
  KEY `sessoes_visualizacao_periodo_idx` (`usuario_id`,`iniciado_em`),
  KEY `sessoes_visualizacao_titulo_idx` (`usuario_id`,`chave_titulo`),
  CONSTRAINT `sessoes_visualizacao_usuario_fk` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `descobertas_roleta` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `usuario_id` INT NOT NULL,
  `chave_titulo` VARCHAR(64) NOT NULL,
  `titulo` VARCHAR(255) NOT NULL,
  `poster` TEXT NULL,
  `genero` VARCHAR(80) NULL,
  `escolhido_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `descobertas_roleta_usuario_idx` (`usuario_id`,`escolhido_em`),
  CONSTRAINT `descobertas_roleta_usuario_fk` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
);
