import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

const TAGS = ['風力', '法務', '洋上風力', '財務', 'エネルギー', '再エネ', '制度', '時事', 'IT', 'Tech']
const SESSION_KEY = 'kb_session_v2'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function jstMidnight(daysAgo = 0) {
  const now = new Date()
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const jstMid = new Date(Date.UTC(
    jstNow.getUTCFullYear(), jstNow.getUTCMonth(), jstNow.getUTCDate() - daysAgo, 0, 0, 0, 0
  ))
  return new Date(jstMid.getTime() - 9 * 60 * 60 * 1000)
}

function filterCards(cards, { typeFilter, tagFilters, dateFilter, labelFilter }) {
  let f = cards

  if (typeFilter !== 'All') f = f.filter(c => c.type === typeFilter)
  if (tagFilters.length > 0) f = f.filter(c => tagFilters.some(t => c.tags.includes(t)))

  if (dateFilter !== 'all') {
    const daysAgo = dateFilter === 'today' ? 0 : dateFilter === 'yesterday' ? 1 : dateFilter === 'week' ? 7 : 30
    const since = jstMidnight(daysAgo)
    f = f.filter(c => new Date(c.created_time) >= since || new Date(c.last_edited_time) >= since)
  }

  if (labelFilter === '重要') f = f.filter(c => c.status === 'Focus')
  else if (labelFilter === '修正') f = f.filter(c => c.yushsei === true)
  else if (labelFilter === '済') f = f.filter(c => c.status === 'Known')
  else f = f.filter(c => c.status !== 'Known') // default: exclude Known

  return f
}

function sortCards(cards, sortOrder) {
  if (sortOrder === 'random') return shuffle(cards)
  const s = [...cards]
  if (sortOrder === 'updated') s.sort((a, b) => new Date(b.last_edited_time) - new Date(a.last_edited_time))
  else s.sort((a, b) => new Date(b.created_time) - new Date(a.created_time))
  return s
}

function filtersKey(f) {
  return JSON.stringify({ ...f, tagFilters: [...(f.tagFilters || [])].sort() })
}

