"use client";

import { useEffect, useId, useRef } from "react";

export function PlayerSandboxToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`player-sandbox-toggle ${enabled ? "is-protected" : "is-unprotected"}`}
      aria-label={enabled ? "Sandbox ativo. Desativar proteção" : "Sandbox desativado. Ativar proteção"}
      aria-pressed={enabled}
      onClick={onToggle}
    >
      <span className="player-sandbox-shield" aria-hidden="true"><i /></span>
      <span className="player-sandbox-copy"><small>Sandbox</small><strong>{enabled ? "Protegido" : "Desativado"}</strong></span>
    </button>
  );
}

export function PlayerSandboxWarning({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="player-sandbox-warning-backdrop"
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
    >
      <div className="player-sandbox-warning">
        <span className="player-sandbox-warning-badge">IMPORTANTE</span>
        <span className="player-sandbox-warning-icon" aria-hidden="true">!</span>
        <h2 id={titleId}>Desativar a proteção do player?</h2>
        <p id={descriptionId}>
          Sem o sandbox, o servidor externo poderá abrir novas abas, popups, sobrepor a tela e exibir anúncios sem o controle do Flixa.
        </p>
        <div className="player-sandbox-risk-list" aria-label="Riscos ao desativar o sandbox">
          <span>Conteúdo adulto</span><span>Nudez e pornografia</span><span>Propagandas e golpes</span>
        </div>
        <strong className="player-sandbox-disclaimer">
          O Flixa não controla nem se responsabiliza pelo conteúdo exibido por esses provedores quando a proteção estiver desativada.
        </strong>
        <div className="player-sandbox-warning-actions">
          <button type="button" className="player-sandbox-cancel" autoFocus onClick={onCancel}>Manter proteção</button>
          <button type="button" className="player-sandbox-confirm" onClick={onConfirm}>Entendo os riscos, desativar</button>
        </div>
      </div>
    </dialog>
  );
}

export function PlayerSandboxNotice({ onEnable }: { onEnable: () => void }) {
  return (
    <aside className="player-sandbox-live-warning" role="alert">
      <span aria-hidden="true">!</span>
      <p><strong>IMPORTANTE · SANDBOX DESATIVADO</strong><small>Este provedor pode exibir anúncios, nudez, pornografia, golpes e abrir novas guias.</small></p>
      <button type="button" onClick={onEnable}>Ativar proteção</button>
    </aside>
  );
}
