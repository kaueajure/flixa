"use client";
import { useState } from "react";
import { usePartyExtension } from "../lib/use-party-extension";
const STEPS = [
  ["Baixe e extraia", "Baixe o ZIP pelo botão, clique com o botão direito e extraia os arquivos. Guarde a pasta flixa-grupo no computador."],
  ["Abra as extensões", "No Chrome, abra o menu ⋮ → Extensões → Gerenciar extensões. Ou copie o endereço abaixo e cole na barra de endereços."],
  ["Ative o modo desenvolvedor", "Na página de extensões, ative “Modo do desenvolvedor”, no canto superior direito."],
  ["Carregue a pasta", "Clique em “Carregar sem compactação” e escolha a pasta flixa-grupo extraída, onde está o arquivo manifest.json. Não selecione o ZIP."],
  ["Conecte ao Flixa", "Volte ao site. Clique na peça de quebra-cabeça do Chrome → Flixa Grupo → Conectar ao Flixa. Permita acesso a este site. Você pode fixar a extensão pelo ícone de alfinete."],
  ["Crie a sala e envie o convite", "Abra um filme ou episódio, escolha o servidor e o áudio e inicie o vídeo. No botão Grupo do player, crie a sala e copie o convite. Todos precisam instalar e conectar a extensão, usar o mesmo servidor e clicar no play uma vez."],
];
export default function GroupExtensionGuide({ compact = false }: { compact?: boolean }) {
  const extension = usePartyExtension(); const [copyStatus, setCopyStatus] = useState("");
  async function copyAddress() {
    try { await navigator.clipboard.writeText("chrome://extensions"); setCopyStatus("Endereço copiado"); }
    catch { setCopyStatus("Selecione chrome://extensions e copie para a barra de endereços."); }
  }
  return <section className={`group-extension-guide ${compact ? "is-compact" : ""}`} aria-label="Instalar Flixa Grupo no Chrome">
    <div className="group-extension-top"><span className="group-extension-badge">EXTENSÃO PARA CHROME</span><span className={`group-extension-detected ${extension.installed ? "is-ready" : ""}`} role="status"><i />{extension.installed ? `Conectada · v${extension.version}` : "Ainda não conectada nesta aba"}</span></div>
    <div className="group-extension-intro"><div><h2>{compact ? "Instale o Flixa Grupo" : "Seu player. A experiência em grupo."}</h2><p>A extensão conecta os controles do vídeo à sala. Escolha a fonte que vocês vão usar, incluindo opções dubladas quando disponíveis no servidor.</p></div><a className="primary-action" href="/downloads/flixa-grupo.zip?v=1.0.0" download="flixa-grupo.zip"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></svg>Baixar extensão<small>v1.0.0 · arquivo ZIP</small></a></div>
    <ol className="group-extension-steps">{STEPS.map(([title, description], index) => <li key={title}><span className="group-extension-step-number">{String(index + 1).padStart(2, "0")}</span><div><h3>{title}</h3><p>{description}</p>{index === 1 ? <div className="group-extension-address"><code tabIndex={0}>chrome://extensions</code><button type="button" onClick={() => void copyAddress()}>Copiar endereço</button></div> : null}</div></li>)}</ol>
    {copyStatus ? <p role="status">{copyStatus}</p> : null}
    <p className="group-extension-note">Chrome para computador. Cada participante precisa da extensão. Ela mantém o player do fornecedor: não adiciona dublagem, não remove anúncios e não altera o sandbox. Se a transmissão não carregar, escolha outro servidor antes de criar a sala.</p>
    {!compact ? <details><summary>Atualizar ou remover a extensão</summary><p>Para atualizar, substitua os arquivos na mesma pasta, clique em Recarregar no cartão Flixa Grupo em chrome://extensions e recarregue o site. Para desinstalar, clique em Remover. Mantenha a pasta enquanto a extensão estiver instalada.</p></details> : null}
  </section>;
}
