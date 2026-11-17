import React, { useEffect, useRef, useState } from 'react'

const CSS = `
  * { box-sizing: border-box; }
  .gm-root {
    min-height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 28px; padding: 32px 20px; color: var(--text); background: var(--bg); font-family: var(--font);
    text-align: center;
  }
  .gm-btn {
    width: min(260px, 72vw); aspect-ratio: 1; border-radius: 50%; border: none; cursor: pointer;
    font: 800 clamp(26px, 8vw, 34px)/1.05 var(--font); letter-spacing: -0.02em; color: #12210f;
    background: radial-gradient(circle at 35% 30%, #b9f58a, #4fc246 55%, #2c8a2e);
    box-shadow: 0 14px 0 #1f6522, 0 22px 40px rgba(40, 140, 50, .35);
    transition: transform .12s ease, box-shadow .12s ease, filter .2s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .gm-btn:hover:not(:disabled) { filter: brightness(1.05); }
  .gm-btn:active:not(:disabled) { transform: translateY(10px); box-shadow: 0 4px 0 #1f6522, 0 10px 20px rgba(40,140,50,.3); }
  .gm-btn:focus-visible { outline: 3px solid var(--accent); outline-offset: 6px; }
  .gm-btn:disabled { cursor: default; filter: saturate(.5) brightness(.9); }
  .gm-price { font-size: 15px; color: var(--muted); margin: 0; }
  .gm-price b { color: var(--text); }
  .gm-status { min-height: 44px; max-width: 320px; font-size: 15px; line-height: 1.4; margin: 0; }
  .gm-ok { color: #3fae46; font-weight: 700; }
  .gm-err { color: #e0564b; }
  .gm-pulse { animation: gm-pulse 1.4s ease-in-out infinite; }
  @keyframes gm-pulse { 50% { transform: scale(.97); } }
  @media (prefers-reduced-motion: reduce) {
    .gm-btn { transition: none; } .gm-pulse { animation: none; }
  }
`

const WAITING = ['confirmation_required', 'payment_in_progress']
const credits = micro => {
  const n = micro / 1e6
  return `${Number.isInteger(n) ? n : n.toFixed(2)} credit${n === 1 ? '' : 's'}`
}
const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2))

export default function App({ appId, token }) {
  const [price, setPrice] = useState(null)
  const [state, setState] = useState({ kind: 'idle' })
  const alive = useRef(true)

  const call = async (method, path, body) => {
    const res = await fetch(`/api/apps/${appId}/service/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    let data = {}
    try { data = await res.json() } catch { /* empty */ }
    if (!res.ok) {
      const d = data.detail
      const err = new Error((d && typeof d === 'object' ? d.detail || d.message : d) || 'That didn’t go through.')
      err.code = data.code || (d && d.code) || ''
      throw err
    }
    return data
  }

  useEffect(() => {
    alive.current = true
    call('GET', 'price')
      .then(p => alive.current && setPrice(p))
      .catch(e => alive.current && setState({ kind: 'error', text: e.message }))
    return () => { alive.current = false }
  }, [appId])

  const give = async () => {
    if (!price) return
    const key = newKey()
    setState({ kind: 'paying' })
    const until = Date.now() + 5 * 60 * 1000
    for (;;) {
      try {
        const r = await call('POST', 'give', { key, price_micro: price.price_micro })
        if (alive.current) setState({ kind: 'paid', text: `Thanks! ${credits(r.charged_micro || price.price_micro)} sent.` })
        return
      } catch (e) {
        if (!alive.current) return
        if (WAITING.includes(e.code) && Date.now() < until) {
          setState({ kind: 'confirm' })
          await new Promise(r => setTimeout(r, 2000))
          continue
        }
        const text = e.code === 'payment_declined' ? 'Cancelled — no money given.' : e.message
        setState({ kind: 'error', text })
        return
      }
    }
  }

  const busy = state.kind === 'paying' || state.kind === 'confirm'
  return (
    <div className="gm-root">
      <style>{CSS}</style>
      <button className={`gm-btn${busy ? ' gm-pulse' : ''}`} onClick={give} disabled={busy || !price}>
        Give me<br />money
      </button>
      <p className="gm-price">{price ? <>Costs <b>{credits(price.price_micro)}</b></> : 'Loading price…'}</p>
      <p className={`gm-status ${state.kind === 'paid' ? 'gm-ok' : state.kind === 'error' ? 'gm-err' : ''}`} role="status" aria-live="polite">
        {state.kind === 'confirm' && 'Confirm the payment in Möbius…'}
        {state.kind === 'paying' && 'Asking…'}
        {(state.kind === 'paid' || state.kind === 'error') && state.text}
      </p>
    </div>
  )
}
