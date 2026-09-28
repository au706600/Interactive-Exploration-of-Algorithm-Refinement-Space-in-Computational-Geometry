import { useState } from 'react'
import Refinement_space from './refinement_space.jsx'

import './App.css'

function App() {

  return (
    <div>
      <ul className="li-items">
        <li><button>Save Project</button></li>
        <li><button>Edit</button></li>
      </ul>
      <Refinement_space />
    </div>
  )
}

export default App
