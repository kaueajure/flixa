CREATE TABLE IF NOT EXISTS `presencas_usuarios` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `usuario_id` INT NOT NULL,
  `cliente_id` VARCHAR(64) NOT NULL,
  `area` VARCHAR(32) NOT NULL DEFAULT 'app',
  `ativa` TINYINT NOT NULL DEFAULT 1,
  `ultima_atividade_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `presencas_usuario_cliente_unico` (`usuario_id`,`cliente_id`),
  KEY `presencas_online_idx` (`ativa`,`ultima_atividade_em`),
  KEY `presencas_usuario_idx` (`usuario_id`,`ultima_atividade_em`),
  CONSTRAINT `presencas_usuario_fk` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE
);
