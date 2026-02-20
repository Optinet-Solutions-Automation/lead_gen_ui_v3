import { useState, useEffect, useRef } from 'react'
import './App.css'
import { supabase } from './supabase'

const countries   = JSON.parse(import.meta.env.VITE_COUNTRIES)
const N8N_WEBHOOK            = import.meta.env.VITE_N8N_WEBHOOK_URL
const N8N_DUPLICATES_WEBHOOK = import.meta.env.VITE_N8N_DUPLICATES_WEBHOOK_URL
const N8N_MONDAY_WEBHOOK     = import.meta.env.VITE_N8N_MONDAY_WEBHOOK_URL

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS  = 5 * 60 * 1000 // 5 minutes

const TABLE_COLUMNS = [
  { key: 'id',               label: 'ID' },
  { key: 'batch_id',         label: 'Batch ID' },
  { key: 'keyword',          label: 'Keyword' },
  { key: 'country',          label: 'Country' },
  { key: 'url',              label: 'URL' },
  { key: 'domain',           label: 'Clean Domain' },
  { key: 'position_on_page', label: 'Position on Page' },
  { key: 'page_number',      label: 'Page #' },
  { key: 'overall_position', label: 'Overall Position' },
  { key: 'result_type',      label: 'Result Type' },
  { key: 'affiliate_name',   label: 'Affiliate Name' },
  { key: 'lead_type',        label: 'Lead Type' },
  { key: 'remarks',          label: 'Remarks' },
  { key: 's_tag_id',         label: 'S-Tag' },
  { key: 'timestamp',        label: 'Timestamp' },
]

