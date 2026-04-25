# WhatsApp Cloud API – Bot Integration Notes

Quick orientation map for engineers working on the WhatsApp adapter.
The inbound webhook handler is the **official `@chat-adapter/whatsapp`**
package (no fork, no custom adapter). The lobehub server-side platform
client is a thin wrapper that:

1. instantiates the official adapter inside `createAdapter()` so the Chat
   SDK owns the GET handshake / signature verification / event dispatch
2. owns its own minimal `WhatsAppApiClient` (see `./api.ts`) for outbound
   calls that must work without an initialized `Chat` instance — namely
   `start()` credential checks, `getMessenger`, and `extractFiles`

Authoritative documentation:

- Chat SDK adapter docs: <https://chat-sdk.dev/adapters/whatsapp>
- Cloud API overview: <https://developers.facebook.com/docs/whatsapp/cloud-api>
- Webhook payload schema: <https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples>
- Send Messages API: <https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages>

## Credentials

| Field                             | Source                                                                                                    | Notes                                                                                                       |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `applicationId` (Phone Number ID) | "WhatsApp" tab in the Meta App dashboard                                                                  | Numeric. Used as the `applicationId` for routing webhooks (`/api/agent/webhooks/whatsapp/<phoneNumberId>`). |
| `accessToken`                     | System User → "Generate token" with `whatsapp_business_messaging` + `whatsapp_business_management` scopes | Long-lived. Bearer header for every Graph call.                                                             |
| `verifyToken`                     | Operator-chosen secret that they paste into Meta when configuring the webhook                             | Echoed in `hub.verify_token` during the GET handshake.                                                      |
| `appSecret`                       | Meta App → Basic Settings                                                                                 | **Required by `@chat-adapter/whatsapp`**. Validates `X-Hub-Signature-256` on every inbound POST.            |

## Thread ID format

`whatsapp:{phoneNumberId}:{userWaId}` — matches the official adapter's
`encodeThreadId` / `decodeThreadId`. The lobehub `extractChatId` returns
the `userWaId` segment (the recipient's wa_id).

## Webhook lifecycle

1. **GET handshake** – Meta sends `?hub.mode=subscribe&hub.verify_token=…&hub.challenge=…`.
   The official adapter responds `200 text/plain` with the verbatim
   challenge if and only if the verify token matches.
2. **POST notification** – Meta sends a JSON body with `object: "whatsapp_business_account"`
   and one or more `entry[].changes[]`. The adapter only handles
   `field === "messages"` and dispatches each `messages[]` entry to the
   Chat SDK via `processMessage`.
3. **Signature validation** – every POST must carry an `X-Hub-Signature-256`
   header equal to `sha256=` + HMAC-SHA256(rawBody, appSecret). The
   adapter rejects mismatches with HTTP 401. `appSecret` is **required**
   in the official adapter config — there is no fallback.

The catch-all webhook route at
`src/app/(backend)/api/agent/webhooks/[platform]/[[...appId]]/route.ts`
exposes both `GET` and `POST`. The GET verb dispatches to the same
router so the official adapter's `handleWebhook` can pick up the
`hub.challenge` parameters.

## Outbound (server-side, this package's `api.ts`)

`POST /v21.0/<phoneNumberId>/messages`:

```jsonc
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "<userWaId>",
  "type": "text",
  "text": { "body": "…", "preview_url": false },
}
```

For reactions, the adapter and the server-side client both POST a
`type: "reaction"` payload with `{ emoji, message_id }`. An empty
`emoji` string removes the bot's previous reaction.

For the typing indicator the adapter exposes `startTyping(threadId)`,
which the server-side messenger replicates via
`markRead(messageId, typingIndicator=true)` — the only Cloud API
primitive available. The indicator displays for \~25s or until the next
outbound message.

## Capabilities

- **Edit / delete** – not supported by Cloud API. `supportsMessageEdit: false`
  on the platform definition makes the bridge skip per-step progress
  edits and only emit the final reply.
- **Markdown** – outbound markdown is normalized to WhatsApp's
  lightweight family (`*bold*` / `_italic_` / `~strike~` / `` `code` ``)
  by `markdownToWhatsApp`.
- **Reactions** – `addReaction` / `removeReaction` / `replaceReaction`
  are wired against the Cloud API reactions endpoint. The 👀 → ✏️
  transition flow used elsewhere works.
- **Group chats** – Cloud API does not deliver group conversations to
  bots. WhatsApp threads are always 1:1.
- **Attachments** – inbound media metadata is parsed by the official
  adapter; bytes are downloaded on demand by `extractFiles` via
  `WhatsAppApiClient.downloadMedia` (two-step: resolve URL, then GET
  with bearer header) because `Message.toJSON` strips lazy `fetchData`
  closures across the chat-sdk Redis queue.

## Operator-facing setup

Webhook URL must be configured manually in the Meta App dashboard
(`WhatsApp → Configuration → Webhooks`). Paste the channel detail
page's "Webhook URL" into the _Callback URL_ field and the
`verifyToken` into the _Verify token_ field, then subscribe to the
`messages` field. Operators must also paste the Meta App Secret into
LobeHub — the official adapter requires it.
