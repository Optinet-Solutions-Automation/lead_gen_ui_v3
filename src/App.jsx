import { useState, useEffect, useRef } from 'react'
import './App.css'
import { supabase } from './supabase'

const countries   = JSON.parse(import.meta.env.VITE_COUNTRIES)
const N8N_WEBHOOK            = import.meta.env.VITE_N8N_WEBHOOK_URL
const N8N_DUPLICATES_WEBHOOK = import.meta.env.VITE_N8N_DUPLICATES_WEBHOOK_URL
const N8N_MONDAY_WEBHOOK     = import.meta.env.VITE_N8N_MONDAY_WEBHOOK_URL
const MONDAY_PASSWORD        = import.meta.env.VITE_MONDAY_PASSWORD
const N8N_STAGS_WEBHOOK      = import.meta.env.VITE_N8N_STAGS_WEBHOOK_URL
const N8N_ROOSTER_WEBHOOK    = import.meta.env.VITE_N8N_ROOSTER_WEBHOOK_URL
const N8N_PPC_WEBHOOK        = import.meta.env.VITE_N8N_PPC_WEBHOOK_URL

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS  = 5 * 60 * 1000 // 5 minutes

const TABLE_COLUMNS = [
  { key: 'id',               label: 'ID' },
  { key: 'batch_id',         label: 'Batch ID' },
  { key: 'keyword',          label: 'Keyword' },
  { key: 'country',          label: 'Country' },
  { key: 'url',              label: 'Full URL' },
  { key: 'domain',           label: 'Clean Domain' },
  { key: 'position_on_page', label: 'Position on Page' },
  { key: 'page_number',      label: 'Page #' },
  { key: 'overall_position', label: 'Overall Position' },
  { key: 'result_type',        label: 'Result Type' },
  { key: 'is_rooster_partner', label: 'Rooster Partner' },
  { key: 'affiliate_name',     label: 'Affiliate Name' },
  { key: 'lead_type',        label: 'Lead Type' },
  { key: 'remarks',          label: 'Remarks' },
  { key: 's_tag_id',         label: 'S-Tag' },
  { key: 'time_stamp',        label: 'Timestamp' },
]

function PasswordModal({ passwordModal, onPasswordChange, onConfirm, onCancel }) {
  if (!passwordModal) return null

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Enter Password</h2>
        <p className="modal-message">This action is password protected.</p>
        <input
          type="password"
          className="input-password"
          placeholder="Password"
          value={passwordModal.input}
          onChange={(e) => onPasswordChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onConfirm()}
          autoFocus
        />
        {passwordModal.error && (
          <p className="password-error">{passwordModal.error}</p>
        )}
        <div className="modal-actions">
          <button className="btn-modal-cancel" onClick={onCancel}>Cancel</button>
          <button className="modal-close-btn" onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  )
}

