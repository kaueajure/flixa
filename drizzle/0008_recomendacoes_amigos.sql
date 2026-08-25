CREATE TABLE IF NOT EXISTS `recomendacoes_amigos` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `remetente_id` INT NOT NULL,
  `destinatario_id` INT NOT NULL,
  `chave_titulo` VARCHAR(64) NOT NULL,
  `tmdb_id` VARCHAR(32) NULL,
  `imdb_id` VARCHAR(32) NULL,
  `tipo` ENUM('filme', 'serie') NOT NULL DEFAULT 'filme',
  `titulo` VARCHAR(255) NOT NULL,
  `poster` TEXT NULL,
  `backdrop` TEXT NULL,
  `ano` INT NULL,
  `visualizado_em` DATETIME NULL,
  `enviado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `recomendacoes_remetente_idx` (`remetente_id`, `enviado_em`),
  KEY `recomendacoes_destinatario_idx` (`destinatario_id`, `visualizado_em`, `enviado_em`),
  CONSTRAINT `recomendacoes_remetente_fk`
    FOREIGN KEY (`remetente_id`) REFERENCES `usuarios` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `recomendacoes_destinatario_fk`
    FOREIGN KEY (`destinatario_id`) REFERENCES `usuarios` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
