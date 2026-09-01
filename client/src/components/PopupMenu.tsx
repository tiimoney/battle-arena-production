import { useEffect, useRef, useState, type ReactNode } from "react";
import "./PopupMenu.css";

export interface PopupMenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
  divider?: boolean;
}

export function PopupMenu({ trigger, items }: { trigger: ReactNode; items: PopupMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="popup-menu" ref={ref}>
      <span onClick={() => setOpen((v) => !v)}>{trigger}</span>
      {open && (
        <div className="popup-menu-list">
          {items.map((item, index) => (
            <div key={index}>
              {item.divider && <hr className="divider" style={{ margin: "4px 0" }} />}
              <button
                className={`popup-menu-item${item.destructive ? " destructive" : ""}`}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
