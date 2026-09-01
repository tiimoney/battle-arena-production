export function EmptyStateCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="card empty-state">
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}
