interface RejectToastProps {
  reason: string | null;
  onDismiss: () => void;
}

export function RejectToast({ reason, onDismiss }: RejectToastProps) {
  if (!reason) return null;
  return (
    <div className="toast" role="status">
      <span>Server: {reason}</span>
      <button type="button" className="btn-inline" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
