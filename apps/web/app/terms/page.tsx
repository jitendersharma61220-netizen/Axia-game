import type { Metadata } from 'next';
import Link from 'next/link';
import { L, LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Terms of Service — Axia' };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          These terms are an agreement between you and <L k="companyName" />, <L k="companyAddress" /> (“we”, “us”), the
          operator of Axia. By signing in or playing, you agree to them. If you do not agree, please do not use Axia.
        </p>
      }
      sections={[
        {
          id: 'service',
          title: 'What Axia is',
          body: (
            <>
              <p>
                Axia offers short skill games (memory, logic, deduction, quick thinking and mission-style games), daily and
                weekly challenges, leaderboards, and a way to challenge friends.
              </p>
              <p>
                <b>Axia is not a real-money game.</b> You cannot pay, deposit or stake money to win money or anything of value,
                and we do not offer betting or gambling of any kind.
              </p>
              <p>
                Axia is currently in a <b>closed beta</b>: some features may change, reset or be removed, and joining may need an
                invite code or a friend’s challenge link.
              </p>
            </>
          ),
        },
        {
          id: 'eligibility',
          title: 'Who can use Axia',
          body: (
            <ul>
              <li>You must be at least 14 years old.</li>
              <li>
                If you are under 18, a parent or legal guardian must agree to these terms and to our{' '}
                <Link href="/privacy">Privacy Policy</Link> on your behalf. Players aged 14–18 get a separate, free experience.
              </li>
              <li>You must give your real year of birth. Accounts found to be under age will be closed.</li>
              <li>You may have only one account.</li>
            </ul>
          ),
        },
        {
          id: 'account',
          title: 'Your account',
          body: (
            <ul>
              <li>You sign in with your Google account. You are responsible for keeping that Google account secure.</li>
              <li>
                Your name may appear to other players as your first name and last initial. See the Privacy Policy for details.
              </li>
              <li>
                You can ask us to close your account at any time by emailing <L k="supportEmail" />.
              </li>
            </ul>
          ),
        },
        {
          id: 'fair-play',
          title: 'Fair play',
          body: (
            <>
              <p>Scores only mean something if everyone plays fairly. You agree not to:</p>
              <ul>
                <li>use bots, scripts, auto-clickers or any tool that plays for you;</li>
                <li>tamper with the app, its network traffic, or the scoring;</li>
                <li>exploit bugs instead of reporting them;</li>
                <li>use several accounts, share an account, or play on someone else’s behalf;</li>
                <li>harass other players or misuse challenge links.</li>
              </ul>
              <p>
                Our systems check timing and moves on the server. Runs that look automated or impossible are flagged and kept off
                leaderboards. We may remove scores, reset progress, or suspend accounts that break these rules. If you think we
                got it wrong, contact the Grievance Officer.
              </p>
            </>
          ),
        },
        {
          id: 'content',
          title: 'Feedback and content',
          body: (
            <p>
              If you send us feedback or ideas, we may use them to improve Axia without paying you or owing you anything. Do not
              include other people’s personal information in feedback. The games, levels, artwork, text and software are owned
              by us or our licensors. You may not copy, resell or reverse-engineer them.
            </p>
          ),
        },
        {
          id: 'paid',
          title: 'Paid features',
          body: (
            <p>
              Every game on Axia can be played for free. Before you pay for anything, we show you the price and what it includes.
              Purchases are covered by our <Link href="/refunds">Refund &amp; Cancellation Policy</Link>. Paid features are never
              offered to players under 18. During the closed beta, the shop runs in test mode and no real payment is taken.
            </p>
          ),
        },
        {
          id: 'coins',
          title: 'Coins',
          body: (
            <>
              <p>
                Coins are a virtual item you can buy in the Shop. You can spend them only on Axia: on an extra play of a game after
                your free plays for the day are used, and on cosmetic items such as ship skins. Cosmetic items change only how
                something looks. They never change how a game plays or how it is scored.
              </p>
              <ul>
                <li>
                  <b>Coins are never won.</b> You cannot win coins, money, vouchers or any other prize by playing or by your rank on
                  a leaderboard.
                </li>
                <li>
                  <b>Coins have no cash value.</b> They cannot be withdrawn, sold, transferred to another account, or exchanged for
                  money or anything outside Axia.
                </li>
                <li>Only players aged 19 and over can buy or spend coins.</li>
                <li>
                  Coins are a licence to use a feature, not your property. Unspent coins end when your account is closed. If we
                  ever stop offering coins, we will give you reasonable notice.
                </li>
                <li>
                  Coins obtained through a bug, a chargeback or a breach of these terms may be removed. Every change to your
                  balance is shown in your coin history.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'availability',
          title: 'Availability and changes',
          body: (
            <p>
              We work to keep Axia running, but we cannot promise it will always be available or error-free, especially during
              the beta. We may change, add or remove games, difficulty settings, challenges and features at any time.
            </p>
          ),
        },
        {
          id: 'liability',
          title: 'Disclaimers and liability',
          body: (
            <p>
              Axia is provided “as is”. To the extent the law allows, we are not liable for indirect or consequential losses, or
              for loss of scores, rankings or progress. Nothing in these terms limits rights you have under Indian consumer
              protection law.
            </p>
          ),
        },
        {
          id: 'ending',
          title: 'Ending your use',
          body: (
            <p>
              You can stop using Axia and ask us to delete your account at any time. We may suspend or close accounts that break
              these terms, or if we have to by law. Where reasonable, we will tell you why.
            </p>
          ),
        },
        {
          id: 'law',
          title: 'Governing law and disputes',
          body: (
            <p>
              These terms are governed by the laws of India. Please contact our Grievance Officer first. We will try to resolve
              any complaint within 15 days. Disputes that cannot be resolved this way fall under the courts at{' '}
              <L k="jurisdictionCity" />.
            </p>
          ),
        },
        {
          id: 'grievance',
          title: 'Grievance Officer and contact',
          body: (
            <p>
              <L k="grievanceOfficerName" />, Grievance Officer, <L k="companyName" />, <L k="companyAddress" />. Email:{' '}
              <L k="grievanceOfficerEmail" />. General help: <L k="supportEmail" />.
            </p>
          ),
        },
        {
          id: 'changes',
          title: 'Changes to these terms',
          body: (
            <p>
              We may update these terms. If a change is significant, we will tell you in the app before it takes effect. If you
              keep using Axia after that, you accept the updated terms.
            </p>
          ),
        },
      ]}
    />
  );
}
