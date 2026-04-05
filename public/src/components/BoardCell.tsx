import type { ServerCell } from "../types/serverGame";

interface BoardCellProps {
  index: number;
  value: ServerCell;
  disabled: boolean;
  onSelect: (index: number) => void;
}

export function BoardCell({
  index,
  value,
  disabled,
  onSelect,
}: BoardCellProps) {
  const label = value ?? "empty";
  return (
    <button
      type="button"
      className="board-cell"
      aria-label={`Cell ${index + 1}, ${label}`}
      disabled={disabled}
      onClick={() => onSelect(index)}
    >
      <span className="board-cell__mark">{value ?? ""}</span>
    </button>
  );
}
