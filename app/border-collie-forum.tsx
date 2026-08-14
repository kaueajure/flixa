const dogs = [
  { name: "Amora", age: "4 anos", coat: "Preto e branco", topic: "Farejamento e enriquecimento" },
  { name: "Bento", age: "6 anos", coat: "Tricolor", topic: "Rotina em apartamento" },
  { name: "Chaser", age: "Caso histórico", coat: "Preto e branco", topic: "Cognição e 1.022 objetos" },
  { name: "Gaia", age: "3 anos", coat: "Chocolate e branco", topic: "Primeiros passos no agility" },
  { name: "Luna", age: "8 anos", coat: "Azul merle", topic: "Cuidados com cães idosos" },
  { name: "Nino", age: "2 anos", coat: "Vermelho e branco", topic: "Autocontrole e descanso" },
  { name: "Philp", age: "5 anos", coat: "Preto e branco", topic: "Trabalho de pastoreio" },
  { name: "Zeca", age: "7 anos", coat: "Preto tricolor", topic: "Obediência e sinais à distância" },
];

const references = [
  {
    label: "Royal Kennel Club — Border Collie: perfil, atividade e saúde",
    href: "https://www.royalkennelclub.com/search/breeds-a-to-z/breeds/pastoral/border-collie/",
  },
  {
    label: "American Kennel Club — história e curiosidades da raça",
    href: "https://www.akc.org/expert-advice/lifestyle/fun-facts-border-collie/",
  },
  {
    label: "PLOS ONE — aprendizagem de palavras em cães",
    href: "https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0049382",
  },
];

