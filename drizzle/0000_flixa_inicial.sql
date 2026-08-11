-- Migration inicial do Flixa (MySQL / Hostinger)
-- Idioma: português-BR
-- Cria o banco completo para usuários, sessões, lista, histórico e progresso.

SET NAMES utf8mb4;
SET time_zone = "+00:00";

CREATE TABLE IF NOT EXISTS `usuarios` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `nome` VARCHAR(120) NOT NULL,
  `email` VARCHAR(190) NOT NULL,
  `senha` VARCHAR(255) NOT NULL,
  `administrador` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = administrador, 0 = usuário comum',
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `usuarios_email_unico` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sessoes` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `usuario_id` INT NOT NULL,
  `token` VARCHAR(128) NOT NULL,
  `expira_em` DATETIME NOT NULL,
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `sessoes_token_unico` (`token`),
  KEY `sessoes_usuario_idx` (`usuario_id`),
  CONSTRAINT `sessoes_usuario_fk`
    FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lista_titulos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `usuario_id` INT NOT NULL,
  `chave_titulo` VARCHAR(64) NOT NULL,
  `tmdb_id` VARCHAR(32) NULL,
  `imdb_id` VARCHAR(32) NULL,
  `tipo` ENUM('filme', 'serie') NOT NULL DEFAULT 'filme',
  `titulo` VARCHAR(255) NOT NULL,
  `poster` TEXT NULL,
  `backdrop` TEXT NULL,
  `ano` INT NULL,
  `dados_json` JSON NULL,
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `lista_usuario_titulo_unico` (`usuario_id`, `chave_titulo`),
  KEY `lista_usuario_idx` (`usuario_id`),
  CONSTRAINT `lista_usuario_fk`
    FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `historico_assistidos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `usuario_id` INT NOT NULL,
  `chave_titulo` VARCHAR(64) NOT NULL,
  `tmdb_id` VARCHAR(32) NULL,
  `imdb_id` VARCHAR(32) NULL,
  `tipo` ENUM('filme', 'serie') NOT NULL DEFAULT 'filme',
  `titulo` VARCHAR(255) NOT NULL,
  `poster` TEXT NULL,
  `backdrop` TEXT NULL,
  `ano` INT NULL,
  `dados_json` JSON NULL,
  `assistido_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `historico_usuario_titulo_unico` (`usuario_id`, `chave_titulo`),
  KEY `historico_usuario_idx` (`usuario_id`),
  CONSTRAINT `historico_usuario_fk`
    FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `progresso_reproducao` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `usuario_id` INT NOT NULL,
  `chave_titulo` VARCHAR(64) NOT NULL,
  `tmdb_id` VARCHAR(32) NULL,
  `tipo` ENUM('filme', 'serie') NOT NULL DEFAULT 'filme',
  `titulo` VARCHAR(255) NOT NULL,
  `poster` TEXT NULL,
  `progresso` DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT 'Percentual assistido (0 a 100)',
  `posicao_segundos` INT NOT NULL DEFAULT 0,
  `atualizado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `progresso_usuario_titulo_unico` (`usuario_id`, `chave_titulo`),
  KEY `progresso_usuario_idx` (`usuario_id`),
  CONSTRAINT `progresso_usuario_fk`
    FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
