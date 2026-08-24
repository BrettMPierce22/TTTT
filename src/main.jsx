import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { canUseNativeShell } from './native/nativeShell.js'

if (canUseNativeShell()) {
  document.documentElement.classList.add('native-ios-shell')
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
