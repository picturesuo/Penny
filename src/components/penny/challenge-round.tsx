'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Claim } from '@/types/mvp-core'
import type { DialecticResponsePath } from '@/types/thought-map'
import { Button } from '@/components/ui/button'
import { ConfidenceSlider } from './confidence-slider'
import { bestNextMoveCopy, deriveBestNextMove, type BestNextMoveKey, type BestNextMoveRecommendation } from '@/lib/challenge-next-move'

const SURFACE_EYEBROW_CLASS = 'text-[11px] uppercase tracking-[0.22em] text-[var(--muted-ink)]'
const QUIET_PANEL_CLASS = 'rounded-[22px] border border-black/8 bg-white p-4 shadow-[0_10px_24px_rgba(34,39,46,0.04)]'
const INSET_PANEL_CLASS = 'rounded-[18px] bg-[var(--panel)] px-4 py-3'
const ERROR_NOTICE_CLASS = 'mt-3 rounded-[18px] border border-[#f0c0b7] bg-[#fff4f1] px-4 py-3 text-sm leading-6 text-[#8b3d2f]'
const SUCCESS_NOTICE_CLASS = 'mt-3 rounded-[18px] border border-[#b9d3c0] bg-[#eff8f1] px-4 py-3 text-sm leading-6 text-[#2f6d47]'

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

export type ChallengeGenerationViewModel = {
  status: 'idle' | 'generating' | 'generated' | 'fallback' | 'failed'
  providerLabel: string | null
  fallbackReason: string | null
  error: string | null
  attemptNumber: number
}

