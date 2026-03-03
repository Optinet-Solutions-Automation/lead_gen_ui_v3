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
const POLL_TIMEOUT_MS  = 10 * 60 * 1000 // 10 minutes

const TABLE_COLUMNS = [
  { key: 'id',                 label: 'ID' },
  { key: 'batch_id',           label: 'Batch ID' },
  { key: 'keyword',            label: 'Keyword' },
  { key: 'country',            label: 'Country' },
  { key: 'url',                label: 'Full URL' },
  { key: 'domain',             label: 'Clean Domain' },
  { key: 'result_type',        label: 'Result Type' },
  { key: 'is_rooster_partner', label: 'Rooster Partner' },
  { key: 's_tag_id',           label: 'S-Tag' },
  { key: 'contact_id',         label: 'Contact' },
  { key: 'affiliate_name',     label: 'Affiliate Name' },
  { key: 'status',             label: 'Status' },
  { key: 'remarks',            label: 'Remarks' },
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


const CONTACT_TYPE_OPTIONS = ['Email', 'Phone', 'LinkedIn', 'Website']

function ProfileModal({ profileModal, onClose, onLeadUpdate, onError, onCollectSTags }) {
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
        .select('s_tag_autoinc_id, s_tag_id, s_tag, brand')
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
        .select('contact_autoinc_id, contact_id, contact_detail, contact_type')
        .eq('contact_id', profileModal.contact_id)
        .then(({ data, error }) => {
          setContactsLoading(false)
          if (error) { onError('Failed to load contacts.'); return }
          setContacts(data ?? [])
        })
    } else {
      setContacts([])
    }
  }, [profileModal?.id])

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
      .insert(newContactRows.map((r) => ({ contact_id: contactId, contact_detail: r.contact_detail, contact_type: r.contact_type })))
    if (insertError) { onError('Failed to insert contacts.'); return }

    const { data: refreshData } = await supabase
      .from('contact_table').select('contact_autoinc_id, contact_id, contact_detail, contact_type').eq('contact_id', contactId)
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
      .insert(newRows.map((r) => ({ s_tag_id: sTagId, s_tag: r.s_tag, brand: r.brand })))
    if (insertError) { onError('Failed to insert S-Tags.'); return }

    const { data: refreshData } = await supabase
      .from('s_tags_table').select('s_tag_autoinc_id, s_tag_id, s_tag, brand').eq('s_tag_id', sTagId)
    setSTags(refreshData ?? [])
    setNewRows([])
  }

  // ── display helpers ────────────────────────────────────
  const roosterLabel =
    row.is_rooster_partner === true  || row.is_rooster_partner === 'true'  ? 'Yes' :
    row.is_rooster_partner === false || row.is_rooster_partner === 'false' ? 'No'  : '—'

  const roosterIsTrue  = row.is_rooster_partner === true  || row.is_rooster_partner === 'true'
  const roosterIsSet   = roosterIsTrue || row.is_rooster_partner === false || row.is_rooster_partner === 'false'

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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal--profile" onClick={(e) => e.stopPropagation()}>
        <button className="btn-modal-x" onClick={onClose} title="Close">✕</button>
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

        {roosterIsSet && <hr className="profile-divider" />}

        {/* ── S-Tags section ── */}
        {roosterIsSet && <div className="profile-section">
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
                    <th style={{ width: '32px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {sTags.length === 0 && newRows.length === 0 ? (
                    <tr><td colSpan={4} className="no-data">No S-Tags yet.</td></tr>
                  ) : (
                    <>
                      {sTags.map((tag) => (
                        <tr key={tag.s_tag_autoinc_id}>
                          <td>{tag.s_tag_id}</td>
                          {['s_tag', 'brand'].map((colKey) => {
                            const isEditing = editingCell?.rowId === tag.s_tag_autoinc_id && editingCell?.colKey === colKey
                            return (
                              <td
                                key={colKey}
                                className={isEditing ? 'cell--editing' : 'cell--editable'}
                                onDoubleClick={!isEditing ? () => setEditingCell({ rowId: tag.s_tag_autoinc_id, colKey, value: tag[colKey] ?? '' }) : undefined}
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
                                ) : (tag[colKey] ?? '—')}
                              </td>
                            )
                          })}
                          <td>
                            <button className="btn-remove-row" title="Delete S-Tag" onClick={() => handleDeleteSTag(tag.s_tag_autoinc_id)}>✕</button>
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
            <button className="btn-add-row" onClick={() => setNewRows((prev) => [...prev, { s_tag: '', brand: '' }])}>+ Add S-Tag</button>
            {newRows.length > 0 && (
              <div className="modal-actions" style={{ marginTop: '0.5rem' }}>
                <button className="btn-modal-cancel" onClick={() => setNewRows([])}>Cancel</button>
                <button className="modal-close-btn" disabled={!canSaveNew} onClick={handleSaveNewRows} style={{ marginTop: 0 }}>Save</button>
              </div>
            )}
          </div>
        </div>}

        {roosterIsTrue && <hr className="profile-divider" />}

        {/* ── Contacts section ── */}
        {roosterIsTrue && <div className="profile-section">
          <div className="profile-section-header">
            <h3 className="profile-section-title">Contacts</h3>
            <p className="table-hint" style={{ margin: 0 }}>Double-click a cell to edit.</p>
          </div>

          {contactsLoading ? (
            <div className="modal-icon modal-icon--loading" style={{ margin: '0.75rem auto' }}><span className="spinner" /></div>
          ) : (
            <div className="stags-table-wrapper">
              <table className="stags-table">
                <thead>
                  <tr>
                    <th>Contact ID</th>
                    <th>Type <span className="field-required">*</span></th>
                    <th>Detail <span className="field-required">*</span></th>
                    <th style={{ width: '32px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.length === 0 && newContactRows.length === 0 ? (
                    <tr><td colSpan={4} className="no-data">No contacts yet.</td></tr>
                  ) : (
                    <>
                      {contacts.map((contact) => (
                        <tr key={contact.contact_autoinc_id}>
                          <td>{contact.contact_id}</td>
                          {['contact_type', 'contact_detail'].map((colKey) => {
                            const isEditing = editingContactCell?.rowId === contact.contact_autoinc_id && editingContactCell?.colKey === colKey
                            return (
                              <td
                                key={colKey}
                                className={isEditing ? 'cell--editing' : 'cell--editable'}
                                onDoubleClick={!isEditing ? () => setEditingContactCell({ rowId: contact.contact_autoinc_id, colKey, value: contact[colKey] ?? '' }) : undefined}
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
                            <input
                              className="cell-edit-input"
                              type="text"
                              value={nr.contact_detail}
                              placeholder="Contact detail"
                              onChange={(e) => setNewContactRows((prev) => prev.map((r, idx) => idx === i ? { ...r, contact_detail: e.target.value } : r))}
                            />
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
            <button className="btn-add-row" onClick={() => setNewContactRows((prev) => [...prev, { contact_detail: '', contact_type: '' }])}>+ Add Contact</button>
            {newContactRows.length > 0 && (
              <div className="modal-actions" style={{ marginTop: '0.5rem' }}>
                <button className="btn-modal-cancel" onClick={() => setNewContactRows([])}>Cancel</button>
                <button className="modal-close-btn" disabled={!canSaveNewContacts} onClick={handleSaveNewContactRows} style={{ marginTop: 0 }}>Save</button>
              </div>
            )}
          </div>
        </div>}

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
  const [passwordModal, setPasswordModal] = useState(null)
  const [profileModal, setProfileModal] = useState(null)
  const [editingCell, setEditingCell] = useState(null) // { rowId, colKey, value }
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
    if (!error) setLeads(data ?? [])
    setTableLoading(false)
  }

  const searchTerm = search.trim()
  const SEARCH_EXCLUDE_KEYS = new Set(['is_rooster_partner', 's_tag_id', 'contact_id', 'remarks'])
  const filteredLeads = searchTerm.length >= 3
    ? leads.filter((row) =>
        Object.entries(row).some(([key, val]) =>
          !SEARCH_EXCLUDE_KEYS.has(key) && val != null && String(val).toLowerCase().includes(searchTerm.toLowerCase())
        )
      )
    : leads

  const selectableLeads = filteredLeads.filter((r) => !isInvalid(r.status))
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

  const handleBatchActionClick = (webhookUrl) => async () => {
    if (selectedRows.size > 0) {
      const payload = leads
        .filter((r) => selectedRows.has(r.id) && !isInvalid(r.status))
        .map((r) => ({ id: r.id, url: r.url, domain: r.domain }))
      await sendToWebhook(webhookUrl, payload)
      return
    }
    await openBatchModal(webhookUrl)
  }

  const handleLeadUpdate = (rowId, updates) => {
    setLeads((prev) => prev.map((r) => r.id === rowId ? { ...r, ...updates } : r))
    setProfileModal((prev) => prev ? { ...prev, ...updates } : prev)
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
          <button className="btn-action" onClick={handleBatchActionClick(N8N_ROOSTER_WEBHOOK)} disabled={loading}>Check if Rooster Partner</button>
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
                  <th key={col.key} className={col.key === 's_tag_id' ? 'col-stag' : col.key === 'is_rooster_partner' ? 'col-rooster' : col.key === 'contact_id' ? 'col-contact' : undefined}>{col.label}</th>
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
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length + 1} className="no-data">
                    {searchTerm.length >= 3 ? `No results for "${searchTerm}".` : 'No data to display.'}
                  </td>
                </tr>
              ) : (
                filteredLeads.map((row) => (
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
        onCollectSTags={(row) => sendToWebhook(N8N_STAGS_WEBHOOK, { id: row.id, url: row.url, domain: row.domain, country: row.country ?? null, is_rooster_partner: row.is_rooster_partner ?? null })}
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
