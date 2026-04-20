'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Claim } from '@/types/mvp-core'
import type { DialecticResponsePath } from '@/types/thought-map'
import { Button } from '@/components/ui/button'
import { ConfidenceSlider } from './confidence-slider'

export type ChallengeRoundContextDraft = {
  confidenceAtRoundEnd: number
  concessionNote: string
  connectedClaimsChanged: boolean | null
  connectedClaimsNote: string
  newEvidenceNote: string
}

export type ChallengeRoundModel = {
  round: string
  roundIndex: number
  title: string
  strength: string
  prompt: string
  why: string
  argument: {
    premise: string
    assumption: string
    pressure: string
    precedent: string
    shape: string
    conclusion: string
  }
  steelMan: string
  responsePath: string
  critiqueFailureTypes: string[]
  responseClassification: {
    type: string
    classifiedBy: 'user_explicit' | 'inferred'
  } | null
  priorRoundSummary: string
  followUpPrompt: string | null
  confidenceContext: string
  confidenceAtRoundStart: number
  confidenceAtRoundEnd: number
  confidenceDelta: number
  engagementScore: number | null
  concessions: unknown[]
  defenses: unknown[]
  dismissals: unknown[]
  dialecticRound: {
    id: string
    userResponse: string
    responseClassification: {
      type: string
      classifiedBy: 'user_explicit' | 'inferred'
    } | null
    confidenceAtRoundStart: number
    confidenceAtRoundEnd: number
    confidenceDelta: number
    engagementScore: number
    followUpPrompt: string | null
    concessions: unknown[]
    defenses: unknown[]
    dismissals: unknown[]
    critiqueMode?: string | null
    voiceLabel?: string | null
    uncertainty?: unknown | null
    closedAt?: Date | string | null
  } | null
  roundContextDraft: ChallengeRoundContextDraft
}

export type BestNextMoveKey = 'revise_claim' | 'gather_evidence' | 'challenge_dependency' | 'run_another_round' | 'mark_for_revisit'

export type BestNextMoveActionResult = {
  message?: string
}

type BestNextMove = {
  primary: {
    key: BestNextMoveKey
    label: string
    description: string
  }
  alternates: Array<{
    key: BestNextMoveKey
    label: string
  }>
  signalLabel: string | null
}

interface ChallengeRoundProps {
  claim: Pick<Claim, 'id' | 'text' | 'confidence'>
  round: ChallengeRoundModel
  priorRounds: ChallengeRoundModel[]
  responseDraft: string
  onResponseDraftChange: (response: string) => void
  onRoundContextChange: (patch: Partial<ChallengeRoundContextDraft>) => void
  onResponseSubmit: (response: string, newConfidence: number, responsePath: DialecticResponsePath) => Promise<void>
  onRequestNewRound?: () => void
  onBestNextMoveAction?: (action: Exclude<BestNextMoveKey, 'run_another_round'>) => Promise<BestNextMoveActionResult | void> | BestNextMoveActionResult | void
  isSteelManReady: boolean
}

