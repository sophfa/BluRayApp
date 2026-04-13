import { createClient } from 'npm:@supabase/supabase-js@2';

type NotificationEmailPayload =
  | {
      type: 'suggestion_submitted';
      suggestionId: string;
      actionUrl: string;
    }
  | {
      type: 'suggestion_status_changed';
      suggestionId: string;
      actionUrl: string;
    }
  | {
      type: 'friend_request_sent';
      friendshipId: string;
      actionUrl: string;
    }
  | {
      type: 'friend_request_accepted';
      friendshipId: string;
      actionUrl: string;
    }
  | {
      type: 'chat_message_received';
      friendshipId: string;
      recipientProfileId: string;
      bodyPreview: string;
      actionUrl: string;
    };

interface ActorProfile {
  id: string;
  auth0_id: string;
  username: string;
}

interface ProfileRow extends ActorProfile {
  email: string | null;
}

interface SuggestionRow {
  id: string;
  auth0_id: string;
  title: string;
  body: string;
  status: string;
}

interface FriendshipRow {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: 'pending' | 'accepted';
  requester: ProfileRow;
  recipient: ProfileRow;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SB_PUBLISHABLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') ?? '';
const ADMIN_NOTIFICATION_EMAILS = splitEmails(Deno.env.get('ADMIN_NOTIFICATION_EMAILS'));

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    ensureConfig();

    const authHeader = request.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Missing bearer token.' }, 401);
    }

    const token = authHeader.slice('Bearer '.length).trim();
    const claims = decodeJwtPayload(token);
    const actorAuth0Id = typeof claims.sub === 'string' ? claims.sub : '';
    if (!actorAuth0Id) {
      return json({ error: 'Invalid auth token.' }, 401);
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });

    const actor = await loadActorProfile(userClient, actorAuth0Id);
    if (!actor) {
      return json({ error: 'Authenticated profile not found.' }, 401);
    }

    const payload = await request.json() as NotificationEmailPayload;
    await routeNotification(payload, actor, claims);

    return json({ ok: true }, 200);
  } catch (error) {
    console.error('notification-email failed', error);
    const message = error instanceof Error ? error.message : 'Notification email failed.';
    return json({ error: message }, 500);
  }
});

async function routeNotification(payload: NotificationEmailPayload, actor: ActorProfile, claims: Record<string, unknown>) {
  switch (payload.type) {
    case 'suggestion_submitted':
      await sendSuggestionSubmittedEmail(payload, actor);
      return;

    case 'suggestion_status_changed':
      await sendSuggestionStatusChangedEmail(payload, actor, claims);
      return;

    case 'friend_request_sent':
      await sendFriendRequestEmail(payload, actor);
      return;

    case 'friend_request_accepted':
      await sendFriendAcceptedEmail(payload, actor);
      return;

    case 'chat_message_received':
      await sendChatMessageEmail(payload, actor);
      return;

    default:
      throw new Error('Unsupported notification type.');
  }
}

async function sendSuggestionSubmittedEmail(
  payload: Extract<NotificationEmailPayload, { type: 'suggestion_submitted' }>,
  actor: ActorProfile
) {
  if (ADMIN_NOTIFICATION_EMAILS.length === 0) {
    console.warn('Skipping suggestion email because ADMIN_NOTIFICATION_EMAILS is empty.');
    return;
  }

  const suggestion = await loadSuggestion(payload.suggestionId);
  if (!suggestion || suggestion.auth0_id !== actor.auth0_id) {
    throw new Error('Suggestion email request is not authorized.');
  }

  await sendEmail({
    to: ADMIN_NOTIFICATION_EMAILS,
    subject: `New site suggestion: ${suggestion.title}`,
    html: buildEmailLayout({
      eyebrow: 'Suggestion Inbox',
      title: 'A new site improvement suggestion just arrived',
      intro: `${actor.username} sent feedback for the site.`,
      accent: '#d97706',
      accentSoft: '#fff7ed',
      badge: 'New suggestion',
      buttonLabel: 'Open suggestions',
      actionUrl: payload.actionUrl,
      sections: [
        renderDetailList([
          ['From', actor.username],
          ['Title', suggestion.title]
        ]),
        renderBodyCard('Suggestion details', suggestion.body)
      ]
    }),
    text: `${actor.username} submitted a new site suggestion.\n\n${suggestion.title}\n\n${suggestion.body}\n\nOpen notifications: ${payload.actionUrl}`
  });
}

