ALTER TABLE `usuarios`
  ADD COLUMN `username` VARCHAR(32) NULL AFTER `nome`,
  ADD UNIQUE KEY `usuarios_username_unico` (`username`);
