# Channel Self-Assignment Rejected Email

**Event:** `device:channel_self_set_rejected`

## Template Variables

| Variable | Description |
|----------|-------------|
| `{{ channel_name }}` | Name of the channel that rejected the device |
| `{{ app_id }}` | The application ID |

---

## Email Example

**From:** Capgo <notifications@capgo.app>
**To:** user@example.com
**Subject:** Device blocked from channel self-assignment in com.example.myapp

---

Hi there,

We noticed that a device in your app **com.example.myapp** tried to switch to a channel that doesn't allow self-assignment.

| | |
|---|---|
| **App** | com.example.myapp |
| **Channel** | beta-testers |

### Why did this happen?

The channel **beta-testers** has "Allow device self-set" disabled. This means devices cannot manually switch to this channel - they can only be assigned by an admin.

### What can you do?

If you want devices to be able to self-assign to this channel:

1. Go to your [Capgo Dashboard](https://web.capgo.app)
2. Navigate to **Channels** → **beta-testers**
3. Enable **"Allow device self-set"**

If this is intentional (e.g., for controlled beta access), no action is needed.

---

*You'll receive at most one of these notifications per app per week.*

---

**Capgo** - Live updates for Capacitor apps
[Dashboard](https://web.capgo.app) · [Documentation](https://capgo.app/docs) · [Support](mailto:support@capgo.app)
