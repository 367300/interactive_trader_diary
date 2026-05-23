import { Route, Routes } from 'react-router-dom';
import StrategyDetail from './StrategyDetail';
import StrategyForm from './StrategyForm';
import StrategyList from './StrategyList';

export default function StrategiesRouter() {
  return (
    <Routes>
      <Route index element={<StrategyList />} />
      <Route path="new" element={<StrategyForm />} />
      <Route path=":id" element={<StrategyDetail />} />
      <Route path=":id/edit" element={<StrategyForm />} />
    </Routes>
  );
}
