import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickChainLegsPanel } from '../QuickChainLegsPanel';
import type { ChainLeg } from '../types';

const sampleLegs: ChainLeg[] = [
  { localId: 'a', type: 'OPEN', time: 1700000000, price: 100, volume_from_capital: 10 },
  { localId: 'b', type: 'CLOSE', time: 1700001000, price: 108, volume_from_capital: 10 },
];

describe('QuickChainLegsPanel', () => {
  it('renders all legs', () => {
    render(
      <QuickChainLegsPanel
        legs={sampleLegs}
        canSave={true}
        onVolumeChange={() => {}}
        onRemoveLeg={() => {}}
        onSave={() => {}}
        onReset={() => {}}
      />,
    );
    expect(screen.getByTestId('leg-0')).toHaveTextContent('OPEN');
    expect(screen.getByTestId('leg-1')).toHaveTextContent('CLOSE');
  });

  it('emits onVolumeChange when input changes', () => {
    const onVolumeChange = vi.fn();
    render(
      <QuickChainLegsPanel
        legs={sampleLegs}
        canSave={false}
        onVolumeChange={onVolumeChange}
        onRemoveLeg={() => {}}
        onSave={() => {}}
        onReset={() => {}}
      />,
    );
    fireEvent.change(screen.getByTestId('leg-0-volume'), { target: { value: '25' } });
    expect(onVolumeChange).toHaveBeenCalledWith('a', 25);
  });

  it('highlights legs with errors', () => {
    render(
      <QuickChainLegsPanel
        legs={sampleLegs}
        errorsByIndex={{ 1: 'Цена не та' }}
        canSave={false}
        onVolumeChange={() => {}}
        onRemoveLeg={() => {}}
        onSave={() => {}}
        onReset={() => {}}
      />,
    );
    expect(screen.getByTestId('leg-1')).toHaveStyle({ color: 'rgb(255, 0, 0)' });
    expect(screen.getByText('Цена не та')).toBeInTheDocument();
  });

  it('disables save button when canSave=false', () => {
    render(
      <QuickChainLegsPanel
        legs={sampleLegs}
        canSave={false}
        onVolumeChange={() => {}}
        onRemoveLeg={() => {}}
        onSave={() => {}}
        onReset={() => {}}
      />,
    );
    expect(screen.getByTestId('save-chain')).toBeDisabled();
  });
});
