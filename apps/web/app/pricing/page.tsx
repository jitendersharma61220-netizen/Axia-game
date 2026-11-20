import Link from 'next/link';

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <div className="text-center">
        <h1 className="text-3xl font-black">Pricing</h1>
        <p className="mt-2 text-lg text-muted">Every game is free to play. Coins are optional.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-2">Free</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
            <li>All games and difficulties</li>
            <li>Free plays every day (they reset at midnight IST)</li>
            <li>Daily and weekly challenges</li>
            <li>Leaderboards and challenge-a-friend</li>
          </ul>
        </div>
        <div className="card">
          <p className="text-sm font-semibold uppercase tracking-widest text-warn">🪙 Coins (19+)</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
            <li>One more play when today’s free plays are used up</li>
            <li>Ship skins for Neon Dodge (looks only, never stats)</li>
            <li>Packs from ₹49</li>
          </ul>
          <Link href="/shop" className="btn-primary mt-4 w-full">
            Open the shop
          </Link>
        </div>
      </div>
      <p className="text-center text-xs text-muted">
        Coins are never won and never paid out. They have no cash value and can’t be exchanged for money or prizes. Winning gets
        you rank, badges and bragging rights. See <Link className="underline" href="/terms#coins">Terms</Link>.
      </p>
    </div>
  );
}
