import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import NavBar from './NavBar.jsx'
import App from './App.jsx'
import TuesdayBoard from './TuesdayBoard.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <NavBar />
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/tuesday-board" element={<TuesdayBoard />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
