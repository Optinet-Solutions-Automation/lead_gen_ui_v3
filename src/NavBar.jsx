import { NavLink } from 'react-router-dom'
import './NavBar.css'

export default function NavBar() {
  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <NavLink to="/" className={({ isActive }) => `navbar-link${isActive ? ' navbar-link--active' : ''}`} end>
          Google Lead Gen
        </NavLink>
        <NavLink to="/tuesday-board" className={({ isActive }) => `navbar-link${isActive ? ' navbar-link--active' : ''}`}>
          Tuesday Board
        </NavLink>
      </div>
    </nav>
  )
}
