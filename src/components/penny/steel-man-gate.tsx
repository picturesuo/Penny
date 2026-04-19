'use client'

import { useEffect, useState } from 'react'
import type { Claim, SteelMan } from '@/types/mvp-core'
import { Button } from '@/components/ui/button'

export type SteelManScoreResult = {
  overallScore: number
  overallFeedback: string
  isStrawman: boolean
  reviseSuggestion: string | null
}

export type SteelManGateSavedSteelMan = {
  id: string
  claimId: string
  mapId: string
  userId: string
  steelManText: string
  qualityScore: number | null
  qualityScoreReason: string | null
  usedInRound: string[]
  writtenAt: Date | string
  updatedAt: Date | string | null
  updateHistory: Array<{
    versionText: string
    savedAt: Date | string
    roundContext: string | null
  }>
}

interface SteelManGateProps {
  claim: Pick<Claim, 'id' | 'mapId' | 'text' | 'confidence'>
  existingSteelMan: (Pick<SteelMan, 'steelManText' | 'qualityScore'> & { qualityScoreReason?: string | null }) | null
  onComplete: (steelManText: string, score: SteelManScoreResult | null) => void
  onSavedSteelMan?: (steelMan: SteelManGateSavedSteelMan) => void
  onSkip?: () => void
  isFirstRound: boolean
  initialText?: string
  onTextChange?: (text: string) => void
}

function mapAssessmentToScoreResult(assessment: {
  qualityScore: number
  qualityScoreReason: string
  revisionPrompt: string | null
}): SteelManScoreResult {
  return {
    overallScore: assessment.qualityScore,
    overallFeedback: assessment.qualityScoreReason,
    isStrawman: assessment.qualityScore < 5,
    reviseSuggestion: assessment.revisionPrompt,
  }
}

function getScoreLevel(score: number): 'low' | 'medium' | 'high' {
  if (score < 5) return 'low'
  if (score < 8) return 'medium'
  return 'high'
}

