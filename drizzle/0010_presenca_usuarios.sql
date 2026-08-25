-- Presença real: uma sessão só aparece online enquanto envia heartbeat.
ALTER TABLE `sessoes`
  ADD COLUMN `ultima_atividade_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `criado_em`,
  ADD KEY `sessoes_presenca_idx` (`usuario_id`, `ultima_atividade_em`);