// Multi-select tag dropdown
function TagDropdown({ selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    document.addEventListener('touchstart', h)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h) }
  }, [])

  const toggle = tag => {
    onChange(selected.includes(tag) ? selected.filter(t => t !== tag) : [...selected, tag])
  }

  return (
    <div className="tag-dropdown" ref={ref}>
      <button className="filter-select tag-btn" onClick={() => setOpen(o => !o)}>
        {selected.length > 0 ? `タグ (${selected.length})` : 'タグ'}
      </button>
      {open && (
        <div className="tag-dropdown-menu">
          {TAGS.map(tag => (
            <label key={tag} className="tag-option">
              <input type="checkbox" checked={selected.includes(tag)} onChange={() => toggle(tag)} />
              <span>{tag}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [allCards, setAllCards] = useState([])
  const [cards, setCards] = useState([])
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [typeFilter, setTypeFilter] = useState('All')
  const [tagFilters, setTagFilters] = useState([])
  const [dateFilter, setDateFilter] = useState('today')
  const [sortOrder, setSortOrder] = useState('updated')
  const [labelFilter, setLabelFilter] = useState('all')

  const [sessionDone, setSessionDone] = useState(false)
  const [summary, setSummary] = useState({ 済: 0, 重要: 0, 修正: 0 })

  const [selectedLabels, setSelectedLabels] = useState(new Set())
  const [updating, setUpdating] = useState(false)

  const [editing, setEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editAnswer, setEditAnswer] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [images, setImages] = useState(null)
  const [showImages, setShowImages] = useState(false)

  // Refs to avoid stale closures
  const allCardsRef = useRef([])
  const filtersRef = useRef({ typeFilter, tagFilters, dateFilter, sortOrder, labelFilter })
  useEffect(() => { allCardsRef.current = allCards }, [allCards])
  useEffect(() => {
    filtersRef.current = { typeFilter, tagFilters, dateFilter, sortOrder, labelFilter }
  }, [typeFilter, tagFilters, dateFilter, sortOrder, labelFilter])

  const isFirstLoad = useRef(true)
  const isFirstFilterRender = useRef(true)

  // Fetch cards
  useEffect(() => {
    fetch('/api/cards')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setAllCards(data.cards)
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  // Initialize deck when allCards first loads
  useEffect(() => {
    if (allCards.length === 0 || !isFirstLoad.current) return
    isFirstLoad.current = false

    const filters = filtersRef.current

    // Try session restore
    try {
      const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
      if (saved && filtersKey(saved.filters) === filtersKey(filters)) {
        const restored = saved.cardIds.map(id => allCards.find(c => c.id === id)).filter(Boolean)
        if (restored.length > 0) {
          setCards(restored)
          setIdx(Math.min(saved.idx, restored.length - 1))
          return
        }
      }
    } catch {}

    setCards(sortCards(filterCards(allCards, filters), filters.sortOrder))
    setIdx(0)
  }, [allCards])

  // Rebuild deck on filter change (skip initial mount)
  useEffect(() => {
    if (isFirstFilterRender.current) { isFirstFilterRender.current = false; return }
    if (allCardsRef.current.length === 0) return

    const filters = { typeFilter, tagFilters, dateFilter, sortOrder, labelFilter }
    localStorage.removeItem(SESSION_KEY)
    setCards(sortCards(filterCards(allCardsRef.current, filters), sortOrder))
    setIdx(0)
    setFlipped(false)
    setSessionDone(false)
    setSummary({ 済: 0, 重要: 0, 修正: 0 })
    setEditing(false)
    setShowImages(false)
  }, [typeFilter, tagFilters, dateFilter, sortOrder, labelFilter])

  const saveSession = useCallback((c, i) => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        cardIds: c.map(x => x.id),
        idx: i,
        filters: filtersRef.current
      }))
    } catch {}
  }, [])

  const currentCard = cards[idx]

  // Per-card setup: init labels + fetch images
  useEffect(() => {
    if (!currentCard) return
    const labels = new Set()
    if (currentCard.status === 'Known') labels.add('済')
    if (currentCard.status === 'Focus') labels.add('重要')
    if (currentCard.yushsei) labels.add('修正')
    setSelectedLabels(labels)
    setImages(null)
    setShowImages(false)
    fetch(`/api/blocks/${currentCard.id}`)
      .then(r => r.json())
      .then(data => setImages(data.images || []))
      .catch(() => setImages([]))
  }, [currentCard?.id])

  const handleFlip = () => setFlipped(f => !f)

  const handleLabelToggle = async label => {
    if (!currentCard || updating) return

    const n = new Set(selectedLabels)
    if (label === '済') {
      if (n.has('済')) n.delete('済')
      else { n.delete('重要'); n.add('済') }
    } else if (label === '重要') {
      if (n.has('重要')) n.delete('重要')
      else { n.delete('済'); n.add('重要') }
    } else {
      if (n.has('修正')) n.delete('修正')
      else n.add('修正')
    }

    setSelectedLabels(n)

    if (label === '済' && n.has('済')) setSummary(s => ({ ...s, 済: s.済 + 1 }))
    if (label === '重要' && n.has('重要')) setSummary(s => ({ ...s, 重要: s.重要 + 1 }))
    if (label === '修正' && n.has('修正')) setSummary(s => ({ ...s, 修正: s.修正 + 1 }))

    const status = n.has('済') ? 'Known' : n.has('重要') ? 'Focus' : 'Active'
    const yushsei = n.has('修正')

    // Optimistic local update
    setCards(prev => prev.map((c, i) => i === idx ? { ...c, status, yushsei } : c))
    setAllCards(prev => prev.map(c => c.id === currentCard.id ? { ...c, status, yushsei } : c))

    setUpdating(true)
    try {
      await fetch(`/api/cards/${currentCard.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, yushsei })
      })
    } catch (e) { console.error('Label update failed:', e) }
    setUpdating(false)
  }

  const handleNext = () => {
    if (idx + 1 >= cards.length) {
      setSessionDone(true)
      localStorage.removeItem(SESSION_KEY)
      return
    }
    const next = idx + 1
    setIdx(next)
    setFlipped(false)
    setEditing(false)
    setShowImages(false)
    saveSession(cards, next)
  }

  const handlePrev = () => {
    if (idx === 0) return
    const prev = idx - 1
    setIdx(prev)
    setFlipped(false)
    setEditing(false)
    setShowImages(false)
    saveSession(cards, prev)
  }

  const handleEditStart = () => {
    setEditTitle(currentCard.title)
    setEditAnswer(currentCard.answer)
    setEditing(true)
    setFlipped(false)
  }

  const handleEditSave = async () => {
    if (!currentCard || saving) return
    setSaving(true); setSaveError('')
    try {
      const res = await fetch(`/api/cards/${currentCard.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle, answer: editAnswer })
      })
      const data = await res.json()
      if (!res.ok || data.error) { setSaveError(data.error || `エラー: ${res.status}`); setSaving(false); return }
      const update = { title: editTitle, answer: editAnswer }
      setCards(prev => prev.map((c, i) => i === idx ? { ...c, ...update } : c))
      setAllCards(prev => prev.map(c => c.id === currentCard.id ? { ...c, ...update } : c))
      setEditing(false)
    } catch (e) { setSaveError(e.message) }
    setSaving(false)
  }

  const handleRestart = () => {
    localStorage.removeItem(SESSION_KEY)
    const filters = filtersRef.current
    setCards(sortCards(filterCards(allCardsRef.current, filters), filters.sortOrder))
    setIdx(0); setFlipped(false); setSessionDone(false)
    setSummary({ 済: 0, 重要: 0, 修正: 0 })
    setEditing(false); setShowImages(false)
  }

  if (loading) return (
    <div className="app"><div className="loading"><div className="spinner" /><p>Notionからカードを読み込み中…</p></div></div>
  )

  if (error) return (
    <div className="app"><div className="error-box"><p>エラーが発生しました</p><p className="error-msg">{error}</p></div></div>
  )

  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          <h1 className="app-title">Knowledge Base</h1>
          {cards.length > 0 && !sessionDone && (
            <span className="progress-count">{idx + 1} / {cards.length}</span>
          )}
        </div>
        <div className="filters">
          <select className="filter-select" value={dateFilter} onChange={e => setDateFilter(e.target.value)}>
            <option value="today">今日</option>
            <option value="yesterday">昨日</option>
            <option value="week">今週</option>
            <option value="month">今月</option>
            <option value="all">全期間</option>
          </select>
          <TagDropdown selected={tagFilters} onChange={setTagFilters} />
          <select className="filter-select" value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
            <option value="updated">更新日順</option>
            <option value="created">作成日順</option>
            <option value="random">ランダム</option>
          </select>
          <select className="filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="All">All Types</option>
            <option value="Vocabulary">Vocabulary</option>
            <option value="Question">Question</option>
          </select>
          <select className="filter-select" value={labelFilter} onChange={e => setLabelFilter(e.target.value)}>
            <option value="all">すべて</option>
            <option value="重要">重要</option>
            <option value="修正">修正</option>
            <option value="済">済</option>
          </select>
        </div>
      </header>

      {sessionDone ? (
        <div className="session-done">
          <h2 className="done-title">セッション完了</h2>
          <div className="summary">
            {[['済', summary.済], ['重要', summary.重要], ['修正', summary.修正]].map(([l, c]) => (
              <div key={l} className="summary-item">
                <span className="summary-label">{l}</span>
                <span className="summary-count">{c}</span>
              </div>
            ))}
          </div>
          <button className="btn-restart" onClick={handleRestart}>もう一度やる</button>
        </div>
      ) : cards.length === 0 ? (
        <div className="empty"><p>該当するカードがありません</p></div>
      ) : (
        <main className="main">
          {editing ? (
            <div className="edit-area">
              <div className="edit-field">
                <label className="edit-label">問題</label>
                <textarea className="edit-input" value={editTitle} onChange={e => setEditTitle(e.target.value)} rows={3} autoFocus />
              </div>
              <div className="edit-field">
                <label className="edit-label">回答</label>
                <textarea className="edit-input" value={editAnswer} onChange={e => setEditAnswer(e.target.value)} rows={6} />
              </div>
              {saveError && <p className="edit-error">{saveError}</p>}
              <div className="edit-actions">
                <button className="btn-edit-cancel" onClick={() => setEditing(false)}>キャンセル</button>
                <button className="btn-edit-save" onClick={handleEditSave} disabled={saving}>{saving ? '保存中…' : '保存'}</button>
              </div>
            </div>
          ) : (
            <>
              {/* 問題エリア */}
              <div className="question-area" onClick={handleFlip}>
                <div className="type-row">
                  <div className="type-row-left">
                    <span className="type-label">{currentCard.type}</span>
                    {currentCard.status === 'Focus' && <span className="status-badge badge-focus">重要</span>}
                    {currentCard.status === 'Known' && <span className="status-badge badge-known">済</span>}
                    {currentCard.yushsei && <span className="status-badge badge-yushsei">修正</span>}
                  </div>
                  <button className="btn-edit" onClick={e => { e.stopPropagation(); handleEditStart() }}>編集</button>
                </div>
                <p className="question-text">{currentCard.title}</p>
              </div>

              <div className="divider" />

              {/* 回答エリア */}
              <div className="answer-area">
                {flipped ? (
                  <>
                    <p className="answer-text">{currentCard.answer}</p>
                    <div className="answer-footer">
                      <div className="tag-row">
                        {currentCard.tags.map(tag => (
                          <span key={tag} className="tag-badge">{tag}</span>
                        ))}
                      </div>
                      {images && images.length > 0 && (
                        <button className="btn-image-answer" onClick={() => setShowImages(true)}>
                          画像 ({images.length})
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="answer-hint" onClick={handleFlip}>タップして回答を表示</p>
                )}
              </div>

              {/* ラベルボタン (回答表示後のみ) */}
              {flipped && (
                <div className="label-section">
                  {['済', '重要', '修正'].map(label => (
                    <button
                      key={label}
                      className={`btn-label${selectedLabels.has(label) ? ' selected' : ''}`}
                      onClick={() => handleLabelToggle(label)}
                      disabled={updating}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* ナビ */}
              <div className="nav-row">
                <button className="btn-nav" onClick={handlePrev} disabled={idx === 0}>前</button>
                <button className="btn-nav btn-nav-next" onClick={handleNext}>次</button>
              </div>
            </>
          )}

          {/* 画像モーダル */}
          {showImages && images && images.length > 0 && (
            <div className="image-modal-overlay" onClick={() => setShowImages(false)}>
              <div className="image-modal" onClick={e => e.stopPropagation()}>
                <button className="image-modal-close" onClick={() => setShowImages(false)}>✕</button>
                <div className="image-list">
                  {images.map((img, i) => (
                    <div key={i} className="image-item">
                      <img src={img.url} alt={img.caption || `画像${i + 1}`} />
                      {img.caption && <p className="image-caption">{img.caption}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      )}
    </div>
  )
}
