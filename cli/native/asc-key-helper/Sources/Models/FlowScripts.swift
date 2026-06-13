import Foundation

/// JavaScript run inside the App Store Connect page for detection,
/// highlighting and value scraping.
/// XPath detectors and styling approach adapted from AppStoreConnectKit
/// (https://github.com/MortenGregersen/AppStoreConnectKit),
/// MIT License, © Morten Bjerg Gregersen. See THIRD-PARTY-LICENSES.md.
enum FlowScripts {
    // MARK: - Shared snippets

    /// Wait (bounded) for the page's loading spinners to disappear.
    static let awaitNoProgressBar = """
    const __settleStart = performance.now();
    while (document.querySelectorAll('[role="progressbar"]').length > 0 && performance.now() - __settleStart < 8000) {
        await new Promise(r => setTimeout(r, 200));
    }
    """

    static let findTeamIssuerId = """
    const issuerId = document.evaluate(
        './/span[normalize-space()="Issuer ID"]/following::span[@role="presentation"][1]',
        document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue;
    """

    static let findGenerateButton = """
    const generateButton = document.evaluate(
        './/h3[starts-with(normalize-space(), "Active")]/following-sibling::button[1]',
        document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue;
    """

    /// Find the VISIBLE "+" generate button on the "Active (N)" heading's row.
    /// Per the live DOM (Safari inspect): the row has the real "+" (a button whose
    /// BOX is tiny — e.g. 5×13 — but whose SVG icon overflows it as the visible
    /// ~24px circle), a HIDDEN duplicate "+" (visibility:hidden, further right),
    /// and a text-only "Edit" button (no SVG). So: among VISIBLE svg buttons on the
    /// heading's row, pick the leftmost, and target its SVG (the on-screen circle)
    /// rather than the tiny button box. Sets `generatePlus`.
    static let findGeneratePlusButton = """
    const __h3 = document.evaluate('.//h3[starts-with(normalize-space(), "Active")]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    let generatePlus = null;
    if (__h3) {
        const hr = __h3.getBoundingClientRect();
        const shown = (b) => { const s = getComputedStyle(b); return s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity || '1') > 0.01; };
        const btn = [...document.querySelectorAll('button')].filter(b => {
            if (!b.querySelector('svg') || !shown(b)) return false;
            const r = b.getBoundingClientRect();
            return Math.abs((r.top + r.height / 2) - (hr.top + hr.height / 2)) < 30 && r.left >= hr.left;
        }).sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)[0] || null;
        if (btn) {
            const svg = btn.querySelector('svg');
            const area = (el) => { const r = el.getBoundingClientRect(); return r.width * r.height; };
            generatePlus = (svg && area(svg) > area(btn)) ? svg : btn;
        }
    }
    """

    static let findNewKeyRow = """
    const downloadButton = document.evaluate(
        './/button[normalize-space()="Download"]',
        document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue;
    const keyIdElement = document.evaluate(
        './/button[normalize-space()="Download"]/ancestor::*[@role="row"]//p',
        document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
    ).singleNodeValue;
    """

    // MARK: - Read scripts (return values to Swift)

    static let readIssuerId = """
    \(awaitNoProgressBar)
    \(findTeamIssuerId)
    return issuerId ? issuerId.textContent.trim() : null;
    """

    static let readNewKeyId = """
    \(awaitNoProgressBar)
    \(findNewKeyRow)
    return keyIdElement ? keyIdElement.textContent.trim() : null;
    """

    static let hasGenerateButton = """
    \(awaitNoProgressBar)
    \(findGenerateButton)
    return !!generateButton;
    """

    static let hasDownloadButton = """
    \(awaitNoProgressBar)
    \(findNewKeyRow)
    return !!downloadButton;
    """

    /// List the people who can act on an access request: the Account Holder
    /// (can enable + create) and Admins (can create). Returns JSON
    /// [{name, email, isAccountHolder, isAdmin}].
    static let readEligibleContacts = """
    const url = '/iris/v1/users?include=provider&limit=500&fields[users]=email,firstName,lastName,roles,username';
    const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!r.ok) { return '[]'; }
    const j = await r.json();
    const out = (j.data || []).map(u => {
        const a = u.attributes || {};
        const roles = a.roles || [];
        return {
            name: ((a.firstName || '') + ' ' + (a.lastName || '')).trim(),
            email: a.email || a.username || '',
            isAccountHolder: roles.indexOf('ACCOUNT_HOLDER') !== -1,
            isAdmin: roles.indexOf('ADMIN') !== -1
        };
    }).filter(u => u.email && (u.isAccountHolder || u.isAdmin));
    return JSON.stringify(out);
    """

