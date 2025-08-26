import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from '@/pages/page';
import ShopPage from '@/pages/shop/page';
import PartnerPage from '@/pages/[business]/page';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/shop" element={<ShopPage />} />
        <Route path="/:business" element={<PartnerPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