export type BestNextMoveActionResult = {
  message?: string
}
export type { BestNextMoveKey } from '@/lib/challenge-next-move'

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
  generation?: ChallengeGenerationViewModel | null
  onRetryGeneration?: (() => void | Promise<void>) | undefined
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
  generation = null,
  onRetryGeneration,
  isSteelManReady,
}: ChallengeRoundProps) {
  const [showWhyNow, setShowWhyNow] = useState(false)
  const [showPriorRounds, setShowPriorRounds] = useState(false)
  const [showRoundContext, setShowRoundContext] = useState(false)
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
  const generationStatus = generation?.status ?? 'idle'
  const generationBlocksResponse = !completedRound?.userResponse && (generationStatus === 'generating' || generationStatus === 'failed')
  const generationNotice =
    generationStatus === 'generated'
      ? `${generation?.providerLabel ?? 'Challenge generator'} ready.`
      : generationStatus === 'fallback'
        ? `Live generation is unavailable, so Penny is using ${generation?.providerLabel ?? 'a fallback challenge'} for now.`
        : null
  const generationLabel =
    generationStatus === 'generating'
      ? 'Generating critique'
      : generationStatus === 'generated'
        ? 'Generated critique'
        : generationStatus === 'fallback'
          ? 'Fallback prompt'
          : generationStatus === 'failed'
            ? 'Generation failed'
            : null
  const generationTone =
    generationStatus === 'generating'
      ? 'bg-[#e7defa] text-[#5c4c88]'
      : generationStatus === 'generated'
        ? 'bg-[#eef4ff] text-[#45607a]'
        : generationStatus === 'fallback'
          ? 'bg-[#fff8df] text-[#7a5a13]'
          : generationStatus === 'failed'
            ? 'bg-[#fff1ef] text-[#8b3d2f]'
            : ''

  useEffect(() => {
    setSubmitted(Boolean(round.dialecticRound?.userResponse))
    setSelectedResponsePath('defend')
    setShowWhyNow(false)
    setShowPriorRounds(false)
    setShowRoundContext(false)
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
  const confidenceAtRoundEnd = completedRound?.confidenceAtRoundEnd ?? round.roundContextDraft.confidenceAtRoundEnd
  const confidenceChange =
    completedRound?.confidenceDelta ?? confidenceAtRoundEnd - round.confidenceAtRoundStart
  const bestNextMove = hasCompletedResponse ? deriveBestNextMoveForRound(round) : null
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
    <div className={`penny-reveal rounded-[24px] border border-black/8 bg-[linear-gradient(180deg,rgba(250,244,236,0.98)_0%,rgba(242,230,215,0.96)_100%)] p-5 shadow-[0_14px_34px_rgba(34,39,46,0.05)] ${hasCompletedResponse ? 'penny-saved-flash' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[var(--ink)] shadow-[0_8px_18px_rgba(34,39,46,0.04)]">{round.round}</span>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusTone}`}>{statusLabel}</span>
            {generationLabel ? <span className={`rounded-full px-3 py-1 text-xs font-medium ${generationTone}`}>{generationLabel}</span> : null}
          </div>
          <p className="font-display mt-3 text-[1.5rem] font-semibold leading-[1.06] text-[var(--ink)]">{round.title}</p>
          <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
            {generationStatus === 'generating'
              ? 'Penny is assembling the next critique for this claim.'
              : generationStatus === 'failed'
                ? 'Challenge generation did not complete, so the next move is to retry.'
                : round.prompt}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[var(--muted-ink)]">
            <span>{round.strength}</span>
            <span>{round.confidenceContext}</span>
            {round.responseClassification ? <span>{formatClassification(round.responseClassification.type)}</span> : null}
            {round.engagementScore != null ? <span>engagement {Math.round(round.engagementScore)}</span> : null}
          </div>
        </div>
        <div className={`min-w-[180px] ${QUIET_PANEL_CLASS}`}>
          <p className={SURFACE_EYEBROW_CLASS}>Claim in view</p>
          <blockquote className="mt-2 text-sm leading-6 text-[var(--ink)]">&quot;{claim.text}&quot;</blockquote>
          <p className="mt-2 text-xs text-[var(--muted-ink)]">{formatPercentValue(claim.confidence)} confident</p>
        </div>
      </div>

      {!hasCompletedResponse && generationStatus === 'generating' ? (
        <div className={`mt-4 ${QUIET_PANEL_CLASS}`}>
          <p className={SURFACE_EYEBROW_CLASS}>Generating critique</p>
          <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
            Penny is turning the claim, steel man, and prior round history into the next challenge.
          </p>
          <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
            The response box will open as soon as the critique is ready.
          </p>
        </div>
      ) : null}

      {!hasCompletedResponse && generationStatus === 'failed' ? (
        <div className={`mt-4 ${QUIET_PANEL_CLASS}`}>
          <p className={SURFACE_EYEBROW_CLASS}>Challenge generation failed</p>
          <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
            {generation?.error ?? "Couldn't generate this critique. Try again."}
          </p>
          {onRetryGeneration ? (
            <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" className="penny-press gap-2" onClick={() => void onRetryGeneration()}>
                Retry generation
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {generationNotice && !hasCompletedResponse && generationStatus !== 'failed' ? (
        <div className={`mt-4 ${generationStatus === 'fallback' ? ERROR_NOTICE_CLASS : SUCCESS_NOTICE_CLASS}`}>
          {generationNotice}
          {generationStatus === 'fallback' && generation?.fallbackReason ? ` ${generation.fallbackReason}` : ''}
        </div>
      ) : null}

      {(priorRounds.length > 0 || round.followUpPrompt) && !generationBlocksResponse ? (
        <div className={`mt-3 ${QUIET_PANEL_CLASS}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className={SURFACE_EYEBROW_CLASS}>Earlier rounds</p>
              <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">{priorRoundLabel}</p>
            </div>
            {priorRounds.length > 0 ? (
              <button className="text-xs font-medium text-[var(--ink)]" type="button" onClick={() => setShowPriorRounds((current) => !current)}>
                {showPriorRounds ? 'Hide detail' : `Show ${priorRounds.length}`}
              </button>
            ) : null}
          </div>
          {showPriorRounds && priorRounds.length > 0 ? (
            <div className="mt-3 space-y-2">
              {priorRounds.slice(-3).map((priorRound) => (
                <PriorRoundSummary key={priorRound.round} round={priorRound} />
              ))}
            </div>
          ) : null}
          {showPriorRounds && round.followUpPrompt ? (
            <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
              <span className="font-medium text-[var(--ink)]">Follow-up preview:</span> {round.followUpPrompt}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3">
        <button
          type="button"
          className="text-xs font-medium uppercase tracking-[0.18em] text-[var(--muted-ink)]"
          onClick={() => setShowWhyNow((current) => !current)}
          disabled={generationBlocksResponse}
        >
          {showWhyNow ? 'Hide why this challenge' : 'Why this challenge'}
        </button>
        {showWhyNow && !generationBlocksResponse ? (
          <div className={`mt-3 ${QUIET_PANEL_CLASS}`}>
            <p className="text-sm leading-6 text-[var(--muted-ink)]">{round.why}</p>
            <div className={`mt-3 ${INSET_PANEL_CLASS}`}>
              <p className={SURFACE_EYEBROW_CLASS}>Argument as explanation</p>
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
              <div className="mt-3 rounded-[18px] border border-[#d9d0ee] bg-[#f7f2ff] p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-[#5c4c88]">Structured reading</p>
                <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
                  Penny read this response as <span className="font-medium">{formatClassification(round.responseClassification.type)}</span>
                  {round.responseClassification.classifiedBy === 'user_explicit' ? ' from your explicit path choice.' : ' by inference from the text.'}
                </p>
                <p className={`mt-2 ${SURFACE_EYEBROW_CLASS}`}>
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
        <div className={`mt-4 ${QUIET_PANEL_CLASS}`}>
          <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${INSET_PANEL_CLASS} text-sm leading-6 text-[var(--muted-ink)]`}>
            <span>
              Confidence: {formatPercentValue(round.confidenceAtRoundStart)} → {formatPercentValue(confidenceAtRoundEnd)}
            </span>
            {confidenceChange !== 0 ? (
              <span className={confidenceChange < 0 ? 'text-[#8b3d2f]' : 'text-[#2f6d47]'}>
                ({confidenceChange > 0 ? '+' : ''}
                {formatPercentValue(confidenceChange)})
              </span>
            ) : null}
            {completedRound?.responseClassification ? (
              <span>{formatClassification(completedRound.responseClassification.type)}</span>
            ) : null}
          </div>

          {bestNextMove ? (
            <div className="penny-reveal mt-4 rounded-[22px] border border-[#d0c2af] bg-[linear-gradient(180deg,#f7efe2_0%,#efe2cf_100%)] p-5 shadow-[0_12px_28px_rgba(69,96,122,0.08)]">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#45607a]">Best next move</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--ink)]">{bestNextMove.primary.label}</span>
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
                      className="penny-press gap-2"
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
                      className="penny-press gap-2"
                      disabled={actingMove != null}
                      onClick={() => void handleBestNextMoveClick(candidate.key)}
                    >
                      {actingMove === candidate.key ? 'Working...' : candidate.label}
                    </Button>
                  ))}
              </div>
              {nextMoveFeedback ? (
                <p className={SUCCESS_NOTICE_CLASS}>{nextMoveFeedback}</p>
              ) : null}
              {nextMoveError ? (
                <p className={ERROR_NOTICE_CLASS}>
                  {nextMoveError}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className={`mt-4 ${INSET_PANEL_CLASS}`}>
            <p className={SURFACE_EYEBROW_CLASS}>Saved response</p>
            <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{completedRound?.userResponse ?? trimmedResponse}</p>
          </div>
        </div>
      ) : isRoundOpen && !generationBlocksResponse ? (
        <form onSubmit={handleSubmitResponse} className="mt-4 space-y-4">
          <div className={QUIET_PANEL_CLASS}>
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
                  className="penny-soft-switch mt-3 min-h-[88px] w-full rounded-[18px] border border-black/10 bg-[var(--paper)] px-4 py-3 text-sm leading-6 text-[var(--ink)] outline-none focus:border-[var(--ink)]"
              placeholder="Capture the response that should persist with this round."
              value={responseDraft}
              onChange={(event) => onResponseDraftChange(event.target.value)}
              minLength={10}
              maxLength={3000}
            />
            {submitError ? (
              <p className={ERROR_NOTICE_CLASS}>
                {submitError}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {(['defend', 'revise', 'absorb'] as const).map((path) => (
                <Button
                  key={`${round.round}-${path}`}
                  type="button"
                  variant={selectedResponsePath === path ? 'primary' : 'secondary'}
                  className="penny-press px-3 py-2 text-xs"
                  onClick={() => setSelectedResponsePath(path)}
                >
                  {path}
                </Button>
              ))}
            </div>
          </div>

          <div className={QUIET_PANEL_CLASS}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className={SURFACE_EYEBROW_CLASS}>Round context</p>
                <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">
                  Keep the response primary. Add confidence and evidence notes only if they matter.
                </p>
              </div>
              <button className="text-xs font-medium text-[var(--ink)]" type="button" onClick={() => setShowRoundContext((current) => !current)}>
                {showRoundContext ? 'Hide detail' : 'Add detail'}
              </button>
            </div>
            {showRoundContext ? (
              <div className="mt-4">
                <label className="block text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Did you update your confidence?</label>
                <div className="mt-2">
                  <ConfidenceSlider
                    value={Math.max(5, Math.min(95, round.roundContextDraft.confidenceAtRoundEnd))}
                    onChange={(value) => onRoundContextChange({ confidenceAtRoundEnd: value })}
                    showAnchors={false}
                  />
                </div>
                <label className="mt-3 block text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">What specifically did you concede?</label>
                <textarea
                  className="penny-soft-switch mt-2 min-h-[64px] w-full rounded-[16px] border border-black/10 bg-[var(--paper)] px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none focus:border-[var(--ink)]"
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
                      className="penny-press px-3 py-2 text-xs"
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
                  className="penny-soft-switch mt-3 min-h-[56px] w-full rounded-[16px] border border-black/10 bg-[var(--paper)] px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none focus:border-[var(--ink)]"
                  placeholder="Optional: name the claims affected."
                  value={round.roundContextDraft.connectedClaimsNote}
                  onChange={(event) => onRoundContextChange({ connectedClaimsNote: event.target.value })}
                />
                <label className="mt-3 block text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">New evidence added?</label>
                <textarea
                  className="penny-soft-switch mt-2 min-h-[56px] w-full rounded-[16px] border border-black/10 bg-[var(--paper)] px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none focus:border-[var(--ink)]"
                  placeholder="Optional: paste the new evidence or source you added."
                  value={round.roundContextDraft.newEvidenceNote}
                  onChange={(event) => onRoundContextChange({ newEvidenceNote: event.target.value })}
                />
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                Confidence now {formatPercentValue(confidenceAtRoundEnd)}.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">
              Path: {selectedResponsePath}
            </p>
            <Button type="submit" disabled={submitting || !isSteelManReady || trimmedResponse.length < 10} className="penny-press gap-2">
              {submitting ? 'Saving round...' : 'Submit response'}
            </Button>
          </div>
        </form>
      ) : null}

      {!hasCompletedResponse && generationStatus === 'fallback' && onRetryGeneration ? (
        <div className="mt-4 flex justify-end">
          <Button type="button" variant="secondary" className="penny-press gap-2" onClick={() => void onRetryGeneration()}>
            Retry generation
          </Button>
        </div>
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
  return <span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--ink)]">{label}</span>
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

function deriveBestNextMoveForRound(round: ChallengeRoundModel): BestNextMoveRecommendation {
  return deriveBestNextMove({
    classification: round.dialecticRound?.responseClassification?.type ?? round.responseClassification?.type ?? null,
    confidenceDelta: round.dialecticRound?.confidenceDelta ?? round.confidenceDelta ?? 0,
    followUpPrompt: round.dialecticRound?.followUpPrompt ?? round.followUpPrompt ?? null,
    critiqueFailureTypes: round.critiqueFailureTypes,
    roundIndex: round.roundIndex,
  })
}
