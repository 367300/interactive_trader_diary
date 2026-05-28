import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface Props {
  chainId: string;
  onNextChain: () => void;
  onClose: () => void;
}

export function QuickChainSuccessPanel({ chainId, onNextChain, onClose }: Props) {
  const navigate = useNavigate();

  return (
    <div
      role="dialog"
      aria-label="Цепочка сохранена"
      style={{
        position: 'fixed',
        top: 80,
        right: 24,
        padding: 16,
        background: 'white',
        border: '1px solid #16a34a',
        borderRadius: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        zIndex: 50,
      }}
      data-testid="success-panel"
    >
      <h3>Цепочка сохранена</h3>
      <Button onClick={() => navigate(`/trades/${chainId}/edit?tab=analysis`)}>
        Добавить анализ
      </Button>
      <Button onClick={onNextChain} variant="ghost">
        Следующая цепочка
      </Button>
      <Button onClick={() => navigate(`/trades/${chainId}`)} variant="ghost">
        Открыть детали
      </Button>
      <button onClick={onClose} aria-label="close">×</button>
    </div>
  );
}
