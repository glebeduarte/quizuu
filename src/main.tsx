import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './styles.css'
import { AuthProvider, RequireAuth } from './lib/auth'
import Home from './pages/Home'
import Login from './pages/Login'
import Painel from './pages/Painel'
import Jogar from './pages/Jogar'
import Host from './pages/Host'
import Editor from './pages/Editor'
import Relatorio from './pages/Relatorio'
import Gerar from './pages/Gerar'
import Votacoes from './pages/Votacoes'
import VotacaoEditor from './pages/VotacaoEditor'
import Votar from './pages/Votar'
import Tela from './pages/Tela'
import Admin from './pages/Admin'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/entrar" element={<Login key="entrar" />} />
          <Route path="/criar-conta" element={<Login key="criar" initial="criar" />} />
          <Route path="/jogar" element={<Jogar />} />
          <Route path="/painel" element={<RequireAuth><Painel /></RequireAuth>} />
          <Route path="/quiz/:id" element={<RequireAuth><Editor /></RequireAuth>} />
          <Route path="/gerar" element={<RequireAuth><Gerar /></RequireAuth>} />
          <Route path="/relatorio/:sessionId" element={<RequireAuth><Relatorio /></RequireAuth>} />
          <Route path="/host/:sessionId" element={<RequireAuth><Host /></RequireAuth>} />
          <Route path="/votacoes" element={<RequireAuth><Votacoes /></RequireAuth>} />
          <Route path="/votacao/:id" element={<RequireAuth><VotacaoEditor /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth><Admin /></RequireAuth>} />
          <Route path="/v/:code" element={<Votar />} />
          <Route path="/v/:code/tela" element={<Tela />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
)
