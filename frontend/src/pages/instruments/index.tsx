import { Route, Routes } from 'react-router-dom';
import FuturesDetail from './FuturesDetail';
import InstrumentDetail from './InstrumentDetail';
import InstrumentList from './InstrumentList';

export default function InstrumentsRouter() {
  return (
    <Routes>
      <Route index element={<InstrumentList />} />
      <Route path="futures/:ticker" element={<FuturesDetail />} />
      <Route path=":ticker" element={<InstrumentDetail />} />
    </Routes>
  );
}
