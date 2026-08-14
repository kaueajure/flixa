const facts = [
  {
    number: "01",
    title: "Um nome que nasceu na fronteira",
    text: "“Border” aponta para as regiões de fronteira entre Inglaterra, Escócia e País de Gales, onde esses cães provaram seu valor conduzindo rebanhos em colinas e montanhas.",
  },
  {
    number: "02",
    title: "O olhar também é ferramenta",
    text: "O famoso “herding eye” é o olhar intenso usado para influenciar o movimento das ovelhas. Ele trabalha junto da aproximação baixa, silenciosa e muito controlada.",
  },
  {
    number: "03",
    title: "Inteligência precisa de ocupação",
    text: "É uma raça naturalmente ativa, responsiva e criada para trabalhar. Passeio é importante, mas treino, faro, brincadeiras com regras e tarefas mentais também fazem parte de uma rotina equilibrada.",
  },
  {
    number: "04",
    title: "Nem todo Border Collie é preto e branco",
    text: "Preto e branco é a imagem mais conhecida, mas há muitas cores registradas, incluindo tricolor, chocolate, vermelho, azul e merle. Saúde e temperamento importam mais do que a cor.",
  },
  {
    number: "05",
    title: "Chaser aprendeu 1.022 nomes",
    text: "Em pesquisa controlada, a Border Collie Chaser aprendeu nomes próprios de 1.022 objetos. É um caso individual extraordinário — não uma promessa automática para todos os cães da raça.",
  },
  {
    number: "06",
    title: "Criação responsável inclui exames",
    text: "Entidades cinófilas recomendam triagem ocular e testes genéticos específicos para a raça. Cruzamentos merle com merle elevam riscos de problemas auditivos e visuais e devem ser evitados.",
  },
];

const sources = [
  {
    label: "Royal Kennel Club — perfil e saúde da raça",
    href: "https://www.royalkennelclub.com/search/breeds-a-to-z/breeds/pastoral/border-collie/",
  },
  {
    label: "American Kennel Club — história e o “herding eye”",
    href: "https://www.akc.org/expert-advice/lifestyle/fun-facts-border-collie/",
  },
  {
    label: "PLOS ONE — estudos de aprendizagem de palavras em cães",
    href: "https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0049382",
  },
];

export default function BorderCollieForum() {
  return (
    <main className="bc-forum">
      <header className="bc-header">
        <a className="bc-wordmark" href="#inicio" aria-label="Caderno Collie — início">
          Caderno <span>Collie</span>
        </a>
        <nav aria-label="Seções do fórum">
          <a href="#dossie">Dossiê</a>
          <a href="#curiosidades">Curiosidades</a>
          <a href="#fontes">Fontes</a>
        </nav>
        <span className="bc-issue">Edição 01 · Campo &amp; companhia</span>
      </header>

      <section className="bc-hero" id="inicio" aria-labelledby="bc-title">
        <div className="bc-hero-copy">
          <p className="bc-kicker">Fórum documental independente</p>
          <h1 id="bc-title">Um cão que lê<br />o movimento.</h1>
          <p className="bc-deck">
            Border Collies não nasceram para parecer inteligentes diante de uma câmera. Eles foram
            selecionados para tomar decisões, responder a sinais distantes e mover rebanhos com precisão.
          </p>
          <div className="bc-byline">
            <span>Pesquisa e curadoria</span>
            <strong>Equipe Caderno Collie</strong>
          </div>
        </div>

        <figure className="bc-cover">
          <img
            src="https://images.unsplash.com/photo-1610380403826-5f7173e9b421?auto=format&fit=crop&w=1400&q=86"
            alt="Retrato atento de um Border Collie preto e branco"
          />
          <figcaption>
            <span>Nosso cão em foco</span>
            <a href="/login" aria-label="Abrir o perfil de Philm e entrar">
              Philm
            </a>
            <small>Foto: Unsplash</small>
          </figcaption>
        </figure>
      </section>

      <section className="bc-intro" id="dossie" aria-labelledby="bc-dossie-title">
        <p className="bc-section-number">Dossiê / 01</p>
        <div>
          <h2 id="bc-dossie-title">Antes da fama, havia trabalho.</h2>
          <p className="bc-dropcap">
            A raça se desenvolveu nas regiões rurais britânicas para pastorear ovelhas em terrenos difíceis.
            Velocidade, resistência e capacidade de cooperar a distância eram qualidades práticas, não truques.
            Até hoje, a postura baixa e o olhar fixo revelam essa história funcional.
          </p>
        </div>
        <aside>
          <span>Perfil da raça</span>
          <dl>
            <div><dt>Grupo</dt><dd>Pastoreio</dd></div>
            <div><dt>Porte</dt><dd>Médio</dd></div>
            <div><dt>Vocação</dt><dd>Trabalho cooperativo</dd></div>
            <div><dt>Pelagem</dt><dd>Dupla e resistente</dd></div>
          </dl>
        </aside>
      </section>

      <section className="bc-facts" id="curiosidades" aria-labelledby="bc-facts-title">
        <div className="bc-section-head">
          <p>Notas verificadas</p>
          <h2 id="bc-facts-title">Seis fatos para entender a raça além do mito.</h2>
        </div>
        <div className="bc-fact-grid">
          {facts.map((fact) => (
            <article className="bc-fact" key={fact.number}>
              <span>{fact.number}</span>
              <h3>{fact.title}</h3>
              <p>{fact.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bc-thread" aria-labelledby="bc-thread-title">
        <div className="bc-thread-title">
          <span>Discussão em destaque</span>
          <h2 id="bc-thread-title">“Cansar o corpo basta?”</h2>
        </div>
        <div className="bc-posts">
          <article>
            <div className="bc-avatar" aria-hidden="true">M</div>
            <div>
              <header><strong>Marina Alves</strong><span>Educadora canina · 09:14</span></header>
              <p>Não. Atividade física sem pausa e sem raciocínio pode criar apenas um atleta cada vez mais resistente. Alternar treino curto, farejamento, descanso e previsibilidade costuma ser mais saudável.</p>
            </div>
          </article>
          <article>
            <div className="bc-avatar bc-avatar--green" aria-hidden="true">R</div>
            <div>
              <header><strong>Rafael Nunes</strong><span>Tutor · 10:02</span></header>
              <p>A maior mudança aqui veio quando trocamos parte da corrida por procura de objetos e exercícios simples de autocontrole. Ele termina mais tranquilo, não só exausto.</p>
            </div>
          </article>
        </div>
        <p className="bc-note">Relatos ilustrativos para debate; orientação individual deve ser feita por médico-veterinário ou profissional de comportamento qualificado.</p>
      </section>

      <section className="bc-sources" id="fontes" aria-labelledby="bc-sources-title">
        <div>
          <p className="bc-kicker">Transparência editorial</p>
          <h2 id="bc-sources-title">Fontes para continuar lendo.</h2>
        </div>
        <ol>
          {sources.map((source, index) => (
            <li key={source.href}>
              <span>0{index + 1}</span>
              <a href={source.href} target="_blank" rel="noreferrer">{source.label}</a>
            </li>
          ))}
        </ol>
      </section>

      <footer className="bc-footer">
        <span>Caderno Collie © 2026</span>
        <p>Conhecimento responsável começa pela curiosidade.</p>
        <a href="#inicio">Voltar ao topo ↑</a>
      </footer>
    </main>
  );
}
