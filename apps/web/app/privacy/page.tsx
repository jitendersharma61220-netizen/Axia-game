import type { Metadata } from 'next';
import Link from 'next/link';
import { L, LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Privacy Policy — Axia' };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          This policy explains what personal data <L k="companyName" /> (“we”, “us”), the operator of Axia, collects when you
          use Axia, why, how long we keep it, and the rights you have under India’s Digital Personal Data Protection Act, 2023
          (“DPDP Act”) and its Rules. We collect only what we need to run the games, keep them fair, and improve them.
        </p>
      }
      sections={[
        {
          id: 'what-we-collect',
          title: 'What we collect',
          body: (
            <>
              <p>
                <b>When you sign in with Google:</b> your name, email address, profile photo and Google account ID. We never see
                your Google password.
              </p>
              <p>
                <b>Your year of birth</b>, which you enter during onboarding. We use it only to put you in the right age group:
                players aged 14–18 get a separate, free experience, and under-14s cannot use Axia.
              </p>
              <p>
                <b>Gameplay:</b> the games you start, the moves you make, the time you take, the difficulty, your scores, and your
                place on leaderboards.
              </p>
              <p>
                <b>Usage events:</b> sign-up, sign-in, game started or completed, challenge shared, challenge link opened, and
                challenge accepted. These are tied to your account so we can see whether the games are working, e.g. whether
                players come back the next day.
              </p>
              <p>
                <b>How you found us:</b> the invite code, campaign tags (such as <code>utm_source</code>) or friend’s challenge
                link you arrived with. We store this on your account when you sign up.
              </p>
              <p>
                <b>Feedback</b> you send us through the Feedback button, including an optional star rating.
              </p>
              <p>
                <b>Coins and purchases:</b> your coin balance, every change to it, the packs you buy (amount, time, status and
                the payment provider’s reference), and the cosmetic items you own. When real payments are switched on, the
                payment provider collects your payment details directly. We never see or store your full card, UPI or bank
                details.
              </p>
              <p>
                <b>Technical data:</b> your IP address is used briefly to block abuse (for example, too many sign-in attempts).
                It is held in a short-lived memory store for at most 10 minutes and is not written to our database.
              </p>
              <p>
                <b>We do not collect</b> your phone number, contacts, location, full payment card or bank details, or government ID.
              </p>
            </>
          ),
        },
        {
          id: 'cookies',
          title: 'Cookies and local storage',
          body: (
            <ul>
              <li>
                One <b>essential sign-in cookie</b> keeps you logged in for up to 30 days. It cannot be read by scripts on the
                page, and it is deleted when you sign out.
              </li>
              <li>
                Your browser’s local storage briefly remembers the invite code or campaign you arrived with, until you sign up.
              </li>
              <li>
                Signing in loads Google’s sign-in script, which is subject to{' '}
                <a href="https://policies.google.com/privacy" rel="noreferrer" target="_blank">
                  Google’s privacy policy
                </a>
                .
              </li>
              <li>We do not use advertising cookies, third-party analytics, or tracking pixels.</li>
            </ul>
          ),
        },
        {
          id: 'why',
          title: 'Why we use your data',
          body: (
            <ul>
              <li>To create your account and sign you in.</li>
              <li>To run the games: generate levels, check answers, calculate scores, and show leaderboards and your skill profile.</li>
              <li>
                To keep play fair: detect bots and impossible scores, and stop flagged runs from appearing on leaderboards.
              </li>
              <li>To apply age rules: separate the teen experience and block under-14s.</li>
              <li>
                To improve Axia: measure which games people understand, finish, replay and share, using totals and trends.
              </li>
              <li>To respond to your feedback and requests.</li>
              <li>To meet legal obligations.</li>
            </ul>
          ),
        },
        {
          id: 'public',
          title: 'What other players can see',
          body: (
            <ul>
              <li>
                <b>Leaderboards</b> show your first name and last initial (for example, “Rohan S.”), your score and your rank.
              </li>
              <li>
                When you <b>share a challenge link</b>, anyone with that link can see your first name, that game’s score, and the
                game name.
              </li>
              <li>Your email address, photo and year of birth are never shown to other players.</li>
            </ul>
          ),
        },
        {
          id: 'sharing',
          title: 'Who we share data with',
          body: (
            <>
              <p>We do not sell your personal data and we do not share it with advertisers. We share it only with:</p>
              <ul>
                <li>
                  <b>Google</b>, to verify your sign-in.
                </li>
                <li>
                  <b>Our hosting provider</b>, <L k="hostingProvider" />, whose servers in <L k="hostingRegion" /> store our
                  database. They process data only on our instructions.
                </li>
                <li>
                  <b>Our payment provider</b>, once real payments are switched on, to take payment for coin packs and to handle
                  refunds and disputes.
                </li>
                <li>
                  <b>Authorities</b>, when Indian law requires it, for example under a valid legal order.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: 'retention',
          title: 'How long we keep it',
          body: (
            <ul>
              <li>Account, gameplay and feedback data are kept while your account is active.</li>
              <li>
                If you ask us to delete your account, we erase your personal data within 30 days. Backup copies roll over
                within a further 14 days.
              </li>
              <li>
                Totals that cannot identify you (for example, “1,200 games played on Monday”) may be kept after deletion.
              </li>
              <li>
                We may keep specific records longer when the law requires it. For example, purchase records are kept for as long
                as tax and accounting law requires, currently up to 8 years.
              </li>
            </ul>
          ),
        },
        {
          id: 'children',
          title: 'Players under 18',
          body: (
            <>
              <p>
                Axia is not available to anyone under 14. Players aged 14 to 18 get a separate, free experience with no paid
                features and no advertising.
              </p>
              <p>
                Under the DPDP Act, anyone under 18 is a child, and processing their data requires the verifiable consent of a
                parent or guardian. Tracking and behavioural monitoring of children are restricted.{' '}
                <mark className="rounded bg-warn/20 px-1 text-warn">
                  [To finalise with legal review: how parental consent is collected and verified for players aged 14–17, and
                  which analytics are switched off for them.]
                </mark>
              </p>
              <p>
                If you are a parent and believe your child is using Axia without your consent, contact our Grievance Officer
                (below). We will remove the account.
              </p>
            </>
          ),
        },
        {
          id: 'rights',
          title: 'Your rights',
          body: (
            <>
              <p>Under the DPDP Act, you can ask us to:</p>
              <ul>
                <li>give you a summary of the personal data we hold about you and how we use it;</li>
                <li>correct or update inaccurate data;</li>
                <li>erase your data and close your account;</li>
                <li>withdraw your consent. This closes your account, because Axia cannot run without the data above;</li>
                <li>nominate someone to act for you in case of death or incapacity.</li>
              </ul>
              <p>
                Email <L k="supportEmail" /> from the address you sign in with. We will reply within 30 days. If you are not
                satisfied, you can contact our Grievance Officer, and after that the Data Protection Board of India.
              </p>
            </>
          ),
        },
        {
          id: 'security',
          title: 'How we protect it',
          body: (
            <ul>
              <li>All traffic uses HTTPS.</li>
              <li>Sign-in cookies are protected from page scripts.</li>
              <li>The database and caches are reachable only inside our private server network.</li>
              <li>Backups are kept on the server and rotated.</li>
              <li>We limit sign-in attempts to block abuse.</li>
            </ul>
          ),
        },
        {
          id: 'grievance',
          title: 'Grievance Officer and contact',
          body: (
            <p>
              <L k="grievanceOfficerName" />, Grievance Officer, <L k="companyName" />, <L k="companyAddress" />. Email:{' '}
              <L k="grievanceOfficerEmail" />. We acknowledge complaints within 24 hours and aim to resolve them within 15 days.
            </p>
          ),
        },
        {
          id: 'changes',
          title: 'Changes to this policy',
          body: (
            <p>
              If we change how we use your data, we will update this page and tell you in the app before the change takes
              effect. Where the law requires it, we will ask for your consent again. See also our{' '}
              <Link href="/terms">Terms of Service</Link>.
            </p>
          ),
        },
      ]}
    />
  );
}
