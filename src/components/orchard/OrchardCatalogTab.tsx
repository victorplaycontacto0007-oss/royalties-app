/**
 * OrchardCatalogTab.tsx
 *
 * Catalog tab for the Orchard analytics UI.
 *
 * Primary view: accordion hierarchy Artist → Release → Track.
 * Each level shows inline: name, total streams, total revenue.
 * Expanding an artist shows its releases; expanding a release shows its tracks.
 * ISRC shown next to track name when non-empty.
 * UPC shown next to release name when non-empty.
 *
 * Secondary view ("Vista inversa"): flat track list sorted by revenue desc.
 * Columns: Track, Artista, ISRC, Streams, Revenue — all clickable.
 *
 * Clicking any name or metric value calls onDrillDown with the matching records.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5
 */

import { useState, useMemo } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type { ArtistSummary, TrackSummary, ReleaseSummary } from '../../lib/orchard-analytics'
import type { OrchardRecord } from '../../royalty-engine/StreamTypeClassifier'

// ─── Props ────────────────────────────────────────────────────────────────────

interface OrchardCatalogTabProps {
  artistSummaries: ArtistSummary[]
  trackSummaries: TrackSummary[]
  releaseSummaries: ReleaseSummary[]
  allRecords: OrchardRecord[]
  onDrillDown: (records: OrchardRecord[], label: string) => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtRevenue(n: number): string {
  return `$${n.toFixed(4)}`
}

function fmtStreams(n: number): string {
  return n.toLocaleString()
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrchardCatalogTab({
  artistSummaries,
  trackSummaries,
  releaseSummaries,
  allRecords,
  onDrillDown,
}: OrchardCatalogTabProps) {
  // View toggle: 'hierarchy' (primary) | 'inverse' (secondary flat track list)
  const [view, setView] = useState<'hierarchy' | 'inverse'>('hierarchy')

  // ── Flat track list sorted by revenue desc (secondary view) ───────────────
  const flatTracks = useMemo(
    () =>
      [...trackSummaries].sort(
        (a, b) => b.breakdown.total.revenue - a.breakdown.total.revenue,
      ),
    [trackSummaries],
  )

  return (
    <div className="flex flex-col gap-0">
      {/* ── View toggle ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-100">
        <button
          onClick={() => setView('hierarchy')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            view === 'hierarchy'
              ? 'bg-blue-600 text-white'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          Vista jerárquica
        </button>
        <button
          onClick={() => setView('inverse')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            view === 'inverse'
              ? 'bg-blue-600 text-white'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          Vista inversa
        </button>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      {view === 'hierarchy' ? (
        <HierarchyView
          artistSummaries={artistSummaries}
          releaseSummaries={releaseSummaries}
          trackSummaries={trackSummaries}
          allRecords={allRecords}
          onDrillDown={onDrillDown}
        />
      ) : (
        <FlatTrackView
          tracks={flatTracks}
          allRecords={allRecords}
          onDrillDown={onDrillDown}
        />
      )}
    </div>
  )
}

// ─── HierarchyView ────────────────────────────────────────────────────────────

interface HierarchyViewProps {
  artistSummaries: ArtistSummary[]
  releaseSummaries: ReleaseSummary[]
  trackSummaries: TrackSummary[]
  allRecords: OrchardRecord[]
  onDrillDown: (records: OrchardRecord[], label: string) => void
}

function HierarchyView({
  artistSummaries,
  releaseSummaries,
  trackSummaries,
  allRecords,
  onDrillDown,
}: HierarchyViewProps) {
  const [expandedArtists, setExpandedArtists] = useState<Set<string>>(new Set())
  const [expandedReleases, setExpandedReleases] = useState<Set<string>>(new Set())

  function toggleArtist(artist: string) {
    setExpandedArtists(prev => {
      const next = new Set(prev)
      if (next.has(artist)) next.delete(artist)
      else next.add(artist)
      return next
    })
  }

  function toggleRelease(key: string) {
    setExpandedReleases(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="divide-y divide-gray-50">
      {artistSummaries.map(artist => {
        const artistExpanded = expandedArtists.has(artist.artist)
        const artistRecords = allRecords.filter(r => r.artist === artist.artist)

        // Releases for this artist
        const releases = releaseSummaries.filter(r => r.artist === artist.artist)

        return (
          <div key={artist.artist}>
            {/* ── Artist row ────────────────────────────────────────────── */}
            <div className="flex items-center gap-1 px-4 py-2 hover:bg-gray-50 group">
              {/* Chevron toggle */}
              <button
                onClick={() => toggleArtist(artist.artist)}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600 p-0.5"
                aria-label={artistExpanded ? 'Contraer artista' : 'Expandir artista'}
              >
                {artistExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
              </button>

              {/* Artist name */}
              <button
                onClick={() => onDrillDown(artistRecords, `Artista: ${artist.artist}`)}
                className="text-xs font-semibold text-gray-800 hover:text-blue-600 flex-1 text-left truncate"
              >
                {artist.artist}
              </button>

              {/* Metrics */}
              <MetricBadge
                value={fmtStreams(artist.breakdown.total.streams)}
                onClick={() => onDrillDown(artistRecords, `Artista: ${artist.artist} — Streams`)}
                title="Streams"
              />
              <MetricBadge
                value={fmtRevenue(artist.breakdown.total.revenue)}
                onClick={() => onDrillDown(artistRecords, `Artista: ${artist.artist} — Revenue`)}
                title="Revenue"
                variant="revenue"
              />
            </div>

            {/* ── Releases (expanded artist) ────────────────────────────── */}
            {artistExpanded && (
              <div className="border-l-2 border-blue-100 ml-6">
                {releases.length === 0 ? (
                  <p className="px-6 py-2 text-xs text-gray-400 italic">Sin releases</p>
                ) : (
                  releases.map(release => {
                    const releaseKey = `${artist.artist}|||${release.release}`
                    const releaseExpanded = expandedReleases.has(releaseKey)
                    const releaseRecords = allRecords.filter(
                      r => r.album === release.release && r.artist === artist.artist,
                    )

                    // Tracks for this release
                    const tracks = trackSummaries.filter(
                      t => t.artist === artist.artist && /* track belongs to this release */
                        allRecords.some(
                          r => r.track === t.track && r.artist === t.artist && r.album === release.release,
                        ),
                    )

                    return (
                      <div key={releaseKey}>
                        {/* Release row */}
                        <div className="flex items-center gap-1 px-4 py-1.5 hover:bg-gray-50 pl-6">
                          <button
                            onClick={() => toggleRelease(releaseKey)}
                            className="flex-shrink-0 text-gray-400 hover:text-gray-600 p-0.5"
                            aria-label={releaseExpanded ? 'Contraer release' : 'Expandir release'}
                          >
                            {releaseExpanded ? (
                              <ChevronDown className="w-3 h-3" />
                            ) : (
                              <ChevronRight className="w-3 h-3" />
                            )}
                          </button>

                          <button
                            onClick={() =>
                              onDrillDown(releaseRecords, `Release: ${release.release}`)
                            }
                            className="text-xs text-gray-700 hover:text-blue-600 flex-1 text-left truncate font-medium"
                          >
                            {release.release}
                            {release.upc ? (
                              <span className="ml-1.5 text-gray-400 font-normal text-[10px]">
                                UPC: {release.upc}
                              </span>
                            ) : null}
                          </button>

                          <MetricBadge
                            value={fmtStreams(release.breakdown.total.streams)}
                            onClick={() =>
                              onDrillDown(
                                releaseRecords,
                                `Release: ${release.release} — Streams`,
                              )
                            }
                            title="Streams"
                          />
                          <MetricBadge
                            value={fmtRevenue(release.breakdown.total.revenue)}
                            onClick={() =>
                              onDrillDown(
                                releaseRecords,
                                `Release: ${release.release} — Revenue`,
                              )
                            }
                            title="Revenue"
                            variant="revenue"
                          />
                        </div>

                        {/* ── Tracks (expanded release) ──────────────────── */}
                        {releaseExpanded && (
                          <div className="border-l-2 border-green-100 ml-10">
                            {tracks.length === 0 ? (
                              <p className="px-6 py-1.5 text-xs text-gray-400 italic">
                                Sin canciones
                              </p>
                            ) : (
                              tracks.map(track => {
                                const trackRecords = allRecords.filter(
                                  r => r.track === track.track && r.artist === artist.artist,
                                )
                                return (
                                  <div
                                    key={`${track.artist}|||${track.track}`}
                                    className="flex items-center gap-1 px-4 py-1 hover:bg-gray-50 pl-10"
                                  >
                                    {/* Spacer to align with chevron */}
                                    <span className="w-3.5 flex-shrink-0" />

                                    <button
                                      onClick={() =>
                                        onDrillDown(trackRecords, `Track: ${track.track}`)
                                      }
                                      className="text-xs text-gray-600 hover:text-blue-600 flex-1 text-left truncate"
                                    >
                                      {track.track}
                                      {track.isrc ? (
                                        <span className="ml-1.5 text-gray-400 text-[10px] font-normal">
                                          ISRC: {track.isrc}
                                        </span>
                                      ) : null}
                                    </button>

                                    <MetricBadge
                                      value={fmtStreams(track.breakdown.total.streams)}
                                      onClick={() =>
                                        onDrillDown(
                                          trackRecords,
                                          `Track: ${track.track} — Streams`,
                                        )
                                      }
                                      title="Streams"
                                    />
                                    <MetricBadge
                                      value={fmtRevenue(track.breakdown.total.revenue)}
                                      onClick={() =>
                                        onDrillDown(
                                          trackRecords,
                                          `Track: ${track.track} — Revenue`,
                                        )
                                      }
                                      title="Revenue"
                                      variant="revenue"
                                    />
                                  </div>
                                )
                              })
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )
      })}

      {artistSummaries.length === 0 && (
        <p className="px-4 py-8 text-center text-xs text-gray-400">Sin datos de catálogo.</p>
      )}
    </div>
  )
}

// ─── FlatTrackView ────────────────────────────────────────────────────────────

interface FlatTrackViewProps {
  tracks: TrackSummary[]
  allRecords: OrchardRecord[]
  onDrillDown: (records: OrchardRecord[], label: string) => void
}

function FlatTrackView({ tracks, allRecords, onDrillDown }: FlatTrackViewProps) {
  if (tracks.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-xs text-gray-400">Sin canciones.</p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse min-w-max">
        <thead className="sticky top-0 bg-white border-b border-gray-200 z-10">
          <tr>
            {['Track', 'Artista', 'ISRC', 'Streams', 'Revenue'].map(col => (
              <th
                key={col}
                className="text-left px-3 py-2 text-gray-500 font-semibold whitespace-nowrap text-[11px] uppercase tracking-wide"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tracks.map(track => {
            const trackRecords = allRecords.filter(
              r => r.track === track.track && r.artist === track.artist,
            )

            return (
              <tr
                key={`${track.artist}|||${track.track}`}
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
              >
                {/* Track name */}
                <td className="px-3 py-1.5 max-w-[200px]">
                  <button
                    onClick={() => onDrillDown(trackRecords, `Track: ${track.track}`)}
                    className="text-gray-700 hover:text-blue-600 text-left truncate block max-w-full"
                  >
                    {track.track}
                  </button>
                </td>

                {/* Artista */}
                <td className="px-3 py-1.5 max-w-[160px]">
                  <button
                    onClick={() => {
                      const artistRecords = allRecords.filter(r => r.artist === track.artist)
                      onDrillDown(artistRecords, `Artista: ${track.artist}`)
                    }}
                    className="text-gray-600 hover:text-blue-600 text-left truncate block max-w-full"
                  >
                    {track.artist}
                  </button>
                </td>

                {/* ISRC */}
                <td className="px-3 py-1.5 whitespace-nowrap">
                  {track.isrc ? (
                    <button
                      onClick={() => onDrillDown(trackRecords, `ISRC: ${track.isrc}`)}
                      className="text-gray-500 hover:text-blue-600 font-mono"
                    >
                      {track.isrc}
                    </button>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>

                {/* Streams */}
                <td className="px-3 py-1.5 text-right whitespace-nowrap">
                  <button
                    onClick={() =>
                      onDrillDown(trackRecords, `Track: ${track.track} — Streams`)
                    }
                    className="text-gray-700 hover:text-blue-600 font-mono"
                  >
                    {fmtStreams(track.breakdown.total.streams)}
                  </button>
                </td>

                {/* Revenue */}
                <td className="px-3 py-1.5 text-right whitespace-nowrap">
                  <button
                    onClick={() =>
                      onDrillDown(trackRecords, `Track: ${track.track} — Revenue`)
                    }
                    className={`font-mono hover:text-blue-600 ${
                      track.breakdown.total.revenue < 0 ? 'text-red-600' : 'text-gray-700'
                    }`}
                  >
                    {fmtRevenue(track.breakdown.total.revenue)}
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── MetricBadge ─────────────────────────────────────────────────────────────

interface MetricBadgeProps {
  value: string
  onClick: () => void
  title: string
  variant?: 'default' | 'revenue'
}

function MetricBadge({ value, onClick, title, variant = 'default' }: MetricBadgeProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex-shrink-0 font-mono text-[10px] px-1.5 py-0.5 rounded hover:bg-blue-50 hover:text-blue-600 transition-colors ${
        variant === 'revenue' ? 'text-gray-600' : 'text-gray-500'
      }`}
    >
      {value}
    </button>
  )
}
