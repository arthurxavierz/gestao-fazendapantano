import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { brand } from './brand'
import './styles.css'

registerSW({ immediate: true })
document.title = brand.pageTitle
// Tema visual da marca (cores e tipografia) aplicado antes da primeira pintura.
document.documentElement.dataset.theme = brand.theme

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
