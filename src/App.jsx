import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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
const N8N_AFFILIATES_WEBHOOK      = import.meta.env.VITE_N8N_AFFILIATES_WEBHOOK_URL

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS  = 30 * 60 * 1000 // 30 minutes

const TABLE_COLUMNS = [
  { key: 'id',                 label: 'ID' },
  { key: 'batch_id',           label: 'Batch ID',        hasFilter: true, filterType: 'exact' },
  { key: 'keyword',            label: 'Keyword',         hasFilter: true, filterType: 'text' },
  { key: 'country',            label: 'Country',         noSort: true, hasFilter: true },
  { key: 'url',                label: 'Full URL',        hasFilter: true, filterType: 'text' },
  { key: 'domain',             label: 'Clean Domain',    hasFilter: true, filterType: 'text' },
  { key: 'result_type',        label: 'Result Type',                        noSort: true, hasFilter: true },
  { key: 'is_affiliate',       label: 'Is an Affiliate',        noSort: true, hasFilter: true, filterType: 'boolean' },
  { key: 'is_on_monday',       label: 'Is Existing on Monday',  noSort: true, hasFilter: true, filterType: 'boolean' },
  { key: 'is_rooster_partner', label: 'Is Rooster Partner',     noSort: true, hasFilter: true, filterType: 'boolean' },
  { key: 'has_contact_details', label: 'Has Contact Details',    noSort: true, hasFilter: true, filterType: 'boolean' },
  { key: 'has_s_tags',         label: 'Has S-Tags',             noSort: true, hasFilter: true, filterType: 'boolean' },
  { key: 'affiliate_name',     label: 'Affiliate Name',  noSort: true, hasFilter: true, filterType: 'text' },
  { key: 'status',             label: 'Status',          noSort: true, hasFilter: true, filterType: 'text' },
  { key: 'remarks',            label: 'Remarks',         noSort: true },
]

const EDITABLE_COLS = {
  is_affiliate: {
    type: 'dropdown',
    options: [
      { label: 'Yes', value: true  },
      { label: 'No',  value: false },
    ],
  },
  is_on_monday: {
    type: 'dropdown',
    options: [
      { label: 'Yes', value: true  },
      { label: 'No',  value: false },
    ],
  },
  is_rooster_partner: {
    type: 'dropdown',
    options: [
      { label: 'Yes', value: true  },
      { label: 'No',  value: false },
    ],
  },
  affiliate_name: { type: 'text' },
  batch_id:       { type: 'text' },
  remarks:        { type: 'text' },
  status: {
    type: 'dropdown',
    options: [
      { label: 'None',                                                        value: null                                                             },
      { label: 'Not Relevant - Website Down',                                 value: 'Not Relevant - Website Down'                                    },
      { label: 'Not Relevant - No Links',                                     value: 'Not Relevant - No Links'                                        },
      { label: 'Not Relevant - BH Aff',                                       value: 'Not Relevant - BH Aff'                                          },
      { label: 'Not Relevant - App',                                          value: 'Not Relevant - App'                                             },
      { label: 'Not Relevant - Country',                                      value: 'Not Relevant - Country'                                         },
      { label: 'Not Relevant - Generic Site With No Links',                   value: 'Not Relevant - Generic Site With No Links'                      },
      { label: 'Not Relevant - Regulation',                                   value: 'Not Relevant - Regulation'                                      },
      { label: 'Not Relevant - Forum',                                        value: 'Not Relevant - Forum'                                           },
      { label: 'Not Relevant - Operator',                                     value: 'Not Relevant - Operator'                                        },
      { label: 'Relevant - BH Aff No Links On Site But Exists On Monday',     value: 'Relevant - BH Aff No Links On Site But Exists On Monday'        },
      { label: 'Not Relevant - Regulated',                                    value: 'Not Relevant - Regulated'                                       },
    ],
  },
}

const PAGE_SIZE = 50

// Apply a single filter row to a Supabase query (AND mode)
const applyFilterToQuery = (q, col, fr) => {
  const { column, condition, value } = fr
  if (col?.filterType === 'text') {
    switch (condition) {
      case 'contains':         return q.ilike(column, `%${value}%`)
      case 'does not contain': return q.not(column, 'ilike', `%${value}%`)
      case 'is':               return q.ilike(column, value)
      case 'is not':           return q.not(column, 'ilike', value)
      case 'starts with':      return q.ilike(column, `${value}%`)
      case 'ends with':        return q.ilike(column, `%${value}`)
      case 'is empty':         return q.is(column, null)
      case 'is not empty':     return q.not(column, 'is', null)
      default:                 return q
    }
  }
  if (col?.filterType === 'boolean') {
    if (value === 'Yes')     return q.eq(column, true)
    if (value === 'No')      return q.eq(column, false)
    if (value === 'Not Set') return q.is(column, null)
    return q
  }
  if (col?.filterType === 'presence') {
    if (value === 'Yes') return q.not(column, 'is', null)
    if (value === 'No')  return q.is(column, null)
    return q
  }
  if (col?.filterType === 'exact') return q.eq(column, value)
  if (value === 'Not Set') return q.is(column, null)
  return q.ilike(column, value)
}

// Build a PostgREST condition string for a single filter row (used in .or() calls)
const buildConditionStr = (col, fr) => {
  const { column, condition, value } = fr
  if (col?.filterType === 'text') {
    switch (condition) {
      case 'contains':         return `${column}.ilike.%${value}%`
      case 'does not contain': return `not.${column}.ilike.%${value}%`
      case 'is':               return `${column}.ilike.${value}`
      case 'is not':           return `not.${column}.ilike.${value}`
      case 'starts with':      return `${column}.ilike.${value}%`
      case 'ends with':        return `${column}.ilike.%${value}`
      case 'is empty':         return `${column}.is.null`
      case 'is not empty':     return `not.${column}.is.null`
      default:                 return null
    }
  }
  if (col?.filterType === 'boolean') {
    if (value === 'Yes')     return `${column}.eq.true`
    if (value === 'No')      return `${column}.eq.false`
    if (value === 'Not Set') return `${column}.is.null`
    return null
  }
  if (col?.filterType === 'presence') {
    if (value === 'Yes') return `not.${column}.is.null`
    if (value === 'No')  return `${column}.is.null`
    return null
  }
  if (col?.filterType === 'exact') return `${column}.eq.${value}`
  if (value === 'Not Set') return `${column}.is.null`
  return `${column}.eq.${value}`
}

// Group filter rows into AND-groups split at OR connectors
const groupFilterRows = (rows) => {
  const groups = [[]]
  rows.forEach((row, i) => {
    groups[groups.length - 1].push(row)
    if ((row.connector ?? 'AND') === 'OR' && i < rows.length - 1) {
      groups.push([])
    }
  })
  return groups.filter((g) => g.length > 0)
}

