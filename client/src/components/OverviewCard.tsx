export function OverviewCard({
  entries,
  fixtures,
  played,
  matches,
  goals,
}: {
  entries: number;
  fixtures: number;
  played: number;
  matches: number;
  goals: number;
}) {
  const tiles = [
    { label: "Entries", value: entries },
    { label: "Fixtures", value: fixtures },
    { label: "Played", value: played },
    { label: "Matches", value: matches },
    { label: "Goals", value: goals },
  ];

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Season Overview</h3>
      <p style={{ color: "var(--color-on-surface-variant)", marginTop: -8 }}>
        A quick snapshot of the active season.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 12 }}>
        {tiles.map((tile) => (
          <div key={tile.label} style={{ minWidth: 96 }}>
            <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{tile.value}</div>
            <div style={{ fontSize: "0.8rem", color: "var(--color-on-surface-variant)" }}>{tile.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
