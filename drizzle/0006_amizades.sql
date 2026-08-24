CREATE TABLE IF NOT EXISTS `amizades` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `usuario_a_id` INT NOT NULL,
  `usuario_b_id` INT NOT NULL,
  `solicitante_id` INT NOT NULL,
  `status` ENUM('pendente', 'aceita') NOT NULL DEFAULT 'pendente',
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `atualizado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `amizades_par_unico` (`usuario_a_id`, `usuario_b_id`),
  KEY `amizades_usuario_a_idx` (`usuario_a_id`),
  KEY `amizades_usuario_b_idx` (`usuario_b_id`),
  KEY `amizades_status_idx` (`status`),
  CONSTRAINT `amizades_usuario_a_fk` FOREIGN KEY (`usuario_a_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `amizades_usuario_b_fk` FOREIGN KEY (`usuario_b_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `amizades_solicitante_fk` FOREIGN KEY (`solicitante_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
