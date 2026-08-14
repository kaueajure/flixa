CREATE TABLE IF NOT EXISTS `servidores_player` (
  `servidor_id` VARCHAR(64) NOT NULL,
  `habilitado` TINYINT(1) NOT NULL DEFAULT 1,
  `desabilitado_ate` DATETIME NULL,
  `ultimo_status` ENUM('unknown', 'online', 'offline') NOT NULL DEFAULT 'unknown',
  `ultimo_http_status` INT NULL,
  `ultima_latencia_ms` INT NULL,
  `ultima_mensagem` VARCHAR(500) NULL,
  `ultimo_teste_em` DATETIME NULL,
  `atualizado_por` INT NULL,
  `atualizado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`servidor_id`),
  KEY `servidores_habilitado_idx` (`habilitado`),
  KEY `servidores_status_idx` (`ultimo_status`),
  CONSTRAINT `servidores_atualizado_por_fk`
    FOREIGN KEY (`atualizado_por`) REFERENCES `usuarios` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