    /// Authoritative team-enablement check: /iris/v1/apiAccesses holds the
    /// "Request Access" record. A non-empty data array means the Account
    /// Holder has enabled the App Store Connect API for this team. Returns
    /// "enabled" / "disabled" / "unknown" (on error). Works for any role.
    static let readApiAccessEnabled = """
    const r = await fetch('/iris/v1/apiAccesses', { headers: { 'Accept': 'application/json' } });
    if (!r.ok) { return 'unknown'; }
    const j = await r.json();
    return ((j.data || []).length > 0) ? 'enabled' : 'disabled';
    """

    /// Fetch the App Store Connect session (current team, available teams,
    /// signed-in user) via the same-origin endpoint the ASC web app itself
    /// uses. Returns the raw JSON text, or null when not signed in.
    static let readSession = """
    const response = await fetch('/olympus/v1/session', { headers: { 'Accept': 'application/json' } });
    if (!response.ok) { return null; }
    return await response.text();
    """

    /// Switch the active team (provider). Returns true on success.
    /// Mirrors fastlane Spaceship: the POST /olympus/v1/session needs the
    /// `csrf` and `csrf_ts` tokens echoed from a prior session response,
    /// otherwise Apple rejects it.
    /// Switch the active team by driving Apple's real account-menu switcher.
    /// The raw providerSwitchRequests API returns 201 but never commits — the
    /// commit is in-memory SPA orchestration we can't replay — so we click the
    /// menu the SPA renders (inside amp-nav's shadow root) and let Apple's own
    /// code do the switch + navigation. Matched by team name, not CSS classes.
    /// Returns a JSON diagnostics string.
    static func switchTeamViaMenuScript(teamName: String) -> String {
        // JSON-encode the team name so ANY character (quotes, backslashes,
        // newlines, control chars) is safely embedded as a JS string literal —
        // string concatenation could otherwise break the script or be injected.
        let jsTeamName: String = {
            guard let data = try? JSONSerialization.data(withJSONObject: [teamName]),
                  let json = String(data: data, encoding: .utf8) else { return "\"\"" }
            return String(json.dropFirst().dropLast()) // `["x"]` -> `"x"`
        }()
        return """
        const out = {};
        try {
            const nav = document.querySelector('amp-nav');
            if (!nav || !nav.shadowRoot) { out.error = 'no amp-nav shadowRoot'; return JSON.stringify(out); }
            const root = nav.shadowRoot;
            const sleep = ms => new Promise(r => setTimeout(r, ms));
            // Open the account menu (profile trigger is labelled "Account name menu").
            const trigger = [...root.querySelectorAll('*')].find(e =>
                (e.textContent || '').includes('Account name menu') && e.children.length <= 3);
            out.foundTrigger = !!trigger;
            if (trigger) (trigger.closest('button,[role=button],a') || trigger).click();
            // Wait for the team rows to render, then click the matching one.
            let target = null;
            for (let i = 0; i < 40; i++) {
                const lis = [...root.querySelectorAll('li')];
                target = lis.find(li => li.textContent.trim() === \(jsTeamName));
                if (target) break;
                await sleep(50);
            }
            out.foundTarget = !!target;
            if (!target) { out.error = 'team row not found in menu'; return JSON.stringify(out); }
            (target.querySelector('a,button,[role=button]') || target).click();
            out.clicked = true;
        } catch (e) {
            out.error = String(e);
        }
        return JSON.stringify(out);
        """
    }

