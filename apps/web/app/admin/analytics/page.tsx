'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/api';
import { Bars, HeatCell, Legend, LineChart, SERIES, StatTile, shortDay } from '@/components/admin/charts/charts';

interface Analytics {
  days: number;
  daily: { day: string; newUsers: number; players: number; started: number; completed: number; shares: number; shareOpens: number; challengeAccepts: number }[];
  retention: {
    overall: { d1: number | null; d7: number | null; d30: number | null };
    cohorts: { day: string; size: number; d1: number | null; d7: number | null; d30: number | null }[];
  };
  funnel: { label: string; users: number; percent: number | null }[];
  games: {
    game: { slug: string; name: string };
    started: number;
    completed: number;
    completionRate: number | null;
    players: number;
    repeatPlayerRate: number | null;
    avgScore: number | null;
    avgDurationSec: number | null;
    firstGameD1: number | null;
    firstGameD7: number | null;
    firstGamePlayers: number;
  }[];
  acquisition: {
    signups: number;
    viaInvite: number;
    viaChallenge: number;
    viaUtm: number;
    byInvite: { code: string; label: string; signups: number }[];
    byUtm: { source: string; campaign: string | null; signups: number }[];
    viral: { shares: number; opens: number; accepts: number; signups: number; signupsPerShare: number | null };
  };
}

