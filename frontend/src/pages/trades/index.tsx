import { Route, Routes } from 'react-router-dom';
import TradeDetail from './TradeDetail';
import TradeForm from './TradeForm';
import TradeList from './TradeList';

export default function TradesRouter() {
  return (
    <Routes>
      <Route index element={<TradeList />} />
      <Route path="new" element={<TradeForm />} />
      <Route path=":id" element={<TradeDetail />} />
      <Route path=":id/edit" element={<TradeForm />} />
    </Routes>
  );
}
