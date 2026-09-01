import type { TeamStanding } from "../api/types";
import "./LeagueTableCard.css";

const PODIUM_COLORS = ["#d4a017", "#93a1ac", "#b76e3a"];

export function LeagueTableCard({ standings }: { standings: TeamStanding[] }) {
  return (
    <div className="league-table-scroll">
      <table className="league-table">
        <thead>
          <tr>
            <th>#</th>
            <th className="align-left">Entry</th>
            <th>Players</th>
            <th>P</th>
            <th>W</th>
            <th>D</th>
            <th>L</th>
            <th>GF</th>
            <th>GA</th>
            <th>GD</th>
            <th>Pts</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row, index) => {
            const podiumColor = index < 3 ? PODIUM_COLORS[index] : undefined;
            return (
              <tr key={row.team.id} className="league-table-row" style={podiumColor ? { boxShadow: `inset 4px 0 0 ${podiumColor}` } : undefined}>
                <td className="rank-cell">
                  {index === 0 ? <span title="1st place">👑</span> : null} {index + 1}
                </td>
                <td className="align-left">{row.team.name}</td>
                <td>{row.team.entryType === "individual" ? "Individual" : row.team.members.length || row.team.teamSize}</td>
                <td>{row.played}</td>
                <td>{row.wins}</td>
                <td>{row.draws}</td>
                <td>{row.losses}</td>
                <td>{row.goalsFor}</td>
                <td>{row.goalsAgainst}</td>
                <td>{row.goalDifference}</td>
                <td className="points-cell">{row.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