export default function BorderCollieForum() {
  return (
    <main className="wiki-forum">
      <header className="wiki-topbar">
        <a className="wiki-logo" href="#inicio" aria-label="Colliepédia — página inicial">
          <span aria-hidden="true">C</span>
          <span><strong>Colliepédia</strong><small>o fórum livre sobre Border Collies</small></span>
        </a>
        <form className="wiki-search" role="search" onSubmit={(event) => event.preventDefault()}>
          <label className="sr-only" htmlFor="wiki-search-input">Pesquisar no fórum</label>
          <input id="wiki-search-input" type="search" placeholder="Pesquisar na Colliepédia" />
          <button type="submit">Pesquisar</button>
        </form>
        <nav aria-label="Links pessoais">
          <a href="#comunidade">Discussão</a>
          <a href="#ajuda">Ajuda</a>
        </nav>
      </header>

      <div className="wiki-layout" id="inicio">
        <aside className="wiki-sidebar" aria-label="Sumário">
          <strong>Conteúdo</strong>
          <a href="#inicio" className="is-active">Início</a>
          <a href="#sobre">Sobre a raça</a>
          <a href="#curiosidades">Curiosidades</a>
          <a href="#caes">Cães da comunidade</a>
          <a href="#comunidade">Fórum</a>
          <a href="#fontes">Referências</a>
        </aside>

        <article className="wiki-article">
          <header className="wiki-title">
            <h1>Border Collie</h1>
            <p>Da Colliepédia, o fórum livre sobre cães de pastoreio</p>
            <nav aria-label="Navegação do artigo">
              <span>Artigo</span>
              <a href="#comunidade">Discussão</a>
              <a href="#fontes">Ver fontes</a>
            </nav>
          </header>

          <div className="wiki-notice">
            <strong>Este é um artigo informativo.</strong> O conteúdo reúne fatos documentados e relatos ilustrativos da comunidade. Questões de saúde devem ser avaliadas por um médico-veterinário.
          </div>

          <aside className="wiki-infobox">
            <h2>Border Collie</h2>
            <div className="wiki-dog-placeholder" aria-label="Ilustração tipográfica de um Border Collie">
              <span>BC</span>
            </div>
            <table>
              <tbody>
                <tr><th>Origem</th><td>Grã-Bretanha</td></tr>
                <tr><th>Grupo</th><td>Pastoreio</td></tr>
                <tr><th>Porte</th><td>Médio</td></tr>
                <tr><th>Pelagem</th><td>Dupla</td></tr>
                <tr><th>Perfil</th><td>Ativo, atento e responsivo</td></tr>
              </tbody>
            </table>
          </aside>

          <p className="wiki-lead">
            O <strong>Border Collie</strong> é uma raça de cão de pastoreio desenvolvida nas regiões de fronteira da Grã-Bretanha. Foi selecionado pela capacidade de trabalhar em cooperação com pessoas, controlar rebanhos e responder a sinais mesmo a grandes distâncias.
          </p>

          <section id="sobre">
            <h2>Sobre a raça</h2>
            <p>
              O nome está ligado às regiões de fronteira entre Inglaterra, Escócia e País de Gales. No campo, a raça ficou conhecida pela velocidade, resistência, aproximação baixa e pelo <em>herding eye</em>: um olhar concentrado que ajuda a influenciar o movimento das ovelhas.
            </p>
            <p>
              Inteligência não significa que o cão nasce sabendo viver em qualquer ambiente. Border Collies precisam de aprendizagem gradual, descanso, convivência e atividades mentais adequadas. Exercício sem equilíbrio pode apenas aumentar o condicionamento físico sem produzir tranquilidade.
            </p>
          </section>

          <section id="curiosidades">
            <h2>Curiosidades verificadas</h2>
            <ol>
              <li><strong>Não existem apenas cães pretos e brancos.</strong> Registros da raça incluem tricolor, chocolate, vermelho, azul, merle e outras variações.</li>
              <li><strong>Chaser foi um caso extraordinário.</strong> Essa Border Collie aprendeu os nomes de 1.022 objetos em uma pesquisa controlada. O resultado descreve um indivíduo treinado, não todos os cães da raça.</li>
              <li><strong>O olhar faz parte do trabalho.</strong> A combinação de postura baixa, distância e foco ajuda o cão a conduzir o rebanho sem contato constante.</li>
              <li><strong>Saúde vale mais que aparência.</strong> Criação responsável inclui exames oculares e testes genéticos relevantes para a linhagem.</li>
            </ol>
          </section>

          <section id="caes">
            <h2>Cães da comunidade</h2>
            <p>A lista abaixo reúne exemplos de perfis e assuntos discutidos pelos participantes.</p>
            <div className="wiki-table-wrap">
              <table className="wiki-dog-table">
                <thead>
                  <tr><th>Nome</th><th>Idade</th><th>Pelagem</th><th>Tópico principal</th></tr>
                </thead>
                <tbody>
                  {dogs.map((dog) => (
                    <tr key={dog.name}>
                      <td>
                        {dog.name === "Philp" ? <a href="/login">{dog.name}</a> : <a href="#comunidade">{dog.name}</a>}
                      </td>
                      <td>{dog.age}</td>
                      <td>{dog.coat}</td>
                      <td>{dog.topic}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="comunidade">
            <h2>Discussões recentes</h2>
            <div className="wiki-discussions">
              <article id="perfil-amora">
                <h3><a href="#comunidade">Como equilibrar exercício e descanso?</a></h3>
                <p>“Depois que incluímos farejamento e pausas, a Amora passou a terminar o dia mais tranquila.” — Marina A., há 2 horas</p>
              </article>
              <article id="perfil-gaia">
                <h3><a href="#comunidade">Primeira aula de agility da Gaia</a></h3>
                <p>Relato sobre adaptação aos obstáculos, reforço positivo e sessões curtas. — Carlos R., ontem</p>
              </article>
              <article id="perfil-luna">
                <h3><a href="#comunidade">Atividades para cães mais velhos</a></h3>
                <p>Ideias de baixo impacto para manter a Luna interessada sem sobrecarregar as articulações. — Joana P., há 3 dias</p>
              </article>
            </div>
          </section>

          <section id="fontes">
            <h2>Referências</h2>
            <ol className="wiki-references">
              {references.map((reference) => (
                <li key={reference.href}>
                  <a href={reference.href} target="_blank" rel="noreferrer">{reference.label}</a>. Consultado para a elaboração deste resumo.
                </li>
              ))}
            </ol>
          </section>

          <section className="wiki-categories" id="ajuda">
            <strong>Categorias:</strong> <a href="#sobre">Border Collie</a> · <a href="#curiosidades">Cães de pastoreio</a> · <a href="#comunidade">Comportamento canino</a>
          </section>
        </article>
      </div>

      <footer className="wiki-footer">
        <p>Conteúdo informativo baseado nas fontes listadas. Colliepédia, 2026.</p>
        <nav><a href="#fontes">Fontes</a><a href="#ajuda">Aviso geral</a><a href="#inicio">Voltar ao topo</a></nav>
      </footer>
    </main>
  );
}
