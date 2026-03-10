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
const N8N_CONTACTS_WEBHOOK        = import.meta.env.VITE_N8N_CONTACTS_WEBHOOK_URL
const N8N_CHECK_STAGS_WEBHOOK     = import.meta.env.VITE_N8N_CHECK_STAGS_WEBHOOK_URL
const N8N_STAG_UPDATE_WEBHOOK     = import.meta.env.VITE_N8N_STAG_UPDATE_WEBHOOK_URL

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS  = 30 * 60 * 1000 // 30 minutes

const TABLE_COLUMNS = [
  { key: 'id',                 label: 'ID' },
  { key: 'batch_id',           label: 'Batch ID',        hasFilter: true },
  { key: 'keyword',            label: 'Keyword',         hasFilter: true, filterType: 'text' },
  { key: 'country',            label: 'Country',         noSort: true, hasFilter: true },
  { key: 'url',                label: 'Full URL',        hasFilter: true, filterType: 'text' },
  { key: 'domain',             label: 'Clean Domain',    hasFilter: true, filterType: 'text' },
  { key: 'result_type',        label: 'Result Type',     noSort: true, hasFilter: true },
  { key: 'is_rooster_partner', label: 'Rooster Partner', noSort: true, hasFilter: true, filterType: 'boolean' },
  { key: 's_tag_id',           label: 'S-Tag',           noSort: true, hasFilter: true, filterType: 'presence' },
  { key: 'contact_id',         label: 'Contact',         noSort: true, hasFilter: true, filterType: 'presence' },
  { key: 'affiliate_name',     label: 'Affiliate Name',  hasFilter: true, filterType: 'text' },
  { key: 'status',             label: 'Status',          noSort: true, hasFilter: true, filterOptions: ['Not Set', 'INVALID'] },
  { key: 'remarks',            label: 'Remarks',         noSort: true },
]

const EDITABLE_COLS = {
  is_rooster_partner: {
    type: 'dropdown',
    options: [
      { label: 'Yes', value: true  },
      { label: 'No',  value: false },
    ],
  },
  affiliate_name: { type: 'text' },
  status: {
    type: 'dropdown',
    options: [
      { label: 'Affiliate Website',     value: 'Affiliate Website'     },
      { label: 'Non-affiliate Website', value: 'Non-affiliate Website' },
      { label: 'Invalid',               value: 'Invalid'               },
      { label: 'Lead',                  value: 'Lead'                  },
    ],
  },
}

const isInvalid = (status) => status === 'INVALID' || status === 'Invalid'
const isLead    = (status) => status === 'LEAD'    || status === 'Lead'


const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

const resolveCountryCode = (raw) => {
  if (!raw) return null
  if (raw.length === 2) return raw.toUpperCase()
  return countries.find((c) => c.name === raw)?.code ?? null
}

const getInitialEditValue = (colKey, raw) => {
  const conf = EDITABLE_COLS[colKey]
  if (conf?.type === 'dropdown') {
    const match = conf.options.find((o) => String(o.value) === String(raw))
    return match ? match.value : conf.options[0].value
  }
  return raw ?? ''
}

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


const CONTACT_TYPE_OPTIONS = ['Email', 'Phone', 'LinkedIn', 'Twitter', 'Website']

const toGoogleDriveImageUrl = (url) => {
  if (!url) return null
  const match = url.match(/\/file\/d\/([^/?]+)/)
  if (match) return `https://lh3.googleusercontent.com/d/${match[1]}`
  return url
}

