import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppLayout from './App';
import LandingPage from './pages/home';
import ShopPage from './pages/shop/page';
import PartnerPage from './pages/[business]/page';
import './index.css';
import Faith from '@/pages/faith';
import FamilyFun from '@/pages/familyFun';
import Festivals from '@/pages/festivals';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/:business" element={<PartnerPage />} />
          <Route path="/faith" element={<Faith />} />
          <Route path="/family-fun" element={<FamilyFun />} />
          <Route path="/festivals" element={<Festivals />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
