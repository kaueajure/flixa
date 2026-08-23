-- Preserva o diagnóstico completo de cada teste e devolve ao administrador
-- o controle de habilitar ou desabilitar qualquer provedor.
ALTER TABLE `servidores_player`
  MODIFY COLUMN `ultimo_status` ENUM('unknown', 'online', 'degraded', 'offline') NOT NULL DEFAULT 'unknown',
  ADD COLUMN `ultimo_diagnostico` JSON NULL AFTER `ultima_mensagem`;

UPDATE `servidores_player`
SET `habilitado` = 1,
    `desabilitado_ate` = NULL,
    `atualizado_em` = CURRENT_TIMESTAMP;