async function sendSuggestionStatusChangedEmail(
  payload: Extract<NotificationEmailPayload, { type: 'suggestion_status_changed' }>,
  actor: ActorProfile,
  claims: Record<string, unknown>
) {
  if (!extractRoles(claims).includes('admin')) {
    throw new Error('Only admins can send suggestion review emails.');
  }

  const suggestion = await loadSuggestion(payload.suggestionId);
  if (!suggestion) {
    throw new Error('Suggestion not found.');
  }

  const recipient = await loadProfileByAuth0Id(suggestion.auth0_id);
  if (!recipient?.email) {
    console.warn('Skipping suggestion status email because recipient email is missing.');
    return;
  }

  await sendEmail({
    to: [recipient.email],
    subject: `Suggestion update: ${suggestion.title}`,
    html: buildEmailLayout({
      eyebrow: 'Suggestion Update',
      title: `Your suggestion is now ${suggestion.status}`,
      intro: `${actor.username} reviewed your feedback.`,
      accent: suggestionStatusAccent(suggestion.status),
      accentSoft: '#f8fafc',
      badge: `Status: ${suggestion.status}`,
      buttonLabel: 'View update',
      actionUrl: payload.actionUrl,
      sections: [
        renderDetailList([
          ['Title', suggestion.title],
          ['Updated by', actor.username]
        ])
      ]
    }),
    text: `Your suggestion "${suggestion.title}" is now ${suggestion.status}.\nReviewed by ${actor.username}.\n\nOpen notifications: ${payload.actionUrl}`
  });
}

async function sendFriendRequestEmail(
  payload: Extract<NotificationEmailPayload, { type: 'friend_request_sent' }>,
  actor: ActorProfile
) {
  const friendship = await loadFriendship(payload.friendshipId);
  if (!friendship || friendship.requester_id !== actor.id) {
    throw new Error('Friend request email is not authorized.');
  }

  if (!friendship.recipient.email) {
    console.warn('Skipping friend request email because recipient email is missing.');
    return;
  }

  await sendEmail({
    to: [friendship.recipient.email],
    subject: `${friendship.requester.username} sent you a friend request`,
    html: buildEmailLayout({
      eyebrow: 'Friend Request',
      title: `${friendship.requester.username} wants to connect`,
      intro: 'You have a new friend request waiting in My Collection.',
      accent: '#7c3aed',
      accentSoft: '#f5f3ff',
      badge: 'Pending request',
      buttonLabel: 'Review request',
      actionUrl: payload.actionUrl,
      sections: [
        renderDetailList([
          ['From', friendship.requester.username],
          ['To', friendship.recipient.username]
        ])
      ]
    }),
    text: `${friendship.requester.username} sent you a friend request.\n\nOpen friend requests: ${payload.actionUrl}`
  });
}

async function sendFriendAcceptedEmail(
  payload: Extract<NotificationEmailPayload, { type: 'friend_request_accepted' }>,
  actor: ActorProfile
) {
  const friendship = await loadFriendship(payload.friendshipId);
  if (!friendship || friendship.recipient_id !== actor.id || friendship.status !== 'accepted') {
    throw new Error('Friend acceptance email is not authorized.');
  }

  if (!friendship.requester.email) {
    console.warn('Skipping friend accepted email because requester email is missing.');
    return;
  }

  await sendEmail({
    to: [friendship.requester.email],
    subject: `${friendship.recipient.username} accepted your friend request`,
    html: buildEmailLayout({
      eyebrow: 'Friend Request Accepted',
      title: `${friendship.recipient.username} accepted your request`,
      intro: 'You can now view collections and chat with each other.',
      accent: '#059669',
      accentSoft: '#ecfdf5',
      badge: 'Now friends',
      buttonLabel: 'Open friends',
      actionUrl: payload.actionUrl,
      sections: [
        renderDetailList([
          ['Friend', friendship.recipient.username],
          ['Status', 'Accepted']
        ])
      ]
    }),
    text: `${friendship.recipient.username} accepted your friend request.\n\nOpen friends: ${payload.actionUrl}`
  });
}

