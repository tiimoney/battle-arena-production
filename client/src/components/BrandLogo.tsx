import logo from "../assets/bap_logo.png";

export function BrandLogo({ size = 64 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: "var(--color-surface-lowest)",
        border: "1px solid var(--card-border)",
        boxShadow: "0 4px 14px rgba(255, 48, 71, 0.18)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <img src={logo} alt="Mocheso League" style={{ width: "78%", height: "78%", objectFit: "contain" }} />
    </div>
  );
}
