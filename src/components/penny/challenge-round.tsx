'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Claim } from '@/types/mvp-core'
import type { DialecticResponsePath } from '@/types/thought-map'
import { Button } from '@/components/ui/button'
import { ConfidenceSlider } from './confidence-slider'
import { bestNextMoveCopy, deriveBestNextMove, type BestNextMoveKey, type BestNextMoveRecommendation } from '@/lib/challenge-next-move'

const SURFACE_EYEBROW_CLASS = 'penny-label'
const QUIET_PANEL_CLASS = 'penny-card p-4 shadow-[var(--shadow-card)]'
const INSET_PANEL_CLASS = 'penny-card-inset px-4 py-3'
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

export type ChallengeDependencyCascade = {
  summary: string
  steps: Array<{
    id: string
    title: string
    detail: string
    deltaLabel?: string
  }>
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
  generation?: ChallengeGenerationViewModel | null
  onRetryGeneration?: (() => void | Promise<void>) | undefined
  isSteelManReady: boolean
  dependencyCascade?: ChallengeDependencyCascade | null
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
  dependencyCascade = null,
}: ChallengeRoundProps) {
  const [showWhyNow, setShowWhyNow] = useState(false)
  const [showPriorRounds, setShowPriorRounds] = useState(false)
  const [showRoundContext, setShowRoundContext] = useState(false)
  const [selectedResponsePath, setSelectedResponsePath] = useState<DialecticResponsePath>('defend')
  const [submitting, setSubmitting] = useState(false)
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
    setSubmitting(false)
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
      setSubmitError(null)
    } catch (error) {
      console.error(error)
      setSubmitError(error instanceof Error ? error.message : "Couldn't save this round. Try again.")
      setSubmitting(false)
    }
  }

  const hasCompletedResponse = Boolean(completedRound?.userResponse)
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
  const responsePaths = [
    {
      key: 'defend' as const,
      label: 'Defend',
      description: 'Hold the claim and answer the objection directly.',
    },
    {
      key: 'revise' as const,
      label: 'Revise',
      description: 'Change the claim shape or narrow its scope.',
    },
    {
      key: 'absorb' as const,
      label: 'Absorb',
      description: 'Accept the critique and carry the update forward.',
    },
  ]
  const cascadeSummary = dependencyCascade?.summary ?? round.argument.pressure
  const cascadeSteps =
    dependencyCascade?.steps.length
      ? dependencyCascade.steps
      : [
          {
            id: `${round.round}-pressure`,
            title: 'Primary pressure point',
            detail: round.argument.assumption,
            deltaLabel: `Start ${formatPercentValue(round.confidenceAtRoundStart)}`,
          },
          {
            id: `${round.round}-shape`,
            title: 'Pattern check',
            detail: round.argument.shape,
          },
        ]

  return (
    <div className={`penny-reveal penny-card-soft p-5 ${hasCompletedResponse ? 'penny-saved-flash' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-[var(--ink)] shadow-[var(--shadow-card)]">{round.round}</span>
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

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.16fr)_minmax(0,0.96fr)]">
        <div className="space-y-4">
          <div className={QUIET_PANEL_CLASS}>
            <p className={SURFACE_EYEBROW_CLASS}>Active claim</p>
            <blockquote className="mt-3 text-base leading-7 text-[var(--ink)]">&quot;{claim.text}&quot;</blockquote>
            <div className="mt-4 flex flex-wrap gap-2">
              <BadgeChip label={`${formatPercentValue(claim.confidence)} confidence`} />
              <BadgeChip label={round.strength} />
            </div>
          </div>

          <div className={QUIET_PANEL_CLASS}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={SURFACE_EYEBROW_CLASS}>Counterargument</p>
                <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">The current attack Penny wants answered.</p>
              </div>
              <span className="rounded-full border border-black/8 bg-white px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                {round.round}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{round.prompt}</p>
            <div className={`mt-4 ${INSET_PANEL_CLASS}`}>
              <p className={SURFACE_EYEBROW_CLASS}>Counterweight</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{round.steelMan}</p>
            </div>
          </div>

          {(priorRounds.length > 0 || round.followUpPrompt) && !generationBlocksResponse ? (
            <div className={QUIET_PANEL_CLASS}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className={SURFACE_EYEBROW_CLASS}>Round thread</p>
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
              {round.followUpPrompt ? (
                <div className={`mt-3 ${INSET_PANEL_CLASS}`}>
                  <p className={SURFACE_EYEBROW_CLASS}>Follow-up preview</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{round.followUpPrompt}</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          {!hasCompletedResponse && generationStatus === 'generating' ? (
            <div className={QUIET_PANEL_CLASS}>
              <p className={SURFACE_EYEBROW_CLASS}>Generating critique</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
                Penny is turning the claim, steel man, and prior round history into the next challenge.
              </p>
              <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                The response controls will open as soon as the critique is ready.
              </p>
            </div>
          ) : null}

          {!hasCompletedResponse && generationStatus === 'failed' ? (
            <div className={QUIET_PANEL_CLASS}>
              <p className={SURFACE_EYEBROW_CLASS}>Challenge generation failed</p>
              <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
                {generation?.error ?? "Couldn't generate this critique. Try again."}
              </p>
              {onRetryGeneration ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" className="penny-press gap-2 bg-[var(--challenge)] text-[var(--paper)] hover:bg-[#bf8d37]" onClick={() => void onRetryGeneration()}>
                    Retry generation
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {generationNotice && !hasCompletedResponse && generationStatus !== 'failed' ? (
            <div className={generationStatus === 'fallback' ? ERROR_NOTICE_CLASS : SUCCESS_NOTICE_CLASS}>
              {generationNotice}
              {generationStatus === 'fallback' && generation?.fallbackReason ? ` ${generation.fallbackReason}` : ''}
            </div>
          ) : null}

          {hasCompletedResponse ? (
            <div className={QUIET_PANEL_CLASS}>
              <p className={SURFACE_EYEBROW_CLASS}>Saved response</p>
              <div className={`mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 ${INSET_PANEL_CLASS} text-sm leading-6 text-[var(--muted-ink)]`}>
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
              <p className="mt-4 text-sm leading-6 text-[var(--ink)]">{completedRound?.userResponse ?? trimmedResponse}</p>
            </div>
          ) : isRoundOpen && !generationBlocksResponse ? (
            <form onSubmit={handleSubmitResponse} className="space-y-4">
              <div className={QUIET_PANEL_CLASS}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <label htmlFor={`round-response-${round.round}`} className="text-sm font-medium text-[var(--ink)]">
                      Response controls
                    </label>
                    <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">
                      Choose the path first, then write the response that should persist with this round.
                    </p>
                  </div>
                  {!isSteelManReady ? (
                    <span className="rounded-full bg-[#fff8df] px-3 py-1 text-xs font-medium text-[#5a460d]">Steel man required</span>
                  ) : null}
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {responsePaths.map((path) => {
                    const selected = selectedResponsePath === path.key

                    return (
                      <button
                        key={`${round.round}-${path.key}`}
                        type="button"
                        className={`rounded-[18px] border px-4 py-3 text-left transition ${selected ? 'border-[rgba(214,162,70,0.42)] bg-[rgba(214,162,70,0.16)] shadow-[0_10px_24px_rgba(214,162,70,0.14)]' : 'bg-white hover:bg-[var(--panel)]'}`}
                        style={!selected ? { borderColor: 'var(--line)' } : undefined}
                        onClick={() => setSelectedResponsePath(path.key)}
                      >
                        <p className={`text-xs uppercase tracking-[0.18em] ${selected ? 'text-[#8b6520]' : 'text-[var(--muted-ink)]'}`}>{path.label}</p>
                        <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{path.description}</p>
                      </button>
                    )
                  })}
                </div>
                <textarea
                  id={`round-response-${round.round}`}
                  className="penny-soft-switch mt-4 min-h-[180px] w-full rounded-[20px] border border-black/10 bg-[var(--paper)] px-4 py-4 text-sm leading-6 text-[var(--ink)] outline-none focus:border-[var(--challenge)]"
                  placeholder="Capture the exact response you want saved into the challenge thread."
                  value={responseDraft}
                  onChange={(event) => onResponseDraftChange(event.target.value)}
                  minLength={10}
                  maxLength={3000}
                />
                {submitError ? <p className={ERROR_NOTICE_CLASS}>{submitError}</p> : null}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/8 pt-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Selected path: {selectedResponsePath}</p>
                  <Button
                    type="submit"
                    disabled={submitting || !isSteelManReady || trimmedResponse.length < 10}
                    className="penny-press gap-2 bg-[var(--challenge)] text-[var(--paper)] shadow-[0_14px_30px_rgba(214,162,70,0.24)] hover:bg-[#bf8d37]"
                  >
                    {submitting ? 'Saving round...' : 'Submit response'}
                  </Button>
                </div>
              </div>

              <div className={QUIET_PANEL_CLASS}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className={SURFACE_EYEBROW_CLASS}>Round context</p>
                    <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">
                      Keep the response primary. Add confidence and dependency notes only if they matter.
                    </p>
                  </div>
                  <button className="text-xs font-medium text-[var(--ink)]" type="button" onClick={() => setShowRoundContext((current) => !current)}>
                    {showRoundContext ? 'Hide detail' : 'Add detail'}
                  </button>
                </div>
                {showRoundContext ? (
                  <div className="mt-4 space-y-4">
                    <div className={INSET_PANEL_CLASS}>
                      <label className="block text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Confidence after this response</label>
                      <div className="mt-3">
                        <ConfidenceSlider
                          value={Math.max(5, Math.min(95, round.roundContextDraft.confidenceAtRoundEnd))}
                          onChange={(value) => onRoundContextChange({ confidenceAtRoundEnd: value })}
                          showAnchors={false}
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className={INSET_PANEL_CLASS}>
                        <label className="block text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Concession note</label>
                        <textarea
                          className="penny-soft-switch mt-2 min-h-[96px] w-full rounded-[16px] border border-black/10 bg-[var(--paper)] px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none focus:border-[var(--challenge)]"
                          placeholder="Optional: name the exact point you conceded."
                          value={round.roundContextDraft.concessionNote}
                          onChange={(event) => onRoundContextChange({ concessionNote: event.target.value })}
                        />
                      </div>
                      <div className={INSET_PANEL_CLASS}>
                        <label className="block text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">Dependency cascade</label>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {([
                            ['yes', 'Yes'],
                            ['no', 'No'],
                            ['unsure', 'Unsure'],
                          ] as const).map(([value, label]) => (
                            <Button
                              key={`${round.round}-connected-${value}`}
                              type="button"
                              variant="secondary"
                              className={`penny-press px-3 py-2 text-xs ${round.roundContextDraft.connectedClaimsChanged === (value === 'yes' ? true : value === 'no' ? false : null) ? 'bg-[rgba(214,162,70,0.18)] text-[#8b6520] ring-[rgba(214,162,70,0.42)]' : ''}`}
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
                          className="penny-soft-switch mt-3 min-h-[72px] w-full rounded-[16px] border border-black/10 bg-[var(--paper)] px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none focus:border-[var(--challenge)]"
                          placeholder="Optional: name the connected claims affected."
                          value={round.roundContextDraft.connectedClaimsNote}
                          onChange={(event) => onRoundContextChange({ connectedClaimsNote: event.target.value })}
                        />
                      </div>
                    </div>
                    <div className={INSET_PANEL_CLASS}>
                      <label className="block text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">New evidence added</label>
                      <textarea
                        className="penny-soft-switch mt-2 min-h-[72px] w-full rounded-[16px] border border-black/10 bg-[var(--paper)] px-3 py-2 text-sm leading-6 text-[var(--ink)] outline-none focus:border-[var(--challenge)]"
                        placeholder="Optional: paste the new evidence or source you added."
                        value={round.roundContextDraft.newEvidenceNote}
                        onChange={(event) => onRoundContextChange({ newEvidenceNote: event.target.value })}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                    Confidence now {formatPercentValue(confidenceAtRoundEnd)}.
                  </p>
                )}
              </div>
            </form>
          ) : null}

          {bestNextMove ? (
            <div className="penny-reveal penny-card-soft p-5">
              <p className="penny-label text-[#7b6d63]">Best next move</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--ink)]">{bestNextMove.primary.label}</span>
                {bestNextMove.signalLabel ? (
                  <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted-ink)]">{bestNextMove.signalLabel}</span>
                ) : null}
              </div>
              <p className="mt-3 text-sm leading-6 text-[var(--ink)]">{bestNextMove.primary.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {canHandleNextMove(bestNextMove.primary.key) ? (
                  <Button
                    type="button"
                    className="penny-press gap-2 bg-[var(--challenge)] text-[var(--paper)] hover:bg-[#bf8d37]"
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
              {nextMoveFeedback ? <p className={SUCCESS_NOTICE_CLASS}>{nextMoveFeedback}</p> : null}
              {nextMoveError ? <p className={ERROR_NOTICE_CLASS}>{nextMoveError}</p> : null}
            </div>
          ) : null}

          {!hasCompletedResponse && generationStatus === 'fallback' && onRetryGeneration ? (
            <div className="flex justify-end">
              <Button type="button" variant="secondary" className="penny-press gap-2" onClick={() => void onRetryGeneration()}>
                Retry generation
              </Button>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className={QUIET_PANEL_CLASS}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className={SURFACE_EYEBROW_CLASS}>Critique transparency</p>
                <p className="mt-1 text-sm leading-6 text-[var(--muted-ink)]">
                  Why this challenge is appearing and what line of reasoning produced it.
                </p>
              </div>
              <button
                type="button"
                className="text-xs font-medium text-[var(--ink)]"
                onClick={() => setShowWhyNow((current) => !current)}
                disabled={generationBlocksResponse}
              >
                {showWhyNow ? 'Condense' : 'Expand'}
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <TransparencyLine label="Why now" value={round.why} />
              <TransparencyLine label="Premise" value={round.argument.premise} />
              <TransparencyLine label="Precedent" value={round.argument.precedent} />
            </div>
            {showWhyNow && !generationBlocksResponse ? (
              <div className={`mt-4 ${INSET_PANEL_CLASS}`}>
                <p className={SURFACE_EYEBROW_CLASS}>Full reading</p>
                <div className="mt-3 space-y-3">
                  <TransparencyLine label="Assumption" value={round.argument.assumption} />
                  <TransparencyLine label="Pressure" value={round.argument.pressure} />
                  <TransparencyLine label="Shape" value={round.argument.shape} />
                  <TransparencyLine label="Conclusion" value={round.argument.conclusion} />
                  <TransparencyLine label="Steel man" value={round.steelMan} />
                </div>
              </div>
            ) : null}
            {round.responseClassification ? (
              <div className="mt-4 rounded-[18px] border border-[var(--line)] bg-[var(--panel)] p-4">
                <p className="penny-label">Structured reading</p>
                <p className="mt-2 text-sm leading-6 text-[var(--ink)]">
                  Penny read this response as <span className="font-medium">{formatClassification(round.responseClassification.type)}</span>
                  {round.responseClassification.classifiedBy === 'user_explicit' ? ' from your explicit path choice.' : ' by inference from the text.'}
                </p>
                <p className={`mt-2 ${SURFACE_EYEBROW_CLASS}`}>
                  Confidence at start {formatPercentValue(round.confidenceAtRoundStart)} · end {formatPercentValue(round.confidenceAtRoundEnd)}
                  · delta {round.confidenceDelta >= 0 ? '+' : ''}
                  {formatPercentValue(round.confidenceDelta)}
                </p>
              </div>
            ) : null}
            {round.critiqueFailureTypes.length || round.concessions.length || round.defenses.length || round.dismissals.length ? (
              <div className="mt-4 flex flex-wrap gap-2 border-t border-black/8 pt-4">
                {round.critiqueFailureTypes.map((failureType) => (
                  <BadgeChip key={`${round.round}-${failureType}`} label={failureType.replaceAll('_', ' ')} />
                ))}
                {round.concessions.length ? <BadgeChip label={`${round.concessions.length} concessions`} /> : null}
                {round.defenses.length ? <BadgeChip label={`${round.defenses.length} defenses`} /> : null}
                {round.dismissals.length ? <BadgeChip label={`${round.dismissals.length} dismissals`} /> : null}
              </div>
            ) : null}
          </div>

          <div className={QUIET_PANEL_CLASS}>
            <p className={SURFACE_EYEBROW_CLASS}>Dependency cascade</p>
            <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{cascadeSummary}</p>
            <div className="mt-4 space-y-3 border-t border-black/8 pt-4">
              {cascadeSteps.map((step) => (
                <div key={step.id} className="penny-card-inset px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[var(--ink)]">{step.title}</p>
                    {step.deltaLabel ? (
                      <span className="text-[11px] uppercase tracking-[0.16em] text-[var(--muted-ink)]">{step.deltaLabel}</span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted-ink)]">{step.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
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

function TransparencyLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-black/8 pb-3 last:border-b-0 last:pb-0">
      <p className={SURFACE_EYEBROW_CLASS}>{label}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--ink)]">{value}</p>
    </div>
  )
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