async function sendChatMessageEmail(
  payload: Extract<NotificationEmailPayload, { type: 'chat_message_received' }>,
  actor: ActorProfile
) {
  const friendship = await loadFriendship(payload.friendshipId);
  if (!friendship || friendship.status !== 'accepted') {
    throw new Error('Chat email friendship not found.');
  }

  const isRequester = friendship.requester_id === actor.id;
  const isRecipient = friendship.recipient_id === actor.id;
  if (!isRequester && !isRecipient) {
    throw new Error('Chat email is not authorized.');
  }

  const target = friendship.requester_id === payload.recipientProfileId
    ? friendship.requester
    : friendship.recipient_id === payload.recipientProfileId
      ? friendship.recipient
      : null;

  if (!target || target.id === actor.id) {
    throw new Error('Chat email recipient is invalid.');
  }

  if (!target.email) {
    console.warn('Skipping chat email because recipient email is missing.');
    return;
  }

  await sendEmail({
    to: [target.email],
    subject: `New message from ${actor.username}`,
    html: buildEmailLayout({
      eyebrow: 'New Message',
      title: `${actor.username} sent you a chat message`,
      intro: 'Open the conversation to reply from inside the app.',
      accent: '#2563eb',
      accentSoft: '#eff6ff',
      badge: 'Unread message',
      buttonLabel: 'Open chat',
      actionUrl: payload.actionUrl,
      sections: [
        renderDetailList([
          ['From', actor.username]
        ]),
        renderMessagePreview(payload.bodyPreview)
      ]
    }),
    text: `${actor.username} sent you a new message.\n\n${payload.bodyPreview}\n\nOpen chat: ${payload.actionUrl}`
  });
}

async function loadActorProfile(userClient: ReturnType<typeof createClient>, auth0Id: string): Promise<ActorProfile | null> {
  const { data, error } = await userClient.from('profiles')
    .select('id, auth0_id, username')
    .eq('auth0_id', auth0Id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? 'Failed to validate the current user.');
  }

  return (data as ActorProfile | null) ?? null;
}

async function loadSuggestion(id: string): Promise<SuggestionRow | null> {
  const { data, error } = await getServiceClient().from('feature_suggestions')
    .select('id, auth0_id, title, body, status')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? 'Failed to load suggestion.');
  }

  return (data as SuggestionRow | null) ?? null;
}

async function loadFriendship(id: string): Promise<FriendshipRow | null> {
  const { data, error } = await getServiceClient().from('friendships')
    .select('id, requester_id, recipient_id, status, requester:profiles!requester_id(id, auth0_id, username, email), recipient:profiles!recipient_id(id, auth0_id, username, email)')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? 'Failed to load friendship.');
  }

  return (data as FriendshipRow | null) ?? null;
}

async function loadProfileByAuth0Id(auth0Id: string): Promise<ProfileRow | null> {
  const { data, error } = await getServiceClient().from('profiles')
    .select('id, auth0_id, username, email')
    .eq('auth0_id', auth0Id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message ?? 'Failed to load profile.');
  }

  return (data as ProfileRow | null) ?? null;
}

