import { useEffect, useMemo, useState } from 'react';
import { diffWordsWithSpace } from 'diff';

const SAMPLE_TEXT = `The results show that the project met its objectives in multiple ways. The report explains the timeline and outcomes in detail. The team completed every task on schedule and stayed aligned with requirements. It is important to note that each milestone followed the same structure for consistency. Furthermore, the analysis provides a clear summary of what happened and why it mattered.`;

const WORD_LIMIT = 10000;

const CATEGORY_STYLE = {
  'vary-sentence-length': 'border-sky-500/60 bg-sky-500/15 text-sky-100',
  'swap-predictable-phrasing': 'border-amber-500/60 bg-amber-500/15 text-amber-100',
  'add-stylistic-texture': 'border-emerald-500/60 bg-emerald-500/15 text-emerald-100',
  'diversify-openers': 'border-fuchsia-500/60 bg-fuchsia-500/15 text-fuchsia-100',
  'reduce-hedging-uniformity': 'border-rose-500/60 bg-rose-500/15 text-rose-100'
};

const METRICS = [
  { key: 'perplexity', label: 'Perplexity Risk', hint: 'Lower predictability is healthier.' },
  { key: 'burstiness', label: 'Burstiness Risk', hint: 'Sentence rhythm should vary naturally.' },
  { key: 'sentencePatternDiversity', label: 'Sentence Pattern Diversity Risk', hint: 'Repeated openers increase risk.' },
  { key: 'vocabularyPredictability', label: 'Vocabulary Predictability Risk', hint: 'Overly safe word choice can look synthetic.' },
  { key: 'overallRisk', label: 'Overall Detection Risk', hint: 'Combined heuristic score.' }
];

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const getRiskTone = (score) => {
  if (score < 35) return 'text-emerald-400';
  if (score < 65) return 'text-amber-300';
  return 'text-rose-400';
};

const barColor = (score) => {
  if (score < 35) return 'bg-emerald-500';
  if (score < 65) return 'bg-amber-500';
  return 'bg-rose-500';
};

const countWords = (text) => {
  const matches = text.trim().match(/\S+/g);
  return matches ? matches.length : 0;
};

const renderDiffPanel = (parts, mode) => {
  return parts.map((part, idx) => {
    if (mode === 'original' && part.added) return null;
    if (mode === 'edited' && part.removed) return null;

    let className = '';
    if (mode === 'original' && part.removed) className = 'bg-rose-500/25 text-rose-100 rounded px-0.5';
    if (mode === 'edited' && part.added) className = 'bg-emerald-500/25 text-emerald-100 rounded px-0.5';

    return (
      <span key={`${mode}-${idx}`} className={className}>
        {part.value}
      </span>
    );
  });
};

const HighlightedPreview = ({ text, suggestions, activeSuggestionId, onSelectSuggestion }) => {
  const pending = suggestions
    .filter((suggestion) => suggestion.status === 'pending')
    .sort((a, b) => a.start - b.start);

  if (!pending.length) {
    return <p className="whitespace-pre-wrap text-sm text-[var(--fg-soft)]">No pending inline highlights.</p>;
  }

  const segments = [];
  let cursor = 0;

  pending.forEach((suggestion) => {
    if (suggestion.start < cursor || suggestion.end > text.length) return;
    if (suggestion.start > cursor) {
      segments.push({ type: 'text', content: text.slice(cursor, suggestion.start) });
    }

    segments.push({
      type: 'highlight',
      content: text.slice(suggestion.start, suggestion.end),
      suggestion
    });
    cursor = suggestion.end;
  });

  if (cursor < text.length) {
    segments.push({ type: 'text', content: text.slice(cursor) });
  }

  return (
    <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--fg-main)]">
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return <span key={`segment-${index}`}>{segment.content}</span>;
        }

        const suggestion = segment.suggestion;
        const isActive = suggestion.id === activeSuggestionId;
        const styleClass = CATEGORY_STYLE[suggestion.type] || 'border-cyan-500/60 bg-cyan-500/15 text-cyan-100';

        return (
          <button
            key={`segment-${index}`}
            type="button"
            onClick={() => onSelectSuggestion(suggestion.id)}
            className={`mx-0.5 rounded border px-1 text-left transition hover:brightness-110 ${styleClass} ${
              isActive ? 'ring-2 ring-white/70' : ''
            }`}
            title={suggestion.title}
          >
            {segment.content}
          </button>
        );
      })}
    </p>
  );
};

