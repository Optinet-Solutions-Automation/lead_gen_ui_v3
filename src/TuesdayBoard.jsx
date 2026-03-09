import { useState, useEffect } from 'react'
import { supabase } from './supabase'
import './TuesdayBoard.css'

const BOARDS = [
  {
    key: 'leads',
    label: 'Leads',
    table: 'leads_table',
    newLabel: 'Add New',
    columns: [
      { key: 'name',           label: 'Lead' },
      { key: 'affiliate_name', label: 'Affiliate Name' },
      { key: 'keywords',       label: 'Keywords' },
      { key: 'status',         label: 'Status' },
      { key: 'comments',       label: 'Comments' },
      { key: 'email',          label: 'Email' },
      { key: 'traffic_size',   label: 'Traffic Size' },
      { key: 'source',         label: 'Source' },
      { key: 'files',          label: 'Files' },
      { key: 'owner',          label: 'Owner' },
      { key: 'geo',            label: 'Geo' },
      { key: 'date',           label: 'Date' },
      { key: 'website',        label: 'Website' },
    ],
  },
  {
    key: 'affiliates',
    label: 'Affiliates',
    table: 'affiliates_table',
    newLabel: 'Add New',
    columns: [
      { key: 'name',             label: 'Lead' },
      { key: 'keywords',         label: 'Keywords' },
      { key: 'l7_sj_rs_lv_ro',  label: 'L7/SJ/RS/LV/RO' },
      { key: 'rb_fp_su',         label: 'RB/FP/SU' },
      { key: 'pm',               label: 'PM' },
      { key: 'nd',               label: 'ND' },
      { key: 'affiliate_name',   label: 'Affiliate Name' },
      { key: 'status',           label: 'Status' },
      { key: 'comments',         label: 'Comments' },
      { key: 'traffic_size',     label: 'Traffic Size' },
      { key: 'source',           label: 'Source' },
      { key: 'files',            label: 'Files' },
      { key: 'geo',              label: 'Geo' },
      { key: 'owner',            label: 'Owner' },
      { key: 'date',             label: 'Date' },
      { key: 'website',          label: 'Website' },
    ],
  },
  {
    key: 'not_relevant',
    label: 'Not Relevant Leads',
    table: 'not_relevant_leads_table',
    newLabel: 'Add New',
    columns: [
      { key: 'name',           label: 'Lead' },
      { key: 'keywords',       label: 'Keywords' },
      { key: 'affiliate_id',   label: 'Affiliate ID' },
      { key: 'affiliate_name', label: 'Affiliate Name' },
      { key: 'status',         label: 'Status' },
      { key: 'comments',       label: 'Comments' },
      { key: 'google_page',    label: 'Google Page' },
      { key: 'email',          label: 'Email' },
      { key: 'traffic_size',   label: 'Traffic Size' },
      { key: 'source',         label: 'Source' },
      { key: 'files',          label: 'Files' },
      { key: 'geo',            label: 'Geo' },
      { key: 'owner',          label: 'Owner' },
      { key: 'date',           label: 'Date' },
      { key: 'website',        label: 'Website' },
    ],
  },
  {
    key: 'email_undelivered',
    label: 'Email Undelivered Leads',
    table: 'email_undelivered_leads_table',
    newLabel: 'Add New',
    columns: [
      { key: 'name',           label: 'Lead' },
      { key: 'keywords',       label: 'Keywords' },
      { key: 'affiliate_id',   label: 'Affiliate ID' },
      { key: 'affiliate_name', label: 'Affiliate Name' },
      { key: 'status',         label: 'Status' },
      { key: 'comments',       label: 'Comments' },
      { key: 'google_page',    label: 'Google Page' },
      { key: 'email',          label: 'Email' },
      { key: 'traffic_size',   label: 'Traffic Size' },
      { key: 'source',         label: 'Source' },
      { key: 'files',          label: 'Files' },
      { key: 'geo',            label: 'Geo' },
      { key: 'owner',          label: 'Owner' },
      { key: 'date',           label: 'Date' },
      { key: 'website',        label: 'Website' },
    ],
  },
]

