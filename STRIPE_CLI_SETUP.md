# Running Stripe CLI for Webhook Testing

## Prerequisites
✅ Stripe CLI is installed (version 1.32.0)

## Step 1: Login to Stripe CLI (if not already logged in)

```bash
stripe login
```

This will open your browser to authenticate with your Stripe account.

## Step 2: Forward Webhooks to Local Server

**Open a NEW terminal window** (keep your dev server running) and run:

```bash
stripe listen --forward-to localhost:3000/webhooks/stripe
```

## What This Does

- Listens for Stripe webhook events
- Forwards them to `http://localhost:3000/webhooks/stripe`
- Prints webhook events to the terminal so you can see what's happening

## Expected Output

When you run the command, you'll see something like:

```
> Ready! Your webhook signing secret is whsec_... (^C to quit)
```

**Important**: Copy the webhook signing secret and make sure it matches your `STRIPE_WEBHOOK_SECRET` in `.env`

## Step 3: Keep It Running

- Keep this terminal window open while testing
- The webhook forwarder needs to stay running
- Press `Ctrl+C` to stop it when done

## Testing a Specific Session

If you want to manually trigger a webhook for a specific checkout session:

```bash
stripe trigger checkout.session.completed --override checkout_session:id=cs_test_YOUR_SESSION_ID
```

## Troubleshooting

- **Webhook not received?** Make sure:
  1. Stripe CLI is running (`stripe listen ...`)
  2. Your dev server is running (`npm run dev`)
  3. The webhook secret matches in `.env`
  
- **Connection refused?** Make sure your dev server is running on port 3000

- **Wrong webhook secret?** The CLI will show a new secret each time you run `stripe listen`. Make sure your `.env` file has the matching secret.

