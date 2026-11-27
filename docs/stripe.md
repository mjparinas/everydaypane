# Stripe billing setup

Everydaypane sells one paid plan, **Household**, through Stripe Checkout, the Customer Portal and a webhook
(`src/server/billing.ts`). Nothing charges until the variables below are set in Vercel. Do it in **test mode** first,
buy once with a test card, then repeat with live keys.

## 1. Account

Use a Stripe account (or a new account in your Stripe organization) for Everydaypane alone, not another product's.
Fill in the business details, the statement descriptor (`EVERYDAYPANE`) and the payout bank account before going
live. Test mode works before that.

## 2. Product and prices

Product catalogue › Add product: **Household**, recurring, two prices in USD (the marketing copy in
`src/lib/marketingPlans.ts` is in US dollars):

| Price | Amount | Vercel variable |
| --- | --- | --- |
| Monthly | $7.00 every month | `STRIPE_PRICE_ID` |
| Yearly | $59.00 every year | `STRIPE_PRICE_ID_YEARLY` |

Copy each `price_…` id. Without `STRIPE_PRICE_ID_YEARLY` the upgrade dialog shows only the monthly price and every
checkout is monthly.

## 3. Webhook

Developers › Webhooks › Add destination, endpoint `https://www.everydaypane.com/api/stripe/webhook/`, events:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Copy its signing secret (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`. Test and live mode each have their own endpoint
and secret.

## 4. Customer Portal

Settings › Billing › Customer portal: turn it on, allow cancelling and updating the payment method, and allow
switching between the monthly and yearly Household prices.

## 5. Key

Developers › API keys › Create restricted key with write access to Customers, Checkout Sessions, Customer portal
and Subscriptions (read is enough for Subscriptions if you prefer). Put it in `STRIPE_SECRET_KEY` (`rk_test_…`, later
`rk_live_…`). A standard secret key works too.

## 6. Sales tax (optional)

If you are registered to collect GST/HST or another tax, add the registrations under Stripe Tax, then set
`STRIPE_AUTOMATIC_TAX=1`. Checkout then asks for the buyer's address and adds tax. Leave it unset until you have
registrations, or Checkout charges no tax but still asks for an address.

## 7. Vercel and check

Add the variables to the **Production** environment in Vercel and redeploy. `/admin/` › System shows each Stripe key
as Set or Missing. Then, signed in to a Free household, open Settings › Plan › See Why Household › Get Household and
pay with `4242 4242 4242 4242`; the household should turn Household within seconds, and Manage Billing should open
the portal.
