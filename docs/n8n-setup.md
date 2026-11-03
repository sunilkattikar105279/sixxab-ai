# Connect n8n: make approved actions actually go out

When you approve a post or message in SIXXAB AI, the platform sends it to one n8n webhook.
The workflow in `integrations/n8n/sixxab-actions.json` publishes it and replies with what happened,
which appears in **Activity** (for example "Posted on LinkedIn: https://…", or "X failed: …").

| Approved action | Where it goes |
| --- | --- |
| Post on LinkedIn | LinkedIn (your profile) |
| Post on X / Twitter | X |
| Message by email | Gmail, from your account. Start the text with `Subject: …` to set the subject |
| Message by SMS | Twilio SMS |
| Message by WhatsApp | Twilio WhatsApp |
| Email campaign | Emailed to **you** to send from your email tool (the list is not emailed) |
| Spend money | Emailed to **you**. n8n never moves money |
| Anything else (Instagram, Facebook…) | Not sent; Activity says the channel is not connected yet |

## 1. Get n8n

Either option works:
- **n8n Cloud** (n8n.io): quickest. Your webhook URL looks like `https://<you>.app.n8n.cloud/webhook/sixxab-actions`.
- **Self-hosted** (Docker, Railway, Render, a VPS): must be reachable over HTTPS from the internet.

## 2. Import the workflow

In n8n: **Workflows → Create → ⋯ → Import from File** and choose `integrations/n8n/sixxab-actions.json`.

## 3. Fill in the nodes

1. **SIXXAB webhook** → Credential for Header Auth → *Create new*:
   - Name: `x-sixxab-secret`
   - Value: the same value as `N8N_WEBHOOK_SECRET` in Vercel.
2. **Route** (code node) → edit the four settings at the top:
   - `FOUNDER_EMAIL`: where spending requests and campaign drafts go.
   - `TWILIO_SMS_FROM`, `TWILIO_WHATSAPP_FROM`: your Twilio numbers in +country format.
   - `DEFAULT_EMAIL_SUBJECT`: used when a message has no `Subject:` line.
3. Connect a credential on each sender (skip the ones you don't use; unused channels simply report "failed"):
   - **Post on LinkedIn**: LinkedIn OAuth2, then pick your profile under *Person*.
   - **Post on X**: X OAuth2 (needs an X developer app with write access).
   - **Send email** and **Email the founder**: Gmail OAuth2.
   - **Send SMS** and **Send WhatsApp**: Twilio API (Account SID + Auth Token).
     For India, SMS needs DLT registration; WhatsApp needs an approved Twilio WhatsApp sender.

## 4. Turn it on

1. **Save**, then switch the workflow to **Active**.
2. Open **SIXXAB webhook** and copy the **Production URL** (not the Test URL).
3. In Vercel → Project → Settings → Environment Variables, set `N8N_WEBHOOK_URL` to that URL, then redeploy.
4. Check `https://sixxab.ai/api/health`: `automations` should be `true`.

## 5. Test

Approve one LinkedIn post in **Approvals**. Activity should show "Posted on LinkedIn" with a link.
If it shows "failed", the message says why (expired token, missing credential, X's 280-character limit…).

## Notes

- Posts go out when approved. A requested future time (`when`) is not scheduled by this workflow yet.
- The platform waits up to 30 seconds for n8n to reply.
- To add a channel (Instagram, Facebook, Slack…), add a branch: a route in **Route**, an output in **By channel**,
  the sender node with *On Error → Continue (using error output)*, and a *Respond to Webhook* reply.
  Keep the source of truth in `scripts/build-n8n-workflow.mjs` and run `npm run n8n:workflow && npm test`.