const pctOr = (v: number | null) => (v === null ? '–' : `${v}%`);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export default function AdminAnalytics() {
  const [days, setDays] = useState(30);
  const { data, error } = useSWR<Analytics>(`/admin/analytics?days=${days}`, fetcher);
  const [showTable, setShowTable] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black">Beta analytics</h1>
          <p className="text-sm text-muted">Do players understand the games, come back, and share? Days are in IST.</p>
        </div>
        <div className="flex gap-1" role="group" aria-label="Time range">
          {[7, 14, 30, 90].map((d) => (
            <button key={d} className={d === days ? 'btn-primary px-3 py-1 text-sm' : 'btn-ghost px-3 py-1 text-sm'} onClick={() => setDays(d)}>
              {d}d
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-bad">Couldn’t load analytics.</p>}
      {!data ? (
        !error && <p className="text-muted">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6" data-testid="kpis">
            <StatTile label="Day-1 retention" value={pctOr(data.retention.overall.d1)} hint="played again the next day" />
            <StatTile label="Day-7 retention" value={pctOr(data.retention.overall.d7)} hint="played on day 7" />
            <StatTile label="Day-30 retention" value={pctOr(data.retention.overall.d30)} />
            <StatTile label={`Sign-ups (${days}d)`} value={String(data.acquisition.signups)} />
            <StatTile label={`Games played (${days}d)`} value={String(sum(data.daily.map((d) => d.started)))} />
            <StatTile
              label="Sign-ups per share"
              value={data.acquisition.viral.signupsPerShare === null ? '–' : String(data.acquisition.viral.signupsPerShare)}
              hint={`${data.acquisition.viral.shares} shares → ${data.acquisition.viral.signups} sign-ups`}
            />
          </div>

          <section className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-bold">Daily players and new sign-ups</h2>
              <div className="flex items-center gap-4">
                <Legend items={[{ label: 'Active players', color: SERIES[0] }, { label: 'New sign-ups', color: SERIES[1] }]} />
                <button className="text-xs text-muted underline" onClick={() => setShowTable((v) => !v)}>
                  {showTable ? 'hide table' : 'show table'}
                </button>
              </div>
            </div>
            <LineChart
              labels={data.daily.map((d) => d.day)}
              series={[
                { label: 'Active players', color: SERIES[0], values: data.daily.map((d) => d.players) },
                { label: 'New sign-ups', color: SERIES[1], values: data.daily.map((d) => d.newUsers) },
              ]}
            />
            {showTable && (
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <thead className="sticky top-0 bg-panel text-left text-muted">
                    <tr>
                      {['Day', 'Players', 'Sign-ups', 'Started', 'Completed', 'Shares', 'Link opens', 'Accepts'].map((h) => (
                        <th key={h} className="py-1 pr-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.daily].reverse().map((d) => (
                      <tr key={d.day} className="border-t border-line">
                        <td className="py-1 pr-3">{shortDay(d.day)}</td>
                        <td>{d.players}</td>
                        <td>{d.newUsers}</td>
                        <td>{d.started}</td>
                        <td>{d.completed}</td>
                        <td>{d.shares}</td>
                        <td>{d.shareOpens}</td>
                        <td>{d.challengeAccepts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card space-y-3">
              <h2 className="font-bold">Sign-up funnel ({days}d)</h2>
              <Bars rows={data.funnel.map((s) => ({ label: s.label, value: s.percent, note: `(${s.users})` }))} />
            </section>

            <section className="card space-y-3" data-testid="cohorts">
              <h2 className="font-bold">Retention by sign-up day</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted">
                    <tr>
                      <th className="py-1">Cohort</th>
                      <th>Users</th>
                      <th className="text-center">D1</th>
                      <th className="text-center">D7</th>
                      <th className="text-center">D30</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.retention.cohorts.map((c) => (
                      <tr key={c.day} className="border-t border-line">
                        <td className="py-1">{shortDay(c.day)}</td>
                        <td>{c.size}</td>
                        <HeatCell value={c.d1} />
                        <HeatCell value={c.d7} />
                        <HeatCell value={c.d30} />
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.retention.cohorts.length === 0 && <p className="py-4 text-muted">No sign-ups yet.</p>}
                <p className="mt-2 text-xs text-muted">· = cohort too young to measure yet. Darker = more players came back.</p>
              </div>
            </section>
          </div>

          <section className="card space-y-3">
            <div>
              <h2 className="font-bold">Which game makes people stay?</h2>
              <p className="text-xs text-muted">
                “First-game D7” = of players whose first ever game was this one, how many played again on day 7. Push the game that wins
                this.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <thead className="text-left text-muted">
                  <tr>
                    <th className="py-1">Game</th>
                    <th>Plays</th>
                    <th>Completion</th>
                    <th>Repeat players</th>
                    <th>Avg score</th>
                    <th>Avg time</th>
                    <th>First-game D1</th>
                    <th className="w-48">First-game D7</th>
                  </tr>
                </thead>
                <tbody>
                  {data.games.map((g) => (
                    <tr key={g.game.slug} className="border-t border-line">
                      <td className="py-2 pr-2">{g.game.name}</td>
                      <td>{g.started}</td>
                      <td>{pctOr(g.completionRate)}</td>
                      <td>{pctOr(g.repeatPlayerRate)}</td>
                      <td>{g.avgScore ?? '–'}</td>
                      <td>{g.avgDurationSec === null ? '–' : `${Math.floor(g.avgDurationSec / 60)}m ${g.avgDurationSec % 60}s`}</td>
                      <td>{pctOr(g.firstGameD1)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="h-3 flex-1">
                            {g.firstGameD7 !== null && g.firstGameD7 > 0 && (
                              <div className="h-3 rounded-r" style={{ width: `${Math.max(1, g.firstGameD7)}%`, background: SERIES[0] }} />
                            )}
                          </div>
                          <span className="w-12 text-right">{pctOr(g.firstGameD7)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card space-y-3">
              <h2 className="font-bold">Where sign-ups came from ({days}d)</h2>
              <Bars
                max={Math.max(1, data.acquisition.signups)}
                suffix=""
                rows={[
                  { label: 'Invite codes', value: data.acquisition.viaInvite },
                  { label: 'Friend challenges', value: data.acquisition.viaChallenge },
                  { label: 'Tagged campaigns', value: data.acquisition.viaUtm },
                ]}
              />
              <table className="w-full text-sm">
                <tbody>
                  {data.acquisition.byInvite.map((r) => (
                    <tr key={r.code} className="border-t border-line">
                      <td className="py-1 font-mono">{r.code}</td>
                      <td className="text-muted">{r.label}</td>
                      <td className="text-right">{r.signups}</td>
                    </tr>
                  ))}
                  {data.acquisition.byUtm.map((r) => (
                    <tr key={`${r.source}-${r.campaign}`} className="border-t border-line">
                      <td className="py-1">utm: {r.source}</td>
                      <td className="text-muted">{r.campaign ?? '—'}</td>
                      <td className="text-right">{r.signups}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="card space-y-3">
              <h2 className="font-bold">Challenge-a-friend loop ({days}d)</h2>
              <Bars
                max={Math.max(1, data.acquisition.viral.shares, data.acquisition.viral.opens)}
                suffix=""
                rows={[
                  { label: 'Challenges shared', value: data.acquisition.viral.shares },
                  { label: 'Links opened', value: data.acquisition.viral.opens },
                  { label: 'Challenges accepted', value: data.acquisition.viral.accepts },
                  { label: 'New sign-ups', value: data.acquisition.viral.signups },
                ]}
              />
            </section>
          </div>
        </>
      )}
    </div>
  );
}