export function SteelManGate({
  claim,
  existingSteelMan,
  onComplete,
  onSavedSteelMan,
  onSkip,
  isFirstRound,
  initialText,
  onTextChange,
}: SteelManGateProps) {
  const [text, setText] = useState(existingSteelMan?.steelManText || initialText || '')
  const [score, setScore] = useState<SteelManScoreResult | null>(
    existingSteelMan?.qualityScore != null
      ? {
          overallScore: existingSteelMan.qualityScore,
          overallFeedback: existingSteelMan.qualityScoreReason ?? 'This steel man is already on file.',
          isStrawman: existingSteelMan.qualityScore < 5,
          reviseSuggestion: null,
        }
      : null,
  )
  const [scoring, setScoring] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [savedText, setSavedText] = useState(existingSteelMan?.steelManText ?? null)
  const [savedSteelMan, setSavedSteelMan] = useState<SteelManGateSavedSteelMan | null>(null)

  const minLength = 80
  const trimmedText = text.trim()
  const isLongEnough = trimmedText.length >= minLength
  const charsRemaining = Math.max(0, minLength - trimmedText.length)
  const canReuseSavedResult = savedText === trimmedText && score !== null && savedSteelMan !== null

  useEffect(() => {
    const nextText = existingSteelMan?.steelManText ?? initialText ?? ''
    setText(nextText)
    setSavedText(existingSteelMan?.steelManText ?? null)
    setSavedSteelMan(null)
    if (existingSteelMan?.qualityScore != null) {
      setScore({
        overallScore: existingSteelMan.qualityScore,
        overallFeedback: existingSteelMan.qualityScoreReason ?? 'This steel man is already on file.',
        isStrawman: existingSteelMan.qualityScore < 5,
        reviseSuggestion: null,
      })
    } else {
      setScore(null)
    }
  }, [claim.id, existingSteelMan?.qualityScore, existingSteelMan?.qualityScoreReason, existingSteelMan?.steelManText, initialText])

  async function persistSteelMan() {
    if (!isLongEnough || scoring || submitting) {
      return null
    }

    if (savedText === trimmedText && savedSteelMan && score) {
      return { score, steelMan: savedSteelMan }
    }

    setScoring(true)

    try {
      const response = await fetch(`/api/maps/${claim.mapId}/steel-man`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimId: claim.id,
          steelManText: trimmedText,
          roundContext: isFirstRound ? 'Steel-man gate before the first critique round.' : 'Steel-man gate before a follow-up critique round.',
          usedInRound: [isFirstRound ? 'Round 1 gate' : 'Follow-up gate'],
        }),
      })

      if (!response.ok) {
        return null
      }

      const payload = (await response.json()) as {
        steelMan: SteelManGateSavedSteelMan
        assessment: { qualityScore: number; qualityScoreReason: string; revisionPrompt: string | null }
      }

      const nextScore = mapAssessmentToScoreResult(payload.assessment)
      setScore(nextScore)
      setSavedText(trimmedText)
      setSavedSteelMan(payload.steelMan)
      return { score: nextScore, steelMan: payload.steelMan }
    } catch {
      return null
    } finally {
      setScoring(false)
    }
  }

  async function handleScore() {
    const result = await persistSteelMan()
    if (!result) {
      setScore(null)
    }
  }

  async function handleSubmit() {
    if (!isLongEnough || submitting) {
      return
    }

    setSubmitting(true)
    try {
      const result = canReuseSavedResult ? { score, steelMan: savedSteelMan } : await persistSteelMan()
      if (!result || !result.steelMan) {
        return
      }

      onSavedSteelMan?.(result.steelMan)
      onComplete(trimmedText, result.score)
    } finally {
      setSubmitting(false)
    }
  }

  function updateText(nextText: string) {
    setText(nextText)
    onTextChange?.(nextText)
    if (savedText !== nextText.trim()) {
      setSavedText(null)
      setSavedSteelMan(null)
      setScore(null)
    }
  }

  return (
    <div className="steel-man-gate rounded-[24px] border border-black/8 bg-white p-5">
      <div className="steel-man-header">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Steel-man gate</p>
        <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">
          {isFirstRound ? 'Before the first critique, write the strongest opposing view.' : 'Before Penny critiques this again, refresh the strongest opposing view.'}
        </h3>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
          A good steel man makes the critique useful. It should be the best case against your claim, not a weak objection.
        </p>
      </div>

      <div className="steel-man-claim-context mt-4 rounded-[20px] bg-[var(--panel)] p-4">
        <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Your claim</span>
        <blockquote className="mt-2 text-sm leading-6 text-[var(--ink)]">&quot;{claim.text}&quot;</blockquote>
        <span className="mt-2 block text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{claim.confidence}% confident</span>
      </div>

      <div className="steel-man-input-section mt-4">
        <label htmlFor={`steel-man-text-${claim.id}`} className="text-sm font-medium text-[var(--ink)]">
          The strongest case against this claim:
        </label>
        <textarea
          id={`steel-man-text-${claim.id}`}
          value={text}
          onChange={(event) => updateText(event.target.value)}
          placeholder="A well-informed skeptic would say..."
          rows={5}
          className="mt-2 w-full rounded-[20px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
        />
        <div className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
          {isLongEnough ? '✓ Long enough to proceed' : `${charsRemaining} more characters needed to proceed`}
        </div>
      </div>

      {score ? (
        <div className={`mt-4 rounded-[20px] border px-4 py-4 ${getScoreLevel(score.overallScore) === 'high' ? 'border-[#d9ead8] bg-[#f5fbf4]' : getScoreLevel(score.overallScore) === 'medium' ? 'border-[#efe3cc] bg-[#fff9f0]' : 'border-[#f0c0b7] bg-[#fff4f1]'}`}>
          <div className="h-2 w-full overflow-hidden rounded-full bg-black/5">
            <div className="h-full rounded-full bg-[var(--ink)]" style={{ width: `${Math.min(100, score.overallScore * 10)}%` }} />
          </div>
          <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{score.overallFeedback}</p>
          {score.isStrawman ? (
            <p className="mt-2 text-sm leading-6 text-[#8b3d2f]">
              This may be attacking a weaker version of the claim. Try to steel-man the strongest possible version.
            </p>
          ) : null}
          {score.reviseSuggestion ? (
            <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{score.reviseSuggestion}</p>
          ) : null}
        </div>
      ) : null}

      <div className="steel-man-actions mt-4 flex flex-wrap items-center gap-3">
        {onSkip ? (
          <button type="button" onClick={onSkip} className="rounded-full border border-black/10 px-4 py-2 text-sm text-[var(--ink)]">
            Skip this time
          </button>
        ) : null}

        {isLongEnough ? (
          <Button type="button" variant="secondary" onClick={handleScore} disabled={scoring || submitting}>
            {scoring ? 'Assessing...' : score ? 'Reassess quality' : 'Check quality'}
          </Button>
        ) : null}

        <Button type="button" onClick={handleSubmit} disabled={!isLongEnough || submitting} className="gap-2">
          {submitting ? 'Saving...' : 'Continue to challenge →'}
        </Button>
      </div>
    </div>
  )
}
