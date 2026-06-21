import { useState, useEffect, useCallback } from 'react'
import './App.css'

const TAGS = ['風力', '法務', '洋上風力', '財務', 'エネルギー', '再エネ', '制度', '時事', 'IT', 'Tech']
const SCORE_LABELS = { 1: '全然', 2: 'あいまい', 3: 'まあまあ', 4: 'だいたい', 5: '完璧' }

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// JSTの今日00:00をUTCのDateで返す
function jstMidnight(daysAgo = 0) {
  const now = new Date()
  // JST = UTC+9
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const jstMid = new Date(Date.UTC(
    jstNow.getUTCFullYear(),
    jstNow.getUTCMonth(),
    jstNow.getUTCDate() - daysAgo,
    0, 0, 0, 0
  ))
  // UTC+9 → UTCに戻す
  return new Date(jstMid.getTime() - 9 * 60 * 60 * 1000)
}

function applyDateFilter(cards, dateFilter) {
  if (dateFilter === 'all') return cards
  let since
  if (dateFilter === 'today') since = jstMidnight(0)
  else if (dateFilter === 'yesterday') since = jstMidnight(1)
  else if (dateFilter === 'week') since = jstMidnight(7)
  else if (dateFilter === 'month') since = jstMidnight(30)
  return cards.filter(c => {
    const created = new Date(c.created_time)
    const edited = new Date(c.last_edited_time)
    return created >= since || edited >= since
  })
}

function applySort(cards, sortOrder) {
  if (sortOrder === 'random') return shuffle(cards)
  const sorted = [...cards]
  if (sortOrder === 'updated') {
    sorted.sort((a, b) => new Date(b.last_edited_time) - new Date(a.last_edited_time))
  } else if (sortOrder === 'created') {
    sorted.sort((a, b) => new Date(b.created_time) - new Date(a.created_time))
  }
  return sorted
}

export default function App() {
  const [allCards, setAllCards] = useState([])
  const [cards, setCards] = useState([])
  const [idx, setIdx] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [typeFilter, setTypeFilter] = useState('All')
  const [tagFilter, setTagFilter] = useState('All Tags')
  const [dateFilter, setDateFilter] = useState('all')
  const [sortOrder, setSortOrder] = useState('random')
  const [sessionDone, setSessionDone] = useState(false)
  const [summary, setSummary] = useState({ Focus: 0, Active: 0, Known: 0 })
  const [updating, setUpdating] = useState(false)
  const [scored, setScored] = useState(false)

  useEffect(() => {
    fetch('/api/cards')
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error)
        setAllCards(data.cards)
        setLoading(false)
      })
      .catch(e => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  const buildCards = useCallback(() => {
    let filtered = allCards
    if (typeFilter !== 'All') {
      filtered = filtered.filter(c => c.type === typeFilter)
    }
    if (tagFilter !== 'All Tags') {
      filtered = filtered.filter(c => c.tags.includes(tagFilter))
    }
    filtered = applyDateFilter(filtered, dateFilter)
    return applySort(filtered, sortOrder)
  }, [allCards, typeFilter, tagFilter, dateFilter, sortOrder])

  const applyFilters = useCallback(() => {
    const result = buildCards()
    setCards(result)
    setIdx(0)
    setFlipped(false)
    setScored(false)
    setSessionDone(false)
    setSummary({ Focus: 0, Active: 0, Known: 0 })
  }, [buildCards])

  useEffect(() => {
    if (allCards.length > 0) applyFilters()
  }, [allCards, typeFilter, tagFilter, dateFilter, sortOrder])

  const currentCard = cards[idx]

  const handleFlip = () => setFlipped(f => !f)

  const handleScore = async (score) => {
    if (!currentCard || updating) return
    setUpdating(true)

    let newStatus
    if (score <= 2) newStatus = 'Focus'
    else if (score <= 4) newStatus = 'Active'
    else newStatus = 'Known'

    setSummary(prev => ({ ...prev, [newStatus]: prev[newStatus] + 1 }))
    setScored(true)

    try {
      await fetch(`/api/cards/${currentCard.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score })
      })
    } catch (e) {
      console.error('Update failed:', e)
    }

    setUpdating(false)
  }

  const handleNext = () => {
    if (idx + 1 >= cards.length) {
      setSessionDone(true)
      return
    }
    setIdx(i => i + 1)
    setFlipped(false)
    setScored(false)
  }

  const handlePrev = () => {
    if (idx === 0) return
    setIdx(i => i - 1)
    setFlipped(false)
    setScored(false)
  }

  if (loading) {
    return (
      <div className="app">
        <div className="loading">
          <div className="spinner" />
          <p>Notionからカードを読み込み中…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="app">
        <div className="error-box">
          <p>エラーが発生しました</p>
          <p className="error-msg">{error}</p>
        </div>
      </div>
    )
  }

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
          <select className="filter-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="All">All Types</option>
            <option value="Vocabulary">Vocabulary</option>
            <option value="Question">Question</option>
          </select>
          <select className="filter-select" value={tagFilter} onChange={e => setTagFilter(e.target.value)}>
            <option value="All Tags">All Tags</option>
            {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="filter-select" value={dateFilter} onChange={e => setDateFilter(e.target.value)}>
            <option value="all">全て</option>
            <option value="today">今日</option>
            <option value="yesterday">昨日</option>
            <option value="week">1週間</option>
            <option value="month">1か月</option>
          </select>
          <select className="filter-select" value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
            <option value="random">ランダム</option>
            <option value="updated">更新日順</option>
            <option value="created">作成日順</option>
          </select>
        </div>
      </header>

      {sessionDone ? (
        <div className="session-done">
          <h2 className="done-title">セッション完了</h2>
          <div className="summary">
            <div className="summary-item">
              <span className="summary-label">Focus</span>
              <span className="summary-count">{summary.Focus}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Active</span>
              <span className="summary-count">{summary.Active}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Known</span>
              <span className="summary-count">{summary.Known}</span>
            </div>
          </div>
          <button className="btn-restart" onClick={applyFilters}>
            もう一度やる
          </button>
        </div>
      ) : cards.length === 0 ? (
        <div className="empty">
          <p>該当するカードがありません</p>
        </div>
      ) : (
        <main className="main">
          <div className="question-area" onClick={handleFlip}>
            <div className="type-row">
              <span className="type-label">{currentCard.type}</span>
            </div>
            <p className="question-text">{currentCard.title}</p>
          </div>

          <div className="divider" />

          <div className="answer-area">
            {flipped ? (
              <>
                <p className="answer-text">{currentCard.answer}</p>
                {currentCard.tags.length > 0 && (
                  <div className="tag-row">
                    {currentCard.tags.map(tag => (
                      <span key={tag} className="tag-badge">{tag}</span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="answer-hint" onClick={handleFlip}>タップして回答を表示</p>
            )}
          </div>

          {flipped && (
            <div className="score-section">
              <p className="score-label">理解度</p>
              <div className="score-buttons">
                {[1, 2, 3, 4, 5].map(s => (
                  <button
                    key={s}
                    className={`btn-score${scored ? ' scored' : ''}`}
                    onClick={() => handleScore(s)}
                    disabled={updating}
                  >
                    <span className="score-num">{s}</span>
                    <span className="score-text">{SCORE_LABELS[s]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="nav-row">
            <button className="btn-nav" onClick={handlePrev} disabled={idx === 0}>前</button>
            <button className="btn-nav btn-nav-next" onClick={handleNext}>次</button>
          </div>
        </main>
      )}
    </div>
  )
}