function App() {
  const [darkMode, setDarkMode] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [text, setText] = useState(SAMPLE_TEXT);
  const [styleSample, setStyleSample] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [currentMetrics, setCurrentMetrics] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [originalText, setOriginalText] = useState('');
  const [activeSuggestionId, setActiveSuggestionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshingRisk, setRefreshingRisk] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const wordCount = useMemo(() => countWords(text), [text]);
  const styleWordCount = useMemo(() => countWords(styleSample), [styleSample]);

  const acceptedCount = useMemo(
    () => suggestions.filter((suggestion) => suggestion.status === 'accepted').length,
    [suggestions]
  );

  const pendingCount = useMemo(
    () => suggestions.filter((suggestion) => suggestion.status === 'pending').length,
    [suggestions]
  );

  const diffParts = useMemo(() => {
    if (!originalText) return [];
    return diffWordsWithSpace(originalText, text);
  }, [originalText, text]);

  const analyzeText = async (inputText, shouldResetSuggestions) => {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: inputText, styleSample })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Analysis failed.');
    }

    const data = await response.json();

    if (shouldResetSuggestions) {
      const nextSuggestions = (data.suggestions || []).map((suggestion) => ({ ...suggestion, status: 'pending' }));
      setSuggestions(nextSuggestions);
      setActiveSuggestionId(nextSuggestions[0]?.id || null);
      setAnalysis(data);
      setCurrentMetrics(data.metrics);
    } else {
      setCurrentMetrics(data.metrics);
    }

    return data;
  };

  const handleAnalyze = async () => {
    setError('');
    if (!text.trim()) {
      setError('Paste your draft first.');
      return;
    }

    const currentWordCount = countWords(text);
    if (currentWordCount > WORD_LIMIT) {
      setError(`Please keep input under ${WORD_LIMIT.toLocaleString()} words.`);
      return;
    }

    setLoading(true);
    try {
      await analyzeText(text, true);
      setOriginalText(text);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshRisk = async (nextText) => {
    setRefreshingRisk(true);
    try {
      await analyzeText(nextText, false);
    } catch {
      // keep current values if lightweight refresh fails
    } finally {
      setRefreshingRisk(false);
    }
  };

  const applySuggestion = async (id) => {
    const suggestion = suggestions.find((item) => item.id === id);
    if (!suggestion || suggestion.status !== 'pending') return;

    let start = suggestion.start;
    let end = suggestion.end;
    let originalSlice = text.slice(start, end);

    if (originalSlice !== suggestion.original) {
      const exact = text.indexOf(suggestion.original);
      if (exact >= 0) {
        start = exact;
        end = exact + suggestion.original.length;
        originalSlice = suggestion.original;
      } else {
        const compact = suggestion.original.trim();
        const fallback = compact ? text.indexOf(compact) : -1;
        if (fallback < 0) {
          setError('This suggestion no longer lines up with the current text. Run Analyze again.');
          return;
        }

        start = fallback;
        end = fallback + compact.length;
        originalSlice = compact;
      }
    }

    const nextText = `${text.slice(0, start)}${suggestion.replacement}${text.slice(end)}`;
    const delta = suggestion.replacement.length - originalSlice.length;

    const nextSuggestions = suggestions.map((item) => {
      if (item.id === id) {
        return { ...item, status: 'accepted', start, end: start + suggestion.replacement.length };
      }

      if (item.start >= end) {
        return { ...item, start: item.start + delta, end: item.end + delta };
      }

      return item;
    });

    setText(nextText);
    setSuggestions(nextSuggestions);
    await refreshRisk(nextText);
  };

  const rejectSuggestion = (id) => {
    const next = suggestions.map((suggestion) => (suggestion.id === id ? { ...suggestion, status: 'rejected' } : suggestion));
    setSuggestions(next);
    if (activeSuggestionId === id) {
      const replacement = next.find((item) => item.status === 'pending');
      setActiveSuggestionId(replacement?.id || null);
    }
  };

  const baselineRisk = analysis?.metrics?.overallRisk ?? null;
  const currentRisk = currentMetrics?.overallRisk ?? null;
  const riskDelta = baselineRisk !== null && currentRisk !== null ? currentRisk - baselineRisk : null;

  return (
    <div className="min-h-screen px-4 py-8 text-[var(--fg-main)] md:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl border border-[var(--line)] bg-[var(--bg-surface)]/95 p-6 shadow-[0_18px_45px_rgba(8,15,15,0.14)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Human Voice Risk Editor</h1>
              <p className="mt-2 max-w-3xl text-sm text-[var(--fg-soft)] md:text-base">
                Tune your own writing to reduce false AI-detection flags using stylistic, meaning-preserving edits.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDarkMode((value) => !value)}
              className="rounded-full border border-[var(--line)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--fg-main)] transition hover:border-accent"
            >
              {darkMode ? 'Light Mode' : 'Dark Mode'}
            </button>
          </div>
          <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-200/20 p-3 text-sm text-amber-100 dark:text-amber-200">
            This tool is only for editing your own original writing to prevent false flags. It is not for disguising AI-generated text.
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--bg-surface)] p-4 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Draft Input</h2>
              <div className="text-sm text-[var(--fg-soft)]">
                {wordCount.toLocaleString()} / {WORD_LIMIT.toLocaleString()} words
              </div>
            </div>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Paste your essay, article, or report here..."
              className="h-[340px] w-full resize-y rounded-xl border border-[var(--line)] bg-transparent p-4 text-sm leading-6 text-[var(--fg-main)] outline-none ring-accent/40 transition focus:ring"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleAnalyze}
                disabled={loading}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? 'Analyzing...' : 'Analyze'}
              </button>
              {refreshingRisk && <span className="text-sm text-[var(--fg-soft)]">Refreshing risk score...</span>}
              {error && <span className="text-sm text-rose-400">{error}</span>}
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-[var(--line)] bg-[var(--bg-surface)] p-4">
            <h2 className="text-lg font-semibold">Style Profile (Optional)</h2>
            <p className="text-sm text-[var(--fg-soft)]">
              Paste a sample of your natural writing voice so suggestions align with your usual rhythm.
            </p>
            <textarea
              value={styleSample}
              onChange={(event) => setStyleSample(event.target.value)}
              placeholder="Add 1-3 short samples from your own writing style..."
              className="h-56 w-full resize-y rounded-xl border border-[var(--line)] bg-transparent p-3 text-sm leading-6 outline-none ring-accent/40 transition focus:ring"
            />
            <p className="text-xs text-[var(--fg-soft)]">{styleWordCount.toLocaleString()} words in profile sample</p>
          </div>
        </section>

        {analysis && (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {METRICS.map((metric) => {
                const value = currentMetrics?.[metric.key] ?? analysis.metrics[metric.key];
                return (
                  <article key={metric.key} className="rounded-xl border border-[var(--line)] bg-[var(--bg-surface)] p-4">
                    <div className="text-xs uppercase tracking-wide text-[var(--fg-soft)]">{metric.label}</div>
                    <div className={`mt-2 text-2xl font-semibold ${getRiskTone(value)}`}>{value}</div>
                    <div className="progress-track mt-3 h-2 w-full overflow-hidden rounded-full">
                      <div className={`h-full ${barColor(value)}`} style={{ width: `${clamp(value)}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-[var(--fg-soft)]">{metric.hint}</p>
                  </article>
                );
              })}
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <article className="rounded-2xl border border-[var(--line)] bg-[var(--bg-surface)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">Inline Suggestion Preview</h3>
                  <span className="text-xs text-[var(--fg-soft)]">Tap a highlight to inspect</span>
                </div>
                <div className="mt-4 rounded-xl border border-[var(--line)] bg-black/10 p-3">
                  <HighlightedPreview
                    text={text}
                    suggestions={suggestions}
                    activeSuggestionId={activeSuggestionId}
                    onSelectSuggestion={setActiveSuggestionId}
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-4 text-sm">
                  <span className="text-emerald-300">Accepted: {acceptedCount}</span>
                  <span className="text-amber-300">Pending: {pendingCount}</span>
                </div>
              </article>

              <article className="rounded-2xl border border-[var(--line)] bg-[var(--bg-surface)] p-4">
                <h3 className="text-lg font-semibold">Before vs After Risk</h3>
                <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
                  <div className="rounded-lg border border-[var(--line)] bg-black/10 p-3">
                    <p className="text-xs text-[var(--fg-soft)]">Original</p>
                    <p className="mt-1 text-xl font-semibold text-amber-300">{baselineRisk ?? '--'}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--line)] bg-black/10 p-3">
                    <p className="text-xs text-[var(--fg-soft)]">Current</p>
                    <p className={`mt-1 text-xl font-semibold ${getRiskTone(currentRisk ?? 50)}`}>{currentRisk ?? '--'}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--line)] bg-black/10 p-3">
                    <p className="text-xs text-[var(--fg-soft)]">Delta</p>
                    <p className={`mt-1 text-xl font-semibold ${riskDelta <= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {riskDelta === null ? '--' : `${riskDelta > 0 ? '+' : ''}${riskDelta}`}
                    </p>
                  </div>
                </div>
                {analysis.insights?.note && (
                  <p className="mt-3 rounded-lg border border-[var(--line)] bg-black/10 p-3 text-sm text-[var(--fg-soft)]">{analysis.insights.note}</p>
                )}
              </article>
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
              <article className="rounded-2xl border border-[var(--line)] bg-[var(--bg-surface)] p-4">
                <h3 className="text-lg font-semibold">Smart Suggestions</h3>
                <div className="mt-4 space-y-3">
                  {!suggestions.length && <p className="text-sm text-[var(--fg-soft)]">No suggestions available for this draft.</p>}
                  {suggestions.map((suggestion) => {
                    const isActive = activeSuggestionId === suggestion.id;
                    return (
                      <div
                        key={suggestion.id}
                        className={`rounded-xl border p-3 transition ${
                          isActive ? 'border-accent bg-accent/10' : 'border-[var(--line)] bg-black/10'
                        } ${suggestion.status === 'rejected' ? 'opacity-60' : ''}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{suggestion.title}</p>
                            <p className="text-xs text-[var(--fg-soft)]">{suggestion.description}</p>
                          </div>
                          <span className="rounded-full border border-[var(--line)] px-2 py-1 text-xs text-[var(--fg-soft)]">
                            {suggestion.type.replaceAll('-', ' ')}
                          </span>
                        </div>
                        <div className="mt-3 rounded-lg border border-[var(--line)] bg-black/20 p-2 text-xs text-[var(--fg-soft)]">
                          <p className="max-h-10 overflow-hidden">{suggestion.original}</p>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => applySuggestion(suggestion.id)}
                            disabled={suggestion.status !== 'pending'}
                            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {suggestion.status === 'accepted' ? 'Accepted' : 'Accept'}
                          </button>
                          <button
                            type="button"
                            onClick={() => rejectSuggestion(suggestion.id)}
                            disabled={suggestion.status !== 'pending'}
                            className="rounded-md border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--fg-main)] transition hover:border-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {suggestion.status === 'rejected' ? 'Rejected' : 'Reject'}
                          </button>
                          {suggestion.riskImpact ? (
                            <span className="rounded-md border border-emerald-400/40 bg-emerald-400/10 px-2 py-1 text-xs text-emerald-300">
                              Est. impact: -{suggestion.riskImpact}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>

              <article className="rounded-2xl border border-[var(--line)] bg-[var(--bg-surface)] p-4">
                <h3 className="text-lg font-semibold">Side-by-Side Diff</h3>
                {!originalText ? (
                  <p className="mt-3 text-sm text-[var(--fg-soft)]">Run analysis to capture an original baseline for diff.</p>
                ) : (
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-[var(--line)] bg-black/10 p-3">
                      <h4 className="text-xs uppercase tracking-wide text-[var(--fg-soft)]">Original</h4>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{renderDiffPanel(diffParts, 'original')}</p>
                    </div>
                    <div className="rounded-xl border border-[var(--line)] bg-black/10 p-3">
                      <h4 className="text-xs uppercase tracking-wide text-[var(--fg-soft)]">Edited</h4>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{renderDiffPanel(diffParts, 'edited')}</p>
                    </div>
                  </div>
                )}
              </article>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export default App;