    /// Best-effort scrape of the active team keys table.
    /// Returns a JSON string: [{"name": "...", "keyId": "..."}].
    static let readExistingKeys = #"""
    \#(awaitNoProgressBar)
    const rows = Array.from(document.querySelectorAll('[role="row"]'));
    const keys = [];
    const keyIdPattern = /^[A-Z0-9]{8,14}$/;
    for (const row of rows) {
        const cells = Array.from(row.querySelectorAll('[role="cell"], td, [role="gridcell"]'));
        const texts = cells.map(c => c.textContent.trim()).filter(t => t.length > 0);
        const keyId = texts.find(t => keyIdPattern.test(t));
        if (keyId) {
            keys.push({ name: texts[0] === keyId ? "(unnamed)" : texts[0], keyId: keyId });
        }
    }
    return JSON.stringify(keys);
    """#

    // MARK: - Generate API Key dialog

    /// The role a Capgo Builder key should have. Admin has full access.
    static let recommendedRole = "Admin"

    /// The dialog's key-name input (id="name", no type attribute) and role
    /// input (name="roles", placeholder="Select Roles" — NOT an aria-label).
    private static let findNameInput = """
    const nameInput = document.querySelector('#name, input[name="name"]');
    """

    static let isGenerateDialogOpen = """
    const generateBtn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Generate');
    const roleInput = document.querySelector('input[name="roles"]');
    return !!(generateBtn && roleInput);
    """

    static let readNameFilled = """
    \(findNameInput)
    return !!(nameInput && nameInput.value.trim().length > 0);
    """

    /// Generate is enabled only when both a name and a role are set. Since the
    /// name comes first, an enabled Generate means a role has been chosen.
    static let isGenerateEnabled = """
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Generate');
    return !!(btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true');
    """

    /// Read ONLY the selected role chips inside the Access field — explicitly
    /// excluding the dropdown's menuitem options (which appear/disappear and
    /// would otherwise make the step flip-flop between role and generate).
    static let readSelectedRoles = """
    const roleRe = /^(Admin|App Manager|Developer|Finance|Sales and Reports|Customer Support|Marketing)$/;
    const scope = document.querySelector('#roles');
    if (!scope) return '[]';
    const found = [...scope.querySelectorAll('*')].filter(e =>
        e.children.length === 0 &&
        roleRe.test(e.textContent.trim()) &&
        !e.closest('[role=menuitem]') && !e.closest('[role=listbox]') && !e.closest('[role=option]'));
    return JSON.stringify([...new Set(found.map(e => e.textContent.trim()))]);
    """

    static let autofillName = """
    \(findNameInput)
    if (!nameInput) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(nameInput, 'Capgo Builder');
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    nameInput.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
    """

    static func autofillRoleScript(role: String) -> String {
        let safe = role.replacingOccurrences(of: "'", with: "")
        return """
        const roleInput = document.querySelector('input[name="roles"]');
        if (!roleInput) return false;
        roleInput.click(); roleInput.focus();
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        for (let i = 0; i < 20; i++) {
            // Prefer the interactive button/menuitem; exclude the keys table.
            const opt = [...document.querySelectorAll('button, [role=menuitem]')]
                .find(e => e.textContent.trim() === '\(safe)' && !e.closest('table'));
            if (opt) { opt.click(); return true; }
            await sleep(50);
        }
        return false;
        """
    }

    // MARK: - Highlighting

    // We never style App Store Connect's own elements: mutating React-owned
    // nodes corrupts its reconciler and throws "removeChild must be an instance
    // of Node", which crashes the page (visible as the redux "mw dispatch"
    // error) and wipes our styling on the next re-render. Instead we float a
    // single overlay <div> of OUR OWN, appended to <body> (outside React's
    // root), and reposition it each frame from the target's bounding box.
    // React never reconciles it, can't wipe it, and we never touch a node it
    // owns — so it survives the dropdown's re-renders without crashing the page.

    /// Float a native overlay over each element returned by a `finder` (a JS
    /// body containing a `return`). One overlay <div> per target, all tracked
    /// by a single animation-frame loop so they follow their targets through
    /// React re-renders and scrolling. A target whose element isn't currently
    /// on screen simply hides its overlay (e.g. the Admin option before the
    /// dropdown is opened). `scroll` brings the FIRST target into view once.
    private static func overlayHighlight(_ targets: [(finder: String, pad: Int)], scroll: Bool = false) -> String {
        let specs = targets
            .map { "{ find: () => { \($0.finder) }, pad: \($0.pad) }" }
            .joined(separator: ", ")
        let scrollJS = scroll && !targets.isEmpty
            ? "const __p8s = (() => { \(targets[0].finder) })(); if (__p8s && __p8s.scrollIntoView) __p8s.scrollIntoView({ behavior: 'smooth', block: 'center' });"
            : ""
        return """
        window.__p8specs = [\(specs)];
        \(scrollJS)
        if (window.__p8raf) cancelAnimationFrame(window.__p8raf);
        const __p8style = 'position:fixed;border:5px solid #ff3b30;border-radius:14px;pointer-events:none;z-index:2147483647;box-shadow:0 0 0 6px rgba(255,59,48,0.35), 0 0 18px 4px rgba(255,59,48,0.45);display:none';
        const __p8tick = () => {
            window.__p8specs.forEach((spec, i) => {
                // A throwing finder must never kill the loop — a dead loop freezes
                // every overlay at its last viewport spot, which then visibly drifts
                // away from its target as the page scrolls.
                try {
                    let ov = document.getElementById('__p8overlay' + i);
                    if (!ov) {
                        ov = document.createElement('div');
                        ov.id = '__p8overlay' + i;
                        ov.className = '__p8ov';
                        ov.style.cssText = __p8style;
                        document.body.appendChild(ov);
                    }
                    const t = spec.find();
                    if (t && t.getClientRects().length) {
                        const r = t.getBoundingClientRect();
                        ov.style.display = 'block';
                        ov.style.left = (r.left - spec.pad) + 'px';
                        ov.style.top = (r.top - spec.pad) + 'px';
                        ov.style.width = (r.width + spec.pad * 2) + 'px';
                        ov.style.height = (r.height + spec.pad * 2) + 'px';
                    } else {
                        ov.style.display = 'none';
                    }
                } catch (e) { /* keep ticking — one bad finder must not freeze the rest */ }
            });
            window.__p8raf = requestAnimationFrame(__p8tick);
        };
        __p8tick();
        """
    }

    /// Single-target convenience.
    private static func overlayHighlight(finder: String, scroll: Bool = false, pad: Int = 10) -> String {
        overlayHighlight([(finder: finder, pad: pad)], scroll: scroll)
    }

    /// Attach the highlight DIRECTLY to the real target element — a ring drawn on
    /// the button itself, not a floating overlay. We only ever set INLINE STYLE on
    /// an existing node (box-shadow + outline; both paint outside the box, so no
    /// reflow) and never insert or remove child nodes — so React's reconciler is
    /// untouched. (The "removeChild must be an instance of Node" crash came from
    /// inserting nodes into a React-owned parent, not from styling an existing
    /// one.) Because the style lives ON the element, it tracks the element through
    /// scroll and layout natively — no rAF, no drift. A light interval re-applies
    /// in case a re-render clears it, and restores the element's style on teardown.
    /// Use ONLY for static targets (the "+" generate button); re-rendering
    /// dropdowns still use the overlay, which never touches their nodes.
    private static func attachHighlightDirect(finder: String, scroll: Bool = false) -> String {
        """
        if (window.__p8hlClear) window.__p8hlClear();
        (function () {
            const find = () => { \(finder) };
            // The "+" button's BOX is square (its round look is a fill/inner
            // element), so a ring traces a square unless we force a radius. Round
            // the element itself (border-radius:50%) and a thin box-shadow ring then
            // follows that circle: a 3px solid ring + a soft glow — clean, round, not
            // a filled blob. (Pure inline style on an existing node; no reflow, no
            // child mutation, so React's reconciler is untouched.)
            let el = null, scrolled = false;
            const paint = (n) => {
                const r = n.getBoundingClientRect();
                // Round it only when roughly square (a circular "+"); forcing 50% on
                // an oblong element makes a distorting ellipse/teardrop.
                if (r.width > 0 && Math.abs(r.width - r.height) <= Math.max(r.width, r.height) * 0.35)
                    n.style.setProperty('border-radius', '50%', 'important');
                // Tight ring that hugs the "+": a crisp 2px solid ring + a small
                // soft halo. NO big blur/spread — that ballooned into a ~80px blob.
                n.style.setProperty('box-shadow', '0 0 0 2px #ff3b30, 0 0 5px 1px rgba(255,59,48,0.55)', 'important');
            };
            const clear = (n) => {
                n.style.removeProperty('border-radius');
                n.style.removeProperty('box-shadow');
            };
            const tick = () => {
                let next = null;
                try { next = find(); } catch (e) {}
                if (next !== el) { if (el) clear(el); el = next; scrolled = false; }
                if (el) {
                    paint(el);
                    if (\(scroll ? "true" : "false") && !scrolled && el.scrollIntoView) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        scrolled = true;
                    }
                }
            };
            const id = setInterval(tick, 200);
            tick();
            window.__p8hlClear = () => { clearInterval(id); if (el) clear(el); window.__p8hlClear = null; };
        })();
        """
    }

    /// Tear down all overlays and the tracking loop.
    static let removeOverlay = """
    if (window.__p8raf) { cancelAnimationFrame(window.__p8raf); window.__p8raf = null; }
    document.querySelectorAll('.__p8ov').forEach(e => e.remove());
    window.__p8specs = [];
    """

    /// One-shot diagnostic for the "Open the Generate dialog" highlight, routed to
    /// the CLI support log. Reports what the generate-button finder matches (tag,
    /// text, aria, on-screen rect, visibility), nearby candidate "+"/Generate
    /// buttons with their positions, and whether <body>/<html> carry a CSS
    /// `transform` — a transform on an ancestor silently re-bases our `position:
    /// fixed` overlay, which makes it drift on scroll. Returns a JSON string.
    static let createKeyHighlightProbe = """
    const out = {};
    try {
        const rectStr = (el) => { const r = el.getBoundingClientRect(); return Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height); };
        const h3 = document.evaluate('.//h3[starts-with(normalize-space(), "Active")]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        out.hasActiveH3 = !!h3;
        \(findGeneratePlusButton)
        out.picked = generatePlus ? rectStr(generatePlus) : null;
        out.pickedHasSvg = generatePlus ? !!generatePlus.querySelector('svg') : false;
        out.pickedAria = generatePlus ? (generatePlus.getAttribute('aria-label') || '') : '';
        // Every button on the heading's row, for diagnosis if `picked` is wrong.
        if (h3) {
            const hr = h3.getBoundingClientRect();
            out.rowButtons = [...document.querySelectorAll('button')].filter(b => {
                const r = b.getBoundingClientRect();
                return Math.abs((r.top + r.height / 2) - (hr.top + hr.height / 2)) < 30 && r.left >= hr.left - 20;
            }).slice(0, 10).map(b => rectStr(b) + (b.querySelector('svg') ? ' svg' : '') + (b.getAttribute('aria-label') ? ' aria=' + b.getAttribute('aria-label') : ''));
        }
        out.bodyTransform = getComputedStyle(document.body).transform;
    } catch (e) { out.error = String(e); }
    return JSON.stringify(out);
    """

    static func highlightScript(for step: FlowStep) -> String? {
        switch step {
        case .createKey:
            // The "+" lives in the keys-table header row. A floating position:fixed
            // overlay DRIFTS to the top of the page when that row scrolls above the
            // viewport — its rect.top goes negative, so the fixed div gets pinned up
            // near "Users and Access". Attach the ring DIRECTLY to the element
            // instead: inline box-shadow on the existing node (no child mutation, so
            // React's reconciler is untouched) tracks the element through scroll
            // natively and vanishes with it — no drift. Targets the visible "+" SVG
            // via findGeneratePlusButton.
            """
            \(awaitNoProgressBar)
            \(attachHighlightDirect(finder: "\(findGeneratePlusButton) return generatePlus;", scroll: true))
            """
        case .nameKey:
            overlayHighlight(finder: "return document.querySelector('#name, input[name=\"name\"]');")
        case .selectRole:
            // Two overlays: the Access field, and the Admin option (which only
            // exists once the dropdown is open — its overlay stays hidden until
            // then). Read-only getBoundingClientRect; we never touch the nodes.
            overlayHighlight([
                (finder: "return document.querySelector('input[name=\"roles\"]');", pad: 10),
                (finder: "return [...document.querySelectorAll('[role=menuitem], [role=option], li')].find(e => (e.textContent || '').trim() === '\(recommendedRole)' && !e.closest('table'));", pad: 8),
            ])
        case .generateKey:
            overlayHighlight(finder: "return [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Generate');")
        case .downloadKey:
            // Prefer the modal's confirm "Download" button once the
            // "Download API Key" dialog is open (the real last click); fall back
            // to the row's Download button before the dialog appears. The modal
            // button lives outside the keys table/rows, so we match a "Download"
            // button that is NOT inside a [role=row] or <table>.
            """
            \(awaitNoProgressBar)
            \(overlayHighlight(finder: "var __m = [...document.querySelectorAll('button')].find(b => (b.textContent || '').trim() === 'Download' && !b.closest('[role=\"row\"]') && !b.closest('table')); if (__m) return __m; \(findNewKeyRow) return downloadButton;", scroll: true, pad: 12))
            """
        default:
            nil
        }
    }

    static func unhighlightScript(for step: FlowStep) -> String? {
        switch step {
        case .createKey:
            // createKey now uses the directly-attached ring; also remove any overlay
            // left over from an earlier build/run so nothing lingers.
            """
            if (window.__p8hlClear) window.__p8hlClear();
            \(removeOverlay)
            """
        case .nameKey, .selectRole, .generateKey, .downloadKey:
            removeOverlay
        default:
            nil
        }
    }
}
