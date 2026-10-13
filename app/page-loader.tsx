export default function PageLoader({ label = "Carregando página…" }: { label?: string }) {
  return (
    <div className="page-loader" role="status">
      <span className="page-loader-spinner" aria-hidden="true" />
      <strong>{label}</strong>
      <span className="page-loader-description">Preparando o conteúdo para você.</span>
    </div>
  );
}
