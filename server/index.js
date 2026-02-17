const express = require('express');
const cors = require('cors');
const path = require('path');
const nlp = require('compromise');

const app = express();
const PORT = process.env.PORT || 8787;

const publicPath = path.join(__dirname, 'public');

if (process.env.NODE_ENV !== 'production') {
  app.use(cors());
}
app.use(express.json({ limit: '2mb' }));

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(publicPath));
}

const COMMON_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'then', 'that', 'this', 'it', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'as', 'about', 'into',
  'through', 'after', 'before', 'between', 'because', 'while', 'over', 'under', 'during', 'within', 'without',
  'i', 'you', 'we', 'they', 'he', 'she', 'my', 'your', 'our', 'their', 'its', 'there', 'here', 'can', 'could',
  'would', 'should', 'may', 'might', 'do', 'does', 'did', 'have', 'has', 'had', 'more', 'most', 'very', 'really'
]);

const PREDICTABLE_PHRASES = [
  { phrase: 'in conclusion', replacement: 'to wrap up' },
  { phrase: 'it is important to note that', replacement: 'worth noting:' },
  { phrase: 'the purpose of this', replacement: 'this is meant to' },
  { phrase: 'there are several', replacement: 'a few' },
  { phrase: 'this demonstrates that', replacement: 'this shows' },
  { phrase: 'in addition', replacement: 'plus' },
  { phrase: 'furthermore', replacement: 'also' },
  { phrase: 'moreover', replacement: 'on top of that' },
  { phrase: 'overall', replacement: 'all in all' },
  { phrase: 'it should be noted that', replacement: 'note that' }
];

const HEDGE_REGEX = /\b(may|might|could|perhaps|possibly|generally|typically|often|somewhat|largely|arguably|relatively)\b/gi;

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const average = (arr) => {
  if (!arr.length) return 0;
  return arr.reduce((sum, value) => sum + value, 0) / arr.length;
};

