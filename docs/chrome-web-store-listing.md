# Chrome Web Store Listing Copy

Use this text when creating/updating the store listing.

## Name
Gem LinkedIn Shortcuts

## Short description
Run Gem and Ashby recruiting actions directly from LinkedIn profiles.

## Detailed description
Gem LinkedIn Shortcuts helps recruiting teams move faster from LinkedIn profiles.

From a LinkedIn profile, team members can use keyboard shortcuts or popup actions to:
- Add candidate/prospect records to Gem
- Add candidates to Gem projects
- Open candidate profiles in Gem or Ashby
- Upload candidates to Ashby for selected jobs
- Add notes, reminders, and manage candidate emails
- Open or edit sequences in Gem

How it works:
- The extension runs on LinkedIn and Gem pages.
- Requests go to your organization's hosted backend service.
- Backend routes are allowlisted for specific recruiting actions.
- Gem/Ashby API keys stay on the backend, not in the browser.

This extension is intended for internal recruiting workflows.

## Single purpose statement
Enable internal recruiting teams to execute Gem and Ashby candidate workflows from LinkedIn profiles with keyboard shortcuts.

## Permission justifications
- storage: Saves per-user extension settings and shortcut preferences.
- tabs: Opens Gem/Ashby profile tabs and communicates with active LinkedIn/Gem tabs.
- Host permissions (linkedin.com, gem.com, app.gem.com): Runs content scripts where recruiting actions are initiated.
- Host permissions (organization backend domain): Sends action requests to the hosted backend API.