// Apply grouped filters to a Supabase query
const applyGroupedFilters = (q, validFilters) => {
  if (validFilters.length === 0) return q
  const groups = groupFilterRows(validFilters)
  if (groups.length === 1) {
    // Pure AND — chain directly
    groups[0].forEach((fr) => {
      const col = TABLE_COLUMNS.find((c) => c.key === fr.column)
      q = applyFilterToQuery(q, col, fr)
    })
    return q
  }
  // Multiple groups: AND within each group, OR between groups
  const groupStrings = groups.map((group) => {
    const parts = group.map((fr) => {
      const col = TABLE_COLUMNS.find((c) => c.key === fr.column)
      return buildConditionStr(col, fr)
    }).filter(Boolean)
    if (parts.length === 0) return null
    if (parts.length === 1) return parts[0]
    return `and(${parts.join(',')})`
  }).filter(Boolean)
  if (groupStrings.length > 0) q = q.or(groupStrings.join(','))
  return q
}

// Apply filter groups (each group has its own rows + groupConnector to the next group)
const applyFilterGroupsV2 = (groups, q) => {
  const NO_VALUE_CONDS = new Set(['is empty', 'is not empty'])

  const activeGroups = groups
    .map(g => ({
      ...g,
      rows: g.rows.filter(fr => fr.column && (fr.value || NO_VALUE_CONDS.has(fr.condition)))
    }))
    .filter(g => g.rows.length > 0)

  if (activeGroups.length === 0) return q

  // Check if there are any OR connectors between groups
  const hasOrBetweenGroups = activeGroups.slice(0, -1).some(g => g.groupConnector === 'OR')

  if (!hasOrBetweenGroups) {
    // Pure AND between groups: apply each group to the query sequentially
    for (const group of activeGroups) {
      q = applyGroupedFilters(q, group.rows)
    }
    return q
  }

  // Has OR between groups — build PostgREST condition strings
  // Build condition result for a single group's rows
  const buildGroupCondResult = (group) => {
    const subGroups = groupFilterRows(group.rows)
    const subGroupParts = subGroups.map(sg => {
      const parts = sg.map(fr => {
        const col = TABLE_COLUMNS.find(c => c.key === fr.column)
        return buildConditionStr(col, fr)
      }).filter(Boolean)
      if (parts.length === 0) return null
      if (parts.length === 1) return parts[0]
      return `and(${parts.join(',')})`
    }).filter(Boolean)
    if (subGroupParts.length === 0) return null
    return { parts: subGroupParts, hasInternalOr: subGroupParts.length > 1 }
  }

  // Split activeGroups at OR-between-group boundaries into OR-segments
  const orSegments = [[]]
  activeGroups.forEach((g, i) => {
    orSegments[orSegments.length - 1].push(g)
    if (i < activeGroups.length - 1 && g.groupConnector === 'OR') {
      orSegments.push([])
    }
  })

  // Build condition string for a segment (AND of multiple groups)
  const buildSegmentStr = (segment) => {
    const allParts = []
    for (const g of segment) {
      const result = buildGroupCondResult(g)
      if (!result) continue
      if (result.hasInternalOr) {
        allParts.push(`or(${result.parts.join(',')})`)
      } else {
        allParts.push(...result.parts)
      }
    }
    if (allParts.length === 0) return null
    if (allParts.length === 1) return allParts[0]
    return `and(${allParts.join(',')})`
  }

  const segmentStrs = orSegments.map(seg => buildSegmentStr(seg)).filter(Boolean)
  if (segmentStrs.length === 0) return q
  return q.or(segmentStrs.join(','))
}



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
        .select('contact_autoinc_id, contact_id, full_name, contact_detail, contact_type, source, is_chosen')
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
      supabase.from('contact_table').select('contact_autoinc_id, contact_id, full_name, contact_detail, contact_type, source, is_chosen')
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
        .update({ contact_id: null, has_contact_details: null })
        .eq('id', row.id)
      if (!updateError) onLeadUpdate(row.id, { contact_id: null, has_contact_details: null })
    }
  }

  const handleToggleChosenEmail = async (autoIncId) => {
    const contact = contacts.find((c) => c.contact_autoinc_id === autoIncId)
    if (!contact || contact.contact_type !== 'Email') return

    const newValue = !contact.is_chosen

    // If choosing this one, unset any other chosen emails first
    if (newValue) {
      const otherChosen = contacts.filter((c) => c.contact_autoinc_id !== autoIncId && c.contact_type === 'Email' && c.is_chosen)
      for (const oc of otherChosen) {
        await supabase.from('contact_table').update({ is_chosen: false }).eq('contact_autoinc_id', oc.contact_autoinc_id)
      }
    }

    const { error } = await supabase.from('contact_table').update({ is_chosen: newValue }).eq('contact_autoinc_id', autoIncId)
    if (error) { onError('Failed to update chosen email.'); return }

    setContacts((prev) => prev.map((c) => {
      if (c.contact_autoinc_id === autoIncId) return { ...c, is_chosen: newValue }
      if (newValue && c.contact_type === 'Email' && c.is_chosen) return { ...c, is_chosen: false }
      return c
    }))
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
      .from('contact_table').select('contact_autoinc_id, contact_id, full_name, contact_detail, contact_type, source, is_chosen').eq('contact_id', contactId)
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
        .update({ s_tag_id: null, has_s_tags: null })
        .eq('id', row.id)
      if (!updateError) onLeadUpdate(row.id, { s_tag_id: null, has_s_tags: null })
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
    { label: 'Brand',            value: row.brand ?? '—' },
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

        <hr className="profile-divider" />

        {/* ── S-Tags section ── */}
        <div className="profile-section">
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
            <button className="btn-modal-cancel" onClick={() => onCheckSTags(sTags, row)}>Check S-Tags</button>
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
                    <tr><td colSpan={7} className="no-data">No S-Tags yet.</td></tr>
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
                                  : (tag[colKey] ? tag[colKey] : <span className="stag-indicator stag-indicator--unknown">?</span>)}
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
        </div>

        <hr className="profile-divider" />

        {/* ── Contacts section ── */}
        <div className="profile-section">
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
                    <th>Send to Monday.com</th>
                    <th style={{ width: '32px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.length === 0 && newContactRows.length === 0 ? (
                    <tr><td colSpan={7} className="no-data">No contacts yet.</td></tr>
                  ) : (
                    <>
                      {contacts.map((contact) => (
                        <tr key={contact.contact_autoinc_id} className={contact.is_chosen ? 'contact-row--chosen' : undefined}>
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
                                ) : colKey === 'contact_detail' && contact[colKey] ? (() => {
                                  const val = contact[colKey]
                                  const type = contact.contact_type
                                  if (type === 'Email') return <a href={`mailto:${val}`} className="tb-cell-link">{val}</a>
                                  if (type === 'Phone') return <a href={`tel:${val}`} className="tb-cell-link">{val}</a>
                                  if (type === 'LinkedIn' || type === 'Twitter' || type === 'Website') return <a href={val.startsWith('http') ? val : `https://${val}`} target="_blank" rel="noopener noreferrer" className="tb-cell-link">{val}</a>
                                  return val
                                })() : (contact[colKey] ? contact[colKey] : <span className="stag-indicator stag-indicator--unknown">?</span>)}
                              </td>
                            )
                          })}
                          <td className="contact-monday-cell">
                            {contact.contact_type === 'Email' ? (
                              <label className="contact-monday-radio">
                                <input
                                  type="radio"
                                  name="chosen-email"
                                  checked={!!contact.is_chosen}
                                  onChange={() => handleToggleChosenEmail(contact.contact_autoinc_id)}
                                />
                                <span className={contact.is_chosen ? 'contact-monday-check' : 'contact-monday-x'}>{contact.is_chosen ? '✓' : '✗'}</span>
                              </label>
                            ) : <span className="stag-indicator stag-indicator--unknown">?</span>}
                          </td>
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
        </div>

        {/* ── Add to Monday.com ── */}
        <div className="profile-section profile-monday-section">
          <h4 className="profile-section-title">Add to Monday.com</h4>
          <p className="profile-monday-hint">This is the final step. Once confirmed, this lead will be added to Monday.com.</p>
          <button className="btn-monday" onClick={() => onAddToMonday(row, sTags, contacts)}>Add Lead on Monday.com</button>
        </div>

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
            <h2 className="modal-title">{batchModal.title}</h2>
            <p className="modal-message">{batchModal.desc}</p>
            <div className="batch-checkbox-list">
              {batchModal.batchIds.map((id) => (
                <label key={id} className="batch-checkbox-item">
                  <input
                    type="checkbox"
                    checked={batchModal.selected.includes(id)}
                    onChange={() => onSelectChange(id)}
                  />
                  <span>{id}</span>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn-modal-cancel" onClick={onCancel}>Cancel</button>
              <button
                className="modal-close-btn"
                disabled={batchModal.selected.length === 0}
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
  const [pages,   setPages]   = useState(1)
  const [savedKeywords, setSavedKeywords]       = useState([])
  const [keywordDropOpen, setKeywordDropOpen]   = useState(false)
  const [keywordSaveError, setKeywordSaveError] = useState('')
  const [kwOffset, setKwOffset]                 = useState(0)
  const [kwHasMore, setKwHasMore]               = useState(true)
  const [kwLoadingMore, setKwLoadingMore]       = useState(false)
  const keywordWrapRef  = useRef(null)
  const kwDropRef       = useRef(null)
  const KW_PAGE_SIZE    = 20
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
  const [profileModal, setProfileModal] = useState(null)
  const [profileRefreshKey, setProfileRefreshKey] = useState(0)
  const [editingCell, setEditingCell] = useState(null) // { rowId, colKey, value }
  const [addNewModal, setAddNewModal]       = useState(null) // null | { batchId, keyword, country, url, domain, resultType, saving }
  const [deleteConfirm, setDeleteConfirm]   = useState(false)
  const [deleting, setDeleting]             = useState(false)
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState({})
  const [filterGroups, setFilterGroups]     = useState([{ id: 1, groupConnector: 'AND', rows: [] }])  // [{ id, groupConnector, rows: [{id, column, condition, value, connector}] }]
  const [sortRows, setSortRows]             = useState([])  // [{ id, column, direction }]
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  const [sortPanelOpen, setSortPanelOpen]     = useState(false)
  const filterPanelRef = useRef(null)
  const sortPanelRef   = useRef(null)
  const pollRef            = useRef(null)
  const isCancellingEditRef = useRef(false)
  const [hasMore, setHasMore]           = useState(true)
  const [loadingMore, setLoadingMore]   = useState(false)
  const offsetRef       = useRef(0)
  const sentinelRef     = useRef(null)
  const loadingMoreRef  = useRef(false)
  const hasMoreRef      = useRef(true)
  const filterGroupsRef = useRef([{ id: 1, groupConnector: 'AND', rows: [] }])
  const sortRowsRef     = useRef([])
  const searchRef       = useRef('')

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

  // Keep refs in sync with state so fetchLeads (stable callback) always reads latest values
  useEffect(() => { filterGroupsRef.current = filterGroups }, [filterGroups])
  useEffect(() => { sortRowsRef.current = sortRows },           [sortRows])
  useEffect(() => { searchRef.current = search },               [search])

  const fetchLeads = useCallback(async (reset = true) => {
    const from = reset ? 0 : offsetRef.current

    if (reset) {
      setTableLoading(true)
      loadingMoreRef.current = true
      setSelectedRows(new Set())
      offsetRef.current = 0
      setHasMore(true)
      hasMoreRef.current = true
    } else {
      if (loadingMoreRef.current || !hasMoreRef.current) return
      setLoadingMore(true)
      loadingMoreRef.current = true
    }

    const validSorts = sortRowsRef.current.filter((sr) => sr.column)
    const term       = searchRef.current.trim()

    let q = supabase.from('google_lead_gen_table').select('*').range(from, from + PAGE_SIZE - 1)

    // Apply filter groups
    q = applyFilterGroupsV2(filterGroupsRef.current, q)

    // Apply search across key columns
    if (term.length >= 3) {
      const cols = ['domain', 'keyword', 'url', 'status', 'affiliate_name']
      q = q.or(cols.map((c) => `${c}.ilike.%${term}%`).join(','))
    }

    // Apply sorts
    if (validSorts.length > 0) {
      validSorts.forEach((sr) => q = q.order(sr.column, { ascending: sr.direction === 'asc' }))
    } else {
      q = q.order('id', { ascending: false })
    }

    const { data, error } = await q
    const rows = data ?? []

    if (reset) {
      setLeads(rows)
      setProfileModal((prev) => {
        if (!prev) return null
        const fresh = rows.find((r) => r.id === prev.id)
        return fresh ? { ...prev, ...fresh } : prev
      })
      setTableLoading(false)
      loadingMoreRef.current = false
    } else {
      setLeads((prev) => [...prev, ...rows])
      setLoadingMore(false)
      loadingMoreRef.current = false
    }

    if (error) console.error('fetchLeads error:', error)

    offsetRef.current = from + rows.length
    const more = rows.length === PAGE_SIZE
    setHasMore(more)
    hasMoreRef.current = more
  }, []) // stable — reads all query params via refs

  // ── Click-outside to close filter/sort panels ────────────
  useEffect(() => {
    if (!filterPanelOpen && !sortPanelOpen) return
    const handler = (e) => {
      if (filterPanelOpen && filterPanelRef.current && !filterPanelRef.current.contains(e.target)) setFilterPanelOpen(false)
      if (sortPanelOpen   && sortPanelRef.current   && !sortPanelRef.current.contains(e.target))   setSortPanelOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [filterPanelOpen, sortPanelOpen])

  const TEXT_CONDITIONS = ['contains', 'does not contain', 'is', 'is not', 'starts with', 'ends with', 'is empty', 'is not empty']

  const DESCENDING_COLS = new Set(['id', 'batch_id'])
  const getUniqueValues = (colKey) => [...new Set(leads.map((r) => r[colKey]).filter(Boolean))].sort((a, b) => {
    const cmp = String(a).localeCompare(String(b), undefined, { numeric: true })
    return DESCENDING_COLS.has(colKey) ? -cmp : cmp
  })

  const getValueOptions = (colKey) => {
    const col = TABLE_COLUMNS.find((c) => c.key === colKey)
    if (!col) return []
    if (col.filterType === 'boolean') return ['Yes', 'No', 'Not Set']
    if (col.filterType === 'presence') return ['Yes', 'No']
    if (col.filterOptions) return col.filterOptions
    if (col.key === 'country') return countries.map((c) => c.name)
    if (dynamicFilterOptions[colKey]) return dynamicFilterOptions[colKey]
    return getUniqueValues(colKey)
  }

  const isTextColumn = (colKey) => {
    const col = TABLE_COLUMNS.find((c) => c.key === colKey)
    return col?.filterType === 'text'
  }

  const addFilterRow = (groupId) => setFilterGroups((prev) =>
    prev.map(g => g.id === groupId
      ? { ...g, rows: [...g.rows, { id: Date.now(), column: '', condition: 'contains', value: '', connector: 'AND' }] }
      : g
    )
  )
  const removeFilterRow = (groupId, rowId) => setFilterGroups((prev) =>
    prev.map(g => g.id === groupId ? { ...g, rows: g.rows.filter(r => r.id !== rowId) } : g)
  )
  const updateFilterRow = (groupId, rowId, patch) => setFilterGroups((prev) =>
    prev.map(g => g.id === groupId
      ? { ...g, rows: g.rows.map(r => r.id === rowId ? { ...r, ...patch } : r) }
      : g
    )
  )
  const addFilterGroup = () => setFilterGroups((prev) => [...prev, { id: Date.now(), groupConnector: 'AND', rows: [] }])
  const removeFilterGroup = (groupId) => setFilterGroups((prev) => {
    const filtered = prev.filter(g => g.id !== groupId)
    return filtered.length === 0 ? [{ id: Date.now(), groupConnector: 'AND', rows: [] }] : filtered
  })
  const updateGroupConnector = (groupId, connector) => setFilterGroups((prev) =>
    prev.map(g => g.id === groupId ? { ...g, groupConnector: connector } : g)
  )

  const addSortRow = () => setSortRows((prev) => [...prev, { id: Date.now(), column: '', direction: 'asc' }])
  const removeSortRow = (id) => setSortRows((prev) => prev.filter((r) => r.id !== id))
  const updateSortRow = (id, patch) => setSortRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r))

  const NO_VALUE_CONDITIONS = new Set(['is empty', 'is not empty'])
  const activeSortRows = sortRows.filter((sr) => sr.column)

  const activeFilterCount = useMemo(() =>
    filterGroups.reduce((sum, g) =>
      sum + g.rows.filter(fr => fr.column && (fr.value || NO_VALUE_CONDITIONS.has(fr.condition))).length, 0
    ), [filterGroups]
  )

  // Stable serialized key — only changes when complete (column+value) filter rows change
  const activeFiltersKey = useMemo(() => {
    const active = filterGroups
      .map(g => ({
        ...g,
        rows: g.rows.filter(fr => fr.column && (fr.value || NO_VALUE_CONDITIONS.has(fr.condition)))
      }))
      .filter(g => g.rows.length > 0)
    return JSON.stringify(active)
  }, [filterGroups])
  const activeSortsKey = useMemo(() => JSON.stringify(activeSortRows), [activeSortRows])

  const selectableLeads = leads
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

  // Initial fetch on mount; debounced re-fetch on filter/sort/search changes
  const isFirstFetch = useRef(true)
  useEffect(() => {
    if (isFirstFetch.current) {
      isFirstFetch.current = false
      fetchLeads(true)
      return
    }
    const t = setTimeout(() => fetchLeads(true), 350)
    return () => clearTimeout(t)
  }, [activeFiltersKey, activeSortsKey, search, fetchLeads])

  // Infinite scroll — load next page when sentinel enters viewport
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreRef.current && !loadingMoreRef.current) {
          fetchLeads(false)
        }
      },
      { rootMargin: '300px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [fetchLeads])

  // Fetch all distinct values for dropdown filter columns from Supabase (paginated)
  const fetchFilterOptions = useCallback(async () => {
    const DYNAMIC_COLS = ['batch_id', 'result_type']
    const CHUNK = 1000
    const entries = await Promise.all(
      DYNAMIC_COLS.map(async (col) => {
        const allValues = new Set()
        let from = 0
        while (true) {
          const { data } = await supabase
            .from('google_lead_gen_table')
            .select(col)
            .not(col, 'is', null)
            .range(from, from + CHUNK - 1)
          if (!data || data.length === 0) break
          data.forEach(r => { if (r[col] != null) allValues.add(r[col]) })
          if (data.length < CHUNK) break
          from += CHUNK
        }
        const values = [...allValues]
        if (col === 'batch_id') values.sort((a, b) => String(b).localeCompare(String(a), undefined, { numeric: true }))
        else values.sort()
        return [col, values]
      })
    )
    setDynamicFilterOptions(Object.fromEntries(entries))
  }, [])

  useEffect(() => { fetchFilterOptions() }, [fetchFilterOptions])

  // Clean up polling on unmount
  useEffect(() => () => stopPolling(), [])

  const canSubmit = keyword.trim() !== '' && country !== '' && pages >= 1

  const getSelectedCountryName = () => countries.find((c) => c.id === country)?.name ?? null

  const fetchSavedKeywords = useCallback(async (reset = true, searchTerm = '', countryName = '') => {
    if (!countryName) return
    const from = reset ? 0 : kwOffset
    if (!reset && kwLoadingMore) return
    if (!reset) setKwLoadingMore(true)

    let q = supabase
      .from('keywords_table')
      .select('id, keywords')
      .eq('country', countryName)
      .order('id', { ascending: false })
      .range(from, from + KW_PAGE_SIZE - 1)

    if (searchTerm.trim()) q = q.ilike('keywords', `%${searchTerm.trim()}%`)

    const { data } = await q
    const rows = data ?? []

    if (reset) {
      setSavedKeywords(rows)
      setKwOffset(rows.length)
    } else {
      setSavedKeywords((prev) => [...prev, ...rows])
      setKwOffset(from + rows.length)
      setKwLoadingMore(false)
    }
    setKwHasMore(rows.length === KW_PAGE_SIZE)
  }, [kwOffset, kwLoadingMore, KW_PAGE_SIZE])

  useEffect(() => {
    if (!keywordDropOpen) return
    const handler = (e) => {
      if (keywordWrapRef.current && !keywordWrapRef.current.contains(e.target)) {
        setKeywordDropOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [keywordDropOpen])

  // Lazy load more keywords when user scrolls to bottom of dropdown
  const handleKwDropScroll = (e) => {
    const el = e.currentTarget
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20 && kwHasMore && !kwLoadingMore) {
      fetchSavedKeywords(false, keyword, getSelectedCountryName())
    }
  }

  const handleSaveKeyword = async () => {
    const val = keyword.trim()
    const countryName = getSelectedCountryName()
    if (!val || !countryName) return
    setKeywordSaveError('')
    const { error } = await supabase.from('keywords_table').insert({ keywords: val, country: countryName })
    if (error) {
      setKeywordSaveError('Keyword already exists.')
      return
    }
    fetchSavedKeywords(true, keyword, countryName)
  }

  const handleDeleteKeyword = async (id) => {
    await supabase.from('keywords_table').delete().eq('id', id)
    setSavedKeywords((prev) => prev.filter((k) => k.id !== id))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!keyword.trim() || !country) {
      setModal({ phase: 'error', data: { message: 'Please enter a keyword and select a country.' } })
      return
    }

    const selectedCountry = countries.find((c) => c.id === country)

    const payload = {
      keyword:      keyword,
      countryValue: selectedCountry?.id   ?? '',
      countryText:  selectedCountry?.name ?? '',
      pages:        pages,
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
      fetchFilterOptions()
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

  const BATCH_LABELS = {
    [N8N_AFFILIATES_WEBHOOK]:  { title: "Check if it's an Affiliate",           desc: 'Select the batch ID you want to run affiliate checking for.' },
    [N8N_DUPLICATES_WEBHOOK]:  { title: 'Check if it exists on Monday',         desc: 'Select the batch ID you want to run domain duplicate checking for.' },
    [N8N_ROOSTER_WEBHOOK]:     { title: 'Check if promoting Rooster Partners',  desc: 'Select the batch ID you want to run Rooster Partner checking for.' },
    [N8N_CONTACTS_WEBHOOK]:    { title: 'Check for Contact Details',            desc: 'Select the batch ID you want to run contact detail checking for.' },
  }

  const openBatchModal = async (webhookUrl, extraFields = []) => {
    setPendingWebhookUrl(webhookUrl)
    setPendingExtraFields(extraFields)
    const labels = BATCH_LABELS[webhookUrl] || { title: 'Select Batch', desc: 'Select the batch ID to proceed.' }
    setBatchModal({ phase: 'loading', ...labels })

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

    setBatchModal((prev) => ({ ...prev, phase: 'select', batchIds, selected: [] }))
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
      fetchFilterOptions()
    }
  }

  const cancelCellEdit = () => {
    isCancellingEditRef.current = true
    setEditingCell(null)
  }

  const handleBatchActionClick = (webhookUrl, extraFields = []) => async () => {
    if (selectedRows.size > 0) {
      const payload = leads
        .filter((r) => selectedRows.has(r.id))
        .map((r) => ({ id: r.id, url: r.url, domain: r.domain, ...Object.fromEntries(extraFields.map((f) => [f, r[f] ?? null])) }))
      await sendToWebhook(webhookUrl, payload)
      return
    }
    await openBatchModal(webhookUrl, extraFields)
  }

  const handleCheckContactDetails = async () => {
    const EXTRA_FIELDS = ['country', 'is_rooster_partner']
    if (selectedRows.size === 0) {
      setModal({ phase: 'error', data: { message: 'Please select at least one row before checking contact details.' } })
      return
    }
    if (selectedRows.size > 5) {
      setModal({ phase: 'error', data: { message: 'You can only check contact details for up to 5 rows at a time. Please uncheck some rows and try again.' } })
      return
    }
    const payload = leads
      .filter((r) => selectedRows.has(r.id))
      .map((r) => ({ id: r.id, url: r.url, domain: r.domain, ...Object.fromEntries(EXTRA_FIELDS.map((f) => [f, r[f] ?? null])) }))
    await sendToWebhook(N8N_CONTACTS_WEBHOOK, payload)
  }

  const handleCollectSTags = async () => {
    const EXTRA_FIELDS = ['country', 'is_rooster_partner']
    if (selectedRows.size === 0) {
      setModal({ phase: 'error', data: { message: 'Please select at least one row before collecting S-Tags.' } })
      return
    }
    if (selectedRows.size > 5) {
      setModal({ phase: 'error', data: { message: 'You can only collect S-Tags for up to 5 rows at a time. Please uncheck some rows and try again.' } })
      return
    }
    const payload = leads
      .filter((r) => selectedRows.has(r.id))
      .map((r) => ({ id: r.id, url: r.url, domain: r.domain, ...Object.fromEntries(EXTRA_FIELDS.map((f) => [f, r[f] ?? null])) }))
    await sendToWebhook(N8N_STAGS_WEBHOOK, payload)
  }

  const handleLeadUpdate = (rowId, updates) => {
    setLeads((prev) => prev.map((r) => r.id === rowId ? { ...r, ...updates } : r))
    setProfileModal((prev) => prev ? { ...prev, ...updates } : prev)
  }

  const handleDeleteSelected = async () => {
    setDeleting(true)
    const toDelete = leads.filter((r) => selectedRows.has(r.id))

    const sTagIds     = [...new Set(toDelete.map((r) => r.s_tag_id).filter(Boolean))]
    const contactIds  = [...new Set(toDelete.map((r) => r.contact_id).filter(Boolean))]
    const leadIds     = toDelete.map((r) => r.id)

    if (sTagIds.length > 0)
      await supabase.from('s_tags_table').delete().in('s_tag_id', sTagIds)
    if (contactIds.length > 0)
      await supabase.from('contact_table').delete().in('contact_id', contactIds)

    const { error } = await supabase.from('google_lead_gen_table').delete().in('id', leadIds)
    setDeleting(false)
    setDeleteConfirm(false)
    if (error) { setModal({ phase: 'error', data: { message: 'Failed to delete selected leads.' } }); return }
    await fetchLeads()
    await fetchFilterOptions()
  }

  const handleOpenAddNew = async () => {
    const { data } = await supabase
      .from('google_lead_gen_table')
      .select('batch_id')
      .not('batch_id', 'is', null)
      .order('batch_id', { ascending: false })
      .limit(1)
    const latestBatchId = data?.[0]?.batch_id ?? ''
    setAddNewModal({ batchId: latestBatchId, keyword: '', country: '', url: '', domain: '', resultType: '', saving: false })
  }

  const handleSaveNewLead = async () => {
    if (!addNewModal) return
    setAddNewModal((prev) => ({ ...prev, saving: true }))
    const { error } = await supabase.from('google_lead_gen_table').insert({
      batch_id: addNewModal.batchId,
      keyword: addNewModal.keyword,
      country: addNewModal.country,
      url: addNewModal.url,
      domain: addNewModal.domain,
      result_type: addNewModal.resultType,
    })
    if (error) {
      setAddNewModal((prev) => ({ ...prev, saving: false }))
      setModal({ phase: 'error', data: { message: 'Failed to add new lead.' } })
      return
    }
    setAddNewModal(null)
    setModal({ phase: 'success', data: { message: 'New lead added successfully.' } })
    await fetchLeads()
    await fetchFilterOptions()
  }

  const canSaveNewLead = addNewModal &&
    addNewModal.batchId && addNewModal.keyword.trim() && addNewModal.country &&
    addNewModal.url.trim() && addNewModal.domain.trim() && addNewModal.resultType

  const handlePasswordConfirm = () => {
    if (passwordModal.input !== MONDAY_PASSWORD) {
      setPasswordModal((prev) => ({ ...prev, error: 'Incorrect password. Please try again.' }))
      return
    }
    const onSuccess = passwordModal.onSuccess
    setPasswordModal(null)
    if (onSuccess) onSuccess()
  }

  const handleBatchConfirm = async (batchIds) => {
    setBatchModal(null)

    const selectFields = ['id', 'url', 'domain', 'status', ...pendingExtraFields].join(', ')
    const { data, error } = await supabase
      .from('google_lead_gen_table')
      .select(selectFields)
      .in('batch_id', batchIds)

    if (error) {
      setModal({ phase: 'error', data: { message: 'Failed to fetch records for the selected batches.' } })
      return
    }

    const payload = data
      .map((r) => ({ id: r.id, url: r.url, domain: r.domain, ...Object.fromEntries(pendingExtraFields.map((f) => [f, r[f] ?? null])) }))
    await sendToWebhook(pendingWebhookUrl, payload)
  }

  return (
    <div className="container">
      <h1 className="title">Google Lead Gen</h1>

      <div className="search-card">
        <form className="search-bar" onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}>
          <div className="keyword-wrap" ref={keywordWrapRef}>
            <input
              type="text"
              className={`input-keyword${!country ? ' input-keyword--disabled' : ''}`}
              placeholder={country ? 'Keyword' : 'Select a country first'}
              value={keyword}
              disabled={!country}
              onChange={(e) => {
                setKeyword(e.target.value)
                setKeywordSaveError('')
                if (country) fetchSavedKeywords(true, e.target.value, getSelectedCountryName())
              }}
              onFocus={() => {
                if (!country) return
                setKeywordDropOpen(true)
                fetchSavedKeywords(true, keyword, getSelectedCountryName())
              }}
            />
            {keyword.trim() && country && (
              <button type="button" className="keyword-save-btn" title="Save keyword" onClick={handleSaveKeyword}>＋</button>
            )}
            {keywordDropOpen && savedKeywords.length > 0 && (
              <div className="keyword-dropdown" ref={kwDropRef} onScroll={handleKwDropScroll}>
                {savedKeywords.map((k) => (
                  <div key={k.id} className="keyword-option">
                    <span className="keyword-option-text" onMouseDown={() => { setKeyword(k.keywords); setKeywordDropOpen(false) }}>{k.keywords}</span>
                    <button type="button" className="keyword-delete-btn" title="Delete keyword" onMouseDown={(e) => { e.stopPropagation(); handleDeleteKeyword(k.id) }}>－</button>
                  </div>
                ))}
                {kwLoadingMore && <div className="keyword-loading">Loading...</div>}
              </div>
            )}
            {keywordSaveError && <div className="keyword-save-error">{keywordSaveError}</div>}
          </div>

          <select
            className="select-country"
            value={country}
            onChange={(e) => {
              setCountry(e.target.value)
              setSavedKeywords([])
              setKwOffset(0)
              setKwHasMore(true)
              setKeywordDropOpen(false)
            }}
          >
            <option value="" disabled>Country</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label ? `${c.name} - ${c.label}` : c.name}
              </option>
            ))}
          </select>

          <select
            className="select-pages"
            value={pages}
            onChange={(e) => setPages(Number(e.target.value))}
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n} {n === 1 ? 'page' : 'pages'}</option>
            ))}
          </select>

          <button type="submit" className="btn-submit" disabled={loading || !canSubmit}>
            {loading ? 'Submitting...' : 'Submit'}
          </button>

        </form>

        <div className="action-bar">
          <button className="btn-action" onClick={handleBatchActionClick(N8N_AFFILIATES_WEBHOOK, ['country'])} disabled={loading}>Check if it's an Affiliate</button>
          <span className="action-sep">›</span>
          <button className="btn-action" onClick={handleBatchActionClick(N8N_DUPLICATES_WEBHOOK)} disabled={loading}>Check if it exists on Monday</button>
          <span className="action-sep">›</span>
          <button className="btn-action" onClick={handleBatchActionClick(N8N_ROOSTER_WEBHOOK, ['country'])} disabled={loading}>Check if promoting Rooster Partners</button>
          <span className="action-sep">›</span>
          <button className="btn-action" onClick={handleCheckContactDetails} disabled={loading}>Check for Contact Details</button>
          <span className="action-sep">›</span>
          <button className="btn-action" onClick={handleCollectSTags} disabled={loading}>Collect S-Tags</button>
        </div>
      </div>

      <div className="table-card">
        <p className="table-hint">Double-click any highlighted cell to edit it inline.</p>

        {/* ── Monday.com-style toolbar ── */}
        <div className="mb-toolbar">
          {/* Search */}
          <div className="mb-toolbar-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              className="mb-search-input"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Filter */}
          <div className="mb-toolbar-item-wrap" ref={filterPanelRef}>
            <button
              className={`mb-toolbar-btn${activeFilterCount > 0 ? ' mb-toolbar-btn--active' : ''}`}
              onClick={() => { setFilterPanelOpen((v) => !v); setSortPanelOpen(false) }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/></svg>
              Filter
              {activeFilterCount > 0 && <span className="mb-badge">{activeFilterCount}</span>}
            </button>

            {filterPanelOpen && (
              <div className="mb-panel">
                <div className="mb-panel-header">
                  <span className="mb-panel-title">Advanced filters <span className="mb-panel-count">{leads.length} leads loaded</span></span>
                  <div className="mb-panel-header-actions">
                    {activeFilterCount > 0 && <button className="mb-panel-clear" onClick={() => setFilterGroups([{ id: Date.now(), groupConnector: 'AND', rows: [] }])}>Clear all</button>}
                  </div>
                </div>

                {filterGroups.map((group, groupIdx) => (
                  <div key={group.id} className="mb-filter-group">
                    {groupIdx > 0 && (
                      <div className="mb-group-connector-wrap">
                        <button
                          className={`mb-group-connector-btn${group.groupConnector === 'OR' ? ' mb-group-connector-btn--or' : ''}`}
                          onClick={() => updateGroupConnector(group.id, group.groupConnector === 'AND' ? 'OR' : 'AND')}
                        >
                          {group.groupConnector}
                        </button>
                      </div>
                    )}
                    <div className="mb-filter-group-box">
                      <div className="mb-filter-group-header">
                        <span className="mb-filter-group-label">Group {groupIdx + 1}</span>
                        {filterGroups.length > 1 && (
                          <button className="mb-filter-group-remove" onClick={() => removeFilterGroup(group.id)}>Remove group</button>
                        )}
                      </div>

                      {group.rows.map((fr, rowIdx) => (
                        <div key={fr.id} className="mb-panel-row">
                          {rowIdx === 0
                            ? <span className="mb-row-label">Where</span>
                            : (
                              <button
                                className={`mb-connector-btn${(group.rows[rowIdx - 1]?.connector ?? 'AND') === 'OR' ? ' mb-connector-btn--or' : ''}`}
                                onClick={() => updateFilterRow(group.id, group.rows[rowIdx - 1].id, { connector: (group.rows[rowIdx - 1]?.connector ?? 'AND') === 'AND' ? 'OR' : 'AND' })}
                              >{group.rows[rowIdx - 1]?.connector ?? 'AND'}</button>
                            )
                          }
                          <select className="mb-select" value={fr.column} onChange={(e) => {
                            const col = TABLE_COLUMNS.find((c) => c.key === e.target.value)
                            updateFilterRow(group.id, fr.id, { column: e.target.value, condition: col?.filterType === 'text' ? 'contains' : 'is', value: '' })
                          }}>
                            <option value="">Column</option>
                            {TABLE_COLUMNS.filter((c) => c.hasFilter).map((c) => (
                              <option key={c.key} value={c.key}>{c.label}</option>
                            ))}
                          </select>

                          {fr.column && isTextColumn(fr.column) && (
                            <select className="mb-select mb-select--condition" value={fr.condition} onChange={(e) => updateFilterRow(group.id, fr.id, { condition: e.target.value })}>
                              {TEXT_CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          )}

                          {fr.column && (
                            isTextColumn(fr.column) ? (
                              !NO_VALUE_CONDITIONS.has(fr.condition) && <input
                                className="mb-value-input"
                                type="text"
                                placeholder="Value"
                                value={fr.value}
                                onChange={(e) => updateFilterRow(group.id, fr.id, { value: e.target.value })}
                              />
                            ) : (
                              <select className="mb-select mb-select--value" value={fr.value} onChange={(e) => updateFilterRow(group.id, fr.id, { value: e.target.value })}>
                                <option value="" disabled>Value</option>
                                {getValueOptions(fr.column).map((v) => <option key={v} value={v}>{v}</option>)}
                              </select>
                            )
                          )}

                          <button className="mb-row-remove" onClick={() => removeFilterRow(group.id, fr.id)}>✕</button>
                        </div>
                      ))}

                      <button className="mb-add-row-btn" onClick={() => addFilterRow(group.id)}>+ Add filter</button>
                    </div>
                  </div>
                ))}

                <button className="mb-add-group-btn" onClick={addFilterGroup}>+ New group</button>
              </div>
            )}
          </div>

          {/* Sort */}
          <div className="mb-toolbar-item-wrap" ref={sortPanelRef}>
            <button
              className={`mb-toolbar-btn${activeSortRows.length > 0 ? ' mb-toolbar-btn--active' : ''}`}
              onClick={() => { setSortPanelOpen((v) => !v); setFilterPanelOpen(false) }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
              Sort
              {activeSortRows.length > 0 && <span className="mb-badge">{activeSortRows.length}</span>}
            </button>

            {sortPanelOpen && (
              <div className="mb-panel">
                <div className="mb-panel-header">
                  <span className="mb-panel-title">Sort by</span>
                </div>

                {sortRows.map((sr) => (
                  <div key={sr.id} className="mb-panel-row">
                    <select className="mb-select" value={sr.column} onChange={(e) => updateSortRow(sr.id, { column: e.target.value })}>
                      <option value="">Choose column</option>
                      {TABLE_COLUMNS.filter((c) => !c.noSort).map((c) => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                    <select className="mb-select mb-select--condition" value={sr.direction} onChange={(e) => updateSortRow(sr.id, { direction: e.target.value })}>
                      <option value="asc">↑ Ascending</option>
                      <option value="desc">↓ Descending</option>
                    </select>
                    <button className="mb-row-remove" onClick={() => removeSortRow(sr.id)}>✕</button>
                  </div>
                ))}

                <button className="mb-add-row-btn" onClick={addSortRow}>+ New sort</button>
              </div>
            )}
          </div>

          {/* Delete */}
          <button
            className="mb-toolbar-btn mb-toolbar-btn--danger"
            disabled={selectedRows.size === 0}
            onClick={() => setDeleteConfirm(true)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            Delete{selectedRows.size > 0 ? ` (${selectedRows.size})` : ''}
          </button>

          {/* Add New */}
          <button className="mb-btn-new" onClick={handleOpenAddNew}>+ Add New</button>
        </div>

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
                  <th key={col.key} className={col.key === 'has_s_tags' ? 'col-stag' : col.key === 'is_rooster_partner' ? 'col-rooster' : col.key === 'is_affiliate' ? 'col-affiliate' : col.key === 'is_on_monday' ? 'col-on-monday' : col.key === 'has_contact_details' ? 'col-contact' : col.key === 'status' ? 'col-status' : col.key === 'affiliate_name' ? 'col-affiliate-name' : undefined}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableLoading ? (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length + 2} className="no-data">
                    Loading...
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={TABLE_COLUMNS.length + 2} className="no-data">
                    No data to display.
                  </td>
                </tr>
              ) : (
                leads.map((row) => (
                  <tr key={row.id} className={selectedRows.has(row.id) ? 'row-selected' : undefined}>
                    <td className="col-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(row.id)}
                        onChange={() => toggleRow(row.id)}
                        disabled={false}
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
                      if (col.key === 'is_rooster_partner' || col.key === 'is_affiliate' || col.key === 'is_on_monday' || col.key === 'has_s_tags' || col.key === 'has_contact_details') {
                        value = raw === true || raw === 'true' ? 'Yes' : raw === false || raw === 'false' ? 'No' : '?'
                      } else if (col.key === 'time_stamp') {
                        if (raw) {
                          const d = new Date(raw)
                          value = isNaN(d.getTime()) ? String(raw) : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
                        } else {
                          value = '?'
                        }
                      } else if (col.key === 'status' || col.key === 'remarks') {
                        value = raw ?? ''
                      } else {
                        value = raw ?? '?'
                      }

                      const baseClass = col.key === 'remarks' ? 'col-remarks' : col.key === 'url' ? 'col-url' : col.key === 'domain' ? 'col-domain' : col.key === 'has_s_tags' ? 'col-stag' : col.key === 'is_rooster_partner' ? 'col-rooster' : col.key === 'has_contact_details' ? 'col-contact' : col.key === 'status' ? 'col-status' : col.key === 'affiliate_name' ? 'col-affiliate-name' : undefined
                      const className = [baseClass, isEditing ? 'cell--editing' : editConf ? 'cell--editable' : ''].filter(Boolean).join(' ') || undefined

                      return (
                        <td
                          key={col.key}
                          className={className}
                          title={isEditing ? undefined : String(value)}
                          onDoubleClick={editConf && !isEditing ? () => setEditingCell({ rowId: row.id, colKey: col.key, value: getInitialEditValue(col.key, raw) }) : undefined}
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
                                : (raw ? <span>{raw}</span> : <span className="stag-indicator stag-indicator--unknown">?</span>)
                            })()
                          ) : col.key === 'result_type' ? (
                            <span className={`result-type-badge ${raw === 'PPC' ? 'result-type--ppc' : raw === 'Organic' ? 'result-type--organic' : 'result-type--other'}`} title={raw ?? '?'}>
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
                              ) : raw ? raw : <span className="stag-indicator stag-indicator--unknown">?</span>}
                            </span>
                          ) : (col.key === 'is_rooster_partner' || col.key === 'is_affiliate' || col.key === 'is_on_monday' || col.key === 'has_s_tags' || col.key === 'has_contact_details') ? (
                            <span className={
                              (raw === true || raw === 'true')  ? 'stag-indicator stag-indicator--yes' :
                              (raw === false || raw === 'false') ? 'stag-indicator stag-indicator--no' :
                              'stag-indicator stag-indicator--unknown'
                            }>
                              {(raw === true || raw === 'true') ? '✓' : (raw === false || raw === 'false') ? '✗' : '?'}
                            </span>
                          ) : (col.key === 'url' || col.key === 'domain') && row[col.key] ? (
                            <a href={row[col.key]} target="_blank" rel="noreferrer" className="cell-link">
                              {row[col.key]}
                            </a>
                          ) : value === '?' ? <span className="stag-indicator stag-indicator--unknown">?</span> : value}
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} style={{ height: 1 }} />
          {!tableLoading && loadingMore && (
            <div className="no-data" style={{ padding: '12px', textAlign: 'center', color: '#888', fontSize: '13px' }}>
              Loading more…
            </div>
          )}
          {!tableLoading && !hasMore && leads.length > 0 && (
            <div className="no-data" style={{ padding: '10px', textAlign: 'center', color: '#555', fontSize: '12px' }}>
              All {leads.length} records loaded.
            </div>
          )}
        </div>
      </div>

      <ProfileModal
        profileModal={profileModal}
        onClose={() => setProfileModal(null)}
        onLeadUpdate={handleLeadUpdate}
        onError={(msg) => setModal({ phase: 'error', data: { message: msg } })}
        profileRefreshKey={profileRefreshKey}
        onCheckSTags={(sTags, row) => sendToWebhook(N8N_CHECK_STAGS_WEBHOOK, sTags.map((t) => ({ id: row.id, s_tag_autoinc_id: t.s_tag_autoinc_id, s_tag_id: t.s_tag_id, s_tag: t.s_tag, brand: t.brand })))}
        onCollectSTags={(row) => sendToWebhook(N8N_STAGS_WEBHOOK, [{ id: row.id, url: row.url, domain: row.domain, country: row.country ?? null, is_rooster_partner: row.is_rooster_partner ?? null }])}
        onCollectContacts={(row) => sendToWebhook(N8N_CONTACTS_WEBHOOK, [{ id: row.id, url: row.url, domain: row.domain, country: row.country ?? null, is_rooster_partner: row.is_rooster_partner ?? null }])}
        onTakeScreenshot={(row) => sendToWebhook(N8N_PPC_WEBHOOK, { id: row.id, url: row.url, domain: row.domain, result_type: row.result_type ?? null, country: row.country ?? null, is_rooster_partner: row.is_rooster_partner ?? null })}
        onSendSTagUpdate={(tag) => setPasswordModal({ input: '', error: '', onSuccess: () => sendToWebhook(N8N_STAG_UPDATE_WEBHOOK, { s_tag_autoinc_id: tag.s_tag_autoinc_id, s_tag_id: tag.s_tag_id, s_tag: tag.s_tag, brand: tag.brand, domain: profileModal?.domain ?? null, board_id: tag.board_id ?? null, item_id: tag.item_id ?? null }) })}
        onAddToMonday={(row, sTags, contacts) => setPasswordModal({ input: '', error: '', onSuccess: () => sendToWebhook(N8N_MONDAY_WEBHOOK, {
          id: row.id,
          batch_id: row.batch_id ?? null,
          keyword: row.keyword ?? null,
          country: row.country ?? null,
          url: row.url,
          domain: row.domain,
          result_type: row.result_type ?? null,
          is_rooster_partner: row.is_rooster_partner ?? null,
          affiliate_name: row.affiliate_name ?? null,
          screenshot_view_link: row.screenshot_view_link ?? null,
          screenshot_content_link: row.screenshot_content_link ?? null,
          s_tags: sTags,
          contact: contacts.filter((c) => c.is_chosen),
        }) })}
      />

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => !deleting && setDeleteConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon modal-icon--error">!</div>
            <h2 className="modal-title">Delete {selectedRows.size} lead{selectedRows.size !== 1 ? 's' : ''}?</h2>
            <p className="modal-message">
              This will permanently delete {selectedRows.size} lead{selectedRows.size !== 1 ? 's' : ''} along with any associated S-Tags and contacts. <strong>This cannot be undone.</strong>
            </p>
            <div className="modal-actions">
              <button className="btn-modal-cancel" onClick={() => setDeleteConfirm(false)} disabled={deleting}>Cancel</button>
              <button className="modal-close-btn modal-close-btn--danger" onClick={handleDeleteSelected} disabled={deleting} style={{ marginTop: 0 }}>
                {deleting ? 'Deleting...' : 'Yes, delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {addNewModal && (
        <div className="modal-overlay" onClick={() => !addNewModal.saving && setAddNewModal(null)}>
          <div className="modal add-new-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Add New Lead</h2>

            <div className="add-new-form">
              <div className="add-new-field">
                <label className="add-new-label">Batch ID</label>
                <input className="add-new-input" type="text" value={addNewModal.batchId} onChange={(e) => setAddNewModal((p) => ({ ...p, batchId: e.target.value }))} />
              </div>
              <div className="add-new-field">
                <label className="add-new-label">Keyword <span className="field-required">*</span></label>
                <input className="add-new-input" type="text" placeholder="Enter keyword" value={addNewModal.keyword} onChange={(e) => setAddNewModal((p) => ({ ...p, keyword: e.target.value }))} />
              </div>
              <div className="add-new-field">
                <label className="add-new-label">Country <span className="field-required">*</span></label>
                <select className="add-new-select" value={addNewModal.country} onChange={(e) => setAddNewModal((p) => ({ ...p, country: e.target.value }))}>
                  <option value="" disabled>Select country</option>
                  {countries.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div className="add-new-field">
                <label className="add-new-label">Full URL <span className="field-required">*</span></label>
                <input className="add-new-input" type="text" placeholder="https://example.com/page" value={addNewModal.url} onChange={(e) => setAddNewModal((p) => ({ ...p, url: e.target.value }))} />
              </div>
              <div className="add-new-field">
                <label className="add-new-label">Clean Domain <span className="field-required">*</span></label>
                <input className="add-new-input" type="text" placeholder="example.com" value={addNewModal.domain} onChange={(e) => setAddNewModal((p) => ({ ...p, domain: e.target.value }))} />
              </div>
              <div className="add-new-field">
                <label className="add-new-label">Result Type <span className="field-required">*</span></label>
                <select className="add-new-select" value={addNewModal.resultType} onChange={(e) => setAddNewModal((p) => ({ ...p, resultType: e.target.value }))}>
                  <option value="" disabled>Select type</option>
                  <option value="PPC">PPC</option>
                  <option value="Organic">Organic</option>
                </select>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-modal-cancel" onClick={() => setAddNewModal(null)} disabled={addNewModal.saving}>Cancel</button>
              <button className="modal-close-btn" disabled={!canSaveNewLead || addNewModal.saving} onClick={handleSaveNewLead} style={{ marginTop: 0 }}>
                {addNewModal.saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal modal={modal} onClose={handleModalClose} />

      <PasswordModal
        passwordModal={passwordModal}
        onPasswordChange={(val) => setPasswordModal((prev) => ({ ...prev, input: val, error: '' }))}
        onConfirm={handlePasswordConfirm}
        onCancel={() => setPasswordModal(null)}
      />

      <BatchSelectModal
        batchModal={batchModal}
        onSelectChange={(id) => setBatchModal((prev) => ({
          ...prev,
          selected: prev.selected.includes(id)
            ? prev.selected.filter((s) => s !== id)
            : [...prev.selected, id]
        }))}
        onConfirm={handleBatchConfirm}
        onCancel={() => setBatchModal(null)}
      />
    </div>
  )
}

export default App