export default function TuesdayBoard() {
  const [activeBoard, setActiveBoard] = useState('leads')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [profileRow, setProfileRow] = useState(null)

  const board = BOARDS.find((b) => b.key === activeBoard)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setRows([])

    const selectCols = board.columns.map((c) => c.key).join(', ')

    supabase
      .from(board.table)
      .select(selectCols)
      .then(({ data, error }) => {
        if (cancelled) return
        setLoading(false)
        if (error) { console.error(error); return }
        setRows(data ?? [])
      })

    return () => { cancelled = true }
  }, [activeBoard])

  return (
    <div className="tb-layout">
      {/* ── Sidebar ─────────────────────────────────────── */}
      <aside className="tb-sidebar">
        <ul className="tb-sidebar-list">
          {BOARDS.map((b) => (
            <li key={b.key}>
              <button
                className={`tb-sidebar-item${activeBoard === b.key ? ' tb-sidebar-item--active' : ''}`}
                onClick={() => setActiveBoard(b.key)}
              >
                <span className="tb-sidebar-icon">
                  {b.key === 'leads' && (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM3 13c0-2.76 2.24-5 5-5s5 2.24 5 5H3Z" fill="currentColor"/></svg>
                  )}
                  {b.key === 'affiliates' && (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5.5 1a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Zm5 0a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM1 12.5C1 10.01 3.01 8 5.5 8c1.3 0 2.47.55 3.3 1.43A4.98 4.98 0 0 0 5.5 14H1v-1.5Zm9.5-4.5c2.49 0 4.5 2.01 4.5 4.5V14h-4.5a4.5 4.5 0 0 1 0-6Z" fill="currentColor"/></svg>
                  )}
                  {b.key === 'not_relevant' && (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm3.54 9.46a.75.75 0 0 1-1.06 0L8 8.06l-2.48 2.4a.75.75 0 1 1-1.06-1.06L6.94 7 4.46 4.54a.75.75 0 1 1 1.06-1.06L8 5.94l2.48-2.46a.75.75 0 1 1 1.06 1.06L9.06 7l2.48 2.46a.75.75 0 0 1 0 1Z" fill="currentColor"/></svg>
                  )}
                  {b.key === 'email_undelivered' && (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 3h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm0 1.5 6 3.5 6-3.5V4L8 7.5 2 4v.5Z" fill="currentColor"/></svg>
                  )}
                </span>
                {b.label}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      {/* ── Main content ────────────────────────────────── */}
      <main className="tb-main">
        <h1 className="tb-board-title">{board.label}</h1>

        <div className="tb-toolbar">
          <button className="tb-btn-new">+ {board.newLabel}</button>
        </div>

        <div className="tb-table-card">
          <div className="tb-table-wrapper">
            <table className="tb-table">
              <thead>
                <tr>
                  <th className="tb-col-view"></th>
                  {board.columns.map((col) => (
                    <th key={col.key}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={board.columns.length + 1} className="tb-no-data">Loading...</td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={board.columns.length + 1} className="tb-no-data">No data found.</td>
                  </tr>
                ) : (
                  rows.map((row, i) => (
                    <tr key={row.id ?? i}>
                      <td className="tb-col-view">
                        <button className="tb-btn-view" onClick={() => setProfileRow(row)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                      </td>
                      {board.columns.map((col) => (
                        <td key={col.key}>
                          {col.key === 'website' && row[col.key]
                            ? <a href={row[col.key].startsWith('http') ? row[col.key] : `https://${row[col.key]}`} target="_blank" rel="noopener noreferrer" className="tb-cell-link">{row[col.key]}</a>
                            : col.key === 'email' && row[col.key]
                            ? <a href={`mailto:${row[col.key]}`} className="tb-cell-link">{row[col.key]}</a>
                            : col.key === 'files' && row[col.key]
                            ? <a href={row[col.key].startsWith('http') ? row[col.key] : `https://${row[col.key]}`} target="_blank" rel="noopener noreferrer" className="tb-cell-link">Click here</a>
                            : row[col.key] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* ── Profile Modal ───────────────────────────────── */}
      {profileRow && (
        <div className="tb-modal-overlay" onClick={() => setProfileRow(null)}>
          <div className="tb-modal" onClick={(e) => e.stopPropagation()}>
            <button className="tb-modal-x" onClick={() => setProfileRow(null)}>&times;</button>
            <h2 className="tb-modal-title">{profileRow.name || 'Profile'}</h2>
            <div className="tb-profile-grid">
              {board.columns.map((col) => (
                <div key={col.key} className="tb-profile-row">
                  <div className="tb-profile-label">{col.label}</div>
                  <div className="tb-profile-value">
                    {col.key === 'website' && profileRow[col.key]
                      ? <a href={profileRow[col.key].startsWith('http') ? profileRow[col.key] : `https://${profileRow[col.key]}`} target="_blank" rel="noopener noreferrer" className="tb-cell-link">{profileRow[col.key]}</a>
                      : col.key === 'email' && profileRow[col.key]
                      ? <a href={`mailto:${profileRow[col.key]}`} className="tb-cell-link">{profileRow[col.key]}</a>
                      : col.key === 'files' && profileRow[col.key]
                      ? <a href={profileRow[col.key].startsWith('http') ? profileRow[col.key] : `https://${profileRow[col.key]}`} target="_blank" rel="noopener noreferrer" className="tb-cell-link">Click here</a>
                      : profileRow[col.key] ?? '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