const stdDev = (arr) => {
  if (arr.length <= 1) return 0;
  const mean = average(arr);
  const variance = arr.reduce((sum, value) => sum + (value - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
};

const capitalizeFirst = (text) => {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const lowerFirst = (text) => {
  if (!text) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
};

const tokenizeWords = (text) => {
  const terms = nlp(text).terms().out('array');
  return terms
    .map((term) => term.toLowerCase().replace(/[^a-z']/g, ''))
    .filter(Boolean);
};

const splitSentences = (text) => {
  const sentences = [];
  const regex = /[^.!?\n]+[.!?]?/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const raw = match[0];
    if (!raw.trim()) continue;
    const start = match.index;
    const end = match.index + raw.length;
    const normalized = raw.trim();
    const words = tokenizeWords(normalized);
    const openerWords = words.slice(0, 2);

    sentences.push({
      index: sentences.length,
      raw,
      text: normalized,
      start,
      end,
      wordCount: words.length,
      opener: openerWords.join(' '),
      firstWord: words[0] || ''
    });
  }

  return sentences;
};

const computeStyleProfile = (text) => {
  if (!text || !text.trim()) return null;
  const sentences = splitSentences(text);
  const sentenceLengths = sentences.map((sentence) => sentence.wordCount).filter(Boolean);
  const commaCount = (text.match(/,/g) || []).length;
  const questionCount = (text.match(/\?/g) || []).length;

  return {
    avgSentenceLength: average(sentenceLengths),
    sentenceVariance: stdDev(sentenceLengths),
    commaRate: sentenceLengths.length ? commaCount / sentenceLengths.length : 0,
    questionRate: sentenceLengths.length ? questionCount / sentenceLengths.length : 0
  };
};

const getRiskColor = (score) => {
  if (score < 35) return 'low';
  if (score < 65) return 'moderate';
  return 'high';
};

const analyzeText = (text, styleSample = '') => {
  const trimmed = text.trim();
  const sentences = splitSentences(trimmed);
  const words = tokenizeWords(trimmed);
  const styleProfile = computeStyleProfile(styleSample);

  if (!trimmed || words.length < 20 || sentences.length < 2) {
    return {
      metrics: {
        perplexity: 50,
        burstiness: 50,
        sentencePatternDiversity: 50,
        vocabularyPredictability: 50,
        overallRisk: 50
      },
      riskBands: {
        perplexity: 'moderate',
        burstiness: 'moderate',
        sentencePatternDiversity: 'moderate',
        vocabularyPredictability: 'moderate',
        overallRisk: 'moderate'
      },
      insights: {
        wordCount: words.length,
        sentenceCount: sentences.length,
        note: 'Add more text for a stronger signal. Roughly 120+ words gives better stability.'
      },
      suggestions: [],
      styleProfile
    };
  }

  const frequencies = new Map();
  words.forEach((word) => {
    frequencies.set(word, (frequencies.get(word) || 0) + 1);
  });

  const totalWords = words.length;
  const uniqueWords = frequencies.size;
  const probabilities = [...frequencies.values()].map((count) => count / totalWords);

  const entropy = probabilities.reduce((sum, p) => sum + (p > 0 ? -p * Math.log2(p) : 0), 0);
  const maxEntropy = uniqueWords > 1 ? Math.log2(uniqueWords) : 1;
  const entropyRatio = entropy / maxEntropy;
  const maxFrequency = Math.max(...frequencies.values());
  const repetitionRatio = maxFrequency / totalWords;
  const perplexityRisk = clamp((1 - entropyRatio) * 85 + repetitionRatio * 45);

  const sentenceLengths = sentences.map((sentence) => sentence.wordCount).filter(Boolean);
  const sentenceLengthMean = average(sentenceLengths);
  const sentenceLengthStd = stdDev(sentenceLengths);
  const sentenceLengthCV = sentenceLengthMean ? sentenceLengthStd / sentenceLengthMean : 0;
  let burstinessRisk = clamp(92 - sentenceLengthCV * 125);

  if (styleProfile && styleProfile.sentenceVariance > 0) {
    const varianceGap = Math.max(0, styleProfile.sentenceVariance - sentenceLengthStd);
    burstinessRisk = clamp(burstinessRisk + varianceGap * 3.5);
  }

  const openers = sentences.map((sentence) => sentence.opener || sentence.firstWord).filter(Boolean);
  const openerCounts = new Map();
  openers.forEach((opener) => {
    openerCounts.set(opener, (openerCounts.get(opener) || 0) + 1);
  });

  const openerValues = [...openerCounts.values()];
  const dominantOpenerRatio = Math.max(...openerValues) / openers.length;
  const openerDiversityRatio = openerCounts.size / openers.length;
  const sentencePatternRisk = clamp((1 - openerDiversityRatio) * 70 + dominantOpenerRatio * 55);

  const commonWordCount = words.filter((word) => COMMON_WORDS.has(word)).length;
  const commonRatio = commonWordCount / totalWords;
  const hapaxRatio = [...frequencies.values()].filter((count) => count === 1).length / uniqueWords;
  let vocabularyPredictabilityRisk = clamp(commonRatio * 120 + (1 - hapaxRatio) * 30);

  const hedgeMatches = trimmed.match(HEDGE_REGEX) || [];
  const hedgeDensity = hedgeMatches.length / Math.max(1, sentences.length);
  vocabularyPredictabilityRisk = clamp(vocabularyPredictabilityRisk + hedgeDensity * 12);

  const overallRisk = clamp(
    perplexityRisk * 0.28 +
      burstinessRisk * 0.24 +
      sentencePatternRisk * 0.22 +
      vocabularyPredictabilityRisk * 0.26
  );

  const suggestions = buildSuggestions({
    text: trimmed,
    sentences,
    sentenceLengthMean,
    sentenceLengthStd,
    hedgeDensity,
    styleProfile
  });

  return {
    metrics: {
      perplexity: Math.round(perplexityRisk),
      burstiness: Math.round(burstinessRisk),
      sentencePatternDiversity: Math.round(sentencePatternRisk),
      vocabularyPredictability: Math.round(vocabularyPredictabilityRisk),
      overallRisk: Math.round(overallRisk)
    },
    riskBands: {
      perplexity: getRiskColor(perplexityRisk),
      burstiness: getRiskColor(burstinessRisk),
      sentencePatternDiversity: getRiskColor(sentencePatternRisk),
      vocabularyPredictability: getRiskColor(vocabularyPredictabilityRisk),
      overallRisk: getRiskColor(overallRisk)
    },
    insights: {
      wordCount: totalWords,
      sentenceCount: sentences.length,
      avgSentenceLength: Number(sentenceLengthMean.toFixed(1)),
      sentenceLengthStd: Number(sentenceLengthStd.toFixed(1)),
      dominantOpenerRatio: Number(dominantOpenerRatio.toFixed(2)),
      hedgeDensity: Number(hedgeDensity.toFixed(2))
    },
    suggestions,
    styleProfile
  };
};

const buildSuggestions = ({ text, sentences, sentenceLengthMean, sentenceLengthStd, hedgeDensity, styleProfile }) => {
  const suggestions = [];
  const pushSuggestion = (suggestion) => {
    if (!suggestion || suggestion.start < 0 || suggestion.end <= suggestion.start) return;
    suggestions.push({
      ...suggestion,
      id: `s-${suggestions.length + 1}`,
      status: 'pending'
    });
  };

  // 1) Vary sentence length: detect runs with similar lengths.
  for (let i = 0; i < sentences.length - 2; i += 1) {
    const window = sentences.slice(i, i + 3);
    const lengths = window.map((sentence) => sentence.wordCount);
    const localStd = stdDev(lengths);

    if (localStd <= 2.2) {
      const target = window[1];
      if (target.wordCount > 20 && target.text.includes(',')) {
        const splitIndex = target.text.indexOf(',');
        const left = target.text.slice(0, splitIndex).trim();
        const right = target.text.slice(splitIndex + 1).trim();
        if (left && right) {
          pushSuggestion({
            type: 'vary-sentence-length',
            title: 'Vary sentence length in this run',
            description: 'These nearby sentences have very similar length. Splitting this one adds natural rhythm.',
            start: target.start,
            end: target.end,
            original: target.raw,
            replacement: `${left}. ${capitalizeFirst(right)}`,
            riskImpact: 8
          });
        }
      }
    }
  }

  // 2) Swap predictable phrasing.
  PREDICTABLE_PHRASES.forEach(({ phrase, replacement }) => {
    const regex = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      const original = match[0];
      const next = /^[A-Z]/.test(original) ? capitalizeFirst(replacement) : replacement;
      pushSuggestion({
        type: 'swap-predictable-phrasing',
        title: 'Use less templated phrasing',
        description: 'This phrase is common in generated text. A small wording swap can feel more personal.',
        start: match.index,
        end: match.index + original.length,
        original,
        replacement: next,
        riskImpact: 6
      });
      if (suggestions.length >= 40) return;
    }
  });

  // 3) Add stylistic texture.
  const hasTexture = /[()?;:]/.test(text);
  if (!hasTexture || (styleProfile && styleProfile.commaRate > 0.4)) {
    const textureTarget = sentences.find((sentence) => sentence.wordCount >= 14 && !sentence.text.includes('('));
    if (textureTarget) {
      const words = textureTarget.text.split(/\s+/);
      const insertAt = Math.min(6, words.length - 1);
      words.splice(insertAt, 0, '(for context),');
      pushSuggestion({
        type: 'add-stylistic-texture',
        title: 'Add a small human-style aside',
        description: 'A brief parenthetical can make polished writing feel more naturally human.',
        start: textureTarget.start,
        end: textureTarget.end,
        original: textureTarget.raw,
        replacement: words.join(' '),
        riskImpact: 5
      });
    }
  }

  // 4) Diversify sentence openers.
  const openerCounts = new Map();
  sentences.forEach((sentence) => {
    const key = sentence.firstWord;
    if (!key) return;
    openerCounts.set(key, (openerCounts.get(key) || 0) + 1);
  });

  const repetitiveOpeners = [...openerCounts.entries()].filter(([, count]) => count >= 3).map(([word]) => word);
  repetitiveOpeners.forEach((word) => {
    const repeatedSentences = sentences.filter((sentence) => sentence.firstWord === word).slice(1, 3);
    repeatedSentences.forEach((sentence) => {
      let replacement = sentence.text;
      if (/^this\b/i.test(sentence.text)) {
        replacement = `In this case, ${lowerFirst(sentence.text)}`;
      } else if (/^the\b/i.test(sentence.text)) {
        replacement = `From another angle, ${lowerFirst(sentence.text)}`;
      } else if (/^it\b/i.test(sentence.text)) {
        replacement = `At a practical level, ${lowerFirst(sentence.text)}`;
      } else {
        replacement = `As written here, ${lowerFirst(sentence.text)}`;
      }

      pushSuggestion({
        type: 'diversify-openers',
        title: 'Diversify repetitive sentence starts',
        description: `Several sentences start with "${word}". Varying one opener reduces structural repetition.`,
        start: sentence.start,
        end: sentence.end,
        original: sentence.raw,
        replacement,
        riskImpact: 7
      });
    });
  });

  // 5) Reduce hedging uniformity.
  if (hedgeDensity >= 0.5) {
    sentences.forEach((sentence) => {
      const match = sentence.text.match(HEDGE_REGEX);
      if (!match) return;

      const replacement = sentence.text.replace(HEDGE_REGEX, (hedge, offset) => {
        if (offset === sentence.text.toLowerCase().indexOf(hedge.toLowerCase())) {
          return '';
        }
        return hedge;
      }).replace(/\s{2,}/g, ' ').trim();

      if (replacement && replacement !== sentence.text) {
        pushSuggestion({
          type: 'reduce-hedging-uniformity',
          title: 'Reduce repetitive hedging',
          description: 'Hedging is useful, but too much in every sentence can look algorithmic.',
          start: sentence.start,
          end: sentence.end,
          original: sentence.raw,
          replacement,
          riskImpact: 6
        });
      }
    });
  }

  // Additional sentence-length guidance aligned with style profile.
  if (styleProfile && sentenceLengthStd < styleProfile.sentenceVariance * 0.75) {
    const longSentence = sentences.find((sentence) => sentence.wordCount > sentenceLengthMean + 7);
    if (longSentence && longSentence.text.includes(',')) {
      const splitIndex = longSentence.text.indexOf(',');
      const left = longSentence.text.slice(0, splitIndex).trim();
      const right = longSentence.text.slice(splitIndex + 1).trim();
      pushSuggestion({
        type: 'vary-sentence-length',
        title: 'Match your usual rhythm',
        description: 'Compared to your style sample, this section is rhythmically uniform. Split one sentence to restore your voice.',
        start: longSentence.start,
        end: longSentence.end,
        original: longSentence.raw,
        replacement: `${left}. ${capitalizeFirst(right)}`,
        riskImpact: 8
      });
    }
  }

  return suggestions.slice(0, 20);
};

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'Analyzer API is running' });
});

app.post('/api/analyze', (req, res) => {
  const { text = '', styleSample = '' } = req.body || {};

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text is required for analysis.' });
  }

  if (text.length > 120000) {
    return res.status(400).json({ error: 'Text is too large. Please keep it under ~20k words.' });
  }

  const analysis = analyzeText(text, styleSample);
  return res.json(analysis);
});

if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(publicPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Analyzer API listening on http://localhost:${PORT}`);
});
