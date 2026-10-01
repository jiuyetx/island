# Indoor door closing — local verification

The scene door now toggles open/closed indoors. Exiting is an explicit action
via the exit button or outside ground, rather than an accidental second door
click. Arrival indoors shows compact hut controls; saved indoor sessions show
them again on reload. The generic HUD tap dispatcher preserves controls after
opening or closing instead of hiding the newly drawn panel.

Verified through the actual local browser: close via HUD while remaining inside,
reload closed/inside, open via HUD, close via the scene door, open via scene door,
exit via the separate exit button, re-enter, and close again. The final page
shows the closed physical door, retained hut panel, and storm shelter status.
This also worked with zero stamina, hydration, and satiety.

`npm test`, Web/WeChat builds, and `git diff --check` passed. No captured browser
warnings/errors. No deployment, push, save reset, or external account changes.
Real-device mobile interaction was not tested.
