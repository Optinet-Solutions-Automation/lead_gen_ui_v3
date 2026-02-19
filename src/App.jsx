import { useState, useEffect, useRef } from 'react'
import './App.css'

const countries   = JSON.parse(import.meta.env.VITE_COUNTRIES)
const N8N_WEBHOOK = import.meta.env.VITE_N8N_WEBHOOK_URL

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS  = 5 * 60 * 1000 // 5 minutes

const TABLE_COLUMNS = [
  { key: 'id',               label: 'ID' },
  { key: 'keyword',          label: 'Keyword' },
  { key: 'country',          label: 'Country' },
  { key: 'url',              label: 'URL' },
  { key: 'domain',           label: 'Domain' },
  { key: 'position_on_page', label: 'Position on Page' },
  { key: 'page_number',      label: 'Page #' },
  { key: 'overall_position', label: 'Overall Position' },
  { key: 'result_type',      label: 'Result Type' },
  { key: 'affiliate_name',   label: 'Affiliate Name' },
  { key: 'lead_type',        label: 'Lead Type' },
  { key: 'remarks',          label: 'Remarks' },
  { key: 's_tag_id',         label: 'S-Tag' },
]

// modal.phase: 'loading' | 'success' | 'error'
function Modal({ modal, onClose }) {
  if (!modal) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>

        {modal.phase === 'loading' && (
          <>
            <div className="modal-icon modal-icon--loading">
              <span className="spinner" />
            </div>
            <h2 className="modal-title">Processing...</h2>
            <p className="modal-message">Your request has been sent. Waiting for the workflow to complete.</p>
          </>
        )}

        {modal.phase === 'success' && (
          <>
            <div className="modal-icon modal-icon--success">&#10003;</div>
            <h2 className="modal-title modal-title--success">Success</h2>
            <p className="modal-message">{modal.data.message}</p>
          </>
        )}

        {modal.phase === 'error' && (
          <>
            <div className="modal-icon modal-icon--error">&#10007;</div>
            <h2 className="modal-title modal-title--error">Error</h2>
            <p className="modal-message">{modal.data.message}</p>
            {modal.data.failed_node && (
              <div className="modal-meta">
                <span className="modal-meta-label">Failed node:</span>
                <span className="modal-meta-value">{modal.data.failed_node}</span>
              </div>
            )}
            {modal.data.timestamp && (
              <div className="modal-meta">
                <span className="modal-meta-label">Timestamp:</span>
                <span className="modal-meta-value">{modal.data.timestamp}</span>
              </div>
            )}
          </>
        )}

        {modal.phase !== 'loading' && (
          <button className="modal-close-btn" onClick={onClose}>Close</button>
        )}
      </div>
    </div>
  )
}

function App() {
  const [keyword, setKeyword] = useState('')
  const [country, setCountry] = useState('')
  const [search, setSearch]   = useState('')
  const [leads, setLeads]     = useState([])
  const [loading, setLoading] = useState(false)
  const [modal, setModal]     = useState(null)
  const pollRef               = useRef(null)

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  const startPolling = () => {
    const startTime = Date.now()

    pollRef.current = setInterval(async () => {
      if (Date.now() - startTime > POLL_TIMEOUT_MS) {
        stopPolling()
        setModal({ phase: 'error', data: { message: 'Timed out waiting for the workflow to respond.' } })
        return
      }

      try {
        const res  = await fetch('/api/status')
        const data = await res.json()

        if (data.status === 'pending') return

        stopPolling()
        const phase = data.status?.toLowerCase() === 'success' ? 'success' : 'error'
        setModal({ phase, data })
      } catch {
        // network hiccup — keep polling
      }
    }, POLL_INTERVAL_MS)
  }

  // Clean up polling on unmount
  useEffect(() => () => stopPolling(), [])

  const handleSubmit = async (e) => {
    e.preventDefault()

    const selectedCountry = countries.find((c) => c.id === country)

    const payload = {
      keyword:      keyword,
      countryValue: selectedCountry?.id   ?? '',
      countryText:  selectedCountry?.name ?? '',
    }

    setModal({ phase: 'loading' })
    setLoading(true)

    try {
      const res = await fetch(N8N_WEBHOOK, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`Webhook responded with status ${res.status}`)

      // Start polling for the n8n callback
      startPolling()
    } catch (err) {
      setModal({ phase: 'error', data: { message: err.message } })
    } finally {
      setLoading(false)
    }
  }

  const handleModalClose = () => {
    stopPolling()
    setModal(null)
  }

  return (
    <div className="container">
      <h1 className="title">Google Lead Gen</h1>

      <div className="search-card">
        <form className="search-bar" onSubmit={handleSubmit}>
          <input
            type="text"
            className="input-keyword"
            placeholder="Keyword"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />

          <select
            className="select-country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="">Country</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? 'Submitting...' : 'Submit'}
          </button>

          <div className="search-divider" />

          <input
            type="text"
            className="input-search"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>
      </div>

      <div className="table-card">
        <div className="table-wrapper">
          <table className="leads-table">
            <thead>
              <tr>
                {TABLE_COLUMNS.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length} className="no-data">
                    No data to display.
                  </td>
                </tr>
              ) : (
                leads.map((row) => (
                  <tr key={row.id}>
                    {TABLE_COLUMNS.map((col) => (
                      <td key={col.key} className={col.key === 'remarks' ? 'col-remarks' : undefined}>
                        {row[col.key] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal modal={modal} onClose={handleModalClose} />
    </div>
  )
}

export default App
