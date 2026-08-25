CREATE TABLE IF NOT EXISTS `recuperacoes_senha` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `usuario_id` INT NOT NULL,
  `token_hash` VARCHAR(64) NOT NULL,
  `expira_em` DATETIME NOT NULL,
  `usado_em` DATETIME NULL,
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `recuperacoes_senha_token_unico` (`token_hash`),
  KEY `recuperacoes_senha_usuario_idx` (`usuario_id`),
  KEY `recuperacoes_senha_expiracao_idx` (`expira_em`),
  CONSTRAINT `recuperacoes_senha_usuario_fk`
    FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
