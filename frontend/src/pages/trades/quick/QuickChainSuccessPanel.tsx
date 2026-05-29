import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { X } from 'lucide-react';

interface Props {
  chainId: string;
  onNextChain: () => void;
  onClose: () => void;
}

export function QuickChainSuccessPanel({ chainId, onNextChain, onClose }: Props) {
  const navigate = useNavigate();

  return (
    <Card
      role="dialog"
      aria-label="Цепочка сохранена"
      data-testid="success-panel"
      className="fixed top-20 right-6 w-full max-w-sm z-50 border-2 border-green shadow-lg"
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-green">Цепочка сохранена</CardTitle>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="close"
          className="h-7 w-7"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button
          type="button"
          variant="primary"
          onClick={() => navigate(`/trades/${chainId}/edit?tab=analysis`)}
          className="w-full"
        >
          Добавить анализ
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onNextChain}
          className="w-full"
        >
          Следующая цепочка
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => navigate(`/trades/${chainId}`)}
          className="w-full"
        >
          Открыть детали
        </Button>
      </CardContent>
    </Card>
  );
}