function ProfileModal({ profileModal, onClose, onLeadUpdate, onError, onCollectSTags, onCheckSTags, onCollectContacts, onTakeScreenshot, onSendSTagUpdate, onAddToMonday, profileRefreshKey }) {
  const [sTags, setSTags]                           = useState([])
  const [sTagsLoading, setSTagsLoading]             = useState(false)
  const [editingCell, setEditingCell]               = useState(null)
  const [newRows, setNewRows]                       = useState([])
  const isCancellingEditRef                         = useRef(false)

  const [contacts, setContacts]                     = useState([])
  const [contactsLoading, setContactsLoading]       = useState(false)
  const [editingContactCell, setEditingContactCell] = useState(null)
  const [newContactRows, setNewContactRows]         = useState([])
  const isCancellingContactEditRef                  = useRef(false)
  const [showScreenshot, setShowScreenshot]         = useState(false)

  useEffect(() => {
    if (!profileModal) return
    setEditingCell(null)
    setNewRows([])
    setEditingContactCell(null)
    setNewContactRows([])

    if (profileModal.s_tag_id) {
      setSTagsLoading(true)
      supabase
        .from('s_tags_table')
        .select('s_tag_autoinc_id, s_tag_id, s_tag, brand, status, source_link, board_id, item_id')
        .eq('s_tag_id', profileModal.s_tag_id)
        .then(({ data, error }) => {
          setSTagsLoading(false)
          if (error) { onError('Failed to load S-Tags.'); return }
          setSTags(data ?? [])
        })
    } else {
      setSTags([])
    }

    if (profileModal.contact_id) {
      setContactsLoading(true)
      supabase
        .from('contact_table')
        .select('contact_autoinc_id, contact_id, full_name, contact_detail, contact_type, source')
        .eq('contact_id', profileModal.contact_id)
        .then(({ data, error }) => {
          setContactsLoading(false)
          if (error) { onError('Failed to load contacts.'); return }
          setContacts(data ?? [])
        })
    } else {
      setContacts([])
    }
  }, [profileModal?.id, profileModal?.s_tag_id, profileModal?.contact_id])

  useEffect(() => {
    if (!profileRefreshKey) return
    if (profileModal?.s_tag_id) {
      setSTagsLoading(true)
      supabase.from('s_tags_table').select('s_tag_autoinc_id, s_tag_id, s_tag, brand, status, source_link, board_id, item_id')
        .eq('s_tag_id', profileModal.s_tag_id)
        .then(({ data, error }) => { setSTagsLoading(false); if (!error) setSTags(data ?? []) })
    }
    if (profileModal?.contact_id) {
      setContactsLoading(true)
      supabase.from('contact_table').select('contact_autoinc_id, contact_id, full_name, contact_detail, contact_type, source')
        .eq('contact_id', profileModal.contact_id)
        .then(({ data, error }) => { setContactsLoading(false); if (!error) setContacts(data ?? []) })
    }
  }, [profileRefreshKey])

  if (!profileModal) return null

  const row = profileModal

  // ── cell edit helpers ──────────────────────────────────
  const commitCellEdit = async () => {
    if (isCancellingEditRef.current) { isCancellingEditRef.current = false; return }
    if (!editingCell) return
    const { rowId, colKey, value } = editingCell
    setEditingCell(null)
    setSTags((prev) => prev.map((t) => t.s_tag_autoinc_id === rowId ? { ...t, [colKey]: value } : t))
    const { error } = await supabase
      .from('s_tags_table').update({ [colKey]: value }).eq('s_tag_autoinc_id', rowId)
    if (error) onError('Failed to save S-Tag changes.')
  }

  const cancelCellEdit = () => { isCancellingEditRef.current = true; setEditingCell(null) }

  // ── contact cell edit helpers ──────────────────────────
  const commitContactCellEdit = async () => {
    if (isCancellingContactEditRef.current) { isCancellingContactEditRef.current = false; return }
    if (!editingContactCell) return
    const { rowId, colKey, value } = editingContactCell
    if (colKey === 'contact_detail') {
      const contact = contacts.find((c) => c.contact_autoinc_id === rowId)
      if (contact?.contact_type === 'Email' && !isValidEmail(value.trim())) {
        onError('Please enter a valid email address.')
        cancelContactCellEdit()
        return
      }
    }
    setEditingContactCell(null)
    setContacts((prev) => prev.map((c) => c.contact_autoinc_id === rowId ? { ...c, [colKey]: value } : c))
    const { error } = await supabase
      .from('contact_table').update({ [colKey]: value }).eq('contact_autoinc_id', rowId)
    if (error) onError('Failed to save contact changes.')
  }

  const cancelContactCellEdit = () => { isCancellingContactEditRef.current = true; setEditingContactCell(null) }

  // ── contact delete helper ──────────────────────────────
  const handleDeleteContact = async (autoIncId) => {
    const { error } = await supabase
      .from('contact_table')
      .delete()
      .eq('contact_autoinc_id', autoIncId)
    if (error) { onError('Failed to delete contact.'); return }

    const updated = contacts.filter((c) => c.contact_autoinc_id !== autoIncId)
    setContacts(updated)

    if (updated.length === 0) {
      const { error: updateError } = await supabase
        .from('google_lead_gen_table')
        .update({ contact_id: null })
        .eq('id', row.id)
      if (!updateError) onLeadUpdate(row.id, { contact_id: null })
    }
  }

  // ── contact new-row helpers ────────────────────────────
  const canSaveNewContacts = newContactRows.length > 0 && newContactRows.every((r) => {
    if (!r.contact_detail.trim() || !r.contact_type) return false
    if (r.contact_type === 'Email' && !isValidEmail(r.contact_detail.trim())) return false
    return true
  })

  const handleSaveNewContactRows = async () => {
    let contactId = row.contact_id

    if (!contactId) {
      const { data: maxData, error: maxError } = await supabase
        .from('contact_table').select('contact_id').order('contact_id', { ascending: false }).limit(1)
      if (maxError) { onError('Failed to determine next contact ID.'); return }
      contactId = parseInt(maxData?.[0]?.contact_id ?? 0, 10) + 1
      const { error: updateError } = await supabase
        .from('google_lead_gen_table').update({ contact_id: contactId }).eq('id', row.id)
      if (updateError) { onError('Failed to update row with new contact ID.'); return }
      onLeadUpdate(row.id, { contact_id: contactId })
    }

    const { error: insertError } = await supabase
      .from('contact_table')
      .insert(newContactRows.map((r) => ({ contact_id: contactId, full_name: r.full_name, contact_detail: r.contact_detail, contact_type: r.contact_type, source: r.source })))
    if (insertError) { onError('Failed to insert contacts.'); return }

    const { data: refreshData } = await supabase
      .from('contact_table').select('contact_autoinc_id, contact_id, full_name, contact_detail, contact_type, source').eq('contact_id', contactId)
    setContacts(refreshData ?? [])
    setNewContactRows([])
  }

  // ── delete helper ──────────────────────────────────────
  const handleDeleteSTag = async (autoIncId) => {
    const { error } = await supabase
      .from('s_tags_table')
      .delete()
      .eq('s_tag_autoinc_id', autoIncId)
    if (error) { onError('Failed to delete S-Tag.'); return }

    const updated = sTags.filter((t) => t.s_tag_autoinc_id !== autoIncId)
    setSTags(updated)

    if (updated.length === 0) {
      const { error: updateError } = await supabase
        .from('google_lead_gen_table')
        .update({ s_tag_id: null })
        .eq('id', row.id)
      if (!updateError) onLeadUpdate(row.id, { s_tag_id: null })
    }
  }

  // ── new-row helpers ────────────────────────────────────
  const canSaveNew = newRows.length > 0 && newRows.every((r) => r.s_tag.trim() && r.brand.trim())

  const handleSaveNewRows = async () => {
    let sTagId = row.s_tag_id

    if (!sTagId) {
      const { data: maxData, error: maxError } = await supabase
        .from('s_tags_table').select('s_tag_id').order('s_tag_id', { ascending: false }).limit(1)
      if (maxError) { onError('Failed to determine next S-Tag ID.'); return }
      sTagId = parseInt(maxData?.[0]?.s_tag_id ?? 0, 10) + 1
      const { error: updateError } = await supabase
        .from('google_lead_gen_table').update({ s_tag_id: sTagId }).eq('id', row.id)
      if (updateError) { onError('Failed to update row with new S-Tag ID.'); return }
      onLeadUpdate(row.id, { s_tag_id: sTagId })
    }

    const { error: insertError } = await supabase
      .from('s_tags_table')
      .insert(newRows.map((r) => ({ s_tag_id: sTagId, s_tag: r.s_tag, brand: r.brand, status: r.status, source_link: r.source_link })))
    if (insertError) { onError('Failed to insert S-Tags.'); return }

    const { data: refreshData } = await supabase
      .from('s_tags_table').select('s_tag_autoinc_id, s_tag_id, s_tag, brand, status, source_link, board_id, item_id').eq('s_tag_id', sTagId)
    setSTags(refreshData ?? [])
    setNewRows([])
  }

  // ── display helpers ────────────────────────────────────
  const roosterLabel =
    row.is_rooster_partner === true  || row.is_rooster_partner === 'true'  ? 'Yes' :
    row.is_rooster_partner === false || row.is_rooster_partner === 'false' ? 'No'  : '—'

  const roosterIsTrue  = row.is_rooster_partner === true  || row.is_rooster_partner === 'true'
  const roosterIsFalse = row.is_rooster_partner === false || row.is_rooster_partner === 'false'
  const roosterIsSet   = roosterIsTrue || roosterIsFalse

  let timestampLabel = '—'
  if (row.time_stamp) {
    const d = new Date(row.time_stamp)
    timestampLabel = isNaN(d.getTime()) ? String(row.time_stamp)
      : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  }

  const fields = [
    { label: 'ID',               value: row.id       ?? '—' },
    { label: 'Batch ID',         value: row.batch_id ?? '—' },
    { label: 'Keyword',          value: row.keyword  ?? '—' },
    { label: 'Country',          value: row.country  ?? '—' },
    { label: 'Full URL',         value: row.url      ?? '—', isUrl: true },
    { label: 'Clean Domain',     value: row.domain   ?? '—', isUrl: true },
    { label: 'Position on Page', value: row.position_on_page ?? '—' },
    { label: 'Page #',           value: row.page_number      ?? '—' },
    { label: 'Overall Position', value: row.overall_position ?? '—' },
    { label: 'Result Type',      value: row.result_type      ?? '—' },
    { label: 'Rooster Partner',  value: roosterLabel },
    { label: 'Affiliate Name',   value: row.affiliate_name ?? '—' },
    { label: 'Status',           value: row.status   ?? '—' },
    { label: 'Remarks',          value: row.remarks  ?? '—' },
    { label: 'Timestamp',        value: timestampLabel },
  ]

  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--profile" onClick={(e) => e.stopPropagation()}>
        <div className="profile-topbar">
          {row.screenshot_view_link && (
            <button className="btn-modal-x" title="View Screenshot" onClick={() => setShowScreenshot(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          )}
          {row.screenshot_content_link && (
            <a href={row.screenshot_content_link} download target="_blank" rel="noopener noreferrer" className="btn-modal-x" title="Download Screenshot">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </a>
          )}
          {row.result_type === 'PPC' && (
            <button className="btn-modal-cancel" style={{ padding: '0.3rem 0.75rem', fontSize: '0.82rem' }} onClick={() => onTakeScreenshot(row)}>Take Screenshot</button>
          )}
          <button className="btn-modal-x" onClick={onClose} title="Close">✕</button>
        </div>
        <h2 className="modal-title">Row Profile</h2>

        {/* ── Details grid ── */}
        <div className="profile-grid">
          {fields.map(({ label, value, isUrl }) => (
            <div key={label} className="profile-row">
              <span className="profile-label">{label}</span>
              <span className="profile-value">
                {isUrl && value && value !== '—'
                  ? <a href={value} target="_blank" rel="noreferrer" className="cell-link">{value}</a>
                  : String(value)}
              </span>
            </div>
          ))}
        </div>

        {roosterIsSet && !isInvalid(row.status) && <hr className="profile-divider" />}

        {/* ── S-Tags section ── */}
        {roosterIsSet && !isInvalid(row.status) && <div className="profile-section">
          <div className="profile-section-header">
            <h3 className="profile-section-title">S-Tags</h3>
            <p className="table-hint" style={{ margin: 0 }}>Double-click a cell to edit.</p>
            <button className="btn-modal-cancel" style={{ marginLeft: 'auto' }} onClick={() => {
              const rp = row.is_rooster_partner
              if (rp !== true && rp !== 'true' && rp !== false && rp !== 'false') {
                onError('Rooster Partner must be set before collecting S-Tags.')
                return
              }
              onCollectSTags(row)
            }}>Collect S-Tags</button>
            <span style={{ color: '#9ca3af', fontWeight: 600 }}>›</span>
            <button className="btn-modal-cancel" onClick={() => onCheckSTags(sTags)}>Check S-Tags</button>
          </div>

          {sTagsLoading ? (
            <div className="modal-icon modal-icon--loading" style={{ margin: '0.75rem auto' }}><span className="spinner" /></div>
          ) : (
            <div className="stags-table-wrapper">
              <table className="stags-table">
                <thead>
                  <tr>
                    <th>S-Tag ID</th>
                    <th>S-Tag <span className="field-required">*</span></th>
                    <th>Brand <span className="field-required">*</span></th>
                    {newRows.length === 0 && <th>Status</th>}
                    {newRows.length === 0 && <th>Source</th>}
                    <th style={{ width: '32px' }}></th>
                    <th style={{ width: '32px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sTags.length === 0 && newRows.length === 0 ? (
                    <tr><td colSpan={5} className="no-data">No S-Tags yet.</td></tr>
                  ) : (
                    <>
                      {sTags.map((tag) => (
                        <tr key={tag.s_tag_autoinc_id}>
                          <td>{tag.s_tag_id}</td>
                          {['s_tag', 'brand', 'status', 'source_link'].map((colKey) => {
                            if ((colKey === 'status' || colKey === 'source_link') && newRows.length > 0) return null
                            const editable = colKey !== 'status' && colKey !== 'source_link'
                            const isEditing = editable && editingCell?.rowId === tag.s_tag_autoinc_id && editingCell?.colKey === colKey
                            return (
                              <td
                                key={colKey}
                                className={isEditing ? 'cell--editing' : editable ? 'cell--editable' : undefined}
                                onDoubleClick={editable && !isEditing ? () => setEditingCell({ rowId: tag.s_tag_autoinc_id, colKey, value: tag[colKey] ?? '' }) : undefined}
                              >
                                {isEditing ? (
                                  <input
                                    className="cell-edit-input"
                                    type="text"
                                    value={editingCell.value}
                                    autoFocus
                                    onChange={(e) => setEditingCell((prev) => ({ ...prev, value: e.target.value }))}
                                    onBlur={commitCellEdit}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter')  e.currentTarget.blur()
                                      if (e.key === 'Escape') cancelCellEdit()
                                      if (e.key === 'Tab')    { e.preventDefault(); commitCellEdit() }
                                    }}
                                  />
                                ) : colKey === 'source_link' && tag[colKey] && tag[colKey] !== 'N/A'
                                  ? <a href={tag[colKey].startsWith('http') ? tag[colKey] : `https://${tag[colKey]}`} target="_blank" rel="noopener noreferrer" className="tb-cell-link">Click here</a>
                                  : (tag[colKey] ?? '—')}
                              </td>
                            )
                          })}
                          <td>
                            <button className="btn-remove-row" title="Delete S-Tag" onClick={() => handleDeleteSTag(tag.s_tag_autoinc_id)}>✕</button>
                          </td>
                          <td>
                            {tag.source_link && tag.source_link !== 'N/A' && (
                              <button className="btn-remove-row" title="Send Update on Monday.com" onClick={() => onSendSTagUpdate(tag)}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {newRows.map((nr, i) => (
                        <tr key={`new-${i}`}>
                          <td className="profile-value" style={{ color: '#9ca3af' }}>—</td>
                          <td>
                            <input
                              className="cell-edit-input"
                              type="text"
                              value={nr.s_tag}
                              placeholder="S-Tag value"
                              onChange={(e) => setNewRows((prev) => prev.map((r, idx) => idx === i ? { ...r, s_tag: e.target.value } : r))}
                            />
                          </td>
                          <td>
                            <input
                              className="cell-edit-input"
                              type="text"
                              value={nr.brand}
                              placeholder="Brand"
                              onChange={(e) => setNewRows((prev) => prev.map((r, idx) => idx === i ? { ...r, brand: e.target.value } : r))}
                            />
                          </td>
                          <td>
                            <button className="btn-remove-row" onClick={() => setNewRows((prev) => prev.filter((_, idx) => idx !== i))}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="profile-stags-actions">
            <button className="btn-add-row" onClick={() => setNewRows((prev) => [...prev, { s_tag: '', brand: '', status: 'Manual Input', source_link: 'N/A' }])}>+ Add S-Tag</button>
            {newRows.length > 0 && (
              <div className="modal-actions" style={{ marginTop: '0.5rem' }}>
                <button className="btn-modal-cancel" onClick={() => setNewRows([])}>Cancel</button>
                <button className="modal-close-btn" disabled={!canSaveNew} onClick={handleSaveNewRows} style={{ marginTop: 0 }}>Save</button>
              </div>
            )}
          </div>
        </div>}

        {roosterIsFalse && !isInvalid(row.status) && <hr className="profile-divider" />}

        {/* ── Contacts section ── */}
        {roosterIsFalse && !isInvalid(row.status) && <div className="profile-section">
          <div className="profile-section-header">
            <h3 className="profile-section-title">Contacts</h3>
            <p className="table-hint" style={{ margin: 0 }}>Double-click a cell to edit.</p>
            <button className="btn-modal-cancel" style={{ marginLeft: 'auto' }} onClick={() => onCollectContacts(row)}>Collect Email &amp; Contact Info</button>
          </div>

          {contactsLoading ? (
            <div className="modal-icon modal-icon--loading" style={{ margin: '0.75rem auto' }}><span className="spinner" /></div>
          ) : (
            <div className="stags-table-wrapper">
              <table className="stags-table">
                <thead>
                  <tr>
                    <th>Contact ID</th>
                    <th>Full Name</th>
                    <th>Detail <span className="field-required">*</span></th>
                    <th>Type <span className="field-required">*</span></th>
                    {newContactRows.length === 0 && <th>Source</th>}
                    <th style={{ width: '32px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.length === 0 && newContactRows.length === 0 ? (
                    <tr><td colSpan={6} className="no-data">No contacts yet.</td></tr>
                  ) : (
                    <>
                      {contacts.map((contact) => (
                        <tr key={contact.contact_autoinc_id}>
                          <td>{contact.contact_id}</td>
                          {['full_name', 'contact_detail', 'contact_type', 'source'].map((colKey) => {
                            if (colKey === 'source' && newContactRows.length > 0) return null
                            const editable = colKey !== 'source'
                            const isEditing = editable && editingContactCell?.rowId === contact.contact_autoinc_id && editingContactCell?.colKey === colKey
                            return (
                              <td
                                key={colKey}
                                className={isEditing ? 'cell--editing' : editable ? 'cell--editable' : undefined}
                                onDoubleClick={editable && !isEditing ? () => setEditingContactCell({ rowId: contact.contact_autoinc_id, colKey, value: contact[colKey] ?? '' }) : undefined}
                              >
                                {isEditing ? (
                                  colKey === 'contact_type' ? (
                                    <select
                                      className="cell-edit-select"
                                      value={editingContactCell.value}
                                      autoFocus
                                      onChange={(e) => setEditingContactCell((prev) => ({ ...prev, value: e.target.value }))}
                                      onBlur={commitContactCellEdit}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter')  e.currentTarget.blur()
                                        if (e.key === 'Escape') cancelContactCellEdit()
                                      }}
                                    >
                                      <option value="">Select type</option>
                                      {CONTACT_TYPE_OPTIONS.map((opt) => (
                                        <option key={opt} value={opt}>{opt}</option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      className="cell-edit-input"
                                      type="text"
                                      value={editingContactCell.value}
                                      autoFocus
                                      onChange={(e) => setEditingContactCell((prev) => ({ ...prev, value: e.target.value }))}
                                      onBlur={commitContactCellEdit}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter')  e.currentTarget.blur()
                                        if (e.key === 'Escape') cancelContactCellEdit()
                                        if (e.key === 'Tab')    { e.preventDefault(); commitContactCellEdit() }
                                      }}
                                    />
                                  )
                                ) : (contact[colKey] ?? '—')}
                              </td>
                            )
                          })}
                          <td>
                            <button className="btn-remove-row" title="Delete contact" onClick={() => handleDeleteContact(contact.contact_autoinc_id)}>✕</button>
                          </td>
                        </tr>
                      ))}
                      {newContactRows.map((nr, i) => (
                        <tr key={`new-contact-${i}`}>
                          <td className="profile-value" style={{ color: '#9ca3af' }}>—</td>
                          <td>
                            <input
                              className="cell-edit-input"
                              type="text"
                              value={nr.full_name}
                              placeholder="Full name"
                              onChange={(e) => setNewContactRows((prev) => prev.map((r, idx) => idx === i ? { ...r, full_name: e.target.value } : r))}
                            />
                          </td>
                          <td>
                            <input
                              className="cell-edit-input"
                              type="text"
                              value={nr.contact_detail}
                              placeholder="Contact detail"
                              onChange={(e) => setNewContactRows((prev) => prev.map((r, idx) => idx === i ? { ...r, contact_detail: e.target.value } : r))}
                            />
                          </td>
                          <td>
                            <select
                              className="cell-edit-input"
                              value={nr.contact_type}
                              onChange={(e) => setNewContactRows((prev) => prev.map((r, idx) => idx === i ? { ...r, contact_type: e.target.value } : r))}
                            >
                              <option value="">Select type</option>
                              {CONTACT_TYPE_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <button className="btn-remove-row" onClick={() => setNewContactRows((prev) => prev.filter((_, idx) => idx !== i))}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="profile-stags-actions">
            <button className="btn-add-row" onClick={() => setNewContactRows((prev) => [...prev, { full_name: '', contact_detail: '', contact_type: '', source: 'Manual Input' }])}>+ Add Contact</button>
            {newContactRows.length > 0 && (
              <div className="modal-actions" style={{ marginTop: '0.5rem' }}>
                <button className="btn-modal-cancel" onClick={() => setNewContactRows([])}>Cancel</button>
                <button className="modal-close-btn" disabled={!canSaveNewContacts} onClick={handleSaveNewContactRows} style={{ marginTop: 0 }}>Save</button>
              </div>
            )}
          </div>
        </div>}

        {/* ── Add to Monday.com ── */}
        {(() => {
          const hiddenStatuses = ['Non-affiliate Website', 'INVALID', 'Invalid', 'LEAD', 'Lead']
          const shouldHide = hiddenStatuses.includes(row.status) || row.is_rooster_partner === true
          if (shouldHide) return null

          const missing = []
          const hasSTagId = !!row.s_tag_id
          const hasSTagRows = sTags.length > 0
          const allSTagsNotFound = hasSTagRows && sTags.every((t) => t.status === 'Not Found on Monday.com')
          if (!hasSTagId || !hasSTagRows) missing.push('S-Tags must be collected')
          else if (!allSTagsNotFound) missing.push('All S-Tags must have status "Not Found on Monday.com"')

          const hasContactId = !!row.contact_id
          const hasContactRows = contacts.length > 0
          if (!hasContactId || !hasContactRows) missing.push('Contacts must be collected')

          if (row.is_rooster_partner !== false) missing.push('Rooster Partner must be set to FALSE')

          if (row.result_type === 'PPC') {
            if (!row.screenshot_view_link) missing.push('Screenshot view link is missing (take a screenshot first)')
            if (!row.screenshot_content_link) missing.push('Screenshot content link is missing (take a screenshot first)')
          }

          const canAdd = missing.length === 0

          return (
            <div className="profile-section profile-monday-section">
              <h4 className="profile-section-title">Add to Monday.com</h4>
              <p className="profile-monday-hint">This is the final step. Once confirmed, this lead will be added to Monday.com.</p>
              {!canAdd && (
                <ul className="profile-monday-missing">
                  {missing.map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              )}
              <button className="btn-monday" disabled={!canAdd} onClick={() => onAddToMonday(row)}>Add Lead on Monday.com</button>
            </div>
          )
        })()}

      </div>
    </div>

    {/* ── Screenshot modal ── */}
    {showScreenshot && row.screenshot_view_link && (
      <div className="modal-overlay screenshot-modal-overlay" onClick={() => setShowScreenshot(false)}>
        <div className="screenshot-modal" onClick={(e) => e.stopPropagation()}>
          <button className="btn-modal-x screenshot-modal-close" onClick={() => setShowScreenshot(false)} title="Close">✕</button>
          <img
            src={toGoogleDriveImageUrl(row.screenshot_view_link)}
            alt="Screenshot"
            className="screenshot-modal-img"
            onError={(e) => { e.currentTarget.alt = 'Image could not be loaded.' }}
          />
        </div>
      </div>
    )}
    </>
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
  const [passwordModal, setPasswordModal] = useState(null)
  const [profileModal, setProfileModal] = useState(null)
  const [profileRefreshKey, setProfileRefreshKey] = useState(0)
  const [editingCell, setEditingCell] = useState(null) // { rowId, colKey, value }
  const [sortCol, setSortCol] = useState(null)  // column key
  const [sortDir, setSortDir] = useState(null)  // 'asc' | 'desc' | null
  const [filterOpen, setFilterOpen] = useState(null)  // column key of open filter popup, or null
  const [activeFilters, setActiveFilters] = useState({})  // { [colKey]: Set }
  const [textFilters, setTextFilters] = useState({})      // { [colKey]: string } — committed on Enter
  const [textFilterDrafts, setTextFilterDrafts] = useState({})  // { [colKey]: string } — live input value
  const filterPopupRef = useRef(null)
  const pollRef            = useRef(null)
  const isCancellingEditRef = useRef(false)

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
    if (!error) {
      setLeads(data ?? [])
      setProfileModal((prev) => {
        if (!prev) return null
        const fresh = (data ?? []).find((r) => r.id === prev.id)
        return fresh ? { ...prev, ...fresh } : prev
      })
    }
    setTableLoading(false)
  }

  // ── Click-outside to close filter popup ─────────────────
  useEffect(() => {
    if (!filterOpen) return
    const handler = (e) => { if (filterPopupRef.current && !filterPopupRef.current.contains(e.target)) setFilterOpen(null) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [filterOpen])

  const getUniqueValues = (colKey) => [...new Set(leads.map((r) => r[colKey]).filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true })
  )

  const toggleFilterValue = (colKey, val) => setActiveFilters((prev) => {
    const cur = new Set(prev[colKey] ?? [])
    cur.has(val) ? cur.delete(val) : cur.add(val)
    return { ...prev, [colKey]: cur }
  })

  const clearFilter = (colKey) => setActiveFilters((prev) => { const next = { ...prev }; delete next[colKey]; return next })

  const searchTerm = search.trim()
  const SEARCH_EXCLUDE_KEYS = new Set(['is_rooster_partner', 's_tag_id', 'contact_id', 'remarks'])
  const columnFilteredLeads = leads.filter((r) => {
    const passesText = Object.entries(textFilters).every(([key, term]) => {
      if (!term.trim()) return true
      return String(r[key] ?? '').toLowerCase().includes(term.trim().toLowerCase())
    })
    if (!passesText) return false
    return Object.entries(activeFilters).every(([key, set]) => {
      if (!set || set.size === 0) return true
      const col = TABLE_COLUMNS.find((c) => c.key === key)
      if (col?.filterType === 'boolean') {
        const v = r[key]
        if (set.has('Yes')     && (v === true  || v === 'true'))  return true
        if (set.has('No')      && (v === false || v === 'false')) return true
        if (set.has('Not Set') && (v === null  || v === undefined)) return true
        return false
      }
      if (col?.filterType === 'presence') {
        const v = r[key]
        if (set.has('Yes') && (v !== null && v !== undefined)) return true
        if (set.has('No')  && (v === null || v === undefined))  return true
        return false
      }
      if (col?.filterOptions) {
        const v = r[key]
        if (set.has('Not Set') && (v === null || v === undefined || v === '')) return true
        if ([...set].filter((s) => s !== 'Not Set').some((s) => String(v).toUpperCase() === s.toUpperCase())) return true
        return false
      }
      return set.has(r[key])
    })
  })
  const filteredLeads = searchTerm.length >= 3
    ? columnFilteredLeads.filter((row) =>
        Object.entries(row).some(([key, val]) =>
          !SEARCH_EXCLUDE_KEYS.has(key) && val != null && String(val).toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    : columnFilteredLeads

  const handleSortClick = (key) => {
    if (sortCol !== key) { setSortCol(key); setSortDir('asc'); return }
    if (sortDir === 'asc')  { setSortDir('desc'); return }
    setSortCol(null); setSortDir(null)
  }

  const sortedLeads = sortCol && sortDir
    ? [...filteredLeads].sort((a, b) => {
        const av = a[sortCol] ?? ''
        const bv = b[sortCol] ?? ''
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' })
        return sortDir === 'asc' ? cmp : -cmp
      })
    : filteredLeads

  const selectableLeads = sortedLeads.filter((r) => !isInvalid(r.status))
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
    if (modal?.phase === 'success') {
      fetchLeads()
      setProfileRefreshKey((k) => k + 1)
    }
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

  const commitCellEdit = async () => {
    if (isCancellingEditRef.current) {
      isCancellingEditRef.current = false
      return
    }
    if (!editingCell) return
    const { rowId, colKey, value } = editingCell
    setEditingCell(null)
    setLeads((prev) => prev.map((r) => r.id === rowId ? { ...r, [colKey]: value } : r))
    const { error } = await supabase
      .from('google_lead_gen_table')
      .update({ [colKey]: value })
      .eq('id', rowId)
    if (error) {
      setModal({ phase: 'error', data: { message: 'Failed to save changes.' } })
      fetchLeads()
    }
  }

  const cancelCellEdit = () => {
    isCancellingEditRef.current = true
    setEditingCell(null)
  }

  const handleBatchActionClick = (webhookUrl, extraFields = []) => async () => {
    if (selectedRows.size > 0) {
      const payload = leads
        .filter((r) => selectedRows.has(r.id) && !isInvalid(r.status))
        .map((r) => ({ id: r.id, url: r.url, domain: r.domain, ...Object.fromEntries(extraFields.map((f) => [f, r[f] ?? null])) }))
      await sendToWebhook(webhookUrl, payload)
      return
    }
    await openBatchModal(webhookUrl)
  }

  const handleLeadUpdate = (rowId, updates) => {
    setLeads((prev) => prev.map((r) => r.id === rowId ? { ...r, ...updates } : r))
    setProfileModal((prev) => prev ? { ...prev, ...updates } : prev)
  }

  const handlePasswordConfirm = () => {
    if (passwordModal.input !== MONDAY_PASSWORD) {
      setPasswordModal((prev) => ({ ...prev, error: 'Incorrect password. Please try again.' }))
      return
    }
    const onSuccess = passwordModal.onSuccess
    setPasswordModal(null)
    if (onSuccess) onSuccess()
  }

  const handleBatchConfirm = async (batchId) => {
    setBatchModal(null)

    const { data, error } = await supabase
      .from('google_lead_gen_table')
      .select('id, url, domain, status')
      .eq('batch_id', batchId)

    if (error) {
      setModal({ phase: 'error', data: { message: 'Failed to fetch records for the selected batch.' } })
      return
    }

    const payload = data
      .filter((r) => !isInvalid(r.status))
      .map((r) => ({ id: r.id, url: r.url, domain: r.domain }))
    await sendToWebhook(pendingWebhookUrl, payload)
  }

  return (
    <div className="container">
      <h1 className="title">Google Lead Gen</h1>

      <div className="search-card">
        <form className="search-bar" onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}>
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
        </div>
      </div>

      <div className="table-card">
        <p className="table-hint">Double-click a cell in the <strong>Rooster Partner</strong>, <strong>Affiliate Name</strong>, or <strong>Status</strong> columns to edit it.</p>
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
                <th className="col-view"></th>
                {TABLE_COLUMNS.map((col) => (
                  <th key={col.key} className={col.key === 's_tag_id' ? 'col-stag' : col.key === 'is_rooster_partner' ? 'col-rooster' : col.key === 'contact_id' ? 'col-contact' : undefined}>
                    <span className="th-content">
                      {col.label}
                      {!col.noSort && (
                        <button className="sort-btn" onClick={() => handleSortClick(col.key)} title={`Sort by ${col.label}`}>
                          {sortCol === col.key && sortDir === 'asc' ? '↑' : sortCol === col.key && sortDir === 'desc' ? '↓' : '↕'}
                        </button>
                      )}
                      {col.hasFilter && (
                        <span className="batch-filter-wrap" ref={filterOpen === col.key ? filterPopupRef : null}>
                          <button
                            className={`sort-btn batch-filter-btn${(activeFilters[col.key]?.size > 0 || textFilters[col.key]?.trim()) ? ' batch-filter-btn--active' : ''}`}
                            title={`Filter by ${col.label}`}
                            onClick={() => setFilterOpen((v) => v === col.key ? null : col.key)}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>
                          </button>
                          {filterOpen === col.key && (
                            <div className="batch-filter-popup">
                              <div className="batch-filter-header">
                                <span>Filter by {col.label}</span>
                                {(activeFilters[col.key]?.size > 0 || textFilters[col.key]?.trim()) && (
                                  <button className="batch-filter-clear" onClick={() => {
                                    clearFilter(col.key)
                                    setTextFilters((prev) => { const next = { ...prev }; delete next[col.key]; return next })
                                    setTextFilterDrafts((prev) => { const next = { ...prev }; delete next[col.key]; return next })
                                  }}>Clear</button>
                                )}
                              </div>
                              {col.filterType === 'text' && <p className="batch-filter-hint">Press Enter to apply.</p>}
                              {col.filterType === 'text' ? (
                                <div className="batch-filter-text">
                                  <input
                                    className="batch-filter-text-input"
                                    type="text"
                                    placeholder={`Search ${col.label}…`}
                                    value={textFilterDrafts[col.key] ?? ''}
                                    onChange={(e) => setTextFilterDrafts((prev) => ({ ...prev, [col.key]: e.target.value }))}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') setTextFilters((prev) => ({ ...prev, [col.key]: e.target.value }))
                                    }}
                                    autoFocus
                                  />
                                </div>
                              ) : (
                              <ul className="batch-filter-list">
                                {(col.filterType === 'boolean' ? ['Yes', 'No', 'Not Set'] : col.filterType === 'presence' ? ['Yes', 'No'] : col.filterOptions ? col.filterOptions : getUniqueValues(col.key)).map((val) => (
                                  <li key={val} className="batch-filter-item">
                                    <label>
                                      <input
                                        type="checkbox"
                                        checked={activeFilters[col.key]?.has(val) ?? false}
                                        onChange={() => toggleFilterValue(col.key, val)}
                                      />
                                      {(col.filterType === 'boolean' || col.filterType === 'presence') && (
                                        <span className={val === 'Yes' ? 'stag-indicator stag-indicator--yes' : val === 'No' ? 'stag-indicator stag-indicator--no' : 'stag-indicator stag-indicator--unknown'}>
                                          {val === 'Yes' ? '✓' : val === 'No' ? '✗' : '?'}
                                        </span>
                                      )}
                                      {val}
                                    </label>
                                  </li>
                                ))}
                              </ul>
                              )}
                            </div>
                          )}
                        </span>
                      )}
                    </span>
                  </th>
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
              ) : sortedLeads.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length + 1} className="no-data">
                    {searchTerm.length >= 3 ? `No results for "${searchTerm}".` : 'No data to display.'}
                  </td>
                </tr>
              ) : (
                sortedLeads.map((row) => (
                  <tr key={row.id} className={[selectedRows.has(row.id) ? 'row-selected' : '', isInvalid(row.status) ? 'row-invalid' : '', isLead(row.status) ? 'row-lead' : ''].filter(Boolean).join(' ')}>
                    <td className="col-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(row.id)}
                        onChange={() => toggleRow(row.id)}
                        disabled={isInvalid(row.status)}
                      />
                    </td>
                    <td className="col-view">
                      <button className="btn-row-view" title="View profile" onClick={() => setProfileModal(row)}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                      </button>
                    </td>
                    {TABLE_COLUMNS.map((col) => {
                      const raw = row[col.key]
                      const editConf = EDITABLE_COLS[col.key]
                      const isEditing = editingCell?.rowId === row.id && editingCell?.colKey === col.key

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

                      const baseClass = col.key === 'remarks' ? 'col-remarks' : col.key === 'url' ? 'col-url' : col.key === 'domain' ? 'col-domain' : col.key === 's_tag_id' ? 'col-stag' : col.key === 'is_rooster_partner' ? 'col-rooster' : col.key === 'contact_id' ? 'col-contact' : undefined
                      const className = [baseClass, isEditing ? 'cell--editing' : (editConf && !isInvalid(row.status)) ? 'cell--editable' : ''].filter(Boolean).join(' ') || undefined

                      return (
                        <td
                          key={col.key}
                          className={className}
                          title={isEditing ? undefined : String(value)}
                          onDoubleClick={editConf && !isEditing && !isInvalid(row.status) ? () => setEditingCell({ rowId: row.id, colKey: col.key, value: getInitialEditValue(col.key, raw) }) : undefined}
                        >
                          {isEditing ? (
                            editConf.type === 'dropdown' ? (
                              <select
                                className="cell-edit-select"
                                value={String(editingCell.value)}
                                autoFocus
                                onChange={(e) => {
                                  const opt = editConf.options.find((o) => String(o.value) === e.target.value)
                                  setEditingCell((prev) => ({ ...prev, value: opt ? opt.value : e.target.value }))
                                }}
                                onBlur={commitCellEdit}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') e.currentTarget.blur()
                                  if (e.key === 'Escape') cancelCellEdit()
                                  if (e.key === 'Tab') { e.preventDefault(); commitCellEdit() }
                                }}
                              >
                                {editConf.options.map((opt) => (
                                  <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                className="cell-edit-input"
                                type="text"
                                value={editingCell.value}
                                autoFocus
                                onChange={(e) => setEditingCell((prev) => ({ ...prev, value: e.target.value }))}
                                onBlur={commitCellEdit}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') e.currentTarget.blur()
                                  if (e.key === 'Escape') cancelCellEdit()
                                  if (e.key === 'Tab') { e.preventDefault(); commitCellEdit() }
                                }}
                              />
                            )
                          ) : col.key === 'country' ? (
                            (() => {
                              const code = resolveCountryCode(raw)
                              return code
                                ? <span className="country-cell" title={raw}>
                                    <img src={`https://flagcdn.com/20x15/${code.toLowerCase()}.png`} alt={code} />
                                    {code}
                                  </span>
                                : (raw ? <span>{raw}</span> : '—')
                            })()
                          ) : col.key === 'result_type' ? (
                            <span className={`result-type-badge ${raw === 'PPC' ? 'result-type--ppc' : raw === 'Organic' ? 'result-type--organic' : 'result-type--other'}`} title={raw ?? '—'}>
                              {raw === 'PPC' ? (
                                <>
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                                  PPC
                                </>
                              ) : raw === 'Organic' ? (
                                <>
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
                                  Organic
                                </>
                              ) : (raw ?? '—')}
                            </span>
                          ) : col.key === 'is_rooster_partner' ? (
                            <span className={
                              (raw === true || raw === 'true')  ? 'stag-indicator stag-indicator--yes' :
                              (raw === false || raw === 'false') ? 'stag-indicator stag-indicator--no' :
                              'stag-indicator stag-indicator--unknown'
                            }>
                              {(raw === true || raw === 'true') ? '✓' : (raw === false || raw === 'false') ? '✗' : '?'}
                            </span>
                          ) : col.key === 's_tag_id' ? (
                            <span className={row[col.key] ? 'stag-indicator stag-indicator--yes' : 'stag-indicator stag-indicator--no'}>
                              {row[col.key] ? '✓' : '✗'}
                            </span>
                          ) : col.key === 'contact_id' ? (
                            <span className={row[col.key] ? 'stag-indicator stag-indicator--yes' : 'stag-indicator stag-indicator--no'}>
                              {row[col.key] ? '✓' : '✗'}
                            </span>
                          ) : (col.key === 'url' || col.key === 'domain') && row[col.key] ? (
                            <a href={row[col.key]} target="_blank" rel="noreferrer" className="cell-link">
                              {row[col.key]}
                            </a>
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

      <ProfileModal
        profileModal={profileModal}
        onClose={() => setProfileModal(null)}
        onLeadUpdate={handleLeadUpdate}
        onError={(msg) => setModal({ phase: 'error', data: { message: msg } })}
        profileRefreshKey={profileRefreshKey}
        onCheckSTags={(sTags) => sendToWebhook(N8N_CHECK_STAGS_WEBHOOK, sTags.map((t) => ({ s_tag_autoinc_id: t.s_tag_autoinc_id, s_tag_id: t.s_tag_id, s_tag: t.s_tag, brand: t.brand })))}
        onCollectSTags={(row) => sendToWebhook(N8N_STAGS_WEBHOOK, { id: row.id, url: row.url, domain: row.domain, country: row.country ?? null, is_rooster_partner: row.is_rooster_partner ?? null })}
        onCollectContacts={(row) => sendToWebhook(N8N_CONTACTS_WEBHOOK, { id: row.id, url: row.url, domain: row.domain, country: row.country ?? null, is_rooster_partner: row.is_rooster_partner ?? null })}
        onTakeScreenshot={(row) => sendToWebhook(N8N_PPC_WEBHOOK, { id: row.id, url: row.url, domain: row.domain, result_type: row.result_type ?? null, country: row.country ?? null, is_rooster_partner: row.is_rooster_partner ?? null })}
        onSendSTagUpdate={(tag) => setPasswordModal({ input: '', error: '', onSuccess: () => sendToWebhook(N8N_STAG_UPDATE_WEBHOOK, { s_tag_autoinc_id: tag.s_tag_autoinc_id, s_tag_id: tag.s_tag_id, s_tag: tag.s_tag, brand: tag.brand, domain: profileModal?.domain ?? null, board_id: tag.board_id ?? null, item_id: tag.item_id ?? null }) })}
        onAddToMonday={(row) => setPasswordModal({ input: '', error: '', onSuccess: () => sendToWebhook(N8N_MONDAY_WEBHOOK, { id: row.id, url: row.url, domain: row.domain }) })}
      />

      <Modal modal={modal} onClose={handleModalClose} />

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