async function sendEmail(input: { to: string[]; subject: string; html: string; text: string }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Resend request failed (${response.status}): ${details}`);
  }
}

function extractRoles(claims: Record<string, unknown>): string[] {
  const namespaced = claims['https://mycollection.uk/roles'];
  if (Array.isArray(namespaced)) {
    return namespaced.filter((role): role is string => typeof role === 'string').map((role) => role.toLowerCase());
  }

  if (typeof namespaced === 'string') {
    return [namespaced.toLowerCase()];
  }

  return [];
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length < 2) {
    throw new Error('JWT payload is missing.');
  }

  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return JSON.parse(atob(padded)) as Record<string, unknown>;
}

function splitEmails(value: string | undefined): string[] {
  return (value ?? '')
    .split(/[;,]/)
    .map((email) => email.trim())
    .filter(Boolean);
}

function getServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

function ensureConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase environment variables are missing.');
  }

  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    throw new Error('Resend environment variables are missing.');
  }
}

function buildEmailLayout(input: {
  eyebrow: string;
  title: string;
  intro: string;
  accent: string;
  accentSoft: string;
  badge: string;
  buttonLabel: string;
  actionUrl: string;
  sections: string[];
}): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      ${escapeHtml(input.title)} - ${escapeHtml(input.eyebrow)}
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 18px 45px rgba(15,23,42,0.12);">
            <tr>
              <td style="padding:0;">
                <div style="padding:32px;background:linear-gradient(135deg, ${input.accentSoft} 0%, #ffffff 65%);border-bottom:1px solid #e5e7eb;">
                  <div style="display:inline-block;padding:6px 10px;border-radius:999px;background:${input.accent};color:#ffffff;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">
                    ${escapeHtml(input.badge)}
                  </div>
                  <div style="margin-top:18px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${input.accent};">
                    ${escapeHtml(input.eyebrow)}
                  </div>
                  <h1 style="margin:12px 0 12px;font-size:30px;line-height:1.15;color:#111827;">
                    ${escapeHtml(input.title)}
                  </h1>
                  <p style="margin:0;font-size:16px;line-height:1.6;color:#4b5563;">
                    ${escapeHtml(input.intro)}
                  </p>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 12px;">
                ${input.sections.join('')}
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 32px;">
                <a href="${escapeAttribute(input.actionUrl)}" style="display:inline-block;padding:14px 22px;border-radius:14px;background:${input.accent};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;">
                  ${escapeHtml(input.buttonLabel)}
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 32px;">
                <p style="margin:0;font-size:13px;line-height:1.6;color:#6b7280;">
                  If the button does not work, open this link:
                  <br />
                  <a href="${escapeAttribute(input.actionUrl)}" style="color:${input.accent};word-break:break-word;">${escapeHtml(input.actionUrl)}</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderDetailList(rows: Array<[string, string]>): string {
  const items = rows.map(([label, value]) => `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #e5e7eb;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;">
        ${escapeHtml(label)}
      </td>
      <td style="padding:10px 0 10px 16px;border-bottom:1px solid #e5e7eb;font-size:15px;color:#111827;">
        ${escapeHtml(value)}
      </td>
    </tr>
  `).join('');

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
      ${items}
    </table>
  `;
}

function renderBodyCard(title: string, body: string): string {
  return `
    <div style="margin:0 0 20px;padding:20px;border:1px solid #e5e7eb;border-radius:18px;background:#f9fafb;">
      <div style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">
        ${escapeHtml(title)}
      </div>
      <div style="font-size:15px;line-height:1.7;color:#111827;white-space:pre-wrap;">
        ${escapeHtml(body)}
      </div>
    </div>
  `;
}

function renderMessagePreview(body: string): string {
  return `
    <div style="margin:0 0 20px;padding:18px 20px;border-radius:18px;background:#eef2ff;border:1px solid #c7d2fe;">
      <div style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#4338ca;">
        Message preview
      </div>
      <div style="font-size:15px;line-height:1.7;color:#1f2937;white-space:pre-wrap;">
        ${escapeHtml(body)}
      </div>
    </div>
  `;
}

function suggestionStatusAccent(status: string): string {
  switch (status) {
    case 'done':
      return '#059669';
    case 'planned':
      return '#2563eb';
    case 'reviewing':
      return '#7c3aed';
    case 'dismissed':
      return '#6b7280';
    case 'new':
    default:
      return '#d97706';
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}
