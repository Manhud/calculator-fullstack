import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

const container = document.getElementById('root')
// A non-null assertion here would turn a missing root into "cannot read
// properties of null" thrown from inside React, with nothing pointing at the
// actual cause in index.html.
if (!container) {
  throw new Error('index.html is missing the #root element the app mounts into')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
