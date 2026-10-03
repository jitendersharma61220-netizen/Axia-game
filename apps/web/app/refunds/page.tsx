import type { Metadata } from 'next';
import Link from 'next/link';
import { L, LegalPage } from '@/components/LegalPage';

export const metadata: Metadata = { title: 'Refund & Cancellation Policy — Axia' };

export default function RefundsPage() {
  return (
    <LegalPage
      title="Refund & Cancellation Policy"
      intro={
        <p>
          <b>Every game on Axia is free to play.</b> The only thing you can buy is coins, which are spent on extra plays and
          cosmetic skins. During the closed beta the shop runs in test mode and no real money is taken. This policy explains
          how refunds will work once real payments are switched on, and how they will work for any future plans.
        </p>
      }
      sections={[
        {
          id: 'now',
          title: 'During the closed beta',
          body: (
            <ul>
              <li>All games, challenges and features are free. The shop runs in test mode, so buying coins takes no real money.</li>
              <li>We never ask for card, UPI or bank details.</li>
              <li>
                If anyone asks you to pay for Axia, or for an invite code, it is not us. Please report it to{' '}
                <L k="supportEmail" />.
              </li>
            </ul>
          ),
        },
        {
          id: 'plans',
          title: 'Paid plans (planned)',
          body: (
            <>
              <p>
                Any future plan will be a fee for access to games and features only. It will never be a stake or entry fee to win
                money or prizes. Before you pay, you will see the price including GST, the billing period, and whether the plan
                renews automatically.
              </p>
              <mark className="block rounded bg-warn/20 p-2 text-warn">
                [Pending legal review: plan structure, renewals and any benefits must comply with the Promotion and Regulation of
                Online Gaming Act, 2025 before launch.]
              </mark>
            </>
          ),
        },
        {
          id: 'coins',
          title: 'Coins',
          body: (
            <ul>
              <li>
                <b>Spent coins are not refundable.</b> This covers an extra play you have started and a skin you have unlocked,
                because you receive them immediately.
              </li>
              <li>
                <b>Unspent coins</b> from a purchase can be refunded if you ask within 7 days of buying them and have not spent
                any coins from that purchase.
              </li>
              <li>
                If a payment went through but the coins did not reach your balance, or you were charged twice, we refund the
                payment or add the coins, as you prefer.
              </li>
              <li>Coins are never paid out in cash. A refund always goes back to the original payment method.</li>
            </ul>
          ),
        },
        {
          id: 'cancel',
          title: 'Cancelling a subscription',
          body: (
            <ul>
              <li>You will be able to cancel an auto-renewing plan at any time from your Account page.</li>
              <li>After you cancel, you keep access until the end of the period you have paid for. It will not renew again.</li>
              <li>
                For auto-debits (UPI AutoPay or card mandates), we will send the advance notice required by the Reserve Bank of
                India before each charge. You can also cancel the mandate from your bank or UPI app.
              </li>
            </ul>
          ),
        },
        {
          id: 'refunds',
          title: 'When we refund',
          body: (
            <>
              <p>We will refund the full amount if:</p>
              <ul>
                <li>you were charged twice, or charged after you cancelled;</li>
                <li>the payment went through but the plan or feature was not activated;</li>
                <li>a paid feature was unavailable for most of your billing period because of a fault on our side.</li>
              </ul>
              <p>
                Apart from these cases, the fee for a period you have already started is generally not refundable, unless the
                law requires otherwise.
              </p>
            </>
          ),
        },
        {
          id: 'how',
          title: 'How to ask for a refund',
          body: (
            <p>
              Email <L k="supportEmail" /> within 7 days of the charge, from the email address you sign in with, and include the
              payment reference. We will reply within 2 working days. Approved refunds go back to the original payment method
              within 5–7 working days.
            </p>
          ),
        },
        {
          id: 'help',
          title: 'Complaints',
          body: (
            <p>
              If you are not happy with how we handled a refund, contact our Grievance Officer, <L k="grievanceOfficerName" /> (
              <L k="grievanceOfficerEmail" />). See also our <Link href="/terms">Terms of Service</Link>.
            </p>
          ),
        },
      ]}
    />
  );
}