export function ChallengeRound({
  claim,
  round,
  priorRounds,
  responseDraft,
  onResponseDraftChange,
  onRoundContextChange,
  onResponseSubmit,
  onRequestNewRound,
  onBestNextMoveAction,
  isSteelManReady,
}: ChallengeRoundProps) {
  const [showWhyNow, setShowWhyNow] = useState(false)
  const [showPriorRounds, setShowPriorRounds] = useState(false)
  const [selectedResponsePath, setSelectedResponsePath] = useState<DialecticResponsePath>('defend')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(Boolean(round.dialecticRound?.userResponse))
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [actingMove, setActingMove] = useState<BestNextMoveKey | null>(null)
  const [nextMoveError, setNextMoveError] = useState<string | null>(null)
  const [nextMoveFeedback, setNextMoveFeedback] = useState<string | null>(null)

  const trimmedResponse = responseDraft.trim()
  const isRoundOpen = !round.dialecticRound?.closedAt
  const completedRound = round.dialecticRound

  useEffect(() => {
    setSubmitted(Boolean(round.dialecticRound?.userResponse))
    setSelectedResponsePath('defend')
    setShowWhyNow(false)
    setShowPriorRounds(false)
    setSubmitError(null)
    setActingMove(null)
    setNextMoveError(null)
    setNextMoveFeedback(null)
  }, [round.round, round.dialecticRound?.id, round.dialecticRound?.userResponse])

  const priorRoundLabel = useMemo(() => {
    if (!priorRounds.length) {
      return 'No prior rounds yet.'
    }

    return priorRounds
      .slice(-3)
      .map((candidate) => {
        const classification = candidate.dialecticRound?.responseClassification?.type ?? candidate.responseClassification?.type ?? 'response'
        const confidenceLabel =
          candidate.dialecticRound?.confidenceDelta != null
            ? ` (${candidate.dialecticRound.confidenceDelta >= 0 ? '+' : ''}${candidate.dialecticRound.confidenceDelta}%)`
            : candidate.confidenceDelta != null
              ? ` (${candidate.confidenceDelta >= 0 ? '+' : ''}${candidate.confidenceDelta}%)`
              : ''

        return `${candidate.round}: ${classification}${confidenceLabel}`
      })
      .join(' · ')
  }, [priorRounds])

  async function handleSubmitResponse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (submitting || !isSteelManReady) {
      return
    }

    if (!trimmedResponse || trimmedResponse.length < 10) {
      setSubmitError('Response must be at least 10 non-space characters.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    try {
      await onResponseSubmit(trimmedResponse, round.roundContextDraft.confidenceAtRoundEnd, selectedResponsePath)
      setSubmitted(true)
      setSubmitError(null)
    } catch (error) {
      console.error(error)
      setSubmitError(error instanceof Error ? error.message : "Couldn't save this round. Try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const hasCompletedResponse = submitted || Boolean(completedRound?.userResponse)
  const confidenceChange = round.roundContextDraft.confidenceAtRoundEnd - round.confidenceAtRoundStart
  const bestNextMove = hasCompletedResponse ? deriveBestNextMove(round) : null
  const canHandleNextMove = (key: BestNextMoveKey) => (key === 'run_another_round' ? Boolean(onRequestNewRound) : Boolean(onBestNextMoveAction))
  const statusLabel = hasCompletedResponse
    ? completedRound?.closedAt
      ? `Saved ${formatSavedAt(completedRound.closedAt)}`
      : 'Saved'
    : submitting
      ? 'Saving round...'
      : submitError
        ? 'Save failed'
        : trimmedResponse.length > 0
          ? 'Draft'
          : 'Awaiting response'
  const statusTone = hasCompletedResponse
    ? 'bg-[#d9ead8] text-[#355b32]'
    : submitting
      ? 'bg-[#e7defa] text-[#5c4c88]'
      : submitError
        ? 'bg-[#fff1ef] text-[#8b3d2f]'
        : trimmedResponse.length > 0
          ? 'bg-[#fff8df] text-[#5a460d]'
          : 'bg-white text-[var(--ink)]'

  return (
    <div className="rounded-[24px] border border-black/8 bg-[var(--panel)] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[var(--ink)]">{round.round}</span>
        <span className="rounded-full bg-[#e7defa] px-3 py-1 text-xs font-medium text-[#5c4c88]">{round.strength}</span>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[var(--ink)]">{round.confidenceContext}</span>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusTone}`}>{statusLabel}</span>
        {round.responseClassification ? (
          <span className="rounded-full bg-[#d9ead8] px-3 py-1 text-xs font-medium text-[#355b32]">
            {formatClassification(round.responseClassification.type)}
          </span>
        ) : null}
        {round.engagementScore != null ? (
          <span className="rounded-full bg-[#fff6ed] px-3 py-1 text-xs font-medium text-[#8b4d1f]">
            engagement {Math.round(round.engagementScore)}
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-sm font-medium text-[var(--ink)]">{round.title}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{round.prompt}</p>

      <div className="mt-3 rounded-[18px] bg-white p-4">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Claim in view</p>
        <blockquote className="mt-2 text-sm leading-6 text-[var(--ink)]">&quot;{claim.text}&quot;</blockquote>
        <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{formatPercentValue(claim.confidence)} confident</p>
      </div>

      <div className="mt-3 rounded-[18px] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Prior rounds</p>
          {priorRounds.length > 0 ? (
            <button className="text-xs font-medium text-[var(--ink)]" type="button" onClick={() => setShowPriorRounds((current) => !current)}>
              {showPriorRounds ? '− Hide' : `+ ${priorRounds.length} prior round${priorRounds.length > 1 ? 's' : ''}`}
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{priorRoundLabel}</p>
        {showPriorRounds && priorRounds.length > 0 ? (
          <div className="mt-3 space-y-2">
            {priorRounds.slice(-3).map((priorRound) => (
              <PriorRoundSummary key={priorRound.round} round={priorRound} />
            ))}
          </div>
        ) : null}
        {round.followUpPrompt ? (
          <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">
            <span className="font-medium text-[var(--ink)]">Follow-up preview:</span> {round.followUpPrompt}
          </p>
        ) : null}
      </div>

      <div className="mt-3 rounded-[18px] bg-white p-4">
        <button
          type="button"
          className="text-sm font-medium text-[var(--ink)]"
          onClick={() => setShowWhyNow((current) => !current)}
        >
          {showWhyNow ? '− Why this challenge' : '+ Why this challenge'}
        </button>
        {showWhyNow ? (
          <div className="mt-3 space-y-3">
          <p className="text-sm leading-6 text-[var(--muted-ink)]">{round.why}</p>
          <div className="rounded-[16px] bg-[var(--panel)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Argument as explanation</p>
            <div className="mt-3 space-y-2">
              <p className="text-sm leading-6 text-[var(--ink)]">
                <span className="font-medium">Premise:</span> {round.argument.premise}
              </p>
              <p className="text-sm leading-6 text-[var(--ink)]">
                <span className="font-medium">Assumption:</span> {round.argument.assumption}
              </p>
              <p className="text-sm leading-6 text-[var(--ink)]">
                <span className="font-medium">Pressure:</span> {round.argument.pressure}
              </p>
              <p className="text-sm leading-6 text-[var(--ink)]">
                <span className="font-medium">Precedent:</span> {round.argument.precedent}
              </p>
              <p className="text-sm leading-6 text-[var(--ink)]">
                <span className="font-medium">Shape:</span> {round.argument.shape}
              </p>
              <p className="text-sm leading-6 text-[var(--ink)]">
                <span className="font-medium">Conclusion:</span> {round.argument.conclusion}
              </p>
              <p className="text-sm leading-6 text-[var(--ink)]">
                <span className="font-medium">Steel man:</span> {round.steelMan}
              </p>
            </div>
          </div>
          {round.responseClassification ? (
            <div className="rounded-[16px] bg-[#f7f2ff] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[#5c4c88]">Structured reading</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
                Penny read this response as <span className="font-medium">{formatClassification(round.responseClassification.type)}</span>
                {round.responseClassification.classifiedBy === 'user_explicit' ? ' from your explicit path choice.' : ' by inference from the text.'}
              </p>
              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
                Confidence at start {formatPercentValue(round.confidenceAtRoundStart)} · end {formatPercentValue(round.confidenceAtRoundEnd)}
                · delta {round.confidenceDelta >= 0 ? '+' : ''}
                {formatPercentValue(round.confidenceDelta)}
              </p>
              {round.concessions.length || round.defenses.length || round.dismissals.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {round.concessions.length ? <BadgeChip label={`${round.concessions.length} concessions`} /> : null}
                  {round.defenses.length ? <BadgeChip label={`${round.defenses.length} defenses`} /> : null}
                  {round.dismissals.length ? <BadgeChip label={`${round.dismissals.length} dismissals`} /> : null}
                </div>
              ) : null}
            </div>
          ) : null}
          </div>
        ) : null}
      </div>

      {hasCompletedResponse ? (
        <div className="mt-4 rounded-[20px] border border-black/8 bg-white p-4">
          <div className="rounded-[18px] bg-[var(--panel)] p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Your response</p>
            <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{completedRound?.userResponse ?? trimmedResponse}</p>
          </div>

          <div className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
            <span>
              Confidence: {formatPercentValue(round.confidenceAtRoundStart)} → {formatPercentValue(round.confidenceAtRoundEnd)}
            </span>
            {confidenceChange !== 0 ? (
              <span className={confidenceChange < 0 ? 'ml-2 text-[#8b3d2f]' : 'ml-2 text-[#2f6d47]'}>
                ({confidenceChange > 0 ? '+' : ''}
                {formatPercentValue(confidenceChange)})
              </span>
            ) : null}
          </div>

          {bestNextMove ? (
            <div className="mt-4 rounded-[18px] bg-[#eef4ff] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[#45607a]">Best next move</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[var(--ink)]">{bestNextMove.primary.label}</span>
                {bestNextMove.signalLabel ? (
                  <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{bestNextMove.signalLabel}</span>
                ) : null}
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{bestNextMove.primary.description}</p>
              {round.followUpPrompt ? (
                <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">{round.followUpPrompt}</p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {canHandleNextMove(bestNextMove.primary.key) ? (
                  <Button
                    type="button"
                    className="gap-2"
                    disabled={actingMove != null}
                    onClick={() => void handleBestNextMoveClick(bestNextMove.primary.key)}
                  >
                    {actingMove === bestNextMove.primary.key ? 'Working...' : bestNextMove.primary.label}
                  </Button>
                ) : null}
                {bestNextMove.alternates
                  .filter((candidate) => canHandleNextMove(candidate.key))
                  .map((candidate) => (
                    <Button
                      key={candidate.key}
                      type="button"
                      variant="secondary"
                      className="gap-2"
                      disabled={actingMove != null}
                      onClick={() => void handleBestNextMoveClick(candidate.key)}
                    >
                      {actingMove === candidate.key ? 'Working...' : candidate.label}
                    </Button>
                  ))}
              </div>
              {nextMoveFeedback ? (
                <p className="mt-3 text-sm leading-6 text-[#2f6d47]">{nextMoveFeedback}</p>
              ) : null}
              {nextMoveError ? (
                <p className="mt-3 rounded-[16px] border border-[#d8b2aa] bg-[#fff1ef] px-3 py-2 text-sm leading-6 text-[#8b3d2f]">
                  {nextMoveError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : isRoundOpen ? (
        <form onSubmit={handleSubmitResponse} className="mt-4 space-y-4">
          <div className="rounded-[18px] border border-black/8 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <label htmlFor={`round-response-${round.round}`} className="text-sm font-medium text-[var(--ink)]">
                  Your response
                </label>
                <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">
                  Defend, revise, or absorb. Minimum 10 non-space characters.
                </p>
              </div>
              {!isSteelManReady ? (
                <span className="rounded-full bg-[#fff8df] px-3 py-1 text-xs font-medium text-[#5a460d]">Steel man required</span>
              ) : null}
            </div>
            <textarea
              id={`round-response-${round.round}`}
              className="mt-3 min-h-[88px] w-full rounded-[18px] border border-black/10 bg-[var(--panel)] px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
              placeholder="Capture the response that should persist with this round."
              value={responseDraft}
              onChange={(event) => onResponseDraftChange(event.target.value)}
              minLength={10}
              maxLength={3000}
            />
            {submitError ? (
              <p className="mt-3 rounded-[16px] border border-[#d8b2aa] bg-[#fff1ef] px-3 py-2 text-sm leading-6 text-[#8b3d2f]">
                {submitError}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {(['defend', 'revise', 'absorb'] as const).map((path) => (
                <Button
                  key={`${round.round}-${path}`}
                  type="button"
                  variant={selectedResponsePath === path ? 'primary' : 'secondary'}
                  className="px-3 py-2 text-xs"
                  onClick={() => setSelectedResponsePath(path)}
                >
                  {path}
                </Button>
              ))}
            </div>
          </div>

          <div className="rounded-[18px] border border-black/8 bg-white p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Concession capture</p>
            <label className="mt-3 block text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Did you update your confidence?</label>
            <div className="mt-2">
              <ConfidenceSlider
                value={Math.max(5, Math.min(95, round.roundContextDraft.confidenceAtRoundEnd))}
                onChange={(value) => onRoundContextChange({ confidenceAtRoundEnd: value })}
                showAnchors={false}
              />
            </div>
            <label className="mt-3 block text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">What specifically did you concede?</label>
            <textarea
              className="mt-2 min-h-[64px] w-full rounded-[16px] border border-black/10 bg-[var(--panel)] px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
              placeholder="Optional: name the exact point you conceded."
              value={round.roundContextDraft.concessionNote}
              onChange={(event) => onRoundContextChange({ concessionNote: event.target.value })}
            />
            <label className="mt-3 block text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Did this critique change connected claims?</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {([
                ['yes', 'Yes'],
                ['no', 'No'],
                ['unsure', 'Unsure'],
              ] as const).map(([value, label]) => (
                <Button
                  key={`${round.round}-connected-${value}`}
                  type="button"
                  variant={round.roundContextDraft.connectedClaimsChanged === (value === 'yes' ? true : value === 'no' ? false : null) ? 'primary' : 'secondary'}
                  className="px-3 py-2 text-xs"
                  onClick={() =>
                    onRoundContextChange({
                      connectedClaimsChanged: value === 'yes' ? true : value === 'no' ? false : null,
                    })
                  }
                >
                  {label}
                </Button>
              ))}
            </div>
            <textarea
              className="mt-3 min-h-[56px] w-full rounded-[16px] border border-black/10 bg-[var(--panel)] px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
              placeholder="Optional: name the claims affected."
              value={round.roundContextDraft.connectedClaimsNote}
              onChange={(event) => onRoundContextChange({ connectedClaimsNote: event.target.value })}
            />
            <label className="mt-3 block text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">New evidence added?</label>
            <textarea
              className="mt-2 min-h-[56px] w-full rounded-[16px] border border-black/10 bg-[var(--panel)] px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none transition focus:border-[var(--ink)]"
              placeholder="Optional: paste the new evidence or source you added."
              value={round.roundContextDraft.newEvidenceNote}
              onChange={(event) => onRoundContextChange({ newEvidenceNote: event.target.value })}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
              Path: {selectedResponsePath}
            </p>
            <Button type="submit" disabled={submitting || !isSteelManReady || trimmedResponse.length < 10} className="gap-2">
              {submitting ? 'Saving round...' : 'Submit response'}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )

  async function handleBestNextMoveClick(key: BestNextMoveKey) {
    if (actingMove != null) {
      return
    }

    setNextMoveError(null)
    setNextMoveFeedback(null)

    if (key === 'run_another_round') {
      if (!onRequestNewRound) {
        setNextMoveError("Couldn't open the next round yet.")
        return
      }

      onRequestNewRound()
      setNextMoveFeedback(`Round ${round.roundIndex + 2} is ready.`)
      return
    }

    if (!onBestNextMoveAction) {
      setNextMoveError("Couldn't open that next step yet.")
      return
    }

    setActingMove(key)

    try {
      const result = await onBestNextMoveAction(key)
      setNextMoveFeedback(result?.message ?? `${bestNextMoveCopy(key).label} opened.`)
    } catch (error) {
      console.error(error)
      setNextMoveError(error instanceof Error ? error.message : "Couldn't open that next step. Try again.")
    } finally {
      setActingMove(null)
    }
  }
}

function PriorRoundSummary({ round }: { round: ChallengeRoundModel }) {
  const classification = round.dialecticRound?.responseClassification?.type ?? round.responseClassification?.type ?? 'response'
  const confidenceDelta =
    round.dialecticRound?.confidenceDelta ?? round.confidenceDelta ?? null

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[18px] bg-[var(--panel)] px-4 py-3 text-sm">
      <span className="font-medium text-[var(--ink)]">{round.round}</span>
      <span className="text-[var(--muted-ink)]">{formatClassification(classification)}</span>
      {confidenceDelta != null && confidenceDelta !== 0 ? (
        <span className={confidenceDelta < 0 ? 'text-[#8b3d2f]' : 'text-[#2f6d47]'}>
          {confidenceDelta > 0 ? '+' : ''}
          {formatPercentValue(confidenceDelta)}
        </span>
      ) : null}
      <span className="text-[var(--muted-ink)]">· {round.prompt}</span>
    </div>
  )
}

function BadgeChip({ label }: { label: string }) {
  return <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[var(--ink)]">{label}</span>
}

function formatClassification(type: string): string {
  return type.replaceAll('_', ' ')
}

function formatPercentValue(value: number): string {
  return `${Math.round(value)}%`
}

function formatSavedAt(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'just now'
  }

  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function deriveBestNextMove(round: ChallengeRoundModel): BestNextMove {
  const classification = round.dialecticRound?.responseClassification?.type ?? round.responseClassification?.type ?? null
  const confidenceDelta = round.dialecticRound?.confidenceDelta ?? round.confidenceDelta ?? 0
  const followUpPrompt = round.dialecticRound?.followUpPrompt ?? round.followUpPrompt ?? null
  const normalizedFailureTypes = round.critiqueFailureTypes.map((value) => value.trim().toLowerCase())
  const stagnantThread =
    typeof followUpPrompt === 'string' &&
    /(no confidence change|stagnation|lack of confidence change|new evidence)/i.test(followUpPrompt)

  const scoreByMove = new Map<BestNextMoveKey, number>([
    ['revise_claim', 0],
    ['gather_evidence', 0],
    ['challenge_dependency', 0],
    ['run_another_round', 0],
    ['mark_for_revisit', 0],
  ])

  if (classification === 'concession') {
    scoreByMove.set('revise_claim', 5)
  } else if (classification === 'partial_concession') {
    scoreByMove.set('revise_claim', 4)
    scoreByMove.set('run_another_round', 1)
  } else if (classification === 'evidence_addition') {
    scoreByMove.set('gather_evidence', 4)
  } else if (classification === 'defense') {
    scoreByMove.set('run_another_round', 2)
  } else if (classification === 'reframe') {
    scoreByMove.set('revise_claim', 3)
  } else if (classification === 'dismissal') {
    scoreByMove.set('run_another_round', 2)
    scoreByMove.set('mark_for_revisit', 2)
  }

  if (confidenceDelta <= -10) {
    scoreByMove.set('revise_claim', (scoreByMove.get('revise_claim') ?? 0) + 4)
  } else if (confidenceDelta < 0) {
    scoreByMove.set('revise_claim', (scoreByMove.get('revise_claim') ?? 0) + 2)
  } else if (confidenceDelta === 0) {
    scoreByMove.set('run_another_round', (scoreByMove.get('run_another_round') ?? 0) + 2)
  }

  if (normalizedFailureTypes.some((value) => value === 'weak-evidence' || value === 'unaddressed-precedent' || value === 'definition-failure')) {
    scoreByMove.set('gather_evidence', (scoreByMove.get('gather_evidence') ?? 0) + 3)
  }

  if (normalizedFailureTypes.some((value) => value === 'dependency-risk' || value === 'shaky-assumption')) {
    scoreByMove.set('challenge_dependency', (scoreByMove.get('challenge_dependency') ?? 0) + 4)
  }

  if (normalizedFailureTypes.some((value) => value === 'missing-counterargument' || value === 'premise-rejection' || value === 'analogy-break')) {
    scoreByMove.set('revise_claim', (scoreByMove.get('revise_claim') ?? 0) + 2)
  }

  if (stagnantThread) {
    if (round.roundIndex >= 2) {
      scoreByMove.set('mark_for_revisit', (scoreByMove.get('mark_for_revisit') ?? 0) + 5)
    } else {
      scoreByMove.set('run_another_round', (scoreByMove.get('run_another_round') ?? 0) + 3)
    }
  }

  const rankedMoves = [...scoreByMove.entries()]
    .filter(([, score]) => score > 0)
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1]
      }

      return moveSortOrder(left[0]) - moveSortOrder(right[0])
    })

  const [primaryKey] = rankedMoves[0] ?? [['run_another_round', 1] as const]
  const primary = bestNextMoveCopy(primaryKey)
  const alternates = rankedMoves
    .slice(1, 3)
    .map(([key]) => {
      const candidate = bestNextMoveCopy(key)

      return {
        key,
        label: candidate.label,
      }
    })

  const leadFailureType = normalizedFailureTypes[0] ?? null
  const signalLabel =
    classification || leadFailureType || confidenceDelta !== 0
      ? [
          classification ? formatClassification(classification) : null,
          leadFailureType ? formatClassification(leadFailureType) : null,
          confidenceDelta !== 0 ? `${confidenceDelta > 0 ? '+' : ''}${formatPercentValue(confidenceDelta)} confidence` : null,
        ]
          .filter((value): value is string => Boolean(value))
          .join(' · ')
      : null

  return {
    primary,
    alternates,
    signalLabel,
  }
}

function bestNextMoveCopy(key: BestNextMoveKey): BestNextMove['primary'] {
  switch (key) {
    case 'revise_claim':
      return {
        key,
        label: 'Revise claim',
        description: 'Your saved response changed the shape of the claim enough that the next useful move is to rewrite it in a form you can still defend cleanly.',
      }
    case 'gather_evidence':
      return {
        key,
        label: 'Gather evidence',
        description: 'This round still points at evidence or precedent gaps, so add one concrete source, example, or test before you escalate the claim again.',
      }
    case 'challenge_dependency':
      return {
        key,
        label: 'Challenge a dependency',
        description: 'The pressure is landing on an assumption beneath the claim. Attack that dependency directly instead of replaying the headline argument.',
      }
    case 'mark_for_revisit':
      return {
        key,
        label: 'Mark for revisit',
        description: 'The round is saved, but this thread looks temporarily exhausted. Leave it visible for revisit when you have new evidence or a sharper objection.',
      }
    case 'run_another_round':
    default:
      return {
        key: 'run_another_round',
        label: 'Run another round',
        description: 'The saved result still leaves a live pressure point, so the best next move is one more challenge while the claim and response are still in context.',
      }
  }
}

function moveSortOrder(key: BestNextMoveKey): number {
  switch (key) {
    case 'revise_claim':
      return 0
    case 'gather_evidence':
      return 1
    case 'challenge_dependency':
      return 2
    case 'run_another_round':
      return 3
    case 'mark_for_revisit':
      return 4
  }
}