// batchModal.phase: 'loading' | 'select'
function BatchSelectModal({ batchModal, onSelectChange, onConfirm, onCancel }) {
  if (!batchModal) return null

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>

        {batchModal.phase === 'loading' && (
          <>
            <div className="modal-icon modal-icon--loading">
              <span className="spinner" />
            </div>
            <h2 className="modal-title">Loading Batches...</h2>
          </>
        )}

        {batchModal.phase === 'select' && (
          <>
            <h2 className="modal-title">Check for Duplicates</h2>
            <p className="modal-message">Select the batch ID you want to run duplicate checking for.</p>
            <select
              className="select-batch"
              value={batchModal.selected}
              onChange={(e) => onSelectChange(e.target.value)}
            >
              <option value="" disabled>Select Batch ID</option>
              {batchModal.batchIds.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
            <div className="modal-actions">
              <button className="btn-modal-cancel" onClick={onCancel}>Cancel</button>
              <button
                className="modal-close-btn"
                disabled={!batchModal.selected}
                onClick={() => onConfirm(batchModal.selected)}
              >
                Run
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// modal.phase: 'loading' | 'success' | 'error'
function Modal({ modal, onClose }) {
  if (!modal) return null

  const isLocked = modal.phase === 'loading'

  return (
    <div
      className={`modal-overlay${isLocked ? ' modal-overlay--locked' : ''}`}
      onClick={isLocked ? undefined : onClose}
    >
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
  const [leads, setLeads]         = useState([])
  const [selectedRows, setSelectedRows] = useState(new Set())
  const [tableLoading, setTableLoading] = useState(true)
  const [loading, setLoading]     = useState(false)
  const [modal, setModal]                   = useState(null)
  const [batchModal, setBatchModal]         = useState(null)
  const [pendingWebhookUrl, setPendingWebhookUrl] = useState(null)
  const pollRef                   = useRef(null)

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

  const fetchLeads = async () => {
    setTableLoading(true)
    setSelectedRows(new Set())
    const { data, error } = await supabase
      .from('google_lead_gen_table')
      .select('*')
      .order('id', { ascending: false })
    if (!error) setLeads(data ?? [])
    setTableLoading(false)
  }

  const selectableLeads = leads.filter((r) => r.lead_type !== 'INVALID')
  const allSelected  = selectableLeads.length > 0 && selectedRows.size === selectableLeads.length
  const someSelected = selectedRows.size > 0 && !allSelected

  const toggleSelectAll = () => {
    setSelectedRows(allSelected ? new Set() : new Set(selectableLeads.map((r) => r.id)))
  }

  const toggleRow = (id) => {
    setSelectedRows((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Fetch table data from Supabase on mount
  useEffect(() => { fetchLeads() }, [])

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
      // Clear any stale result from a previous submission
      await fetch('/api/status', { method: 'DELETE' })

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
    if (modal?.phase === 'success') fetchLeads()
    setModal(null)
  }

  const sendToWebhook = async (url, payload) => {
    setModal({ phase: 'loading' })
    setLoading(true)
    try {
      await fetch('/api/status', { method: 'DELETE' })
      const res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`Webhook responded with status ${res.status}`)
      startPolling()
    } catch (err) {
      setModal({ phase: 'error', data: { message: err.message } })
    } finally {
      setLoading(false)
    }
  }

  const openBatchModal = async (webhookUrl) => {
    setPendingWebhookUrl(webhookUrl)
    setBatchModal({ phase: 'loading' })

    const { data, error } = await supabase
      .from('google_lead_gen_table')
      .select('batch_id')
      .not('batch_id', 'is', null)
      .order('batch_id', { ascending: false })

    if (error) {
      setBatchModal(null)
      setModal({ phase: 'error', data: { message: 'Failed to load batch IDs.' } })
      return
    }

    const batchIds = [...new Set(data.map((r) => r.batch_id).filter(Boolean))]

    if (batchIds.length === 0) {
      setBatchModal(null)
      setModal({ phase: 'error', data: { message: 'No batches found in the database.' } })
      return
    }

    setBatchModal({ phase: 'select', batchIds, selected: batchIds[0] })
  }

  const handleBatchActionClick = (webhookUrl) => async () => {
    if (selectedRows.size > 0) {
      const payload = leads
        .filter((r) => selectedRows.has(r.id) && r.lead_type !== 'INVALID')
        .map((r) => ({ id: r.id, url: r.url, domain: r.domain }))
      await sendToWebhook(webhookUrl, payload)
      return
    }
    await openBatchModal(webhookUrl)
  }

  const handleBatchConfirm = async (batchId) => {
    setBatchModal(null)

    const { data, error } = await supabase
      .from('google_lead_gen_table')
      .select('id, url, domain, lead_type')
      .eq('batch_id', batchId)

    if (error) {
      setModal({ phase: 'error', data: { message: 'Failed to fetch records for the selected batch.' } })
      return
    }

    const payload = data
      .filter((r) => r.lead_type !== 'INVALID')
      .map((r) => ({ id: r.id, url: r.url, domain: r.domain }))
    await sendToWebhook(pendingWebhookUrl, payload)
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
            <option value="" disabled>Country</option>
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

        <div className="action-bar">
          <button className="btn-action" disabled>Check for Affiliates</button>
          <span className="action-sep">›</span>
          <button className="btn-action" onClick={handleBatchActionClick(N8N_DUPLICATES_WEBHOOK)} disabled={loading}>Check for Duplicates</button>
          <span className="action-sep">›</span>
          <button className="btn-action">Collect S-Tags</button>
          <span className="action-sep">›</span>
          <button className="btn-action">Collect Email &amp; Contact Info</button>
          <span className="action-sep">›</span>
          <button className="btn-action" onClick={handleBatchActionClick(N8N_MONDAY_WEBHOOK)} disabled={loading}>Add Lead on Monday.com</button>
        </div>
      </div>

      <div className="table-card">
        <div className="table-wrapper">
          <table className="leads-table">
            <thead>
              <tr>
                <th className="col-checkbox">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected }}
                    onChange={toggleSelectAll}
                  />
                </th>
                {TABLE_COLUMNS.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableLoading ? (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length + 1} className="no-data">
                    Loading...
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length + 1} className="no-data">
                    No data to display.
                  </td>
                </tr>
              ) : (
                leads.map((row) => (
                  <tr key={row.id} className={[selectedRows.has(row.id) ? 'row-selected' : '', row.lead_type === 'INVALID' ? 'row-invalid' : '', row.lead_type === 'LEAD' ? 'row-lead' : ''].filter(Boolean).join(' ')}>
                    <td className="col-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(row.id)}
                        onChange={() => toggleRow(row.id)}
                        disabled={row.lead_type === 'INVALID'}
                      />
                    </td>
                    {TABLE_COLUMNS.map((col) => {
                      const value = row[col.key] ?? '—'
                      const className = col.key === 'remarks' ? 'col-remarks' : col.key === 'url' ? 'col-url' : col.key === 'domain' ? 'col-domain' : undefined
                      return (
                        <td key={col.key} className={className} title={String(value)}>
                          {value}
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal modal={modal} onClose={handleModalClose} />

      <BatchSelectModal
        batchModal={batchModal}
        onSelectChange={(val) => setBatchModal((prev) => ({ ...prev, selected: val }))}
        onConfirm={handleBatchConfirm}
        onCancel={() => setBatchModal(null)}
      />
    </div>
  )
}

export default App