function STagsModal({ sTagsModal, onClose }) {
  if (!sTagsModal) return null

  const roosterLabel =
    sTagsModal.isRoosterPartner === true  || sTagsModal.isRoosterPartner === 'true'  ? 'Yes' :
    sTagsModal.isRoosterPartner === false || sTagsModal.isRoosterPartner === 'false' ? 'No'  : '—'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--wide" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">S-Tags List</h2>
        <p className="modal-message">Rooster Partner: <strong>{roosterLabel}</strong></p>
        {sTagsModal.loading ? (
          <div className="modal-icon modal-icon--loading"><span className="spinner" /></div>
        ) : (
          <div className="stags-table-wrapper">
            <table className="stags-table">
              <thead>
                <tr>
                  <th>S-Tag ID</th>
                  <th>S-Tag</th>
                  <th>Brand</th>
                </tr>
              </thead>
              <tbody>
                {sTagsModal.sTags.length === 0 ? (
                  <tr><td colSpan={3} className="no-data">No S-Tags found.</td></tr>
                ) : (
                  sTagsModal.sTags.map((tag) => (
                    <tr key={tag.s_tag_id}>
                      <td>{tag.s_tag_id}</td>
                      <td>{tag.s_tag ?? '—'}</td>
                      <td>{tag.brand ?? '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        <button className="modal-close-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

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
            <h2 className="modal-title">Check for Domain Duplicates</h2>
            <p className="modal-message">Select the batch ID you want to run domain duplicate checking for.</p>
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
  const [pendingExtraFields, setPendingExtraFields] = useState([])
  const [passwordModal, setPasswordModal] = useState(null)
  const [sTagsModal, setSTagsModal] = useState(null)
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

  const openBatchModal = async (webhookUrl, extraFields = []) => {
    setPendingWebhookUrl(webhookUrl)
    setPendingExtraFields(extraFields)
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

  const handleCollectSTagsClick = async () => {
    if (selectedRows.size === 0) {
      setModal({ phase: 'error', data: { message: 'Please select a row to collect S-Tags for.' } })
      return
    }
    if (selectedRows.size > 1) {
      setModal({ phase: 'error', data: { message: 'Collect S-Tags only works on one row at a time. Please select a single row.' } })
      return
    }
    const row = leads.find((r) => selectedRows.has(r.id))
    const payload = { id: row.id, url: row.url, domain: row.domain, country: row.country ?? null, is_rooster_partner: row.is_rooster_partner ?? null }
    await sendToWebhook(N8N_STAGS_WEBHOOK, payload)
  }

  const handleProcessPPCClick = async () => {
    if (selectedRows.size === 0) {
      setModal({ phase: 'error', data: { message: 'Please select a row to process PPC for.' } })
      return
    }
    if (selectedRows.size > 1) {
      setModal({ phase: 'error', data: { message: 'Process PPC only works on one row at a time. Please select a single row.' } })
      return
    }
    const row = leads.find((r) => selectedRows.has(r.id))
    if (row.result_type !== 'PPC') {
      setModal({ phase: 'error', data: { message: 'The selected row must have a Result Type of PPC.' } })
      return
    }
    const payload = { id: row.id, url: row.url, domain: row.domain, is_rooster_partner: row.is_rooster_partner ?? null }
    await sendToWebhook(N8N_PPC_WEBHOOK, payload)
  }

  const handleBatchActionClick = (webhookUrl, extraFields = []) => async () => {
    if (selectedRows.size > 0) {
      const payload = leads
        .filter((r) => selectedRows.has(r.id) && r.lead_type !== 'INVALID')
        .map((r) => {
          const base = { id: r.id, url: r.url, domain: r.domain }
          extraFields.forEach((f) => { base[f] = r[f] ?? null })
          return base
        })
      await sendToWebhook(webhookUrl, payload)
      return
    }
    await openBatchModal(webhookUrl, extraFields)
  }

  const handleSTagClick = async (sTagId, isRoosterPartner) => {
    setSTagsModal({ loading: true, sTags: [], highlightId: sTagId, isRoosterPartner })
    const { data, error } = await supabase
      .from('s_tags_table')
      .select('s_tag_id, s_tag, brand')
      .eq('s_tag_id', sTagId)
    if (error) {
      setSTagsModal(null)
      setModal({ phase: 'error', data: { message: 'Failed to load S-Tag.' } })
      return
    }
    setSTagsModal({ loading: false, sTags: data ?? [], highlightId: sTagId, isRoosterPartner })
  }

  const handleMondayClick = () => {
    setPasswordModal({ input: '', error: '' })
  }

  const handlePasswordConfirm = () => {
    if (passwordModal.input !== MONDAY_PASSWORD) {
      setPasswordModal((prev) => ({ ...prev, error: 'Incorrect password. Please try again.' }))
      return
    }
    setPasswordModal(null)
    handleBatchActionClick(N8N_MONDAY_WEBHOOK)()
  }

  const handleBatchConfirm = async (batchId) => {
    setBatchModal(null)

    const selectFields = ['id', 'url', 'domain', 'lead_type', ...pendingExtraFields].join(', ')
    const { data, error } = await supabase
      .from('google_lead_gen_table')
      .select(selectFields)
      .eq('batch_id', batchId)

    if (error) {
      setModal({ phase: 'error', data: { message: 'Failed to fetch records for the selected batch.' } })
      return
    }

    const payload = data
      .filter((r) => r.lead_type !== 'INVALID')
      .map((r) => {
        const base = { id: r.id, url: r.url, domain: r.domain }
        pendingExtraFields.forEach((f) => { base[f] = r[f] ?? null })
        return base
      })
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
          <button className="btn-action" onClick={handleBatchActionClick(N8N_DUPLICATES_WEBHOOK)} disabled={loading}>Check for Domain Duplicates</button>
          <span className="action-sep">›</span>
          <button className="btn-action" onClick={handleBatchActionClick(N8N_ROOSTER_WEBHOOK, ['country'])} disabled={loading}>Check if Rooster Partner</button>
          <span className="action-sep">›</span>
          <button className="btn-action" onClick={handleCollectSTagsClick} disabled={loading}>Collect S-Tags</button>
          <span className="action-sep">›</span>
          <button className="btn-action">Collect Email &amp; Contact Info</button>
          <span className="action-sep">›</span>
          <button className="btn-action" onClick={handleMondayClick} disabled={loading}>Add Lead on Monday.com</button>
        </div>
        <div className="action-bar">
          <button className="btn-action" onClick={handleProcessPPCClick} disabled={loading}>PPC - Take Screenshot</button>
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
                      const raw = row[col.key]
                      let value
                      if (col.key === 'is_rooster_partner') {
                        value = raw === true || raw === 'true' ? 'Yes' : raw === false || raw === 'false' ? 'No' : '—'
                      } else if (col.key === 'time_stamp') {
                        if (raw) {
                          const d = new Date(raw)
                          value = isNaN(d.getTime()) ? String(raw) : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
                        } else {
                          value = '—'
                        }
                      } else {
                        value = raw ?? '—'
                      }
                      const className = col.key === 'remarks' ? 'col-remarks' : col.key === 'url' ? 'col-url' : col.key === 'domain' ? 'col-domain' : col.key === 'time_stamp' ? 'col-timestamp' : undefined
                      return (
                        <td key={col.key} className={className} title={String(value)}>
                          {(col.key === 'url' || col.key === 'domain') && row[col.key] ? (
                            <a href={row[col.key]} target="_blank" rel="noreferrer" className="cell-link">
                              {row[col.key]}
                            </a>
                          ) : col.key === 's_tag_id' && row[col.key] ? (
                            <button className="cell-link cell-link--btn" onClick={() => handleSTagClick(row[col.key], row.is_rooster_partner)}>
                              Click here
                            </button>
                          ) : value}
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

      <STagsModal sTagsModal={sTagsModal} onClose={() => setSTagsModal(null)} />

      <PasswordModal
        passwordModal={passwordModal}
        onPasswordChange={(val) => setPasswordModal((prev) => ({ ...prev, input: val, error: '' }))}
        onConfirm={handlePasswordConfirm}
        onCancel={() => setPasswordModal(null)}
      />

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
